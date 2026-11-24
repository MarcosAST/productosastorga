import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Edit2,
  Trash2,
  Printer,
  Plus,
  Minus,
  Save,
  RotateCcw,
  Receipt,
  CreditCard,
  MessageCircle,
  Download,
  Share2,
  CheckCircle2,
  Clock,
  DollarSign,
} from 'lucide-react';
import {
  BusinessDataset,
  DescuentoTipo,
  MetodoPago,
  Producto,
  Ticket,
  TicketAbono,
  TicketItem,
  TicketItemTipo,
  TipoVenta,
} from '../types/business';
import {
  formatCurrency,
  formatDateShort,
  formatNumber,
  getTodayISO,
  normalizeText,
} from '../utils/formatters';
import { getTicketPaymentSummary, roundMoney } from '../utils/paymentHelpers';
import {
  buildTicketDetalleTexto,
  computeTicketItemPricing,
  computeTicketTotals,
  getTicketItemTipo,
  getTicketSummary,
  normalizeTicketItem,
} from '../utils/ticketAdjustments';
import {
  buildWhatsAppTicketUrl,
  BUSINESS_BRANDING,
  downloadTicketReceiptPng,
  resolveLogoDataUrl,
  shareTicketReceiptPng,
} from '../utils/ticketShare';
import { DEFAULT_LOGO_PATH } from '../utils/themeManager';
import { PendingMutation } from './ConfirmMutationModal';

interface TicketDetailModalProps {
  ticket: Ticket | null;
  initialEditMode?: boolean;
  dataset: BusinessDataset;
  ticketsTabName: string;
  logoUrl: string;
  onClose: () => void;
  onRequestMutation: (mutation: PendingMutation) => void;
  onUpdateTicket: (ticket: Ticket) => Promise<void>;
  onRecordAbono?: (ticket: Ticket, abono: TicketAbono) => Promise<void>;
  onDeleteTicket: (ticket: Ticket) => Promise<void>;
}

