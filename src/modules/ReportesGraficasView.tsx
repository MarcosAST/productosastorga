import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  BarChart3,
  FileSpreadsheet,
  Table2,
  Plus,
  Edit2,
  Copy,
  Trash2,
  Download,
  Search,
  ArrowUpDown,
  CloudUpload,
} from 'lucide-react';
import { BusinessDataset } from '../types/business';
import {
  formatCurrency,
  formatDateShort,
  formatMonthLabel,
  formatNumber,
  getCurrentMonthISO,
  normalizeText,
} from '../utils/formatters';
import {
  buildConsolidatedIncomeEntries,
  computeIncomeSummaryForPeriod,
  getGeneralEgresos,
  getJornadaAssignedEgresos,
} from '../utils/incomeConsolidation';
import { getTicketItemSalesStatsDelta } from '../utils/ticketAdjustments';
import {
  computeCustomChartData,
  CustomChartConfig,
  downloadCsv,
  loadCustomCharts,
  saveCustomCharts,
} from '../utils/customCharts';
import {
  CustomChartBuilderModal,
  CustomChartRenderer,
} from '../components/CustomChartBuilderModal';

interface ReportesGraficasViewProps {
  dataset: BusinessDataset;
  customCharts?: CustomChartConfig[];
  onChangeCustomCharts?: (next: CustomChartConfig[]) => void;
  onOpenSyncBackup?: () => void;
}

const CHART_COLORS = ['#4A2511', '#D98218', '#8C4A1F', '#E6A957', '#2E5E4E', '#7A6B63'];

type ReportSubTab = 'graficas' | 'estado_resultados' | 'tablas';
type TableReportKind = 'consolidado' | 'rutas' | 'productos' | 'mensual' | 'gastos';

interface TableColumnDef {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: 'currency' | 'number' | 'percent' | 'date' | 'text';
}

interface TableConfigResult {
  columns: TableColumnDef[];
  rows: Record<string, any>[];
  totals: Record<string, string | number>;
  defaultSortKey: string;
}

