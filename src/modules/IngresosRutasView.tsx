import React, { useMemo, useState } from 'react';
import {
  Calendar,
  MapPin,
  Trash2,
  Eye,
  Edit2,
  Truck,
  ArrowRight,
  Plus,
  Bookmark,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  BusinessDataset,
  ConceptoIngreso,
  IngresoOtro,
  Jornada,
  Ticket,
} from '../types/business';
import {
  formatCurrency,
  formatDateShort,
  formatNumber,
  getCurrentMonthISO,
  getTodayISO,
  normalizeText,
} from '../utils/formatters';
import {
  buildConsolidatedIncomeEntries,
  ConsolidatedIncomeEntry,
} from '../utils/incomeConsolidation';
import { getTicketItemTipo, getTicketSummary } from '../utils/ticketAdjustments';
import { PendingMutation } from '../components/ConfirmMutationModal';

interface IngresosRutasViewProps {
  dataset: BusinessDataset;
  jornadasTabName: string;
  ticketsTabName: string;
  otrosIngresosTabName: string;
  conceptosIngresoTabName: string;
  onRequestMutation: (mutation: PendingMutation) => void;
  onViewTicket: (ticket: Ticket, editMode?: boolean) => void;
  onDeleteTicket: (ticket: Ticket) => Promise<void>;
  onDeleteJornada: (jornada: Jornada) => Promise<void>;
  onSaveIngresoOtro: (
    ingreso: Omit<IngresoOtro, 'id'>,
    saveConcept?: Omit<ConceptoIngreso, 'id'>
  ) => Promise<void>;
  onUpdateIngresoOtro: (ingreso: IngresoOtro) => Promise<void>;
  onSaveConceptoIngreso: (concepto: Omit<ConceptoIngreso, 'id'>) => Promise<void>;
  onDeleteIngresoOtro: (ingreso: IngresoOtro) => Promise<void>;
  onDeleteConceptoIngreso: (concepto: ConceptoIngreso) => Promise<void>;
  onNavigateToJornadas: () => void;
}

const INGRESO_CATEGORIAS = [
  'Eventos y pedidos especiales',
  'Venta directa sin ticket',
  'Aportación o capital',
  'Comisiones y bonos',
  'Devolución o reembolso',
  'Otros ingresos',
];

