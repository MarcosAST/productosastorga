import {
  BusinessDataset,
  Cliente,
  ConceptoGasto,
  ConceptoIngreso,
  DescuentoTipo,
  DriveSpreadsheetFile,
  Egreso,
  EstadoPago,
  FinanzaMensual,
  IngresoOtro,
  Jornada,
  JornadaConciliacionItem,
  JornadaInventarioItem,
  JornadaVisitaItem,
  LogicalTabKey,
  MetodoPago,
  MovimientoInventario,
  MovimientoInventarioTipo,
  Producto,
  Ruta,
  SheetTabMapping,
  Sueldo,
  Ticket,
  TicketAbono,
  TicketItem,
  TicketItemTipo,
  TipoVenta,
} from '../types/business';
import {
  generateNextFolio,
  getTodayISO,
  normalizeSheetDate,
  normalizeSheetMonth,
  normalizeText,
  parseNumericValue,
} from '../utils/formatters';
import { getTicketPaymentSummary } from '../utils/paymentHelpers';
import {
  buildTicketDetalleTexto,
  computeTicketTotals,
  getTicketItemTipo,
} from '../utils/ticketAdjustments';

export class AuthExpiredError extends Error {
  constructor(message = 'Tu sesión de Google expiró. Vuelve a iniciar sesión para continuar.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

export const DEFAULT_TAB_NAMES: SheetTabMapping = {
  productos: 'Productos',
  clientes: 'Clientes',
  rutas: 'Rutas',
  tickets: 'Tickets',
  jornadas: 'Jornadas',
  movimientosInventario: 'MovimientosInventario',
  otrosIngresos: 'OtrosIngresos',
  conceptosIngreso: 'ConceptosIngreso',
  egresos: 'Egresos',
  conceptosGasto: 'ConceptosGasto',
  sueldos: 'Sueldos',
  finanzasMensuales: 'FinanzasMensuales',
  configuracion: 'Configuracion',
};

export const TAB_HEADERS: Record<LogicalTabKey, string[]> = {
  productos: [
    'ID',
    'Nombre',
    'Categoria',
    'Unidad',
    'Precio Mayoreo',
    'Precio Menudeo',
    'Inventario',
    'Activo',
  ],
  clientes: ['ID', 'Nombre', 'Ruta', 'Telefono', 'Direccion', 'Notas', 'Fecha Registro'],
  rutas: ['ID', 'Nombre', 'Descripcion', 'Activa'],
  tickets: [
    'Folio',
    'Fecha',
    'Ruta',
    'Cliente ID',
    'Cliente Nombre',
    'Tipo Venta',
    'Total Piezas',
    'Total Importe',
    'Jornada ID',
    'Detalle Productos',
    'Items JSON',
    'Metodo Pago',
    'Estado Pago',
    'Monto Pagado',
    'Saldo Pendiente',
    'Abonos JSON',
    'Subtotal Bruto',
    'Descuento Tipo',
    'Descuento Valor',
    'Descuento Monto',
    'Descuento Motivo',
  ],
  jornadas: [
    'ID',
    'Fecha',
    'Ruta',
    'Nombre Jornada',
    'Folios Tickets',
    'Total Tickets',
    'Total Piezas',
    'Total Importe',
    'Estado',
    'Notas',
    'Inventario JSON',
    'Visitas JSON',
    'Conciliacion JSON',
    'Fondo Ruta',
  ],
  movimientosInventario: [
    'ID',
    'Fecha',
    'Tipo',
    'Producto ID',
    'Producto',
    'Cantidad',
    'Stock Resultante',
    'Referencia',
    'Notas',
  ],
  otrosIngresos: ['ID', 'Fecha', 'Categoria', 'Concepto', 'Monto', 'Notas'],
  conceptosIngreso: ['ID', 'Concepto', 'Categoria', 'Monto Sugerido'],
  egresos: ['ID', 'Fecha', 'Categoria', 'Concepto', 'Monto', 'Notas', 'Jornada ID'],
  conceptosGasto: ['ID', 'Concepto', 'Categoria', 'Monto Sugerido'],
  sueldos: ['ID', 'Fecha', 'Trabajador', 'Concepto', 'Monto', 'Notas'],
  finanzasMensuales: [
    'Mes',
    'Fondo Base',
    'Ingresos',
    'Egresos',
    'Utilidad Preliminar',
    'Sueldos',
    'Utilidad Neta',
    'Fondo Total',
    'Cerrado',
    'Fecha Cierre',
  ],
  configuracion: ['Clave', 'Valor JSON', 'Actualizado'],
};

const TAB_ALIASES: Record<LogicalTabKey, string[]> = {
  productos: ['productos', 'producto', 'catalogo', 'articulos', 'dulces', 'inventario'],
  clientes: ['clientes', 'cliente', 'directorio'],
  rutas: ['rutas', 'ruta', 'zonas'],
  tickets: ['tickets', 'ticket', 'pedidos', 'pedido', 'ventas', 'venta'],
  jornadas: ['jornadas', 'jornada', 'cortes', 'rutas venta'],
  movimientosInventario: [
    'movimientosinventario',
    'movimientos inventario',
    'movimientos de inventario',
    'kardex',
    'mermas',
    'historial inventario',
  ],
  otrosIngresos: [
    'otrosingresos',
    'otros ingresos',
    'otroingreso',
    'ingresos otros',
    'ingresos adicionales',
    'entradas',
  ],
  conceptosIngreso: [
    'conceptosingreso',
    'conceptos ingreso',
    'conceptos de ingreso',
    'conceptos ingresos',
    'conceptos de ingresos',
    'plantillas ingreso',
  ],
  egresos: ['egresos', 'egreso', 'gastos', 'gasto'],
  conceptosGasto: [
    'conceptosgasto',
    'conceptos de gasto',
    'conceptos de gastos',
    'conceptos gastos',
    'conceptos de egreso',
    'conceptos de egresos',
    'conceptos egresos',
    'conceptos egreso',
    'conceptos',
    'plantillas gasto',
    'catalogo gastos',
    'tipos gasto',
  ],
  sueldos: ['sueldos', 'sueldo', 'nomina', 'salarios', 'pagos personal'],
  finanzasMensuales: [
    'finanzasmensuales',
    'finanzas mensuales',
    'finanzas',
    'fondobase',
    'fondo base',
    'cierres',
  ],
  configuracion: ['configuracion', 'ajustes', 'respaldo', 'settings'],
};

// Specificity order for partial alias matching so multi-word names never get stolen
const PARTIAL_MATCH_ORDER: LogicalTabKey[] = [
  'movimientosInventario',
  'conceptosIngreso',
  'conceptosGasto',
  'otrosIngresos',
  'finanzasMensuales',
  'configuracion',
  'productos',
  'clientes',
  'tickets',
  'jornadas',
  'egresos',
  'sueldos',
  'rutas',
];

function quoteSheetName(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function colIndexToLetter(index0: number): string {
  let col = '';
  let n = index0 + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function asLiteralText(value: string): string {
  const clean = (value || '').trim().replace(/^'+/, '');
  return clean ? `'${clean}` : '';
}

async function googleFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new AuthExpiredError();
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `Error HTTP ${res.status}`;
    if (res.status === 403 && /insufficient|scope|permission/i.test(msg)) {
      throw new AuthExpiredError(
        'Faltan permisos de Google Sheets o la sesión caducó. Inicia sesión nuevamente.'
      );
    }
    throw new Error(msg);
  }

  return json as T;
}

export async function listUserSpreadsheets(token: string): Promise<DriveSpreadsheetFile[]> {
  const q = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=30`;
  const data = await googleFetch<{ files?: DriveSpreadsheetFile[] }>(url, token);
  return data.files || [];
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheetTitles: string[];
  sheetIds: Record<string, number>;
}

export async function getSpreadsheetMetadata(
  token: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title)`;
  const data = await googleFetch<any>(url, token);
  const sheetTitles: string[] = [];
  const sheetIds: Record<string, number> = {};
  for (const s of data.sheets || []) {
    const title = s?.properties?.title;
    const sheetId = s?.properties?.sheetId;
    if (title) {
      sheetTitles.push(title);
      if (typeof sheetId === 'number') {
        sheetIds[title] = sheetId;
      }
    }
  }
  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'Base de Datos Astorga',
    sheetTitles,
    sheetIds,
  };
}

export function detectTabMapping(sheetTitles: string[]): {
  mapping: Partial<SheetTabMapping>;
  missingKeys: LogicalTabKey[];
} {
  const mapping: Partial<SheetTabMapping> = {};
  const usedTitles = new Set<string>();
  const allKeys = Object.keys(DEFAULT_TAB_NAMES) as LogicalTabKey[];

  // Pass 1: Exact normalized match across ALL keys first (prevents stealing)
  for (const key of allKeys) {
    const aliases = TAB_ALIASES[key];
    const found = sheetTitles.find((title) => {
      if (usedTitles.has(title)) return false;
      const norm = normalizeText(title).replace(/[\s_-]+/g, '');
      return aliases.some((alias) => normalizeText(alias).replace(/[\s_-]+/g, '') === norm);
    });
    if (found) {
      mapping[key] = found;
      usedTitles.add(found);
    }
  }

  // Pass 2: Partial contains match in specificity order for remaining unmapped keys
  for (const key of PARTIAL_MATCH_ORDER) {
    if (mapping[key]) continue;
    const aliases = TAB_ALIASES[key];
    const partial = sheetTitles.find((title) => {
      if (usedTitles.has(title)) return false;
      const norm = normalizeText(title);
      return aliases.some((alias) => norm.includes(normalizeText(alias)));
    });
    if (partial) {
      mapping[key] = partial;
      usedTitles.add(partial);
    }
  }

  const missingKeys = allKeys.filter((k) => !mapping[k]);
  return { mapping, missingKeys };
}

const TAB_COLORS: Record<string, { red: number; green: number; blue: number }> = {
  Resumen_General: { red: 0.08, green: 0.5, blue: 0.24 },
  productos: { red: 0.85, green: 0.51, blue: 0.09 },
  clientes: { red: 0.12, green: 0.35, blue: 0.68 },
  rutas: { red: 0.28, green: 0.32, blue: 0.62 },
  tickets: { red: 0.29, green: 0.15, blue: 0.07 },
  jornadas: { red: 0.05, green: 0.45, blue: 0.45 },
  movimientosInventario: { red: 0.48, green: 0.29, blue: 0.12 },
  otrosIngresos: { red: 0.13, green: 0.55, blue: 0.34 },
  conceptosIngreso: { red: 0.2, green: 0.62, blue: 0.48 },
  egresos: { red: 0.72, green: 0.15, blue: 0.15 },
  conceptosGasto: { red: 0.78, green: 0.42, blue: 0.1 },
  sueldos: { red: 0.58, green: 0.15, blue: 0.38 },
  finanzasMensuales: { red: 0.18, green: 0.2, blue: 0.24 },
  configuracion: { red: 0.38, green: 0.36, blue: 0.42 },
};

const CURRENCY_HEADER_NORMS: Partial<Record<LogicalTabKey, string[]>> = {
  productos: ['preciomayoreo', 'mayoreo', 'preciomenudeo', 'menudeo', 'precio'],
  tickets: [
    'totalimporte',
    'importe',
    'total',
    'monto',
    'montopagado',
    'saldopendiente',
    'subtotalbruto',
    'descuentomonto',
  ],
  jornadas: ['fondoruta', 'totalimporte', 'importe', 'total'],
  otrosIngresos: ['monto', 'importe', 'total', 'ingreso'],
  conceptosIngreso: ['montosugerido', 'monto', 'importe'],
  egresos: ['monto', 'importe', 'total', 'costo', 'gasto'],
  conceptosGasto: ['montosugerido', 'monto', 'costo', 'precio', 'importe'],
  sueldos: ['monto', 'sueldo', 'importe', 'pago'],
  finanzasMensuales: [
    'fondobase',
    'ingresos',
    'egresos',
    'utilidadpreliminar',
    'sueldos',
    'utilidadneta',
    'fondototal',
  ],
};

const INTEGER_HEADER_NORMS: Partial<Record<LogicalTabKey, string[]>> = {
  productos: ['inventario', 'stock', 'existencias', 'cantidad'],
  tickets: ['totalpiezas', 'piezas', 'cantidad'],
  jornadas: ['totaltickets', 'totalpiezas', 'piezas'],
  movimientosInventario: ['cantidad', 'stockresultante'],
};

const TEXT_HEADER_NORMS: Partial<Record<LogicalTabKey, string[]>> = {
  clientes: ['fecharegistro', 'fecha', 'telefono'],
  tickets: ['fecha', 'folio'],
  jornadas: ['fecha'],
  movimientosInventario: ['fecha'],
  otrosIngresos: ['fecha'],
  egresos: ['fecha'],
  sueldos: ['fecha'],
  finanzasMensuales: ['mes', 'fechacierre'],
  configuracion: ['clave', 'actualizado'],
};

function buildHeaderIndex(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalizeText(String(cell || '')).replace(/[\s_-]+/g, '');
    if (norm && map[norm] === undefined) {
      map[norm] = idx;
    }
  });
  return map;
}

function findHeaderColIndex(
  headerIdx: Record<string, number>,
  aliases: string[],
  fallbackIdx?: number
): number | undefined {
  for (const alias of aliases) {
    const norm = normalizeText(alias).replace(/[\s_-]+/g, '');
    if (headerIdx[norm] !== undefined) {
      return headerIdx[norm];
    }
  }
  return fallbackIdx;
}

function getCell(
  row: any[],
  headerIdx: Record<string, number>,
  aliases: string[],
  fallbackIdx: number
): string {
  for (const alias of aliases) {
    const norm = normalizeText(alias).replace(/[\s_-]+/g, '');
    const idx = headerIdx[norm];
    if (idx !== undefined) {
      return row[idx] !== undefined ? String(row[idx]).trim() : '';
    }
  }
  return fallbackIdx >= 0 && row[fallbackIdx] !== undefined
    ? String(row[fallbackIdx]).trim()
    : '';
}

function isRowEmpty(row: any[]): boolean {
  return !row || row.every((c) => String(c ?? '').trim() === '');
}

function parseBool(val: string, defaultVal = true): boolean {
  if (!val) return defaultVal;
  const n = normalizeText(val);
  if (['no', 'false', '0', 'inactivo', 'inactiva', 'abierta'].includes(n)) return false;
  if (['si', 'yes', 'true', '1', 'activo', 'activa', 'cerrado', 'cerrada'].includes(n))
    return true;
  return defaultVal;
}

