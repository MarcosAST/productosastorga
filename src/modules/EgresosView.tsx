import React, { useMemo, useState } from 'react';
import { Receipt, Bookmark, Plus, Trash2, X, Edit2 } from 'lucide-react';
import { BusinessDataset, ConceptoGasto, Egreso } from '../types/business';
import {
  formatCurrency,
  formatDateShort,
  getCurrentMonthISO,
  getTodayISO,
} from '../utils/formatters';
import { PendingMutation } from '../components/ConfirmMutationModal';

interface EgresosViewProps {
  dataset: BusinessDataset;
  egresosTabName: string;
  conceptosTabName: string;
  onRequestMutation: (mutation: PendingMutation) => void;
  onSaveEgreso: (
    egreso: Omit<Egreso, 'id'>,
    saveConcept?: Omit<ConceptoGasto, 'id'>
  ) => Promise<void>;
  onUpdateEgreso: (egreso: Egreso) => Promise<void>;
  onSaveConcepto: (concepto: Omit<ConceptoGasto, 'id'>) => Promise<void>;
  onDeleteEgreso: (egreso: Egreso) => Promise<void>;
  onDeleteConcepto: (concepto: ConceptoGasto) => Promise<void>;
}

const CATEGORIAS = ['Materia prima', 'Gasolina', 'Insumos', 'Mantenimiento', 'Otros'];

