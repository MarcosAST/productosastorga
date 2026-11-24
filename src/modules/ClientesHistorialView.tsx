import React, { useMemo, useState } from 'react';
import {
  Search,
  Phone,
  MapPin,
  ChevronRight,
  UserPlus,
  Trash2,
  Eye,
  Edit2,
  MessageCircle,
  Navigation,
  Route as RouteIcon,
  X,
  Wallet,
  ArrowLeft,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { BusinessDataset, Cliente, Ruta, Ticket } from '../types/business';
import {
  ClientInactivityInfo,
  formatCurrency,
  formatDateShort,
  getClientInactivityInfo,
  getTodayISO,
  normalizeText,
} from '../utils/formatters';
import { computeClienteSaldoPendiente, getTicketPaymentSummary } from '../utils/paymentHelpers';
import { getTicketItemTipo, getTicketSummary } from '../utils/ticketAdjustments';
import {
  buildGoogleMapsUrl,
  buildWhatsAppClientUrl,
  sanitizePhoneDigits,
} from '../utils/ticketShare';
import { PendingMutation } from '../components/ConfirmMutationModal';
import { GoogleMapsLocationModal } from '../components/GoogleMapsLocationModal';

interface ClientesHistorialViewProps {
  dataset: BusinessDataset;
  ticketsTabName: string;
  clientesTabName: string;
  rutasTabName: string;
  onRequestMutation: (mutation: PendingMutation) => void;
  onViewTicket: (ticket: Ticket, editMode?: boolean) => void;
  onDeleteTicket: (ticket: Ticket) => Promise<void>;
  onUpdateCliente: (cliente: Cliente) => Promise<void>;
  onDeleteCliente: (cliente: Cliente) => Promise<void>;
  onUpdateRuta: (ruta: Ruta, oldNombre?: string) => Promise<void>;
  onNavigateToAddCliente: () => void;
  initialOnlyInactive15?: boolean;
  onConsumeInitialInactiveFilter?: () => void;
}

export const ClientesHistorialView: React.FC<ClientesHistorialViewProps> = ({
  dataset,
  ticketsTabName,
  clientesTabName,
  rutasTabName,
  onRequestMutation,
  onViewTicket,
  onDeleteTicket,
  onUpdateCliente,
  onDeleteCliente,
  onUpdateRuta,
  onNavigateToAddCliente,
  initialOnlyInactive15 = false,
  onConsumeInitialInactiveFilter,
}) => {
  const [selectedRuta, setSelectedRuta] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);
  const [onlyInactive15, setOnlyInactive15] = useState(initialOnlyInactive15);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialOnlyInactive15) {
      setOnlyInactive15(true);
      onConsumeInitialInactiveFilter?.();
    }
  }, [initialOnlyInactive15, onConsumeInitialInactiveFilter]);

  // Edit cliente modal
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editRuta, setEditRuta] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editNotas, setEditNotas] = useState('');

  // Google Maps location picker target
  const [mapsPickerTarget, setMapsPickerTarget] = useState<
    | { mode: 'detail'; cliente: Cliente }
    | { mode: 'edit' }
    | null
  >(null);

  // Manage / edit routes modal
  const [showRutasModal, setShowRutasModal] = useState(false);
  const [editingRuta, setEditingRuta] = useState<Ruta | null>(null);
  const [rutaNombre, setRutaNombre] = useState('');
  const [rutaDescripcion, setRutaDescripcion] = useState('');
  const [rutaActiva, setRutaActiva] = useState(true);

  const selectedCliente = useMemo(
    () => dataset.clientes.find((c) => c.id === selectedClienteId) || null,
    [dataset.clientes, selectedClienteId]
  );

  const routeNames = useMemo(() => {
    const names = Array.from(new Set(dataset.rutas.map((r) => r.nombre).filter(Boolean)));
    return ['Todas', ...names];
  }, [dataset.rutas]);

  const todayISO = getTodayISO();

  const clientMetrics = useMemo(() => {
    const map = new Map<
      string,
      {
        tickets: number;
        piezas: number;
        total: number;
        saldoPendiente: number;
        pendientes: number;
        inactivity: ClientInactivityInfo;
      }
    >();
    for (const c of dataset.clientes) {
      const clientTickets = dataset.tickets.filter(
        (t) =>
          (c.id && t.clienteId === c.id) ||
          normalizeText(t.clienteNombre) === normalizeText(c.nombre)
      );
      const sal = computeClienteSaldoPendiente(clientTickets, c.id, c.nombre);
      const inactivity = getClientInactivityInfo(c, clientTickets, todayISO);
      map.set(c.id, {
        tickets: clientTickets.length,
        piezas: clientTickets.reduce((s, t) => s + t.totalPiezas, 0),
        total: clientTickets.reduce((s, t) => s + t.totalImporte, 0),
        saldoPendiente: sal.saldoPendiente,
        pendientes: sal.ticketsPendientes,
        inactivity,
      });
    }
    return map;
  }, [dataset.clientes, dataset.tickets, todayISO]);

  const inactiveOver15Count = useMemo(() => {
    let count = 0;
    for (const m of clientMetrics.values()) {
      if (m.inactivity.isInactiveOver15Days) count += 1;
    }
    return count;
  }, [clientMetrics]);

  const totalPorCobrar = useMemo(() => {
    let total = 0;
    for (const t of dataset.tickets) {
      const pay = getTicketPaymentSummary(t);
      total += pay.saldoPendiente;
    }
    return total;
  }, [dataset.tickets]);

  const getMetricsForClient = (c: Cliente) => {
    return (
      clientMetrics.get(c.id) || {
        tickets: 0,
        piezas: 0,
        total: 0,
        saldoPendiente: 0,
        pendientes: 0,
        inactivity: {
          lastPurchaseDate: null,
          daysSinceLastPurchase: null,
          isInactiveOver15Days: false,
        },
      }
    );
  };

  const filteredClientes = useMemo(() => {
    const q = normalizeText(searchQuery);
    return dataset.clientes.filter((c) => {
      const matchRoute =
        selectedRuta === 'Todas' || normalizeText(c.ruta) === normalizeText(selectedRuta);
      if (!matchRoute) return false;
      const metrics = clientMetrics.get(c.id);
      if (onlyWithBalance && (!metrics || metrics.saldoPendiente <= 0)) {
        return false;
      }
      if (onlyInactive15 && !metrics?.inactivity.isInactiveOver15Days) {
        return false;
      }
      if (!q) return true;
      return (
        normalizeText(c.nombre).includes(q) ||
        normalizeText(c.telefono).includes(q) ||
        normalizeText(c.direccion).includes(q)
      );
    });
  }, [
    dataset.clientes,
    selectedRuta,
    searchQuery,
    onlyWithBalance,
    onlyInactive15,
    clientMetrics,
  ]);

  const activeClientTickets = useMemo(() => {
    if (!selectedCliente) return [];
    return dataset.tickets
      .filter(
        (t) =>
          t.clienteId === selectedCliente.id ||
          normalizeText(t.clienteNombre) === normalizeText(selectedCliente.nombre)
      )
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.folio.localeCompare(a.folio));
  }, [dataset.tickets, selectedCliente]);

  const openEditCliente = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setEditNombre(cliente.nombre);
    setEditRuta(cliente.ruta || dataset.rutas[0]?.nombre || '');
    setEditTelefono(cliente.telefono || '');
    setEditDireccion(cliente.direccion || '');
    setEditNotas(cliente.notas || '');
  };

  const handleSaveEditCliente = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCliente || !editNombre.trim()) return;
    const updated: Cliente = {
      ...editingCliente,
      nombre: editNombre.trim(),
      ruta: editRuta.trim(),
      telefono: editTelefono.trim(),
      direccion: editDireccion.trim(),
      notas: editNotas.trim(),
    };
    onRequestMutation({
      title: 'Actualizar datos de cliente',
      description: 'Se guardarán los cambios del cliente en Google Sheets.',
      sheetTab: clientesTabName,
      details: [
        { label: 'Nombre', value: updated.nombre },
        { label: 'Ruta', value: updated.ruta || 'Sin ruta' },
        { label: 'Teléfono', value: updated.telefono || 'Sin teléfono' },
      ],
      confirmLabel: 'Guardar cambios',
      onConfirm: async () => {
        await onUpdateCliente(updated);
        setEditingCliente(null);
      },
    });
  };

  const openEditRuta = (ruta: Ruta) => {
    setEditingRuta(ruta);
    setRutaNombre(ruta.nombre);
    setRutaDescripcion(ruta.descripcion || '');
    setRutaActiva(ruta.activa);
  };

  const handleSaveEditRuta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRuta || !rutaNombre.trim()) return;
    const oldNombre = editingRuta.nombre;
    const nextNombre = rutaNombre.trim();
    const updated: Ruta = {
      ...editingRuta,
      nombre: nextNombre,
      descripcion: rutaDescripcion.trim(),
      activa: rutaActiva,
    };
    const renamed = normalizeText(oldNombre) !== normalizeText(nextNombre);
    onRequestMutation({
      title: 'Actualizar ruta',
      description: renamed
        ? `Se renombrará "${oldNombre}" a "${nextNombre}" en Rutas y también en los clientes, tickets y jornadas asociados.`
        : 'Se actualizará la descripción y estado de esta ruta en Google Sheets.',
      sheetTab: rutasTabName,
      details: [
        { label: 'Nombre de ruta', value: updated.nombre },
        { label: 'Descripción', value: updated.descripcion || 'Sin descripción' },
        { label: 'Estado', value: updated.activa ? 'Activa' : 'Inactiva' },
      ],
      confirmLabel: 'Guardar ruta',
      onConfirm: async () => {
        await onUpdateRuta(updated, renamed ? oldNombre : undefined);
        if (renamed && normalizeText(selectedRuta) === normalizeText(oldNombre)) {
          setSelectedRuta(nextNombre);
        }
        setEditingRuta(null);
      },
    });
  };

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
      },
    });
  };

  const confirmDeleteCliente = (cliente: Cliente) => {
    onRequestMutation({
      title: 'Eliminar cliente',
      description:
        'Se eliminará este cliente del directorio en Google Sheets. Los tickets históricos conservarán el nombre registrado.',
      sheetTab: clientesTabName,
      details: [
        { label: 'Cliente', value: cliente.nombre },
        { label: 'Ruta', value: cliente.ruta },
      ],
      confirmLabel: 'Eliminar cliente',
      onConfirm: async () => {
        await onDeleteCliente(cliente);
        setSelectedClienteId(null);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F1A17]">Clientes, cobranza y rutas</h1>
          <p className="text-sm text-[#6E6259]">
            Consulta clientes por ruta, saldos pendientes por cobrar, historial y accesos rápidos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setEditingRuta(null);
              setShowRutasModal(true);
            }}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)] whitespace-nowrap"
          >
            <RouteIcon className="w-4 h-4 text-[var(--theme-accent)]" />
            <span>Editar rutas ({dataset.rutas.length})</span>
          </button>
          <button
            type="button"
            onClick={onNavigateToAddCliente}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)] whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo cliente</span>
          </button>
        </div>
      </div>

      {/* Filters & Receivables bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3 justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {routeNames.map((ruta) => (
              <button
                key={ruta}
                type="button"
                onClick={() => setSelectedRuta(ruta)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  selectedRuta === ruta
                    ? 'bg-[var(--theme-primary)] text-white'
                    : 'bg-white border border-[#E7E3DC] text-[#49403A] hover:bg-[var(--theme-tint)]'
                }`}
              >
                {ruta}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 text-[#8C7E73] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente, teléfono..."
              className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white pl-10 pr-3 text-sm text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-[#E7E3DC] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <Wallet className="w-4 h-4 text-red-700" />
              <span className="text-[#6E6259]">Total por cobrar en cuentas:</span>
              <strong className="text-sm font-bold text-red-700 tabular-nums">
                {formatCurrency(totalPorCobrar)}
              </strong>
            </div>
            {inactiveOver15Count > 0 && (
              <button
                type="button"
                onClick={() => setOnlyInactive15((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                  onlyInactive15
                    ? 'bg-amber-700 text-white border-amber-700'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {inactiveOver15Count} con +15 días sin comprar
                  {onlyInactive15 ? ' (activo)' : ''}
                </span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1F1A17]">
              <input
                type="checkbox"
                checked={onlyInactive15}
                onChange={(e) => setOnlyInactive15(e.target.checked)}
                className="h-4 w-4 accent-amber-700"
              />
              <span>Solo +15 días sin comprar</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1F1A17]">
              <input
                type="checkbox"
                checked={onlyWithBalance}
                onChange={(e) => setOnlyWithBalance(e.target.checked)}
                className="h-4 w-4 accent-[var(--theme-primary)]"
              />
              <span>Solo con saldo pendiente</span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Clients list */}
        <section
          className={`lg:col-span-5 rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden ${
            selectedCliente ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="px-4 py-3 border-b border-[#EFECE6] text-xs font-semibold text-[#6E6259]">
            {filteredClientes.length} cliente(s) encontrados
          </div>
          {filteredClientes.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6E6259]">
              No hay clientes registrados con los filtros seleccionados.
            </div>
          ) : (
            <div className="divide-y divide-[#EFECE6] max-h-[560px] overflow-y-auto">
              {filteredClientes.map((cliente) => {
                const metrics = getMetricsForClient(cliente);
                const isSelected = selectedCliente?.id === cliente.id;
                const { isInactiveOver15Days, daysSinceLastPurchase, lastPurchaseDate } =
                  metrics.inactivity;
                return (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() => {
                      setSelectedClienteId(cliente.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`w-full text-left px-4 py-3.5 flex items-center justify-between gap-3 transition-colors ${
                      isSelected ? 'bg-[var(--theme-tint)]' : 'bg-white hover:bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <p className="text-sm font-bold text-[#1F1A17] truncate">
                          {cliente.nombre}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {isInactiveOver15Days && daysSinceLastPurchase !== null && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md tabular-nums">
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                              <span>{daysSinceLastPurchase}d sin comprar</span>
                            </span>
                          )}
                          {metrics.saldoPendiente > 0 && (
                            <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md tabular-nums">
                              Debe {formatCurrency(metrics.saldoPendiente)}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[#6E6259] mt-0.5 truncate">
                        {cliente.ruta} · {metrics.tickets} ticket(s) ·{' '}
                        <span className="font-semibold text-[var(--theme-primary)] tabular-nums">
                          {formatCurrency(metrics.total)}
                        </span>
                        {lastPurchaseDate ? ` · Última: ${formatDateShort(lastPurchaseDate)}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#9E9187] shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Client detail & tickets history */}
        <section
          className={`lg:col-span-7 rounded-2xl bg-white border border-[#E7E3DC] p-5 ${
            selectedCliente ? 'block' : 'hidden lg:block'
          }`}
        >
          {!selectedCliente ? (
            <div className="py-14 text-center text-sm text-[#6E6259]">
              Selecciona un cliente de la lista para consultar su información, saldos pendientes e historial completo de tickets.
            </div>
          ) : (() => {
            const metrics = getMetricsForClient(selectedCliente);
            const phoneDigits = sanitizePhoneDigits(selectedCliente.telefono);
            return (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setSelectedClienteId(null)}
                className="lg:hidden min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] px-3 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a la lista de clientes</span>
              </button>
              <div className="pb-4 border-b border-[#EFECE6] flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-[#1F1A17]">{selectedCliente.nombre}</h2>
                  {metrics.inactivity.isInactiveOver15Days &&
                    metrics.inactivity.daysSinceLastPurchase !== null && (
                      <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>
                          Lleva <strong>{metrics.inactivity.daysSinceLastPurchase} días</strong> sin comprar
                          {metrics.inactivity.lastPurchaseDate
                            ? ` (último pedido: ${formatDateShort(metrics.inactivity.lastPurchaseDate)})`
                            : ''}
                        </span>
                      </div>
                    )}
                  {!metrics.inactivity.isInactiveOver15Days &&
                    metrics.inactivity.lastPurchaseDate && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#6E6259]">
                        <Clock className="w-3.5 h-3.5 text-[#8C7E73]" />
                        <span>
                          Última compra: {formatDateShort(metrics.inactivity.lastPurchaseDate)}
                        </span>
                      </p>
                    )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6E6259]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                      {selectedCliente.ruta || 'Sin ruta'}
                    </span>
                    {selectedCliente.telefono && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                        {selectedCliente.telefono}
                      </span>
                    )}
                    {selectedCliente.direccion && <span>{selectedCliente.direccion}</span>}
                  </div>
                  {selectedCliente.notas && (
                    <p className="text-xs text-[#8C7E73] mt-1">Nota: {selectedCliente.notas}</p>
                  )}

                  {/* Quick contact / maps actions */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {phoneDigits && (
                      <>
                        <a
                          href={`tel:${phoneDigits}`}
                          className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C7] bg-[#FAF8F5] px-2.5 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)]"
                        >
                          <Phone className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                          <span>Llamar</span>
                        </a>
                        <a
                          href={buildWhatsAppClientUrl(selectedCliente.telefono)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      </>
                    )}
                    {selectedCliente.direccion && (
                      <a
                        href={buildGoogleMapsUrl(selectedCliente.direccion)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C7] bg-[#FAF8F5] px-2.5 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)]"
                      >
                        <Navigation className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                        <span>Ver en Maps</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setMapsPickerTarget({
                          mode: 'detail',
                          cliente: selectedCliente,
                        })
                      }
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--theme-primary)]/30 bg-[var(--theme-tint)] px-2.5 text-xs font-bold text-[var(--theme-primary)] hover:opacity-90"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        {selectedCliente.direccion
                          ? 'Actualizar ubicación (Maps)'
                          : 'Guardar ubicación (Maps)'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-2 shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-[#6E6259]">Total comprado</p>
                      <p className="text-lg font-bold text-[var(--theme-primary)] tabular-nums">
                        {formatCurrency(metrics.total)}
                      </p>
                    </div>
                    {metrics.saldoPendiente > 0 && (
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-red-700 font-semibold">Por cobrar</p>
                        <p className="text-lg font-bold text-red-700 tabular-nums">
                          {formatCurrency(metrics.saldoPendiente)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {selectedCliente.rowNumber && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditCliente(selectedCliente)}
                          className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] px-3 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)]"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Editar cliente</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDeleteCliente(selectedCliente)}
                          title="Eliminar cliente"
                          aria-label={`Eliminar cliente ${selectedCliente.nombre}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-red-200 text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-[#1F1A17]">
                  Historial de tickets ({activeClientTickets.length})
                </h3>
                {activeClientTickets.length === 0 ? (
                  <p className="text-sm text-[#6E6259] py-6 text-center">
                    Este cliente aún no tiene tickets registrados.
                  </p>
                ) : (
                  <div className="divide-y divide-[#EFECE6] border border-[#EFECE6] rounded-xl overflow-hidden">
                    {activeClientTickets.map((ticket) => {
                      const pay = getTicketPaymentSummary(ticket);
                      const badgeClass =
                        pay.estadoPago === 'Pagado'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : pay.estadoPago === 'Parcial'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-red-50 text-red-700 border-red-200';
                      return (
                      <div key={ticket.folio} className="p-4 bg-white space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-[#6E6259] flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-[var(--theme-primary)] text-sm">
                              {ticket.folio}
                            </span>
                            <span>· {formatDateShort(ticket.fecha)}</span>
                            <span>· {ticket.tipoVenta}</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                              {pay.estadoPago}
                              {pay.saldoPendiente > 0
                                ? ` · Saldo ${formatCurrency(pay.saldoPendiente)}`
                                : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-sm font-bold text-[#1F1A17] tabular-nums mr-1">
                              {formatCurrency(ticket.totalImporte)}
                            </span>
                            <button
                              type="button"
                              onClick={() => onViewTicket(ticket, false)}
                              title={`Ver ticket ${ticket.folio}`}
                              className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[#D8D1C7] px-2.5 text-xs font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{pay.saldoPendiente > 0 ? 'Abonar / Ver' : 'Ver ticket'}</span>
                            </button>
                            {ticket.rowNumber && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onViewTicket(ticket, true)}
                                  title={`Editar ticket ${ticket.folio}`}
                                  aria-label={`Editar ticket ${ticket.folio}`}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#6E6259] hover:text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => confirmDeleteTicket(ticket)}
                                  title={`Eliminar ticket ${ticket.folio}`}
                                  aria-label={`Eliminar ticket ${ticket.folio}`}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {ticket.items.length > 0 ? (() => {
                          const summary = getTicketSummary(ticket);
                          return (
                            <div className="text-xs text-[#49403A] space-y-1 pt-1">
                              {ticket.items.map((it, idx) => {
                                const tipo = getTicketItemTipo(it);
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between gap-2 tabular-nums"
                                  >
                                    <span className="flex items-center gap-1.5 flex-wrap">
                                      <span>
                                        {it.cantidad} × {it.productoNombre}
                                      </span>
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
                                <div className="flex items-center justify-between gap-2 text-emerald-700 font-semibold">
                                  <span>
                                    Descuento
                                    {summary.descuentoTipo === 'porcentaje' &&
                                    summary.descuentoValor > 0
                                      ? ` (${summary.descuentoValor}%)`
                                      : ''}
                                    {summary.descuentoMotivo ? ` · ${summary.descuentoMotivo}` : ''}
                                  </span>
                                  <span>-{formatCurrency(summary.descuentoMonto)}</span>
                                </div>
                              )}
                            </div>
                          );
                        })() : (
                          <p className="text-xs text-[#6E6259]">{ticket.detalleTexto}</p>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            );
          })()}
        </section>
      </div>

      {/* Modal: Edit Cliente */}
      {editingCliente && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveEditCliente}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <h3 className="text-lg font-bold text-[#1F1A17]">Editar cliente</h3>
              <button
                type="button"
                onClick={() => setEditingCliente(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Ruta</label>
                <select
                  value={editRuta}
                  onChange={(e) => setEditRuta(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-sm text-[#1F1A17]"
                >
                  {dataset.rutas.map((r) => (
                    <option key={r.id} value={r.nombre}>
                      {r.nombre}
                    </option>
                  ))}
                  {editRuta && !dataset.rutas.some((r) => r.nombre === editRuta) && (
                    <option value={editRuta}>{editRuta}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#6E6259]">Dirección / Ubicación</label>
                  <button
                    type="button"
                    onClick={() => setMapsPickerTarget({ mode: 'edit' })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Tomar de Google Maps</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={editDireccion}
                  onChange={(e) => setEditDireccion(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Notas</label>
                <input
                  type="text"
                  value={editNotas}
                  onChange={(e) => setEditNotas(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCliente(null)}
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

      {/* Modal: Manage & Edit Rutas */}
      {showRutasModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <div>
                <h3 className="text-lg font-bold text-[#1F1A17]">Administrar rutas</h3>
                <p className="text-xs text-[#6E6259]">
                  Renombrar una ruta actualiza clientes, tickets y jornadas asociados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRutasModal(false);
                  setEditingRuta(null);
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {editingRuta && (
                <form
                  onSubmit={handleSaveEditRuta}
                  className="rounded-xl border border-[var(--theme-primary)]/30 bg-[var(--theme-tint)] p-4 space-y-3"
                >
                  <p className="text-xs font-bold text-[var(--theme-primary)]">
                    Editando: {editingRuta.nombre}
                  </p>
                  <input
                    type="text"
                    required
                    value={rutaNombre}
                    onChange={(e) => setRutaNombre(e.target.value)}
                    placeholder="Nombre de la ruta"
                    className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                  />
                  <input
                    type="text"
                    value={rutaDescripcion}
                    onChange={(e) => setRutaDescripcion(e.target.value)}
                    placeholder="Descripción / municipios"
                    className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                  />
                  <label className="flex items-center gap-2 text-xs font-medium text-[#1F1A17]">
                    <input
                      type="checkbox"
                      checked={rutaActiva}
                      onChange={(e) => setRutaActiva(e.target.checked)}
                      className="h-4 w-4 accent-[var(--theme-primary)]"
                    />
                    <span>Ruta activa</span>
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingRuta(null)}
                      className="min-h-[38px] px-3 rounded-lg border border-[#D8D1C7] bg-white text-xs font-semibold text-[#49403A]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="min-h-[38px] px-4 rounded-lg bg-[var(--theme-primary)] text-xs font-bold text-white"
                    >
                      Guardar ruta
                    </button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-[#EFECE6] border border-[#EFECE6] rounded-xl overflow-hidden">
                {dataset.rutas.length === 0 ? (
                  <p className="p-6 text-center text-xs text-[#6E6259]">
                    No hay rutas registradas todavía.
                  </p>
                ) : (
                  dataset.rutas.map((r) => (
                    <div
                      key={r.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 bg-white"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1F1A17] truncate">
                          {r.nombre}{' '}
                          {!r.activa && (
                            <span className="text-[11px] font-normal text-[#8C7E73]">(Inactiva)</span>
                          )}
                        </p>
                        {r.descripcion && (
                          <p className="text-xs text-[#6E6259] truncate">{r.descripcion}</p>
                        )}
                      </div>
                      {r.rowNumber && (
                        <button
                          type="button"
                          onClick={() => openEditRuta(r)}
                          className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[#D8D1C7] px-2.5 text-xs font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-tint)] shrink-0"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <GoogleMapsLocationModal
        isOpen={Boolean(mapsPickerTarget)}
        clientName={
          mapsPickerTarget?.mode === 'detail'
            ? mapsPickerTarget.cliente.nombre
            : editNombre || editingCliente?.nombre || 'Cliente'
        }
        initialAddress={
          mapsPickerTarget?.mode === 'detail'
            ? mapsPickerTarget.cliente.direccion
            : editDireccion
        }
        onClose={() => setMapsPickerTarget(null)}
        onConfirmLocation={(chosenLocation) => {
          const target = mapsPickerTarget;
          setMapsPickerTarget(null);
          if (!target) return;
          if (target.mode === 'edit') {
            setEditDireccion(chosenLocation);
            return;
          }
          const updatedCliente: Cliente = {
            ...target.cliente,
            direccion: chosenLocation,
          };
          onRequestMutation({
            title: 'Guardar ubicación del cliente',
            description:
              'Se guardará la ubicación seleccionada en Google Maps dentro de la ficha del cliente.',
            sheetTab: clientesTabName,
            details: [
              { label: 'Cliente', value: updatedCliente.nombre },
              { label: 'Ubicación', value: chosenLocation },
            ],
            confirmLabel: 'Guardar ubicación',
            onConfirm: async () => {
              await onUpdateCliente(updatedCliente);
            },
          });
        }}
      />
    </div>
  );
};