export const IngresosRutasView: React.FC<IngresosRutasViewProps> = ({
  dataset,
  jornadasTabName,
  ticketsTabName,
  otrosIngresosTabName,
  conceptosIngresoTabName,
  onRequestMutation,
  onViewTicket,
  onDeleteTicket,
  onDeleteJornada,
  onSaveIngresoOtro,
  onUpdateIngresoOtro,
  onSaveConceptoIngreso,
  onDeleteIngresoOtro,
  onDeleteConceptoIngreso,
  onNavigateToJornadas,
}) => {
  const [activeTab, setActiveTab] = useState<'consolidado' | 'otros'>('consolidado');

  // Filters for Consolidado tab
  const [filterFecha, setFilterFecha] = useState(getTodayISO());
  const [filterRuta, setFilterRuta] = useState('Todas');
  const [showAllDates, setShowAllDates] = useState(false);
  const [includeOtrosInList, setIncludeOtrosInList] = useState(true);
  const [activeJornadaId, setActiveJornadaId] = useState<string>('');
  const [expandedJornadas, setExpandedJornadas] = useState<Record<string, boolean>>({});

  // Otros Ingresos form state
  const [fechaIngreso, setFechaIngreso] = useState(getTodayISO());
  const [categoriaIngreso, setCategoriaIngreso] = useState(INGRESO_CATEGORIAS[0]);
  const [conceptoIngreso, setConceptoIngreso] = useState('');
  const [montoIngreso, setMontoIngreso] = useState('');
  const [notasIngreso, setNotasIngreso] = useState('');
  const [guardarConcepto, setGuardarConcepto] = useState(false);

  // Quick standalone income concept form
  const [showConceptForm, setShowConceptForm] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  const [newConceptCat, setNewConceptCat] = useState(INGRESO_CATEGORIAS[0]);
  const [newConceptMonto, setNewConceptMonto] = useState('');

  // Filter for Otros Ingresos history tab
  const [filterMonthOtros, setFilterMonthOtros] = useState(getCurrentMonthISO());

  // Edit IngresoOtro modal state
  const [editingIngresoOtro, setEditingIngresoOtro] = useState<IngresoOtro | null>(null);
  const [editFechaIng, setEditFechaIng] = useState('');
  const [editCatIng, setEditCatIng] = useState(INGRESO_CATEGORIAS[0]);
  const [editConceptoIng, setEditConceptoIng] = useState('');
  const [editMontoIng, setEditMontoIng] = useState('');
  const [editNotasIng, setEditNotasIng] = useState('');

  const openEditIngresoOtro = (ing: IngresoOtro) => {
    setEditingIngresoOtro(ing);
    setEditFechaIng(ing.fecha);
    setEditCatIng(ing.categoria || INGRESO_CATEGORIAS[0]);
    setEditConceptoIng(ing.concepto);
    setEditMontoIng(String(ing.monto));
    setEditNotasIng(ing.notas || '');
  };

  const handleSaveEditIngresoOtro = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIngresoOtro) return;
    const montoNum = parseFloat(editMontoIng);
    if (!editConceptoIng.trim() || !montoNum || montoNum <= 0) return;

    const updated: IngresoOtro = {
      ...editingIngresoOtro,
      fecha: editFechaIng,
      categoria: editCatIng,
      concepto: editConceptoIng.trim(),
      monto: montoNum,
      notas: editNotasIng.trim(),
    };

    onRequestMutation({
      title: 'Actualizar otro ingreso',
      description: `Se guardarán los cambios en "${otrosIngresosTabName}".`,
      sheetTab: otrosIngresosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(updated.fecha) },
        { label: 'Categoría', value: updated.categoria },
        { label: 'Concepto', value: updated.concepto },
        { label: 'Monto', value: formatCurrency(updated.monto) },
      ],
      confirmLabel: 'Guardar cambios',
      onConfirm: async () => {
        await onUpdateIngresoOtro(updated);
        setEditingIngresoOtro(null);
      },
    });
  };

  const allConsolidatedEntries = useMemo(
    () => buildConsolidatedIncomeEntries(dataset),
    [dataset]
  );

  // Filtered consolidated entries (Jornadas count as ONE unified income; tickets inside Jornadas do NOT sum individually)
  const visibleEntries = useMemo(() => {
    if (activeJornadaId) {
      return allConsolidatedEntries.filter(
        (e) => e.kind === 'jornada' && e.id === activeJornadaId
      );
    }
    return allConsolidatedEntries.filter((entry) => {
      if (entry.kind === 'otro_ingreso' && !includeOtrosInList) return false;
      if (!showAllDates && filterFecha && entry.fecha !== filterFecha) return false;
      if (filterRuta !== 'Todas') {
        if (entry.kind === 'otro_ingreso') return false;
        if (normalizeText(entry.ruta) !== normalizeText(filterRuta)) return false;
      }
      return true;
    });
  }, [
    activeJornadaId,
    allConsolidatedEntries,
    filterFecha,
    filterRuta,
    includeOtrosInList,
    showAllDates,
  ]);

  const summaryTotals = useMemo(() => {
    let jornadasTotal = 0;
    let jornadasCount = 0;
    let directosTotal = 0;
    let directosCount = 0;
    let otrosTotal = 0;
    let otrosCount = 0;
    let totalPiezas = 0;

    for (const e of visibleEntries) {
      totalPiezas += e.totalPiezas;
      if (e.kind === 'jornada') {
        jornadasTotal += e.monto;
        jornadasCount += 1;
      } else if (e.kind === 'ticket') {
        directosTotal += e.monto;
        directosCount += 1;
      } else {
        otrosTotal += e.monto;
        otrosCount += 1;
      }
    }

    return {
      jornadasTotal,
      jornadasCount,
      directosTotal,
      directosCount,
      otrosTotal,
      otrosCount,
      totalPiezas,
      granTotal: jornadasTotal + directosTotal + otrosTotal,
    };
  }, [visibleEntries]);

  const filteredOtrosIngresos = useMemo(() => {
    return (dataset.otrosIngresos || [])
      .filter((o) => (!filterMonthOtros ? true : o.fecha.startsWith(filterMonthOtros)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [dataset.otrosIngresos, filterMonthOtros]);

  const totalOtrosMes = useMemo(
    () => filteredOtrosIngresos.reduce((s, o) => s + o.monto, 0),
    [filteredOtrosIngresos]
  );

  const toggleExpandJornada = (id: string) => {
    setExpandedJornadas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const applySavedConcept = (c: ConceptoIngreso) => {
    setConceptoIngreso(c.concepto);
    setCategoriaIngreso(c.categoria || INGRESO_CATEGORIAS[0]);
    if (c.montoSugerido > 0) setMontoIngreso(String(c.montoSugerido));
    setGuardarConcepto(false);
  };

  const handleSubmitIngresoOtro = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = parseFloat(montoIngreso);
    if (!conceptoIngreso.trim() || !montoNum || montoNum <= 0) return;

    const newConceptPayload = guardarConcepto
      ? {
          concepto: conceptoIngreso.trim(),
          categoria: categoriaIngreso,
          montoSugerido: montoNum,
        }
      : undefined;

    onRequestMutation({
      title: 'Registrar ingreso por otro concepto',
      description: newConceptPayload
        ? `Se registrará el ingreso en "${otrosIngresosTabName}" y se guardará el concepto en "${conceptosIngresoTabName}".`
        : `Se enviará este ingreso automáticamente a tu hoja "${otrosIngresosTabName}" en Google Sheets.`,
      sheetTab: newConceptPayload
        ? `${otrosIngresosTabName} + ${conceptosIngresoTabName}`
        : otrosIngresosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(fechaIngreso) },
        { label: 'Categoría', value: categoriaIngreso },
        { label: 'Concepto', value: conceptoIngreso.trim() },
        { label: 'Monto', value: formatCurrency(montoNum) },
      ],
      confirmLabel: 'Guardar ingreso',
      onConfirm: async () => {
        await onSaveIngresoOtro(
          {
            fecha: fechaIngreso,
            categoria: categoriaIngreso,
            concepto: conceptoIngreso.trim(),
            monto: montoNum,
            notas: notasIngreso.trim(),
          },
          newConceptPayload
        );
        setConceptoIngreso('');
        setMontoIngreso('');
        setNotasIngreso('');
        setGuardarConcepto(false);
      },
    });
  };

  const handleCreateStandaloneConcept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConceptName.trim()) return;
    const montoNum = parseFloat(newConceptMonto) || 0;

    onRequestMutation({
      title: 'Guardar concepto de ingreso',
      description: `Se guardará este concepto reutilizable en la hoja "${conceptosIngresoTabName}".`,
      sheetTab: conceptosIngresoTabName,
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
        await onSaveConceptoIngreso({
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

  const confirmDeleteTicket = (ticket: Ticket) => {
    onRequestMutation({
      title: `Eliminar ticket ${ticket.folio}`,
      description:
        'Se eliminará este ticket permanentemente de Google Sheets y se recalculará su jornada si pertenecía a una.',
      sheetTab: ticketsTabName,
      details: [
        { label: 'Folio', value: ticket.folio },
        { label: 'Cliente', value: ticket.clienteNombre },
        { label: 'Fecha', value: formatDateShort(ticket.fecha) },
        { label: 'Importe', value: formatCurrency(ticket.totalImporte) },
      ],
      confirmLabel: 'Eliminar ticket',
      onConfirm: async () => {
        await onDeleteTicket(ticket);
      },
    });
  };

  const confirmDeleteJornada = (jornada: Jornada) => {
    onRequestMutation({
      title: 'Eliminar jornada de venta',
      description:
        'Se eliminará esta jornada de Google Sheets y sus tickets vinculados volverán a contar de forma individual.',
      sheetTab: jornadasTabName,
      details: [
        { label: 'Jornada', value: jornada.nombre },
        { label: 'Fecha', value: formatDateShort(jornada.fecha) },
        { label: 'Tickets', value: String(jornada.totalTickets) },
        { label: 'Total', value: formatCurrency(jornada.totalImporte) },
      ],
      confirmLabel: 'Eliminar jornada',
      onConfirm: async () => {
        await onDeleteJornada(jornada);
        if (activeJornadaId === jornada.id) setActiveJornadaId('');
      },
    });
  };

  const confirmDeleteIngresoOtro = (ing: IngresoOtro) => {
    onRequestMutation({
      title: 'Eliminar ingreso',
      description: 'Se eliminará este registro de ingreso permanentemente de Google Sheets.',
      sheetTab: otrosIngresosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(ing.fecha) },
        { label: 'Concepto', value: ing.concepto },
        { label: 'Categoría', value: ing.categoria },
        { label: 'Monto', value: formatCurrency(ing.monto) },
      ],
      confirmLabel: 'Eliminar ingreso',
      onConfirm: async () => {
        await onDeleteIngresoOtro(ing);
      },
    });
  };

  const confirmDeleteConceptoIngreso = (c: ConceptoIngreso) => {
    onRequestMutation({
      title: 'Eliminar concepto de ingreso',
      description: 'Se eliminará este concepto reutilizable de Google Sheets.',
      sheetTab: conceptosIngresoTabName,
      details: [
        { label: 'Concepto', value: c.concepto },
        { label: 'Categoría', value: c.categoria },
      ],
      confirmLabel: 'Eliminar concepto',
      onConfirm: async () => {
        await onDeleteConceptoIngreso(c);
      },
    });
  };

  const renderEntryCard = (entry: ConsolidatedIncomeEntry) => {
    if (entry.kind === 'jornada' && entry.jornada) {
      const j = entry.jornada;
      const linked = entry.linkedTickets || [];
      const isExpanded = Boolean(expandedJornadas[j.id] || activeJornadaId === j.id);
      return (
        <div key={`jor-${j.id}`} className="p-4 sm:px-5 space-y-3 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--theme-tint)] px-2 py-0.5 text-[11px] font-bold text-[var(--theme-primary)]">
                  <Truck className="w-3 h-3" />
                  <span>JORNADA COMPLETA</span>
                </span>
                <p className="text-sm font-bold text-[#1F1A17] truncate">{entry.titulo}</p>
              </div>
              <p className="text-xs text-[#6E6259] mt-1 tabular-nums">
                {formatDateShort(entry.fecha)} · {entry.ruta} ·{' '}
                <strong>{entry.totalTickets} ticket(s) consolidados</strong> ·{' '}
                {formatNumber(entry.totalPiezas)} piezas ·{' '}
                <span
                  className={
                    j.estado === 'Abierta'
                      ? 'text-emerald-700 font-semibold'
                      : 'text-[#6E6259]'
                  }
                >
                  {j.estado}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <div className="text-right mr-1">
                <p className="text-base font-bold text-emerald-700 tabular-nums">
                  {entry.monto >= 0 ? `+${formatCurrency(entry.monto)}` : formatCurrency(entry.monto)}
                </p>
                {(entry.gastosJornada || 0) > 0 ? (
                  <p className="text-[11px] text-[#8C7E73] tabular-nums">
                    Ventas {formatCurrency(entry.montoBruto ?? entry.monto)} · Gastos -{formatCurrency(entry.gastosJornada || 0)}
                  </p>
                ) : (
                  <p className="text-[11px] text-[#8C7E73]">Ingreso único</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleExpandJornada(j.id)}
                className="min-h-[38px] inline-flex items-center gap-1 rounded-lg border border-[#D8D1C7] px-2.5 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)]"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Ocultar ({linked.length})</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Ver detalle ({linked.length})</span>
                  </>
                )}
              </button>
              {j.rowNumber && (
                <button
                  type="button"
                  onClick={() => confirmDeleteJornada(j)}
                  title={`Eliminar jornada ${j.nombre}`}
                  aria-label={`Eliminar jornada ${j.nombre}`}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="rounded-xl border border-[#EFECE6] bg-[#FAF8F5] divide-y divide-[#EFECE6]">
              <div className="px-3.5 py-2 text-[11px] font-semibold text-[#6E6259] flex items-center justify-between">
                <span>Tickets incluidos dentro de esta jornada (no suman aparte)</span>
                <span className="tabular-nums">
                  {formatCurrency(entry.montoBruto ?? entry.monto)}
                </span>
              </div>
              {linked.length === 0 ? (
                <div className="px-3.5 py-3 text-xs text-[#8C7E73]">
                  Esta jornada aún no tiene tickets asignados.
                </div>
              ) : (
                linked.map((t) => (
                  <div
                    key={t.folio}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1F1A17] truncate">
                        <span className="font-mono text-[var(--theme-primary)] mr-1.5">
                          {t.folio}
                        </span>
                        {t.clienteNombre}
                      </p>
                      <p className="text-[11px] text-[#6E6259] tabular-nums">
                        {formatDateShort(t.fecha)} · {t.totalPiezas} pzas
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-semibold text-[#49403A] tabular-nums mr-1">
                        {formatCurrency(t.totalImporte)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onViewTicket(t, false)}
                        title={`Ver ticket ${t.folio}`}
                        className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--theme-primary)] hover:bg-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {t.rowNumber && (
                        <>
                          <button
                            type="button"
                            onClick={() => onViewTicket(t, true)}
                            title={`Editar ticket ${t.folio}`}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-[#6E6259] hover:bg-white"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDeleteTicket(t)}
                            title={`Eliminar ticket ${t.folio}`}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {(entry.egresosJornada || []).length > 0 && (
                <>
                  <div className="px-3.5 py-2 text-[11px] font-semibold text-[#B91C1C] bg-red-50/50 flex items-center justify-between">
                    <span>Gastos asignados a esta jornada (restados del total)</span>
                    <span className="tabular-nums">
                      -{formatCurrency(entry.gastosJornada || 0)}
                    </span>
                  </div>
                  {(entry.egresosJornada || []).map((eg) => (
                    <div
                      key={eg.id}
                      className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs bg-white/70"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#1F1A17] truncate">{eg.concepto}</p>
                        <p className="text-[11px] text-[#6E6259]">
                          {formatDateShort(eg.fecha)} · {eg.categoria}
                          {eg.notas ? ` · ${eg.notas}` : ''}
                        </p>
                      </div>
                      <span className="font-semibold text-[#B91C1C] tabular-nums shrink-0">
                        -{formatCurrency(eg.monto)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    if (entry.kind === 'ticket' && entry.ticket) {
      const t = entry.ticket;
      return (
        <div key={`tick-${t.folio}`} className="p-4 sm:px-5 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-[#FAF8F5] border border-[#E7E3DC] px-2 py-0.5 text-[11px] font-semibold text-[#49403A]">
                  TICKET DIRECTO
                </span>
                <p className="text-sm font-bold text-[#1F1A17] truncate">
                  {t.clienteNombre}
                </p>
              </div>
              <p className="text-xs text-[#6E6259] mt-1">
                <span className="font-mono font-semibold text-[var(--theme-primary)]">
                  {t.folio}
                </span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{formatDateShort(t.fecha)}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{t.ruta}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{t.tipoVenta}</span>
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="text-right mr-1">
                <p className="text-sm font-bold text-emerald-700 tabular-nums">
                  +{formatCurrency(t.totalImporte)}
                </p>
                <p className="text-xs text-[#6E6259] tabular-nums">
                  {t.totalPiezas} piezas
                </p>
              </div>
              <button
                type="button"
                onClick={() => onViewTicket(t, false)}
                title={`Ver ticket ${t.folio}`}
                className="min-h-[38px] inline-flex items-center gap-1 rounded-lg border border-[#D8D1C7] px-2.5 text-xs font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ver</span>
              </button>
              {t.rowNumber && (
                <>
                  <button
                    type="button"
                    onClick={() => onViewTicket(t, true)}
                    title={`Editar ticket ${t.folio}`}
                    aria-label={`Editar ticket ${t.folio}`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#6E6259] hover:text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDeleteTicket(t)}
                    title={`Eliminar ticket ${t.folio}`}
                    aria-label={`Eliminar ticket ${t.folio}`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {t.items.length > 0 && (() => {
            const summary = getTicketSummary(t);
            return (
              <div className="pl-0 sm:pl-4 space-y-1 border-t border-[#F4F1EB] pt-2 text-xs text-[#49403A]">
                {t.items.map((it, i) => {
                  const tipo = getTicketItemTipo(it);
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 tabular-nums">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <strong>{it.cantidad}</strong> × {it.productoNombre}
                        {tipo !== 'Venta' && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              tipo === 'Devolución'
                                ? 'bg-red-50 text-red-700'
                                : tipo === 'Cortesía'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-sky-50 text-sky-700'
                            }`}
                          >
                            {tipo}
                          </span>
                        )}
                      </span>
                      <span
                        className={
                          tipo === 'Devolución'
                            ? 'text-red-700 font-semibold'
                            : tipo === 'Cortesía' || tipo === 'Cambio'
                            ? 'text-emerald-700 font-semibold'
                            : 'text-[#6E6259]'
                        }
                      >
                        {tipo === 'Devolución'
                          ? `-${formatCurrency(Math.abs(it.subtotal))}`
                          : formatCurrency(it.subtotal)}
                      </span>
                    </div>
                  );
                })}
                {summary.descuentoMonto > 0 && (
                  <div className="flex items-center justify-between gap-2 text-emerald-700 font-semibold pt-0.5">
                    <span>
                      Descuento
                      {summary.descuentoTipo === 'porcentaje' && summary.descuentoValor > 0
                        ? ` (${summary.descuentoValor}%)`
                        : ''}
                      {summary.descuentoMotivo ? ` · ${summary.descuentoMotivo}` : ''}
                    </span>
                    <span className="tabular-nums">-{formatCurrency(summary.descuentoMonto)}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );
    }

    if (entry.kind === 'otro_ingreso' && entry.ingresoOtro) {
      const ing = entry.ingresoOtro;
      return (
        <div
          key={`otr-${ing.id}`}
          className="p-4 sm:px-5 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                OTRO INGRESO
              </span>
              <p className="text-sm font-bold text-[#1F1A17] truncate">{ing.concepto}</p>
            </div>
            <p className="text-xs text-[#6E6259] mt-1">
              {formatDateShort(ing.fecha)} · {ing.categoria}
              {ing.notas ? ` · ${ing.notas}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm font-bold text-emerald-700 tabular-nums mr-1">
              +{formatCurrency(ing.monto)}
            </span>
            {ing.rowNumber && (
              <>
                <button
                  type="button"
                  onClick={() => openEditIngresoOtro(ing)}
                  title={`Editar ingreso ${ing.concepto}`}
                  aria-label={`Editar ingreso ${ing.concepto}`}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#6E6259] hover:text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeleteIngresoOtro(ing)}
                  title={`Eliminar ingreso ${ing.concepto}`}
                  aria-label={`Eliminar ingreso ${ing.concepto}`}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header & Top Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F1A17]">Ingresos, jornadas y otros conceptos</h1>
          <p className="text-sm text-[#6E6259]">
            Las jornadas consolidan sus tickets en un solo ingreso. También puedes capturar ingresos por otros conceptos.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-[#EFECE6] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('consolidado')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'consolidado'
                ? 'bg-white text-[#1F1A17] shadow-xs'
                : 'text-[#6E6259] hover:text-[#1F1A17]'
            }`}
          >
            Ingresos por ruta y jornadas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('otros')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'otros'
                ? 'bg-white text-[#1F1A17] shadow-xs'
                : 'text-[#6E6259] hover:text-[#1F1A17]'
            }`}
          >
            Otros ingresos ({(dataset.otrosIngresos || []).length})
          </button>
        </div>
      </div>

      {activeTab === 'consolidado' ? (
        <>
          {/* Filters Bar */}
          <section className="rounded-2xl bg-white border border-[#E7E3DC] p-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Fecha
              </label>
              <input
                type="date"
                disabled={showAllDates}
                value={filterFecha}
                onChange={(e) => {
                  setFilterFecha(e.target.value);
                  setActiveJornadaId('');
                }}
                className="h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17] disabled:bg-[#FAF8F5]"
              />
            </div>

            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer text-sm text-[#49403A]">
              <input
                type="checkbox"
                checked={showAllDates}
                onChange={(e) => {
                  setShowAllDates(e.target.checked);
                  setActiveJornadaId('');
                }}
                className="h-4 w-4 accent-[var(--theme-primary)]"
              />
              <span>Ver todas las fechas</span>
            </label>

            <div className="min-w-[180px] flex-1 sm:flex-initial">
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                <MapPin className="w-3.5 h-3.5 inline mr-1" />
                Ruta
              </label>
              <select
                value={filterRuta}
                onChange={(e) => {
                  setFilterRuta(e.target.value);
                  setActiveJornadaId('');
                }}
                className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
              >
                <option value="Todas">Todas las rutas</option>
                {dataset.rutas.map((r) => (
                  <option key={r.id} value={r.nombre}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer text-xs font-medium text-[#49403A]">
              <input
                type="checkbox"
                checked={includeOtrosInList}
                onChange={(e) => setIncludeOtrosInList(e.target.checked)}
                className="h-4 w-4 accent-[var(--theme-primary)]"
              />
              <span>Incluir otros ingresos</span>
            </label>

            <div className="ml-auto text-right">
              <p className="text-xs text-[#6E6259]">Ingreso total consolidado</p>
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                {formatCurrency(summaryTotals.granTotal)}
              </p>
              <p className="text-xs text-[#8C7E73] tabular-nums">
                {summaryTotals.jornadasCount} jor. · {summaryTotals.directosCount} dir. ·{' '}
                {summaryTotals.otrosCount} otros · {formatNumber(summaryTotals.totalPiezas)} pzas
              </p>
            </div>
          </section>

          {/* Summary Strip */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
              <p className="text-xs font-medium text-[#6E6259]">Jornadas completas</p>
              <p className="text-xl font-bold text-[var(--theme-primary)] tabular-nums mt-1">
                {formatCurrency(summaryTotals.jornadasTotal)}
              </p>
              <p className="text-xs text-[#8C7E73] mt-0.5 tabular-nums">
                {summaryTotals.jornadasCount} jornada(s)
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
              <p className="text-xs font-medium text-[#6E6259]">Tickets directos</p>
              <p className="text-xl font-bold text-[#1F1A17] tabular-nums mt-1">
                {formatCurrency(summaryTotals.directosTotal)}
              </p>
              <p className="text-xs text-[#8C7E73] mt-0.5 tabular-nums">
                {summaryTotals.directosCount} sin jornada
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
              <p className="text-xs font-medium text-[#6E6259]">Otros conceptos</p>
              <p className="text-xl font-bold text-emerald-700 tabular-nums mt-1">
                {formatCurrency(summaryTotals.otrosTotal)}
              </p>
              <p className="text-xs text-[#8C7E73] mt-0.5 tabular-nums">
                {summaryTotals.otrosCount} ingreso(s)
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
              <p className="text-xs font-medium text-[#6E6259]">Piezas vendidas</p>
              <p className="text-xl font-bold text-[#1F1A17] tabular-nums mt-1">
                {formatNumber(summaryTotals.totalPiezas)}
              </p>
              <p className="text-xs text-[#8C7E73] mt-0.5">En jornadas y tickets</p>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Quick shortcuts + Registered Jornadas */}
            <section className="lg:col-span-5 space-y-5">
              <div className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-xl bg-[var(--theme-tint)] flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-[var(--theme-primary)]" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#1F1A17]">
                      Menú especial de Jornadas
                    </h2>
                    <p className="text-xs text-[#6E6259]">
                      Cada jornada consolida sus tickets como un solo ingreso.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onNavigateToJornadas}
                    className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--theme-primary)] px-3 text-white text-xs font-bold hover:bg-[var(--theme-primary-hover)] transition-colors"
                  >
                    <span>Ir a Jornadas</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('otros')}
                    className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs font-bold text-[#1F1A17] hover:bg-[var(--theme-tint)] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Capturar otro ingreso</span>
                  </button>
                </div>
              </div>

              {/* Saved Jornadas */}
              <div className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#EFECE6] flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#1F1A17]">
                    Jornadas registradas ({dataset.jornadas.length})
                  </h3>
                  {activeJornadaId && (
                    <button
                      type="button"
                      onClick={() => setActiveJornadaId('')}
                      className="text-xs font-semibold text-[var(--theme-accent)] hover:underline"
                    >
                      Ver todo
                    </button>
                  )}
                </div>
                {dataset.jornadas.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#6E6259]">
                    Aún no hay jornadas guardadas. Abre una desde el menú de Jornadas.
                  </div>
                ) : (
                  <div className="divide-y divide-[#EFECE6] max-h-[380px] overflow-y-auto">
                    {[...dataset.jornadas].reverse().map((j) => {
                      const isActive = activeJornadaId === j.id;
                      const consolidated = allConsolidatedEntries.find(
                        (e) => e.kind === 'jornada' && e.id === j.id
                      );
                      return (
                        <div
                          key={j.id}
                          className={`px-5 py-3.5 flex items-center justify-between gap-2 transition-colors ${
                            isActive ? 'bg-[var(--theme-tint)]' : 'bg-white hover:bg-[#FAF8F5]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveJornadaId(isActive ? '' : j.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className="text-sm font-bold text-[#1F1A17] truncate">
                              {j.nombre}{' '}
                              <span
                                className={`text-[11px] font-semibold ${
                                  j.estado === 'Abierta'
                                    ? 'text-emerald-700'
                                    : 'text-[#8C7E73]'
                                }`}
                              >
                                · {j.estado}
                              </span>
                            </p>
                            <p className="text-xs text-[#6E6259] mt-0.5 tabular-nums">
                              {formatDateShort(j.fecha)} · {consolidated?.totalTickets ?? j.totalTickets} tickets ·{' '}
                              {consolidated?.totalPiezas ?? j.totalPiezas} pzas
                              {(consolidated?.gastosJornada || 0) > 0
                                ? ` · Gastos -${formatCurrency(consolidated!.gastosJornada!)}`
                                : ''}
                            </p>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-sm font-bold text-emerald-700 tabular-nums">
                              {formatCurrency(consolidated?.monto ?? j.totalImporte)}
                            </span>
                            {j.rowNumber && (
                              <button
                                type="button"
                                onClick={() => confirmDeleteJornada(j)}
                                title={`Eliminar jornada ${j.nombre}`}
                                aria-label={`Eliminar jornada ${j.nombre}`}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Right: Consolidated Income Breakdown */}
            <section className="lg:col-span-7 rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#EFECE6] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[#1F1A17]">
                    {activeJornadaId
                      ? `Jornada seleccionada: ${
                          dataset.jornadas.find((j) => j.id === activeJornadaId)?.nombre || ''
                        }`
                      : 'Desglose consolidado de ingresos'}
                  </h2>
                  {activeJornadaId && (
                    <button
                      type="button"
                      onClick={() => setActiveJornadaId('')}
                      className="text-xs font-semibold text-[var(--theme-accent)] hover:underline"
                    >
                      Mostrar todos
                    </button>
                  )}
                </div>
                <p className="text-xs text-[#6E6259] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>
                    Los tickets asignados a una jornada se suman juntos como 1 solo ingreso de jornada.
                  </span>
                </p>
              </div>

              {visibleEntries.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#6E6259]">
                  No hay ingresos para la fecha y ruta seleccionadas. Prueba activar &ldquo;Ver todas las fechas&rdquo;.
                </div>
              ) : (
                <div className="divide-y divide-[#EFECE6]">
                  {visibleEntries.map((entry) => renderEntryCard(entry))}

                  {/* Grand Total Footer */}
                  <div className="px-5 py-4 bg-[#FAF8F5] flex items-center justify-between gap-4">
                    <div className="text-sm font-bold text-[#1F1A17]">
                      Suma consolidada ({visibleEntries.length} registro(s) ·{' '}
                      {formatNumber(summaryTotals.totalPiezas)} pzas)
                    </div>
                    <div className="text-lg font-bold text-emerald-700 tabular-nums">
                      {formatCurrency(summaryTotals.granTotal)}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        /* Tab 2: Otros Ingresos (mirrors EgresosView UX) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Form + saved income concepts */}
          <section className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--theme-primary)]">
                  <Bookmark className="w-4 h-4 text-[var(--theme-accent)]" />
                  <span>
                    Conceptos de ingreso guardados ({(dataset.conceptosIngreso || []).length})
                  </span>
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
                    placeholder="Nombre del concepto (ej. Venta feria local)"
                    className="w-full h-10 rounded-lg border border-[#D8D1C7] bg-white px-3 text-xs text-[#1F1A17]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newConceptCat}
                      onChange={(e) => setNewConceptCat(e.target.value)}
                      className="h-10 rounded-lg border border-[#D8D1C7] bg-white px-2.5 text-xs text-[#1F1A17]"
                    >
                      {INGRESO_CATEGORIAS.map((cat) => (
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
                    Guardar en {conceptosIngresoTabName}
                  </button>
                </form>
              )}

              {(dataset.conceptosIngreso || []).length === 0 ? (
                <p className="text-xs text-[#6E6259]">
                  Aún no hay conceptos de ingreso guardados. Crea uno arriba o marca la casilla al capturar un ingreso.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(dataset.conceptosIngreso || []).map((c) => (
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
                          onClick={() => confirmDeleteConceptoIngreso(c)}
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
              onSubmit={handleSubmitIngresoOtro}
              className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-700" />
                <h2 className="text-base font-bold text-[#1F1A17]">
                  Registrar ingreso por otro concepto
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaIngreso}
                    onChange={(e) => setFechaIngreso(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                    Categoría *
                  </label>
                  <select
                    value={categoriaIngreso}
                    onChange={(e) => setCategoriaIngreso(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                  >
                    {INGRESO_CATEGORIAS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Concepto del ingreso *
                </label>
                <input
                  type="text"
                  required
                  value={conceptoIngreso}
                  onChange={(e) => setConceptoIngreso(e.target.value)}
                  placeholder="Ej. Pedido evento escolar / Aportación caja / Bono"
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
                  value={montoIngreso}
                  onChange={(e) => setMontoIngreso(e.target.value)}
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
                  value={notasIngreso}
                  onChange={(e) => setNotasIngreso(e.target.value)}
                  placeholder="Referencia, cliente, comprobante..."
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
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
                <span>Guardar ingreso en Google Sheets</span>
              </button>
            </form>
          </section>

          {/* Otros Ingresos List */}
          <section className="lg:col-span-7 rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
            <div className="p-4 sm:px-5 border-b border-[#EFECE6] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#1F1A17]">
                  Historial de otros ingresos
                </h2>
                <p className="text-xs text-[#6E6259] tabular-nums">
                  Total del periodo:{' '}
                  <strong className="text-emerald-700">{formatCurrency(totalOtrosMes)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={filterMonthOtros}
                  onChange={(e) => setFilterMonthOtros(e.target.value)}
                  className="h-10 rounded-xl border border-[#D8D1C7] px-3 text-xs font-semibold text-[#1F1A17]"
                />
                {filterMonthOtros && (
                  <button
                    type="button"
                    onClick={() => setFilterMonthOtros('')}
                    className="text-xs font-semibold text-[var(--theme-primary)] hover:underline px-2"
                  >
                    Todos
                  </button>
                )}
              </div>
            </div>

            {filteredOtrosIngresos.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#6E6259]">
                No hay otros ingresos registrados en este periodo.
              </div>
            ) : (
              <div className="divide-y divide-[#EFECE6]">
                {filteredOtrosIngresos.map((ing) => (
                  <div
                    key={ing.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1F1A17] truncate">{ing.concepto}</p>
                      <p className="text-xs text-[#6E6259] mt-0.5">
                        {formatDateShort(ing.fecha)} · {ing.categoria}
                        {ing.notas ? ` · ${ing.notas}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-bold text-emerald-700 tabular-nums mr-1">
                        +{formatCurrency(ing.monto)}
                      </span>
                      {ing.rowNumber && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditIngresoOtro(ing)}
                            title={`Editar ingreso ${ing.concepto}`}
                            aria-label={`Editar ingreso ${ing.concepto}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#6E6259] hover:text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDeleteIngresoOtro(ing)}
                            title={`Eliminar ingreso ${ing.concepto}`}
                            aria-label={`Eliminar ingreso ${ing.concepto}`}
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
      )}

      {/* Modal: Edit IngresoOtro */}
      {editingIngresoOtro && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveEditIngresoOtro}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <h3 className="text-lg font-bold text-[#1F1A17]">Editar otro ingreso</h3>
              <button
                type="button"
                onClick={() => setEditingIngresoOtro(null)}
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
                    value={editFechaIng}
                    onChange={(e) => setEditFechaIng(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">Categoría *</label>
                  <select
                    value={editCatIng}
                    onChange={(e) => setEditCatIng(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                  >
                    {INGRESO_CATEGORIAS.map((cat) => (
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
                  value={editConceptoIng}
                  onChange={(e) => setEditConceptoIng(e.target.value)}
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
                  value={editMontoIng}
                  onChange={(e) => setEditMontoIng(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-mono text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Notas</label>
                <input
                  type="text"
                  value={editNotasIng}
                  onChange={(e) => setEditNotasIng(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingIngresoOtro(null)}
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