export const EgresosView: React.FC<EgresosViewProps> = ({
  dataset,
  egresosTabName,
  conceptosTabName,
  onRequestMutation,
  onSaveEgreso,
  onUpdateEgreso,
  onSaveConcepto,
  onDeleteEgreso,
  onDeleteConcepto,
}) => {
  const [fecha, setFecha] = useState(getTodayISO());
  const [categoria, setCategoria] = useState('Materia prima');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');
  const [jornadaId, setJornadaId] = useState('');
  const [guardarConcepto, setGuardarConcepto] = useState(false);

  // Edit egreso modal state
  const [editingEgreso, setEditingEgreso] = useState<Egreso | null>(null);
  const [editFecha, setEditFecha] = useState('');
  const [editCategoria, setEditCategoria] = useState('Materia prima');
  const [editConcepto, setEditConcepto] = useState('');
  const [editMonto, setEditMonto] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [editJornadaId, setEditJornadaId] = useState('');

  // Quick standalone concept form
  const [showConceptForm, setShowConceptForm] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  const [newConceptCat, setNewConceptCat] = useState('Materia prima');
  const [newConceptMonto, setNewConceptMonto] = useState('');

  const [filterMonth, setFilterMonth] = useState(getCurrentMonthISO());

  const jornadaMap = useMemo(
    () => new Map(dataset.jornadas.map((j) => [j.id, j])),
    [dataset.jornadas]
  );

  const openJornadas = useMemo(
    () => dataset.jornadas.filter((j) => j.estado === 'Abierta'),
    [dataset.jornadas]
  );

  const closedJornadas = useMemo(
    () => dataset.jornadas.filter((j) => j.estado === 'Cerrada'),
    [dataset.jornadas]
  );

  const openEditEgreso = (eg: Egreso) => {
    setEditingEgreso(eg);
    setEditFecha(eg.fecha);
    setEditCategoria(eg.categoria || 'Materia prima');
    setEditConcepto(eg.concepto);
    setEditMonto(String(eg.monto));
    setEditNotas(eg.notas || '');
    setEditJornadaId(eg.jornadaId || '');
  };

  const handleSaveEditEgreso = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEgreso) return;
    const montoNum = parseFloat(editMonto);
    if (!editConcepto.trim() || !montoNum || montoNum <= 0) return;

    const assignedJornada = editJornadaId ? jornadaMap.get(editJornadaId) : undefined;
    const updated: Egreso = {
      ...editingEgreso,
      fecha: editFecha,
      categoria: editCategoria,
      concepto: editConcepto.trim(),
      monto: montoNum,
      notas: editNotas.trim(),
      jornadaId: editJornadaId || '',
    };

    onRequestMutation({
      title: 'Actualizar egreso',
      description: assignedJornada
        ? `Se actualizará este gasto en "${egresosTabName}" y se descontará de la jornada "${assignedJornada.nombre}" (en Egresos será solo visual).`
        : `Se actualizará este gasto en "${egresosTabName}".`,
      sheetTab: egresosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(updated.fecha) },
        { label: 'Categoría', value: updated.categoria },
        { label: 'Concepto', value: updated.concepto },
        { label: 'Monto', value: formatCurrency(updated.monto) },
        {
          label: 'Jornada',
          value: assignedJornada
            ? `${assignedJornada.nombre} (resta en jornada)`
            : 'Egreso general',
        },
      ],
      confirmLabel: 'Guardar cambios',
      onConfirm: async () => {
        await onUpdateEgreso(updated);
        setEditingEgreso(null);
      },
    });
  };

  const applySavedConcept = (c: ConceptoGasto) => {
    setConcepto(c.concepto);
    setCategoria(c.categoria || 'Materia prima');
    if (c.montoSugerido > 0) setMonto(String(c.montoSugerido));
    setGuardarConcepto(false);
  };

  const filteredEgresos = useMemo(() => {
    return dataset.egresos
      .filter((e) => (!filterMonth ? true : e.fecha.startsWith(filterMonth)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [dataset.egresos, filterMonth]);

  const totalEgresos = useMemo(
    () =>
      filteredEgresos
        .filter((e) => !e.jornadaId || !jornadaMap.has(e.jornadaId))
        .reduce((s, e) => s + e.monto, 0),
    [filteredEgresos, jornadaMap]
  );

  const totalEgresosJornadaVisual = useMemo(
    () =>
      filteredEgresos
        .filter((e) => Boolean(e.jornadaId && jornadaMap.has(e.jornadaId)))
        .reduce((s, e) => s + e.monto, 0),
    [filteredEgresos, jornadaMap]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = parseFloat(monto);
    if (!concepto.trim() || !montoNum || montoNum <= 0) return;

    const assignedJornada = jornadaId ? jornadaMap.get(jornadaId) : undefined;
    const newConceptPayload = guardarConcepto
      ? {
          concepto: concepto.trim(),
          categoria,
          montoSugerido: montoNum,
        }
      : undefined;

    onRequestMutation({
      title: assignedJornada ? 'Registrar gasto en jornada' : 'Registrar egreso o gasto',
      description: assignedJornada
        ? `Este gasto se descontará del total de la jornada "${assignedJornada.nombre}" y se guardará en "${egresosTabName}" solo como referencia visual (sin volver a restar en Egresos).`
        : newConceptPayload
        ? `Se registrará el gasto en "${egresosTabName}" y se guardará el concepto en "${conceptosTabName}".`
        : 'Se enviará este gasto automáticamente a tu hoja de Egresos en Google Sheets.',
      sheetTab: newConceptPayload ? `${egresosTabName} + ${conceptosTabName}` : egresosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(fecha) },
        { label: 'Categoría', value: categoria },
        { label: 'Concepto', value: concepto.trim() },
        { label: 'Monto', value: formatCurrency(montoNum) },
        ...(assignedJornada
          ? [{ label: 'Enviar a jornada', value: `${assignedJornada.nombre} (resta en jornada)` }]
          : []),
      ],
      confirmLabel: 'Guardar egreso',
      onConfirm: async () => {
        await onSaveEgreso(
          {
            fecha,
            categoria,
            concepto: concepto.trim(),
            monto: montoNum,
            notas: notas.trim(),
            jornadaId: jornadaId || '',
          },
          newConceptPayload
        );
        setConcepto('');
        setMonto('');
        setNotas('');
        setJornadaId('');
        setGuardarConcepto(false);
      },
    });
  };

  const handleCreateStandaloneConcept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConceptName.trim()) return;
    const montoNum = parseFloat(newConceptMonto) || 0;

    onRequestMutation({
      title: 'Guardar concepto de egreso',
      description: `Se guardará este concepto reutilizable en la hoja "${conceptosTabName}".`,
      sheetTab: conceptosTabName,
      details: [
        { label: 'Concepto', value: newConceptName.trim() },
        { label: 'Categoría', value: newConceptCat },
        {
          label: 'Monto sugerido',
          value: montoNum > 0 ? formatCurrency(montoNum) : 'Sin monto fijo',
        },
      ],
      confirmLabel: 'Guardar concepto',
      onConfirm: async () => {
        await onSaveConcepto({
          concepto: newConceptName.trim(),
          categoria: newConceptCat,
          montoSugerido: montoNum,
        });
        setNewConceptName('');
        setNewConceptMonto('');
        setShowConceptForm(false);
      },
    });
  };

  const confirmDeleteEgreso = (eg: Egreso) => {
    onRequestMutation({
      title: 'Eliminar egreso',
      description:
        'Se eliminará este registro de gasto permanentemente de tu hoja de Google Sheets.',
      sheetTab: egresosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(eg.fecha) },
        { label: 'Concepto', value: eg.concepto },
        { label: 'Categoría', value: eg.categoria },
        { label: 'Monto', value: formatCurrency(eg.monto) },
      ],
      confirmLabel: 'Eliminar egreso',
      onConfirm: async () => {
        await onDeleteEgreso(eg);
      },
    });
  };

  const confirmDeleteConcepto = (c: ConceptoGasto) => {
    onRequestMutation({
      title: 'Eliminar concepto guardado',
      description: 'Se eliminará este concepto reutilizable de Google Sheets.',
      sheetTab: conceptosTabName,
      details: [
        { label: 'Concepto', value: c.concepto },
        { label: 'Categoría', value: c.categoria },
      ],
      confirmLabel: 'Eliminar concepto',
      onConfirm: async () => {
        await onDeleteConcepto(c);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1F1A17]">Egresos y gastos</h1>
        <p className="text-sm text-[#6E6259]">
          Registra gastos de materia prima, gasolina e insumos y reutiliza conceptos frecuentes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form + saved concepts */}
        <section className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--theme-primary)]">
                <Bookmark className="w-4 h-4 text-[var(--theme-accent)]" />
                <span>Conceptos guardados ({dataset.conceptosGasto.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConceptForm((v) => !v)}
                className="min-h-[32px] px-2.5 rounded-lg bg-[var(--theme-tint)] text-xs font-semibold text-[var(--theme-primary)] hover:opacity-90 inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showConceptForm ? 'Cerrar' : 'Nuevo concepto'}</span>
              </button>
            </div>

            {showConceptForm && (
              <form
                onSubmit={handleCreateStandaloneConcept}
                className="rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] p-3 space-y-2.5"
              >
                <input
                  type="text"
                  required
                  value={newConceptName}
                  onChange={(e) => setNewConceptName(e.target.value)}
                  placeholder="Nombre del concepto (ej. Gasolina ruta)"
                  className="w-full h-10 rounded-lg border border-[#D8D1C7] bg-white px-3 text-xs text-[#1F1A17]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newConceptCat}
                    onChange={(e) => setNewConceptCat(e.target.value)}
                    className="h-10 rounded-lg border border-[#D8D1C7] bg-white px-2.5 text-xs text-[#1F1A17]"
                  >
                    {CATEGORIAS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newConceptMonto}
                    onChange={(e) => setNewConceptMonto(e.target.value)}
                    placeholder="Monto sug. ($)"
                    className="h-10 rounded-lg border border-[#D8D1C7] bg-white px-2.5 text-xs font-mono text-[#1F1A17]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[38px] rounded-lg bg-[var(--theme-primary)] text-white text-xs font-bold hover:bg-[var(--theme-primary-hover)]"
                >
                  Guardar en {conceptosTabName}
                </button>
              </form>
            )}

            {dataset.conceptosGasto.length === 0 ? (
              <p className="text-xs text-[#6E6259]">
                Aún no hay conceptos guardados. Crea uno arriba o marca la casilla al registrar un gasto.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dataset.conceptosGasto.map((c) => (
                  <div
                    key={c.id}
                    className="inline-flex items-center rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => applySavedConcept(c)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)] transition-colors"
                    >
                      {c.concepto}
                      {c.montoSugerido > 0 ? ` · ${formatCurrency(c.montoSugerido)}` : ''}
                    </button>
                    {c.rowNumber && (
                      <button
                        type="button"
                        onClick={() => confirmDeleteConcepto(c)}
                        title={`Eliminar concepto ${c.concepto}`}
                        aria-label={`Eliminar concepto ${c.concepto}`}
                        className="min-h-[38px] px-2 text-[#8C7E73] hover:text-red-700 hover:bg-red-50 border-l border-[#E7E3DC]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[var(--theme-primary)]" />
              <h2 className="text-base font-bold text-[#1F1A17]">Registrar nuevo gasto</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Fecha *
                </label>
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Categoría *
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Concepto del gasto *
              </label>
              <input
                type="text"
                required
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej. Costal de cacahuate / Gasolina camioneta"
                className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
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
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-mono text-[#1F1A17]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Notas (opcional)
              </label>
              <input
                type="text"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Proveedor, número de nota..."
                className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Enviar a jornada (opcional)
              </label>
              <select
                value={jornadaId}
                onChange={(e) => setJornadaId(e.target.value)}
                className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
              >
                <option value="">Egreso general (resta en egresos)</option>
                {openJornadas.length > 0 && (
                  <optgroup label="Jornadas en curso">
                    {openJornadas.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nombre} · {j.ruta} ({formatDateShort(j.fecha)})
                      </option>
                    ))}
                  </optgroup>
                )}
                {closedJornadas.length > 0 && (
                  <optgroup label="Jornadas finalizadas">
                    {closedJornadas.slice(0, 15).map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nombre} · Cerrada ({formatDateShort(j.fecha)})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {jornadaId && (
                <p className="text-[11px] text-[#6E6259] mt-1.5 rounded-lg bg-[var(--theme-tint)] border border-[#E7E3DC] px-2.5 py-1.5">
                  Este gasto se restará del total de la jornada seleccionada. Aquí en Egresos aparecerá guardado solo de forma visual.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={guardarConcepto}
                onChange={(e) => setGuardarConcepto(e.target.checked)}
                className="h-4 w-4 accent-[var(--theme-primary)]"
              />
              <span className="text-sm text-[#1F1A17]">
                Guardar este concepto para reutilizarlo después
              </span>
            </label>

            <button
              type="submit"
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] text-white text-sm font-bold hover:bg-[var(--theme-primary-hover)]"
            >
              <Plus className="w-4 h-4" />
              <span>Guardar egreso en Google Sheets</span>
            </button>
          </form>
        </section>

        {/* Expenses list */}
        <section className="lg:col-span-7 rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
          <div className="p-4 sm:px-5 border-b border-[#EFECE6] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#1F1A17]">Historial de egresos</h2>
              <p className="text-xs text-[#6E6259] tabular-nums">
                Gastos generales:{' '}
                <strong className="text-[#B91C1C]">{formatCurrency(totalEgresos)}</strong>
                {totalEgresosJornadaVisual > 0 && (
                  <span className="ml-2 text-[#8C7E73]">
                    · En jornadas (solo visual): {formatCurrency(totalEgresosJornadaVisual)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="h-10 rounded-xl border border-[#D8D1C7] px-3 text-xs font-semibold text-[#1F1A17]"
              />
              {filterMonth && (
                <button
                  type="button"
                  onClick={() => setFilterMonth('')}
                  className="text-xs font-semibold text-[var(--theme-primary)] hover:underline px-2"
                >
                  Todos
                </button>
              )}
            </div>
          </div>

          {filteredEgresos.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#6E6259]">
              No hay egresos registrados en este periodo.
            </div>
          ) : (
            <div className="divide-y divide-[#EFECE6]">
              {filteredEgresos.map((eg) => {
                const assignedJ = eg.jornadaId ? jornadaMap.get(eg.jornadaId) : undefined;
                return (
                <div
                  key={eg.id}
                  className={`px-5 py-3.5 flex items-center justify-between gap-3 ${
                    assignedJ ? 'bg-[#FAF8F5]/70' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[#1F1A17] truncate">
                        {eg.concepto}
                      </p>
                      {assignedJ && (
                        <span className="inline-flex items-center rounded-md border border-[#D8D1C7] bg-[var(--theme-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--theme-primary)]">
                          Jornada: {assignedJ.nombre} · Solo visual
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6E6259] mt-0.5">
                      {formatDateShort(eg.fecha)} · {eg.categoria}
                      {eg.notas ? ` · ${eg.notas}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {assignedJ ? (
                      <div className="text-right mr-1">
                        <span className="block text-sm font-bold text-[#6E6259] tabular-nums">
                          {formatCurrency(eg.monto)}
                        </span>
                        <span className="block text-[10px] text-[#8C7E73]">
                          Resta en jornada
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-[#B91C1C] tabular-nums mr-1">
                        -{formatCurrency(eg.monto)}
                      </span>
                    )}
                    {eg.rowNumber && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditEgreso(eg)}
                          title={`Editar egreso ${eg.concepto}`}
                          aria-label={`Editar egreso ${eg.concepto}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#6E6259] hover:text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDeleteEgreso(eg)}
                          title={`Eliminar egreso ${eg.concepto}`}
                          aria-label={`Eliminar egreso ${eg.concepto}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Modal: Edit Egreso */}
      {editingEgreso && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveEditEgreso}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <h3 className="text-lg font-bold text-[#1F1A17]">Editar egreso</h3>
              <button
                type="button"
                onClick={() => setEditingEgreso(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={editFecha}
                    onChange={(e) => setEditFecha(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">Categoría *</label>
                  <select
                    value={editCategoria}
                    onChange={(e) => setEditCategoria(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                  >
                    {CATEGORIAS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Concepto *</label>
                <input
                  type="text"
                  required
                  value={editConcepto}
                  onChange={(e) => setEditConcepto(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Monto ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editMonto}
                  onChange={(e) => setEditMonto(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-mono text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Notas</label>
                <input
                  type="text"
                  value={editNotas}
                  onChange={(e) => setEditNotas(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Enviar a jornada (opcional)
                </label>
                <select
                  value={editJornadaId}
                  onChange={(e) => setEditJornadaId(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                >
                  <option value="">Egreso general (resta en egresos)</option>
                  {dataset.jornadas.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nombre} · {j.estado} ({formatDateShort(j.fecha)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingEgreso(null)}
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
