import { BusinessDataset } from '../types/business';
import { formatMonthLabel } from './formatters';
import { buildConsolidatedIncomeEntries, getGeneralEgresos } from './incomeConsolidation';
import { getTicketItemSalesStatsDelta } from './ticketAdjustments';

export type CustomChartType =
  | 'bar'
  | 'horizontal_bar'
  | 'line'
  | 'area'
  | 'pie';

export type CustomChartSource =
  | 'ingresos_consolidados'
  | 'ventas_ruta'
  | 'ventas_producto'
  | 'ventas_cliente'
  | 'mayoreo_menudeo'
  | 'otros_ingresos'
  | 'egresos'
  | 'sueldos'
  | 'inventario'
  | 'mensual_comparativa';

export type CustomChartGroupBy =
  | 'fecha'
  | 'mes'
  | 'ruta'
  | 'tipo'
  | 'categoria'
  | 'concepto'
  | 'producto'
  | 'cliente'
  | 'trabajador';

export type CustomChartMetric =
  | 'monto'
  | 'piezas'
  | 'registros'
  | 'stock'
  | 'valor_inventario'
  | 'utilidad';

export interface CustomChartConfig {
  id: string;
  titulo: string;
  tipo: CustomChartType;
  fuente: CustomChartSource;
  agruparPor: CustomChartGroupBy;
  metrica: CustomChartMetric;
  limite: number; // 0 = todos
  orden: 'desc' | 'asc' | 'label';
  color: string;
  createdAt: string;
}

export interface ChartSourceSpec {
  id: CustomChartSource;
  label: string;
  groupings: { id: CustomChartGroupBy; label: string }[];
  metrics: { id: CustomChartMetric; label: string; isCurrency: boolean }[];
}