function buildDynamicResumenRows(
  mapping: Partial<SheetTabMapping>,
  headersByTab: Partial<Record<LogicalTabKey, Record<string, number>>>
): (string | number)[][] {
  const tabRef = (key: LogicalTabKey, colLetter: string, startRow = 2) => {
    const title = mapping[key] || DEFAULT_TAB_NAMES[key];
    return `${quoteSheetName(title)}!${colLetter}${startRow}:${colLetter}`;
  };

  const colFor = (key: LogicalTabKey, aliases: string[], fallbackIdx: number) => {
    const hIdx = headersByTab[key] || {};
    const idx = findHeaderColIndex(hIdx, aliases, fallbackIdx) ?? fallbackIdx;
    return colIndexToLetter(idx);
  };

  const prodIdCol = colFor('productos', ['ID', 'Nombre', 'Producto'], 0);
  const prodInvCol = colFor('productos', ['Inventario', 'Stock', 'Existencias'], 6);
  const cliIdCol = colFor('clientes', ['ID', 'Nombre', 'Cliente'], 0);
  const rutIdCol = colFor('rutas', ['ID', 'Nombre', 'Ruta'], 0);
  const jorIdCol = colFor('jornadas', ['ID', 'Nombre Jornada'], 0);
  const jorImporteCol = colFor('jornadas', ['Total Importe', 'Total', 'Importe'], 7);
  const jorEstadoCol = colFor('jornadas', ['Estado', 'Estatus'], 8);

  const tickFolioCol = colFor('tickets', ['Folio', 'ID', 'Ticket'], 0);
  const tickTipoCol = colFor('tickets', ['Tipo Venta', 'Tipo', 'Modalidad'], 5);
  const tickPiezasCol = colFor('tickets', ['Total Piezas', 'Piezas', 'Cantidad'], 6);
  const tickImporteCol = colFor('tickets', ['Total Importe', 'Total', 'Importe', 'Monto'], 7);
  const tickJornadaCol = colFor('tickets', ['Jornada ID', 'JornadaID', 'Jornada'], 8);
  const tickSaldoCol = colFor('tickets', ['Saldo Pendiente', 'Saldo', 'Pendiente'], 14);

  const otrIngMontoCol = colFor('otrosIngresos', ['Monto', 'Importe', 'Total', 'Ingreso'], 4);
  const egrMontoCol = colFor('egresos', ['Monto', 'Importe', 'Total', 'Costo'], 4);
  const egrJornadaCol = colFor('egresos', ['Jornada ID', 'JornadaID', 'Jornada'], 6);
  const sueMontoCol = colFor('sueldos', ['Monto', 'Sueldo', 'Importe'], 4);
  const conIdCol = colFor('conceptosGasto', ['Concepto', 'Nombre', 'ID'], 1);

  return [
    ['PRODUCTOS ASTORGA — RESUMEN GENERAL DEL NEGOCIO', '', 'Actualizado automáticamente'],
    ['Indicador', 'Valor / Total', 'Detalle / Origen'],
    ['Productos registrados', `=COUNTA(${tabRef('productos', prodIdCol)})`, `Pestaña ${mapping.productos || DEFAULT_TAB_NAMES.productos}`],
    ['Clientes registrados', `=COUNTA(${tabRef('clientes', cliIdCol)})`, `Pestaña ${mapping.clientes || DEFAULT_TAB_NAMES.clientes}`],
    ['Rutas registradas', `=COUNTA(${tabRef('rutas', rutIdCol)})`, `Pestaña ${mapping.rutas || DEFAULT_TAB_NAMES.rutas}`],
    ['Tickets emitidos', `=COUNTA(${tabRef('tickets', tickFolioCol)})`, `Pestaña ${mapping.tickets || DEFAULT_TAB_NAMES.tickets}`],
    ['Piezas totales vendidas', `=SUM(${tabRef('tickets', tickPiezasCol)})`, 'Suma de piezas en Tickets'],
    ['Ingresos por jornadas (consolidadas)', `=SUM(${tabRef('jornadas', jorImporteCol)})-SUMIF(${tabRef('egresos', egrJornadaCol)},"<>",${tabRef('egresos', egrMontoCol)})`, `Suma neta en ${mapping.jornadas || DEFAULT_TAB_NAMES.jornadas}`],
    ['Ingresos por tickets directos (sin jornada)', `=SUMIF(${tabRef('tickets', tickJornadaCol)},"",${tabRef('tickets', tickImporteCol)})`, 'Tickets individuales fuera de jornada'],
    ['Ingresos por otros conceptos', `=SUM(${tabRef('otrosIngresos', otrIngMontoCol)})`, `Suma en ${mapping.otrosIngresos || DEFAULT_TAB_NAMES.otrosIngresos}`],
    ['Ingresos totales acumulados', '=B8+B9+B10', 'Jornadas + tickets directos + otros ingresos'],
    ['Egresos y gastos generales', `=SUMIF(${tabRef('egresos', egrJornadaCol)},"",${tabRef('egresos', egrMontoCol)})`, `Gastos generales en ${mapping.egresos || DEFAULT_TAB_NAMES.egresos}`],
    ['Sueldos totales (registro separado)', `=SUM(${tabRef('sueldos', sueMontoCol)})`, `Salen de utilidad · Pestaña ${mapping.sueldos || DEFAULT_TAB_NAMES.sueldos}`],
    ['Utilidad neta (Ingresos - Egresos)', '=B11-B12', 'Solo resta egresos (sueldos separados)'],
    ['Utilidad neta acumulada', '=B11-B12', 'Ingresos menos egresos operativos'],
    ['Jornadas registradas', `=COUNTA(${tabRef('jornadas', jorIdCol)})`, `Pestaña ${mapping.jornadas || DEFAULT_TAB_NAMES.jornadas}`],
    ['Conceptos de gasto guardados', `=COUNTA(${tabRef('conceptosGasto', conIdCol)})`, `Pestaña ${mapping.conceptosGasto || DEFAULT_TAB_NAMES.conceptosGasto}`],
    ['DESGLOSE POR TIPO DE VENTA', 'Tickets', 'Importe Total'],
    [
      'Ventas Mayoreo',
      `=COUNTIF(${tabRef('tickets', tickTipoCol)},"Mayoreo")`,
      `=SUMIF(${tabRef('tickets', tickTipoCol)},"Mayoreo",${tabRef('tickets', tickImporteCol)})`,
    ],
    [
      'Ventas Menudeo',
      `=COUNTIF(${tabRef('tickets', tickTipoCol)},"Menudeo")`,
      `=SUMIF(${tabRef('tickets', tickTipoCol)},"Menudeo",${tabRef('tickets', tickImporteCol)})`,
    ],
    ['CONTROL DE INVENTARIO, JORNADAS Y COBRANZA', 'Cantidad / Saldo', 'Detalle'],
    [
      'Piezas en inventario general',
      `=SUM(${tabRef('productos', prodInvCol)})`,
      `Existencias totales en ${mapping.productos || DEFAULT_TAB_NAMES.productos}`,
    ],
    [
      'Jornadas abiertas en curso',
      `=COUNTIF(${tabRef('jornadas', jorEstadoCol)},"Abierta")`,
      `Jornadas activas en ${mapping.jornadas || DEFAULT_TAB_NAMES.jornadas}`,
    ],
    [
      'Cuentas por cobrar pendientes',
      `=SUM(${tabRef('tickets', tickSaldoCol)})`,
      `Saldos pendientes en ${mapping.tickets || DEFAULT_TAB_NAMES.tickets}`,
    ],
  ];
}

function buildTabFormattingRequests(
  sheetId: number,
  key: LogicalTabKey,
  headerRow: string[]
): any[] {
  const colCount = Math.max(headerRow.length, TAB_HEADERS[key].length);
  const requests: any[] = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          tabColor: TAB_COLORS[key],
          gridProperties: { frozenRowCount: 1 },
        },
        fields: 'tabColor,gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: colCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.29, green: 0.15, blue: 0.07 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: colCount,
          },
        },
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: colCount },
        properties: { pixelSize: 150 },
        fields: 'pixelSize',
      },
    },
  ];

  const headerNorms = headerRow.map((h) => normalizeText(h).replace(/[\s_-]+/g, ''));
  const currencyNorms = new Set(CURRENCY_HEADER_NORMS[key] || []);
  const integerNorms = new Set(INTEGER_HEADER_NORMS[key] || []);
  const textNorms = new Set(TEXT_HEADER_NORMS[key] || []);

  headerNorms.forEach((norm, idx) => {
    if (currencyNorms.has(norm)) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: idx, endColumnIndex: idx + 1 },
          cell: {
            userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' } },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      });
    } else if (integerNorms.has(norm)) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: idx, endColumnIndex: idx + 1 },
          cell: {
            userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' } },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      });
    } else if (textNorms.has(norm)) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: idx, endColumnIndex: idx + 1 },
          cell: {
            userEnteredFormat: { numberFormat: { type: 'TEXT' } },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      });
    }
  });

  return requests;
}

function buildResumenFormattingRequests(resumenSheetId: number): any[] {
  return [
    {
      updateSheetProperties: {
        properties: {
          sheetId: resumenSheetId,
          index: 0,
          tabColor: TAB_COLORS.Resumen_General,
          gridProperties: { frozenRowCount: 2 },
        },
        fields: 'index,tabColor,gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: resumenSheetId,
          startRowIndex: 0,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.29, green: 0.15, blue: 0.07 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 11,
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: resumenSheetId,
          startRowIndex: 17,
          endRowIndex: 18,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.94, green: 0.91, blue: 0.86 },
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: resumenSheetId,
          startRowIndex: 20,
          endRowIndex: 21,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.94, green: 0.91, blue: 0.86 },
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: resumenSheetId,
          startRowIndex: 7,
          endRowIndex: 15,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' },
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(numberFormat,textFormat)',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: resumenSheetId,
          startRowIndex: 18,
          endRowIndex: 20,
          startColumnIndex: 2,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' } },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: resumenSheetId,
          startRowIndex: 23,
          endRowIndex: 24,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' },
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(numberFormat,textFormat)',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: resumenSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 290 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: resumenSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 },
        properties: { pixelSize: 210 },
        fields: 'pixelSize',
      },
    },
  ];
}

export async function createAstorgaSpreadsheet(
  token: string,
  customTitle?: string,
  seedDataset?: BusinessDataset
): Promise<{
  metadata: SpreadsheetMetadata;
  mapping: SheetTabMapping;
}> {
  const keys = Object.keys(DEFAULT_TAB_NAMES) as LogicalTabKey[];
  const finalTitle = customTitle?.trim() || 'Productos Astorga - Registro Completo';

  const sheetsConfig = [
    {
      properties: {
        title: 'Resumen_General',
        index: 0,
        tabColor: TAB_COLORS.Resumen_General,
        gridProperties: { frozenRowCount: 2 },
      },
    },
    ...keys.map((key, idx) => ({
      properties: {
        title: DEFAULT_TAB_NAMES[key],
        index: idx + 1,
        tabColor: TAB_COLORS[key],
        gridProperties: { frozenRowCount: 1 },
      },
    })),
  ];

  const created = await googleFetch<any>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: finalTitle,
          locale: 'es_MX',
        },
        sheets: sheetsConfig,
      }),
    }
  );

  const spreadsheetId = created.spreadsheetId;
  const sheetIds: Record<string, number> = {};
  for (const s of created.sheets || []) {
    if (s?.properties?.title && typeof s?.properties?.sheetId === 'number') {
      sheetIds[s.properties.title] = s.properties.sheetId;
    }
  }

  const defaultHeadersByTab: Partial<Record<LogicalTabKey, Record<string, number>>> = {};
  keys.forEach((k) => {
    defaultHeadersByTab[k] = buildHeaderIndex(TAB_HEADERS[k]);
  });

  const resumenRows = buildDynamicResumenRows(DEFAULT_TAB_NAMES, defaultHeadersByTab);

  const batchData: { range: string; values: (string | number)[][] }[] = [
    {
      range: `${quoteSheetName('Resumen_General')}!A1`,
      values: resumenRows,
    },
    ...keys.map((key) => ({
      range: `${quoteSheetName(DEFAULT_TAB_NAMES[key])}!A1`,
      values: [TAB_HEADERS[key]],
    })),
  ];

  if (seedDataset) {
    if (seedDataset.productos.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.productos)}!A2`,
        values: seedDataset.productos.map((p) => [
          p.id,
          p.nombre,
          p.categoria,
          p.unidad,
          p.precioMayoreo,
          p.precioMenudeo,
          p.inventario ?? 0,
          p.activo ? 'Sí' : 'No',
        ]),
      });
    }
    if (seedDataset.clientes.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.clientes)}!A2`,
        values: seedDataset.clientes.map((c) => [
          c.id,
          c.nombre,
          c.ruta,
          asLiteralText(c.telefono || ''),
          c.direccion || '',
          c.notas || '',
          asLiteralText(c.fechaRegistro || ''),
        ]),
      });
    }
    if (seedDataset.rutas.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.rutas)}!A2`,
        values: seedDataset.rutas.map((r) => [
          r.id,
          r.nombre,
          r.descripcion || '',
          r.activa ? 'Sí' : 'No',
        ]),
      });
    }
    if (seedDataset.tickets.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.tickets)}!A2`,
        values: seedDataset.tickets.map((t) => {
          const pay = getTicketPaymentSummary(t);
          const totals = computeTicketTotals(t.items || [], t);
          return [
            t.folio,
            asLiteralText(t.fecha),
            t.ruta,
            t.clienteId,
            t.clienteNombre,
            t.tipoVenta,
            t.totalPiezas,
            t.totalImporte,
            t.jornadaId || '',
            t.detalleTexto || '',
            JSON.stringify(t.items || []),
            pay.metodoPago,
            pay.estadoPago,
            pay.montoPagado,
            pay.saldoPendiente,
            JSON.stringify(pay.abonos || []),
            totals.subtotalBruto,
            totals.descuentoMonto > 0 ? totals.descuentoTipo : '',
            totals.descuentoMonto > 0 ? totals.descuentoValor : 0,
            totals.descuentoMonto,
            totals.descuentoMotivo,
          ];
        }),
      });
    }
    if (seedDataset.jornadas.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.jornadas)}!A2`,
        values: seedDataset.jornadas.map((j) => [
          j.id,
          asLiteralText(j.fecha),
          j.ruta,
          j.nombre,
          j.ticketFolios.join(', '),
          j.totalTickets,
          j.totalPiezas,
          j.totalImporte,
          j.estado,
          j.notas || '',
          JSON.stringify(j.inventario || []),
          JSON.stringify(j.visitas || []),
          JSON.stringify(j.conciliacion || []),
          j.fondoRuta ?? 0,
        ]),
      });
    }
    if (seedDataset.movimientosInventario && seedDataset.movimientosInventario.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.movimientosInventario)}!A2`,
        values: seedDataset.movimientosInventario.map((m) => [
          m.id,
          asLiteralText(m.fecha),
          m.tipo,
          m.productoId,
          m.productoNombre,
          m.cantidadDelta,
          m.stockResultante,
          m.referencia || '',
          m.notas || '',
        ]),
      });
    }
    if (seedDataset.otrosIngresos && seedDataset.otrosIngresos.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.otrosIngresos)}!A2`,
        values: seedDataset.otrosIngresos.map((o) => [
          o.id,
          asLiteralText(o.fecha),
          o.categoria,
          o.concepto,
          o.monto,
          o.notas || '',
        ]),
      });
    }
    if (seedDataset.conceptosIngreso && seedDataset.conceptosIngreso.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.conceptosIngreso)}!A2`,
        values: seedDataset.conceptosIngreso.map((c) => [
          c.id,
          c.concepto,
          c.categoria,
          c.montoSugerido,
        ]),
      });
    }
    if (seedDataset.egresos.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.egresos)}!A2`,
        values: seedDataset.egresos.map((e) => [
          e.id,
          asLiteralText(e.fecha),
          e.categoria,
          e.concepto,
          e.monto,
          e.notas || '',
          e.jornadaId || '',
        ]),
      });
    }
    if (seedDataset.conceptosGasto.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.conceptosGasto)}!A2`,
        values: seedDataset.conceptosGasto.map((c) => [
          c.id,
          c.concepto,
          c.categoria,
          c.montoSugerido,
        ]),
      });
    }
    if (seedDataset.sueldos.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.sueldos)}!A2`,
        values: seedDataset.sueldos.map((s) => [
          s.id,
          asLiteralText(s.fecha),
          s.trabajador,
          s.concepto,
          s.monto,
          s.notas || '',
        ]),
      });
    }
    if (seedDataset.finanzasMensuales.length > 0) {
      batchData.push({
        range: `${quoteSheetName(DEFAULT_TAB_NAMES.finanzasMensuales)}!A2`,
        values: seedDataset.finanzasMensuales.map((f) => [
          asLiteralText(f.mes),
          f.fondoBase,
          f.ingresos,
          f.egresos,
          f.utilidadPreliminar,
          f.sueldos,
          f.utilidadNeta,
          f.fondoTotal,
          f.cerrado ? 'Sí' : 'No',
          asLiteralText(f.fechaCierre || ''),
        ]),
      });
    }
  }

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: batchData,
      }),
    }
  );

  const formatRequests: any[] = [];
  const resumenSheetId = sheetIds['Resumen_General'];
  if (typeof resumenSheetId === 'number') {
    formatRequests.push(...buildResumenFormattingRequests(resumenSheetId));
  }

  for (const key of keys) {
    const sid = sheetIds[DEFAULT_TAB_NAMES[key]];
    if (typeof sid === 'number') {
      formatRequests.push(...buildTabFormattingRequests(sid, key, TAB_HEADERS[key]));
    }
  }

  if (formatRequests.length > 0) {
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ requests: formatRequests }),
      }
    );
  }

  return {
    metadata: {
      spreadsheetId,
      title: created.properties?.title || finalTitle,
      sheetTitles: ['Resumen_General', ...keys.map((k) => DEFAULT_TAB_NAMES[k])],
      sheetIds,
    },
    mapping: { ...DEFAULT_TAB_NAMES },
  };
}

export async function initializeMissingTabs(
  token: string,
  spreadsheetId: string,
  missingKeys: LogicalTabKey[]
): Promise<Partial<SheetTabMapping>> {
  if (missingKeys.length === 0) return {};

  const createdRes = await googleFetch<any>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: missingKeys.map((key) => ({
          addSheet: {
            properties: {
              title: DEFAULT_TAB_NAMES[key],
              tabColor: TAB_COLORS[key],
              gridProperties: { frozenRowCount: 1 },
            },
          },
        })),
      }),
    }
  );

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: missingKeys.map((key) => ({
          range: `${quoteSheetName(DEFAULT_TAB_NAMES[key])}!A1`,
          values: [TAB_HEADERS[key]],
        })),
      }),
    }
  );

  // Format newly added sheets
  const formatRequests: any[] = [];
  const replies = createdRes?.replies || [];
  missingKeys.forEach((key, idx) => {
    const sid = replies[idx]?.addSheet?.properties?.sheetId;
    if (typeof sid === 'number') {
      formatRequests.push(...buildTabFormattingRequests(sid, key, TAB_HEADERS[key]));
    }
  });
  if (formatRequests.length > 0) {
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ requests: formatRequests }),
      }
    );
  }

  const added: Partial<SheetTabMapping> = {};
  missingKeys.forEach((k) => {
    added[k] = DEFAULT_TAB_NAMES[k];
  });
  return added;
}

const KNOWN_HEADER_KEYWORDS: Record<LogicalTabKey, string[]> = {
  productos: ['nombre', 'producto', 'preciomayoreo', 'preciomenudeo', 'categoria'],
  clientes: ['nombre', 'cliente', 'ruta', 'telefono'],
  rutas: ['nombre', 'ruta', 'descripcion', 'activa'],
  tickets: ['folio', 'fecha', 'cliente', 'total', 'importe'],
  jornadas: ['nombre', 'jornada', 'folios', 'tickets', 'fecha'],
  movimientosInventario: ['producto', 'tipo', 'cantidad', 'fecha', 'referencia'],
  otrosIngresos: ['concepto', 'monto', 'categoria', 'fecha'],
  conceptosIngreso: ['concepto', 'categoria', 'monto', 'montosugerido'],
  egresos: ['concepto', 'monto', 'categoria', 'fecha'],
  conceptosGasto: ['concepto', 'categoria', 'monto', 'montosugerido'],
  sueldos: ['trabajador', 'empleado', 'sueldo', 'monto', 'fecha'],
  finanzasMensuales: ['mes', 'fondobase', 'ingresos', 'egresos', 'utilidad'],
  configuracion: ['clave', 'valorjson', 'valor', 'actualizado'],
};

function looksLikeHeaderRow(key: LogicalTabKey, row1: any[]): boolean {
  const norms = row1
    .map((c) => normalizeText(String(c || '')).replace(/[\s_-]+/g, ''))
    .filter(Boolean);
  if (norms.length === 0) return false;
  const keywords = KNOWN_HEADER_KEYWORDS[key];
  const matches = norms.filter((n) => keywords.some((kw) => n === kw || n.includes(kw)));
  return matches.length >= 2;
}

export interface SpreadsheetHealthReport {
  isHealthy: boolean;
  issues: string[];
  missingTabs: LogicalTabKey[];
  hasResumenGeneral: boolean;
}

export async function inspectSpreadsheetStructure(
  token: string,
  spreadsheetId: string,
  mapping: Partial<SheetTabMapping>,
  sheetTitles: string[]
): Promise<SpreadsheetHealthReport> {
  const issues: string[] = [];
  const allKeys = Object.keys(DEFAULT_TAB_NAMES) as LogicalTabKey[];
  const missingTabs = allKeys.filter((k) => !mapping[k]);

  if (missingTabs.length > 0) {
    issues.push(
      `Faltan ${missingTabs.length} pestaña(s): ${missingTabs
        .map((k) => DEFAULT_TAB_NAMES[k])
        .join(', ')}.`
    );
  }

  const hasResumenGeneral = sheetTitles.some(
    (t) => normalizeText(t).replace(/[\s_-]+/g, '') === 'resumengeneral'
  );
  if (!hasResumenGeneral) {
    issues.push('Falta la pestaña de Resumen_General con cálculos automáticos.');
  }

  const presentEntries = allKeys
    .filter((k) => Boolean(mapping[k]))
    .map((k) => [k, mapping[k]!] as [LogicalTabKey, string]);

  if (presentEntries.length > 0) {
    const rangesQuery = presentEntries
      .map(([, title]) => `ranges=${encodeURIComponent(`${quoteSheetName(title)}!1:1`)}`)
      .join('&');
    const res = await googleFetch<{ valueRanges?: { values?: any[][] }[] }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchGet?${rangesQuery}`,
      token
    );

    presentEntries.forEach(([key, title], idx) => {
      const row1 = res.valueRanges?.[idx]?.values?.[0] || [];
      if (isRowEmpty(row1)) {
        issues.push(`La pestaña "${title}" no tiene encabezados en la fila 1.`);
        return;
      }
      if (!looksLikeHeaderRow(key, row1)) {
        issues.push(
          `La fila 1 de "${title}" parece tener datos en lugar de encabezados de columna.`
        );
        return;
      }
      const headerIdx = buildHeaderIndex(row1.map(String));
      const missingCols = TAB_HEADERS[key].filter((expected) => {
        const expectedNorm = normalizeText(expected).replace(/[\s_-]+/g, '');
        const existing = findHeaderColIndex(headerIdx, getFieldAliases(key, expected));
        return existing === undefined && headerIdx[expectedNorm] === undefined;
      });
      if (missingCols.length > 0) {
        issues.push(
          `A "${title}" le faltan columnas recomendadas (${missingCols.join(', ')}).`
        );
      }
    });
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    missingTabs,
    hasResumenGeneral,
  };
}

