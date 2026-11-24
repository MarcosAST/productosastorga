import React, { useMemo, useState } from 'react';
import { Wallet, Users, Lock, Edit3, Plus, CheckCircle2, Trash2, Edit2, X } from 'lucide-react';
import { BusinessDataset, FinanzaMensual, Sueldo } from '../types/business';
import {
  formatCurrency,
  formatDateShort,
  formatMonthLabel,
  getCurrentMonthISO,
  getNextMonthISO,
  getTodayISO,
} from '../utils/formatters';
import {
  computeIncomeSummaryForPeriod,
  getGeneralEgresos,
  getJornadaAssignedEgresos,
} from '../utils/incomeConsolidation';
import { PendingMutation } from '../components/ConfirmMutationModal';

interface FinanzasViewProps {
  dataset: BusinessDataset;
  sueldosTabName: string;
  finanzasTabName: string;
  onRequestMutation: (mutation: PendingMutation) => void;
  onSaveSueldo: (sueldo: Omit<Sueldo, 'id'>) => Promise<void>;
  onUpdateSueldo: (sueldo: Sueldo) => Promise<void>;
  onDeleteSueldo: (sueldo: Sueldo) => Promise<void>;
  onUpsertFinanza: (record: FinanzaMensual) => Promise<void>;
  onCloseMonth: (
    closedRecord: FinanzaMensual,
    nextMonthRecord: FinanzaMensual
  ) => Promise<void>;
}

