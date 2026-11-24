import { EstadoPago, MetodoPago, Ticket, TicketAbono } from '../types/business';

export interface TicketPaymentSummary {
  metodoPago: MetodoPago;
  estadoPago: EstadoPago;
  montoPagado: number;
  saldoPendiente: number;
  abonos: TicketAbono[];
}

export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Normalizes payment fields with full backward-compatibility:
 * legacy tickets created before payment tracking had no estadoPago/montoPagado
 * and are treated as already 'Pagado'.
 */
export function getTicketPaymentSummary(ticket: Ticket): TicketPaymentSummary {
  const total = Math.max(0, roundMoney(ticket.totalImporte || 0));
  const abonos = Array.isArray(ticket.abonos) ? ticket.abonos : [];
  const metodoPago: MetodoPago = ticket.metodoPago || 'Efectivo';

  // Legacy ticket (no payment status nor paid amount stored)
  if (
    !ticket.estadoPago &&
    ticket.montoPagado === undefined &&
    ticket.saldoPendiente === undefined
  ) {
    return {
      metodoPago,
      estadoPago: 'Pagado',
      montoPagado: total,
      saldoPendiente: 0,
      abonos,
    };
  }

  let montoPagado =
    ticket.montoPagado !== undefined
      ? Math.max(0, roundMoney(ticket.montoPagado))
      : ticket.estadoPago === 'Pendiente'
      ? 0
      : total;

  if (montoPagado > total) {
    montoPagado = total;
  }

  const saldoPendiente = Math.max(0, roundMoney(total - montoPagado));

  let estadoPago: EstadoPago;
  if (total <= 0.01 || saldoPendiente <= 0.01) {
    estadoPago = 'Pagado';
  } else if (montoPagado > 0) {
    estadoPago = 'Parcial';
  } else {
    estadoPago = 'Pendiente';
  }

  return {
    metodoPago: total <= 0.01 && metodoPago === 'Crédito' ? 'Efectivo' : metodoPago,
    estadoPago,
    montoPagado,
    saldoPendiente: saldoPendiente <= 0.01 ? 0 : saldoPendiente,
    abonos,
  };
}

export function applyAbonoToTicket(ticket: Ticket, abono: TicketAbono): Ticket {
  const summary = getTicketPaymentSummary(ticket);
  const total = Math.max(0, roundMoney(ticket.totalImporte || 0));
  const nextAbonos = [...summary.abonos, abono];
  const nextPagado = Math.min(total, roundMoney(summary.montoPagado + abono.monto));
  const nextSaldo = Math.max(0, roundMoney(total - nextPagado));
  const nextEstado: EstadoPago =
    nextSaldo <= 0.01 ? 'Pagado' : nextPagado > 0 ? 'Parcial' : 'Pendiente';

  return {
    ...ticket,
    metodoPago:
      summary.metodoPago === 'Crédito' && abono.metodoPago !== 'Crédito'
        ? abono.metodoPago
        : summary.metodoPago,
    estadoPago: nextEstado,
    montoPagado: nextPagado,
    saldoPendiente: nextSaldo <= 0.01 ? 0 : nextSaldo,
    abonos: nextAbonos,
  };
}

export function computeClienteSaldoPendiente(
  tickets: Ticket[],
  clienteId: string,
  clienteNombre?: string
): { saldoPendiente: number; ticketsPendientes: number } {
  let saldoPendiente = 0;
  let ticketsPendientes = 0;
  const targetName = (clienteNombre || '').trim().toLowerCase();

  for (const t of tickets) {
    const matches =
      (clienteId && t.clienteId === clienteId) ||
      (targetName && t.clienteNombre.trim().toLowerCase() === targetName);
    if (!matches) continue;
    const pay = getTicketPaymentSummary(t);
    if (pay.saldoPendiente > 0.01) {
      saldoPendiente += pay.saldoPendiente;
      ticketsPendientes += 1;
    }
  }

  return {
    saldoPendiente: roundMoney(saldoPendiente),
    ticketsPendientes,
  };
}
