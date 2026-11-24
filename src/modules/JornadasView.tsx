import React, { useMemo, useState } from 'react';
import {
  ClipboardList,
  Plus,
  Package,
  Truck,
  CheckCircle2,
  ShoppingBag,
  Trash2,
  Eye,
  Edit2,
  Search,
  RotateCcw,
  X,
  Link2,
  AlertTriangle,
  Phone,
  MessageCircle,
  Navigation,
  Wallet,
  Save,
  CheckSquare,
  Square,
  Receipt,
} from 'lucide-react';
import {
  BusinessDataset,
  ConceptoGasto,
  Egreso,
  Jornada,
  JornadaConciliacionItem,
  JornadaConciliacionMotivo,
  JornadaInventarioItem,
  JornadaVisitaEstado,
  JornadaVisitaItem,
  MovimientoInventario,
  Ticket,
} from '../types/business';
import {
  formatCurrency,
  formatDateShort,
  formatNumber,
  getClientInactivityInfo,
  getTodayISO,
  normalizeText,
} from '../utils/formatters';
import { getTicketJornadaSoldDelta } from '../utils/ticketAdjustments';
import { getJornadaExpenses } from '../utils/incomeConsolidation';
import { getTicketPaymentSummary } from '../utils/paymentHelpers';
import {
  buildGoogleMapsUrl,
  buildWhatsAppClientUrl,
  sanitizePhoneDigits,
} from '../utils/ticketShare';
import { PendingMutation } from '../components/ConfirmMutationModal';
import { InventoryDelta } from '../utils/offlineQueue';

interface JornadasViewProps {
  dataset: BusinessDataset;
  jornadasTabName: string;
  productosTabName: string;
  ticketsTabName: string;
  egresosTabName?: string;
  onRequestMutation: (mutation: PendingMutation) => void;
  onCreateJornada: (
    draft: Omit<Jornada, 'id'>,
    selectedTickets: Ticket[],
    inventoryDeltas: InventoryDelta[]
  ) => Promise<void>;
  onUpdateJornada: (
    jornada: Jornada,
    inventoryDeltas: InventoryDelta[],
    assignedTickets?: Ticket[]
  ) => Promise<void>;
  onFinalizeJornada: (
    jornada: Jornada,
    returnDeltas: InventoryDelta[],
    extraMovimientos?: Omit<MovimientoInventario, 'id'>[]
  ) => Promise<void>;
  onDeleteJornada: (jornada: Jornada) => Promise<void>;
  onViewTicket: (ticket: Ticket, editMode?: boolean) => void;
  onDeleteTicket: (ticket: Ticket) => Promise<void>;
  onSaveEgreso?: (
    egreso: Omit<Egreso, 'id'>,
    saveConcept?: Omit<ConceptoGasto, 'id'>
  ) => Promise<void>;
  onUpdateEgreso?: (egreso: Egreso) => Promise<void>;
  onDeleteEgreso?: (egreso: Egreso) => Promise<void>;
  onCreateTicketInJornada: (jornada: Jornada) => void;
}