export const FinanzasView: React.FC<FinanzasViewProps> = ({
  dataset,
  sueldosTabName,
  finanzasTabName,
  onRequestMutation,
  onSaveSueldo,
  onUpdateSueldo,
  onDeleteSueldo,
  onUpsertFinanza,
  onCloseMonth,
}) => {
  const [selectedMes, setSelectedMes] = useState(getCurrentMonthISO());

  // Sueldo form
  const [fechaSueldo, setFechaSueldo] = useState(getTodayISO());
  const [trabajador, setTrabajador] = useState('');
  const [conceptoSueldo, setConceptoSueldo] = useState('Sueldo semanal');
  const [montoSueldo, setMontoSueldo] = useState('');
  const [notasSueldo, setNotasSueldo] = useState('');

  // Edit Sueldo modal state
  const [editingSueldo, setEditingSueldo] = useState<Sueldo | null>(null);
  const [editFechaSueldo, setEditFechaSueldo] = useState('');
  const [editTrabajador, setEditTrabajador] = useState('');
  const [editConceptoSueldo, setEditConceptoSueldo] = useState('');
  const [editMontoSueldo, setEditMontoSueldo] = useState('');
  const [editNotasSueldo, setEditNotasSueldo] = useState('');

  // Edit Fondo Base inline
  const [editingFondo, setEditingFondo] = useState(false);
  const [fondoBaseInput, setFondoBaseInput] = useState('');

  const openEditSueldo = (su: Sueldo) => {
    setEditingSueldo(su);
    setEditFechaSueldo(su.fecha);
    setEditTrabajador(su.trabajador);
    setEditConceptoSueldo(su.concepto || 'Sueldo');
    setEditMontoSueldo(String(su.monto));
    setEditNotasSueldo(su.notas || '');
  };

  const handleSaveEditSueldo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSueldo) return;
    const montoNum = parseFloat(editMontoSueldo);
    if (!editTrabajador.trim() || !montoNum || montoNum <= 0) return;

    const updated: Sueldo = {
      ...editingSueldo,
      fecha: editFechaSueldo,
      trabajador: editTrabajador.trim(),
      concepto: editConceptoSueldo.trim() || 'Sueldo',
      monto: montoNum,
      notas: editNotasSueldo.trim(),
    };

    onRequestMutation({
      title: 'Actualizar pago de sueldo',
      description: `Se actualizará el registro de sueldo en "${sueldosTabName}".`,
      sheetTab: sueldosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(updated.fecha) },
        { label: 'Trabajador', value: updated.trabajador },
        { label: 'Concepto', value: updated.concepto },
        { label: 'Monto', value: formatCurrency(updated.monto) },
      ],
      confirmLabel: 'Guardar cambios',
      onConfirm: async () => {
        await onUpdateSueldo(updated);
        setEditingSueldo(null);
      },
    });
  };

  const storedMonthRecord = useMemo(
    () => dataset.finanzasMensuales.find((f) => f.mes === selectedMes),
    [dataset.finanzasMensuales, selectedMes]
  );

  const incomeSummaryMes = useMemo(
    () => computeIncomeSummaryForPeriod(dataset, selectedMes),
    [dataset, selectedMes]
  );

  const ingresosMes = incomeSummaryMes.totalIngresos;

  const egresosMes = useMemo(
    () => getGeneralEgresos(dataset, selectedMes).reduce((s, e) => s + e.monto, 0),
    [dataset, selectedMes]
  );

  const gastosEnJornadasMes = useMemo(
    () => getJornadaAssignedEgresos(dataset, selectedMes).reduce((s, e) => s + e.monto, 0),
    [dataset, selectedMes]
  );

  const sueldosMesList = useMemo(
    () =>
      dataset.sueldos
        .filter((s) => s.fecha.startsWith(selectedMes))
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [dataset.sueldos, selectedMes]
  );

  const sueldosMes = useMemo(
    () => sueldosMesList.reduce((s, su) => s + su.monto, 0),
    [sueldosMesList]
  );

  const fondoBase = storedMonthRecord?.fondoBase ?? 0;
  const utilidadPreliminar = ingresosMes - egresosMes;
  const utilidadNeta = utilidadPreliminar - sueldosMes;
  const fondoTotal = utilidadNeta + fondoBase;
  const isClosed = storedMonthRecord?.cerrado ?? false;
  const nextMonth = getNextMonthISO(selectedMes);

  const openFondoBaseEditor = () => {
    setFondoBaseInput(String(fondoBase));
    setEditingFondo(true);
  };

  const handleSaveFondoBase = (e: React.FormEvent) => {
    e.preventDefault();
    const newBase = parseFloat(fondoBaseInput);
    if (Number.isNaN(newBase)) return;

    const updatedTotal = utilidadNeta + newBase;
    onRequestMutation({
      title: 'Establecer fondo base del mes',
      description: `Se guardará el Fondo Base de ${formatMonthLabel(selectedMes)} en Google Sheets.`,
      sheetTab: finanzasTabName,
      details: [
        { label: 'Mes', value: formatMonthLabel(selectedMes) },
        { label: 'Fondo Base establecido', value: formatCurrency(newBase) },
        { label: 'Nuevo Fondo Total', value: formatCurrency(updatedTotal) },
      ],
      confirmLabel: 'Guardar fondo base',
      onConfirm: async () => {
        await onUpsertFinanza({
          mes: selectedMes,
          fondoBase: newBase,
          ingresos: ingresosMes,
          egresos: egresosMes,
          utilidadPreliminar,
          sueldos: sueldosMes,
          utilidadNeta,
          fondoTotal: updatedTotal,
          cerrado: isClosed,
          fechaCierre: storedMonthRecord?.fechaCierre || '',
        });
        setEditingFondo(false);
      },
    });
  };

  const handleCloseMonth = () => {
    const existingNext = dataset.finanzasMensuales.find((f) => f.mes === nextMonth);
    const closedRecord: FinanzaMensual = {
      mes: selectedMes,
      fondoBase,
      ingresos: ingresosMes,
      egresos: egresosMes,
      utilidadPreliminar,
      sueldos: sueldosMes,
      utilidadNeta,
      fondoTotal,
      cerrado: true,
      fechaCierre: getTodayISO(),
    };

    const nextMonthIngresos = computeIncomeSummaryForPeriod(dataset, nextMonth).totalIngresos;
    const nextMonthEgresos = getGeneralEgresos(dataset, nextMonth).reduce(
      (s, e) => s + e.monto,
      0
    );
    const nextMonthSueldos = dataset.sueldos
      .filter((s) => s.fecha.startsWith(nextMonth))
      .reduce((s, su) => s + su.monto, 0);
    const nextPrelim = nextMonthIngresos - nextMonthEgresos;
    const nextNeta = nextPrelim - nextMonthSueldos;

    const nextMonthRecord: FinanzaMensual = {
      mes: nextMonth,
      fondoBase: fondoTotal,
      ingresos: nextMonthIngresos,
      egresos: nextMonthEgresos,
      utilidadPreliminar: nextPrelim,
      sueldos: nextMonthSueldos,
      utilidadNeta: nextNeta,
      fondoTotal: nextNeta + fondoTotal,
      cerrado: existingNext?.cerrado ?? false,
      fechaCierre: existingNext?.fechaCierre || '',
    };

    onRequestMutation({
      title: `Cerrar ${formatMonthLabel(selectedMes)}`,
      description: `Al confirmar el cierre de mes, el Fondo Total (${formatCurrency(
        fondoTotal
      )}) se establecerá automáticamente como el Fondo Base de ${formatMonthLabel(nextMonth)}.`,
      sheetTab: finanzasTabName,
      details: [
        { label: 'Mes a cerrar', value: formatMonthLabel(selectedMes) },
        { label: 'Utilidad Neta', value: formatCurrency(utilidadNeta) },
        { label: 'Fondo Total al cierre', value: formatCurrency(fondoTotal) },
        { label: `Fondo Base ${formatMonthLabel(nextMonth)}`, value: formatCurrency(fondoTotal) },
      ],
      confirmLabel: 'Confirmar cierre de mes',
      onConfirm: async () => {
        await onCloseMonth(closedRecord, nextMonthRecord);
      },
    });
  };

  const handleAddSueldo = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = parseFloat(montoSueldo);
    if (!trabajador.trim() || !montoNum || montoNum <= 0) return;

    onRequestMutation({
      title: 'Registrar pago de sueldo',
      description: 'Se guardará este sueldo en la hoja independiente de Sueldos en Google Sheets.',
      sheetTab: sueldosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(fechaSueldo) },
        { label: 'Trabajador', value: trabajador.trim() },
        { label: 'Concepto', value: conceptoSueldo.trim() || 'Sueldo' },
        { label: 'Monto', value: formatCurrency(montoNum) },
      ],
      confirmLabel: 'Guardar sueldo',
      onConfirm: async () => {
        await onSaveSueldo({
          fecha: fechaSueldo,
          trabajador: trabajador.trim(),
          concepto: conceptoSueldo.trim() || 'Sueldo',
          monto: montoNum,
          notas: notasSueldo.trim(),
        });
        setTrabajador('');
        setMontoSueldo('');
        setNotasSueldo('');
      },
    });
  };

  const confirmDeleteSueldo = (su: Sueldo) => {
    onRequestMutation({
      title: 'Eliminar pago de sueldo',
      description:
        'Se eliminará este registro de sueldo permanentemente de Google Sheets.',
      sheetTab: sueldosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(su.fecha) },
        { label: 'Trabajador', value: su.trabajador },
        { label: 'Concepto', value: su.concepto },
        { label: 'Monto', value: formatCurrency(su.monto) },
      ],
      confirmLabel: 'Eliminar sueldo',
      onConfirm: async () => {
        await onDeleteSueldo(su);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F1A17]">
            Finanzas: utilidad, sueldos y fondo base
          </h1>
          <p className="text-sm text-[#6E6259]">
            Cálculo automático mensual, fondo base editable y registro independiente de sueldos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#6E6259]">Mes:</label>
          <input
            type="month"
            value={selectedMes}
            onChange={(e) => setSelectedMes(e.target.value)}
            className="h-11 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-sm font-semibold text-[#1F1A17]"
          />
        </div>
      </div>

      {/* Automated Financial Cascade Card */}
      <section className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EFECE6] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wallet className="w-5 h-5 text-[var(--theme-primary)]" />
            <div>
              <h2 className="text-base font-bold text-[#1F1A17]">
                Resumen financiero · {formatMonthLabel(selectedMes)}
              </h2>
              <p className="text-xs text-[#6E6259]">
                {isClosed
                  ? `Mes cerrado el ${formatDateShort(storedMonthRecord?.fechaCierre || '')}`
                  : 'Cálculo automático en vivo con los movimientos del mes'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openFondoBaseEditor}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--theme-primary)]/35 bg-[var(--theme-tint)] px-4 py-2 text-xs font-bold text-[var(--theme-primary)] hover:opacity-90 transition-opacity"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Establecer fondo base</span>
            </button>
            <button
              type="button"
              onClick={handleCloseMonth}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
            >
              {isClosed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{isClosed ? 'Recalcular cierre' : 'Cerrar mes'}</span>
            </button>
          </div>
        </div>

        {editingFondo && (
          <form
            onSubmit={handleSaveFondoBase}
            className="px-6 py-4 bg-[var(--theme-tint)] border-b border-[#EFECE6] flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="block text-xs font-bold text-[#1F1A17] mb-1">
                Establecer Fondo Base para {formatMonthLabel(selectedMes)} ($)
              </label>
              <input
                type="number"
                step="0.01"
                required
                autoFocus
                value={fondoBaseInput}
                onChange={(e) => setFondoBaseInput(e.target.value)}
                placeholder="Ej. 5000.00"
                className="h-11 w-56 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-sm font-mono font-bold text-[#1F1A17]"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-[var(--theme-accent)] text-xs font-bold text-white hover:opacity-90"
            >
              Guardar fondo base
            </button>
            <button
              type="button"
              onClick={() => setEditingFondo(false)}
              className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-[#6E6259]"
            >
              Cancelar
            </button>
          </form>
        )}

        {/* Formula rows */}
        <div className="divide-y divide-[#EFECE6] text-sm">
          <div className="px-6 py-3.5 flex items-center justify-between gap-3">
            <div>
              <span className="text-[#49403A]">1. Ingresos consolidados del mes</span>
              <p className="text-xs text-[#8C7E73] tabular-nums mt-0.5">
                Jornadas ({incomeSummaryMes.countJornadas}): {formatCurrency(incomeSummaryMes.ingresosJornadas)} ·
                Directos ({incomeSummaryMes.countTicketsDirectos}): {formatCurrency(incomeSummaryMes.ingresosTicketsDirectos)} ·
                Otros ({incomeSummaryMes.countOtros}): {formatCurrency(incomeSummaryMes.ingresosOtros)}
              </p>
            </div>
            <span className="font-bold text-[#1F1A17] tabular-nums shrink-0">
              {formatCurrency(ingresosMes)}
            </span>
          </div>
          <div className="px-6 py-3.5 flex items-center justify-between gap-3">
            <div>
              <span className="text-[#49403A]">2. Menos: Egresos y gastos operativos</span>
              {gastosEnJornadasMes > 0 && (
                <p className="text-xs text-[#8C7E73] tabular-nums mt-0.5">
                  Gastos generales · Adicionalmente {formatCurrency(gastosEnJornadasMes)} ya descontados dentro de Jornadas
                </p>
              )}
            </div>
            <span className="font-bold text-[#B91C1C] tabular-nums shrink-0">
              -{formatCurrency(egresosMes)}
            </span>
          </div>
          <div className="px-6 py-3.5 flex items-center justify-between bg-[#FAF8F5]">
            <span className="font-bold text-[#1F1A17]">
              = Utilidad preliminar (Ingresos − Egresos)
            </span>
            <span className="font-bold text-[#1F1A17] tabular-nums">
              {formatCurrency(utilidadPreliminar)}
            </span>
          </div>
          <div className="px-6 py-3.5 flex items-center justify-between">
            <span className="text-[#49403A]">3. Menos: Sueldos del mes</span>
            <span className="font-bold text-[#B91C1C] tabular-nums">
              -{formatCurrency(sueldosMes)}
            </span>
          </div>
          <div className="px-6 py-3.5 flex items-center justify-between bg-[#FAF8F5]">
            <span className="font-bold text-[#1F1A17]">
              = Utilidad neta (Utilidad preliminar − Sueldos)
            </span>
            <span
              className={`text-base font-bold tabular-nums ${
                utilidadNeta >= 0 ? 'text-emerald-700' : 'text-[#B91C1C]'
              }`}
            >
              {formatCurrency(utilidadNeta)}
            </span>
          </div>
          <div className="px-6 py-3.5 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#49403A]">4. Más: Fondo base del mes</span>
              <button
                type="button"
                onClick={openFondoBaseEditor}
                className="text-xs font-bold text-[var(--theme-accent)] hover:underline"
              >
                ({fondoBase === 0 ? 'Establecer monto' : 'Cambiar'})
              </button>
            </div>
            <span className="font-bold text-[#1F1A17] tabular-nums">
              +{formatCurrency(fondoBase)}
            </span>
          </div>
          <div className="px-6 py-4 flex items-center justify-between bg-[var(--theme-primary)] text-white">
            <div>
              <span className="text-base font-bold">
                = Nuevo Fondo Total (Utilidad neta + Fondo base)
              </span>
              <p className="text-xs text-white/75 mt-0.5">
                Al cerrar el mes, este monto pasará como Fondo Base de {formatMonthLabel(nextMonth)}.
              </p>
            </div>
            <span className="text-2xl font-bold tabular-nums">
              {formatCurrency(fondoTotal)}
            </span>
          </div>
        </div>
      </section>

      {/* Independent Sueldos Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleAddSueldo}
          className="lg:col-span-5 rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--theme-primary)]" />
            <h2 className="text-base font-bold text-[#1F1A17]">
              Registrar sueldo (Hoja independiente)
            </h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6E6259] mb-1">
              Trabajador *
            </label>
            <input
              type="text"
              required
              value={trabajador}
              onChange={(e) => setTrabajador(e.target.value)}
              placeholder="Nombre del empleado o repartidor"
              className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Fecha de pago *
              </label>
              <input
                type="date"
                required
                value={fechaSueldo}
                onChange={(e) => setFechaSueldo(e.target.value)}
                className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Monto ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={montoSueldo}
                onChange={(e) => setMontoSueldo(e.target.value)}
                placeholder="0.00"
                className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm font-mono text-[#1F1A17]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6E6259] mb-1">
              Concepto / Periodo
            </label>
            <input
              type="text"
              value={conceptoSueldo}
              onChange={(e) => setConceptoSueldo(e.target.value)}
              placeholder="Sueldo semanal / Comisión ruta"
              className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6E6259] mb-1">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={notasSueldo}
              onChange={(e) => setNotasSueldo(e.target.value)}
              className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] text-white text-sm font-bold hover:bg-[var(--theme-primary-hover)]"
          >
            <Plus className="w-4 h-4" />
            <span>Guardar sueldo en Google Sheets</span>
          </button>
        </form>

        <section className="lg:col-span-7 rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFECE6] flex items-center justify-between">
            <h3 className="text-base font-bold text-[#1F1A17]">
              Sueldos de {formatMonthLabel(selectedMes)} ({sueldosMesList.length})
            </h3>
            <span className="text-sm font-bold text-[#B91C1C] tabular-nums">
              {formatCurrency(sueldosMes)}
            </span>
          </div>

          {sueldosMesList.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#6E6259]">
              No hay sueldos registrados en este mes.
            </div>
          ) : (
            <div className="divide-y divide-[#EFECE6]">
              {sueldosMesList.map((su) => (
                <div
                  key={su.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1F1A17] truncate">
                      {su.trabajador}
                    </p>
                    <p className="text-xs text-[#6E6259] mt-0.5">
                      {formatDateShort(su.fecha)} · {su.concepto}
                      {su.notas ? ` · ${su.notas}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm font-bold text-[#B91C1C] tabular-nums mr-1">
                      -{formatCurrency(su.monto)}
                    </span>
                    {su.rowNumber && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditSueldo(su)}
                          title={`Editar sueldo de ${su.trabajador}`}
                          aria-label={`Editar sueldo de ${su.trabajador}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#6E6259] hover:text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDeleteSueldo(su)}
                          title={`Eliminar sueldo de ${su.trabajador}`}
                          aria-label={`Eliminar sueldo de ${su.trabajador}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal: Edit Sueldo */}
      {editingSueldo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveEditSueldo}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <h3 className="text-lg font-bold text-[#1F1A17]">Editar pago de sueldo</h3>
              <button
                type="button"
                onClick={() => setEditingSueldo(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Trabajador *</label>
                <input
                  type="text"
                  required
                  value={editTrabajador}
                  onChange={(e) => setEditTrabajador(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={editFechaSueldo}
                    onChange={(e) => setEditFechaSueldo(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">Monto ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editMontoSueldo}
                    onChange={(e) => setEditMontoSueldo(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm font-mono text-[#1F1A17]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Concepto</label>
                <input
                  type="text"
                  value={editConceptoSueldo}
                  onChange={(e) => setEditConceptoSueldo(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Notas</label>
                <input
                  type="text"
                  value={editNotasSueldo}
                  onChange={(e) => setEditNotasSueldo(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSueldo(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-xs font-semibold text-[#49403A]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-[var(--theme-primary)] text-xs font-bold text-white"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
