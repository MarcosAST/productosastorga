import {
  BusinessDataset,
  Egreso,
  IngresoOtro,
  Jornada,
  Ticket,
} from '../types/business';

export interface ConsolidatedIncomeEntry {
  id: string;
  kind: 'jornada' | 'ticket' | 'otro_ingreso';
  fecha: string;
  ruta: string;
  titulo: string;
  categoria: string;
  totalTickets: number;
  totalPiezas: number;
  monto: number;
  montoBruto?: number;
  gastosJornada?: number;
  egresosJornada?: Egreso[];
  jornada?: Jornada;
  linkedTickets?: Ticket[];
  ticket?: Ticket;
  ingresoOtro?: IngresoOtro;
}

export interface PeriodIncomeSummary {
  ingresosJornadas: number;
  ventasBrutasJornadas: number;
  gastosJornadas: number;
  countJornadas: number;
  piezasJornadas: number;
  ticketsEnJornadas: number;
  ingresosTicketsDirectos: number;
  countTicketsDirectos: number;
  piezasTicketsDirectos: number;
  ingresosOtros: number;
  countOtros: number;
  totalIngresos: number;
  totalPiezasVendidas: number;
  totalRegistrosIngreso: number;
}

/**
 * Returns egresos assigned to a specific jornada and their summed total.
 */
export function getJornadaExpenses(
  dataset: BusinessDataset,
  jornadaId: string
): { egresos: Egreso[]; totalGastos: number } {
  if (!jornadaId) return { egresos: [], totalGastos: 0 };
  const egresos = (dataset.egresos || [])
    .filter((e) => e.jornadaId === jornadaId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalGastos = egresos.reduce((s, e) => s + e.monto, 0);
  return { egresos, totalGastos };
}

/**
 * Returns general egresos (not assigned to any existing jornada).
 * Jornada-assigned egresos are visual-only in Egresos because they already
 * subtract directly from their Jornada total.
 */
export function getGeneralEgresos(
  dataset: BusinessDataset,
  monthPrefix?: string
): Egreso[] {
  const jornadaIdSet = new Set((dataset.jornadas || []).map((j) => j.id));
  return (dataset.egresos || []).filter((e) => {
    if (monthPrefix && !e.fecha.startsWith(monthPrefix)) return false;
    return !e.jornadaId || !jornadaIdSet.has(e.jornadaId);
  });
}

/**
 * Returns egresos assigned to an existing jornada (for visual/informational reporting).
 */
export function getJornadaAssignedEgresos(
  dataset: BusinessDataset,
  monthPrefix?: string
): Egreso[] {
  const jornadaIdSet = new Set((dataset.jornadas || []).map((j) => j.id));
  return (dataset.egresos || []).filter((e) => {
    if (monthPrefix && !e.fecha.startsWith(monthPrefix)) return false;
    return Boolean(e.jornadaId && jornadaIdSet.has(e.jornadaId));
  });
}

/**
 * Resolves ticket ownership across registered Jornadas so that:
 * - Every ticket assigned to an existing Jornada belongs to exactly ONE Jornada.
 * - Tickets belonging to a Jornada are NOT counted individually in income totals;
 *   instead, the Jornada itself counts as ONE consolidated income entry.
 */
export function resolveTicketJornadaOwnership(dataset: BusinessDataset): {
  ticketToJornadaId: Map<string, string>;
  jornadaTicketsMap: Map<string, Ticket[]>;
  standaloneTickets: Ticket[];
} {
  const jornadaIdSet = new Set(dataset.jornadas.map((j) => j.id));
  const folioToJornadaId = new Map<string, string>();

  for (const j of dataset.jornadas) {
    for (const folio of j.ticketFolios || []) {
      if (folio && !folioToJornadaId.has(folio)) {
        folioToJornadaId.set(folio, j.id);
      }
    }
  }

  const ticketToJornadaId = new Map<string, string>();
  const jornadaTicketsMap = new Map<string, Ticket[]>();
  for (const j of dataset.jornadas) {
    jornadaTicketsMap.set(j.id, []);
  }

  const standaloneTickets: Ticket[] = [];

  for (const t of dataset.tickets) {
    let ownerId = '';
    if (t.jornadaId && jornadaIdSet.has(t.jornadaId)) {
      ownerId = t.jornadaId;
    } else if (folioToJornadaId.has(t.folio)) {
      ownerId = folioToJornadaId.get(t.folio)!;
    }

    if (ownerId) {
      ticketToJornadaId.set(t.folio, ownerId);
      const list = jornadaTicketsMap.get(ownerId) || [];
      list.push(t);
      jornadaTicketsMap.set(ownerId, list);
    } else {
      standaloneTickets.push(t);
    }
  }

  return { ticketToJornadaId, jornadaTicketsMap, standaloneTickets };
}

/**
 * Recomputes a Jornada's consolidated totals from the given ticket list.
 */
export function recalculateJornadaFromTickets(
  jornada: Jornada,
  allTickets: Ticket[]
): Jornada {
  const folioSet = new Set(jornada.ticketFolios || []);
  const linked = allTickets.filter(
    (t) => t.jornadaId === jornada.id || (!t.jornadaId && folioSet.has(t.folio))
  );
  return {
    ...jornada,
    ticketFolios: linked.map((t) => t.folio),
    totalTickets: linked.length,
    totalPiezas: linked.reduce((s, t) => s + t.totalPiezas, 0),
    totalImporte: linked.reduce((s, t) => s + t.totalImporte, 0),
  };
}

/**
 * Builds the unified list of consolidated income entries:
 * 1. One entry per registered Jornada (combining all its tickets' totals minus jornada expenses)
 * 2. One entry per standalone Ticket (tickets not assigned to any Jornada)
 * 3. One entry per IngresoOtro (income by other concepts)
 */
export function buildConsolidatedIncomeEntries(
  dataset: BusinessDataset
): ConsolidatedIncomeEntry[] {
  const { jornadaTicketsMap, standaloneTickets } = resolveTicketJornadaOwnership(dataset);
  const entries: ConsolidatedIncomeEntry[] = [];

  for (const j of dataset.jornadas) {
    const linked = (jornadaTicketsMap.get(j.id) || []).sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.folio.localeCompare(a.folio)
    );
    const hasLinked = linked.length > 0;
    const totalBruto = hasLinked
      ? linked.reduce((s, t) => s + t.totalImporte, 0)
      : j.totalImporte;
    const totalPiezas = hasLinked
      ? linked.reduce((s, t) => s + t.totalPiezas, 0)
      : j.totalPiezas;
    const totalTickets = hasLinked ? linked.length : j.totalTickets;
    const { egresos: egresosJornada, totalGastos } = getJornadaExpenses(dataset, j.id);
    const totalNeto = totalBruto - totalGastos;

    entries.push({
      id: j.id,
      kind: 'jornada',
      fecha: j.fecha,
      ruta: j.ruta || 'Sin ruta',
      titulo: j.nombre || `Jornada ${j.ruta}`,
      categoria: j.estado === 'Abierta' ? 'Jornada en curso' : 'Jornada finalizada',
      totalTickets,
      totalPiezas,
      monto: totalNeto,
      montoBruto: totalBruto,
      gastosJornada: totalGastos,
      egresosJornada,
      jornada: j,
      linkedTickets: linked,
    });
  }

  for (const t of standaloneTickets) {
    entries.push({
      id: t.folio,
      kind: 'ticket',
      fecha: t.fecha,
      ruta: t.ruta || 'Sin ruta',
      titulo: `${t.folio} · ${t.clienteNombre}`,
      categoria: 'Ticket directo',
      totalTickets: 1,
      totalPiezas: t.totalPiezas,
      monto: t.totalImporte,
      ticket: t,
    });
  }

  for (const ing of dataset.otrosIngresos || []) {
    entries.push({
      id: ing.id,
      kind: 'otro_ingreso',
      fecha: ing.fecha,
      ruta: '',
      titulo: ing.concepto,
      categoria: ing.categoria || 'Otro ingreso',
      totalTickets: 0,
      totalPiezas: 0,
      monto: ing.monto,
      ingresoOtro: ing,
    });
  }

  return entries.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
}

