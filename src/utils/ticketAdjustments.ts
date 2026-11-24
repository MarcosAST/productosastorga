import {
  DescuentoTipo,
  MovimientoInventarioTipo,
  Ticket,
  TicketItem,
  TicketItemTipo,
} from '../types/business';
import { roundMoney } from './paymentHelpers';

export function getTicketItemTipo(item: Pick<TicketItem, 'tipoItem' | 'subtotal'>): TicketItemTipo {
  if (
    item.tipoItem === 'Cortesía' ||
    item.tipoItem === 'Devolución' ||
    item.tipoItem === 'Cambio' ||
    item.tipoItem === 'Venta'
  ) {
    return item.tipoItem;
  }
  if ((item.subtotal || 0) < 0) {
    return 'Devolución';
  }
  return 'Venta';
}

export function normalizeTicketItem(item: TicketItem): TicketItem {
  const tipoItem = getTicketItemTipo(item);
  const cantidad = Math.max(0, Number(item.cantidad) || 0);
  const { precioUnitario, subtotal } = computeTicketItemPricing(
    cantidad,
    Number(item.precioUnitario) || 0,
    tipoItem
  );
  const clean: TicketItem = {
    productoId: item.productoId,
    productoNombre: item.productoNombre,
    cantidad,
    precioUnitario,
    subtotal,
  };
  if (tipoItem !== 'Venta') {
    clean.tipoItem = tipoItem;
  }
  if (tipoItem === 'Devolución' || tipoItem === 'Cambio') {
    clean.regresarInventario =
      item.regresarInventario !== undefined
        ? Boolean(item.regresarInventario)
        : tipoItem === 'Devolución';
  }
  if (item.motivo && item.motivo.trim()) {
    clean.motivo = item.motivo.trim();
  }
  return clean;
}

export function computeTicketItemPricing(
  cantidad: number,
  rawUnitPrice: number,
  tipoItem: TicketItemTipo
): { precioUnitario: number; subtotal: number } {
  const qty = Math.max(0, Number(cantidad) || 0);
  const unit = roundMoney(Math.max(0, Number(rawUnitPrice) || 0));
  if (tipoItem === 'Cortesía' || tipoItem === 'Cambio') {
    return { precioUnitario: 0, subtotal: 0 };
  }
  if (tipoItem === 'Devolución') {
    return { precioUnitario: unit, subtotal: -roundMoney(qty * unit) };
  }
  return { precioUnitario: unit, subtotal: roundMoney(qty * unit) };
}

export interface TicketComputedTotals {
  piezasVenta: number;
  piezasCortesia: number;
  piezasCambio: number;
  piezasDevolucion: number;
  piezasEntregadas: number;
  totalPiezas: number;
  subtotalVentas: number;
  devolucionesMonto: number;
  subtotalBruto: number;
  subtotalNetoItems: number;
  descuentoTipo: DescuentoTipo;
  descuentoValor: number;
  descuentoMonto: number;
  descuentoMotivo: string;
  totalImporte: number;
  hasAdjustments: boolean;
}

export function computeTicketTotals(
  items: TicketItem[],
  discount?: {
    descuentoTipo?: DescuentoTipo;
    descuentoValor?: number;
    descuentoMonto?: number;
    descuentoMotivo?: string;
  }
): TicketComputedTotals {
  let piezasVenta = 0;
  let piezasCortesia = 0;
  let piezasCambio = 0;
  let piezasDevolucion = 0;
  let subtotalVentas = 0;
  let devolucionesMonto = 0;

  for (const it of items) {
    const tipo = getTicketItemTipo(it);
    const qty = Math.max(0, Number(it.cantidad) || 0);
    if (tipo === 'Cortesía') {
      piezasCortesia += qty;
    } else if (tipo === 'Cambio') {
      piezasCambio += qty;
    } else if (tipo === 'Devolución') {
      piezasDevolucion += qty;
      devolucionesMonto += Math.abs(Number(it.subtotal) || 0);
    } else {
      piezasVenta += qty;
      subtotalVentas += Math.max(0, Number(it.subtotal) || 0);
    }
  }

  subtotalVentas = roundMoney(subtotalVentas);
  devolucionesMonto = roundMoney(devolucionesMonto);
  const piezasEntregadas = piezasVenta + piezasCortesia + piezasCambio;
  const totalPiezas = Math.max(0, piezasEntregadas - piezasDevolucion);
  const subtotalNetoItems = roundMoney(subtotalVentas - devolucionesMonto);
  const baseParaDescuento = Math.max(0, subtotalNetoItems);

  const descuentoTipo: DescuentoTipo =
    discount?.descuentoTipo === 'porcentaje' ? 'porcentaje' : 'monto';
  const rawValor = Math.max(0, Number(discount?.descuentoValor) || 0);
  const rawMontoFallback = Math.max(0, Number(discount?.descuentoMonto) || 0);

  let descuentoValor = rawValor;
  let descuentoMonto = 0;

  if (descuentoTipo === 'porcentaje') {
    descuentoValor = Math.min(100, rawValor);
    descuentoMonto = roundMoney(baseParaDescuento * (descuentoValor / 100));
  } else if (discount?.descuentoValor !== undefined && discount.descuentoValor > 0) {
    descuentoMonto = roundMoney(Math.min(baseParaDescuento, rawValor));
    descuentoValor = descuentoMonto;
  } else if (rawMontoFallback > 0) {
    descuentoMonto = roundMoney(Math.min(baseParaDescuento, rawMontoFallback));
    descuentoValor = descuentoMonto;
  }

  const totalImporte = Math.max(0, roundMoney(subtotalNetoItems - descuentoMonto));
  const descuentoMotivo = (discount?.descuentoMotivo || '').trim();
  const hasAdjustments =
    piezasCortesia > 0 ||
    piezasCambio > 0 ||
    piezasDevolucion > 0 ||
    descuentoMonto > 0;

  return {
    piezasVenta,
    piezasCortesia,
    piezasCambio,
    piezasDevolucion,
    piezasEntregadas,
    totalPiezas,
    subtotalVentas,
    devolucionesMonto,
    subtotalBruto: subtotalVentas,
    subtotalNetoItems,
    descuentoTipo,
    descuentoValor,
    descuentoMonto,
    descuentoMotivo,
    totalImporte,
    hasAdjustments,
  };
}