export const CHART_SOURCE_SPECS: ChartSourceSpec[] = [
  {
    id: 'ingresos_consolidados',
    label: 'Ingresos consolidados (Jornadas + Directos + Otros)',
    groupings: [
      { id: 'tipo', label: 'Tipo de ingreso (Jornada / Directo / Otro)' },
      { id: 'ruta', label: 'Ruta' },
      { id: 'fecha', label: 'Fecha' },
      { id: 'mes', label: 'Mes' },
    ],
    metrics: [
      { id: 'monto', label: 'Importe ($)', isCurrency: true },
      { id: 'piezas', label: 'Piezas vendidas', isCurrency: false },
      { id: 'registros', label: 'Cantidad de registros', isCurrency: false },
    ],
  },
  {
    id: 'ventas_ruta',
    label: 'Ingresos por ruta (Jornadas + Directos)',
    groupings: [{ id: 'ruta', label: 'Ruta' }],
    metrics: [
      { id: 'monto', label: 'Importe ($)', isCurrency: true },
      { id: 'piezas', label: 'Piezas vendidas', isCurrency: false },
      { id: 'registros', label: 'Jornadas y tickets', isCurrency: false },
    ],
  },
  {
    id: 'ventas_producto',
    label: 'Ventas por producto (Tickets)',
    groupings: [{ id: 'producto', label: 'Producto' }],
    metrics: [
      { id: 'piezas', label: 'Piezas vendidas', isCurrency: false },
      { id: 'monto', label: 'Importe vendido ($)', isCurrency: true },
      { id: 'registros', label: 'Apariciones en tickets', isCurrency: false },
    ],
  },
  {
    id: 'ventas_cliente',
    label: 'Ventas por cliente (Tickets)',
    groupings: [
      { id: 'cliente', label: 'Cliente' },
      { id: 'ruta', label: 'Ruta' },
    ],
    metrics: [
      { id: 'monto', label: 'Importe comprado ($)', isCurrency: true },
      { id: 'piezas', label: 'Piezas compradas', isCurrency: false },
      { id: 'registros', label: 'Tickets emitidos', isCurrency: false },
    ],
  },
  {
    id: 'mayoreo_menudeo',
    label: 'Mayoreo vs. Menudeo',
    groupings: [{ id: 'tipo', label: 'Modalidad de venta' }],
    metrics: [
      { id: 'monto', label: 'Importe ($)', isCurrency: true },
      { id: 'piezas', label: 'Piezas vendidas', isCurrency: false },
      { id: 'registros', label: 'Cantidad de tickets', isCurrency: false },
    ],
  },
  {
    id: 'otros_ingresos',
    label: 'Ingresos por otros conceptos',
    groupings: [
      { id: 'categoria', label: 'Categoría' },
      { id: 'concepto', label: 'Concepto' },
      { id: 'fecha', label: 'Fecha' },
      { id: 'mes', label: 'Mes' },
    ],
    metrics: [
      { id: 'monto', label: 'Importe ($)', isCurrency: true },
      { id: 'registros', label: 'Registros', isCurrency: false },
    ],
  },
  {
    id: 'egresos',
    label: 'Egresos y gastos operativos',
    groupings: [
      { id: 'categoria', label: 'Categoría' },
      { id: 'concepto', label: 'Concepto' },
      { id: 'fecha', label: 'Fecha' },
      { id: 'mes', label: 'Mes' },
    ],
    metrics: [
      { id: 'monto', label: 'Monto ($)', isCurrency: true },
      { id: 'registros', label: 'Cantidad de gastos', isCurrency: false },
    ],
  },
  {
    id: 'sueldos',
    label: 'Sueldos y nómina',
    groupings: [
      { id: 'trabajador', label: 'Trabajador' },
      { id: 'concepto', label: 'Concepto' },
      { id: 'mes', label: 'Mes' },
    ],
    metrics: [
      { id: 'monto', label: 'Monto pagado ($)', isCurrency: true },
      { id: 'registros', label: 'Pagos realizados', isCurrency: false },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario general actual',
    groupings: [
      { id: 'producto', label: 'Producto' },
      { id: 'categoria', label: 'Categoría' },
    ],
    metrics: [
      { id: 'stock', label: 'Piezas en stock', isCurrency: false },
      { id: 'valor_inventario', label: 'Valor a mayoreo ($)', isCurrency: true },
    ],
  },
  {
    id: 'mensual_comparativa',
    label: 'Evolución financiera mensual',
    groupings: [{ id: 'mes', label: 'Mes' }],
    metrics: [
      { id: 'monto', label: 'Ingresos totales ($)', isCurrency: true },
      { id: 'utilidad', label: 'Utilidad neta ($)', isCurrency: true },
    ],
  },
];

export const CUSTOM_CHART_PALETTE = [
  '#4A2511',
  '#D98218',
  '#15803D',
  '#2E5E4E',
  '#8C4A1F',
  '#1D4ED8',
  '#B91C1C',
  '#7C3AED',
];

const CUSTOM_CHARTS_STORAGE_KEY = 'astorga_custom_charts_v1';

export function loadCustomCharts(): CustomChartConfig[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CHARTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomCharts(charts: CustomChartConfig[]): void {
  try {
    localStorage.setItem(CUSTOM_CHARTS_STORAGE_KEY, JSON.stringify(charts));
  } catch {
    // Ignore quota errors
  }
}

export function getMetricMeta(
  fuente: CustomChartSource,
  metrica: CustomChartMetric
): { label: string; isCurrency: boolean } {
  const spec = CHART_SOURCE_SPECS.find((s) => s.id === fuente);
  const found = spec?.metrics.find((m) => m.id === metrica);
  return found || { label: 'Valor', isCurrency: metrica === 'monto' || metrica === 'utilidad' || metrica === 'valor_inventario' };
}

export function computeCustomChartData(
  config: CustomChartConfig,
  dataset: BusinessDataset,
  monthPrefix?: string
): { name: string; value: number }[] {
  const matchPeriod = (fecha: string) =>
    !monthPrefix || (fecha && fecha.startsWith(monthPrefix));

  const map = new Map<string, { label: string; sortKey: string; value: number }>();
  const addPoint = (key: string, label: string, delta: number, sortKey?: string) => {
    const cleanKey = key || 'Sin especificar';
    const curr = map.get(cleanKey) || {
      label: label || 'Sin especificar',
      sortKey: sortKey || label || cleanKey,
      value: 0,
    };
    curr.value += delta;
    map.set(cleanKey, curr);
  };

  const consolidated = buildConsolidatedIncomeEntries(dataset);

  if (config.fuente === 'ingresos_consolidados') {
    for (const e of consolidated) {
      if (!matchPeriod(e.fecha)) continue;
      let key = 'Otros';
      let label = 'Otros';
      let sortKey = '';
      if (config.agruparPor === 'tipo') {
        key = e.kind;
        label =
          e.kind === 'jornada'
            ? 'Jornadas completas'
            : e.kind === 'ticket'
            ? 'Tickets directos'
            : 'Otros conceptos';
      } else if (config.agruparPor === 'ruta') {
        key = e.kind === 'otro_ingreso' ? 'Otros conceptos' : e.ruta || 'Sin ruta';
        label = key;
      } else if (config.agruparPor === 'fecha') {
        key = e.fecha || 'Sin fecha';
        label = e.fecha ? e.fecha.slice(5) : 'Sin fecha';
        sortKey = e.fecha || '';
      } else if (config.agruparPor === 'mes') {
        const m = (e.fecha || '').slice(0, 7);
        key = m || 'Sin mes';
        label = m ? formatMonthLabel(m).slice(0, 10) : 'Sin mes';
        sortKey = m;
      }
      const val =
        config.metrica === 'piezas'
          ? e.totalPiezas
          : config.metrica === 'registros'
          ? 1
          : e.monto;
      addPoint(key, label, val, sortKey);
    }
  } else if (config.fuente === 'ventas_ruta') {
    for (const e of consolidated) {
      if (e.kind === 'otro_ingreso' || !matchPeriod(e.fecha)) continue;
      const ruta = e.ruta || 'Sin ruta';
      const val =
        config.metrica === 'piezas'
          ? e.totalPiezas
          : config.metrica === 'registros'
          ? 1
          : e.monto;
      addPoint(ruta, ruta, val);
    }
  } else if (config.fuente === 'ventas_producto') {
    for (const t of dataset.tickets) {
      if (!matchPeriod(t.fecha)) continue;
      for (const it of t.items) {
        const delta = getTicketItemSalesStatsDelta(it);
        const name = it.productoNombre || 'Producto';
        const val =
          config.metrica === 'monto'
            ? delta.importe
            : config.metrica === 'registros'
            ? 1
            : delta.piezasVendidas;
        addPoint(name, name, val);
      }
    }
  } else if (config.fuente === 'ventas_cliente') {
    for (const t of dataset.tickets) {
      if (!matchPeriod(t.fecha)) continue;
      const key =
        config.agruparPor === 'ruta'
          ? t.ruta || 'Sin ruta'
          : t.clienteNombre || 'Cliente general';
      const val =
        config.metrica === 'piezas'
          ? t.totalPiezas
          : config.metrica === 'registros'
          ? 1
          : t.totalImporte;
      addPoint(key, key, val);
    }
  } else if (config.fuente === 'mayoreo_menudeo') {
    for (const t of dataset.tickets) {
      if (!matchPeriod(t.fecha)) continue;
      const key = t.tipoVenta || 'Menudeo';
      const val =
        config.metrica === 'piezas'
          ? t.totalPiezas
          : config.metrica === 'registros'
          ? 1
          : t.totalImporte;
      addPoint(key, key, val);
    }
  } else if (config.fuente === 'otros_ingresos') {
    for (const ing of dataset.otrosIngresos || []) {
      if (!matchPeriod(ing.fecha)) continue;
      let key = ing.categoria || 'Otros ingresos';
      let label = key;
      let sortKey = '';
      if (config.agruparPor === 'concepto') {
        key = ing.concepto;
        label = ing.concepto;
      } else if (config.agruparPor === 'fecha') {
        key = ing.fecha;
        label = ing.fecha.slice(5);
        sortKey = ing.fecha;
      } else if (config.agruparPor === 'mes') {
        const m = (ing.fecha || '').slice(0, 7);
        key = m || 'Sin mes';
        label = m ? formatMonthLabel(m).slice(0, 10) : 'Sin mes';
        sortKey = m;
      }
      const val = config.metrica === 'registros' ? 1 : ing.monto;
      addPoint(key, label, val, sortKey);
    }
  } else if (config.fuente === 'egresos') {
    for (const eg of getGeneralEgresos(dataset)) {
      if (!matchPeriod(eg.fecha)) continue;
      let key = eg.categoria || 'Otros';
      let label = key;
      let sortKey = '';
      if (config.agruparPor === 'concepto') {
        key = eg.concepto;
        label = eg.concepto;
      } else if (config.agruparPor === 'fecha') {
        key = eg.fecha;
        label = eg.fecha.slice(5);
        sortKey = eg.fecha;
      } else if (config.agruparPor === 'mes') {
        const m = (eg.fecha || '').slice(0, 7);
        key = m || 'Sin mes';
        label = m ? formatMonthLabel(m).slice(0, 10) : 'Sin mes';
        sortKey = m;
      }
      const val = config.metrica === 'registros' ? 1 : eg.monto;
      addPoint(key, label, val, sortKey);
    }
  } else if (config.fuente === 'sueldos') {
    for (const su of dataset.sueldos) {
      if (!matchPeriod(su.fecha)) continue;
      let key = su.trabajador || 'Sin asignar';
      let label = key;
      let sortKey = '';
      if (config.agruparPor === 'concepto') {
        key = su.concepto || 'Pago';
        label = key;
      } else if (config.agruparPor === 'mes') {
        const m = (su.fecha || '').slice(0, 7);
        key = m || 'Sin mes';
        label = m ? formatMonthLabel(m).slice(0, 10) : 'Sin mes';
        sortKey = m;
      }
      const val = config.metrica === 'registros' ? 1 : su.monto;
      addPoint(key, label, val, sortKey);
    }
  } else if (config.fuente === 'inventario') {
    for (const p of dataset.productos) {
      const stock = p.inventario ?? 0;
      const key =
        config.agruparPor === 'categoria' ? p.categoria || 'Sin categoría' : p.nombre;
      const val =
        config.metrica === 'valor_inventario' ? stock * p.precioMayoreo : stock;
      addPoint(key, key, val);
    }
  } else if (config.fuente === 'mensual_comparativa') {
    const monthly = new Map<string, { ing: number; egr: number; sue: number }>();
    const touch = (m: string) => {
      if (!m || m.length < 7) return null;
      const k = m.slice(0, 7);
      if (!monthly.has(k)) monthly.set(k, { ing: 0, egr: 0, sue: 0 });
      return monthly.get(k)!;
    };
    consolidated.forEach((e) => {
      const b = touch(e.fecha);
      if (b) b.ing += e.monto;
    });
    getGeneralEgresos(dataset).forEach((e) => {
      const b = touch(e.fecha);
      if (b) b.egr += e.monto;
    });
    dataset.sueldos.forEach((s) => {
      const b = touch(s.fecha);
      if (b) b.sue += s.monto;
    });
    for (const [m, d] of monthly.entries()) {
      const val = config.metrica === 'utilidad' ? d.ing - d.egr : d.ing;
      addPoint(m, formatMonthLabel(m).slice(0, 10), val, m);
    }
  }

  const arr = Array.from(map.values());
  if (config.orden === 'desc') {
    arr.sort((a, b) => b.value - a.value);
  } else if (config.orden === 'asc') {
    arr.sort((a, b) => a.value - b.value);
  } else {
    arr.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  const sliced = config.limite > 0 ? arr.slice(0, config.limite) : arr;
  return sliced.map((item) => ({
    name: item.label,
    value: Math.round(item.value * 100) / 100,
  }));
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvLines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvLines], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