/**
 * Computes consolidated income metrics for an optional YYYY-MM prefix (or full history).
 */
export function computeIncomeSummaryForPeriod(
  dataset: BusinessDataset,
  monthPrefix?: string
): PeriodIncomeSummary {
  const allEntries = buildConsolidatedIncomeEntries(dataset);
  const scoped = monthPrefix
    ? allEntries.filter((e) => e.fecha.startsWith(monthPrefix))
    : allEntries;

  let ingresosJornadas = 0;
  let ventasBrutasJornadas = 0;
  let gastosJornadas = 0;
  let countJornadas = 0;
  let piezasJornadas = 0;
  let ticketsEnJornadas = 0;

  let ingresosTicketsDirectos = 0;
  let countTicketsDirectos = 0;
  let piezasTicketsDirectos = 0;

  let ingresosOtros = 0;
  let countOtros = 0;

  for (const e of scoped) {
    if (e.kind === 'jornada') {
      ingresosJornadas += e.monto;
      ventasBrutasJornadas += e.montoBruto ?? e.monto;
      gastosJornadas += e.gastosJornada ?? 0;
      countJornadas += 1;
      piezasJornadas += e.totalPiezas;
      ticketsEnJornadas += e.totalTickets;
    } else if (e.kind === 'ticket') {
      ingresosTicketsDirectos += e.monto;
      countTicketsDirectos += 1;
      piezasTicketsDirectos += e.totalPiezas;
    } else {
      ingresosOtros += e.monto;
      countOtros += 1;
    }
  }

  return {
    ingresosJornadas,
    ventasBrutasJornadas,
    gastosJornadas,
    countJornadas,
    piezasJornadas,
    ticketsEnJornadas,
    ingresosTicketsDirectos,
    countTicketsDirectos,
    piezasTicketsDirectos,
    ingresosOtros,
    countOtros,
    totalIngresos: ingresosJornadas + ingresosTicketsDirectos + ingresosOtros,
    totalPiezasVendidas: piezasJornadas + piezasTicketsDirectos,
    totalRegistrosIngreso: countJornadas + countTicketsDirectos + countOtros,
  };
}