export function getTicketSummary(ticket: Ticket): TicketComputedTotals {
  const computed = computeTicketTotals(ticket.items || [], {
    descuentoTipo: ticket.descuentoTipo,
    descuentoValor: ticket.descuentoValor,
    descuentoMonto: ticket.descuentoMonto,
    descuentoMotivo: ticket.descuentoMotivo,
  });

  // Preserve explicitly persisted totalImporte if items list was empty (legacy text-only tickets)
  if ((!ticket.items || ticket.items.length === 0) && ticket.totalImporte !== undefined) {
    const fallbackTotal = Math.max(0, roundMoney(ticket.totalImporte));
    const desc = Math.max(0, roundMoney(ticket.descuentoMonto || 0));
    const bruto =
      ticket.subtotalBruto !== undefined
        ? roundMoney(ticket.subtotalBruto)
        : roundMoney(fallbackTotal + desc);
    return {
      ...computed,
      totalPiezas: ticket.totalPiezas || 0,
      subtotalBruto: bruto,
      subtotalVentas: bruto,
      descuentoMonto: desc,
      totalImporte: fallbackTotal,
      hasAdjustments: desc > 0 || computed.hasAdjustments,
    };
  }

  return computed;
}

export function formatTicketItemDetalle(it: TicketItem): string {
  const tipo = getTicketItemTipo(it);
  if (tipo === 'Cortesía') {
    return `${it.cantidad}x ${it.productoNombre} [Cortesía $0.00]`;
  }
  if (tipo === 'Cambio') {
    return `${it.cantidad}x ${it.productoNombre} [Cambio $0.00]`;
  }
  if (tipo === 'Devolución') {
    return `${it.cantidad}x ${it.productoNombre} [Devolución -$${Math.abs(it.subtotal).toFixed(2)}]`;
  }
  return `${it.cantidad}x ${it.productoNombre} ($${it.subtotal.toFixed(2)})`;
}

export function buildTicketDetalleTexto(
  items: TicketItem[],
  discount?: {
    descuentoTipo?: DescuentoTipo;
    descuentoValor?: number;
    descuentoMonto?: number;
    descuentoMotivo?: string;
  }
): string {
  const base = items.map(formatTicketItemDetalle).join(', ');
  const totals = computeTicketTotals(items, discount);
  if (totals.descuentoMonto > 0) {
    const label =
      totals.descuentoTipo === 'porcentaje' && totals.descuentoValor > 0
        ? `Desc. ${totals.descuentoValor}% -$${totals.descuentoMonto.toFixed(2)}`
        : `Desc. -$${totals.descuentoMonto.toFixed(2)}`;
    return base ? `${base} | ${label}` : label;
  }
  return base;
}

/**
 * Returns inventory stock delta for general warehouse deductions on direct tickets,
 * grouped by Kardex MovimientoInventarioTipo.
 */
export interface TicketInventoryBatchGroup {
  tipo: MovimientoInventarioTipo;
  deltas: { productoId: string; productoNombre: string; delta: number; noteSuffix?: string }[];
}