export async function repairSpreadsheetStructure(
  token: string,
  spreadsheetId: string,
  currentMapping: Partial<SheetTabMapping>
): Promise<{
  metadata: SpreadsheetMetadata;
  mapping: Partial<SheetTabMapping>;
  repairsApplied: string[];
}> {
  const repairsApplied: string[] = [];
  let meta = await getSpreadsheetMetadata(token, spreadsheetId);
  const detected = detectTabMapping(meta.sheetTitles);
  const mapping: Partial<SheetTabMapping> = { ...detected.mapping, ...currentMapping };

  // Validate mapped tabs still exist
  const titleSet = new Set(meta.sheetTitles);
  const allKeys = Object.keys(DEFAULT_TAB_NAMES) as LogicalTabKey[];
  for (const key of allKeys) {
    if (mapping[key] && !titleSet.has(mapping[key]!)) {
      delete mapping[key];
    }
  }

  // 1. Create missing data tabs
  const missingDataKeys = allKeys.filter((k) => !mapping[k]);
  if (missingDataKeys.length > 0) {
    const added = await initializeMissingTabs(token, spreadsheetId, missingDataKeys);
    Object.assign(mapping, added);
    repairsApplied.push(
      `Se crearon ${missingDataKeys.length} pestaña(s) faltante(s): ${missingDataKeys
        .map((k) => DEFAULT_TAB_NAMES[k])
        .join(', ')}.`
    );
  }

  // 2. Create Resumen_General if missing
  const existingResumenTitle = meta.sheetTitles.find(
    (t) => normalizeText(t).replace(/[\s_-]+/g, '') === 'resumengeneral'
  );
  if (!existingResumenTitle) {
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Resumen_General',
                  index: 0,
                  tabColor: TAB_COLORS.Resumen_General,
                  gridProperties: { frozenRowCount: 2 },
                },
              },
            },
          ],
        }),
      }
    );
    repairsApplied.push('Se creó la hoja Resumen_General con totales automáticos.');
  }

  meta = await getSpreadsheetMetadata(token, spreadsheetId);

  // 3. Inspect row 1 of each data tab
  const mappedEntries = allKeys.map((k) => [k, mapping[k]!] as [LogicalTabKey, string]);
  const rangesQuery = mappedEntries
    .map(([, title]) => `ranges=${encodeURIComponent(`${quoteSheetName(title)}!1:2`)}`)
    .join('&');

  const rowRes = await googleFetch<{ valueRanges?: { values?: any[][] }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchGet?${rangesQuery}`,
    token
  );

  const insertRowRequests: any[] = [];
  const headerUpdates: { range: string; values: string[][] }[] = [];
  const finalHeadersByTab: Partial<Record<LogicalTabKey, string[]>> = {};
  const headerIdxByTab: Partial<Record<LogicalTabKey, Record<string, number>>> = {};

  mappedEntries.forEach(([key, title], idx) => {
    const rows = rowRes.valueRanges?.[idx]?.values || [];
    const row1 = (rows[0] || []).map((c) => String(c ?? '').trim());
    const sid = meta.sheetIds[title];

    if (isRowEmpty(row1)) {
      const targetHeaders = [...TAB_HEADERS[key]];
      headerUpdates.push({
        range: `${quoteSheetName(title)}!A1`,
        values: [targetHeaders],
      });
      finalHeadersByTab[key] = targetHeaders;
      headerIdxByTab[key] = buildHeaderIndex(targetHeaders);
      repairsApplied.push(`Se agregaron los encabezados estándar en "${title}".`);
    } else if (!looksLikeHeaderRow(key, row1)) {
      if (typeof sid === 'number') {
        insertRowRequests.push({
          insertDimension: {
            range: {
              sheetId: sid,
              dimension: 'ROWS',
              startIndex: 0,
              endIndex: 1,
            },
            inheritFromBefore: false,
          },
        });
      }
      const targetHeaders = [...TAB_HEADERS[key]];
      headerUpdates.push({
        range: `${quoteSheetName(title)}!A1`,
        values: [targetHeaders],
      });
      finalHeadersByTab[key] = targetHeaders;
      headerIdxByTab[key] = buildHeaderIndex(targetHeaders);
      repairsApplied.push(
        `Se restauró la fila de encabezados en "${title}" sin perder los datos existentes.`
      );
    } else {
      const currentHeaders = [...row1];
      const hIdx = buildHeaderIndex(currentHeaders);
      const addedCols: string[] = [];

      for (const expectedHeader of TAB_HEADERS[key]) {
        const expectedNorm = normalizeText(expectedHeader).replace(/[\s_-]+/g, '');
        // Check if expected header or any known alias for that field already exists
        const aliases = getFieldAliases(key, expectedHeader);
        const existingCol = findHeaderColIndex(hIdx, aliases);
        if (existingCol === undefined && hIdx[expectedNorm] === undefined) {
          currentHeaders.push(expectedHeader);
          hIdx[expectedNorm] = currentHeaders.length - 1;
          addedCols.push(expectedHeader);
        }
      }

      if (addedCols.length > 0) {
        headerUpdates.push({
          range: `${quoteSheetName(title)}!A1`,
          values: [currentHeaders],
        });
        repairsApplied.push(
          `Se agregaron columnas faltantes en "${title}": ${addedCols.join(', ')}.`
        );
      }

      finalHeadersByTab[key] = currentHeaders;
      headerIdxByTab[key] = buildHeaderIndex(currentHeaders);
    }
  });

  if (insertRowRequests.length > 0) {
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ requests: insertRowRequests }),
      }
    );
  }

  // Update Resumen_General dynamic formulas + any header updates
  const resumenTitle =
    meta.sheetTitles.find(
      (t) => normalizeText(t).replace(/[\s_-]+/g, '') === 'resumengeneral'
    ) || 'Resumen_General';
  const resumenRows = buildDynamicResumenRows(mapping, headerIdxByTab);

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `${quoteSheetName(resumenTitle)}!A1`,
            values: resumenRows,
          },
          ...headerUpdates,
        ],
      }),
    }
  );

  // Format all sheets cleanly
  const formatRequests: any[] = [];
  const resumenSid = meta.sheetIds[resumenTitle];
  if (typeof resumenSid === 'number') {
    formatRequests.push(...buildResumenFormattingRequests(resumenSid));
  }
  mappedEntries.forEach(([key, title]) => {
    const sid = meta.sheetIds[title];
    const headers = finalHeadersByTab[key] || TAB_HEADERS[key];
    if (typeof sid === 'number') {
      formatRequests.push(...buildTabFormattingRequests(sid, key, headers));
    }
  });

  if (formatRequests.length > 0) {
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ requests: formatRequests }),
      }
    );
  }

  if (repairsApplied.length === 0) {
    repairsApplied.push(
      'Se actualizó el formato, filtros y fórmulas de Resumen_General en todas las pestañas.'
    );
  }

  meta = await getSpreadsheetMetadata(token, spreadsheetId);
  return { metadata: meta, mapping, repairsApplied };
}

function getFieldAliases(key: LogicalTabKey, standardHeader: string): string[] {
  const norm = normalizeText(standardHeader).replace(/[\s_-]+/g, '');
  const map: Record<LogicalTabKey, Record<string, string[]>> = {
    productos: {
      id: ['ID', 'Codigo', 'SKU', 'Producto ID'],
      nombre: ['Nombre', 'Producto', 'Articulo', 'Descripcion'],
      categoria: ['Categoria', 'Tipo', 'Linea'],
      unidad: ['Unidad', 'Presentacion', 'Medida'],
      preciomayoreo: ['Precio Mayoreo', 'Mayoreo', 'PrecioMayor'],
      preciomenudeo: ['Precio Menudeo', 'Menudeo', 'PrecioPublico', 'Precio'],
      inventario: ['Inventario', 'Stock', 'Existencias', 'Cantidad Disponible', 'Existencia'],
      activo: ['Activo', 'Estado', 'Disponible', 'Estatus'],
    },
    clientes: {
      id: ['ID', 'ClienteID', 'Cliente ID', 'Codigo'],
      nombre: ['Nombre', 'Cliente', 'Negocio', 'Tienda'],
      ruta: ['Ruta', 'Zona'],
      telefono: ['Telefono', 'Celular', 'Tel', 'WhatsApp'],
      direccion: ['Direccion', 'Domicilio', 'Ubicacion'],
      notas: ['Notas', 'Observaciones', 'Comentarios'],
      fecharegistro: ['Fecha Registro', 'Fecha', 'Registro'],
    },
    rutas: {
      id: ['ID', 'RutaID', 'Ruta ID'],
      nombre: ['Nombre', 'Ruta'],
      descripcion: ['Descripcion', 'Zona', 'Notas', 'Detalle'],
      activa: ['Activa', 'Activo', 'Estado', 'Estatus'],
    },
    tickets: {
      folio: ['Folio', 'ID', 'Ticket', 'No Ticket'],
      fecha: ['Fecha', 'Fecha Venta'],
      ruta: ['Ruta', 'Zona'],
      clienteid: ['Cliente ID', 'ClienteID', 'ID Cliente'],
      clientenombre: ['Cliente Nombre', 'Cliente', 'Nombre Cliente'],
      tipoventa: ['Tipo Venta', 'Tipo', 'Modalidad'],
      totalpiezas: ['Total Piezas', 'Piezas', 'Cantidad'],
      totalimporte: ['Total Importe', 'Total', 'Importe', 'Monto'],
      jornadaid: ['Jornada ID', 'JornadaID', 'Jornada'],
      detalleproductos: ['Detalle Productos', 'Detalle', 'Productos'],
      itemsjson: ['Items JSON', 'Items', 'JSON'],
      metodopago: ['Metodo Pago', 'Método Pago', 'Forma Pago'],
      estadopago: ['Estado Pago', 'Estatus Pago', 'Cobranza'],
      montopagado: ['Monto Pagado', 'Pagado', 'Abonado'],
      saldopendiente: ['Saldo Pendiente', 'Saldo', 'Pendiente', 'Por Cobrar'],
      abonosjson: ['Abonos JSON', 'Abonos', 'Pagos JSON'],
      subtotalbruto: ['Subtotal Bruto', 'Subtotal', 'Importe Bruto'],
      descuentotipo: ['Descuento Tipo', 'Tipo Descuento'],
      descuentovalor: ['Descuento Valor', 'Valor Descuento'],
      descuentomonto: ['Descuento Monto', 'Descuento', 'Monto Descuento'],
      descuentomotivo: ['Descuento Motivo', 'Motivo Descuento', 'Nota Descuento'],
    },
    jornadas: {
      id: ['ID', 'Jornada ID', 'JornadaID'],
      fecha: ['Fecha'],
      ruta: ['Ruta'],
      nombrejornada: ['Nombre Jornada', 'Nombre', 'Jornada'],
      foliostickets: ['Folios Tickets', 'Folios', 'Tickets'],
      totaltickets: ['Total Tickets', 'Tickets Count', 'Cantidad Tickets'],
      totalpiezas: ['Total Piezas', 'Piezas'],
      totalimporte: ['Total Importe', 'Total', 'Importe'],
      estado: ['Estado', 'Estatus'],
      notas: ['Notas', 'Observaciones'],
      inventariojson: ['Inventario JSON', 'Inventario', 'Productos Jornada', 'Carga JSON'],
      visitasjson: ['Visitas JSON', 'Visitas', 'Checklist Ruta'],
      conciliacionjson: ['Conciliacion JSON', 'Conciliación JSON', 'Conciliacion', 'Mermas JSON'],
      fondoruta: ['Fondo Ruta', 'Fondo de Ruta', 'Fondo Inicial', 'Fondo', 'Caja Ruta'],
    },
    movimientosInventario: {
      id: ['ID', 'Movimiento ID'],
      fecha: ['Fecha', 'Fecha Movimiento'],
      tipo: ['Tipo', 'Movimiento', 'Concepto'],
      productoid: ['Producto ID', 'ProductoID'],
      producto: ['Producto', 'Producto Nombre', 'Articulo'],
      productonombre: ['Producto', 'Producto Nombre', 'Articulo'],
      cantidad: ['Cantidad', 'Cantidad Delta', 'Piezas', 'Delta'],
      cantidaddelta: ['Cantidad', 'Cantidad Delta', 'Piezas', 'Delta'],
      stockresultante: ['Stock Resultante', 'Stock', 'Inventario Resultante', 'Saldo Stock'],
      referencia: ['Referencia', 'Folio', 'Jornada'],
      notas: ['Notas', 'Motivo', 'Observaciones'],
    },
    otrosIngresos: {
      id: ['ID', 'Ingreso ID', 'Folio'],
      fecha: ['Fecha', 'Fecha Ingreso'],
      categoria: ['Categoria', 'Tipo', 'Rubro'],
      concepto: ['Concepto', 'Descripcion', 'Detalle', 'Nombre'],
      monto: ['Monto', 'Importe', 'Total', 'Ingreso'],
      notas: ['Notas', 'Observaciones', 'Comentarios'],
    },
    conceptosIngreso: {
      id: ['ID', 'Concepto ID'],
      concepto: ['Concepto', 'Nombre', 'Descripcion', 'Concepto Ingreso'],
      categoria: ['Categoria', 'Tipo', 'Rubro'],
      montosugerido: ['Monto Sugerido', 'Monto', 'Precio', 'Importe'],
    },
    egresos: {
      id: ['ID', 'Egreso ID', 'Folio'],
      fecha: ['Fecha', 'Fecha Gasto'],
      categoria: ['Categoria', 'Tipo', 'Rubro'],
      concepto: ['Concepto', 'Descripcion', 'Detalle', 'Nombre'],
      monto: ['Monto', 'Importe', 'Total', 'Costo', 'Gasto'],
      notas: ['Notas', 'Observaciones', 'Comentarios'],
      jornadaid: ['Jornada ID', 'JornadaID', 'Jornada'],
    },
    conceptosGasto: {
      id: ['ID', 'Concepto ID'],
      concepto: ['Concepto', 'Nombre', 'Descripcion', 'Concepto Gasto', 'Concepto Egreso'],
      categoria: ['Categoria', 'Tipo', 'Rubro'],
      montosugerido: ['Monto Sugerido', 'Monto', 'Costo', 'Precio', 'Importe'],
    },
    sueldos: {
      id: ['ID', 'Sueldo ID'],
      fecha: ['Fecha', 'Fecha Pago'],
      trabajador: ['Trabajador', 'Empleado', 'Nombre', 'Personal'],
      concepto: ['Concepto', 'Periodo', 'Descripcion'],
      monto: ['Monto', 'Sueldo', 'Importe', 'Pago', 'Total'],
      notas: ['Notas', 'Observaciones'],
    },
    finanzasMensuales: {
      mes: ['Mes', 'Periodo'],
      fondobase: ['Fondo Base', 'FondoBase', 'Fondo Inicial'],
      ingresos: ['Ingresos', 'Ventas'],
      egresos: ['Egresos', 'Gastos'],
      utilidadpreliminar: ['Utilidad Preliminar', 'UtilidadPreliminar'],
      sueldos: ['Sueldos', 'Nomina'],
      utilidadneta: ['Utilidad Neta', 'UtilidadNeta'],
      fondototal: ['Fondo Total', 'FondoTotal'],
      cerrado: ['Cerrado', 'Estado', 'Estatus'],
      fechacierre: ['Fecha Cierre', 'FechaCierre', 'Fecha'],
    },
    configuracion: {
      clave: ['Clave', 'Key', 'Nombre'],
      valorjson: ['Valor JSON', 'ValorJSON', 'Valor', 'JSON'],
      actualizado: ['Actualizado', 'Fecha', 'UpdatedAt'],
    },
  };
  return map[key][norm] || [standardHeader];
}

function parseItemsField(jsonStr: string, textStr: string): TicketItem[] {
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed.map((it: any) => {
          const subtotal = parseNumericValue(it.subtotal);
          const rawTipo = String(it.tipoItem || '').trim();
          const tipoItem: TicketItemTipo | undefined =
            rawTipo === 'Cortesía' ||
            rawTipo === 'Devolución' ||
            rawTipo === 'Cambio' ||
            rawTipo === 'Venta'
              ? rawTipo
              : subtotal < 0
              ? 'Devolución'
              : undefined;
          const item: TicketItem = {
            productoId: String(it.productoId || it.id || ''),
            productoNombre: String(it.productoNombre || it.nombre || ''),
            cantidad: parseNumericValue(it.cantidad),
            precioUnitario: parseNumericValue(it.precioUnitario),
            subtotal,
          };
          if (tipoItem && tipoItem !== 'Venta') {
            item.tipoItem = tipoItem;
          }
          if (it.regresarInventario !== undefined) {
            item.regresarInventario = Boolean(it.regresarInventario);
          }
          if (it.motivo) {
            item.motivo = String(it.motivo);
          }
          return item;
        });
      }
    } catch {
      // Fallback to text parsing below
    }
  }
  if (!textStr) return [];
  const mainText = textStr.split('|')[0] || textStr;
  return mainText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, i) => {
      const m = part.match(
        /^(\d+(?:\.\d+)?)\s*x\s*(.+?)(?:\s*\[(Cortesía|Devolución|Cambio)[^\]]*\])?(?:\s*\((-?\$?[\d,.]+)\))?$/i
      );
      if (m) {
        const cantidad = parseNumericValue(m[1]);
        const productoNombre = m[2].trim();
        const tag = m[3];
        const subtotal = m[4] ? parseNumericValue(m[4]) : 0;
        const tipoItem: TicketItemTipo | undefined = tag
          ? (tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase() as TicketItemTipo)
          : subtotal < 0
          ? 'Devolución'
          : undefined;
        const precioUnitario = cantidad > 0 ? Math.abs(subtotal) / cantidad : 0;
        return {
          productoId: `parsed-${i}`,
          productoNombre,
          cantidad,
          precioUnitario,
          subtotal,
          ...(tipoItem && tipoItem !== 'Venta' ? { tipoItem } : {}),
        };
      }
      return {
        productoId: `parsed-${i}`,
        productoNombre: part,
        cantidad: 1,
        precioUnitario: 0,
        subtotal: 0,
      };
    });
}

function parseJornadaInventarioField(jsonStr: string): JornadaInventarioItem[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed
        .map((it: any) => ({
          productoId: String(it.productoId || it.id || ''),
          productoNombre: String(it.productoNombre || it.nombre || ''),
          cantidadInicial: Math.max(0, parseNumericValue(it.cantidadInicial ?? it.cantidad)),
          ...(it.cantidadDevuelta !== undefined
            ? { cantidadDevuelta: Math.max(0, parseNumericValue(it.cantidadDevuelta)) }
            : {}),
        }))
        .filter((it) => Boolean(it.productoId || it.productoNombre));
    }
  } catch {
    // Ignore malformed JSON
  }
  return [];
}

function parseJsonArrayField<T>(jsonStr: string): T[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadAllBusinessData(
  token: string,
  spreadsheetId: string,
  mapping: Partial<SheetTabMapping>
): Promise<BusinessDataset> {
  const presentEntries = (Object.entries(mapping) as [LogicalTabKey, string | undefined][]).filter(
    ([, title]) => Boolean(title)
  ) as [LogicalTabKey, string][];

  const dataset: BusinessDataset = {
    productos: [],
    clientes: [],
    rutas: [],
    tickets: [],
    jornadas: [],
    movimientosInventario: [],
    otrosIngresos: [],
    conceptosIngreso: [],
    egresos: [],
    conceptosGasto: [],
    sueldos: [],
    finanzasMensuales: [],
  };

  if (presentEntries.length === 0) return dataset;

  const rangesQuery = presentEntries
    .map(([, title]) => `ranges=${encodeURIComponent(`${quoteSheetName(title)}!A:Z`)}`)
    .join('&');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values:batchGet?${rangesQuery}`;

  const res = await googleFetch<{ valueRanges?: { range: string; values?: any[][] }[] }>(
    url,
    token
  );
  const valueRanges = res.valueRanges || [];

  presentEntries.forEach(([key], idx) => {
    const rows = valueRanges[idx]?.values || [];
    if (rows.length === 0) return;

    const firstRowHasHeaders = looksLikeHeaderRow(key, rows[0]);
    const headerIdx = firstRowHasHeaders
      ? buildHeaderIndex(rows[0].map(String))
      : buildHeaderIndex(TAB_HEADERS[key]);
    const startRow = firstRowHasHeaders ? 1 : 0;

    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (isRowEmpty(row)) continue;
      const rowNumber = r + 1;

      if (key === 'productos') {
        const nombre = getCell(row, headerIdx, ['Nombre', 'Producto', 'Articulo', 'Descripcion'], 1);
        if (!nombre) continue;
        dataset.productos.push({
          id: getCell(row, headerIdx, ['ID', 'Codigo', 'SKU', 'Producto ID'], 0) || `PROD-${rowNumber}`,
          nombre,
          categoria: getCell(row, headerIdx, ['Categoria', 'Tipo', 'Linea'], 2) || 'Dulce típico',
          unidad: getCell(row, headerIdx, ['Unidad', 'Presentacion', 'Medida'], 3) || 'Pieza',
          precioMayoreo: parseNumericValue(
            getCell(row, headerIdx, ['Precio Mayoreo', 'Mayoreo', 'PrecioMayor'], 4)
          ),
          precioMenudeo: parseNumericValue(
            getCell(row, headerIdx, ['Precio Menudeo', 'Menudeo', 'PrecioPublico', 'Precio'], 5)
          ),
          inventario: Math.max(
            0,
            parseNumericValue(
              getCell(
                row,
                headerIdx,
                ['Inventario', 'Stock', 'Existencias', 'Cantidad Disponible', 'Existencia'],
                firstRowHasHeaders ? -1 : 6
              )
            )
          ),
          activo: parseBool(getCell(row, headerIdx, ['Activo', 'Estado', 'Disponible', 'Estatus'], 7), true),
          rowNumber,
        });
      } else if (key === 'clientes') {
        const nombre = getCell(row, headerIdx, ['Nombre', 'Cliente', 'Negocio', 'Tienda'], 1);
        if (!nombre) continue;
        dataset.clientes.push({
          id: getCell(row, headerIdx, ['ID', 'ClienteID', 'Cliente ID', 'Codigo'], 0) || `CLI-${rowNumber}`,
          nombre,
          ruta: getCell(row, headerIdx, ['Ruta', 'Zona'], 2) || 'Sin ruta',
          telefono: getCell(row, headerIdx, ['Telefono', 'Celular', 'Tel', 'WhatsApp'], 3),
          direccion: getCell(row, headerIdx, ['Direccion', 'Domicilio', 'Ubicacion'], 4),
          notas: getCell(row, headerIdx, ['Notas', 'Observaciones', 'Comentarios'], 5),
          fechaRegistro: normalizeSheetDate(
            getCell(row, headerIdx, ['Fecha Registro', 'Fecha', 'Registro'], 6)
          ),
          rowNumber,
        });
      } else if (key === 'rutas') {
        const nombre =
          getCell(row, headerIdx, ['Nombre', 'Ruta'], 1) || getCell(row, headerIdx, ['ID'], 0);
        if (!nombre) continue;
        dataset.rutas.push({
          id: getCell(row, headerIdx, ['ID', 'RutaID', 'Ruta ID'], 0) || `RUT-${rowNumber}`,
          nombre,
          descripcion: getCell(row, headerIdx, ['Descripcion', 'Zona', 'Notas', 'Detalle'], 2),
          activa: parseBool(getCell(row, headerIdx, ['Activa', 'Activo', 'Estado', 'Estatus'], 3), true),
          rowNumber,
        });
      } else if (key === 'tickets') {
        const folio = getCell(row, headerIdx, ['Folio', 'ID', 'Ticket', 'No Ticket'], 0);
        if (!folio) continue;
        const tipoRaw = getCell(row, headerIdx, ['Tipo Venta', 'Tipo', 'Modalidad'], 5);
        const tipoVenta: TipoVenta = normalizeText(tipoRaw).includes('mayoreo')
          ? 'Mayoreo'
          : 'Menudeo';
        const detalleTexto = getCell(row, headerIdx, ['Detalle Productos', 'Detalle', 'Productos'], 9);
        const itemsJson = getCell(row, headerIdx, ['Items JSON', 'Items', 'JSON'], 10);
        const items = parseItemsField(itemsJson, detalleTexto);
        const totalImporte = parseNumericValue(
          getCell(row, headerIdx, ['Total Importe', 'Total', 'Importe', 'Monto'], 7)
        );

        const metodoPagoRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Metodo Pago'),
          firstRowHasHeaders ? -1 : 11
        );
        const estadoPagoRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Estado Pago'),
          firstRowHasHeaders ? -1 : 12
        );
        const montoPagadoRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Monto Pagado'),
          firstRowHasHeaders ? -1 : 13
        );
        const saldoPendienteRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Saldo Pendiente'),
          firstRowHasHeaders ? -1 : 14
        );
        const abonosJson = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Abonos JSON'),
          firstRowHasHeaders ? -1 : 15
        );

        const hasExplicitPaymentData = Boolean(
          estadoPagoRaw || montoPagadoRaw || saldoPendienteRaw
        );
        const estadoNorm = normalizeText(estadoPagoRaw);
        const estadoPago: EstadoPago | undefined = !estadoPagoRaw
          ? undefined
          : estadoNorm.includes('parcial')
          ? 'Parcial'
          : estadoNorm.includes('pend') || estadoNorm.includes('cred')
          ? 'Pendiente'
          : 'Pagado';

        const metodoNorm = normalizeText(metodoPagoRaw);
        const metodoPago: MetodoPago | undefined = !metodoPagoRaw
          ? undefined
          : metodoNorm.includes('trans')
          ? 'Transferencia'
          : metodoNorm.includes('tarj')
          ? 'Tarjeta'
          : metodoNorm.includes('cred') || metodoNorm.includes('fiad')
          ? 'Crédito'
          : 'Efectivo';

        const abonos = parseJsonArrayField<TicketAbono>(abonosJson);

        const subtotalBrutoRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Subtotal Bruto'),
          firstRowHasHeaders ? -1 : 16
        );
        const descuentoTipoRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Descuento Tipo'),
          firstRowHasHeaders ? -1 : 17
        );
        const descuentoValorRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Descuento Valor'),
          firstRowHasHeaders ? -1 : 18
        );
        const descuentoMontoRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Descuento Monto'),
          firstRowHasHeaders ? -1 : 19
        );
        const descuentoMotivo = getCell(
          row,
          headerIdx,
          getFieldAliases('tickets', 'Descuento Motivo'),
          firstRowHasHeaders ? -1 : 20
        );

        const descuentoMonto =
          descuentoMontoRaw !== '' ? Math.max(0, parseNumericValue(descuentoMontoRaw)) : 0;
        const descuentoTipo: DescuentoTipo | undefined = descuentoTipoRaw
          ? normalizeText(descuentoTipoRaw).includes('porc') || descuentoTipoRaw.includes('%')
            ? 'porcentaje'
            : 'monto'
          : descuentoMonto > 0
          ? 'monto'
          : undefined;
        const descuentoValor =
          descuentoValorRaw !== ''
            ? Math.max(0, parseNumericValue(descuentoValorRaw))
            : descuentoMonto > 0
            ? descuentoMonto
            : undefined;
        const subtotalBruto =
          subtotalBrutoRaw !== '' ? Math.max(0, parseNumericValue(subtotalBrutoRaw)) : undefined;

        dataset.tickets.push({
          folio,
          fecha:
            normalizeSheetDate(getCell(row, headerIdx, ['Fecha', 'Fecha Venta'], 1)) ||
            getTodayISO(),
          ruta: getCell(row, headerIdx, ['Ruta', 'Zona'], 2),
          clienteId: getCell(row, headerIdx, ['Cliente ID', 'ClienteID', 'ID Cliente'], 3),
          clienteNombre: getCell(row, headerIdx, ['Cliente Nombre', 'Cliente', 'Nombre Cliente'], 4),
          tipoVenta,
          totalPiezas: parseNumericValue(
            getCell(row, headerIdx, ['Total Piezas', 'Piezas', 'Cantidad'], 6)
          ),
          totalImporte,
          ...(subtotalBruto !== undefined ? { subtotalBruto } : {}),
          ...(descuentoTipo && descuentoMonto > 0
            ? {
                descuentoTipo,
                descuentoValor,
                descuentoMonto,
                ...(descuentoMotivo ? { descuentoMotivo } : {}),
              }
            : {}),
          jornadaId: getCell(row, headerIdx, ['Jornada ID', 'JornadaID', 'Jornada'], 8),
          detalleTexto,
          items,
          ...(metodoPago ? { metodoPago } : {}),
          ...(hasExplicitPaymentData
            ? {
                estadoPago,
                montoPagado:
                  montoPagadoRaw !== '' ? Math.max(0, parseNumericValue(montoPagadoRaw)) : undefined,
                saldoPendiente:
                  saldoPendienteRaw !== ''
                    ? Math.max(0, parseNumericValue(saldoPendienteRaw))
                    : undefined,
              }
            : {}),
          ...(abonos.length > 0 ? { abonos } : {}),
          rowNumber,
        });
      } else if (key === 'jornadas') {
        const id = getCell(row, headerIdx, ['ID', 'Jornada ID', 'JornadaID'], 0);
        if (!id) continue;
        const foliosRaw = getCell(row, headerIdx, ['Folios Tickets', 'Folios', 'Tickets'], 4);
        const ticketFolios = foliosRaw
          ? foliosRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        const estadoRaw = getCell(row, headerIdx, ['Estado', 'Estatus'], 8);
        const invJson = getCell(
          row,
          headerIdx,
          ['Inventario JSON', 'Inventario', 'Productos Jornada', 'Carga JSON'],
          firstRowHasHeaders ? -1 : 10
        );
        const visitasJson = getCell(
          row,
          headerIdx,
          getFieldAliases('jornadas', 'Visitas JSON'),
          firstRowHasHeaders ? -1 : 11
        );
        const conciliacionJson = getCell(
          row,
          headerIdx,
          getFieldAliases('jornadas', 'Conciliacion JSON'),
          firstRowHasHeaders ? -1 : 12
        );
        const fondoRutaRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('jornadas', 'Fondo Ruta'),
          firstRowHasHeaders ? -1 : 13
        );
        const fondoRuta =
          fondoRutaRaw !== '' ? Math.max(0, parseNumericValue(fondoRutaRaw)) : 0;
        const visitas = parseJsonArrayField<JornadaVisitaItem>(visitasJson);
        const conciliacion = parseJsonArrayField<JornadaConciliacionItem>(conciliacionJson);
        dataset.jornadas.push({
          id,
          fecha: normalizeSheetDate(getCell(row, headerIdx, ['Fecha'], 1)),
          ruta: getCell(row, headerIdx, ['Ruta'], 2),
          nombre: getCell(row, headerIdx, ['Nombre Jornada', 'Nombre', 'Jornada'], 3),
          ...(fondoRuta > 0 ? { fondoRuta } : {}),
          ticketFolios,
          totalTickets: parseNumericValue(
            getCell(row, headerIdx, ['Total Tickets', 'Tickets Count', 'Cantidad Tickets'], 5)
          ),
          totalPiezas: parseNumericValue(getCell(row, headerIdx, ['Total Piezas', 'Piezas'], 6)),
          totalImporte: parseNumericValue(
            getCell(row, headerIdx, ['Total Importe', 'Total', 'Importe'], 7)
          ),
          estado: normalizeText(estadoRaw).includes('abiert') ? 'Abierta' : 'Cerrada',
          notas: getCell(row, headerIdx, ['Notas', 'Observaciones'], 9),
          inventario: parseJornadaInventarioField(invJson),
          ...(visitas.length > 0 ? { visitas } : {}),
          ...(conciliacion.length > 0 ? { conciliacion } : {}),
          rowNumber,
        });
      } else if (key === 'movimientosInventario') {
        const productoNombre = getCell(
          row,
          headerIdx,
          getFieldAliases('movimientosInventario', 'Producto'),
          4
        );
        if (!productoNombre) continue;
        const tipoRaw = getCell(
          row,
          headerIdx,
          getFieldAliases('movimientosInventario', 'Tipo'),
          2
        );
        dataset.movimientosInventario.push({
          id:
            getCell(row, headerIdx, getFieldAliases('movimientosInventario', 'ID'), 0) ||
            `MOV-${rowNumber}`,
          fecha:
            normalizeSheetDate(
              getCell(row, headerIdx, getFieldAliases('movimientosInventario', 'Fecha'), 1)
            ) || getTodayISO(),
          tipo: (tipoRaw || 'Ajuste manual') as MovimientoInventarioTipo,
          productoId: getCell(
            row,
            headerIdx,
            getFieldAliases('movimientosInventario', 'Producto ID'),
            3
          ),
          productoNombre,
          cantidadDelta: parseNumericValue(
            getCell(row, headerIdx, getFieldAliases('movimientosInventario', 'Cantidad'), 5)
          ),
          stockResultante: parseNumericValue(
            getCell(
              row,
              headerIdx,
              getFieldAliases('movimientosInventario', 'Stock Resultante'),
              6
            )
          ),
          referencia: getCell(
            row,
            headerIdx,
            getFieldAliases('movimientosInventario', 'Referencia'),
            7
          ),
          notas: getCell(row, headerIdx, getFieldAliases('movimientosInventario', 'Notas'), 8),
          rowNumber,
        });
      } else if (key === 'otrosIngresos') {
        const concepto = getCell(row, headerIdx, ['Concepto', 'Descripcion', 'Detalle', 'Nombre'], 3);
        if (!concepto) continue;
        dataset.otrosIngresos.push({
          id: getCell(row, headerIdx, ['ID', 'Ingreso ID', 'Folio'], 0) || `ING-${rowNumber}`,
          fecha: normalizeSheetDate(getCell(row, headerIdx, ['Fecha', 'Fecha Ingreso'], 1)),
          categoria: getCell(row, headerIdx, ['Categoria', 'Tipo', 'Rubro'], 2) || 'Otros ingresos',
          concepto,
          monto: parseNumericValue(
            getCell(row, headerIdx, ['Monto', 'Importe', 'Total', 'Ingreso'], 4)
          ),
          notas: getCell(row, headerIdx, ['Notas', 'Observaciones', 'Comentarios'], 5),
          rowNumber,
        });
      } else if (key === 'conceptosIngreso') {
        const concepto = getCell(
          row,
          headerIdx,
          ['Concepto', 'Nombre', 'Descripcion', 'Concepto Ingreso'],
          1
        );
        if (!concepto) continue;
        dataset.conceptosIngreso.push({
          id: getCell(row, headerIdx, ['ID', 'Concepto ID'], 0) || `CING-${rowNumber}`,
          concepto,
          categoria: getCell(row, headerIdx, ['Categoria', 'Tipo', 'Rubro'], 2) || 'Otros ingresos',
          montoSugerido: parseNumericValue(
            getCell(row, headerIdx, ['Monto Sugerido', 'Monto', 'Precio', 'Importe'], 3)
          ),
          rowNumber,
        });
      } else if (key === 'egresos') {
        const concepto = getCell(row, headerIdx, ['Concepto', 'Descripcion', 'Detalle', 'Nombre'], 3);
        if (!concepto) continue;
        const jornadaId = getCell(row, headerIdx, ['Jornada ID', 'JornadaID', 'Jornada'], 6);
        dataset.egresos.push({
          id: getCell(row, headerIdx, ['ID', 'Egreso ID', 'Folio'], 0) || `EGR-${rowNumber}`,
          fecha: normalizeSheetDate(getCell(row, headerIdx, ['Fecha', 'Fecha Gasto'], 1)),
          categoria: getCell(row, headerIdx, ['Categoria', 'Tipo', 'Rubro'], 2) || 'Insumos',
          concepto,
          monto: parseNumericValue(
            getCell(row, headerIdx, ['Monto', 'Importe', 'Total', 'Costo', 'Gasto'], 4)
          ),
          notas: getCell(row, headerIdx, ['Notas', 'Observaciones', 'Comentarios'], 5),
          ...(jornadaId ? { jornadaId } : {}),
          rowNumber,
        });
      } else if (key === 'conceptosGasto') {
        const concepto = getCell(
          row,
          headerIdx,
          ['Concepto', 'Nombre', 'Descripcion', 'Concepto Gasto', 'Concepto Egreso'],
          1
        );
        if (!concepto) continue;
        dataset.conceptosGasto.push({
          id: getCell(row, headerIdx, ['ID', 'Concepto ID'], 0) || `CON-${rowNumber}`,
          concepto,
          categoria: getCell(row, headerIdx, ['Categoria', 'Tipo', 'Rubro'], 2) || 'Materia prima',
          montoSugerido: parseNumericValue(
            getCell(row, headerIdx, ['Monto Sugerido', 'Monto', 'Costo', 'Precio', 'Importe'], 3)
          ),
          rowNumber,
        });
      } else if (key === 'sueldos') {
        const trabajador = getCell(
          row,
          headerIdx,
          ['Trabajador', 'Empleado', 'Nombre', 'Personal'],
          2
        );
        if (!trabajador) continue;
        dataset.sueldos.push({
          id: getCell(row, headerIdx, ['ID', 'Sueldo ID'], 0) || `SUE-${rowNumber}`,
          fecha: normalizeSheetDate(getCell(row, headerIdx, ['Fecha', 'Fecha Pago'], 1)),
          trabajador,
          concepto:
            getCell(row, headerIdx, ['Concepto', 'Periodo', 'Descripcion'], 3) || 'Sueldo',
          monto: parseNumericValue(
            getCell(row, headerIdx, ['Monto', 'Sueldo', 'Importe', 'Pago', 'Total'], 4)
          ),
          notas: getCell(row, headerIdx, ['Notas', 'Observaciones'], 5),
          rowNumber,
        });
      } else if (key === 'finanzasMensuales') {
        const mes = normalizeSheetMonth(getCell(row, headerIdx, ['Mes', 'Periodo'], 0));
        if (!mes) continue;
        dataset.finanzasMensuales.push({
          mes,
          fondoBase: parseNumericValue(
            getCell(row, headerIdx, ['Fondo Base', 'FondoBase', 'Fondo Inicial'], 1)
          ),
          ingresos: parseNumericValue(getCell(row, headerIdx, ['Ingresos', 'Ventas'], 2)),
          egresos: parseNumericValue(getCell(row, headerIdx, ['Egresos', 'Gastos'], 3)),
          utilidadPreliminar: parseNumericValue(
            getCell(row, headerIdx, ['Utilidad Preliminar', 'UtilidadPreliminar'], 4)
          ),
          sueldos: parseNumericValue(getCell(row, headerIdx, ['Sueldos', 'Nomina'], 5)),
          utilidadNeta: parseNumericValue(
            getCell(row, headerIdx, ['Utilidad Neta', 'UtilidadNeta'], 6)
          ),
          fondoTotal: parseNumericValue(
            getCell(row, headerIdx, ['Fondo Total', 'FondoTotal'], 7)
          ),
          cerrado: parseBool(getCell(row, headerIdx, ['Cerrado', 'Estado', 'Estatus'], 8), false),
          fechaCierre: normalizeSheetDate(
            getCell(row, headerIdx, ['Fecha Cierre', 'FechaCierre', 'Fecha'], 9)
          ),
          rowNumber,
        });
      }
    }
  });

  // Auto-discover any routes referenced in Clientes or Tickets that aren't explicitly in Rutas
  const existingRouteNames = new Set(dataset.rutas.map((r) => normalizeText(r.nombre)));
  [...dataset.clientes.map((c) => c.ruta), ...dataset.tickets.map((t) => t.ruta)].forEach(
    (routeName) => {
      if (routeName && routeName !== 'Sin ruta' && !existingRouteNames.has(normalizeText(routeName))) {
        existingRouteNames.add(normalizeText(routeName));
        dataset.rutas.push({
          id: `AUTO-${dataset.rutas.length + 1}`,
          nombre: routeName,
          descripcion: 'Detectada en registros',
          activa: true,
        });
      }
    }
  );

  return dataset;
}

