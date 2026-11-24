export type TipoVenta = 'Mayoreo' | 'Menudeo';
export type MetodoPago = 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Crédito';
export type EstadoPago = 'Pagado' | 'Parcial' | 'Pendiente';

export interface TicketAbono {
  id: string;
  fecha: string;
  monto: number;
  metodoPago: MetodoPago;
  notas?: string;
}

export interface Ruta {
  id: string;
  nombre: string;
  descripcion: string;
  activa: boolean;
  rowNumber?: number;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precioMayoreo: number;
  precioMenudeo: number;
  inventario: number;
  activo: boolean;
  rowNumber?: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  ruta: string;
  telefono: string;
  direccion: string;
  notas: string;
  fechaRegistro: string;
  rowNumber?: number;
}

export interface TicketItem {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Ticket {
  folio: string;
  fecha: string;
  ruta: string;
  clienteId: string;
  clienteNombre: string;
  tipoVenta: TipoVenta;
  totalPiezas: number;
  totalImporte: number;
  jornadaId: string;
  detalleTexto: string;
  items: TicketItem[];
  metodoPago?: MetodoPago;
  estadoPago?: EstadoPago;
  montoPagado?: number;
  saldoPendiente?: number;
  abonos?: TicketAbono[];
  rowNumber?: number;
}

export interface JornadaInventarioItem {
  productoId: string;
  productoNombre: string;
  cantidadInicial: number;
  cantidadDevuelta?: number;
}

export type JornadaVisitaEstado = 'Pendiente' | 'Visitado' | 'Con pedido';

export interface JornadaVisitaItem {
  clienteId: string;
  clienteNombre: string;
  estado: JornadaVisitaEstado;
  notas?: string;
}

export type JornadaConciliacionMotivo =
  | 'Sin novedad'
  | 'Merma'
  | 'Cortesía'
  | 'Faltante'
  | 'Sobrante';

export interface JornadaConciliacionItem {
  productoId: string;
  productoNombre: string;
  cargado: number;
  vendido: number;
  esperado: number;
  devuelto: number;
  diferencia: number;
  motivo: JornadaConciliacionMotivo;
  notas?: string;
}

export interface Jornada {
  id: string;
  fecha: string;
  ruta: string;
  nombre: string;
  ticketFolios: string[];
  totalTickets: number;
  totalPiezas: number;
  totalImporte: number;
  estado: 'Abierta' | 'Cerrada';
  notas: string;
  inventario: JornadaInventarioItem[];
  visitas?: JornadaVisitaItem[];
  conciliacion?: JornadaConciliacionItem[];
  rowNumber?: number;
}

export type MovimientoInventarioTipo =
  | 'Entrada producción'
  | 'Compra'
  | 'Ajuste manual'
  | 'Merma'
  | 'Cortesía'
  | 'Venta directa'
  | 'Carga jornada'
  | 'Devolución jornada'
  | 'Faltante jornada';

export interface MovimientoInventario {
  id: string;
  fecha: string;
  tipo: MovimientoInventarioTipo;
  productoId: string;
  productoNombre: string;
  cantidadDelta: number;
  stockResultante: number;
  referencia: string;
  notas: string;
  rowNumber?: number;
}

export interface Egreso {
  id: string;
  fecha: string;
  categoria: string;
  concepto: string;
  monto: number;
  notas: string;
  jornadaId?: string;
  rowNumber?: number;
}

export interface ConceptoGasto {
  id: string;
  concepto: string;
  categoria: string;
  montoSugerido: number;
  rowNumber?: number;
}

export interface IngresoOtro {
  id: string;
  fecha: string;
  categoria: string;
  concepto: string;
  monto: number;
  notas: string;
  rowNumber?: number;
}

export interface ConceptoIngreso {
  id: string;
  concepto: string;
  categoria: string;
  montoSugerido: number;
  rowNumber?: number;
}

export interface Sueldo {
  id: string;
  fecha: string;
  trabajador: string;
  concepto: string;
  monto: number;
  notas: string;
  rowNumber?: number;
}

export interface FinanzaMensual {
  mes: string; // YYYY-MM
  fondoBase: number;
  ingresos: number;
  egresos: number;
  utilidadPreliminar: number;
  sueldos: number;
  utilidadNeta: number;
  fondoTotal: number;
  cerrado: boolean;
  fechaCierre: string;
  rowNumber?: number;
}

export type LogicalTabKey =
  | 'productos'
  | 'clientes'
  | 'rutas'
  | 'tickets'
  | 'jornadas'
  | 'movimientosInventario'
  | 'otrosIngresos'
  | 'conceptosIngreso'
  | 'egresos'
  | 'conceptosGasto'
  | 'sueldos'
  | 'finanzasMensuales'
  | 'configuracion';

export type SheetTabMapping = Record<LogicalTabKey, string>;

export interface BusinessDataset {
  productos: Producto[];
  clientes: Cliente[];
  rutas: Ruta[];
  tickets: Ticket[];
  jornadas: Jornada[];
  movimientosInventario: MovimientoInventario[];
  otrosIngresos: IngresoOtro[];
  conceptosIngreso: ConceptoIngreso[];
  egresos: Egreso[];
  conceptosGasto: ConceptoGasto[];
  sueldos: Sueldo[];
  finanzasMensuales: FinanzaMensual[];
}

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

export type AppModule =
  | 'inicio'
  | 'nuevo-pedido'
  | 'jornadas'
  | 'clientes'
  | 'agregar-cliente'
  | 'catalogo'
  | 'ingresos'
  | 'egresos'
  | 'finanzas'
  | 'reportes';