export const JornadasView: React.FC<JornadasViewProps> = ({
  dataset,
  jornadasTabName,
  productosTabName,
  ticketsTabName,
  egresosTabName = 'Egresos',
  onRequestMutation,
  onCreateJornada,
  onUpdateJornada,
  onFinalizeJornada,
  onDeleteJornada,
  onViewTicket,
  onDeleteTicket,
  onSaveEgreso,
  onUpdateEgreso,
  onDeleteEgreso,
  onCreateTicketInJornada,
}) => {
  const openJornadas = useMemo(
    () =>
      [...dataset.jornadas]
        .filter((j) => j.estado === 'Abierta')
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [dataset.jornadas]
  );

  const closedJornadas = useMemo(
    () =>
      [...dataset.jornadas]
        .filter((j) => j.estado === 'Cerrada')
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [dataset.jornadas]
  );

  const [mode, setMode] = useState<'detalle' | 'crear'>(() =>
    dataset.jornadas.some((j) => j.estado === 'Abierta') ? 'detalle' : 'crear'
  );
  const [selectedJornadaId, setSelectedJornadaId] = useState<string>(() => {
    const firstOpen = dataset.jornadas.find((j) => j.estado === 'Abierta');
    return firstOpen?.id || dataset.jornadas[dataset.jornadas.length - 1]?.id || '';
  });

  // Create Jornada Form State
  const [fecha, setFecha] = useState(getTodayISO());
  const [ruta, setRuta] = useState(dataset.rutas[0]?.nombre || '');
  const [nombre, setNombre] = useState('');
  const [notas, setNotas] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [loadQuantities, setLoadQuantities] = useState<Record<string, number>>({});

  // Edit Open Jornada Inventory Modal
  const [editingInvJornada, setEditingInvJornada] = useState<Jornada | null>(null);
  const [editInvQuantities, setEditInvQuantities] = useState<Record<string, number>>({});
  const [editInvSearch, setEditInvSearch] = useState('');

  // Finalize Jornada Modal + Conciliación state
  const [finalizingJornada, setFinalizingJornada] = useState<Jornada | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnMotivos, setReturnMotivos] = useState<Record<string, JornadaConciliacionMotivo>>({});
  const [returnNotas, setReturnNotas] = useState<Record<string, string>>({});

  // Route visits checklist drafts (keyed by `${jornada.id}::${cliente.id}`)
  const [visitDrafts, setVisitDrafts] = useState<
    Record<string, { estado?: 'Pendiente' | 'Visitado'; notas?: string }>
  >({});

  // Attach unassigned tickets panel
  const [showAttachTickets, setShowAttachTickets] = useState(false);

  // Jornada expenses (gastos) quick form + edit modal
  const [showAddGastoForm, setShowAddGastoForm] = useState(false);
  const [gastoFecha, setGastoFecha] = useState(getTodayISO());
  const [gastoCategoria, setGastoCategoria] = useState('Gasolina');
  const [gastoConcepto, setGastoConcepto] = useState('');
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoNotas, setGastoNotas] = useState('');

  const [editingGasto, setEditingGasto] = useState<Egreso | null>(null);
  const [editGastoFecha, setEditGastoFecha] = useState('');
  const [editGastoCategoria, setEditGastoCategoria] = useState('Gasolina');
  const [editGastoConcepto, setEditGastoConcepto] = useState('');
  const [editGastoMonto, setEditGastoMonto] = useState('');
  const [editGastoNotas, setEditGastoNotas] = useState('');

  const activeProducts = useMemo(
    () => dataset.productos.filter((p) => p.activo),
    [dataset.productos]
  );

  const selectedJornada = useMemo(() => {
    if (!selectedJornadaId) return openJornadas[0] || closedJornadas[0] || null;
    return (
      dataset.jornadas.find((j) => j.id === selectedJornadaId) ||
      openJornadas[0] ||
      closedJornadas[0] ||
      null
    );
  }, [selectedJornadaId, dataset.jornadas, openJornadas, closedJornadas]);

  const getJornadaTickets = (jornada: Jornada | null): Ticket[] => {
    if (!jornada) return [];
    const folioSet = new Set(jornada.ticketFolios);
    return dataset.tickets
      .filter((t) => t.jornadaId === jornada.id || folioSet.has(t.folio))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.folio.localeCompare(a.folio));
  };

  const selectedJornadaTickets = useMemo(
    () => getJornadaTickets(selectedJornada),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedJornada, dataset.tickets]
  );

  // Compute live sold/dispatched count by productId / normalized name for a jornada's tickets
  const computeSoldByProduct = (tickets: Ticket[]) => {
    const byId = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const t of tickets) {
      for (const it of t.items) {
        const delta = getTicketJornadaSoldDelta(it);
        if (delta === 0) continue;
        if (it.productoId) {
          byId.set(it.productoId, (byId.get(it.productoId) || 0) + delta);
        }
        if (it.productoNombre) {
          const n = normalizeText(it.productoNombre);
          byName.set(n, (byName.get(n) || 0) + delta);
        }
      }
    }
    return { byId, byName };
  };

  const selectedInventoryRows = useMemo(() => {
    if (!selectedJornada) return [];
    const { byId, byName } = computeSoldByProduct(selectedJornadaTickets);
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    const rows = (selectedJornada.inventario || []).map((item) => {
      if (item.productoId) seenIds.add(item.productoId);
      if (item.productoNombre) seenNames.add(normalizeText(item.productoNombre));

      const sold =
        (item.productoId && byId.get(item.productoId)) ||
        byName.get(normalizeText(item.productoNombre)) ||
        0;
      const calculadoRestante = Math.max(0, item.cantidadInicial - sold);
      return {
        ...item,
        vendido: sold,
        calculadoRestante,
      };
    });

    // Also include any product sold in tickets that wasn't pre-loaded into jornada inventory
    for (const t of selectedJornadaTickets) {
      for (const it of t.items) {
        const nameNorm = normalizeText(it.productoNombre);
        if ((it.productoId && seenIds.has(it.productoId)) || seenNames.has(nameNorm)) {
          continue;
        }
        seenIds.add(it.productoId);
        seenNames.add(nameNorm);
        const sold =
          (it.productoId && byId.get(it.productoId)) || byName.get(nameNorm) || it.cantidad;
        rows.push({
          productoId: it.productoId,
          productoNombre: it.productoNombre,
          cantidadInicial: 0,
          vendido: sold,
          calculadoRestante: 0,
        });
      }
    }

    return rows;
  }, [selectedJornada, selectedJornadaTickets]);

  const unassignedTickets = useMemo(
    () =>
      dataset.tickets
        .filter((t) => !t.jornadaId)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.folio.localeCompare(a.folio)),
    [dataset.tickets]
  );

  // Cobranza summary for selected jornada
  const selectedCobranza = useMemo(() => {
    let vendido = 0;
    let cobrado = 0;
    let porCobrar = 0;
    for (const t of selectedJornadaTickets) {
      const pay = getTicketPaymentSummary(t);
      vendido += t.totalImporte;
      cobrado += pay.montoPagado;
      porCobrar += pay.saldoPendiente;
    }
    return { vendido, cobrado, porCobrar };
  }, [selectedJornadaTickets]);

  const { egresos: selectedJornadaEgresos, totalGastos: selectedTotalGastos } = useMemo(
    () => getJornadaExpenses(dataset, selectedJornada?.id || ''),
    [dataset, selectedJornada?.id]
  );

  const selectedTotalNetoJornada = selectedCobranza.vendido - selectedTotalGastos;

  // Route visit checklist rows for selected jornada
  const selectedVisitRows = useMemo(() => {
    if (!selectedJornada) return [];
    const routeClients = dataset.clientes.filter(
      (c) => normalizeText(c.ruta) === normalizeText(selectedJornada.ruta)
    );
    const savedById = new Map<string, JornadaVisitaItem>();
    const savedByName = new Map<string, JornadaVisitaItem>();
    (selectedJornada.visitas || []).forEach((v) => {
      if (v.clienteId) savedById.set(v.clienteId, v);
      if (v.clienteNombre) savedByName.set(normalizeText(v.clienteNombre), v);
    });

    const ticketClientIds = new Set(
      selectedJornadaTickets.map((t) => t.clienteId).filter(Boolean)
    );
    const ticketClientNames = new Set(
      selectedJornadaTickets.map((t) => normalizeText(t.clienteNombre)).filter(Boolean)
    );

    return routeClients.map((c) => {
      const hasOrder =
        ticketClientIds.has(c.id) || ticketClientNames.has(normalizeText(c.nombre));
      const saved = savedById.get(c.id) || savedByName.get(normalizeText(c.nombre));
      const draftKey = `${selectedJornada.id}::${c.id}`;
      const draft = visitDrafts[draftKey];
      const baseEstado: JornadaVisitaEstado = hasOrder
        ? 'Con pedido'
        : draft?.estado || (saved?.estado === 'Visitado' ? 'Visitado' : 'Pendiente');
      const notasVal = draft?.notas !== undefined ? draft.notas : saved?.notas || '';
      return {
        cliente: c,
        hasOrder,
        estado: baseEstado,
        notas: notasVal,
        draftKey,
      };
    });
  }, [selectedJornada, dataset.clientes, selectedJornadaTickets, visitDrafts]);

  // Create form filtered products
  const filteredCreateProducts = useMemo(() => {
    const q = normalizeText(prodSearch);
    return activeProducts.filter(
      (p) =>
        !q ||
        normalizeText(p.nombre).includes(q) ||
        normalizeText(p.categoria).includes(q)
    );
  }, [activeProducts, prodSearch]);

  const totalLoadedPiecesCreate = useMemo(
    () => Object.values(loadQuantities).reduce((s, v) => s + (v || 0), 0),
    [loadQuantities]
  );

  const setCreateQty = (prodId: string, qty: number) => {
    const clean = Math.max(0, Math.floor(qty) || 0);
    setLoadQuantities((prev) => {
      if (clean === 0) {
        const copy = { ...prev };
        delete copy[prodId];
        return copy;
      }
      return { ...prev, [prodId]: clean };
    });
  };

  const handleStartNewJornada = (e: React.FormEvent) => {
    e.preventDefault();
    const rutaLabel = ruta.trim() || 'General';
    const finalName =
      nombre.trim() || `Jornada ${rutaLabel} · ${formatDateShort(fecha)}`;

    const inventarioItems: JornadaInventarioItem[] = [];
    const deltas: InventoryDelta[] = [];

    for (const [prodId, qty] of Object.entries(loadQuantities)) {
      if (!qty || qty <= 0) continue;
      const prod = dataset.productos.find((p) => p.id === prodId);
      if (!prod) continue;
      inventarioItems.push({
        productoId: prod.id,
        productoNombre: prod.nombre,
        cantidadInicial: qty,
      });
      deltas.push({
        productoId: prod.id,
        productoNombre: prod.nombre,
        delta: -qty,
      });
    }

    const totalLoaded = inventarioItems.reduce((s, it) => s + it.cantidadInicial, 0);

    onRequestMutation({
      title: 'Abrir nueva jornada con inventario',
      description:
        totalLoaded > 0
          ? `Se registrará la jornada abierta en Google Sheets y se restarán ${formatNumber(
              totalLoaded
            )} piezas del inventario general en "${productosTabName}".`
          : 'Se registrará la nueva jornada abierta en Google Sheets lista para recibir pedidos.',
      sheetTab: `${jornadasTabName} y ${productosTabName}`,
      details: [
        { label: 'Nombre de jornada', value: finalName },
        { label: 'Fecha', value: formatDateShort(fecha) },
        { label: 'Ruta', value: rutaLabel },
        { label: 'Productos cargados', value: `${inventarioItems.length} artículo(s)` },
        { label: 'Total piezas salidas', value: `${formatNumber(totalLoaded)} piezas` },
      ],
      confirmLabel: 'Abrir jornada',
      onConfirm: async () => {
        await onCreateJornada(
          {
            fecha,
            ruta: rutaLabel,
            nombre: finalName,
            ticketFolios: [],
            totalTickets: 0,
            totalPiezas: 0,
            totalImporte: 0,
            estado: 'Abierta',
            notas: notas.trim(),
            inventario: inventarioItems,
          },
          [],
          deltas
        );
        setNombre('');
        setNotas('');
        setLoadQuantities({});
        setProdSearch('');
        setMode('detalle');
      },
    });
  };

  // Open edit inventory modal for an Abierta jornada
  const openEditJornadaInventory = (j: Jornada) => {
    const init: Record<string, number> = {};
    (j.inventario || []).forEach((it) => {
      if (it.productoId) init[it.productoId] = it.cantidadInicial;
    });
    setEditInvQuantities(init);
    setEditInvSearch('');
    setEditingInvJornada(j);
  };

  const handleSaveEditedJornadaInventory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvJornada) return;

    const oldMap = new Map<string, JornadaInventarioItem>();
    (editingInvJornada.inventario || []).forEach((it) => {
      oldMap.set(it.productoId, it);
    });

    const nextItems: JornadaInventarioItem[] = [];
    const deltas: InventoryDelta[] = [];

    // Check all active products and any previously included products
    const allIds = new Set<string>([
      ...activeProducts.map((p) => p.id),
      ...(editingInvJornada.inventario || []).map((i) => i.productoId),
    ]);

    for (const prodId of allIds) {
      const prod = dataset.productos.find((p) => p.id === prodId);
      const prevItem = oldMap.get(prodId);
      const prevQty = prevItem?.cantidadInicial || 0;
      const nextQty = Math.max(0, Math.floor(editInvQuantities[prodId] || 0));
      const prodNombre = prod?.nombre || prevItem?.productoNombre || prodId;

      if (nextQty > 0) {
        nextItems.push({
          productoId: prodId,
          productoNombre: prodNombre,
          cantidadInicial: nextQty,
        });
      }

      const deltaGeneral = prevQty - nextQty; // If loaded increased (+5), general inventory changes by -5
      if (deltaGeneral !== 0) {
        deltas.push({
          productoId: prodId,
          productoNombre: prodNombre,
          delta: deltaGeneral,
        });
      }
    }

    onRequestMutation({
      title: 'Actualizar inventario de jornada',
      description:
        deltas.length > 0
          ? 'Se actualizará la carga de esta jornada y se ajustará la diferencia en el inventario general de Productos.'
          : 'Se actualizará el registro de la jornada.',
      sheetTab: `${jornadasTabName} y ${productosTabName}`,
      details: [
        { label: 'Jornada', value: editingInvJornada.nombre },
        { label: 'Productos con ajuste', value: `${deltas.length} producto(s)` },
        {
          label: 'Total piezas cargadas',
          value: `${formatNumber(nextItems.reduce((s, i) => s + i.cantidadInicial, 0))} pzas`,
        },
      ],
      confirmLabel: 'Guardar inventario de jornada',
      onConfirm: async () => {
        await onUpdateJornada(
          {
            ...editingInvJornada,
            inventario: nextItems,
          },
          deltas
        );
        setEditingInvJornada(null);
      },
    });
  };

  // Open Finalize Jornada modal
  const openFinalizeModal = (j: Jornada) => {
    const tickets = getJornadaTickets(j);
    const { byId, byName } = computeSoldByProduct(tickets);
    const initReturns: Record<string, number> = {};
    (j.inventario || []).forEach((it) => {
      const sold =
        (it.productoId && byId.get(it.productoId)) ||
        byName.get(normalizeText(it.productoNombre)) ||
        0;
      initReturns[it.productoId || it.productoNombre] = Math.max(0, it.cantidadInicial - sold);
    });
    setReturnQuantities(initReturns);
    setReturnMotivos({});
    setReturnNotas({});
    setFinalizingJornada(j);
  };

  const handleSaveVisitasChecklist = () => {
    if (!selectedJornada) return;
    const visitasPayload: JornadaVisitaItem[] = selectedVisitRows.map((row) => ({
      clienteId: row.cliente.id,
      clienteNombre: row.cliente.nombre,
      estado: row.estado,
      ...(row.notas.trim() ? { notas: row.notas.trim() } : {}),
    }));
    const visitadosCount = visitasPayload.filter((v) => v.estado !== 'Pendiente').length;
    onRequestMutation({
      title: 'Guardar checklist de visitas',
      description: `Se actualizará el registro de visitas en ruta de la jornada "${selectedJornada.nombre}".`,
      sheetTab: jornadasTabName,
      details: [
        { label: 'Jornada', value: selectedJornada.nombre },
        { label: 'Ruta', value: selectedJornada.ruta },
        {
          label: 'Avance de ruta',
          value: `${visitadosCount} de ${visitasPayload.length} cliente(s)`,
        },
      ],
      confirmLabel: 'Guardar visitas',
      onConfirm: async () => {
        await onUpdateJornada(
          {
            ...selectedJornada,
            visitas: visitasPayload,
          },
          []
        );
      },
    });
  };

  const handleConfirmFinalize = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalizingJornada) return;

    const tickets = getJornadaTickets(finalizingJornada);
    const { byId, byName } = computeSoldByProduct(tickets);
    const totalTickets = tickets.length;
    const totalPiezas = tickets.reduce((s, t) => s + t.totalPiezas, 0);
    const totalImporte = tickets.reduce((s, t) => s + t.totalImporte, 0);
    const ticketFolios = tickets.map((t) => t.folio);

    const conciliacion: JornadaConciliacionItem[] = [];
    const extraMovimientos: Omit<MovimientoInventario, 'id'>[] = [];

    const updatedInventario: JornadaInventarioItem[] = (finalizingJornada.inventario || []).map(
      (it) => {
        const key = it.productoId || it.productoNombre;
        const sold =
          (it.productoId && byId.get(it.productoId)) ||
          byName.get(normalizeText(it.productoNombre)) ||
          0;
        const esperado = Math.max(0, it.cantidadInicial - sold);
        const devuelto = Math.max(0, Math.floor(returnQuantities[key] ?? esperado));
        const diferencia = devuelto - esperado;
        const motivo: JornadaConciliacionMotivo =
          diferencia === 0
            ? 'Sin novedad'
            : returnMotivos[key] || (diferencia < 0 ? 'Faltante' : 'Sobrante');
        const notaItem = (returnNotas[key] || '').trim();

        conciliacion.push({
          productoId: it.productoId,
          productoNombre: it.productoNombre,
          cargado: it.cantidadInicial,
          vendido: sold,
          esperado,
          devuelto,
          diferencia,
          motivo,
          ...(notaItem ? { notas: notaItem } : {}),
        });

        if (diferencia !== 0) {
          const prod = dataset.productos.find(
            (p) =>
              (it.productoId && p.id === it.productoId) ||
              normalizeText(p.nombre) === normalizeText(it.productoNombre)
          );
          extraMovimientos.push({
            fecha: finalizingJornada.fecha,
            tipo:
              motivo === 'Merma'
                ? 'Merma'
                : motivo === 'Cortesía'
                ? 'Cortesía'
                : 'Faltante jornada',
            productoId: it.productoId || prod?.id || '',
            productoNombre: it.productoNombre,
            cantidadDelta: diferencia,
            stockResultante: Math.max(0, (prod?.inventario ?? 0) + devuelto),
            referencia: finalizingJornada.nombre,
            notas:
              notaItem ||
              `Conciliación cierre (${motivo}): esperado ${esperado}, devuelto ${devuelto}`,
          });
        }

        return {
          ...it,
          cantidadDevuelta: devuelto,
        };
      }
    );

    const returnDeltas: InventoryDelta[] = updatedInventario
      .filter((it) => (it.cantidadDevuelta || 0) > 0)
      .map((it) => ({
        productoId: it.productoId,
        productoNombre: it.productoNombre,
        delta: it.cantidadDevuelta || 0,
      }));

    const totalReturnedPieces = returnDeltas.reduce((s, d) => s + d.delta, 0);
    const difCount = conciliacion.filter((c) => c.diferencia !== 0).length;

    onRequestMutation({
      title: 'Finalizar jornada y conciliar inventario',
      description: `La jornada pasará a estado Cerrada y se sumarán ${formatNumber(
        totalReturnedPieces
      )} pieza(s) sobrantes de regreso al inventario general en "${productosTabName}".${
        difCount > 0
          ? ` Además se registrarán ${difCount} diferencia(s) en Kardex.`
          : ''
      }`,
      sheetTab: `${jornadasTabName} y ${productosTabName}`,
      details: [
        { label: 'Jornada', value: finalizingJornada.nombre },
        { label: 'Tickets vendidos', value: String(totalTickets) },
        { label: 'Importe vendido', value: formatCurrency(totalImporte) },
        { label: 'Piezas devueltas a bodega', value: `${formatNumber(totalReturnedPieces)} pzas` },
        ...(difCount > 0
          ? [{ label: 'Ajustes / mermas', value: `${difCount} producto(s) con diferencia` }]
          : []),
      ],
      confirmLabel: 'Finalizar jornada',
      onConfirm: async () => {
        await onFinalizeJornada(
          {
            ...finalizingJornada,
            ticketFolios,
            totalTickets,
            totalPiezas,
            totalImporte,
            estado: 'Cerrada',
            inventario: updatedInventario,
            conciliacion,
          },
          returnDeltas,
          extraMovimientos
        );
        setFinalizingJornada(null);
      },
    });
  };

  const handleAttachTicketToSelected = (ticket: Ticket) => {
    if (!selectedJornada) return;
    const currentTickets = getJornadaTickets(selectedJornada);
    const nextTickets = [...currentTickets.filter((t) => t.folio !== ticket.folio), ticket];
    const nextFolios = nextTickets.map((t) => t.folio);
    const totalTickets = nextTickets.length;
    const totalPiezas = nextTickets.reduce((s, t) => s + t.totalPiezas, 0);
    const totalImporte = nextTickets.reduce((s, t) => s + t.totalImporte, 0);

    onRequestMutation({
      title: `Vincular ticket ${ticket.folio} a jornada`,
      description: `Se asignará el ticket ${ticket.folio} a "${selectedJornada.nombre}" y se actualizarán los totales de la jornada.`,
      sheetTab: `${jornadasTabName} y ${ticketsTabName}`,
      details: [
        { label: 'Ticket', value: `${ticket.folio} · ${ticket.clienteNombre}` },
        { label: 'Importe', value: formatCurrency(ticket.totalImporte) },
        { label: 'Jornada', value: selectedJornada.nombre },
      ],
      confirmLabel: 'Vincular ticket',
      onConfirm: async () => {
        await onUpdateJornada(
          {
            ...selectedJornada,
            ticketFolios: nextFolios,
            totalTickets,
            totalPiezas,
            totalImporte,
          },
          [],
          [ticket]
        );
      },
    });
  };

  const confirmDeleteJornada = (j: Jornada) => {
    const isAbierta = j.estado === 'Abierta';
    const loadedPieces = (j.inventario || []).reduce((s, it) => s + it.cantidadInicial, 0);
    onRequestMutation({
      title: 'Eliminar jornada',
      description:
        isAbierta && loadedPieces > 0
          ? `Esta jornada sigue abierta. Al eliminarla se devolverán ${formatNumber(
              loadedPieces
            )} piezas cargadas al inventario general y sus tickets quedarán libres.`
          : 'Se eliminará esta jornada de Google Sheets y sus tickets vinculados quedarán libres.',
      sheetTab: jornadasTabName,
      details: [
        { label: 'Jornada', value: j.nombre },
        { label: 'Estado', value: j.estado },
        { label: 'Tickets', value: String(j.totalTickets) },
      ],
      confirmLabel: 'Eliminar jornada',
      onConfirm: async () => {
        await onDeleteJornada(j);
        if (selectedJornadaId === j.id) setSelectedJornadaId('');
      },
    });
  };

  const confirmDeleteTicket = (ticket: Ticket) => {
    onRequestMutation({
      title: `Eliminar ticket ${ticket.folio}`,
      description:
        'Se eliminará permanentemente este ticket de Google Sheets.',
      sheetTab: ticketsTabName,
      details: [
        { label: 'Folio', value: ticket.folio },
        { label: 'Cliente', value: ticket.clienteNombre },
        { label: 'Importe', value: formatCurrency(ticket.totalImporte) },
      ],
      confirmLabel: 'Eliminar ticket',
      onConfirm: async () => {
        await onDeleteTicket(ticket);
      },
    });
  };

  const handleAddGastoJornada = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJornada || !onSaveEgreso) return;
    const montoNum = parseFloat(gastoMonto);
    if (!gastoConcepto.trim() || !montoNum || montoNum <= 0) return;

    onRequestMutation({
      title: 'Agregar gasto a la jornada',
      description: `Este gasto se descontará del total de "${selectedJornada.nombre}" y se guardará en "${egresosTabName}" solo como registro visual (sin volver a restar en Egresos).`,
      sheetTab: egresosTabName,
      details: [
        { label: 'Jornada', value: selectedJornada.nombre },
        { label: 'Fecha', value: formatDateShort(gastoFecha) },
        { label: 'Categoría', value: gastoCategoria },
        { label: 'Concepto', value: gastoConcepto.trim() },
        { label: 'Monto a restar', value: formatCurrency(montoNum) },
      ],
      confirmLabel: 'Guardar gasto en jornada',
      onConfirm: async () => {
        await onSaveEgreso({
          fecha: gastoFecha,
          categoria: gastoCategoria,
          concepto: gastoConcepto.trim(),
          monto: montoNum,
          notas: gastoNotas.trim(),
          jornadaId: selectedJornada.id,
        });
        setGastoConcepto('');
        setGastoMonto('');
        setGastoNotas('');
        setShowAddGastoForm(false);
      },
    });
  };

  const openEditGastoModal = (eg: Egreso) => {
    setEditingGasto(eg);
    setEditGastoFecha(eg.fecha);
    setEditGastoCategoria(eg.categoria || 'Gasolina');
    setEditGastoConcepto(eg.concepto);
    setEditGastoMonto(String(eg.monto));
    setEditGastoNotas(eg.notas || '');
  };

  const handleSaveEditGasto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGasto || !onUpdateEgreso) return;
    const montoNum = parseFloat(editGastoMonto);
    if (!editGastoConcepto.trim() || !montoNum || montoNum <= 0) return;

    const updated: Egreso = {
      ...editingGasto,
      fecha: editGastoFecha,
      categoria: editGastoCategoria,
      concepto: editGastoConcepto.trim(),
      monto: montoNum,
      notas: editGastoNotas.trim(),
    };

    onRequestMutation({
      title: 'Actualizar gasto de jornada',
      description: `Se actualizará este gasto en "${egresosTabName}" y en el total neto de la jornada.`,
      sheetTab: egresosTabName,
      details: [
        { label: 'Fecha', value: formatDateShort(updated.fecha) },
        { label: 'Categoría', value: updated.categoria },
        { label: 'Concepto', value: updated.concepto },
        { label: 'Monto', value: formatCurrency(updated.monto) },
      ],
      confirmLabel: 'Guardar cambios',
      onConfirm: async () => {
        await onUpdateEgreso(updated);
        setEditingGasto(null);
      },
    });
  };

  const confirmDeleteGastoJornada = (eg: Egreso) => {
    if (!onDeleteEgreso) return;
    onRequestMutation({
      title: 'Eliminar gasto de jornada',
      description: `Se eliminará este gasto de la jornada y de "${egresosTabName}".`,
      sheetTab: egresosTabName,
      details: [
        { label: 'Concepto', value: eg.concepto },
        { label: 'Fecha', value: formatDateShort(eg.fecha) },
        { label: 'Monto', value: formatCurrency(eg.monto) },
      ],
      confirmLabel: 'Eliminar gasto',
      onConfirm: async () => {
        await onDeleteEgreso(eg);
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F1A17]">Jornadas e inventario de ruta</h1>
          <p className="text-sm text-[#6E6259]">
            Carga mercancía del inventario general al abrir jornada, asigna tickets durante el reparto y devuelve el sobrante al finalizar.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMode((m) => (m === 'crear' ? 'detalle' : 'crear'))}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)] whitespace-nowrap self-start sm:self-auto"
        >
          {mode === 'crear' ? (
            <>
              <ClipboardList className="w-4 h-4" />
              <span>Ver jornadas ({dataset.jornadas.length})</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Nueva jornada</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left sidebar: Open & Closed Jornadas */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#EFECE6] flex items-center justify-between">
              <span className="text-sm font-bold text-[#1F1A17] flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-700" />
                <span>En curso ({openJornadas.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setMode('crear')}
                className="text-xs font-semibold text-[var(--theme-accent)] hover:underline"
              >
                + Abrir nueva
              </button>
            </div>

            {openJornadas.length === 0 ? (
              <div className="p-5 text-center text-xs text-[#6E6259]">
                No hay jornadas abiertas actualmente. Usa &ldquo;Nueva jornada&rdquo; para cargar inventario y comenzar una ruta.
              </div>
            ) : (
              <div className="divide-y divide-[#EFECE6]">
                {openJornadas.map((j) => {
                  const tickets = getJornadaTickets(j);
                  const liveImporte = tickets.reduce((s, t) => s + t.totalImporte, 0);
                  const { totalGastos } = getJornadaExpenses(dataset, j.id);
                  const neto = liveImporte - totalGastos;
                  const isSelected = mode === 'detalle' && selectedJornada?.id === j.id;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        setSelectedJornadaId(j.id);
                        setMode('detalle');
                      }}
                      className={`w-full text-left px-4 py-3.5 transition-colors ${
                        isSelected ? 'bg-[var(--theme-tint)]' : 'hover:bg-[#FAF8F5]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-[#1F1A17] truncate">{j.nombre}</p>
                        <span className="text-[11px] font-bold text-emerald-700 shrink-0">
                          Abierta
                        </span>
                      </div>
                      <p className="text-xs text-[#6E6259] mt-0.5 tabular-nums">
                        {formatDateShort(j.fecha)} · {j.ruta}
                      </p>
                      <p className="text-xs font-semibold text-[var(--theme-primary)] mt-1 tabular-nums">
                        {tickets.length} tickets · {formatCurrency(neto)}
                        {totalGastos > 0 && (
                          <span className="text-[#B91C1C] font-normal ml-1.5">
                            (Gastos -{formatCurrency(totalGastos)})
                          </span>
                        )}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EFECE6] flex items-center justify-between">
              <span className="text-xs font-bold text-[#6E6259]">
                Historial finalizadas ({closedJornadas.length})
              </span>
            </div>
            {closedJornadas.length === 0 ? (
              <div className="p-5 text-center text-xs text-[#8C7E73]">
                Aún no hay jornadas finalizadas.
              </div>
            ) : (
              <div className="divide-y divide-[#EFECE6] max-h-[300px] overflow-y-auto">
                {closedJornadas.map((j) => {
                  const isSelected = mode === 'detalle' && selectedJornada?.id === j.id;
                  const { totalGastos } = getJornadaExpenses(dataset, j.id);
                  const neto = j.totalImporte - totalGastos;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        setSelectedJornadaId(j.id);
                        setMode('detalle');
                      }}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        isSelected ? 'bg-[var(--theme-tint)]' : 'hover:bg-[#FAF8F5]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-[#1F1A17] truncate">{j.nombre}</p>
                        <span className="text-xs font-bold text-[var(--theme-primary)] tabular-nums shrink-0">
                          {formatCurrency(neto)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6E6259] mt-0.5 tabular-nums">
                        {formatDateShort(j.fecha)} · {j.ruta} · {j.totalTickets} tickets
                        {totalGastos > 0 ? ` · Gastos -${formatCurrency(totalGastos)}` : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Right workspace: Create New Jornada OR Inspect/Finalize Selected */}
        <section className="lg:col-span-8">
          {mode === 'crear' ? (
            <form
              onSubmit={handleStartNewJornada}
              className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-[#EFECE6] flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#1F1A17]">
                    Abrir nueva jornada y cargar inventario
                  </h2>
                  <p className="text-xs text-[#6E6259]">
                    Las piezas seleccionadas se descontarán del inventario general al abrir la jornada.
                  </p>
                </div>
                <span className="text-xs font-bold text-[var(--theme-primary)] tabular-nums shrink-0">
                  {formatNumber(totalLoadedPiecesCreate)} pzas cargadas
                </span>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Fecha *
                    </label>
                    <input
                      type="date"
                      required
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Ruta *
                    </label>
                    <select
                      value={ruta}
                      onChange={(e) => setRuta(e.target.value)}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                    >
                      {dataset.rutas.length === 0 && <option value="General">General</option>}
                      {dataset.rutas.map((r) => (
                        <option key={r.id} value={r.nombre}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Nombre de la jornada
                    </label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder={`Ej. Ruta ${ruta || 'Sur'} ${formatDateShort(fecha)}`}
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                      Notas (opcional)
                    </label>
                    <input
                      type="text"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Chofer, camioneta, observaciones..."
                      className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                    />
                  </div>
                </div>

                {/* Product picker for Jornada Inventory */}
                <div className="rounded-2xl border border-[#E7E3DC] overflow-hidden">
                  <div className="p-3.5 bg-[#FAF8F5] border-b border-[#EFECE6] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#1F1A17]">
                      <Package className="w-4 h-4 text-[var(--theme-primary)]" />
                      <span>Inventario para esta jornada</span>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-[#8C7E73] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={prodSearch}
                        onChange={(e) => setProdSearch(e.target.value)}
                        placeholder="Buscar producto..."
                        className="w-full h-9 rounded-lg border border-[#D8D1C7] bg-white pl-8 pr-3 text-xs text-[#1F1A17]"
                      />
                    </div>
                  </div>

                  {filteredCreateProducts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#6E6259]">
                      No hay productos activos en catálogo.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#EFECE6] max-h-[360px] overflow-y-auto">
                      {filteredCreateProducts.map((p) => {
                        const generalStock = p.inventario ?? 0;
                        const qty = loadQuantities[p.id] || 0;
                        const exceedsStock = qty > generalStock;
                        return (
                          <div
                            key={p.id}
                            className={`px-4 py-3 flex items-center justify-between gap-3 ${
                              qty > 0 ? 'bg-[var(--theme-tint)]' : 'bg-white'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#1F1A17] truncate">
                                {p.nombre}
                              </p>
                              <p className="text-xs text-[#6E6259] tabular-nums">
                                Inv. general:{' '}
                                <strong
                                  className={
                                    generalStock === 0 ? 'text-red-700' : 'text-emerald-700'
                                  }
                                >
                                  {formatNumber(generalStock)}
                                </strong>{' '}
                                {p.unidad.toLowerCase()}
                                {exceedsStock && (
                                  <span className="ml-2 text-amber-700 font-semibold">
                                    (supera existencias)
                                  </span>
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setCreateQty(p.id, qty - 1)}
                                disabled={qty === 0}
                                className="h-9 w-9 rounded-lg border border-[#D8D1C7] bg-white text-sm font-bold text-[#49403A] disabled:opacity-35"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={qty || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  setCreateQty(p.id, parseInt(e.target.value, 10) || 0)
                                }
                                aria-label={`Cantidad a cargar de ${p.nombre}`}
                                className="w-16 h-9 rounded-lg border border-[#D8D1C7] bg-white text-center text-sm font-mono font-bold text-[#1F1A17] tabular-nums"
                              />
                              <button
                                type="button"
                                onClick={() => setCreateQty(p.id, qty + 1)}
                                className="h-9 w-9 rounded-lg bg-[var(--theme-primary)] text-white text-sm font-bold"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#6E6259]">
                  {totalLoadedPiecesCreate > 0
                    ? `Se descontarán ${formatNumber(totalLoadedPiecesCreate)} piezas del inventario general.`
                    : 'Puedes abrir la jornada sin carga inicial o seleccionar piezas arriba.'}
                </p>
                <div className="flex items-center gap-2">
                  {dataset.jornadas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMode('detalle')}
                      className="min-h-[44px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-xs font-semibold text-[#49403A]"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className="min-h-[44px] px-5 rounded-xl bg-[var(--theme-primary)] text-xs font-bold text-white hover:bg-[var(--theme-primary-hover)]"
                  >
                    Abrir jornada ahora
                  </button>
                </div>
              </div>
            </form>
          ) : !selectedJornada ? (
            <div className="rounded-2xl bg-white border border-[#E7E3DC] p-10 text-center space-y-3">
              <ClipboardList className="w-10 h-10 text-[#9E9187] mx-auto" />
              <h2 className="text-base font-bold text-[#1F1A17]">
                No has seleccionado ninguna jornada
              </h2>
              <p className="text-xs text-[#6E6259] max-w-md mx-auto">
                Abre una nueva jornada para asignar inventario de productos y capturar pedidos directamente en ella.
              </p>
              <button
                type="button"
                onClick={() => setMode('crear')}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-5 py-2 text-xs font-semibold text-white"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva jornada</span>
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Jornada Summary Card */}
              <div className="rounded-2xl bg-white border border-[#E7E3DC] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-[#1F1A17]">
                        {selectedJornada.nombre}
                      </h2>
                      <span
                        className={`text-xs font-bold ${
                          selectedJornada.estado === 'Abierta'
                            ? 'text-emerald-700'
                            : 'text-[#6E6259]'
                        }`}
                      >
                        · {selectedJornada.estado === 'Abierta' ? 'En curso (Abierta)' : 'Finalizada'}
                      </span>
                    </div>
                    <p className="text-xs text-[#6E6259] mt-1">
                      Fecha: {formatDateShort(selectedJornada.fecha)} · Ruta:{' '}
                      <strong>{selectedJornada.ruta}</strong>
                      {selectedJornada.notas ? ` · ${selectedJornada.notas}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {selectedJornada.estado === 'Abierta' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onCreateTicketInJornada(selectedJornada)}
                          className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-primary)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          <span>Crear ticket aquí</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditJornadaInventory(selectedJornada)}
                          className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)]"
                        >
                          <Package className="w-4 h-4 text-[var(--theme-accent)]" />
                          <span>Ajustar carga</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openFinalizeModal(selectedJornada)}
                          className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Finalizar jornada</span>
                        </button>
                      </>
                    )}
                    {selectedJornada.rowNumber && (
                      <button
                        type="button"
                        onClick={() => confirmDeleteJornada(selectedJornada)}
                        title="Eliminar jornada"
                        aria-label="Eliminar jornada"
                        className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-red-200 text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#EFECE6]">
                  <div>
                    <p className="text-[11px] font-medium text-[#6E6259]">Cargado inicial</p>
                    <p className="text-lg font-bold text-[#1F1A17] tabular-nums">
                      {formatNumber(
                        selectedInventoryRows.reduce((s, r) => s + r.cantidadInicial, 0)
                      )}{' '}
                      pzas
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-[#6E6259]">Vendido en ruta</p>
                    <p className="text-lg font-bold text-[var(--theme-primary)] tabular-nums">
                      {formatNumber(
                        selectedJornadaTickets.reduce((s, t) => s + t.totalPiezas, 0)
                      )}{' '}
                      pzas
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-[#6E6259]">
                      {selectedJornada.estado === 'Cerrada' ? 'Devuelto a bodega' : 'Sobrante actual'}
                    </p>
                    <p className="text-lg font-bold text-emerald-700 tabular-nums">
                      {formatNumber(
                        selectedJornada.estado === 'Cerrada'
                          ? selectedInventoryRows.reduce(
                              (s, r) => s + (r.cantidadDevuelta ?? r.calculadoRestante),
                              0
                            )
                          : selectedInventoryRows.reduce((s, r) => s + r.calculadoRestante, 0)
                      )}{' '}
                      pzas
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-[#6E6259]">Ventas brutas</p>
                    <p className="text-lg font-bold text-[#1F1A17] tabular-nums">
                      {formatCurrency(selectedCobranza.vendido)}
                    </p>
                  </div>
                </div>

                {/* Net Jornada Total & Expenses strip */}
                <div className="rounded-xl bg-[#FAF8F5] border border-[#EFECE6] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs tabular-nums">
                    <div>
                      <span className="text-[#6E6259]">Gastos en jornada: </span>
                      <strong className="text-[#B91C1C]">
                        -{formatCurrency(selectedTotalGastos)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#6E6259]">Total neto jornada: </span>
                      <strong
                        className={`text-sm ${
                          selectedTotalNetoJornada >= 0 ? 'text-emerald-700' : 'text-[#B91C1C]'
                        }`}
                      >
                        {formatCurrency(selectedTotalNetoJornada)}
                      </strong>
                    </div>
                  </div>
                  {onSaveEgreso && (
                    <button
                      type="button"
                      onClick={() => {
                        setGastoFecha(selectedJornada.fecha || getTodayISO());
                        setShowAddGastoForm((v) => !v);
                      }}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#D8D1C7] px-3 text-xs font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>{showAddGastoForm ? 'Cerrar gasto' : '+ Agregar gasto a jornada'}</span>
                    </button>
                  )}
                </div>

                {/* Cobranza breakdown strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#F4F1EB] text-xs">
                  <div className="flex items-center gap-1.5 text-[#6E6259]">
                    <Wallet className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                    <span>Cobranza de la jornada:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 tabular-nums">
                    <span className="text-emerald-700 font-semibold">
                      Cobrado: {formatCurrency(selectedCobranza.cobrado)}
                    </span>
                    <span
                      className={`font-bold ${
                        selectedCobranza.porCobrar > 0 ? 'text-red-700' : 'text-[#6E6259]'
                      }`}
                    >
                      Por cobrar: {formatCurrency(selectedCobranza.porCobrar)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Jornada Expenses Card */}
              <div className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#EFECE6] flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#1F1A17] flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-[#B91C1C]" />
                      <span>Gastos de esta jornada ({selectedJornadaEgresos.length})</span>
                    </h3>
                    <p className="text-xs text-[#6E6259] tabular-nums mt-0.5">
                      Total gastado: <strong className="text-[#B91C1C]">-{formatCurrency(selectedTotalGastos)}</strong> · Se restan del total de la jornada (en Egresos son solo visuales).
                    </p>
                  </div>
                  {onSaveEgreso && (
                    <button
                      type="button"
                      onClick={() => {
                        setGastoFecha(selectedJornada.fecha || getTodayISO());
                        setShowAddGastoForm((v) => !v);
                      }}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-tint)] border border-[#D8D1C7] px-3 text-xs font-bold text-[var(--theme-primary)] hover:opacity-90"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showAddGastoForm ? 'Cancelar' : 'Registrar gasto'}</span>
                    </button>
                  )}
                </div>

                {showAddGastoForm && onSaveEgreso && (
                  <form
                    onSubmit={handleAddGastoJornada}
                    className="p-4 bg-[#FAF8F5] border-b border-[#EFECE6] space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#6E6259] mb-1">
                          Fecha *
                        </label>
                        <input
                          type="date"
                          required
                          value={gastoFecha}
                          onChange={(e) => setGastoFecha(e.target.value)}
                          className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs text-[#1F1A17]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#6E6259] mb-1">
                          Categoría *
                        </label>
                        <select
                          value={gastoCategoria}
                          onChange={(e) => setGastoCategoria(e.target.value)}
                          className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs text-[#1F1A17]"
                        >
                          {['Gasolina', 'Insumos', 'Comida / Viáticos', 'Materia prima', 'Mantenimiento', 'Otros'].map(
                            (cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#6E6259] mb-1">
                          Monto ($) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={gastoMonto}
                          onChange={(e) => setGastoMonto(e.target.value)}
                          placeholder="0.00"
                          className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs font-mono font-bold text-[#1F1A17]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        required
                        value={gastoConcepto}
                        onChange={(e) => setGastoConcepto(e.target.value)}
                        placeholder="Concepto del gasto (ej. Gasolina ruta, casetas, comida)..."
                        className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs text-[#1F1A17]"
                      />
                      <input
                        type="text"
                        value={gastoNotas}
                        onChange={(e) => setGastoNotas(e.target.value)}
                        placeholder="Notas (opcional)..."
                        className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs text-[#1F1A17]"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddGastoForm(false)}
                        className="min-h-[38px] px-3 rounded-xl border border-[#D8D1C7] bg-white text-xs font-semibold text-[#49403A]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="min-h-[38px] px-4 rounded-xl bg-[var(--theme-primary)] text-xs font-bold text-white hover:bg-[var(--theme-primary-hover)]"
                      >
                        Guardar gasto en jornada
                      </button>
                    </div>
                  </form>
                )}

                {selectedJornadaEgresos.length === 0 ? (
                  <div className="p-5 text-center text-xs text-[#8C7E73]">
                    No hay gastos registrados en esta jornada.
                  </div>
                ) : (
                  <div className="divide-y divide-[#EFECE6]">
                    {selectedJornadaEgresos.map((eg) => (
                      <div
                        key={eg.id}
                        className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#1F1A17] truncate">
                            {eg.concepto}
                          </p>
                          <p className="text-[#6E6259] mt-0.5">
                            {formatDateShort(eg.fecha)} · {eg.categoria}
                            {eg.notas ? ` · ${eg.notas}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-sm font-bold text-[#B91C1C] tabular-nums mr-1">
                            -{formatCurrency(eg.monto)}
                          </span>
                          {eg.rowNumber && onUpdateEgreso && (
                            <button
                              type="button"
                              onClick={() => openEditGastoModal(eg)}
                              title={`Editar gasto ${eg.concepto}`}
                              aria-label={`Editar gasto ${eg.concepto}`}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#6E6259] hover:text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {eg.rowNumber && onDeleteEgreso && (
                            <button
                              type="button"
                              onClick={() => confirmDeleteGastoJornada(eg)}
                              title={`Eliminar gasto ${eg.concepto}`}
                              aria-label={`Eliminar gasto ${eg.concepto}`}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Inventory Breakdown Table */}
              <div className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#EFECE6] flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#1F1A17]">
                    Control de inventario de la jornada
                  </h3>
                </div>
                {selectedInventoryRows.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#6E6259]">
                    No se cargó inventario previo en esta jornada.
                    {selectedJornada.estado === 'Abierta' &&
                      ' Puedes usar "Ajustar carga" para asignar piezas.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FAF8F5] border-b border-[#EFECE6] text-xs font-semibold text-[#6E6259]">
                          <th className="py-2.5 px-4">Producto</th>
                          <th className="py-2.5 px-3 text-right">Cargado</th>
                          <th className="py-2.5 px-3 text-right">Vendido</th>
                          <th className="py-2.5 px-4 text-right">
                            {selectedJornada.estado === 'Cerrada' ? 'Devuelto' : 'Restante'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFECE6] text-sm">
                        {selectedInventoryRows.map((row, idx) => {
                          const displayRestante =
                            selectedJornada.estado === 'Cerrada' &&
                            row.cantidadDevuelta !== undefined
                              ? row.cantidadDevuelta
                              : row.calculadoRestante;
                          const oversold =
                            row.cantidadInicial > 0 && row.vendido > row.cantidadInicial;
                          return (
                            <tr key={`${row.productoId}-${idx}`}>
                              <td className="py-2.5 px-4 font-semibold text-[#1F1A17]">
                                {row.productoNombre}
                                {oversold && (
                                  <span className="ml-2 text-[11px] font-semibold text-amber-700">
                                    (vendido supera carga)
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-[#6E6259]">
                                {formatNumber(row.cantidadInicial)}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-[var(--theme-primary)]">
                                {formatNumber(row.vendido)}
                              </td>
                              <td className="py-2.5 px-4 text-right tabular-nums font-bold text-emerald-700">
                                {formatNumber(displayRestante)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Saved Conciliación summary on closed jornadas */}
              {selectedJornada.estado === 'Cerrada' &&
                selectedJornada.conciliacion &&
                selectedJornada.conciliacion.some((c) => c.diferencia !== 0) && (
                  <div className="rounded-2xl bg-white border border-amber-200 overflow-hidden">
                    <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                      <h3 className="text-sm font-bold text-amber-950">
                        Conciliación de cierre (diferencias registradas)
                      </h3>
                    </div>
                    <div className="divide-y divide-[#EFECE6]">
                      {selectedJornada.conciliacion
                        .filter((c) => c.diferencia !== 0)
                        .map((c, idx) => (
                          <div
                            key={`${c.productoId}-${idx}`}
                            className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <p className="font-bold text-[#1F1A17]">{c.productoNombre}</p>
                              <p className="text-[#6E6259] tabular-nums">
                                Esperado: {c.esperado} · Devuelto: {c.devuelto} · Motivo:{' '}
                                <strong>{c.motivo}</strong>
                                {c.notas ? ` · ${c.notas}` : ''}
                              </p>
                            </div>
                            <span
                              className={`font-mono font-bold tabular-nums ${
                                c.diferencia < 0 ? 'text-red-700' : 'text-emerald-700'
                              }`}
                            >
                              {c.diferencia > 0 ? `+${c.diferencia}` : c.diferencia} pzas
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              {/* Route Visit Checklist & Quick Actions */}
              <div className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#EFECE6] flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#1F1A17]">
                      Checklist de visitas · {selectedJornada.ruta} ({selectedVisitRows.length} clientes)
                    </h3>
                    <p className="text-xs text-[#6E6259]">
                      Visitados / con pedido:{' '}
                      <strong>
                        {selectedVisitRows.filter((r) => r.estado !== 'Pendiente').length}
                      </strong>{' '}
                      de {selectedVisitRows.length}
                    </p>
                  </div>
                  {selectedVisitRows.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveVisitasChecklist}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar visitas</span>
                    </button>
                  )}
                </div>

                {selectedVisitRows.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#6E6259]">
                    No hay clientes registrados en la ruta &ldquo;{selectedJornada.ruta}&rdquo;.
                  </div>
                ) : (
                  <div className="divide-y divide-[#EFECE6] max-h-[360px] overflow-y-auto">
                    {selectedVisitRows.map(({ cliente, hasOrder, estado, notas: vNotas, draftKey }) => {
                      const digits = sanitizePhoneDigits(cliente.telefono);
                      const inactivity = getClientInactivityInfo(cliente, dataset.tickets);
                      return (
                        <div
                          key={cliente.id}
                          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {hasOrder ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Con pedido</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVisitDrafts((prev) => ({
                                      ...prev,
                                      [draftKey]: {
                                        ...prev[draftKey],
                                        estado: estado === 'Visitado' ? 'Pendiente' : 'Visitado',
                                      },
                                    }))
                                  }
                                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold transition-colors ${
                                    estado === 'Visitado'
                                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                                      : 'bg-[#FAF8F5] border-[#D8D1C7] text-[#6E6259]'
                                  }`}
                                >
                                  {estado === 'Visitado' ? (
                                    <CheckSquare className="w-3 h-3" />
                                  ) : (
                                    <Square className="w-3 h-3" />
                                  )}
                                  <span>{estado}</span>
                                </button>
                              )}
                              <p className="text-sm font-bold text-[#1F1A17] truncate">
                                {cliente.nombre}
                              </p>
                              {!hasOrder &&
                                inactivity.isInactiveOver15Days &&
                                inactivity.daysSinceLastPurchase !== null && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                    <AlertTriangle className="w-3 h-3 text-amber-700" />
                                    <span>{inactivity.daysSinceLastPurchase}d sin compra</span>
                                  </span>
                                )}
                            </div>
                            <input
                              type="text"
                              value={vNotas}
                              onChange={(e) =>
                                setVisitDrafts((prev) => ({
                                  ...prev,
                                  [draftKey]: {
                                    ...prev[draftKey],
                                    notas: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Nota de visita (ej. cerrado, vuelve el viernes)..."
                              className="w-full h-8 rounded-lg border border-[#E7E3DC] bg-[#FAF8F5] px-2.5 text-xs text-[#1F1A17] focus:bg-white focus:outline-none focus:border-[var(--theme-primary)]"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {digits && (
                              <>
                                <a
                                  href={`tel:${digits}`}
                                  title={`Llamar a ${cliente.nombre}`}
                                  className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-[#D8D1C7] text-[#1F1A17] hover:bg-[var(--theme-tint)]"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                                <a
                                  href={buildWhatsAppClientUrl(cliente.telefono)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`WhatsApp a ${cliente.nombre}`}
                                  className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              </>
                            )}
                            {cliente.direccion && (
                              <a
                                href={buildGoogleMapsUrl(cliente.direccion)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Abrir dirección de ${cliente.nombre} en Google Maps`}
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-[#D8D1C7] text-[var(--theme-accent)] hover:bg-[var(--theme-tint)]"
                              >
                                <Navigation className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {selectedJornada.estado === 'Abierta' && (
                              <button
                                type="button"
                                onClick={() => onCreateTicketInJornada(selectedJornada)}
                                className="min-h-[34px] inline-flex items-center gap-1 rounded-lg bg-[var(--theme-tint)] px-2.5 text-xs font-semibold text-[var(--theme-primary)] hover:opacity-90"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                                <span>Pedido</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tickets in this Jornada */}
              <div className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#EFECE6] flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#1F1A17]">
                    Tickets en esta jornada ({selectedJornadaTickets.length})
                  </h3>
                  {selectedJornada.estado === 'Abierta' && unassignedTickets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAttachTickets((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-accent)] hover:underline"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>
                        {showAttachTickets
                          ? 'Ocultar tickets sin jornada'
                          : `Vincular tickets sin jornada (${unassignedTickets.length})`}
                      </span>
                    </button>
                  )}
                </div>

                {showAttachTickets && selectedJornada.estado === 'Abierta' && (
                  <div className="p-4 bg-[#FAF8F5] border-b border-[#EFECE6] space-y-2">
                    <p className="text-xs font-semibold text-[#49403A]">
                      Tickets sin jornada asignada (haz clic para agregar a esta jornada):
                    </p>
                    <div className="max-h-48 overflow-y-auto divide-y divide-[#EFECE6] rounded-xl border border-[#E7E3DC] bg-white">
                      {unassignedTickets.map((t) => (
                        <div
                          key={t.folio}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-[var(--theme-primary)] mr-2">
                              {t.folio}
                            </span>
                            <span className="font-semibold text-[#1F1A17]">{t.clienteNombre}</span>
                            <span className="text-[#6E6259] ml-2">
                              ({formatDateShort(t.fecha)} · {t.ruta})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAttachTicketToSelected(t)}
                            className="min-h-[34px] px-3 rounded-lg bg-[var(--theme-primary)] text-white font-semibold shrink-0"
                          >
                            + Vincular ({formatCurrency(t.totalImporte)})
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedJornadaTickets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#6E6259]">
                    Todavía no hay tickets asignados a esta jornada. Crea un pedido desde &ldquo;Crear ticket aquí&rdquo; o elige esta jornada en Nuevo pedido.
                  </div>
                ) : (
                  <div className="divide-y divide-[#EFECE6]">
                    {selectedJornadaTickets.map((t) => {
                      const pay = getTicketPaymentSummary(t);
                      return (
                      <div
                        key={t.folio}
                        className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-[#1F1A17] truncate">
                              <span className="font-mono text-[var(--theme-primary)] mr-2">
                                {t.folio}
                              </span>
                              {t.clienteNombre}
                            </p>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                pay.estadoPago === 'Pagado'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : pay.estadoPago === 'Parcial'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}
                            >
                              {pay.estadoPago}
                              {pay.saldoPendiente > 0
                                ? ` · Debe ${formatCurrency(pay.saldoPendiente)}`
                                : ''}
                            </span>
                          </div>
                          <p className="text-xs text-[#6E6259] mt-0.5 tabular-nums">
                            {formatDateShort(t.fecha)} · {formatNumber(t.totalPiezas)} pzas ·{' '}
                            <strong className="text-[#1F1A17]">
                              {formatCurrency(t.totalImporte)}
                            </strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onViewTicket(t, false)}
                            className="min-h-[38px] inline-flex items-center gap-1 rounded-lg border border-[#D8D1C7] px-2.5 text-xs font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver ticket</span>
                          </button>
                          {t.rowNumber && (
                            <>
                              <button
                                type="button"
                                onClick={() => onViewTicket(t, true)}
                                aria-label={`Editar ticket ${t.folio}`}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#6E6259] hover:bg-[var(--theme-tint)]"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => confirmDeleteTicket(t)}
                                aria-label={`Eliminar ticket ${t.folio}`}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modal: Edit Open Jornada Inventory */}
      {editingInvJornada && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveEditedJornadaInventory}
            className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <div>
                <h3 className="text-lg font-bold text-[#1F1A17]">
                  Ajustar inventario de jornada
                </h3>
                <p className="text-xs text-[#6E6259]">
                  {editingInvJornada.nombre} · La diferencia se ajusta automáticamente en el inventario general.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvJornada(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-[#EFECE6] bg-[#FAF8F5]">
              <div className="relative">
                <Search className="w-4 h-4 text-[#8C7E73] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={editInvSearch}
                  onChange={(e) => setEditInvSearch(e.target.value)}
                  placeholder="Filtrar producto..."
                  className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white pl-9 pr-3 text-sm text-[#1F1A17]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#EFECE6] px-6">
              {activeProducts
                .filter(
                  (p) =>
                    !editInvSearch ||
                    normalizeText(p.nombre).includes(normalizeText(editInvSearch))
                )
                .map((p) => {
                  const prevLoaded =
                    editingInvJornada.inventario.find((i) => i.productoId === p.id)
                      ?.cantidadInicial || 0;
                  const nextQty = editInvQuantities[p.id] || 0;
                  const availableIfZero = (p.inventario ?? 0) + prevLoaded;
                  return (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1F1A17] truncate">
                          {p.nombre}
                        </p>
                        <p className="text-xs text-[#6E6259] tabular-nums">
                          Bodega: {formatNumber(p.inventario ?? 0)} · Máx. disponible:{' '}
                          {formatNumber(availableIfZero)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setEditInvQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.max(0, nextQty - 1),
                            }))
                          }
                          className="h-9 w-9 rounded-lg border border-[#D8D1C7] text-sm font-bold text-[#49403A]"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={nextQty}
                          onChange={(e) =>
                            setEditInvQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            }))
                          }
                          className="w-16 h-9 rounded-lg border border-[#D8D1C7] text-center text-sm font-mono font-bold text-[#1F1A17] tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditInvQuantities((prev) => ({
                              ...prev,
                              [p.id]: nextQty + 1,
                            }))
                          }
                          className="h-9 w-9 rounded-lg bg-[var(--theme-primary)] text-white text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingInvJornada(null)}
                className="min-h-[44px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-sm font-semibold text-[#49403A]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[var(--theme-primary)] text-sm font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Finalize Jornada & Return Remaining Stock */}
      {finalizingJornada && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleConfirmFinalize}
            className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <div>
                <h3 className="text-lg font-bold text-[#1F1A17]">Finalizar jornada</h3>
                <p className="text-xs text-[#6E6259]">
                  Confirma las piezas sobrantes que regresan al inventario general de Productos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFinalizingJornada(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {finalizingJornada.inventario.length === 0 ? (
                <div className="rounded-xl bg-[#FAF8F5] border border-[#E7E3DC] p-4 text-sm text-[#49403A]">
                  Esta jornada no tiene inventario inicial cargado. Al finalizar pasará a estado{' '}
                  <strong>Cerrada</strong> con los tickets registrados.
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <span>
                      Calculamos automáticamente <strong>Cargado − Vendido</strong>. Puedes ajustar cualquier cantidad antes de confirmar si hubo merma o conteo físico diferente.
                    </span>
                  </div>

                  <div className="divide-y divide-[#EFECE6] border border-[#E7E3DC] rounded-xl overflow-hidden">
                    {finalizingJornada.inventario.map((it) => {
                      const tickets = getJornadaTickets(finalizingJornada);
                      const { byId, byName } = computeSoldByProduct(tickets);
                      const sold =
                        (it.productoId && byId.get(it.productoId)) ||
                        byName.get(normalizeText(it.productoNombre)) ||
                        0;
                      const key = it.productoId || it.productoNombre;
                      const calc = Math.max(0, it.cantidadInicial - sold);
                      const val = returnQuantities[key] ?? calc;
                      const diff = val - calc;
                      const defaultMotivo: JornadaConciliacionMotivo =
                        diff < 0 ? 'Faltante' : diff > 0 ? 'Sobrante' : 'Sin novedad';
                      const motivoVal = returnMotivos[key] || defaultMotivo;
                      return (
                        <div key={key} className="p-3.5 bg-white space-y-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-[#1F1A17] truncate">
                                {it.productoNombre}
                              </p>
                              <p className="text-xs text-[#6E6259] tabular-nums">
                                Cargado: {formatNumber(it.cantidadInicial)} · Vendido:{' '}
                                {formatNumber(sold)} · Esperado: {formatNumber(calc)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <label className="text-xs font-semibold text-[#6E6259]">
                                Devuelto:
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={val}
                                onChange={(e) =>
                                  setReturnQuantities((prev) => ({
                                    ...prev,
                                    [key]: Math.max(0, parseInt(e.target.value, 10) || 0),
                                  }))
                                }
                                className="w-20 h-10 rounded-xl border border-[#D8D1C7] text-center text-sm font-mono font-bold text-emerald-700 tabular-nums"
                              />
                              {val !== calc && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReturnQuantities((prev) => ({ ...prev, [key]: calc }))
                                  }
                                  title="Restaurar cálculo automático"
                                  className="p-1.5 text-[#8C7E73] hover:text-[var(--theme-primary)]"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {diff !== 0 && (
                            <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                              <div className="sm:col-span-4 text-xs font-bold tabular-nums">
                                <span className={diff < 0 ? 'text-red-700' : 'text-blue-700'}>
                                  Diferencia: {diff > 0 ? `+${diff}` : diff} pza(s)
                                </span>
                              </div>
                              <div className="sm:col-span-4">
                                <select
                                  value={motivoVal}
                                  onChange={(e) =>
                                    setReturnMotivos((prev) => ({
                                      ...prev,
                                      [key]: e.target.value as JornadaConciliacionMotivo,
                                    }))
                                  }
                                  className="w-full h-8 rounded-lg border border-[#D8D1C7] bg-white px-2 text-xs font-semibold text-[#1F1A17]"
                                >
                                  {diff < 0 ? (
                                    <>
                                      <option value="Faltante">Faltante</option>
                                      <option value="Merma">Merma / Dañado</option>
                                      <option value="Cortesía">Cortesía / Degustación</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="Sobrante">Sobrante</option>
                                      <option value="Sin novedad">Sin novedad</option>
                                    </>
                                  )}
                                </select>
                              </div>
                              <div className="sm:col-span-4">
                                <input
                                  type="text"
                                  value={returnNotas[key] || ''}
                                  onChange={(e) =>
                                    setReturnNotas((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  placeholder="Nota opcional..."
                                  className="w-full h-8 rounded-lg border border-[#D8D1C7] bg-white px-2 text-xs text-[#1F1A17]"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                Total a regresar:{' '}
                {formatNumber(
                  Object.values(returnQuantities).reduce((s, v) => s + (v || 0), 0)
                )}{' '}
                pzas
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFinalizingJornada(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-xs font-semibold text-[#49403A]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-5 rounded-xl bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Finalizar y actualizar inventario</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Jornada Gasto */}
      {editingGasto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveEditGasto}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <div>
                <h3 className="text-lg font-bold text-[#1F1A17]">Editar gasto de jornada</h3>
                <p className="text-xs text-[#6E6259]">
                  Se actualizará en la jornada y de forma visual en Egresos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingGasto(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={editGastoFecha}
                    onChange={(e) => setEditGastoFecha(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                    Categoría *
                  </label>
                  <select
                    value={editGastoCategoria}
                    onChange={(e) => setEditGastoCategoria(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                  >
                    {[
                      'Gasolina',
                      'Insumos',
                      'Comida / Viáticos',
                      'Materia prima',
                      'Mantenimiento',
                      'Otros',
                    ].map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Concepto *
                </label>
                <input
                  type="text"
                  required
                  value={editGastoConcepto}
                  onChange={(e) => setEditGastoConcepto(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Monto ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editGastoMonto}
                  onChange={(e) => setEditGastoMonto(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-mono text-[#1F1A17]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Notas</label>
                <input
                  type="text"
                  value={editGastoNotas}
                  onChange={(e) => setEditGastoNotas(e.target.value)}
                  placeholder="Opcional..."
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingGasto(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-xs font-semibold text-[#49403A]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-[var(--theme-primary)] text-xs font-bold text-white hover:bg-[var(--theme-primary-hover)]"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