async function appendRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  rowValues: (string | number)[]
) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  return googleFetch<any>(url, token, {
    method: 'POST',
    body: JSON.stringify({ values: [rowValues] }),
  });
}

async function updateRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  rowNumber: number,
  rowValues: (string | number)[]
) {
  const endCol = colIndexToLetter(Math.max(0, rowValues.length - 1));
  const range = `${quoteSheetName(tabName)}!A${rowNumber}:${endCol}${rowNumber}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  return googleFetch<any>(url, token, {
    method: 'PUT',
    body: JSON.stringify({ values: [rowValues] }),
  });
}

interface FieldSpec {
  standardHeader: string;
  aliases: string[];
  value: string | number;
}

async function ensureHeadersAndBuildRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  key: LogicalTabKey,
  fields: FieldSpec[],
  existingRowToPreserve?: any[]
): Promise<{ rowValues: (string | number)[]; headerIdx: Record<string, number> }> {
  const headerRes = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!1:1`)}`,
    token
  );

  let rawRow1 = (headerRes.values?.[0] || []).map((c) => String(c ?? '').trim());
  let headersChanged = false;

  if (isRowEmpty(rawRow1)) {
    rawRow1 = [...TAB_HEADERS[key]];
    headersChanged = true;
  } else if (!looksLikeHeaderRow(key, rawRow1)) {
    // Row 1 had data without headers -> insert blank row 1 so data isn't overwritten
    const meta = await getSpreadsheetMetadata(token, spreadsheetId);
    const sid = meta.sheetIds[tabName];
    if (typeof sid === 'number') {
      await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: [
              {
                insertDimension: {
                  range: { sheetId: sid, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
                  inheritFromBefore: false,
                },
              },
            ],
          }),
        }
      );
    }
    rawRow1 = [...TAB_HEADERS[key]];
    headersChanged = true;
  }

  let headerIdx = buildHeaderIndex(rawRow1);

  for (const field of fields) {
    const colIdx = findHeaderColIndex(headerIdx, field.aliases);
    if (colIdx === undefined) {
      rawRow1.push(field.standardHeader);
      const norm = normalizeText(field.standardHeader).replace(/[\s_-]+/g, '');
      headerIdx[norm] = rawRow1.length - 1;
      headersChanged = true;
    }
  }

  if (headersChanged) {
    await updateRow(token, spreadsheetId, tabName, 1, rawRow1);
    headerIdx = buildHeaderIndex(rawRow1);
  }

  const totalCols = Math.max(rawRow1.length, existingRowToPreserve?.length || 0);
  const rowValues: (string | number)[] = Array.from({ length: totalCols }, (_, i) =>
    existingRowToPreserve && existingRowToPreserve[i] !== undefined ? existingRowToPreserve[i] : ''
  );

  for (const field of fields) {
    const colIdx = findHeaderColIndex(headerIdx, field.aliases);
    if (colIdx !== undefined) {
      rowValues[colIdx] = field.value;
    }
  }

  return { rowValues, headerIdx };
}

async function appendMappedRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  key: LogicalTabKey,
  fields: FieldSpec[]
): Promise<void> {
  const { rowValues } = await ensureHeadersAndBuildRow(token, spreadsheetId, tabName, key, fields);
  await appendRow(token, spreadsheetId, tabName, rowValues);
}

async function updateMappedRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  key: LogicalTabKey,
  rowNumber: number,
  fields: FieldSpec[]
): Promise<void> {
  const existingRes = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A${rowNumber}:Z${rowNumber}`)}`,
    token
  );
  const existingRow = existingRes.values?.[0] || [];
  const { rowValues } = await ensureHeadersAndBuildRow(
    token,
    spreadsheetId,
    tabName,
    key,
    fields,
    existingRow
  );
  await updateRow(token, spreadsheetId, tabName, rowNumber, rowValues);
}

export async function appendRuta(
  token: string,
  spreadsheetId: string,
  tabName: string,
  ruta: Omit<Ruta, 'id'>
): Promise<Ruta> {
  const id = `RUT-${Date.now().toString().slice(-6)}`;
  await appendMappedRow(token, spreadsheetId, tabName, 'rutas', [
    { standardHeader: 'ID', aliases: getFieldAliases('rutas', 'ID'), value: id },
    { standardHeader: 'Nombre', aliases: getFieldAliases('rutas', 'Nombre'), value: ruta.nombre },
    {
      standardHeader: 'Descripcion',
      aliases: getFieldAliases('rutas', 'Descripcion'),
      value: ruta.descripcion || '',
    },
    {
      standardHeader: 'Activa',
      aliases: getFieldAliases('rutas', 'Activa'),
      value: ruta.activa ? 'Sí' : 'No',
    },
  ]);
  return { ...ruta, id };
}

export async function appendProducto(
  token: string,
  spreadsheetId: string,
  tabName: string,
  prod: Omit<Producto, 'id'>
): Promise<Producto> {
  const id = `PROD-${Date.now().toString().slice(-6)}`;
  await appendMappedRow(token, spreadsheetId, tabName, 'productos', [
    { standardHeader: 'ID', aliases: getFieldAliases('productos', 'ID'), value: id },
    { standardHeader: 'Nombre', aliases: getFieldAliases('productos', 'Nombre'), value: prod.nombre },
    {
      standardHeader: 'Categoria',
      aliases: getFieldAliases('productos', 'Categoria'),
      value: prod.categoria,
    },
    { standardHeader: 'Unidad', aliases: getFieldAliases('productos', 'Unidad'), value: prod.unidad },
    {
      standardHeader: 'Precio Mayoreo',
      aliases: getFieldAliases('productos', 'Precio Mayoreo'),
      value: prod.precioMayoreo,
    },
    {
      standardHeader: 'Precio Menudeo',
      aliases: getFieldAliases('productos', 'Precio Menudeo'),
      value: prod.precioMenudeo,
    },
    {
      standardHeader: 'Inventario',
      aliases: getFieldAliases('productos', 'Inventario'),
      value: Math.max(0, prod.inventario ?? 0),
    },
    {
      standardHeader: 'Activo',
      aliases: getFieldAliases('productos', 'Activo'),
      value: prod.activo ? 'Sí' : 'No',
    },
  ]);
  return { ...prod, id };
}

export async function updateProductoRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  prod: Producto
): Promise<void> {
  if (!prod.rowNumber) {
    throw new Error('No se encontró la fila del producto en Google Sheets.');
  }
  await updateMappedRow(token, spreadsheetId, tabName, 'productos', prod.rowNumber, [
    { standardHeader: 'ID', aliases: getFieldAliases('productos', 'ID'), value: prod.id },
    { standardHeader: 'Nombre', aliases: getFieldAliases('productos', 'Nombre'), value: prod.nombre },
    {
      standardHeader: 'Categoria',
      aliases: getFieldAliases('productos', 'Categoria'),
      value: prod.categoria,
    },
    { standardHeader: 'Unidad', aliases: getFieldAliases('productos', 'Unidad'), value: prod.unidad },
    {
      standardHeader: 'Precio Mayoreo',
      aliases: getFieldAliases('productos', 'Precio Mayoreo'),
      value: prod.precioMayoreo,
    },
    {
      standardHeader: 'Precio Menudeo',
      aliases: getFieldAliases('productos', 'Precio Menudeo'),
      value: prod.precioMenudeo,
    },
    {
      standardHeader: 'Inventario',
      aliases: getFieldAliases('productos', 'Inventario'),
      value: Math.max(0, prod.inventario ?? 0),
    },
    {
      standardHeader: 'Activo',
      aliases: getFieldAliases('productos', 'Activo'),
      value: prod.activo ? 'Sí' : 'No',
    },
  ]);
}

export async function adjustProductosInventarioByDelta(
  token: string,
  spreadsheetId: string,
  tabName: string,
  deltas: { productoId: string; productoNombre: string; delta: number }[]
): Promise<void> {
  const nonZero = deltas.filter((d) => d.delta !== 0);
  if (nonZero.length === 0) return;

  const res = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A:Z`)}`,
    token
  );

  const rows = res.values || [];
  if (rows.length === 0) return;

  const hasHeaders = looksLikeHeaderRow('productos', rows[0]);
  let rawHeaders = hasHeaders
    ? rows[0].map((c) => String(c ?? '').trim())
    : [...TAB_HEADERS.productos];
  let headerIdx = buildHeaderIndex(rawHeaders);

  const invAliases = getFieldAliases('productos', 'Inventario');
  let invColIdx = findHeaderColIndex(headerIdx, invAliases);

  if (invColIdx === undefined) {
    rawHeaders = [...rawHeaders, 'Inventario'];
    invColIdx = rawHeaders.length - 1;
    headerIdx = buildHeaderIndex(rawHeaders);
    if (hasHeaders) {
      await updateRow(token, spreadsheetId, tabName, 1, rawHeaders);
    }
  }

  const invColLetter = colIndexToLetter(invColIdx);
  const startRow = hasHeaders ? 1 : 0;

  // Consolidate deltas per product id/name
  const deltaById = new Map<string, number>();
  const deltaByName = new Map<string, number>();
  for (const d of nonZero) {
    if (d.productoId) {
      deltaById.set(d.productoId, (deltaById.get(d.productoId) || 0) + d.delta);
    }
    if (d.productoNombre) {
      const n = normalizeText(d.productoNombre);
      deltaByName.set(n, (deltaByName.get(n) || 0) + d.delta);
    }
  }

  const updates: { range: string; values: number[][] }[] = [];
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (isRowEmpty(row)) continue;
    const rowId = getCell(row, headerIdx, getFieldAliases('productos', 'ID'), 0);
    const rowName = getCell(row, headerIdx, getFieldAliases('productos', 'Nombre'), 1);
    const nameNorm = normalizeText(rowName);

    let delta = 0;
    if (rowId && deltaById.has(rowId)) {
      delta = deltaById.get(rowId)!;
      deltaById.delete(rowId);
      if (nameNorm) deltaByName.delete(nameNorm);
    } else if (nameNorm && deltaByName.has(nameNorm)) {
      delta = deltaByName.get(nameNorm)!;
      deltaByName.delete(nameNorm);
    }

    if (delta !== 0) {
      const currentInv = Math.max(
        0,
        parseNumericValue(row[invColIdx] !== undefined ? String(row[invColIdx]) : '0')
      );
      const nextInv = Math.max(0, currentInv + delta);
      updates.push({
        range: `${quoteSheetName(tabName)}!${invColLetter}${r + 1}`,
        values: [[nextInv]],
      });
    }
  }

  if (updates.length > 0) {
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: updates,
        }),
      }
    );
  }
}

export async function appendCliente(
  token: string,
  spreadsheetId: string,
  tabName: string,
  cliente: Omit<Cliente, 'id' | 'fechaRegistro'>
): Promise<Cliente> {
  const id = `CLI-${Date.now().toString().slice(-6)}`;
  const fechaRegistro = getTodayISO();
  await appendMappedRow(token, spreadsheetId, tabName, 'clientes', [
    { standardHeader: 'ID', aliases: getFieldAliases('clientes', 'ID'), value: id },
    {
      standardHeader: 'Nombre',
      aliases: getFieldAliases('clientes', 'Nombre'),
      value: cliente.nombre,
    },
    { standardHeader: 'Ruta', aliases: getFieldAliases('clientes', 'Ruta'), value: cliente.ruta },
    {
      standardHeader: 'Telefono',
      aliases: getFieldAliases('clientes', 'Telefono'),
      value: asLiteralText(cliente.telefono || ''),
    },
    {
      standardHeader: 'Direccion',
      aliases: getFieldAliases('clientes', 'Direccion'),
      value: cliente.direccion || '',
    },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('clientes', 'Notas'),
      value: cliente.notas || '',
    },
    {
      standardHeader: 'Fecha Registro',
      aliases: getFieldAliases('clientes', 'Fecha Registro'),
      value: asLiteralText(fechaRegistro),
    },
  ]);
  return { ...cliente, id, fechaRegistro };
}

export async function appendTicketSafe(
  token: string,
  spreadsheetId: string,
  tabName: string,
  draft: Omit<Ticket, 'folio' | 'detalleTexto'>
): Promise<Ticket> {
  // Ensure header exists & locate Folio column dynamically
  const headerRes = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!1:1`)}`,
    token
  );
  const row1 = (headerRes.values?.[0] || []).map(String);
  const hIdx = looksLikeHeaderRow('tickets', row1)
    ? buildHeaderIndex(row1)
    : buildHeaderIndex(TAB_HEADERS.tickets);
  const folioColIdx = findHeaderColIndex(hIdx, getFieldAliases('tickets', 'Folio'), 0) ?? 0;
  const folioColLetter = colIndexToLetter(folioColIdx);

  const range = `${quoteSheetName(tabName)}!${folioColLetter}:${folioColLetter}`;
  const liveFoliosRes = await googleFetch<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}`,
    token
  );

  const existingFolios = (liveFoliosRes.values || [])
    .slice(looksLikeHeaderRow('tickets', row1) ? 1 : 0)
    .map((r) => String(r[0] || '').trim())
    .filter(Boolean);

  let folio = generateNextFolio(existingFolios, 'AST');
  const folioSet = new Set(existingFolios.map((f) => f.toUpperCase()));
  while (folioSet.has(folio.toUpperCase())) {
    existingFolios.push(folio);
    folio = generateNextFolio(existingFolios, 'AST');
  }

  const totals = computeTicketTotals(draft.items, draft);
  const detalleTexto = buildTicketDetalleTexto(draft.items, draft);
  const pay = getTicketPaymentSummary({
    ...draft,
    totalPiezas: totals.totalPiezas,
    totalImporte: totals.totalImporte,
    subtotalBruto: totals.subtotalBruto,
    descuentoMonto: totals.descuentoMonto,
    folio,
    detalleTexto,
  });

  await appendMappedRow(token, spreadsheetId, tabName, 'tickets', [
    { standardHeader: 'Folio', aliases: getFieldAliases('tickets', 'Folio'), value: folio },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('tickets', 'Fecha'),
      value: asLiteralText(draft.fecha),
    },
    { standardHeader: 'Ruta', aliases: getFieldAliases('tickets', 'Ruta'), value: draft.ruta },
    {
      standardHeader: 'Cliente ID',
      aliases: getFieldAliases('tickets', 'Cliente ID'),
      value: draft.clienteId,
    },
    {
      standardHeader: 'Cliente Nombre',
      aliases: getFieldAliases('tickets', 'Cliente Nombre'),
      value: draft.clienteNombre,
    },
    {
      standardHeader: 'Tipo Venta',
      aliases: getFieldAliases('tickets', 'Tipo Venta'),
      value: draft.tipoVenta,
    },
    {
      standardHeader: 'Total Piezas',
      aliases: getFieldAliases('tickets', 'Total Piezas'),
      value: totals.totalPiezas,
    },
    {
      standardHeader: 'Total Importe',
      aliases: getFieldAliases('tickets', 'Total Importe'),
      value: totals.totalImporte,
    },
    {
      standardHeader: 'Jornada ID',
      aliases: getFieldAliases('tickets', 'Jornada ID'),
      value: draft.jornadaId || '',
    },
    {
      standardHeader: 'Detalle Productos',
      aliases: getFieldAliases('tickets', 'Detalle Productos'),
      value: detalleTexto,
    },
    {
      standardHeader: 'Items JSON',
      aliases: getFieldAliases('tickets', 'Items JSON'),
      value: JSON.stringify(draft.items),
    },
    {
      standardHeader: 'Metodo Pago',
      aliases: getFieldAliases('tickets', 'Metodo Pago'),
      value: pay.metodoPago,
    },
    {
      standardHeader: 'Estado Pago',
      aliases: getFieldAliases('tickets', 'Estado Pago'),
      value: pay.estadoPago,
    },
    {
      standardHeader: 'Monto Pagado',
      aliases: getFieldAliases('tickets', 'Monto Pagado'),
      value: pay.montoPagado,
    },
    {
      standardHeader: 'Saldo Pendiente',
      aliases: getFieldAliases('tickets', 'Saldo Pendiente'),
      value: pay.saldoPendiente,
    },
    {
      standardHeader: 'Abonos JSON',
      aliases: getFieldAliases('tickets', 'Abonos JSON'),
      value: JSON.stringify(pay.abonos),
    },
    {
      standardHeader: 'Subtotal Bruto',
      aliases: getFieldAliases('tickets', 'Subtotal Bruto'),
      value: totals.subtotalBruto,
    },
    {
      standardHeader: 'Descuento Tipo',
      aliases: getFieldAliases('tickets', 'Descuento Tipo'),
      value: totals.descuentoMonto > 0 ? totals.descuentoTipo : '',
    },
    {
      standardHeader: 'Descuento Valor',
      aliases: getFieldAliases('tickets', 'Descuento Valor'),
      value: totals.descuentoMonto > 0 ? totals.descuentoValor : 0,
    },
    {
      standardHeader: 'Descuento Monto',
      aliases: getFieldAliases('tickets', 'Descuento Monto'),
      value: totals.descuentoMonto,
    },
    {
      standardHeader: 'Descuento Motivo',
      aliases: getFieldAliases('tickets', 'Descuento Motivo'),
      value: totals.descuentoMotivo,
    },
  ]);

  return {
    ...draft,
    folio,
    totalPiezas: totals.totalPiezas,
    totalImporte: totals.totalImporte,
    subtotalBruto: totals.subtotalBruto,
    ...(totals.descuentoMonto > 0
      ? {
          descuentoTipo: totals.descuentoTipo,
          descuentoValor: totals.descuentoValor,
          descuentoMonto: totals.descuentoMonto,
          ...(totals.descuentoMotivo ? { descuentoMotivo: totals.descuentoMotivo } : {}),
        }
      : {
          descuentoTipo: undefined,
          descuentoValor: undefined,
          descuentoMonto: undefined,
          descuentoMotivo: undefined,
        }),
    detalleTexto,
    metodoPago: pay.metodoPago,
    estadoPago: pay.estadoPago,
    montoPagado: pay.montoPagado,
    saldoPendiente: pay.saldoPendiente,
    abonos: pay.abonos,
  };
}