export const ReportesGraficasView: React.FC<ReportesGraficasViewProps> = ({
  dataset,
  customCharts: controlledCharts,
  onChangeCustomCharts,
  onOpenSyncBackup,
}) => {
  const [periodMode, setPeriodMode] = useState<'mes' | 'todo'>('mes');
  const [selectedMes, setSelectedMes] = useState(getCurrentMonthISO());
  const [activeSubTab, setActiveSubTab] = useState<ReportSubTab>('graficas');

  // Custom Charts state (uses lifted state when provided)
  const [localCharts, setLocalCharts] = useState<CustomChartConfig[]>(() =>
    loadCustomCharts()
  );
  const customCharts = controlledCharts ?? localCharts;
  const setCustomChartsList = (next: CustomChartConfig[]) => {
    if (onChangeCustomCharts) {
      onChangeCustomCharts(next);
    } else {
      setLocalCharts(next);
      saveCustomCharts(next);
    }
  };
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingChart, setEditingChart] = useState<CustomChartConfig | null>(null);

  // Detailed Tables state
  const [selectedTable, setSelectedTable] = useState<TableReportKind>('consolidado');
  const [tableSearch, setTableSearch] = useState('');
  const [sortCol, setSortCol] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const activeMonthPrefix = periodMode === 'mes' ? selectedMes : undefined;
  const periodLabel =
    periodMode === 'mes' ? formatMonthLabel(selectedMes) : 'Histórico completo';

  const consolidatedEntries = useMemo(
    () => buildConsolidatedIncomeEntries(dataset),
    [dataset]
  );

  const scopedConsolidatedEntries = useMemo(() => {
    if (!activeMonthPrefix) return consolidatedEntries;
    return consolidatedEntries.filter((e) => e.fecha.startsWith(activeMonthPrefix));
  }, [consolidatedEntries, activeMonthPrefix]);

  const scopedTickets = useMemo(() => {
    if (!activeMonthPrefix) return dataset.tickets;
    return dataset.tickets.filter((t) => t.fecha.startsWith(activeMonthPrefix));
  }, [dataset.tickets, activeMonthPrefix]);

  const scopedOtrosIngresos = useMemo(() => {
    const list = dataset.otrosIngresos || [];
    if (!activeMonthPrefix) return list;
    return list.filter((o) => o.fecha.startsWith(activeMonthPrefix));
  }, [dataset.otrosIngresos, activeMonthPrefix]);

  const scopedGeneralEgresos = useMemo(
    () => getGeneralEgresos(dataset, activeMonthPrefix),
    [dataset, activeMonthPrefix]
  );

  const scopedJornadaEgresos = useMemo(
    () => getJornadaAssignedEgresos(dataset, activeMonthPrefix),
    [dataset, activeMonthPrefix]
  );

  const scopedSueldos = useMemo(() => {
    if (!activeMonthPrefix) return dataset.sueldos;
    return dataset.sueldos.filter((s) => s.fecha.startsWith(activeMonthPrefix));
  }, [dataset.sueldos, activeMonthPrefix]);

  const incomeSummary = useMemo(
    () => computeIncomeSummaryForPeriod(dataset, activeMonthPrefix),
    [dataset, activeMonthPrefix]
  );

  const kpis = useMemo(() => {
    const egresos = scopedGeneralEgresos.reduce((s, e) => s + e.monto, 0);
    const sueldos = scopedSueldos.reduce((s, su) => s + su.monto, 0);
    const utilidadPreliminar = incomeSummary.totalIngresos - egresos;
    const utilidadNeta = utilidadPreliminar;
    const margenNeto =
      incomeSummary.totalIngresos > 0
        ? (utilidadNeta / incomeSummary.totalIngresos) * 100
        : 0;
    const margenPreliminar = margenNeto;

    return {
      ingresos: incomeSummary.totalIngresos,
      piezas: incomeSummary.totalPiezasVendidas,
      egresos,
      sueldos,
      utilidadPreliminar,
      utilidadNeta,
      margenPreliminar,
      margenNeto,
    };
  }, [incomeSummary, scopedGeneralEgresos, scopedSueldos]);

  // Predetermined Chart 1: Consolidated Income by Route (Jornadas + Direct Tickets)
  const ventasPorRuta = useMemo(() => {
    const map = new Map<
      string,
      { ruta: string; ventas: number; piezas: number; jornadas: number; directos: number }
    >();
    for (const e of scopedConsolidatedEntries) {
      if (e.kind === 'otro_ingreso') continue;
      const key = e.ruta || 'Sin ruta';
      const curr = map.get(key) || {
        ruta: key,
        ventas: 0,
        piezas: 0,
        jornadas: 0,
        directos: 0,
      };
      curr.ventas += e.monto;
      curr.piezas += e.totalPiezas;
      if (e.kind === 'jornada') curr.jornadas += 1;
      else curr.directos += 1;
      map.set(key, curr);
    }
    return Array.from(map.values()).sort((a, b) => b.ventas - a.ventas);
  }, [scopedConsolidatedEntries]);

  // Predetermined Chart 2 & P&L 6-month comparison: Monthly Consolidated Income vs Expenses + Salaries
  const mensualComparativa = useMemo(() => {
    const map = new Map<
      string,
      {
        mes: string;
        label: string;
        ingresosJornadas: number;
        ingresosDirectos: number;
        ingresosOtros: number;
        ingresos: number;
        egresosOp: number;
        sueldos: number;
        egresos: number;
        utilidadPreliminar: number;
        utilidadNeta: number;
        margenNeto: number;
      }
    >();
    const touchMonth = (mes: string) => {
      if (!mes || mes.length < 7) return null;
      const m = mes.slice(0, 7);
      if (!map.has(m)) {
        map.set(m, {
          mes: m,
          label: formatMonthLabel(m).slice(0, 8),
          ingresosJornadas: 0,
          ingresosDirectos: 0,
          ingresosOtros: 0,
          ingresos: 0,
          egresosOp: 0,
          sueldos: 0,
          egresos: 0,
          utilidadPreliminar: 0,
          utilidadNeta: 0,
          margenNeto: 0,
        });
      }
      return map.get(m)!;
    };

    consolidatedEntries.forEach((e) => {
      const entry = touchMonth(e.fecha);
      if (!entry) return;
      entry.ingresos += e.monto;
      if (e.kind === 'jornada') entry.ingresosJornadas += e.monto;
      else if (e.kind === 'ticket') entry.ingresosDirectos += e.monto;
      else entry.ingresosOtros += e.monto;
    });
    getGeneralEgresos(dataset).forEach((e) => {
      const entry = touchMonth(e.fecha);
      if (!entry) return;
      entry.egresosOp += e.monto;
      entry.egresos += e.monto;
    });
    dataset.sueldos.forEach((s) => {
      const entry = touchMonth(s.fecha);
      if (!entry) return;
      entry.sueldos += s.monto;
      entry.egresos += s.monto;
    });

    const list = Array.from(map.values()).map((row) => {
      const utilidadPreliminar = row.ingresos - row.egresosOp;
      const utilidadNeta = utilidadPreliminar;
      const margenNeto = row.ingresos > 0 ? (utilidadNeta / row.ingresos) * 100 : 0;
      return { ...row, utilidadPreliminar, utilidadNeta, margenNeto };
    });

    return list.sort((a, b) => a.mes.localeCompare(b.mes));
  }, [consolidatedEntries, dataset]);

  const mensualUltimos6 = useMemo(() => mensualComparativa.slice(-6), [mensualComparativa]);

  // Predetermined Chart 3: Top 8 products by pieces sold
  const topProductos = useMemo(() => {
    const map = new Map<string, { nombre: string; piezas: number; importe: number }>();
    for (const t of scopedTickets) {
      for (const it of t.items) {
        const delta = getTicketItemSalesStatsDelta(it);
        const curr = map.get(it.productoNombre) || {
          nombre: it.productoNombre,
          piezas: 0,
          importe: 0,
        };
        curr.piezas += delta.piezasVendidas;
        curr.importe += delta.importe;
        map.set(it.productoNombre, curr);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.piezas - a.piezas)
      .slice(0, 8);
  }, [scopedTickets]);

  // Predetermined Chart 4 & P&L breakdown: General Expenses by Category
  const egresosPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of scopedGeneralEgresos) {
      const cat = e.categoria || 'Otros';
      map.set(cat, (map.get(cat) || 0) + e.monto);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [scopedGeneralEgresos]);

  // P&L breakdowns: Otros ingresos by category & Sueldos by worker
  const otrosIngresosPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of scopedOtrosIngresos) {
      const cat = o.categoria || 'Otros ingresos';
      map.set(cat, (map.get(cat) || 0) + o.monto);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [scopedOtrosIngresos]);

  const sueldosPorTrabajador = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scopedSueldos) {
      const name = s.trabajador || 'Personal';
      map.set(name, (map.get(name) || 0) + s.monto);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [scopedSueldos]);

  const currentFinanzaMes = useMemo(() => {
    if (periodMode !== 'mes') return null;
    return dataset.finanzasMensuales.find((f) => f.mes === selectedMes) || null;
  }, [dataset.finanzasMensuales, periodMode, selectedMes]);

  // Custom chart CRUD handlers
  const handleSaveCustomChart = (chart: CustomChartConfig) => {
    const exists = customCharts.some((c) => c.id === chart.id);
    const next = exists
      ? customCharts.map((c) => (c.id === chart.id ? chart : c))
      : [...customCharts, chart];
    setCustomChartsList(next);
    setEditingChart(null);
  };

  const handleDuplicateCustomChart = (chart: CustomChartConfig) => {
    const copy: CustomChartConfig = {
      ...chart,
      id: `CHART-${Date.now()}`,
      titulo: `${chart.titulo} (copia)`,
      createdAt: new Date().toISOString(),
    };
    const next = [...customCharts, copy];
    setCustomChartsList(next);
  };

  const handleDeleteCustomChart = (id: string) => {
    const next = customCharts.filter((c) => c.id !== id);
    setCustomChartsList(next);
  };

  // Export P&L CSV
  const handleExportEstadoResultadosCsv = () => {
    const base = incomeSummary.totalIngresos || 0;
    const pct = (val: number) =>
      base > 0 ? `${((val / base) * 100).toFixed(1)}%` : '0.0%';

    const rows: (string | number)[][] = [
      ['INGRESOS OPERATIVOS', '', ''],
      [
        `Ventas en Jornadas consolidadas (${incomeSummary.countJornadas} jornadas, ${incomeSummary.ticketsEnJornadas} tickets${
          incomeSummary.gastosJornadas > 0
            ? `, bruto ${formatCurrency(incomeSummary.ventasBrutasJornadas)} − gastos ${formatCurrency(
                incomeSummary.gastosJornadas
              )}`
            : ''
        })`,
        incomeSummary.ingresosJornadas.toFixed(2),
        pct(incomeSummary.ingresosJornadas),
      ],
      [
        `Ventas por Tickets directos (${incomeSummary.countTicketsDirectos} tickets)`,
        incomeSummary.ingresosTicketsDirectos.toFixed(2),
        pct(incomeSummary.ingresosTicketsDirectos),
      ],
      [
        `Ingresos por otros conceptos (${incomeSummary.countOtros} registros)`,
        incomeSummary.ingresosOtros.toFixed(2),
        pct(incomeSummary.ingresosOtros),
      ],
      ...otrosIngresosPorCategoria.map((c) => [
        `  - ${c.name}`,
        c.value.toFixed(2),
        pct(c.value),
      ]),
      ['TOTAL INGRESOS NETOS', incomeSummary.totalIngresos.toFixed(2), '100.0%'],
      ['', '', ''],
      ['EGRESOS OPERATIVOS', '', ''],
      ...egresosPorCategoria.map((c) => [
        `  - ${c.name}`,
        c.value.toFixed(2),
        pct(c.value),
      ]),
      ['TOTAL EGRESOS OPERATIVOS', kpis.egresos.toFixed(2), pct(kpis.egresos)],
      ['UTILIDAD NETA DEL PERIODO (Ingresos - Egresos)', kpis.utilidadNeta.toFixed(2), pct(kpis.utilidadNeta)],
      ['', '', ''],
      ['SUELDOS (REGISTRO SEPARADO — SALEN DE UTILIDAD)', '', ''],
      ...sueldosPorTrabajador.map((s) => [
        `  - ${s.name}`,
        s.value.toFixed(2),
        pct(s.value),
      ]),
      ['TOTAL SUELDOS (SEPARADO)', kpis.sueldos.toFixed(2), pct(kpis.sueldos)],
    ];

    if (periodMode === 'mes') {
      const fondoBase = currentFinanzaMes?.fondoBase ?? 0;
      rows.push(['', '', '']);
      rows.push(['Fondo base del mes', fondoBase.toFixed(2), '']);
      rows.push([
        'Fondo total acumulado',
        (fondoBase + kpis.ingresos - kpis.egresos - kpis.sueldos).toFixed(2),
        '',
      ]);
    }

    downloadCsv(
      `estado_resultados_${periodMode === 'mes' ? selectedMes : 'historico'}.csv`,
      ['Rubro', 'Monto (MXN)', '% sobre Ingresos'],
      rows
    );
  };

  // Detailed Table configuration & data
  const tableConfig = useMemo<TableConfigResult>((): TableConfigResult => {
    if (selectedTable === 'consolidado') {
      const rows = scopedConsolidatedEntries.map((e) => ({
        fecha: e.fecha,
        tipo:
          e.kind === 'jornada'
            ? 'Jornada completa'
            : e.kind === 'ticket'
            ? 'Ticket directo'
            : 'Otro ingreso',
        descripcion: e.titulo,
        ruta: e.ruta || '—',
        tickets: e.totalTickets,
        piezas: e.totalPiezas,
        monto: e.monto,
      }));
      return {
        defaultSortKey: 'fecha',
        columns: [
          { key: 'fecha', label: 'Fecha', format: 'date' },
          { key: 'tipo', label: 'Tipo', format: 'text' },
          { key: 'descripcion', label: 'Concepto / Jornada', format: 'text' },
          { key: 'ruta', label: 'Ruta', format: 'text' },
          { key: 'tickets', label: 'Tickets', align: 'right', format: 'number' },
          { key: 'piezas', label: 'Piezas', align: 'right', format: 'number' },
          { key: 'monto', label: 'Importe', align: 'right', format: 'currency' },
        ],
        rows,
        totals: {
          fecha: 'TOTAL',
          tipo: `${rows.length} reg.`,
          descripcion: '',
          ruta: '',
          tickets: rows.reduce((s, r) => s + r.tickets, 0),
          piezas: rows.reduce((s, r) => s + r.piezas, 0),
          monto: rows.reduce((s, r) => s + r.monto, 0),
        },
      };
    }

    if (selectedTable === 'rutas') {
      const totalV = ventasPorRuta.reduce((s, r) => s + r.ventas, 0);
      const rows = ventasPorRuta.map((r) => ({
        ruta: r.ruta,
        jornadas: r.jornadas,
        directos: r.directos,
        piezas: r.piezas,
        ventas: r.ventas,
        participacion: totalV > 0 ? (r.ventas / totalV) * 100 : 0,
      }));
      return {
        defaultSortKey: 'ventas',
        columns: [
          { key: 'ruta', label: 'Ruta', format: 'text' },
          { key: 'jornadas', label: 'Jornadas', align: 'right', format: 'number' },
          { key: 'directos', label: 'Tickets directos', align: 'right', format: 'number' },
          { key: 'piezas', label: 'Piezas', align: 'right', format: 'number' },
          { key: 'ventas', label: 'Ingresos', align: 'right', format: 'currency' },
          { key: 'participacion', label: '% Part.', align: 'right', format: 'percent' },
        ],
        rows,
        totals: {
          ruta: 'TOTAL',
          jornadas: rows.reduce((s, r) => s + r.jornadas, 0),
          directos: rows.reduce((s, r) => s + r.directos, 0),
          piezas: rows.reduce((s, r) => s + r.piezas, 0),
          ventas: totalV,
          participacion: totalV > 0 ? 100 : 0,
        },
      };
    }

    if (selectedTable === 'productos') {
      const salesByProd = new Map<string, { piezas: number; importe: number }>();
      for (const t of scopedTickets) {
        for (const it of t.items) {
          const delta = getTicketItemSalesStatsDelta(it);
          const key = normalizeText(it.productoNombre);
          const curr = salesByProd.get(key) || { piezas: 0, importe: 0 };
          curr.piezas += delta.piezasVendidas;
          curr.importe += delta.importe;
          salesByProd.set(key, curr);
        }
      }
      const rows = dataset.productos.map((p) => {
        const s = salesByProd.get(normalizeText(p.nombre)) || { piezas: 0, importe: 0 };
        const stock = p.inventario ?? 0;
        return {
          nombre: p.nombre,
          categoria: p.categoria || 'General',
          piezasVendidas: s.piezas,
          ventasImporte: s.importe,
          stock,
          valorStock: stock * p.precioMayoreo,
        };
      });
      return {
        defaultSortKey: 'ventasImporte',
        columns: [
          { key: 'nombre', label: 'Producto', format: 'text' },
          { key: 'categoria', label: 'Categoría', format: 'text' },
          { key: 'piezasVendidas', label: 'Pzas vendidas', align: 'right', format: 'number' },
          { key: 'ventasImporte', label: 'Ventas ($)', align: 'right', format: 'currency' },
          { key: 'stock', label: 'Stock actual', align: 'right', format: 'number' },
          { key: 'valorStock', label: 'Valor stock', align: 'right', format: 'currency' },
        ],
        rows,
        totals: {
          nombre: 'TOTAL',
          categoria: `${rows.length} prod.`,
          piezasVendidas: rows.reduce((s, r) => s + r.piezasVendidas, 0),
          ventasImporte: rows.reduce((s, r) => s + r.ventasImporte, 0),
          stock: rows.reduce((s, r) => s + r.stock, 0),
          valorStock: rows.reduce((s, r) => s + r.valorStock, 0),
        },
      };
    }

    if (selectedTable === 'mensual') {
      const finByMonth = new Map(dataset.finanzasMensuales.map((f) => [f.mes, f]));
      const rows = mensualComparativa.map((m) => {
        const fin = finByMonth.get(m.mes);
        const fondoBase = fin?.fondoBase ?? 0;
        return {
          mes: m.mes,
          fondoBase,
          ingresos: m.ingresos,
          egresosOp: m.egresosOp,
          sueldos: m.sueldos,
          utilidadNeta: m.utilidadNeta,
          fondoTotal: fondoBase + m.ingresos - m.egresosOp - m.sueldos,
        };
      });
      return {
        defaultSortKey: 'mes',
        columns: [
          { key: 'mes', label: 'Mes', format: 'text' },
          { key: 'fondoBase', label: 'Fondo base', align: 'right', format: 'currency' },
          { key: 'ingresos', label: 'Ingresos', align: 'right', format: 'currency' },
          { key: 'egresosOp', label: 'Egresos', align: 'right', format: 'currency' },
          { key: 'sueldos', label: 'Sueldos', align: 'right', format: 'currency' },
          { key: 'utilidadNeta', label: 'Utilidad neta', align: 'right', format: 'currency' },
          { key: 'fondoTotal', label: 'Fondo total', align: 'right', format: 'currency' },
        ],
        rows,
        totals: {
          mes: 'TOTAL',
          fondoBase: '—',
          ingresos: rows.reduce((s, r) => s + r.ingresos, 0),
          egresosOp: rows.reduce((s, r) => s + r.egresosOp, 0),
          sueldos: rows.reduce((s, r) => s + r.sueldos, 0),
          utilidadNeta: rows.reduce((s, r) => s + r.utilidadNeta, 0),
          fondoTotal: '—',
        },
      };
    }

    // 'gastos': Egresos + Sueldos (Jornada expenses annotated as visual only)
    const jornadaNameMap = new Map(dataset.jornadas.map((j) => [j.id, j.nombre]));
    const rows = [
      ...scopedGeneralEgresos.map((e) => ({
        fecha: e.fecha,
        tipo: 'Egreso operativo',
        responsable: e.categoria,
        concepto: e.concepto,
        notas: e.notas || '—',
        monto: e.monto,
      })),
      ...scopedJornadaEgresos.map((e) => ({
        fecha: e.fecha,
        tipo: 'Egreso en jornada (solo visual)',
        responsable: e.categoria,
        concepto: e.concepto,
        notas: `Restado en ${jornadaNameMap.get(e.jornadaId || '') || 'jornada'}${
          e.notas ? ` · ${e.notas}` : ''
        }`,
        monto: e.monto,
      })),
      ...scopedSueldos.map((s) => ({
        fecha: s.fecha,
        tipo: 'Sueldo / Nómina',
        responsable: s.trabajador,
        concepto: s.concepto,
        notas: s.notas || '—',
        monto: s.monto,
      })),
    ];
    return {
      defaultSortKey: 'fecha',
      columns: [
        { key: 'fecha', label: 'Fecha', format: 'date' },
        { key: 'tipo', label: 'Tipo', format: 'text' },
        { key: 'responsable', label: 'Categoría / Trabajador', format: 'text' },
        { key: 'concepto', label: 'Concepto', format: 'text' },
        { key: 'notas', label: 'Notas', format: 'text' },
        { key: 'monto', label: 'Monto', align: 'right', format: 'currency' },
      ],
      rows,
      totals: {
        fecha: 'TOTAL',
        tipo: `${rows.length} reg.`,
        responsable: '',
        concepto: '',
        notas:
          scopedJornadaEgresos.length > 0
            ? 'Total excluye gastos ya descontados en jornadas'
            : '',
        monto: kpis.egresos + kpis.sueldos,
      },
    };
  }, [
    selectedTable,
    scopedConsolidatedEntries,
    ventasPorRuta,
    scopedTickets,
    dataset.productos,
    dataset.finanzasMensuales,
    dataset.jornadas,
    mensualComparativa,
    scopedGeneralEgresos,
    scopedJornadaEgresos,
    scopedSueldos,
    kpis.egresos,
    kpis.sueldos,
  ]);

  const sortedFilteredRows = useMemo(() => {
    const q = normalizeText(tableSearch);
    const filtered = q
      ? tableConfig.rows.filter((row) =>
          Object.values(row).some((val) => normalizeText(String(val ?? '')).includes(q))
        )
      : tableConfig.rows;

    const activeKey =
      sortCol && tableConfig.columns.some((c) => c.key === sortCol)
        ? sortCol
        : tableConfig.defaultSortKey;

    return [...filtered].sort((a, b) => {
      const va = a[activeKey];
      const vb = b[activeKey];
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va ?? '').localeCompare(String(vb ?? ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tableConfig, tableSearch, sortCol, sortDir]);

  const handleSortCol = (key: string) => {
    if (sortCol === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('desc');
    }
  };

  const formatCellValue = (val: any, fmt?: TableColumnDef['format']) => {
    if (val === '—' || val === '') return '—';
    if (fmt === 'currency') return formatCurrency(Number(val));
    if (fmt === 'number') return formatNumber(Number(val));
    if (fmt === 'percent') return `${Number(val).toFixed(1)}%`;
    if (fmt === 'date') return formatDateShort(String(val));
    return String(val ?? '');
  };

  const handleExportTableCsv = () => {
    downloadCsv(
      `tabla_${selectedTable}_${periodMode === 'mes' ? selectedMes : 'historico'}.csv`,
      tableConfig.columns.map((c) => c.label),
      sortedFilteredRows.map((row) =>
        tableConfig.columns.map((col) => {
          const val = row[col.key];
          if (col.format === 'currency') return Number(val).toFixed(2);
          if (col.format === 'percent') return `${Number(val).toFixed(1)}%`;
          return val ?? '';
        })
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Header + Period controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F1A17]">Reportes y gráficas</h1>
          <p className="text-sm text-[#6E6259]">
            Gráficas predeterminadas, constructor de gráficas propias, estado de resultados y tablas exportables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-1 rounded-xl bg-[#EFECE6]">
            <button
              type="button"
              onClick={() => setPeriodMode('mes')}
              className={`min-h-[38px] px-3.5 py-1 rounded-lg text-xs font-semibold ${
                periodMode === 'mes' ? 'bg-white text-[#1F1A17] shadow-xs' : 'text-[#6E6259]'
              }`}
            >
              Por mes
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('todo')}
              className={`min-h-[38px] px-3.5 py-1 rounded-lg text-xs font-semibold ${
                periodMode === 'todo' ? 'bg-white text-[#1F1A17] shadow-xs' : 'text-[#6E6259]'
              }`}
            >
              Histórico completo
            </button>
          </div>
          {periodMode === 'mes' && (
            <input
              type="month"
              value={selectedMes}
              onChange={(e) => setSelectedMes(e.target.value)}
              className="h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs font-semibold text-[#1F1A17]"
            />
          )}
        </div>
      </div>

      {/* Consolidated KPI Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
          <p className="text-xs font-medium text-[#6E6259]">Ingresos consolidados</p>
          <p className="text-xl sm:text-2xl font-bold text-[#1F1A17] tabular-nums mt-1">
            {formatCurrency(kpis.ingresos)}
          </p>
          <p className="text-xs text-[#8C7E73] tabular-nums mt-0.5">
            {incomeSummary.countJornadas} jor. · {incomeSummary.countTicketsDirectos} dir. ·{' '}
            {incomeSummary.countOtros} otros
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
          <p className="text-xs font-medium text-[#6E6259]">Piezas vendidas</p>
          <p className="text-xl sm:text-2xl font-bold text-[var(--theme-primary)] tabular-nums mt-1">
            {formatNumber(kpis.piezas)}
          </p>
          <p className="text-xs text-[#8C7E73] mt-0.5">
            Jornadas + tickets directos
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
          <p className="text-xs font-medium text-[#6E6259]">Egresos</p>
          <p className="text-xl sm:text-2xl font-bold text-[#B91C1C] tabular-nums mt-1">
            {formatCurrency(kpis.egresos)}
          </p>
          <p className="text-xs text-[#8C7E73] mt-0.5">
            Solo gastos operativos
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
          <p className="text-xs font-medium text-[#6E6259]">Utilidad neta</p>
          <p
            className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${
              kpis.utilidadNeta >= 0 ? 'text-emerald-700' : 'text-[#B91C1C]'
            }`}
          >
            {formatCurrency(kpis.utilidadNeta)}
          </p>
          <p className="text-xs text-[#8C7E73] tabular-nums mt-0.5">
            Ingresos − Egresos ({kpis.margenNeto.toFixed(1)}%)
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl bg-[#FAF8F5] border border-[#E7E3DC] p-4">
          <p className="text-xs font-medium text-[#6E6259]">Sueldos (separado)</p>
          <p className="text-xl sm:text-2xl font-bold text-[var(--theme-accent)] tabular-nums mt-1">
            {formatCurrency(kpis.sueldos)}
          </p>
          <p className="text-xs text-[#8C7E73] mt-0.5">
            Salen de utilidad (no restan)
          </p>
        </div>
      </section>

      {/* Sub-navigation Tabs */}
      <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-[#EFECE6] gap-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('graficas')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'graficas'
              ? 'bg-white text-[#1F1A17] shadow-xs'
              : 'text-[#6E6259] hover:text-[#1F1A17]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Gráficas ({4 + customCharts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('estado_resultados')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'estado_resultados'
              ? 'bg-white text-[#1F1A17] shadow-xs'
              : 'text-[#6E6259] hover:text-[#1F1A17]'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Estado de Resultados</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('tablas')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'tablas'
              ? 'bg-white text-[#1F1A17] shadow-xs'
              : 'text-[#6E6259] hover:text-[#1F1A17]'
          }`}
        >
          <Table2 className="w-3.5 h-3.5" />
          <span>Tablas detalladas</span>
        </button>
      </div>

      {/* TAB 1: GRÁFICAS (CUSTOM + PREDETERMINED) */}
      {activeSubTab === 'graficas' && (
        <div className="space-y-6">
          {/* Custom User-Built Charts Section */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#1F1A17]">
                  Mis gráficas personalizadas ({customCharts.length})
                </h2>
                <p className="text-xs text-[#6E6259]">
                  Crea tus propias gráficas eligiendo fuente de datos, agrupación, tipo y color. Se actualizan automáticamente con tus registros.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                {onOpenSyncBackup && (
                  <button
                    type="button"
                    onClick={onOpenSyncBackup}
                    className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-xs font-semibold text-[#1F1A17] hover:bg-[#FAF8F5]"
                  >
                    <CloudUpload className="w-4 h-4 text-[var(--theme-accent)]" />
                    <span>Respaldar / Sincronizar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingChart(null);
                    setBuilderOpen(true);
                  }}
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--theme-primary-hover)]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear mi gráfica</span>
                </button>
              </div>
            </div>

            {customCharts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#D8D1C7] bg-white p-6 text-center space-y-2.5">
                <p className="text-sm font-semibold text-[#1F1A17]">
                  Aún no has creado gráficas personalizadas
                </p>
                <p className="text-xs text-[#6E6259] max-w-md mx-auto">
                  Diseña gráficas de barras, líneas, área o pastel sobre ventas por cliente, inventario, otros ingresos, sueldos o utilidad mensual.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingChart(null);
                    setBuilderOpen(true);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-tint)] border border-[#D8D1C7] px-4 text-xs font-bold text-[var(--theme-primary)] hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear primera gráfica</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {customCharts.map((chart) => {
                  const data = computeCustomChartData(chart, dataset, activeMonthPrefix);
                  return (
                    <section
                      key={chart.id}
                      className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-[#1F1A17] truncate">
                            {chart.titulo}
                          </h3>
                          <p className="text-[11px] text-[#8C7E73]">
                            Personalizada · {data.length} elemento(s) · {periodLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingChart(chart);
                              setBuilderOpen(true);
                            }}
                            title="Editar gráfica"
                            aria-label={`Editar ${chart.titulo}`}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-[#6E6259] hover:bg-[#FAF8F5] hover:text-[var(--theme-primary)]"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateCustomChart(chart)}
                            title="Duplicar gráfica"
                            aria-label={`Duplicar ${chart.titulo}`}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-[#6E6259] hover:bg-[#FAF8F5] hover:text-[var(--theme-primary)]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomChart(chart.id)}
                            title="Eliminar gráfica"
                            aria-label={`Eliminar ${chart.titulo}`}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-[#8C7E73] hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <CustomChartRenderer config={chart} data={data} heightClass="h-72" />
                    </section>
                  );
                })}
              </div>
            )}
          </section>

          {/* Predetermined Charts Section */}
          <section className="space-y-4">
            <h2 className="text-base font-bold text-[#1F1A17]">
              Gráficas predeterminadas del negocio
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Consolidated Income by Route */}
              <section className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-[#1F1A17]">
                    Ingresos consolidados por ruta ($)
                  </h3>
                  <p className="text-xs text-[#8C7E73]">
                    Suma jornadas completas + tickets directos (sin duplicar tickets dentro de jornadas).
                  </p>
                </div>
                {ventasPorRuta.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-sm text-[#6E6259]">
                    Sin datos de ventas en este periodo.
                  </div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={ventasPorRuta}
                        margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                        <XAxis dataKey="ruta" tick={{ fontSize: 12, fill: '#6E6259' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#6E6259' }} />
                        <Tooltip
                          formatter={(val: any) => [formatCurrency(Number(val)), 'Ingresos']}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #E7E3DC',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="ventas" fill="var(--theme-primary)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              {/* Chart 2: Monthly Consolidated Income vs Expenses vs Salaries (separated) */}
              <section className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-[#1F1A17]">
                    Ingresos vs. Egresos vs. Sueldos (últimos meses)
                  </h3>
                  <p className="text-xs text-[#8C7E73]">
                    Muestra ingresos consolidados, egresos operativos y sueldos por separado.
                  </p>
                </div>
                {mensualUltimos6.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-sm text-[#6E6259]">
                    Registra ventas o gastos para visualizar la comparativa mensual.
                  </div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={mensualUltimos6}
                        margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6E6259' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#6E6259' }} />
                        <Tooltip
                          formatter={(val: any, name: any) => [
                            formatCurrency(Number(val)),
                            name === 'ingresos'
                              ? 'Ingresos totales'
                              : name === 'egresosOp'
                              ? 'Egresos'
                              : 'Sueldos (separado)',
                          ]}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #E7E3DC',
                            fontSize: '12px',
                          }}
                        />
                        <Legend
                          formatter={(value) =>
                            value === 'ingresos'
                              ? 'Ingresos'
                              : value === 'egresosOp'
                              ? 'Egresos'
                              : 'Sueldos'
                          }
                        />
                        <Bar dataKey="ingresos" fill="#15803D" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="egresosOp" fill="#B91C1C" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="sueldos" fill="var(--theme-accent)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              {/* Chart 3: Top Products */}
              <section className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4">
                <h3 className="text-base font-bold text-[#1F1A17]">
                  Productos más vendidos (piezas)
                </h3>
                {topProductos.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-sm text-[#6E6259]">
                    Sin piezas vendidas en este periodo.
                  </div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topProductos}
                        layout="vertical"
                        margin={{ top: 8, right: 16, left: 12, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#6E6259' }} />
                        <YAxis
                          type="category"
                          dataKey="nombre"
                          width={120}
                          tick={{ fontSize: 11, fill: '#1F1A17' }}
                        />
                        <Tooltip
                          formatter={(val: any) => [formatNumber(Number(val)), 'Piezas']}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #E7E3DC',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="piezas" fill="var(--theme-accent)" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              {/* Chart 4: Expenses by Category */}
              <section className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4">
                <h3 className="text-base font-bold text-[#1F1A17]">Distribución de gastos</h3>
                {egresosPorCategoria.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-sm text-[#6E6259]">
                    Sin egresos registrados en este periodo.
                  </div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={egresosPorCategoria}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name }) => name}
                        >
                          {egresosPorCategoria.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any) => [formatCurrency(Number(val)), 'Monto']}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #E7E3DC',
                            fontSize: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: ESTADO DE RESULTADOS */}
      {activeSubTab === 'estado_resultados' && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFECE6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#1F1A17]">
                  Estado de Resultados · {periodLabel}
                </h2>
                <p className="text-xs text-[#6E6259]">
                  Resumen contable consolidado (Jornadas como ingreso único + Tickets directos + Otros ingresos − Egresos − Sueldos).
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportEstadoResultadosCsv}
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-xs font-semibold text-[#1F1A17] hover:bg-[#FAF8F5] self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#FAF8F5] border-b border-[#EFECE6] text-xs font-semibold text-[#6E6259]">
                  <tr>
                    <th className="text-left px-5 py-3">Concepto / Rubro</th>
                    <th className="text-right px-5 py-3">Monto (MXN)</th>
                    <th className="text-right px-5 py-3 w-28">% s/ Ingresos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6]">
                  {/* Ingresos */}
                  <tr className="bg-[var(--theme-tint)]">
                    <td colSpan={3} className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-[var(--theme-primary)]">
                      1. Ingresos Operativos
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-[#1F1A17]">
                      Ventas por Jornadas consolidadas{' '}
                      <span className="text-xs text-[#8C7E73]">
                        ({incomeSummary.countJornadas} jor. · {incomeSummary.ticketsEnJornadas} tickets
                        {incomeSummary.gastosJornadas > 0
                          ? ` · Bruto ${formatCurrency(
                              incomeSummary.ventasBrutasJornadas
                            )} − Gastos ${formatCurrency(incomeSummary.gastosJornadas)}`
                          : ''}
                        )
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#1F1A17]">
                      {formatCurrency(incomeSummary.ingresosJornadas)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#6E6259]">
                      {incomeSummary.totalIngresos > 0
                        ? `${((incomeSummary.ingresosJornadas / incomeSummary.totalIngresos) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-[#1F1A17]">
                      Ventas por Tickets directos{' '}
                      <span className="text-xs text-[#8C7E73]">
                        ({incomeSummary.countTicketsDirectos} tickets sin jornada)
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#1F1A17]">
                      {formatCurrency(incomeSummary.ingresosTicketsDirectos)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#6E6259]">
                      {incomeSummary.totalIngresos > 0
                        ? `${((incomeSummary.ingresosTicketsDirectos / incomeSummary.totalIngresos) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-[#1F1A17]">
                      Ingresos por otros conceptos{' '}
                      <span className="text-xs text-[#8C7E73]">
                        ({incomeSummary.countOtros} registro(s))
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#1F1A17]">
                      {formatCurrency(incomeSummary.ingresosOtros)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#6E6259]">
                      {incomeSummary.totalIngresos > 0
                        ? `${((incomeSummary.ingresosOtros / incomeSummary.totalIngresos) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </td>
                  </tr>
                  {otrosIngresosPorCategoria.map((c) => (
                    <tr key={`ot-${c.name}`} className="text-xs text-[#6E6259]">
                      <td className="pl-10 pr-5 py-2">↳ {c.name}</td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {formatCurrency(c.value)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {incomeSummary.totalIngresos > 0
                          ? `${((c.value / incomeSummary.totalIngresos) * 100).toFixed(1)}%`
                          : '0.0%'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50 font-bold">
                    <td className="px-5 py-3 text-emerald-900">TOTAL INGRESOS NETOS</td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-800">
                      {formatCurrency(incomeSummary.totalIngresos)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-800">
                      {incomeSummary.totalIngresos > 0 ? '100.0%' : '0.0%'}
                    </td>
                  </tr>

                  {/* Egresos */}
                  <tr className="bg-[var(--theme-tint)]">
                    <td colSpan={3} className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-[var(--theme-primary)]">
                      2. Egresos Operativos
                    </td>
                  </tr>
                  {egresosPorCategoria.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-3 text-xs text-[#8C7E73]">
                        Sin egresos registrados en este periodo.
                      </td>
                    </tr>
                  ) : (
                    egresosPorCategoria.map((c) => (
                      <tr key={`eg-${c.name}`}>
                        <td className="pl-8 pr-5 py-2.5 text-[#1F1A17]">{c.name}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-[#B91C1C]">
                          −{formatCurrency(c.value)}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-[#6E6259]">
                          {incomeSummary.totalIngresos > 0
                            ? `${((c.value / incomeSummary.totalIngresos) * 100).toFixed(1)}%`
                            : '0.0%'}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-[#FAF8F5] font-bold">
                    <td className="px-5 py-3 text-[#1F1A17]">TOTAL EGRESOS OPERATIVOS</td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#B91C1C]">
                      −{formatCurrency(kpis.egresos)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#6E6259]">
                      {incomeSummary.totalIngresos > 0
                        ? `${((kpis.egresos / incomeSummary.totalIngresos) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </td>
                  </tr>

                  {/* Utilidad Neta (solo resta egresos) */}
                  <tr className={kpis.utilidadNeta >= 0 ? 'bg-emerald-50' : 'bg-red-50'}>
                    <td className="px-5 py-4 text-base font-bold text-[#1F1A17]">
                      UTILIDAD NETA DEL PERIODO (Ingresos − Egresos)
                    </td>
                    <td
                      className={`px-5 py-4 text-right text-base font-bold tabular-nums ${
                        kpis.utilidadNeta >= 0 ? 'text-emerald-700' : 'text-[#B91C1C]'
                      }`}
                    >
                      {formatCurrency(kpis.utilidadNeta)}
                    </td>
                    <td className="px-5 py-4 text-right font-bold tabular-nums text-[#1F1A17]">
                      {kpis.margenNeto.toFixed(1)}%
                    </td>
                  </tr>

                  {/* Monthly Base Fund Reconciliation */}
                  {periodMode === 'mes' && (
                    <>
                      <tr className="bg-[#FAF8F5]">
                        <td className="px-5 py-2.5 text-xs font-semibold text-[#6E6259]">
                          Fondo base inicial de {formatMonthLabel(selectedMes)}
                        </td>
                        <td className="px-5 py-2.5 text-right text-xs font-semibold tabular-nums text-[#1F1A17]">
                          {formatCurrency(currentFinanzaMes?.fondoBase ?? 0)}
                        </td>
                        <td className="px-5 py-2.5 text-right text-xs text-[#8C7E73]">
                          {currentFinanzaMes?.cerrado ? 'Mes cerrado' : 'Abierto'}
                        </td>
                      </tr>
                      <tr className="bg-white font-bold">
                        <td className="px-5 py-3 text-sm text-[var(--theme-primary)]">
                          FONDO TOTAL ACUMULADO AL CIERRE (Base + Ingresos − Egresos − Sueldos)
                        </td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums text-[var(--theme-primary)]">
                          {formatCurrency(
                            (currentFinanzaMes?.fondoBase ?? 0) +
                              kpis.ingresos -
                              kpis.egresos -
                              kpis.sueldos
                          )}
                        </td>
                        <td />
                      </tr>
                    </>
                  )}

                  {/* Sueldos separados (salen de la utilidad, no restan) */}
                  <tr className="bg-[var(--theme-tint)]">
                    <td colSpan={3} className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-[var(--theme-primary)]">
                      3. Sueldos (Registro separado — salen de la utilidad)
                    </td>
                  </tr>
                  {sueldosPorTrabajador.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-3 text-xs text-[#8C7E73]">
                        Sin sueldos registrados en este periodo.
                      </td>
                    </tr>
                  ) : (
                    sueldosPorTrabajador.map((s) => (
                      <tr key={`su-${s.name}`}>
                        <td className="pl-8 pr-5 py-2.5 text-[#1F1A17]">{s.name}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-[var(--theme-accent)] font-semibold">
                          {formatCurrency(s.value)}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-[#6E6259]">
                          {incomeSummary.totalIngresos > 0
                            ? `${((s.value / incomeSummary.totalIngresos) * 100).toFixed(1)}%`
                            : '0.0%'}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-[#FAF8F5] font-bold">
                    <td className="px-5 py-3 text-[#1F1A17]">
                      TOTAL SUELDOS (Separado, no resta de utilidad)
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-[var(--theme-accent)]">
                      {formatCurrency(kpis.sueldos)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#6E6259]">
                      {incomeSummary.totalIngresos > 0
                        ? `${((kpis.sueldos / incomeSummary.totalIngresos) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Monthly Comparative P&L */}
          <section className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFECE6]">
              <h3 className="text-base font-bold text-[#1F1A17]">
                Comparativa mensual de resultados (últimos 6 meses)
              </h3>
            </div>
            {mensualUltimos6.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#6E6259]">
                Sin movimientos mensuales registrados todavía.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-[#FAF8F5] border-b border-[#EFECE6] text-xs font-semibold text-[#6E6259]">
                    <tr>
                      <th className="text-left px-4 py-3">Mes</th>
                      <th className="text-right px-4 py-3">Ingresos</th>
                      <th className="text-right px-4 py-3">Egresos</th>
                      <th className="text-right px-4 py-3">Util. Prelim.</th>
                      <th className="text-right px-4 py-3">Sueldos</th>
                      <th className="text-right px-4 py-3">Utilidad Neta</th>
                      <th className="text-right px-4 py-3">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE6]">
                    {mensualUltimos6.map((m) => (
                      <tr key={m.mes} className="hover:bg-[#FAF8F5]">
                        <td className="px-4 py-3 font-semibold text-[#1F1A17]">
                          {formatMonthLabel(m.mes)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-semibold">
                          {formatCurrency(m.ingresos)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#6E6259]">
                          {formatCurrency(m.egresosOp)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#1F1A17]">
                          {formatCurrency(m.utilidadPreliminar)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#6E6259]">
                          {formatCurrency(m.sueldos)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums font-bold ${
                            m.utilidadNeta >= 0 ? 'text-emerald-700' : 'text-[#B91C1C]'
                          }`}
                        >
                          {formatCurrency(m.utilidadNeta)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#6E6259]">
                          {m.margenNeto.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: TABLAS DETALLADAS */}
      {activeSubTab === 'tablas' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'consolidado', label: 'Ingresos consolidados' },
                  { id: 'rutas', label: 'Rentabilidad por ruta' },
                  { id: 'productos', label: 'Productos e inventario' },
                  { id: 'mensual', label: 'Histórico mensual' },
                  { id: 'gastos', label: 'Egresos y sueldos' },
                ] as { id: TableReportKind; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTable(t.id);
                    setSortCol('');
                    setSortDir('desc');
                  }}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border transition-colors ${
                    selectedTable === t.id
                      ? 'bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]'
                      : 'bg-[#FAF8F5] text-[#49403A] border-[#E7E3DC] hover:bg-[var(--theme-tint)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#8C7E73] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Filtrar filas de esta tabla..."
                  className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white pl-9 pr-3 text-xs text-[#1F1A17]"
                />
              </div>
              <button
                type="button"
                onClick={handleExportTableCsv}
                disabled={sortedFilteredRows.length === 0}
                className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-xs font-semibold text-[#1F1A17] hover:bg-[#FAF8F5] disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar tabla CSV</span>
              </button>
            </div>
          </div>

          <section className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
            {sortedFilteredRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#6E6259]">
                No hay registros para mostrar en esta tabla con el filtro actual.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-[#FAF8F5] border-b border-[#EFECE6] text-xs font-semibold text-[#6E6259]">
                    <tr>
                      {tableConfig.columns.map((col) => (
                        <th
                          key={col.key}
                          className={`px-4 py-3 ${
                            col.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSortCol(col.key)}
                            className="inline-flex items-center gap-1 hover:text-[#1F1A17]"
                          >
                            <span>{col.label}</span>
                            <ArrowUpDown className="w-3 h-3 opacity-60" />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE6]">
                    {sortedFilteredRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#FAF8F5]">
                        {tableConfig.columns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-4 py-2.5 text-[#1F1A17] ${
                              col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                            } ${
                              col.key === 'monto' || col.key === 'ventas' || col.key === 'utilidadNeta'
                                ? 'font-semibold'
                                : ''
                            }`}
                          >
                            {formatCellValue(row[col.key], col.format)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#FAF8F5] border-t border-[#E7E3DC] font-bold">
                    <tr>
                      {tableConfig.columns.map((col) => (
                        <td
                          key={`tot-${col.key}`}
                          className={`px-4 py-3 text-[#1F1A17] ${
                            col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                          }`}
                        >
                          {formatCellValue(tableConfig.totals[col.key], col.format)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Custom Chart Builder Modal */}
      <CustomChartBuilderModal
        isOpen={builderOpen}
        editingChart={editingChart}
        dataset={dataset}
        monthPrefix={activeMonthPrefix}
        onClose={() => {
          setBuilderOpen(false);
          setEditingChart(null);
        }}
        onSave={handleSaveCustomChart}
      />
    </div>
  );
};