const METODOS_PAGO: MetodoPago[] = ['Efectivo', 'Transferencia', 'Tarjeta', 'Crédito'];
const METODOS_ABONO: MetodoPago[] = ['Efectivo', 'Transferencia', 'Tarjeta'];

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  initialEditMode = false,
  dataset,
  ticketsTabName,
  logoUrl,
  onClose,
  onRequestMutation,
  onUpdateTicket,
  onRecordAbono,
  onDeleteTicket,
}) => {
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [fecha, setFecha] = useState('');
  const [ruta, setRuta] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [tipoVenta, setTipoVenta] = useState<TipoVenta>('Mayoreo');
  const [jornadaId, setJornadaId] = useState('');
  const [items, setItems] = useState<TicketItem[]>([]);
  const [selectedAddProductId, setSelectedAddProductId] = useState('');
  const [addItemTipo, setAddItemTipo] = useState<TicketItemTipo>('Venta');

  // Edit mode discount fields
  const [descuentoTipo, setDescuentoTipo] = useState<DescuentoTipo>('monto');
  const [descuentoValor, setDescuentoValor] = useState<string>('');
  const [descuentoMotivo, setDescuentoMotivo] = useState<string>('');

  // Edit mode payment fields
  const [editMetodoPago, setEditMetodoPago] = useState<MetodoPago>('Efectivo');
  const [editMontoPagado, setEditMontoPagado] = useState<string>('');

  // Inline abono form
  const [showAbonoForm, setShowAbonoForm] = useState(false);
  const [abonoMonto, setAbonoMonto] = useState('');
  const [abonoMetodo, setAbonoMetodo] = useState<MetodoPago>('Efectivo');
  const [abonoFecha, setAbonoFecha] = useState(getTodayISO());
  const [abonoNotas, setAbonoNotas] = useState('');

  // Receipt sharing feedback
  const [shareFeedback, setShareFeedback] = useState('');
  const [isGeneratingPng, setIsGeneratingPng] = useState(false);
  const [resolvedLogoSrc, setResolvedLogoSrc] = useState<string>(
    logoUrl || DEFAULT_LOGO_PATH
  );

  useEffect(() => {
    let active = true;
    resolveLogoDataUrl(logoUrl).then((dataUrl) => {
      if (active && dataUrl) {
        setResolvedLogoSrc(dataUrl);
      }
    });
    return () => {
      active = false;
    };
  }, [logoUrl]);

  useEffect(() => {
    if (!ticket) return;
    const pay = getTicketPaymentSummary(ticket);
    setIsEditing(initialEditMode);
    setFecha(ticket.fecha);
    setRuta(ticket.ruta);
    setClienteId(ticket.clienteId);
    setClienteNombre(ticket.clienteNombre);
    setTipoVenta(ticket.tipoVenta);
    setJornadaId(ticket.jornadaId || '');
    setItems(ticket.items.map((it) => ({ ...it })));
    setSelectedAddProductId('');
    setAddItemTipo('Venta');
    setDescuentoTipo(ticket.descuentoTipo || 'monto');
    setDescuentoValor(
      ticket.descuentoValor && ticket.descuentoValor > 0
        ? String(ticket.descuentoValor)
        : ticket.descuentoMonto && ticket.descuentoMonto > 0
        ? String(ticket.descuentoMonto)
        : ''
    );
    setDescuentoMotivo(ticket.descuentoMotivo || '');
    setEditMetodoPago(pay.metodoPago);
    setEditMontoPagado(String(pay.montoPagado));
    setShowAbonoForm(false);
    setAbonoMonto(pay.saldoPendiente > 0 ? String(pay.saldoPendiente) : '');
    setAbonoMetodo('Efectivo');
    setAbonoFecha(getTodayISO());
    setAbonoNotas('');
    setShareFeedback('');
  }, [ticket, initialEditMode]);

  const routeClients = useMemo(() => {
    if (!ruta) return dataset.clientes;
    const filtered = dataset.clientes.filter(
      (c) => normalizeText(c.ruta) === normalizeText(ruta)
    );
    return filtered.length > 0 ? filtered : dataset.clientes;
  }, [dataset.clientes, ruta]);

  const activeProducts = useMemo(
    () => dataset.productos.filter((p) => p.activo),
    [dataset.productos]
  );

  const editTotals = useMemo(
    () =>
      computeTicketTotals(items, {
        descuentoTipo,
        descuentoValor: parseFloat(descuentoValor) || 0,
        descuentoMotivo,
      }),
    [items, descuentoTipo, descuentoValor, descuentoMotivo]
  );

  const editTotalPiezas = editTotals.totalPiezas;
  const editTotalImporte = editTotals.totalImporte;

  if (!ticket) return null;

  const ticketSummary = getTicketSummary(ticket);
  const payment = getTicketPaymentSummary(ticket);
  const clienteObj = dataset.clientes.find(
    (c) =>
      (ticket.clienteId && c.id === ticket.clienteId) ||
      normalizeText(c.nombre) === normalizeText(ticket.clienteNombre)
  );
  const whatsAppUrl = buildWhatsAppTicketUrl(ticket, clienteObj?.telefono);

  const triggerPrintWithMode = async (mode: 'thermal' | 'standard') => {
    const ensured = await resolveLogoDataUrl(logoUrl);
    if (ensured && ensured !== resolvedLogoSrc) {
      setResolvedLogoSrc(ensured);
    }
    const html = document.documentElement;
    html.setAttribute('data-print-mode', mode);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      html.removeAttribute('data-print-mode');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      window.print();
    }, 100);
    setTimeout(cleanup, 3500);
  };

  const handleThermalPrint = () => {
    void triggerPrintWithMode('thermal');
  };

  const handleStandardPrint = () => {
    void triggerPrintWithMode('standard');
  };

  const handleDownloadPng = async () => {
    setIsGeneratingPng(true);
    setShareFeedback('');
    try {
      await downloadTicketReceiptPng(ticket, logoUrl);
      setShareFeedback('Comprobante PNG descargado.');
    } catch (err: any) {
      setShareFeedback(err?.message || 'No se pudo generar la imagen.');
    } finally {
      setIsGeneratingPng(false);
    }
  };

  const handleSharePng = async () => {
    setIsGeneratingPng(true);
    setShareFeedback('');
    try {
      const mode = await shareTicketReceiptPng(ticket, logoUrl);
      setShareFeedback(
        mode === 'shared'
          ? 'Comprobante compartido.'
          : 'Comprobante PNG descargado para enviar.'
      );
    } catch (err: any) {
      setShareFeedback(err?.message || 'No se pudo compartir la imagen.');
    } finally {
      setIsGeneratingPng(false);
    }
  };

  const handleConfirmAbono = (e: React.FormEvent, fullLiquidation = false) => {
    e.preventDefault();
    if (!onRecordAbono) return;
    const amount = fullLiquidation
      ? payment.saldoPendiente
      : Math.min(payment.saldoPendiente, Math.max(0, roundMoney(parseFloat(abonoMonto) || 0)));
    if (amount <= 0) return;

    const newAbono: TicketAbono = {
      id: `AB-${Date.now().toString().slice(-6)}`,
      fecha: abonoFecha || getTodayISO(),
      monto: amount,
      metodoPago: abonoMetodo,
      notas: abonoNotas.trim() || (fullLiquidation ? 'Liquidación total' : 'Abono a cuenta'),
    };

    const nextSaldo = Math.max(0, roundMoney(payment.saldoPendiente - amount));
    onRequestMutation({
      title: `Registrar abono a ${ticket.folio}`,
      description: `Se registrará el pago de ${formatCurrency(amount)} (${abonoMetodo}) y se actualizará el saldo pendiente del ticket.`,
      sheetTab: ticketsTabName,
      details: [
        { label: 'Ticket / Cliente', value: `${ticket.folio} · ${ticket.clienteNombre}` },
        { label: 'Abono a registrar', value: formatCurrency(amount) },
        { label: 'Método', value: abonoMetodo },
        {
          label: 'Nuevo saldo pendiente',
          value: nextSaldo <= 0.01 ? '$0.00 (Pagado)' : formatCurrency(nextSaldo),
        },
      ],
      confirmLabel: 'Confirmar abono',
      onConfirm: async () => {
        await onRecordAbono(ticket, newAbono);
        setShowAbonoForm(false);
      },
    });
  };

  const updateItemQty = (index: number, nextQty: number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const cantidad = Math.max(1, nextQty);
        const tipo = getTicketItemTipo(it);
        const { precioUnitario, subtotal } = computeTicketItemPricing(
          cantidad,
          it.precioUnitario,
          tipo
        );
        return {
          ...it,
          cantidad,
          precioUnitario,
          subtotal,
        };
      })
    );
  };

  const updateItemPrice = (index: number, rawVal: string) => {
    const parsed = parseFloat(rawVal);
    const rawUnit = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const tipo = getTicketItemTipo(it);
        const { precioUnitario, subtotal } = computeTicketItemPricing(
          it.cantidad,
          rawUnit,
          tipo
        );
        return {
          ...it,
          precioUnitario,
          subtotal,
        };
      })
    );
  };

  const updateItemTipo = (index: number, nextTipo: TicketItemTipo) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        let baseUnit = it.precioUnitario;
        if ((nextTipo === 'Venta' || nextTipo === 'Devolución') && baseUnit <= 0) {
          const prod = dataset.productos.find(
            (p) =>
              (it.productoId && p.id === it.productoId) ||
              normalizeText(p.nombre) === normalizeText(it.productoNombre)
          );
          if (prod) {
            baseUnit = tipoVenta === 'Mayoreo' ? prod.precioMayoreo : prod.precioMenudeo;
          }
        }
        const { precioUnitario, subtotal } = computeTicketItemPricing(
          it.cantidad,
          baseUnit,
          nextTipo
        );
        return normalizeTicketItem({
          ...it,
          tipoItem: nextTipo,
          precioUnitario,
          subtotal,
          regresarInventario:
            nextTipo === 'Devolución'
              ? it.regresarInventario ?? true
              : nextTipo === 'Cambio'
              ? it.regresarInventario ?? false
              : undefined,
        });
      })
    );
  };

  const updateItemMeta = (
    index: number,
    patch: { regresarInventario?: boolean; motivo?: string }
  ) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddProduct = () => {
    if (!selectedAddProductId) return;
    const prod: Producto | undefined = dataset.productos.find(
      (p) => p.id === selectedAddProductId
    );
    if (!prod) return;

    const catalogPrice = tipoVenta === 'Mayoreo' ? prod.precioMayoreo : prod.precioMenudeo;
    const { precioUnitario, subtotal } = computeTicketItemPricing(
      1,
      catalogPrice,
      addItemTipo
    );

    setItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) =>
          getTicketItemTipo(it) === addItemTipo &&
          ((it.productoId && it.productoId === prod.id) ||
            normalizeText(it.productoNombre) === normalizeText(prod.nombre))
      );
      if (existingIdx >= 0) {
        return prev.map((it, i) => {
          if (i !== existingIdx) return it;
          const cantidad = it.cantidad + 1;
          const pricing = computeTicketItemPricing(
            cantidad,
            it.precioUnitario,
            addItemTipo
          );
          return {
            ...it,
            cantidad,
            precioUnitario: pricing.precioUnitario,
            subtotal: pricing.subtotal,
          };
        });
      }
      return [
        ...prev,
        normalizeTicketItem({
          productoId: prod.id,
          productoNombre: prod.nombre,
          cantidad: 1,
          precioUnitario,
          subtotal,
          tipoItem: addItemTipo,
          ...(addItemTipo === 'Devolución'
            ? { regresarInventario: true }
            : addItemTipo === 'Cambio'
            ? { regresarInventario: false }
            : {}),
        }),
      ];
    });
    setSelectedAddProductId('');
  };

  const handleClienteSelect = (newId: string) => {
    const found = dataset.clientes.find((c) => c.id === newId);
    if (found) {
      setClienteId(found.id);
      setClienteNombre(found.nombre);
      if (found.ruta) setRuta(found.ruta);
    }
  };

  const handleApplyCatalogPrices = (nextTipo: TipoVenta) => {
    setTipoVenta(nextTipo);
    setItems((prev) =>
      prev.map((it) => {
        const tipo = getTicketItemTipo(it);
        if (tipo === 'Cortesía' || tipo === 'Cambio') return it;
        const prod = dataset.productos.find(
          (p) =>
            (it.productoId && p.id === it.productoId) ||
            normalizeText(p.nombre) === normalizeText(it.productoNombre)
        );
        if (!prod) return it;
        const nextPrice = nextTipo === 'Mayoreo' ? prod.precioMayoreo : prod.precioMenudeo;
        const pricing = computeTicketItemPricing(it.cantidad, nextPrice, tipo);
        return {
          ...it,
          precioUnitario: pricing.precioUnitario,
          subtotal: pricing.subtotal,
        };
      })
    );
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    const cleanItems = items.map(normalizeTicketItem);
    const parsedPagado = Math.min(
      editTotalImporte,
      Math.max(0, roundMoney(parseFloat(editMontoPagado) || 0))
    );
    const normalizedPay = getTicketPaymentSummary({
      ...ticket,
      totalImporte: editTotalImporte,
      metodoPago: editMetodoPago,
      montoPagado: parsedPagado,
      estadoPago:
        editTotalImporte <= 0.01 || parsedPagado >= editTotalImporte - 0.01
          ? 'Pagado'
          : parsedPagado > 0
          ? 'Parcial'
          : 'Pendiente',
      saldoPendiente: Math.max(0, roundMoney(editTotalImporte - parsedPagado)),
    });

    const updatedTicket: Ticket = {
      ...ticket,
      fecha,
      ruta: ruta.trim() || ticket.ruta,
      clienteId,
      clienteNombre: clienteNombre.trim() || ticket.clienteNombre,
      tipoVenta,
      jornadaId,
      totalPiezas: editTotalPiezas,
      totalImporte: editTotalImporte,
      subtotalBruto: editTotals.subtotalBruto,
      ...(editTotals.descuentoMonto > 0
        ? {
            descuentoTipo: editTotals.descuentoTipo,
            descuentoValor: editTotals.descuentoValor,
            descuentoMonto: editTotals.descuentoMonto,
            ...(editTotals.descuentoMotivo
              ? { descuentoMotivo: editTotals.descuentoMotivo }
              : { descuentoMotivo: undefined }),
          }
        : {
            descuentoTipo: undefined,
            descuentoValor: undefined,
            descuentoMonto: undefined,
            descuentoMotivo: undefined,
          }),
      items: cleanItems,
      detalleTexto: buildTicketDetalleTexto(cleanItems, editTotals),
      metodoPago: normalizedPay.metodoPago,
      estadoPago: normalizedPay.estadoPago,
      montoPagado: normalizedPay.montoPagado,
      saldoPendiente: normalizedPay.saldoPendiente,
      abonos: normalizedPay.abonos,
    };

    onRequestMutation({
      title: `Actualizar ticket ${ticket.folio}`,
      description:
        'Se actualizarán los datos, productos, precios y cobranza de este ticket.',
      sheetTab: ticketsTabName,
      details: [
        { label: 'Folio', value: ticket.folio },
        { label: 'Fecha', value: formatDateShort(fecha) },
        { label: 'Cliente', value: updatedTicket.clienteNombre },
        { label: 'Ruta', value: updatedTicket.ruta },
        { label: 'Total actualizado', value: formatCurrency(editTotalImporte) },
        {
          label: 'Cobranza',
          value: `${normalizedPay.estadoPago} · Cobrado ${formatCurrency(
            normalizedPay.montoPagado
          )}`,
        },
      ],
      confirmLabel: 'Guardar cambios',
      onConfirm: async () => {
        await onUpdateTicket(updatedTicket);
        setIsEditing(false);
      },
    });
  };

  const handleDelete = () => {
    onRequestMutation({
      title: `Eliminar ticket ${ticket.folio}`,
      description:
        'Esta acción eliminará permanentemente la fila del ticket en Google Sheets.',
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
        onClose();
      },
    });
  };

  const paymentBadgeClasses =
    payment.estadoPago === 'Pagado'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : payment.estadoPago === 'Parcial'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200';

  const effectiveLogo = resolvedLogoSrc || logoUrl || DEFAULT_LOGO_PATH;

  const thermalPortal = createPortal(
    <div className="thermal-receipt-only" aria-hidden="true">
      <div style={{ marginBottom: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 4,
          }}
        >
          <img
            src={effectiveLogo}
            alt="Productos Astorga"
            style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }}
          />
          <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.15, textAlign: 'left' }}>
            PRODUCTOS ASTORGA
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 10 }}>{BUSINESS_BRANDING.location}</div>
        <div style={{ textAlign: 'center', fontSize: 10 }}>IG: {BUSINESS_BRANDING.instagram}</div>
        <div style={{ textAlign: 'center', fontSize: 10 }}>Cel / WA: {BUSINESS_BRANDING.phone}</div>
      </div>
      <div style={{ borderTop: '1px dashed #000', paddingTop: 5, marginBottom: 5 }}>
        <div>
          <strong>Folio:</strong> {ticket.folio}
        </div>
        <div>
          <strong>Fecha:</strong> {formatDateShort(ticket.fecha)}
        </div>
        <div>
          <strong>Cliente:</strong> {ticket.clienteNombre}
        </div>
        <div>
          <strong>Ruta:</strong> {ticket.ruta}
        </div>
      </div>
      <div style={{ borderTop: '1px dashed #000', paddingTop: 5, marginBottom: 5 }}>
        {ticket.items.map((it, idx) => {
          const tipo = getTicketItemTipo(it);
          return (
            <div key={idx} style={{ marginBottom: 4 }}>
              <div style={{ fontWeight: 600 }}>
                {it.productoNombre}
                {tipo !== 'Venta' ? ` [${tipo}]` : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {it.cantidad} x{' '}
                  {tipo === 'Cortesía' || tipo === 'Cambio'
                    ? '$0.00'
                    : formatCurrency(it.precioUnitario)}
                </span>
                <strong>
                  {tipo === 'Devolución'
                    ? `-${formatCurrency(Math.abs(it.subtotal))}`
                    : formatCurrency(it.subtotal)}
                </strong>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: '1px dashed #000', paddingTop: 5, marginBottom: 6 }}>
        {(ticketSummary.devolucionesMonto > 0 || ticketSummary.descuentoMonto > 0) && (
          <div style={{ fontSize: 10, marginBottom: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span>{formatCurrency(ticketSummary.subtotalBruto)}</span>
            </div>
            {ticketSummary.devolucionesMonto > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Devoluciones:</span>
                <span>-{formatCurrency(ticketSummary.devolucionesMonto)}</span>
              </div>
            )}
            {ticketSummary.descuentoMonto > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  Desc.
                  {ticketSummary.descuentoTipo === 'porcentaje' &&
                  ticketSummary.descuentoValor > 0
                    ? ` (${ticketSummary.descuentoValor}%)`
                    : ''}
                  :
                </span>
                <span>-{formatCurrency(ticketSummary.descuentoMonto)}</span>
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Piezas:</span>
          <strong>{ticket.totalPiezas}</strong>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            fontWeight: 700,
            marginTop: 2,
          }}
        >
          <span>TOTAL:</span>
          <span>{formatCurrency(ticket.totalImporte)}</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 10 }}>
          Pago: {payment.estadoPago} ({payment.metodoPago})
        </div>
        {payment.saldoPendiente > 0 && (
          <div style={{ fontSize: 10 }}>
            <div>Abonado: {formatCurrency(payment.montoPagado)}</div>
            <div style={{ fontWeight: 700 }}>
              Saldo pendiente: {formatCurrency(payment.saldoPendiente)}
            </div>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, borderTop: '1px dashed #000', paddingTop: 6 }}>
        ¡Gracias por su preferencia!
      </div>
    </div>,
    document.body
  );

  const standardPortal = createPortal(
    <div className="standard-receipt-only" aria-hidden="true">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          paddingBottom: 12,
          borderBottom: '2px solid #4A2511',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src={effectiveLogo}
            alt={BUSINESS_BRANDING.name}
            style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1A17' }}>
              PRODUCTOS ASTORGA
            </div>
            <div style={{ fontSize: 11, color: '#49403A' }}>{BUSINESS_BRANDING.location}</div>
            <div style={{ fontSize: 11, color: '#6E6259' }}>
              IG: {BUSINESS_BRANDING.instagram} · Cel/WA: {BUSINESS_BRANDING.phone}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#4A2511' }}>
            {ticket.folio}
          </div>
          <div style={{ fontSize: 11, color: '#6E6259' }}>{formatDateShort(ticket.fecha)}</div>
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12 }}>
        <div>
          <strong>Cliente:</strong> {ticket.clienteNombre}
        </div>
        <div>
          <strong>Ruta:</strong> {ticket.ruta}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #D8D1C7', fontSize: 11, color: '#6E6259' }}>
            <th style={{ textAlign: 'left', padding: '6px 4px' }}>Producto</th>
            <th style={{ textAlign: 'center', padding: '6px 4px' }}>Cant.</th>
            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Precio</th>
            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {ticket.items.map((it, idx) => {
            const tipo = getTicketItemTipo(it);
            return (
              <tr key={idx} style={{ borderBottom: '1px solid #EFECE6', fontSize: 12 }}>
                <td style={{ padding: '6px 4px', fontWeight: 600 }}>
                  {it.productoNombre}
                  {tipo !== 'Venta' && (
                    <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 5 }}>
                      [{tipo}]
                    </span>
                  )}
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'center' }}>{it.cantidad}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {tipo === 'Cortesía' || tipo === 'Cambio'
                    ? '$0.00'
                    : formatCurrency(it.precioUnitario)}
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>
                  {tipo === 'Devolución'
                    ? `-${formatCurrency(Math.abs(it.subtotal))}`
                    : formatCurrency(it.subtotal)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {(ticketSummary.devolucionesMonto > 0 || ticketSummary.descuentoMonto > 0) && (
        <div style={{ fontSize: 11, marginBottom: 8, color: '#49403A' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal ventas:</span>
            <span>{formatCurrency(ticketSummary.subtotalBruto)}</span>
          </div>
          {ticketSummary.devolucionesMonto > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B91C1C' }}>
              <span>Devoluciones:</span>
              <span>-{formatCurrency(ticketSummary.devolucionesMonto)}</span>
            </div>
          )}
          {ticketSummary.descuentoMonto > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857' }}>
              <span>
                Descuento
                {ticketSummary.descuentoTipo === 'porcentaje' &&
                ticketSummary.descuentoValor > 0
                  ? ` (${ticketSummary.descuentoValor}%)`
                  : ''}
                {ticketSummary.descuentoMotivo ? ` · ${ticketSummary.descuentoMotivo}` : ''}:
              </span>
              <span>-{formatCurrency(ticketSummary.descuentoMonto)}</span>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 10,
          borderTop: '1.5px solid #4A2511',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 12 }}>
          Total piezas: <strong>{ticket.totalPiezas}</strong>
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#4A2511' }}>
          TOTAL: {formatCurrency(ticket.totalImporte)}
        </span>
      </div>

      <div
        style={{
          background: '#FAF6F0',
          border: '1px solid #E7E3DC',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 11,
          marginBottom: 14,
        }}
      >
        <div>
          <strong>Estado de pago:</strong> {payment.estadoPago} ({payment.metodoPago})
        </div>
        {payment.saldoPendiente > 0 && (
          <div style={{ marginTop: 3 }}>
            Abonado: {formatCurrency(payment.montoPagado)} ·{' '}
            <strong style={{ color: '#B91C1C' }}>
              Saldo pendiente: {formatCurrency(payment.saldoPendiente)}
            </strong>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#6E6259' }}>
        ¡Gracias por su compra en Productos Astorga!
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {thermalPortal}
      {standardPortal}
      <div className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
        <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#EFECE6]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Receipt className="w-5 h-5 text-[var(--theme-primary)] shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-[#1F1A17] truncate">
                    {isEditing ? `Editar ticket ${ticket.folio}` : `Ticket ${ticket.folio}`}
                  </h2>
                  {!isEditing && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${paymentBadgeClasses}`}
                    >
                      {payment.estadoPago === 'Pagado' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      {payment.estadoPago}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6E6259] truncate">
                  {formatDateShort(ticket.fecha)} · {ticket.ruta}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar ticket"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          {!isEditing ? (
            <>
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
                {/* Receipt Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-[#FAF8F5] border border-[#EFECE6] p-4">
                  <div className="flex flex-row items-center gap-3.5">
                    <img
                      src={effectiveLogo}
                      alt={BUSINESS_BRANDING.name}
                      className="h-14 w-14 object-contain shrink-0"
                    />
                    <div>
                      <p className="text-sm font-bold text-[#1F1A17]">{BUSINESS_BRANDING.name}</p>
                      <p className="text-[11px] text-[#6E6259]">
                        {BUSINESS_BRANDING.location}
                      </p>
                      <p className="text-[11px] text-[#6E6259]">
                        IG: {BUSINESS_BRANDING.instagram} · Cel/WA: {BUSINESS_BRANDING.phone}
                      </p>
                      <p className="text-xs text-[#6E6259] mt-1">
                        Cliente: <strong className="text-[#1F1A17]">{ticket.clienteNombre}</strong> · Ruta: {ticket.ruta}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-mono text-base font-bold text-[var(--theme-primary)]">
                      {ticket.folio}
                    </p>
                    <p className="text-xs text-[#6E6259]">{formatDateShort(ticket.fecha)}</p>
                    {ticket.jornadaId && (
                      <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                        {dataset.jornadas.find((j) => j.id === ticket.jornadaId)?.nombre ||
                          'Agrupado en jornada'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div className="rounded-xl border border-[#EFECE6] overflow-hidden">
                  {ticket.items.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FAF8F5] border-b border-[#EFECE6] text-xs font-semibold text-[#6E6259]">
                          <th className="py-2.5 px-3.5">Producto</th>
                          <th className="py-2.5 px-3 text-center">Cant.</th>
                          <th className="py-2.5 px-3 text-right">Precio</th>
                          <th className="py-2.5 px-3.5 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFECE6] text-sm">
                        {ticket.items.map((it, idx) => {
                          const tipo = getTicketItemTipo(it);
                          return (
                            <tr key={`${it.productoId}-${idx}`}>
                              <td className="py-2.5 px-3.5 font-medium text-[#1F1A17]">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span>{it.productoNombre}</span>
                                  {tipo !== 'Venta' && (
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                        tipo === 'Devolución'
                                          ? 'bg-red-50 text-red-700 border border-red-200'
                                          : tipo === 'Cortesía'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-sky-50 text-sky-700 border border-sky-200'
                                      }`}
                                    >
                                      {tipo}
                                    </span>
                                  )}
                                </div>
                                {it.motivo && (
                                  <p className="text-[11px] text-[#6E6259] font-normal mt-0.5">
                                    {it.motivo}
                                  </p>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center tabular-nums text-[#49403A]">
                                {it.cantidad}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-[#6E6259]">
                                {tipo === 'Cortesía' || tipo === 'Cambio'
                                  ? '$0.00'
                                  : formatCurrency(it.precioUnitario)}
                              </td>
                              <td
                                className={`py-2.5 px-3.5 text-right font-semibold tabular-nums ${
                                  tipo === 'Devolución'
                                    ? 'text-red-700'
                                    : tipo === 'Cortesía' || tipo === 'Cambio'
                                    ? 'text-emerald-700'
                                    : 'text-[#1F1A17]'
                                }`}
                              >
                                {tipo === 'Devolución'
                                  ? `-${formatCurrency(Math.abs(it.subtotal))}`
                                  : formatCurrency(it.subtotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-sm text-[#49403A]">
                      {ticket.detalleTexto || 'Sin detalle de productos registrado.'}
                    </div>
                  )}

                  {(ticketSummary.devolucionesMonto > 0 ||
                    ticketSummary.descuentoMonto > 0) && (
                    <div className="px-4 py-2.5 bg-white border-t border-[#EFECE6] space-y-1 text-xs">
                      <div className="flex items-center justify-between text-[#6E6259]">
                        <span>Subtotal ventas</span>
                        <span className="font-semibold text-[#1F1A17] tabular-nums">
                          {formatCurrency(ticketSummary.subtotalBruto)}
                        </span>
                      </div>
                      {ticketSummary.devolucionesMonto > 0 && (
                        <div className="flex items-center justify-between text-red-700">
                          <span>Devoluciones ({ticketSummary.piezasDevolucion} pzas)</span>
                          <span className="font-semibold tabular-nums">
                            -{formatCurrency(ticketSummary.devolucionesMonto)}
                          </span>
                        </div>
                      )}
                      {ticketSummary.descuentoMonto > 0 && (
                        <div className="flex items-center justify-between text-emerald-700">
                          <span>
                            Descuento
                            {ticketSummary.descuentoTipo === 'porcentaje' &&
                            ticketSummary.descuentoValor > 0
                              ? ` (${ticketSummary.descuentoValor}%)`
                              : ''}
                            {ticketSummary.descuentoMotivo
                              ? ` · ${ticketSummary.descuentoMotivo}`
                              : ''}
                          </span>
                          <span className="font-semibold tabular-nums">
                            -{formatCurrency(ticketSummary.descuentoMonto)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="px-4 py-3.5 bg-[#FAF8F5] border-t border-[#EFECE6] flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-[#6E6259] tabular-nums">
                      Total: {formatNumber(ticket.totalPiezas)} piezas
                      {ticketSummary.piezasCortesia > 0
                        ? ` · ${ticketSummary.piezasCortesia} cortesía`
                        : ''}
                      {ticketSummary.piezasCambio > 0
                        ? ` · ${ticketSummary.piezasCambio} cambio`
                        : ''}
                    </span>
                    <div className="text-right">
                      <span className="text-xs text-[#6E6259] mr-2">Importe total</span>
                      <span className="text-lg font-bold text-[var(--theme-primary)] tabular-nums">
                        {formatCurrency(ticket.totalImporte)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment & Receivables Breakdown */}
                <div className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-[var(--theme-primary)]" />
                      <span className="text-sm font-bold text-[#1F1A17]">
                        Estado de cobranza
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${paymentBadgeClasses}`}
                      >
                        {payment.estadoPago} · {payment.metodoPago}
                      </span>
                    </div>

                    {payment.saldoPendiente > 0 && onRecordAbono && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAbonoForm((v) => !v)}
                          className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>{showAbonoForm ? 'Ocultar abono' : 'Registrar abono'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-xs">
                    <div className="rounded-xl bg-white border border-[#EFECE6] p-2.5">
                      <p className="text-[#6E6259]">Total ticket</p>
                      <p className="font-bold text-[#1F1A17] tabular-nums text-sm mt-0.5">
                        {formatCurrency(ticket.totalImporte)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-[#EFECE6] p-2.5">
                      <p className="text-[#6E6259]">Cobrado</p>
                      <p className="font-bold text-emerald-700 tabular-nums text-sm mt-0.5">
                        {formatCurrency(payment.montoPagado)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-[#EFECE6] p-2.5">
                      <p className="text-[#6E6259]">Saldo pendiente</p>
                      <p
                        className={`font-bold tabular-nums text-sm mt-0.5 ${
                          payment.saldoPendiente > 0 ? 'text-[#B91C1C]' : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(payment.saldoPendiente)}
                      </p>
                    </div>
                  </div>

                  {showAbonoForm && payment.saldoPendiente > 0 && onRecordAbono && (
                    <form
                      onSubmit={(e) => handleConfirmAbono(e, false)}
                      className="rounded-xl bg-white border border-[#D8D1C7] p-3.5 space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#6E6259] mb-1">
                            Monto abono (máx. {formatCurrency(payment.saldoPendiente)})
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={payment.saldoPendiente}
                            required
                            value={abonoMonto}
                            onChange={(e) => setAbonoMonto(e.target.value)}
                            className="w-full h-10 rounded-lg border border-[#D8D1C7] px-2.5 text-sm font-bold text-[#1F1A17]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#6E6259] mb-1">
                            Método
                          </label>
                          <select
                            value={abonoMetodo}
                            onChange={(e) => setAbonoMetodo(e.target.value as MetodoPago)}
                            className="w-full h-10 rounded-lg border border-[#D8D1C7] bg-white px-2.5 text-sm text-[#1F1A17]"
                          >
                            {METODOS_ABONO.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#6E6259] mb-1">
                            Fecha
                          </label>
                          <input
                            type="date"
                            value={abonoFecha}
                            onChange={(e) => setAbonoFecha(e.target.value)}
                            className="w-full h-10 rounded-lg border border-[#D8D1C7] px-2.5 text-sm text-[#1F1A17]"
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        value={abonoNotas}
                        onChange={(e) => setAbonoNotas(e.target.value)}
                        placeholder="Nota opcional del abono..."
                        className="w-full h-9 rounded-lg border border-[#D8D1C7] px-2.5 text-xs text-[#1F1A17]"
                      />
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleConfirmAbono(e, true)}
                          className="min-h-[38px] px-3 rounded-lg border border-emerald-600 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                        >
                          Liquidar total ({formatCurrency(payment.saldoPendiente)})
                        </button>
                        <button
                          type="submit"
                          className="min-h-[38px] px-4 rounded-lg bg-[var(--theme-primary)] text-xs font-bold text-white hover:bg-[var(--theme-primary-hover)]"
                        >
                          Guardar abono
                        </button>
                      </div>
                    </form>
                  )}

                  {payment.abonos.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[11px] font-bold text-[#6E6259] uppercase tracking-wider">
                        Historial de abonos ({payment.abonos.length})
                      </p>
                      <div className="space-y-1">
                        {payment.abonos.map((ab) => (
                          <div
                            key={ab.id}
                            className="flex items-center justify-between text-xs bg-white rounded-lg border border-[#EFECE6] px-3 py-1.5"
                          >
                            <span className="text-[#49403A]">
                              {formatDateShort(ab.fecha)} · <strong>{ab.metodoPago}</strong>
                              {ab.notas ? ` · ${ab.notas}` : ''}
                            </span>
                            <span className="font-bold text-emerald-700 tabular-nums">
                              +{formatCurrency(ab.monto)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Share & Print Row */}
                <div className="rounded-2xl border border-[#E7E3DC] bg-white p-3.5 space-y-2.5">
                  <p className="text-xs font-bold text-[#6E6259]">
                    Compartir comprobante o imprimir
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={whatsAppUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp</span>
                    </a>
                    <button
                      type="button"
                      disabled={isGeneratingPng}
                      onClick={handleDownloadPng}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] px-3.5 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)] disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>Guardar PNG</span>
                    </button>
                    <button
                      type="button"
                      disabled={isGeneratingPng}
                      onClick={handleSharePng}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] px-3.5 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)] disabled:opacity-50"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Compartir PNG</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStandardPrint}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#49403A] hover:bg-[#FAF6F0]"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Imprimir</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleThermalPrint}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#49403A] hover:bg-[#FAF6F0]"
                    >
                      <Printer className="w-4 h-4 text-[var(--theme-accent)]" />
                      <span>Térmica 58mm</span>
                    </button>
                  </div>
                  {shareFeedback && (
                    <p className="text-xs font-semibold text-emerald-700">{shareFeedback}</p>
                  )}
                </div>
              </div>

              {/* Footer actions */}
              <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {ticket.rowNumber && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Eliminar</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Editar ticket</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
                {/* Metadata inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      required
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Lista de precios (uso interno)
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#EFECE6] h-11">
                      {(['Mayoreo', 'Menudeo'] as TipoVenta[]).map((tipo) => (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => handleApplyCatalogPrices(tipo)}
                          className={`rounded-lg text-xs font-semibold transition-colors ${
                            tipoVenta === tipo
                              ? 'bg-[var(--theme-primary)] text-white shadow-xs'
                              : 'text-[#6E6259] hover:text-[#1F1A17]'
                          }`}
                        >
                          {tipo}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Ruta
                    </label>
                    <select
                      value={ruta}
                      onChange={(e) => setRuta(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
                    >
                      {ruta &&
                        !dataset.rutas.some(
                          (r) => normalizeText(r.nombre) === normalizeText(ruta)
                        ) && <option value={ruta}>{ruta}</option>}
                      {dataset.rutas.map((r) => (
                        <option key={r.id} value={r.nombre}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Cliente
                    </label>
                    <select
                      value={clienteId}
                      onChange={(e) => handleClienteSelect(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
                    >
                      {clienteId &&
                        !routeClients.some((c) => c.id === clienteId) && (
                          <option value={clienteId}>{clienteNombre}</option>
                        )}
                      {routeClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Jornada asignada
                    </label>
                    <select
                      value={jornadaId}
                      onChange={(e) => setJornadaId(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
                    >
                      <option value="">Sin jornada asignada</option>
                      {dataset.jornadas.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.nombre} · {j.ruta} ({j.estado})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Edit payment info */}
                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Método de pago
                    </label>
                    <select
                      value={editMetodoPago}
                      onChange={(e) => {
                        const m = e.target.value as MetodoPago;
                        setEditMetodoPago(m);
                        if (m === 'Crédito') setEditMontoPagado('0');
                      }}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                    >
                      {METODOS_PAGO.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Monto pagado ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={editTotalImporte}
                      value={editMontoPagado}
                      onChange={(e) => setEditMontoPagado(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm font-bold text-[#1F1A17]"
                    />
                  </div>
                </div>

                {/* Add product to ticket */}
                <div className="rounded-2xl bg-[#FAF8F5] border border-[#E7E3DC] p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-[#6E6259]">
                      Agregar producto o movimiento al ticket
                    </label>
                    <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-[#EFECE6]">
                      {(['Venta', 'Cortesía', 'Devolución', 'Cambio'] as TicketItemTipo[]).map(
                        (tipo) => (
                          <button
                            key={tipo}
                            type="button"
                            onClick={() => setAddItemTipo(tipo)}
                            className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${
                              addItemTipo === tipo
                                ? tipo === 'Devolución'
                                  ? 'bg-red-700 text-white'
                                  : tipo === 'Cortesía'
                                  ? 'bg-emerald-700 text-white'
                                  : tipo === 'Cambio'
                                  ? 'bg-sky-700 text-white'
                                  : 'bg-[var(--theme-primary)] text-white'
                                : 'text-[#6E6259]'
                            }`}
                          >
                            {tipo}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={selectedAddProductId}
                      onChange={(e) => setSelectedAddProductId(e.target.value)}
                      className="flex-1 h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                    >
                      <option value="">Selecciona un producto...</option>
                      {activeProducts.map((p) => {
                        const price =
                          tipoVenta === 'Mayoreo' ? p.precioMayoreo : p.precioMenudeo;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({formatCurrency(price)})
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedAddProductId}
                      onClick={handleAddProduct}
                      className="min-h-[44px] px-4 rounded-xl bg-[var(--theme-primary)] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 hover:bg-[var(--theme-primary-hover)] shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>

                {/* Editable items list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1F1A17]">
                      Productos del ticket ({items.length})
                    </span>
                    <span className="text-xs font-semibold text-[#6E6259] tabular-nums">
                      {formatNumber(editTotalPiezas)} piezas ·{' '}
                      <strong className="text-[var(--theme-primary)]">
                        {formatCurrency(editTotalImporte)}
                      </strong>
                    </span>
                  </div>

                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#D8D1C7] p-6 text-center text-xs text-[#6E6259]">
                      Agrega al menos un producto para guardar el ticket.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#EFECE6] border border-[#E7E3DC] rounded-xl overflow-hidden">
                      {items.map((it, idx) => {
                        const tipo = getTicketItemTipo(it);
                        return (
                          <div
                            key={`${it.productoId}-${idx}`}
                            className="p-3.5 bg-white space-y-2.5"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-bold text-[#1F1A17] truncate">
                                    {it.productoNombre}
                                  </p>
                                  <select
                                    value={tipo}
                                    onChange={(e) =>
                                      updateItemTipo(idx, e.target.value as TicketItemTipo)
                                    }
                                    aria-label={`Tipo de movimiento para ${it.productoNombre}`}
                                    className={`h-7 rounded-lg border px-2 text-[11px] font-bold ${
                                      tipo === 'Devolución'
                                        ? 'border-red-200 bg-red-50 text-red-700'
                                        : tipo === 'Cortesía'
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : tipo === 'Cambio'
                                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                                        : 'border-[#D8D1C7] bg-[#FAF8F5] text-[#49403A]'
                                    }`}
                                  >
                                    <option value="Venta">Venta</option>
                                    <option value="Cortesía">Cortesía ($0)</option>
                                    <option value="Devolución">Devolución (−$)</option>
                                    <option value="Cambio">Cambio ($0)</option>
                                  </select>
                                </div>

                                <div className="flex items-center gap-2 text-xs text-[#6E6259] tabular-nums">
                                  <span>
                                    {tipo === 'Devolución' ? 'Bonificación $:' : 'Precio $:'}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    inputMode="decimal"
                                    disabled={tipo === 'Cortesía' || tipo === 'Cambio'}
                                    value={
                                      tipo === 'Cortesía' || tipo === 'Cambio'
                                        ? 0
                                        : it.precioUnitario
                                    }
                                    onChange={(e) => updateItemPrice(idx, e.target.value)}
                                    aria-label={`Precio unitario de ${it.productoNombre}`}
                                    className="w-24 h-8 rounded-lg border border-[#D8D1C7] px-2 text-xs font-mono font-bold text-[var(--theme-primary)] disabled:bg-[#FAF8F5] disabled:text-[#8C7E73] focus:outline-none focus:border-[var(--theme-primary)]"
                                  />
                                  <span>=</span>
                                  <strong
                                    className={
                                      tipo === 'Devolución'
                                        ? 'text-red-700'
                                        : tipo === 'Cortesía' || tipo === 'Cambio'
                                        ? 'text-emerald-700'
                                        : 'text-[#1F1A17]'
                                    }
                                  >
                                    {tipo === 'Devolución'
                                      ? `-${formatCurrency(Math.abs(it.subtotal))}`
                                      : formatCurrency(it.subtotal)}
                                  </strong>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, it.cantidad - 1)}
                                  disabled={it.cantidad <= 1}
                                  aria-label={`Restar ${it.productoNombre}`}
                                  className="h-9 w-9 flex items-center justify-center rounded-lg border border-[#D8D1C7] text-[var(--theme-primary)] disabled:opacity-35"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  inputMode="numeric"
                                  value={it.cantidad}
                                  onChange={(e) =>
                                    updateItemQty(idx, parseInt(e.target.value, 10) || 1)
                                  }
                                  aria-label={`Cantidad de ${it.productoNombre}`}
                                  className="w-14 h-9 rounded-lg border border-[#D8D1C7] text-center text-xs font-bold text-[#1F1A17] tabular-nums"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateItemQty(idx, it.cantidad + 1)}
                                  aria-label={`Sumar ${it.productoNombre}`}
                                  className="h-9 w-9 flex items-center justify-center rounded-lg bg-[var(--theme-primary)] text-white"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeItem(idx)}
                                  aria-label={`Quitar ${it.productoNombre}`}
                                  className="h-9 w-9 flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50 ml-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {tipo !== 'Venta' && (
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1.5 border-t border-[#F4F1EB]">
                                {(tipo === 'Devolución' || tipo === 'Cambio') && (
                                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#49403A] cursor-pointer shrink-0">
                                    <input
                                      type="checkbox"
                                      checked={
                                        it.regresarInventario !== undefined
                                          ? it.regresarInventario
                                          : tipo === 'Devolución'
                                      }
                                      onChange={(e) =>
                                        updateItemMeta(idx, {
                                          regresarInventario: e.target.checked,
                                        })
                                      }
                                      className="h-3.5 w-3.5 accent-[var(--theme-primary)]"
                                    />
                                    <span>
                                      {tipo === 'Devolución'
                                        ? 'Reingresar a stock'
                                        : 'Pieza recibida apta'}
                                    </span>
                                  </label>
                                )}
                                <input
                                  type="text"
                                  value={it.motivo || ''}
                                  onChange={(e) =>
                                    updateItemMeta(idx, { motivo: e.target.value })
                                  }
                                  placeholder={`Nota / motivo de ${tipo.toLowerCase()} (opcional)`}
                                  className="flex-1 h-8 rounded-lg border border-[#E7E3DC] bg-[#FAF8F5] px-2.5 text-xs text-[#1F1A17]"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Edit discount */}
                <div className="rounded-2xl bg-[#FAF8F5] border border-[#E7E3DC] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1F1A17]">
                      Descuento del ticket
                    </span>
                    {editTotals.descuentoMonto > 0 && (
                      <span className="text-xs font-bold text-emerald-700 tabular-nums">
                        -{formatCurrency(editTotals.descuentoMonto)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="grid grid-cols-2 p-0.5 rounded-xl bg-[#EFECE6] h-10">
                      <button
                        type="button"
                        onClick={() => setDescuentoTipo('monto')}
                        className={`rounded-lg text-xs font-bold ${
                          descuentoTipo === 'monto'
                            ? 'bg-[var(--theme-primary)] text-white'
                            : 'text-[#6E6259]'
                        }`}
                      >
                        Monto ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDescuentoTipo('porcentaje')}
                        className={`rounded-lg text-xs font-bold ${
                          descuentoTipo === 'porcentaje'
                            ? 'bg-[var(--theme-primary)] text-white'
                            : 'text-[#6E6259]'
                        }`}
                      >
                        Porcentaje (%)
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={descuentoTipo === 'porcentaje' ? 100 : undefined}
                      value={descuentoValor}
                      onChange={(e) => setDescuentoValor(e.target.value)}
                      placeholder={descuentoTipo === 'porcentaje' ? '0%' : '$0.00'}
                      className="h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm font-mono font-bold text-[#1F1A17]"
                    />
                    <input
                      type="text"
                      value={descuentoMotivo}
                      onChange={(e) => setDescuentoMotivo(e.target.value)}
                      placeholder="Motivo (opcional)"
                      className="h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs text-[#1F1A17]"
                    />
                  </div>
                  {(editTotals.devolucionesMonto > 0 || editTotals.descuentoMonto > 0) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[#6E6259] border-t border-[#E7E3DC]">
                      <span>Subtotal ventas: {formatCurrency(editTotals.subtotalBruto)}</span>
                      <span className="font-bold text-[var(--theme-primary)]">
                        Neto final: {formatCurrency(editTotalImporte)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Edit footer */}
              <div className="px-5 sm:px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    const pay = getTicketPaymentSummary(ticket);
                    setFecha(ticket.fecha);
                    setRuta(ticket.ruta);
                    setClienteId(ticket.clienteId);
                    setClienteNombre(ticket.clienteNombre);
                    setTipoVenta(ticket.tipoVenta);
                    setJornadaId(ticket.jornadaId || '');
                    setItems(ticket.items.map((it) => ({ ...it })));
                    setDescuentoTipo(ticket.descuentoTipo || 'monto');
                    setDescuentoValor(
                      ticket.descuentoValor && ticket.descuentoValor > 0
                        ? String(ticket.descuentoValor)
                        : ticket.descuentoMonto && ticket.descuentoMonto > 0
                        ? String(ticket.descuentoMonto)
                        : ''
                    );
                    setDescuentoMotivo(ticket.descuentoMotivo || '');
                    setEditMetodoPago(pay.metodoPago);
                    setEditMontoPagado(String(pay.montoPagado));
                  }}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-4 py-2 text-xs font-semibold text-[#49403A] hover:bg-[#FAF6F0]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Cancelar edición</span>
                </button>

                <button
                  type="submit"
                  disabled={items.length === 0}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)] disabled:opacity-45"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar cambios ({formatCurrency(editTotalImporte)})</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};