export async function updateTicketRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  ticket: Ticket
): Promise<Ticket> {
  if (!ticket.rowNumber) {
    throw new Error('No se encontró la fila del ticket en Google Sheets.');
  }

  const hasItems = (ticket.items || []).length > 0;
  const totals = hasItems
    ? computeTicketTotals(ticket.items, ticket)
    : computeTicketTotals([], ticket);
  const totalPiezas = hasItems ? totals.totalPiezas : ticket.totalPiezas;
  const totalImporte = hasItems ? totals.totalImporte : ticket.totalImporte;
  const subtotalBruto = hasItems ? totals.subtotalBruto : ticket.subtotalBruto ?? ticket.totalImporte;
  const descuentoMonto = hasItems ? totals.descuentoMonto : ticket.descuentoMonto ?? 0;
  const detalleTexto = hasItems
    ? buildTicketDetalleTexto(ticket.items, ticket)
    : ticket.detalleTexto;
  const pay = getTicketPaymentSummary({
    ...ticket,
    totalPiezas,
    totalImporte,
    subtotalBruto,
    descuentoMonto,
    detalleTexto,
  });

  await updateMappedRow(token, spreadsheetId, tabName, 'tickets', ticket.rowNumber, [
    { standardHeader: 'Folio', aliases: getFieldAliases('tickets', 'Folio'), value: ticket.folio },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('tickets', 'Fecha'),
      value: asLiteralText(ticket.fecha),
    },
    { standardHeader: 'Ruta', aliases: getFieldAliases('tickets', 'Ruta'), value: ticket.ruta },
    {
      standardHeader: 'Cliente ID',
      aliases: getFieldAliases('tickets', 'Cliente ID'),
      value: ticket.clienteId,
    },
    {
      standardHeader: 'Cliente Nombre',
      aliases: getFieldAliases('tickets', 'Cliente Nombre'),
      value: ticket.clienteNombre,
    },
    {
      standardHeader: 'Tipo Venta',
      aliases: getFieldAliases('tickets', 'Tipo Venta'),
      value: ticket.tipoVenta,
    },
    {
      standardHeader: 'Total Piezas',
      aliases: getFieldAliases('tickets', 'Total Piezas'),
      value: totalPiezas,
    },
    {
      standardHeader: 'Total Importe',
      aliases: getFieldAliases('tickets', 'Total Importe'),
      value: totalImporte,
    },
    {
      standardHeader: 'Jornada ID',
      aliases: getFieldAliases('tickets', 'Jornada ID'),
      value: ticket.jornadaId || '',
    },
    {
      standardHeader: 'Detalle Productos',
      aliases: getFieldAliases('tickets', 'Detalle Productos'),
      value: detalleTexto,
    },
    {
      standardHeader: 'Items JSON',
      aliases: getFieldAliases('tickets', 'Items JSON'),
      value: JSON.stringify(ticket.items),
    },
    {
      standardHeader: 'Metodo Pago',
      aliases: getFieldAliases('tickets', 'Metodo Pago'),
      value: pay.metodoPago,
    },
    {
      standardHeader: 'Estado Pago',
      aliases: getFieldAliases('tickets', 'Estado Pago'),
      value: pay.estadoPago,
    },
    {
      standardHeader: 'Monto Pagado',
      aliases: getFieldAliases('tickets', 'Monto Pagado'),
      value: pay.montoPagado,
    },
    {
      standardHeader: 'Saldo Pendiente',
      aliases: getFieldAliases('tickets', 'Saldo Pendiente'),
      value: pay.saldoPendiente,
    },
    {
      standardHeader: 'Abonos JSON',
      aliases: getFieldAliases('tickets', 'Abonos JSON'),
      value: JSON.stringify(pay.abonos),
    },
    {
      standardHeader: 'Subtotal Bruto',
      aliases: getFieldAliases('tickets', 'Subtotal Bruto'),
      value: subtotalBruto,
    },
    {
      standardHeader: 'Descuento Tipo',
      aliases: getFieldAliases('tickets', 'Descuento Tipo'),
      value: descuentoMonto > 0 ? ticket.descuentoTipo || totals.descuentoTipo : '',
    },
    {
      standardHeader: 'Descuento Valor',
      aliases: getFieldAliases('tickets', 'Descuento Valor'),
      value: descuentoMonto > 0 ? ticket.descuentoValor ?? descuentoMonto : 0,
    },
    {
      standardHeader: 'Descuento Monto',
      aliases: getFieldAliases('tickets', 'Descuento Monto'),
      value: descuentoMonto,
    },
    {
      standardHeader: 'Descuento Motivo',
      aliases: getFieldAliases('tickets', 'Descuento Motivo'),
      value: descuentoMonto > 0 ? ticket.descuentoMotivo || '' : '',
    },
  ]);

  return {
    ...ticket,
    totalPiezas,
    totalImporte,
    subtotalBruto,
    ...(descuentoMonto > 0
      ? {
          descuentoTipo: ticket.descuentoTipo || totals.descuentoTipo,
          descuentoValor: ticket.descuentoValor ?? descuentoMonto,
          descuentoMonto,
          ...(ticket.descuentoMotivo ? { descuentoMotivo: ticket.descuentoMotivo } : {}),
        }
      : {
          descuentoTipo: undefined,
          descuentoValor: undefined,
          descuentoMonto: undefined,
          descuentoMotivo: undefined,
        }),
    detalleTexto,
    metodoPago: pay.metodoPago,
    estadoPago: pay.estadoPago,
    montoPagado: pay.montoPagado,
    saldoPendiente: pay.saldoPendiente,
    abonos: pay.abonos,
  };
}

