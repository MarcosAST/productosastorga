import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  Search,
  ShoppingCart,
  CheckCircle2,
  MapPin,
  Printer,
  X,
  RotateCcw,
  Eye,
  Edit2,
  Receipt,
  Truck,
  MessageCircle,
  Download,
  Wallet,
  BookmarkCheck,
  ListFilter,
} from 'lucide-react';
import {
  BusinessDataset,
  EstadoPago,
  MetodoPago,
  Producto,
  Ticket,
  TicketAbono,
  TicketItem,
  TipoVenta,
} from '../types/business';
import {
  formatCurrency,
  formatDateShort,
  formatNumber,
  generateNextFolio,
  getTodayISO,
  normalizeText,
} from '../utils/formatters';
import { getTicketPaymentSummary, roundMoney } from '../utils/paymentHelpers';
import { buildWhatsAppTicketUrl, downloadTicketReceiptPng } from '../utils/ticketShare';
import { PendingMutation } from '../components/ConfirmMutationModal';

const CLIENT_PRODUCTS_STORAGE_KEY = 'astorga_client_products_v1';

function loadClientProductsMemory(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CLIENT_PRODUCTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveClientProductsMemory(data: Record<string, string[]>): void {
  try {
    localStorage.setItem(CLIENT_PRODUCTS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

interface NuevoPedidoViewProps {
  dataset: BusinessDataset;
  logoUrl?: string;
  ticketsTabName: string;
  rutasTabName: string;
  preselectedJornadaId?: string;
  onClearPreselectedJornada?: () => void;
  onRequestMutation: (mutation: PendingMutation) => void;
  onCreateRuta: (nombre: string, descripcion: string) => Promise<void>;
  onSaveTicket: (
    draft: Omit<Ticket, 'folio' | 'detalleTexto'>,
    options?: { deductGeneralInventory?: boolean }
  ) => Promise<Ticket>;
  onViewTicket: (ticket: Ticket, editMode?: boolean) => void;
  onDeleteTicket: (ticket: Ticket) => Promise<void>;
  onNavigateToAddCliente: () => void;
  onNavigateToJornadas?: () => void;
}

export const NuevoPedidoView: React.FC<NuevoPedidoViewProps> = ({
  dataset,
  logoUrl,
  ticketsTabName,
  rutasTabName,
  preselectedJornadaId,
  onClearPreselectedJornada,
  onRequestMutation,
  onCreateRuta,
  onSaveTicket,
  onViewTicket,
  onDeleteTicket,
  onNavigateToAddCliente,
  onNavigateToJornadas,
}) => {
  const [viewMode, setViewMode] = useState<'crear' | 'tickets'>('crear');
  const [ticketSearch, setTicketSearch] = useState('');
  const [fecha, setFecha] = useState(getTodayISO());
  const [selectedRuta, setSelectedRuta] = useState(dataset.rutas[0]?.nombre || '');
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedJornadaId, setSelectedJornadaId] = useState('');
  const [deductGeneralStock, setDeductGeneralStock] = useState(true);
  const [tipoVenta, setTipoVenta] = useState<TipoVenta>('Mayoreo');
  const [searchProduct, setSearchProduct] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({});
  const [paymentMode, setPaymentMode] = useState<'Pagado' | 'Parcial' | 'Crédito'>('Pagado');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Efectivo');
  const [abonoInicial, setAbonoInicial] = useState('');
  const [lastSavedTicket, setLastSavedTicket] = useState<Ticket | null>(null);

  // Per-client remembered products & inline catalog picker
  const [clientProductsMem, setClientProductsMem] = useState<Record<string, string[]>>(() =>
    loadClientProductsMemory()
  );
  const [extraProductIds, setExtraProductIds] = useState<string[]>([]);
  const [showExtraPicker, setShowExtraPicker] = useState(false);
  const [extraSearch, setExtraSearch] = useState('');
  const [showFullCatalogOverride, setShowFullCatalogOverride] = useState(false);

  useEffect(() => {
    setExtraProductIds([]);
    setShowExtraPicker(false);
    setExtraSearch('');
    setShowFullCatalogOverride(false);
  }, [selectedClienteId]);

  useEffect(() => {
    if (!preselectedJornadaId) return;
    const j = dataset.jornadas.find((item) => item.id === preselectedJornadaId);
    if (j) {
      setViewMode('crear');
      setSelectedJornadaId(j.id);
      if (j.ruta) {
        setSelectedRuta(j.ruta);
        setSelectedClienteId('');
      }
      if (j.fecha) setFecha(j.fecha);
    }
    onClearPreselectedJornada?.();
  }, [preselectedJornadaId, dataset.jornadas, onClearPreselectedJornada]);

  // Inline create route state
  const [showNewRouteForm, setShowNewRouteForm] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteDesc, setNewRouteDesc] = useState('');

  const filteredTicketList = useMemo(() => {
    const q = normalizeText(ticketSearch);
    return [...dataset.tickets]
      .filter((t) => {
        if (!q) return true;
        return (
          normalizeText(t.folio).includes(q) ||
          normalizeText(t.clienteNombre).includes(q) ||
          normalizeText(t.ruta).includes(q) ||
          normalizeText(t.detalleTexto).includes(q)
        );
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.folio.localeCompare(a.folio));
  }, [dataset.tickets, ticketSearch]);

  const confirmDeleteTicket = (ticket: Ticket) => {
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
        if (lastSavedTicket?.folio === ticket.folio) {
          setLastSavedTicket(null);
        }
      },
    });
  };

  const filteredClientes = useMemo(() => {
    if (!selectedRuta) return [];
    return dataset.clientes.filter(
      (c) => normalizeText(c.ruta) === normalizeText(selectedRuta)
    );
  }, [dataset.clientes, selectedRuta]);

  const activeClient = useMemo(
    () => filteredClientes.find((c) => c.id === selectedClienteId) || null,
    [filteredClientes, selectedClienteId]
  );

  const selectedJornada = useMemo(
    () => dataset.jornadas.find((j) => j.id === selectedJornadaId) || null,
    [dataset.jornadas, selectedJornadaId]
  );

  const openJornadas = useMemo(
    () => dataset.jornadas.filter((j) => j.estado === 'Abierta'),
    [dataset.jornadas]
  );

  const closedJornadas = useMemo(
    () => dataset.jornadas.filter((j) => j.estado === 'Cerrada'),
    [dataset.jornadas]
  );

  // Remaining stock inside the selected jornada (loaded - already sold in jornada tickets)
  const jornadaRemainingMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedJornada) return map;
    const folioSet = new Set(selectedJornada.ticketFolios);
    const linkedTickets = dataset.tickets.filter(
      (t) => t.jornadaId === selectedJornada.id || folioSet.has(t.folio)
    );
    const soldById = new Map<string, number>();
    const soldByName = new Map<string, number>();
    for (const t of linkedTickets) {
      for (const it of t.items) {
        if (it.productoId) {
          soldById.set(it.productoId, (soldById.get(it.productoId) || 0) + it.cantidad);
        }
        if (it.productoNombre) {
          const n = normalizeText(it.productoNombre);
          soldByName.set(n, (soldByName.get(n) || 0) + it.cantidad);
        }
      }
    }
    for (const item of selectedJornada.inventario || []) {
      const sold =
        (item.productoId && soldById.get(item.productoId)) ||
        soldByName.get(normalizeText(item.productoNombre)) ||
        0;
      const rem = Math.max(0, item.cantidadInicial - sold);
      if (item.productoId) map.set(item.productoId, rem);
      if (item.productoNombre) map.set(normalizeText(item.productoNombre), rem);
    }
    return map;
  }, [selectedJornada, dataset.tickets]);

  const activeProducts = useMemo(
    () => dataset.productos.filter((p) => p.activo),
    [dataset.productos]
  );

  // Habitual/remembered product IDs for activeClient (localStorage memory + historical tickets)
  const rememberedClientProductIds = useMemo(() => {
    if (!activeClient) return [];
    const activeIdSet = new Set(activeProducts.map((p) => p.id));
    const nameToProdId = new Map<string, string>();
    activeProducts.forEach((p) => nameToProdId.set(normalizeText(p.nombre), p.id));

    const orderedIds: string[] = [];
    const seen = new Set<string>();
    const addId = (id?: string) => {
      if (!id || !activeIdSet.has(id) || seen.has(id)) return;
      seen.add(id);
      orderedIds.push(id);
    };

    const idKey = `id:${activeClient.id}`;
    const nameKey = `name:${normalizeText(activeClient.nombre)}`;
    (clientProductsMem[idKey] || []).forEach(addId);
    (clientProductsMem[nameKey] || []).forEach(addId);

    const clientTickets = dataset.tickets.filter(
      (t) =>
        (activeClient.id && t.clienteId === activeClient.id) ||
        normalizeText(t.clienteNombre) === normalizeText(activeClient.nombre)
    );
    for (const t of clientTickets) {
      for (const it of t.items) {
        if (it.productoId && activeIdSet.has(it.productoId)) {
          addId(it.productoId);
        } else if (it.productoNombre) {
          addId(nameToProdId.get(normalizeText(it.productoNombre)));
        }
      }
    }

    return orderedIds;
  }, [activeClient, activeProducts, clientProductsMem, dataset.tickets]);

  const clientScopedProductIdSet = useMemo(() => {
    const set = new Set<string>(rememberedClientProductIds);
    extraProductIds.forEach((id) => set.add(id));
    Object.entries(cart).forEach(([id, qty]) => {
      if ((qty || 0) > 0) set.add(id);
    });
    return set;
  }, [rememberedClientProductIds, extraProductIds, cart]);

  const filteredProducts = useMemo(() => {
    const q = normalizeText(searchProduct);
    return activeProducts.filter((p) => {
      if (activeClient && !showFullCatalogOverride && !clientScopedProductIdSet.has(p.id)) {
        return false;
      }
      if (!activeClient && !showFullCatalogOverride) {
        return false;
      }
      if (!q) return true;
      return (
        normalizeText(p.nombre).includes(q) ||
        normalizeText(p.categoria).includes(q)
      );
    });
  }, [
    activeProducts,
    activeClient,
    showFullCatalogOverride,
    clientScopedProductIdSet,
    searchProduct,
  ]);

  const extraCatalogProducts = useMemo(() => {
    const q = normalizeText(extraSearch);
    return activeProducts.filter((p) => {
      if (clientScopedProductIdSet.has(p.id)) return false;
      if (!q) return true;
      return (
        normalizeText(p.nombre).includes(q) ||
        normalizeText(p.categoria).includes(q)
      );
    });
  }, [activeProducts, clientScopedProductIdSet, extraSearch]);

  const getCatalogPrice = (prod: Producto): number =>
    tipoVenta === 'Mayoreo' ? prod.precioMayoreo : prod.precioMenudeo;

  const getEffectivePrice = (prod: Producto): number => {
    const raw = customPrices[prod.id];
    if (raw !== undefined) {
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
    return getCatalogPrice(prod);
  };

  const setProductPrice = (prodId: string, rawVal: string) => {
    setCustomPrices((prev) => ({ ...prev, [prodId]: rawVal }));
  };

  const resetProductPrice = (prodId: string) => {
    setCustomPrices((prev) => {
      const copy = { ...prev };
      delete copy[prodId];
      return copy;
    });
  };

  const cartItems: TicketItem[] = useMemo(() => {
    const list: TicketItem[] = [];
    for (const [prodId, qty] of Object.entries(cart) as [string, number][]) {
      if (qty <= 0) continue;
      const prod = dataset.productos.find((p) => p.id === prodId);
      if (!prod) continue;
      const raw = customPrices[prod.id];
      const basePrice =
        tipoVenta === 'Mayoreo' ? prod.precioMayoreo : prod.precioMenudeo;
      const precioUnitario =
        raw !== undefined
          ? Number.isFinite(parseFloat(raw)) && parseFloat(raw) >= 0
            ? parseFloat(raw)
            : 0
          : basePrice;
      list.push({
        productoId: prod.id,
        productoNombre: prod.nombre,
        cantidad: qty,
        precioUnitario,
        subtotal: qty * precioUnitario,
      });
    }
    return list;
  }, [cart, customPrices, dataset.productos, tipoVenta]);

  const totalPiezas = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.cantidad, 0),
    [cartItems]
  );

  const totalImporte = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    [cartItems]
  );

  const estimatedNextFolio = useMemo(
    () => generateNextFolio(dataset.tickets.map((t) => t.folio), 'AST'),
    [dataset.tickets]
  );

  const updateQty = (prod: Producto, delta: number) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[prod.id] || 0) + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[prod.id];
        return copy;
      }
      return { ...prev, [prod.id]: next };
    });
  };

  const setExactQty = (prodId: string, rawVal: string) => {
    const parsed = parseInt(rawVal, 10);
    setCart((prev) => {
      if (!rawVal || Number.isNaN(parsed) || parsed <= 0) {
        const copy = { ...prev };
        delete copy[prodId];
        return copy;
      }
      return { ...prev, [prodId]: parsed };
    });
  };

  const handleRouteChange = (rutaNombre: string) => {
    setSelectedRuta(rutaNombre);
    setSelectedClienteId('');
  };

  const handleConfirmNewRoute = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newRouteName.trim();
    if (!trimmed) return;

    onRequestMutation({
      title: 'Crear nueva ruta',
      description: 'Se agregará esta nueva ruta a tu hoja de cálculo y quedará seleccionada para el pedido.',
      sheetTab: rutasTabName,
      details: [
        { label: 'Nombre de ruta', value: trimmed },
        { label: 'Descripción', value: newRouteDesc.trim() || 'Sin descripción' },
      ],
      confirmLabel: 'Guardar ruta',
      onConfirm: async () => {
        await onCreateRuta(trimmed, newRouteDesc.trim());
        setSelectedRuta(trimmed);
        setSelectedClienteId('');
        setNewRouteName('');
        setNewRouteDesc('');
        setShowNewRouteForm(false);
      },
    });
  };

  const handleSelectJornada = (nextJornadaId: string) => {
    setSelectedJornadaId(nextJornadaId);
    if (nextJornadaId) {
      const j = dataset.jornadas.find((item) => item.id === nextJornadaId);
      if (j && j.ruta && !selectedClienteId) {
        const matchedRoute = dataset.rutas.find(
          (r) => normalizeText(r.nombre) === normalizeText(j.ruta)
        );
        if (matchedRoute) {
          setSelectedRuta(matchedRoute.nombre);
        }
      }
    }
  };

  const handleSubmitTicket = () => {
    if (!selectedRuta || !activeClient || cartItems.length === 0) return;

    const shouldDeductGeneral = !selectedJornadaId && deductGeneralStock;
    const total = roundMoney(totalImporte);

    let finalMetodo: MetodoPago = metodoPago === 'Crédito' ? 'Efectivo' : metodoPago;
    let estadoPago: EstadoPago = 'Pagado';
    let montoPagado = total;
    let saldoPendiente = 0;
    let abonos: TicketAbono[] = [];

    if (paymentMode === 'Crédito') {
      finalMetodo = 'Crédito';
      estadoPago = 'Pendiente';
      montoPagado = 0;
      saldoPendiente = total;
    } else if (paymentMode === 'Parcial') {
      const rawAbono = roundMoney(Math.max(0, parseFloat(abonoInicial) || 0));
      const clampedAbono = Math.min(total, rawAbono);
      if (clampedAbono >= total - 0.01) {
        estadoPago = 'Pagado';
        montoPagado = total;
        saldoPendiente = 0;
      } else if (clampedAbono <= 0) {
        estadoPago = 'Pendiente';
        montoPagado = 0;
        saldoPendiente = total;
      } else {
        estadoPago = 'Parcial';
        montoPagado = clampedAbono;
        saldoPendiente = roundMoney(total - clampedAbono);
        abonos = [
          {
            id: `abn-${Date.now()}`,
            fecha,
            monto: clampedAbono,
            metodoPago: finalMetodo,
            notas: 'Abono inicial',
          },
        ];
      }
    }

    onRequestMutation({
      title: 'Guardar ticket de venta',
      description: selectedJornada
        ? `Se guardará el ticket en Google Sheets y se asignará directamente a la jornada "${selectedJornada.nombre}".`
        : shouldDeductGeneral
        ? 'Se guardará el ticket en Google Sheets y se descontarán las piezas vendidas del inventario general.'
        : 'Se verificará el último folio en Google Sheets para asignar un folio consecutivo único y guardar el ticket.',
      sheetTab: ticketsTabName,
      details: [
        { label: 'Folio estimado', value: estimatedNextFolio },
        { label: 'Fecha', value: formatDateShort(fecha) },
        { label: 'Ruta', value: selectedRuta },
        { label: 'Cliente', value: activeClient.nombre },
        {
          label: 'Jornada',
          value: selectedJornada ? selectedJornada.nombre : 'Sin asignar (venta directa)',
        },
        { label: 'Total piezas', value: String(totalPiezas) },
        { label: 'Total a pagar', value: formatCurrency(totalImporte) },
        {
          label: 'Estado de pago',
          value:
            saldoPendiente > 0
              ? `${estadoPago} (${finalMetodo}) · Saldo: ${formatCurrency(saldoPendiente)}`
              : `${estadoPago} (${finalMetodo})`,
        },
      ],
      confirmLabel: 'Guardar ticket',
      onConfirm: async () => {
        const saved = await onSaveTicket(
          {
            fecha,
            ruta: selectedRuta,
            clienteId: activeClient.id,
            clienteNombre: activeClient.nombre,
            tipoVenta,
            totalPiezas,
            totalImporte,
            jornadaId: selectedJornadaId,
            items: cartItems,
            metodoPago: finalMetodo,
            estadoPago,
            montoPagado,
            saldoPendiente,
            abonos,
          },
          { deductGeneralInventory: shouldDeductGeneral }
        );
        // Remember ordered products for this client
        const orderedIds = cartItems.map((it) => it.productoId).filter(Boolean);
        if (orderedIds.length > 0) {
          const idKey = `id:${activeClient.id}`;
          const nameKey = `name:${normalizeText(activeClient.nombre)}`;
          setClientProductsMem((prev) => {
            const mergedForClient = Array.from(
              new Set([...(prev[idKey] || []), ...(prev[nameKey] || []), ...orderedIds])
            );
            const next = {
              ...prev,
              [idKey]: mergedForClient,
              [nameKey]: mergedForClient,
            };
            saveClientProductsMemory(next);
            return next;
          });
        }
        setLastSavedTicket(saved);
        setCart({});
        setCustomPrices({});
        setExtraProductIds([]);
        setShowExtraPicker(false);
        setPaymentMode('Pagado');
        setMetodoPago('Efectivo');
        setAbonoInicial('');
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F1A17]">Nuevo pedido · Tickets</h1>
          <p className="text-sm text-[#6E6259]">
            Próximo folio consecutivo:{' '}
            <span className="font-mono font-semibold text-[var(--theme-primary)]">{estimatedNextFolio}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'crear' ? 'tickets' : 'crear'))}
            className={`min-h-[42px] inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              viewMode === 'tickets'
                ? 'bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]'
                : 'bg-white text-[var(--theme-primary)] border-[#D8D1C7] hover:bg-[var(--theme-tint)]'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>
              {viewMode === 'tickets'
                ? 'Volver a crear pedido'
                : `Ver tickets (${dataset.tickets.length})`}
            </span>
          </button>

          {viewMode === 'crear' && (
            <div className="inline-flex items-center p-1 rounded-xl bg-[#EFECE6]">
              {(['Mayoreo', 'Menudeo'] as TipoVenta[]).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => {
                    setTipoVenta(tipo);
                    setCustomPrices({});
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                    tipoVenta === tipo
                      ? 'bg-[var(--theme-primary)] text-white shadow-xs'
                      : 'text-[#6E6259] hover:text-[#1F1A17]'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {viewMode === 'tickets' ? (
        <section className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
          <div className="p-4 border-b border-[#EFECE6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#1F1A17]">
                Tickets registrados ({filteredTicketList.length})
              </h2>
              <p className="text-xs text-[#6E6259]">
                Abre cualquier ticket para ver el detalle, editar productos o precios, imprimir o eliminar.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#8C7E73] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
                placeholder="Buscar folio, cliente, ruta..."
                className="w-full h-10 rounded-xl border border-[#D8D1C7] pl-9 pr-3 text-sm text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
              />
            </div>
          </div>

          {filteredTicketList.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#6E6259]">
              No hay tickets que coincidan con tu búsqueda.
            </div>
          ) : (
            <div className="divide-y divide-[#EFECE6]">
              {filteredTicketList.map((ticket) => {
                const pay = getTicketPaymentSummary(ticket);
                const badgeClass =
                  pay.estadoPago === 'Pagado'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : pay.estadoPago === 'Parcial'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-red-50 text-red-700 border-red-200';
                return (
                <div
                  key={ticket.folio}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF8F5]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-sm font-bold text-[var(--theme-primary)]">
                        {ticket.folio}
                      </span>
                      <span className="text-sm font-bold text-[#1F1A17] truncate">
                        {ticket.clienteNombre}
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                        {pay.estadoPago}
                        {pay.saldoPendiente > 0 ? ` · Debe ${formatCurrency(pay.saldoPendiente)}` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-[#6E6259] mt-0.5 tabular-nums">
                      {formatDateShort(ticket.fecha)} · {ticket.ruta} ·{' '}
                      {formatNumber(ticket.totalPiezas)} pzas · {pay.metodoPago}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <span className="text-base font-bold text-[#1F1A17] tabular-nums mr-1">
                      {formatCurrency(ticket.totalImporte)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onViewTicket(ticket, false)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver ticket</span>
                    </button>
                    {ticket.rowNumber && (
                      <>
                        <button
                          type="button"
                          onClick={() => onViewTicket(ticket, true)}
                          title={`Editar ticket ${ticket.folio}`}
                          aria-label={`Editar ticket ${ticket.folio}`}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#D8D1C7] bg-white text-[#49403A] hover:bg-[var(--theme-tint)]"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDeleteTicket(ticket)}
                          title={`Eliminar ticket ${ticket.folio}`}
                          aria-label={`Eliminar ticket ${ticket.folio}`}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-red-200 bg-white text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
      ) : (
        <>
      {/* Saved ticket confirmation banner */}
      {lastSavedTicket && (() => {
        const synced =
          dataset.tickets.find((t) => t.folio === lastSavedTicket.folio) ||
          lastSavedTicket;
        const clientTel = dataset.clientes.find(
          (c) =>
            c.id === synced.clienteId ||
            normalizeText(c.nombre) === normalizeText(synced.clienteNombre)
        )?.telefono;
        return (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-bold text-emerald-950">
                Ticket {synced.folio} guardado
              </h3>
              <p className="text-sm text-emerald-800 mt-0.5 tabular-nums">
                {synced.clienteNombre} · {synced.ruta} · {synced.totalPiezas} piezas ·{' '}
                <strong>{formatCurrency(synced.totalImporte)}</strong>
                {synced.saldoPendiente && synced.saldoPendiente > 0
                  ? ` · Saldo pendiente: ${formatCurrency(synced.saldoPendiente)}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onViewTicket(synced, false)}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              <Eye className="w-4 h-4" />
              <span>Ver ticket</span>
            </button>
            <a
              href={buildWhatsAppTicketUrl(synced, clientTel)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-700/30 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100/50"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </a>
            <button
              type="button"
              onClick={() => void downloadTicketReceiptPng(synced, logoUrl)}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-700/30 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100/50"
            >
              <Download className="w-4 h-4" />
              <span>PNG</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-700/30 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100/50"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
            <button
              type="button"
              onClick={() => setLastSavedTicket(null)}
              aria-label="Cerrar aviso"
              className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl text-emerald-800 hover:bg-emerald-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        );
      })()}

      {/* Order header fields */}
      <section className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#6E6259] mb-1.5">
              Fecha del pedido
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-medium text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#6E6259]">Ruta</label>
              <button
                type="button"
                onClick={() => setShowNewRouteForm((v) => !v)}
                className="text-xs font-semibold text-[var(--theme-accent)] hover:underline"
              >
                + Nueva ruta
              </button>
            </div>
            <select
              value={selectedRuta}
              onChange={(e) => handleRouteChange(e.target.value)}
              className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-sm font-medium text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
            >
              <option value="">Selecciona una ruta...</option>
              {dataset.rutas.map((r) => (
                <option key={r.id} value={r.nombre}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#6E6259]">
                Cliente ({filteredClientes.length} en ruta)
              </label>
              <button
                type="button"
                onClick={onNavigateToAddCliente}
                className="text-xs font-semibold text-[var(--theme-primary)] hover:underline"
              >
                + Registrar cliente
              </button>
            </div>
            <select
              value={selectedClienteId}
              onChange={(e) => setSelectedClienteId(e.target.value)}
              disabled={!selectedRuta}
              className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-sm font-medium text-[#1F1A17] disabled:bg-[#FAF8F5] focus:outline-none focus:border-[#4A2511]"
            >
              <option value="">
                {!selectedRuta
                  ? 'Primero elige una ruta'
                  : filteredClientes.length === 0
                  ? 'Sin clientes en esta ruta'
                  : 'Selecciona un cliente...'}
              </option>
              {filteredClientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Jornada Assignment Row */}
        <div className="pt-3 border-t border-[#EFECE6] grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#6E6259] inline-flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                <span>Mandar ticket directamente a jornada</span>
              </label>
              {onNavigateToJornadas && (
                <button
                  type="button"
                  onClick={onNavigateToJornadas}
                  className="text-xs font-semibold text-[var(--theme-accent)] hover:underline"
                >
                  Ir a Jornadas
                </button>
              )}
            </div>
            <select
              value={selectedJornadaId}
              onChange={(e) => handleSelectJornada(e.target.value)}
              className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-sm font-medium text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
            >
              <option value="">Sin asignar a jornada (venta directa)</option>
              {openJornadas.length > 0 && (
                <optgroup label="Jornadas en curso (Abiertas)">
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
          </div>

          <div className="text-xs text-[#6E6259]">
            {selectedJornada ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-emerald-900">
                <strong>Jornada activa:</strong> {selectedJornada.nombre}. Las piezas vendidas se controlarán con el inventario cargado de esta jornada.
              </div>
            ) : (
              <label className="flex items-center gap-2.5 rounded-xl bg-[#FAF8F5] border border-[#E7E3DC] px-3.5 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deductGeneralStock}
                  onChange={(e) => setDeductGeneralStock(e.target.checked)}
                  className="h-4 w-4 accent-[var(--theme-primary)]"
                />
                <span className="text-xs font-medium text-[#1F1A17]">
                  Descontar piezas vendidas del inventario general al guardar
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Inline new route creation */}
        {showNewRouteForm && (
          <form
            onSubmit={handleConfirmNewRoute}
            className="pt-4 mt-1 border-t border-[#EFECE6] flex flex-col sm:flex-row gap-3 items-end"
          >
            <div className="w-full sm:flex-1">
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Nombre de la nueva ruta
              </label>
              <input
                type="text"
                required
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                placeholder="Ej. Ruta Norte / Tepeaca"
                className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
              />
            </div>
            <div className="w-full sm:flex-1">
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Descripción (opcional)
              </label>
              <input
                type="text"
                value={newRouteDesc}
                onChange={(e) => setNewRouteDesc(e.target.value)}
                placeholder="Municipios o días de reparto"
                className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                type="submit"
                className="min-h-[44px] flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <MapPin className="w-4 h-4" />
                <span>Guardar ruta</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNewRouteForm(false)}
                className="min-h-[44px] px-3 rounded-xl border border-[#D8D1C7] text-sm font-medium text-[#6E6259]"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Main split: Products catalog & Cart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Product search & picker */}
        <section className="lg:col-span-7 rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
          <div className="p-4 border-b border-[#EFECE6] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#1F1A17] flex items-center gap-2">
                  {activeClient && !showFullCatalogOverride && (
                    <BookmarkCheck className="w-4 h-4 text-[var(--theme-primary)] shrink-0" />
                  )}
                  <span>
                    {activeClient
                      ? showFullCatalogOverride
                        ? `Todo el catálogo (${filteredProducts.length})`
                        : `Productos de ${activeClient.nombre} (${filteredProducts.length})`
                      : showFullCatalogOverride
                      ? `Catálogo completo (${filteredProducts.length})`
                      : 'Productos del cliente'}
                  </span>
                </h2>
                {activeClient && !showFullCatalogOverride && (
                  <p className="text-[11px] text-[#6E6259] mt-0.5">
                    Mostrando solo los productos que suele pedir este cliente (precios {tipoVenta}).
                  </p>
                )}
              </div>

              {(activeClient || showFullCatalogOverride) && (
                <div className="relative w-full sm:w-56">
                  <Search className="w-4 h-4 text-[#8C7E73] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    placeholder="Filtrar producto..."
                    className="w-full h-10 rounded-xl border border-[#D8D1C7] pl-9 pr-3 text-sm text-[#1F1A17] placeholder:text-[#9E9187] focus:outline-none focus:border-[#4A2511]"
                  />
                </div>
              )}
            </div>

            {activeClient && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExtraPicker((v) => !v)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-primary)] px-3.5 text-xs font-bold text-white hover:bg-[var(--theme-primary-hover)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showExtraPicker ? 'Cerrar buscador de productos' : 'Agregar otro producto'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullCatalogOverride((v) => !v)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] px-3 text-xs font-semibold text-[#49403A] hover:bg-[var(--theme-tint)]"
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>
                    {showFullCatalogOverride
                      ? 'Ver solo productos del cliente'
                      : 'Ver todo el catálogo'}
                  </span>
                </button>
              </div>
            )}

            {activeClient && showExtraPicker && (
              <div className="rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#1F1A17]">
                    Agregar otro producto del catálogo ({extraCatalogProducts.length} disponibles)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowExtraPicker(false)}
                    className="text-xs font-semibold text-[#6E6259] hover:text-[#1F1A17]"
                  >
                    Cerrar
                  </button>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#8C7E73] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={extraSearch}
                    onChange={(e) => setExtraSearch(e.target.value)}
                    placeholder="Buscar producto para agregar..."
                    className="w-full h-9 rounded-lg border border-[#D8D1C7] bg-white pl-8 pr-3 text-xs text-[#1F1A17]"
                  />
                </div>
                {extraCatalogProducts.length === 0 ? (
                  <p className="text-xs text-[#6E6259] py-2 text-center">
                    No hay más productos disponibles o ya están agregados en la lista del cliente.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-[#EFECE6] rounded-lg border border-[#E7E3DC] bg-white">
                    {extraCatalogProducts.map((p) => (
                      <div
                        key={p.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1F1A17] truncate">{p.nombre}</p>
                          <p className="text-[11px] text-[#6E6259] tabular-nums">
                            {p.categoria} · {formatCurrency(getCatalogPrice(p))}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setExtraProductIds((prev) =>
                              prev.includes(p.id) ? prev : [...prev, p.id]
                            );
                            setCart((prev) => ({
                              ...prev,
                              [p.id]: Math.max(1, prev[p.id] || 0),
                            }));
                          }}
                          className="min-h-[32px] px-2.5 rounded-lg bg-[var(--theme-primary)] text-white font-semibold shrink-0 hover:bg-[var(--theme-primary-hover)]"
                        >
                          + Agregar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {!activeClient && !showFullCatalogOverride ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-[#1F1A17]">
                Selecciona una ruta y un cliente arriba
              </p>
              <p className="text-xs text-[#6E6259] max-w-md mx-auto">
                Al elegir al cliente se mostrarán automáticamente solo los productos que suele pedir, evitando desplegar todo el catálogo.
              </p>
              <button
                type="button"
                onClick={() => setShowFullCatalogOverride(true)}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] px-3.5 text-xs font-semibold text-[#49403A] hover:bg-[var(--theme-tint)]"
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>Explorar todo el catálogo</span>
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-[#6E6259]">
                {activeClient && !searchProduct && !showFullCatalogOverride
                  ? `${activeClient.nombre} aún no tiene productos guardados de pedidos anteriores.`
                  : 'No hay productos activos que coincidan con tu búsqueda.'}
              </p>
              {activeClient && !showFullCatalogOverride && (
                <button
                  type="button"
                  onClick={() => setShowExtraPicker(true)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--theme-primary-hover)]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar producto para {activeClient.nombre}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#EFECE6] max-h-[520px] overflow-y-auto">
              {filteredProducts.map((prod) => {
                const catalogPrice = getCatalogPrice(prod);
                const priceInputVal =
                  customPrices[prod.id] !== undefined
                    ? customPrices[prod.id]
                    : String(catalogPrice);
                const isEdited =
                  customPrices[prod.id] !== undefined &&
                  getEffectivePrice(prod) !== catalogPrice;
                const qty = cart[prod.id] || 0;
                const generalStock = prod.inventario ?? 0;
                const jornadaAvail = selectedJornada
                  ? jornadaRemainingMap.get(prod.id) ??
                    jornadaRemainingMap.get(normalizeText(prod.nombre))
                  : undefined;
                return (
                  <div
                    key={prod.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 transition-colors ${
                      qty > 0 ? 'bg-[var(--theme-tint)]' : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="text-sm font-bold text-[#1F1A17] truncate">
                          {prod.nombre}
                        </p>
                        {jornadaAvail !== undefined ? (
                          <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                            · En jornada: {formatNumber(Math.max(0, jornadaAvail - qty))}
                          </span>
                        ) : (
                          <span
                            className={`text-[11px] font-semibold tabular-nums ${
                              generalStock <= 5 ? 'text-amber-700' : 'text-[#6E6259]'
                            }`}
                          >
                            · Stock: {formatNumber(generalStock)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#6E6259]">
                        <span>
                          {prod.categoria} · {prod.unidad}
                        </span>
                        <span aria-hidden="true">·</span>
                        <label className="inline-flex items-center gap-1">
                          <span>$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={priceInputVal}
                            onChange={(e) => setProductPrice(prod.id, e.target.value)}
                            aria-label={`Precio unitario de ${prod.nombre}`}
                            className={`w-20 h-8 rounded-lg border px-2 text-xs font-mono font-bold tabular-nums focus:outline-none focus:border-[var(--theme-primary)] ${
                              isEdited
                                ? 'border-[var(--theme-accent)] bg-[var(--theme-tint)] text-[var(--theme-primary)]'
                                : 'border-[#D8D1C7] bg-white text-[var(--theme-primary)]'
                            }`}
                          />
                        </label>
                        {isEdited && (
                          <button
                            type="button"
                            onClick={() => resetProductPrice(prod.id)}
                            title="Restaurar precio de catálogo"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--theme-accent)] hover:underline"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Catálogo ({formatCurrency(catalogPrice)})</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => updateQty(prod, -1)}
                        disabled={qty === 0}
                        aria-label={`Restar ${prod.nombre}`}
                        className="h-11 w-11 flex items-center justify-center rounded-xl border border-[#D8D1C7] bg-white text-[var(--theme-primary)] disabled:opacity-35 hover:bg-[#FAF8F5]"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={qty || ''}
                        placeholder="0"
                        onChange={(e) => setExactQty(prod.id, e.target.value)}
                        aria-label={`Cantidad de ${prod.nombre}`}
                        className="w-14 h-11 rounded-xl border border-[#D8D1C7] bg-white text-center text-sm font-bold text-[#1F1A17] tabular-nums focus:outline-none focus:border-[var(--theme-primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => updateQty(prod, 1)}
                        aria-label={`Agregar ${prod.nombre}`}
                        className="h-11 w-11 flex items-center justify-center rounded-xl bg-[var(--theme-primary)] text-white hover:bg-[var(--theme-primary-hover)]"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Cart & Ticket summary */}
        <section className="lg:col-span-5 rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between pb-3 border-b border-[#EFECE6]">
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="w-5 h-5 text-[var(--theme-primary)]" />
              <h2 className="text-base font-bold text-[#1F1A17]">Carrito del ticket</h2>
            </div>
            <span className="text-xs font-semibold text-[#6E6259] tabular-nums">
              {totalPiezas} piezas
            </span>
          </div>

          {cartItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#6E6259]">
              Agrega productos desde el listado para armar el ticket.
            </div>
          ) : (
            <div className="divide-y divide-[#EFECE6] max-h-[360px] overflow-y-auto">
              {cartItems.map((item) => {
                const prod = dataset.productos.find((p) => p.id === item.productoId);
                const catalogPrice = prod ? getCatalogPrice(prod) : item.precioUnitario;
                const priceInputVal =
                  customPrices[item.productoId] !== undefined
                    ? customPrices[item.productoId]
                    : String(item.precioUnitario);
                const isEdited =
                  customPrices[item.productoId] !== undefined &&
                  item.precioUnitario !== catalogPrice;
                return (
                  <div key={item.productoId} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1F1A17] truncate">
                        {item.productoNombre}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-[#6E6259] tabular-nums">
                        <span>{item.cantidad} pza(s) × $</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={priceInputVal}
                          onChange={(e) => setProductPrice(item.productoId, e.target.value)}
                          aria-label={`Editar precio en carrito de ${item.productoNombre}`}
                          className={`w-20 h-8 rounded-lg border px-2 text-xs font-mono font-bold tabular-nums focus:outline-none focus:border-[var(--theme-primary)] ${
                            isEdited
                              ? 'border-[var(--theme-accent)] bg-[var(--theme-tint)] text-[var(--theme-primary)]'
                              : 'border-[#D8D1C7] bg-white text-[#1F1A17]'
                          }`}
                        />
                        {isEdited && (
                          <button
                            type="button"
                            onClick={() => resetProductPrice(item.productoId)}
                            title="Restaurar precio de catálogo"
                            aria-label={`Restaurar precio de ${item.productoNombre}`}
                            className="p-1 text-[var(--theme-accent)] hover:text-[var(--theme-primary)]"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-[#1F1A17] tabular-nums">
                        {formatCurrency(item.subtotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExactQty(item.productoId, '0')}
                        aria-label={`Quitar ${item.productoNombre}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-4 border-t border-[#EFECE6] space-y-2">
            <div className="flex items-center justify-between text-sm text-[#6E6259]">
              <span>Total de piezas</span>
              <span className="font-semibold text-[#1F1A17] tabular-nums">{totalPiezas}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-bold text-[#1F1A17]">
              <span>Total del ticket</span>
              <span className="text-[var(--theme-primary)] tabular-nums">{formatCurrency(totalImporte)}</span>
            </div>
          </div>

          {/* Payment condition & method */}
          <div className="pt-3 border-t border-[#EFECE6] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1F1A17]">
              <Wallet className="w-4 h-4 text-[var(--theme-primary)]" />
              <span>Condición y método de pago</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(['Pagado', 'Parcial', 'Crédito'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setPaymentMode(mode);
                    if (mode !== 'Crédito' && metodoPago === 'Crédito') {
                      setMetodoPago('Efectivo');
                    }
                  }}
                  className={`min-h-[38px] rounded-xl border text-xs font-semibold transition-colors ${
                    paymentMode === mode
                      ? mode === 'Crédito'
                        ? 'bg-red-700 text-white border-red-700'
                        : mode === 'Parcial'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]'
                      : 'bg-white border-[#D8D1C7] text-[#49403A] hover:bg-[#FAF8F5]'
                  }`}
                >
                  {mode === 'Parcial' ? 'Abono inicial' : mode}
                </button>
              ))}
            </div>

            {paymentMode !== 'Crédito' && (
              <div className="grid grid-cols-3 gap-1.5">
                {(['Efectivo', 'Transferencia', 'Tarjeta'] as MetodoPago[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodoPago(m)}
                    className={`min-h-[36px] rounded-lg border text-xs font-semibold transition-colors ${
                      metodoPago === m
                        ? 'bg-[var(--theme-tint)] border-[var(--theme-primary)] text-[var(--theme-primary)]'
                        : 'bg-white border-[#E7E3DC] text-[#6E6259]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {paymentMode === 'Parcial' && (
              <div className="rounded-xl bg-[#FAF8F5] border border-[#E7E3DC] p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[#49403A]">
                    Abono recibido ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={totalImporte || undefined}
                    value={abonoInicial}
                    onChange={(e) => setAbonoInicial(e.target.value)}
                    placeholder="0.00"
                    className="w-28 h-9 rounded-lg border border-[#D8D1C7] bg-white px-2.5 text-right text-sm font-mono font-bold text-[#1F1A17]"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6E6259]">Saldo pendiente por cobrar:</span>
                  <span className="font-bold text-red-700 tabular-nums">
                    {formatCurrency(
                      Math.max(
                        0,
                        roundMoney(
                          totalImporte - Math.min(totalImporte, Math.max(0, parseFloat(abonoInicial) || 0))
                        )
                      )
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!selectedRuta || !activeClient || cartItems.length === 0}
            onClick={handleSubmitTicket}
            className="w-full min-h-[48px] rounded-xl bg-[var(--theme-primary)] text-white text-sm font-bold hover:bg-[var(--theme-primary-hover)] disabled:opacity-45 transition-colors"
          >
            Guardar ticket {estimatedNextFolio} en Google Sheets
          </button>

          {(!selectedRuta || !activeClient) && (
            <p className="text-xs text-center text-[#8C7E73]">
              Selecciona fecha, ruta y cliente para habilitar el guardado del ticket.
            </p>
          )}
        </section>
      </div>
        </>
      )}
    </div>
  );
};