export function computeTicketGeneralInventoryEffects(
  items: TicketItem[]
): {
  stockDeltas: { productoId: string; productoNombre: string; delta: number }[];
  kardexGroups: TicketInventoryBatchGroup[];
} {
  const stockDeltas: { productoId: string; productoNombre: string; delta: number }[] = [];
  const byTipo = new Map<
    MovimientoInventarioTipo,
    { productoId: string; productoNombre: string; delta: number; noteSuffix?: string }[]
  >();

  const pushGroup = (
    tipo: MovimientoInventarioTipo,
    entry: { productoId: string; productoNombre: string; delta: number; noteSuffix?: string }
  ) => {
    const arr = byTipo.get(tipo) || [];
    arr.push(entry);
    byTipo.set(tipo, arr);
  };

  for (const it of items) {
    if (!it.cantidad || it.cantidad <= 0) continue;
    const tipo = getTicketItemTipo(it);
    if (tipo === 'Venta') {
      stockDeltas.push({
        productoId: it.productoId,
        productoNombre: it.productoNombre,
        delta: -it.cantidad,
      });
      pushGroup('Venta directa', {
        productoId: it.productoId,
        productoNombre: it.productoNombre,
        delta: -it.cantidad,
      });
    } else if (tipo === 'Cortesía') {
      stockDeltas.push({
        productoId: it.productoId,
        productoNombre: it.productoNombre,
        delta: -it.cantidad,
      });
      pushGroup('Cortesía', {
        productoId: it.productoId,
        productoNombre: it.productoNombre,
        delta: -it.cantidad,
        noteSuffix: it.motivo ? `(${it.motivo})` : undefined,
      });
    } else if (tipo === 'Cambio') {
      // Replacement piece goes out from warehouse; if returned piece is damaged (default), net sellable stock decreases
      const delta = it.regresarInventario ? 0 : -it.cantidad;
      if (delta !== 0) {
        stockDeltas.push({
          productoId: it.productoId,
          productoNombre: it.productoNombre,
          delta,
        });
      }
      pushGroup('Cambio cliente', {
        productoId: it.productoId,
        productoNombre: it.productoNombre,
        delta,
        noteSuffix: it.regresarInventario
          ? 'Cambio mano a mano (pieza apta)'
          : `Cambio por pieza dañada/merma${it.motivo ? `: ${it.motivo}` : ''}`,
      });
    } else if (tipo === 'Devolución') {
      if (it.regresarInventario !== false) {
        stockDeltas.push({
          productoId: it.productoId,
          productoNombre: it.productoNombre,
          delta: it.cantidad,
        });
        pushGroup('Devolución cliente', {
          productoId: it.productoId,
          productoNombre: it.productoNombre,
          delta: it.cantidad,
          noteSuffix: it.motivo ? `(${it.motivo})` : 'Reingreso a stock',
        });
      } else {
        // Damaged return does not increase sellable stock; log merma trace (delta 0)
        pushGroup('Merma', {
          productoId: it.productoId,
          productoNombre: it.productoNombre,
          delta: 0,
          noteSuffix: `Devolución dañada ${it.cantidad} pzas${it.motivo ? ` (${it.motivo})` : ''}`,
        });
      }
    }
  }

  const kardexGroups: TicketInventoryBatchGroup[] = Array.from(byTipo.entries()).map(
    ([tipo, deltas]) => ({ tipo, deltas })
  );

  return { stockDeltas, kardexGroups };
}

/**
 * Computes net pieces removed from a Jornada load for one ticket item.
 * Positive = pieces left the truck; Negative = usable pieces returned to the truck.
 */
export function getTicketJornadaSoldDelta(item: TicketItem): number {
  const tipo = getTicketItemTipo(item);
  const qty = Math.max(0, Number(item.cantidad) || 0);
  if (tipo === 'Venta' || tipo === 'Cortesía') {
    return qty;
  }
  if (tipo === 'Cambio') {
    return item.regresarInventario ? 0 : qty;
  }
  // Devolución
  return item.regresarInventario !== false ? -qty : 0;
}

/**
 * Contribution of a ticket item to product sales statistics (paid pieces & net amount).
 */
export function getTicketItemSalesStatsDelta(item: TicketItem): {
  piezasVendidas: number;
  importe: number;
} {
  const tipo = getTicketItemTipo(item);
  const qty = Math.max(0, Number(item.cantidad) || 0);
  if (tipo === 'Venta') {
    return { piezasVendidas: qty, importe: Number(item.subtotal) || 0 };
  }
  if (tipo === 'Devolución') {
    return { piezasVendidas: -qty, importe: Number(item.subtotal) || 0 };
  }
  // Cortesía & Cambio don't count as paid sales pieces or revenue
  return { piezasVendidas: 0, importe: 0 };
}