export async function assignTicketsToJornada(
  token: string,
  spreadsheetId: string,
  ticketsTab: string,
  jornadaId: string,
  tickets: Ticket[]
): Promise<void> {
  const validTickets = tickets.filter((t) => Boolean(t.rowNumber) && t.rowNumber! >= 2);
  if (validTickets.length === 0) return;

  const headerRes = await googleFetch<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(ticketsTab)}!1:1`)}`,
    token
  );
  const headers = (headerRes.values?.[0] || []).map(String);
  const headerIdx = buildHeaderIndex(headers);
  const jornadaColIdx =
    findHeaderColIndex(headerIdx, getFieldAliases('tickets', 'Jornada ID'), 8) ?? 8;
  const colLetter = colIndexToLetter(jornadaColIdx);

  const updates = validTickets.map((t) => ({
    range: `${quoteSheetName(ticketsTab)}!${colLetter}${t.rowNumber}`,
    values: [[jornadaId]],
  }));

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates,
      }),
    }
  );
}

export async function appendJornadaAndAssignTickets(
  token: string,
  spreadsheetId: string,
  jornadasTab: string,
  ticketsTab: string,
  jornadaDraft: Omit<Jornada, 'id'>,
  selectedTickets: Ticket[]
): Promise<Jornada> {
  const id = `JOR-${Date.now().toString().slice(-6)}`;
  await appendMappedRow(token, spreadsheetId, jornadasTab, 'jornadas', [
    { standardHeader: 'ID', aliases: getFieldAliases('jornadas', 'ID'), value: id },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('jornadas', 'Fecha'),
      value: asLiteralText(jornadaDraft.fecha),
    },
    {
      standardHeader: 'Ruta',
      aliases: getFieldAliases('jornadas', 'Ruta'),
      value: jornadaDraft.ruta,
    },
    {
      standardHeader: 'Nombre Jornada',
      aliases: getFieldAliases('jornadas', 'Nombre Jornada'),
      value: jornadaDraft.nombre,
    },
    {
      standardHeader: 'Folios Tickets',
      aliases: getFieldAliases('jornadas', 'Folios Tickets'),
      value: jornadaDraft.ticketFolios.join(', '),
    },
    {
      standardHeader: 'Total Tickets',
      aliases: getFieldAliases('jornadas', 'Total Tickets'),
      value: jornadaDraft.totalTickets,
    },
    {
      standardHeader: 'Total Piezas',
      aliases: getFieldAliases('jornadas', 'Total Piezas'),
      value: jornadaDraft.totalPiezas,
    },
    {
      standardHeader: 'Total Importe',
      aliases: getFieldAliases('jornadas', 'Total Importe'),
      value: jornadaDraft.totalImporte,
    },
    {
      standardHeader: 'Estado',
      aliases: getFieldAliases('jornadas', 'Estado'),
      value: jornadaDraft.estado,
    },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('jornadas', 'Notas'),
      value: jornadaDraft.notas || '',
    },
    {
      standardHeader: 'Inventario JSON',
      aliases: getFieldAliases('jornadas', 'Inventario JSON'),
      value: JSON.stringify(jornadaDraft.inventario || []),
    },
    {
      standardHeader: 'Visitas JSON',
      aliases: getFieldAliases('jornadas', 'Visitas JSON'),
      value: JSON.stringify(jornadaDraft.visitas || []),
    },
    {
      standardHeader: 'Conciliacion JSON',
      aliases: getFieldAliases('jornadas', 'Conciliacion JSON'),
      value: JSON.stringify(jornadaDraft.conciliacion || []),
    },
    {
      standardHeader: 'Fondo Ruta',
      aliases: getFieldAliases('jornadas', 'Fondo Ruta'),
      value: jornadaDraft.fondoRuta ?? 0,
    },
  ]);

  if (selectedTickets.length > 0) {
    await assignTicketsToJornada(token, spreadsheetId, ticketsTab, id, selectedTickets);
  }

  return { ...jornadaDraft, id };
}

export async function updateJornadaRow(
  token: string,
  spreadsheetId: string,
  jornadasTab: string,
  jornada: Jornada
): Promise<void> {
  if (!jornada.rowNumber || jornada.rowNumber < 2) {
    throw new Error('No se encontró la fila de la jornada en Google Sheets.');
  }
  await updateMappedRow(token, spreadsheetId, jornadasTab, 'jornadas', jornada.rowNumber, [
    { standardHeader: 'ID', aliases: getFieldAliases('jornadas', 'ID'), value: jornada.id },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('jornadas', 'Fecha'),
      value: asLiteralText(jornada.fecha),
    },
    {
      standardHeader: 'Ruta',
      aliases: getFieldAliases('jornadas', 'Ruta'),
      value: jornada.ruta,
    },
    {
      standardHeader: 'Nombre Jornada',
      aliases: getFieldAliases('jornadas', 'Nombre Jornada'),
      value: jornada.nombre,
    },
    {
      standardHeader: 'Folios Tickets',
      aliases: getFieldAliases('jornadas', 'Folios Tickets'),
      value: jornada.ticketFolios.join(', '),
    },
    {
      standardHeader: 'Total Tickets',
      aliases: getFieldAliases('jornadas', 'Total Tickets'),
      value: jornada.totalTickets,
    },
    {
      standardHeader: 'Total Piezas',
      aliases: getFieldAliases('jornadas', 'Total Piezas'),
      value: jornada.totalPiezas,
    },
    {
      standardHeader: 'Total Importe',
      aliases: getFieldAliases('jornadas', 'Total Importe'),
      value: jornada.totalImporte,
    },
    {
      standardHeader: 'Estado',
      aliases: getFieldAliases('jornadas', 'Estado'),
      value: jornada.estado,
    },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('jornadas', 'Notas'),
      value: jornada.notas || '',
    },
    {
      standardHeader: 'Inventario JSON',
      aliases: getFieldAliases('jornadas', 'Inventario JSON'),
      value: JSON.stringify(jornada.inventario || []),
    },
    {
      standardHeader: 'Visitas JSON',
      aliases: getFieldAliases('jornadas', 'Visitas JSON'),
      value: JSON.stringify(jornada.visitas || []),
    },
    {
      standardHeader: 'Conciliacion JSON',
      aliases: getFieldAliases('jornadas', 'Conciliacion JSON'),
      value: JSON.stringify(jornada.conciliacion || []),
    },
    {
      standardHeader: 'Fondo Ruta',
      aliases: getFieldAliases('jornadas', 'Fondo Ruta'),
      value: jornada.fondoRuta ?? 0,
    },
  ]);
}

export async function appendIngresoOtro(
  token: string,
  spreadsheetId: string,
  tabName: string,
  ingreso: Omit<IngresoOtro, 'id'>
): Promise<IngresoOtro> {
  const id = `ING-${Date.now().toString().slice(-6)}`;
  await appendMappedRow(token, spreadsheetId, tabName, 'otrosIngresos', [
    { standardHeader: 'ID', aliases: getFieldAliases('otrosIngresos', 'ID'), value: id },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('otrosIngresos', 'Fecha'),
      value: asLiteralText(ingreso.fecha),
    },
    {
      standardHeader: 'Categoria',
      aliases: getFieldAliases('otrosIngresos', 'Categoria'),
      value: ingreso.categoria,
    },
    {
      standardHeader: 'Concepto',
      aliases: getFieldAliases('otrosIngresos', 'Concepto'),
      value: ingreso.concepto,
    },
    {
      standardHeader: 'Monto',
      aliases: getFieldAliases('otrosIngresos', 'Monto'),
      value: ingreso.monto,
    },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('otrosIngresos', 'Notas'),
      value: ingreso.notas || '',
    },
  ]);
  return { ...ingreso, id };
}

export async function appendConceptoIngreso(
  token: string,
  spreadsheetId: string,
  tabName: string,
  concepto: Omit<ConceptoIngreso, 'id'>
): Promise<ConceptoIngreso> {
  const id = `CING-${Date.now().toString().slice(-6)}`;
  await appendMappedRow(token, spreadsheetId, tabName, 'conceptosIngreso', [
    { standardHeader: 'ID', aliases: getFieldAliases('conceptosIngreso', 'ID'), value: id },
    {
      standardHeader: 'Concepto',
      aliases: getFieldAliases('conceptosIngreso', 'Concepto'),
      value: concepto.concepto,
    },
    {
      standardHeader: 'Categoria',
      aliases: getFieldAliases('conceptosIngreso', 'Categoria'),
      value: concepto.categoria,
    },
    {
      standardHeader: 'Monto Sugerido',
      aliases: getFieldAliases('conceptosIngreso', 'Monto Sugerido'),
      value: concepto.montoSugerido,
    },
  ]);
  return { ...concepto, id };
}

export async function upsertConceptoIngreso(
  token: string,
  spreadsheetId: string,
  tabName: string,
  concepto: Omit<ConceptoIngreso, 'id'>
): Promise<ConceptoIngreso> {
  const res = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A:Z`)}`,
    token
  );
  const rows = res.values || [];
  if (rows.length > 0 && looksLikeHeaderRow('conceptosIngreso', rows[0])) {
    const headerIdx = buildHeaderIndex(rows[0].map(String));
    const targetNorm = normalizeText(concepto.concepto);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (isRowEmpty(row)) continue;
      const existingName = getCell(
        row,
        headerIdx,
        getFieldAliases('conceptosIngreso', 'Concepto'),
        1
      );
      if (normalizeText(existingName) === targetNorm) {
        const existingId =
          getCell(row, headerIdx, getFieldAliases('conceptosIngreso', 'ID'), 0) ||
          `CING-${i + 1}`;
        const rowNumber = i + 1;
        await updateMappedRow(token, spreadsheetId, tabName, 'conceptosIngreso', rowNumber, [
          {
            standardHeader: 'ID',
            aliases: getFieldAliases('conceptosIngreso', 'ID'),
            value: existingId,
          },
          {
            standardHeader: 'Concepto',
            aliases: getFieldAliases('conceptosIngreso', 'Concepto'),
            value: concepto.concepto,
          },
          {
            standardHeader: 'Categoria',
            aliases: getFieldAliases('conceptosIngreso', 'Categoria'),
            value: concepto.categoria,
          },
          {
            standardHeader: 'Monto Sugerido',
            aliases: getFieldAliases('conceptosIngreso', 'Monto Sugerido'),
            value: concepto.montoSugerido,
          },
        ]);
        return { ...concepto, id: existingId, rowNumber };
      }
    }
  }

  return appendConceptoIngreso(token, spreadsheetId, tabName, concepto);
}

export async function appendEgreso(
  token: string,
  spreadsheetId: string,
  tabName: string,
  egreso: Omit<Egreso, 'id'>
): Promise<Egreso> {
  const id = `EGR-${Date.now().toString().slice(-6)}`;
  await appendMappedRow(token, spreadsheetId, tabName, 'egresos', [
    { standardHeader: 'ID', aliases: getFieldAliases('egresos', 'ID'), value: id },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('egresos', 'Fecha'),
      value: asLiteralText(egreso.fecha),
    },
    {
      standardHeader: 'Categoria',
      aliases: getFieldAliases('egresos', 'Categoria'),
      value: egreso.categoria,
    },
    {
      standardHeader: 'Concepto',
      aliases: getFieldAliases('egresos', 'Concepto'),
      value: egreso.concepto,
    },
    { standardHeader: 'Monto', aliases: getFieldAliases('egresos', 'Monto'), value: egreso.monto },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('egresos', 'Notas'),
      value: egreso.notas || '',
    },
    {
      standardHeader: 'Jornada ID',
      aliases: getFieldAliases('egresos', 'Jornada ID'),
      value: egreso.jornadaId || '',
    },
  ]);
  return { ...egreso, id };
}

export async function appendConceptoGasto(
  token: string,
  spreadsheetId: string,
  tabName: string,
  concepto: Omit<ConceptoGasto, 'id'>
): Promise<ConceptoGasto> {
  const id = `CON-${Date.now().toString().slice(-6)}`;
  await appendMappedRow(token, spreadsheetId, tabName, 'conceptosGasto', [
    { standardHeader: 'ID', aliases: getFieldAliases('conceptosGasto', 'ID'), value: id },
    {
      standardHeader: 'Concepto',
      aliases: getFieldAliases('conceptosGasto', 'Concepto'),
      value: concepto.concepto,
    },
    {
      standardHeader: 'Categoria',
      aliases: getFieldAliases('conceptosGasto', 'Categoria'),
      value: concepto.categoria,
    },
    {
      standardHeader: 'Monto Sugerido',
      aliases: getFieldAliases('conceptosGasto', 'Monto Sugerido'),
      value: concepto.montoSugerido,
    },
  ]);
  return { ...concepto, id };
}

export async function upsertConceptoGasto(
  token: string,
  spreadsheetId: string,
  tabName: string,
  concepto: Omit<ConceptoGasto, 'id'>
): Promise<ConceptoGasto> {
  // Check if concept with same normalized name already exists in sheet
  const res = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A:Z`)}`,
    token
  );
  const rows = res.values || [];
  if (rows.length > 0 && looksLikeHeaderRow('conceptosGasto', rows[0])) {
    const headerIdx = buildHeaderIndex(rows[0].map(String));
    const targetNorm = normalizeText(concepto.concepto);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (isRowEmpty(row)) continue;
      const existingName = getCell(
        row,
        headerIdx,
        getFieldAliases('conceptosGasto', 'Concepto'),
        1
      );
      if (normalizeText(existingName) === targetNorm) {
        const existingId =
          getCell(row, headerIdx, getFieldAliases('conceptosGasto', 'ID'), 0) ||
          `CON-${i + 1}`;
        const rowNumber = i + 1;
        await updateMappedRow(token, spreadsheetId, tabName, 'conceptosGasto', rowNumber, [
          {
            standardHeader: 'ID',
            aliases: getFieldAliases('conceptosGasto', 'ID'),
            value: existingId,
          },
          {
            standardHeader: 'Concepto',
            aliases: getFieldAliases('conceptosGasto', 'Concepto'),
            value: concepto.concepto,
          },
          {
            standardHeader: 'Categoria',
            aliases: getFieldAliases('conceptosGasto', 'Categoria'),
            value: concepto.categoria,
          },
          {
            standardHeader: 'Monto Sugerido',
            aliases: getFieldAliases('conceptosGasto', 'Monto Sugerido'),
            value: concepto.montoSugerido,
          },
        ]);
        return { ...concepto, id: existingId, rowNumber };
      }
    }
  }

  return appendConceptoGasto(token, spreadsheetId, tabName, concepto);
}

export async function appendSueldo(
  token: string,
  spreadsheetId: string,
  tabName: string,
  sueldo: Omit<Sueldo, 'id'>
): Promise<Sueldo> {
  const id = `SUE-${Date.now().toString().slice(-6)}`;
  await appendMappedRow(token, spreadsheetId, tabName, 'sueldos', [
    { standardHeader: 'ID', aliases: getFieldAliases('sueldos', 'ID'), value: id },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('sueldos', 'Fecha'),
      value: asLiteralText(sueldo.fecha),
    },
    {
      standardHeader: 'Trabajador',
      aliases: getFieldAliases('sueldos', 'Trabajador'),
      value: sueldo.trabajador,
    },
    {
      standardHeader: 'Concepto',
      aliases: getFieldAliases('sueldos', 'Concepto'),
      value: sueldo.concepto,
    },
    { standardHeader: 'Monto', aliases: getFieldAliases('sueldos', 'Monto'), value: sueldo.monto },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('sueldos', 'Notas'),
      value: sueldo.notas || '',
    },
  ]);
  return { ...sueldo, id };
}

export async function upsertFinanzaMensual(
  token: string,
  spreadsheetId: string,
  tabName: string,
  record: FinanzaMensual
): Promise<void> {
  const fields: FieldSpec[] = [
    {
      standardHeader: 'Mes',
      aliases: getFieldAliases('finanzasMensuales', 'Mes'),
      value: asLiteralText(record.mes),
    },
    {
      standardHeader: 'Fondo Base',
      aliases: getFieldAliases('finanzasMensuales', 'Fondo Base'),
      value: record.fondoBase,
    },
    {
      standardHeader: 'Ingresos',
      aliases: getFieldAliases('finanzasMensuales', 'Ingresos'),
      value: record.ingresos,
    },
    {
      standardHeader: 'Egresos',
      aliases: getFieldAliases('finanzasMensuales', 'Egresos'),
      value: record.egresos,
    },
    {
      standardHeader: 'Utilidad Preliminar',
      aliases: getFieldAliases('finanzasMensuales', 'Utilidad Preliminar'),
      value: record.utilidadPreliminar,
    },
    {
      standardHeader: 'Sueldos',
      aliases: getFieldAliases('finanzasMensuales', 'Sueldos'),
      value: record.sueldos,
    },
    {
      standardHeader: 'Utilidad Neta',
      aliases: getFieldAliases('finanzasMensuales', 'Utilidad Neta'),
      value: record.utilidadNeta,
    },
    {
      standardHeader: 'Fondo Total',
      aliases: getFieldAliases('finanzasMensuales', 'Fondo Total'),
      value: record.fondoTotal,
    },
    {
      standardHeader: 'Cerrado',
      aliases: getFieldAliases('finanzasMensuales', 'Cerrado'),
      value: record.cerrado ? 'Sí' : 'No',
    },
    {
      standardHeader: 'Fecha Cierre',
      aliases: getFieldAliases('finanzasMensuales', 'Fecha Cierre'),
      value: asLiteralText(record.fechaCierre || ''),
    },
  ];

  // Re-check if month row exists in sheet using dynamic Mes column
  const res = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A:Z`)}`,
    token
  );
  const rows = res.values || [];
  let foundRow = -1;
  if (rows.length > 1) {
    const headerIdx = looksLikeHeaderRow('finanzasMensuales', rows[0])
      ? buildHeaderIndex(rows[0].map(String))
      : buildHeaderIndex(TAB_HEADERS.finanzasMensuales);
    const startIdx = looksLikeHeaderRow('finanzasMensuales', rows[0]) ? 1 : 0;
    for (let i = startIdx; i < rows.length; i++) {
      const cellMes = normalizeSheetMonth(
        getCell(rows[i], headerIdx, getFieldAliases('finanzasMensuales', 'Mes'), 0)
      );
      if (cellMes === record.mes) {
        foundRow = i + 1;
        break;
      }
    }
  }

  if (foundRow > 0) {
    await updateMappedRow(token, spreadsheetId, tabName, 'finanzasMensuales', foundRow, fields);
  } else {
    await appendMappedRow(token, spreadsheetId, tabName, 'finanzasMensuales', fields);
  }
}

export async function deleteSheetRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  rowNumber: number
): Promise<void> {
  if (!rowNumber || rowNumber < 2) {
    throw new Error('No se puede eliminar la fila de encabezado o una fila inválida.');
  }

  const meta = await getSpreadsheetMetadata(token, spreadsheetId);
  const sheetId = meta.sheetIds[tabName];
  if (typeof sheetId !== 'number') {
    throw new Error(`No se encontró la pestaña "${tabName}" en el archivo.`);
  }

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      }),
    }
  );
}

export async function clearJornadaOnTickets(
  token: string,
  spreadsheetId: string,
  ticketsTab: string,
  jornadaId: string,
  tickets: Ticket[]
): Promise<void> {
  const affected = tickets.filter((t) => t.jornadaId === jornadaId && Boolean(t.rowNumber) && t.rowNumber! >= 2);
  if (affected.length === 0) return;

  const headerRes = await googleFetch<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(ticketsTab)}!1:1`)}`,
    token
  );
  const headers = (headerRes.values?.[0] || []).map(String);
  const headerIdx = buildHeaderIndex(headers);
  const jornadaColIdx =
    findHeaderColIndex(headerIdx, getFieldAliases('tickets', 'Jornada ID'), 8) ?? 8;
  const colLetter = colIndexToLetter(jornadaColIdx);

  const updates = affected.map((t) => ({
    range: `${quoteSheetName(ticketsTab)}!${colLetter}${t.rowNumber}`,
    values: [['']],
  }));

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates,
      }),
    }
  );
}

export async function clearJornadaOnEgresos(
  token: string,
  spreadsheetId: string,
  egresosTab: string,
  jornadaId: string,
  egresos: Egreso[]
): Promise<void> {
  const affected = egresos.filter(
    (e) => e.jornadaId === jornadaId && Boolean(e.rowNumber) && e.rowNumber! >= 2
  );
  if (affected.length === 0) return;

  const headerRes = await googleFetch<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(egresosTab)}!1:1`)}`,
    token
  );
  const headers = (headerRes.values?.[0] || []).map(String);
  const headerIdx = buildHeaderIndex(headers);
  const jornadaColIdx = findHeaderColIndex(
    headerIdx,
    getFieldAliases('egresos', 'Jornada ID')
  );
  if (jornadaColIdx === undefined) return;
  const colLetter = colIndexToLetter(jornadaColIdx);

  const updates = affected.map((e) => ({
    range: `${quoteSheetName(egresosTab)}!${colLetter}${e.rowNumber}`,
    values: [['']],
  }));

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates,
      }),
    }
  );
}

export async function updateRutaRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  ruta: Ruta
): Promise<void> {
  if (!ruta.rowNumber || ruta.rowNumber < 2) {
    throw new Error('No se encontró la fila de la ruta en Google Sheets.');
  }
  await updateMappedRow(token, spreadsheetId, tabName, 'rutas', ruta.rowNumber, [
    { standardHeader: 'ID', aliases: getFieldAliases('rutas', 'ID'), value: ruta.id },
    { standardHeader: 'Nombre', aliases: getFieldAliases('rutas', 'Nombre'), value: ruta.nombre },
    {
      standardHeader: 'Descripcion',
      aliases: getFieldAliases('rutas', 'Descripcion'),
      value: ruta.descripcion || '',
    },
    {
      standardHeader: 'Activa',
      aliases: getFieldAliases('rutas', 'Activa'),
      value: ruta.activa ? 'Sí' : 'No',
    },
  ]);
}

export async function updateClienteRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  cliente: Cliente
): Promise<void> {
  if (!cliente.rowNumber || cliente.rowNumber < 2) {
    throw new Error('No se encontró la fila del cliente en Google Sheets.');
  }
  await updateMappedRow(token, spreadsheetId, tabName, 'clientes', cliente.rowNumber, [
    { standardHeader: 'ID', aliases: getFieldAliases('clientes', 'ID'), value: cliente.id },
    {
      standardHeader: 'Nombre',
      aliases: getFieldAliases('clientes', 'Nombre'),
      value: cliente.nombre,
    },
    { standardHeader: 'Ruta', aliases: getFieldAliases('clientes', 'Ruta'), value: cliente.ruta },
    {
      standardHeader: 'Telefono',
      aliases: getFieldAliases('clientes', 'Telefono'),
      value: asLiteralText(cliente.telefono || ''),
    },
    {
      standardHeader: 'Direccion',
      aliases: getFieldAliases('clientes', 'Direccion'),
      value: cliente.direccion || '',
    },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('clientes', 'Notas'),
      value: cliente.notas || '',
    },
    {
      standardHeader: 'Fecha Registro',
      aliases: getFieldAliases('clientes', 'Fecha Registro'),
      value: asLiteralText(cliente.fechaRegistro || ''),
    },
  ]);
}

export async function updateIngresoOtroRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  ingreso: IngresoOtro
): Promise<void> {
  if (!ingreso.rowNumber || ingreso.rowNumber < 2) {
    throw new Error('No se encontró la fila del ingreso en Google Sheets.');
  }
  await updateMappedRow(token, spreadsheetId, tabName, 'otrosIngresos', ingreso.rowNumber, [
    { standardHeader: 'ID', aliases: getFieldAliases('otrosIngresos', 'ID'), value: ingreso.id },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('otrosIngresos', 'Fecha'),
      value: asLiteralText(ingreso.fecha),
    },
    {
      standardHeader: 'Categoria',
      aliases: getFieldAliases('otrosIngresos', 'Categoria'),
      value: ingreso.categoria,
    },
    {
      standardHeader: 'Concepto',
      aliases: getFieldAliases('otrosIngresos', 'Concepto'),
      value: ingreso.concepto,
    },
    {
      standardHeader: 'Monto',
      aliases: getFieldAliases('otrosIngresos', 'Monto'),
      value: ingreso.monto,
    },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('otrosIngresos', 'Notas'),
      value: ingreso.notas || '',
    },
  ]);
}

export async function updateEgresoRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  egreso: Egreso
): Promise<void> {
  if (!egreso.rowNumber || egreso.rowNumber < 2) {
    throw new Error('No se encontró la fila del egreso en Google Sheets.');
  }
  await updateMappedRow(token, spreadsheetId, tabName, 'egresos', egreso.rowNumber, [
    { standardHeader: 'ID', aliases: getFieldAliases('egresos', 'ID'), value: egreso.id },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('egresos', 'Fecha'),
      value: asLiteralText(egreso.fecha),
    },
    {
      standardHeader: 'Categoria',
      aliases: getFieldAliases('egresos', 'Categoria'),
      value: egreso.categoria,
    },
    {
      standardHeader: 'Concepto',
      aliases: getFieldAliases('egresos', 'Concepto'),
      value: egreso.concepto,
    },
    {
      standardHeader: 'Monto',
      aliases: getFieldAliases('egresos', 'Monto'),
      value: egreso.monto,
    },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('egresos', 'Notas'),
      value: egreso.notas || '',
    },
    {
      standardHeader: 'Jornada ID',
      aliases: getFieldAliases('egresos', 'Jornada ID'),
      value: egreso.jornadaId || '',
    },
  ]);
}

export async function updateSueldoRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  sueldo: Sueldo
): Promise<void> {
  if (!sueldo.rowNumber || sueldo.rowNumber < 2) {
    throw new Error('No se encontró la fila del sueldo en Google Sheets.');
  }
  await updateMappedRow(token, spreadsheetId, tabName, 'sueldos', sueldo.rowNumber, [
    { standardHeader: 'ID', aliases: getFieldAliases('sueldos', 'ID'), value: sueldo.id },
    {
      standardHeader: 'Fecha',
      aliases: getFieldAliases('sueldos', 'Fecha'),
      value: asLiteralText(sueldo.fecha),
    },
    {
      standardHeader: 'Trabajador',
      aliases: getFieldAliases('sueldos', 'Trabajador'),
      value: sueldo.trabajador,
    },
    {
      standardHeader: 'Concepto',
      aliases: getFieldAliases('sueldos', 'Concepto'),
      value: sueldo.concepto,
    },
    {
      standardHeader: 'Monto',
      aliases: getFieldAliases('sueldos', 'Monto'),
      value: sueldo.monto,
    },
    {
      standardHeader: 'Notas',
      aliases: getFieldAliases('sueldos', 'Notas'),
      value: sueldo.notas || '',
    },
  ]);
}

export async function appendMovimientosInventarioBatch(
  token: string,
  spreadsheetId: string,
  tabName: string,
  items: Omit<MovimientoInventario, 'id'>[]
): Promise<MovimientoInventario[]> {
  if (items.length === 0) return [];
  const stamp = Date.now().toString().slice(-6);
  const created: MovimientoInventario[] = items.map((m, idx) => ({
    ...m,
    id: `MOV-${stamp}-${idx + 1}`,
  }));

  const headerRes = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!1:1`)}`,
    token
  );
  let row1 = (headerRes.values?.[0] || []).map((c) => String(c ?? '').trim());
  if (isRowEmpty(row1) || !looksLikeHeaderRow('movimientosInventario', row1)) {
    row1 = [...TAB_HEADERS.movimientosInventario];
    await updateRow(token, spreadsheetId, tabName, 1, row1);
  }
  const hIdx = buildHeaderIndex(row1);
  const rowsToAppend = created.map((m) => {
    const row = Array.from({ length: row1.length }, () => '' as string | number);
    const assign = (header: string, val: string | number) => {
      const col = findHeaderColIndex(hIdx, getFieldAliases('movimientosInventario', header));
      if (col !== undefined) row[col] = val;
    };
    assign('ID', m.id);
    assign('Fecha', asLiteralText(m.fecha));
    assign('Tipo', m.tipo);
    assign('Producto ID', m.productoId);
    assign('Producto', m.productoNombre);
    assign('Cantidad', m.cantidadDelta);
    assign('Stock Resultante', m.stockResultante);
    assign('Referencia', m.referencia || '');
    assign('Notas', m.notas || '');
    return row;
  });

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await googleFetch<any>(url, token, {
    method: 'POST',
    body: JSON.stringify({ values: rowsToAppend }),
  });

  return created;
}

const APP_CONFIG_KEY = 'astorga_app_backup_v1';

export async function upsertAppConfigInSheet(
  token: string,
  spreadsheetId: string,
  tabName: string,
  configJson: string
): Promise<void> {
  const fields: FieldSpec[] = [
    {
      standardHeader: 'Clave',
      aliases: getFieldAliases('configuracion', 'Clave'),
      value: APP_CONFIG_KEY,
    },
    {
      standardHeader: 'Valor JSON',
      aliases: getFieldAliases('configuracion', 'Valor JSON'),
      value: configJson,
    },
    {
      standardHeader: 'Actualizado',
      aliases: getFieldAliases('configuracion', 'Actualizado'),
      value: asLiteralText(new Date().toISOString()),
    },
  ];

  const res = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A:Z`)}`,
    token
  );
  const rows = res.values || [];
  let foundRow = -1;
  if (rows.length > 0 && looksLikeHeaderRow('configuracion', rows[0])) {
    const hIdx = buildHeaderIndex(rows[0].map(String));
    for (let i = 1; i < rows.length; i++) {
      const k = getCell(rows[i], hIdx, getFieldAliases('configuracion', 'Clave'), 0);
      if (k === APP_CONFIG_KEY) {
        foundRow = i + 1;
        break;
      }
    }
  }

  if (foundRow > 0) {
    await updateMappedRow(token, spreadsheetId, tabName, 'configuracion', foundRow, fields);
  } else {
    await appendMappedRow(token, spreadsheetId, tabName, 'configuracion', fields);
  }
}

export async function loadAppConfigFromSheet(
  token: string,
  spreadsheetId: string,
  tabName: string
): Promise<string | null> {
  const res = await googleFetch<{ values?: any[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${quoteSheetName(tabName)}!A:Z`)}`,
    token
  );
  const rows = res.values || [];
  if (rows.length === 0) return null;
  const hasHeaders = looksLikeHeaderRow('configuracion', rows[0]);
  const hIdx = hasHeaders
    ? buildHeaderIndex(rows[0].map(String))
    : buildHeaderIndex(TAB_HEADERS.configuracion);
  const start = hasHeaders ? 1 : 0;

  for (let i = start; i < rows.length; i++) {
    const k = getCell(rows[i], hIdx, getFieldAliases('configuracion', 'Clave'), 0);
    if (k === APP_CONFIG_KEY || (!k && rows.length === start + 1)) {
      const val = getCell(rows[i], hIdx, getFieldAliases('configuracion', 'Valor JSON'), 1);
      if (val) return val;
    }
  }
  return null;
}
