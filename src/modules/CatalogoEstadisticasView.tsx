import React, { useMemo, useState } from 'react';
import {
  Package,
  Plus,
  Edit2,
  Trophy,
  Search,
  X,
  Trash2,
  Boxes,
  AlertTriangle,
  History,
} from 'lucide-react';
import {
  BusinessDataset,
  MovimientoInventario,
  MovimientoInventarioTipo,
  Producto,
} from '../types/business';
import {
  formatCurrency,
  formatDateShort,
  formatNumber,
  getTodayISO,
  normalizeText,
} from '../utils/formatters';
import { getTicketItemSalesStatsDelta } from '../utils/ticketAdjustments';
import { PendingMutation } from '../components/ConfirmMutationModal';

interface CatalogoEstadisticasViewProps {
  dataset: BusinessDataset;
  productosTabName: string;
  movimientosTabName: string;
  onRequestMutation: (mutation: PendingMutation) => void;
  onCreateProducto: (prod: Omit<Producto, 'id'>) => Promise<void>;
  onUpdateProducto: (prod: Producto) => Promise<void>;
  onDeleteProducto: (prod: Producto) => Promise<void>;
  onAdjustInventarioBatch: (
    deltas: { productoId: string; productoNombre: string; delta: number }[],
    summaryLabel: string,
    options?: {
      tipo?: MovimientoInventarioTipo;
      referencia?: string;
      notas?: string;
    }
  ) => Promise<void>;
  onCreateMovimientosInventario: (
    items: Omit<MovimientoInventario, 'id'>[],
    applyStockDelta: boolean
  ) => Promise<void>;
}

const MOVIMIENTO_TIPOS_FILTRO: MovimientoInventarioTipo[] = [
  'Entrada producción',
  'Compra',
  'Ajuste manual',
  'Merma',
  'Cortesía',
  'Devolución cliente',
  'Cambio cliente',
  'Venta directa',
  'Carga jornada',
  'Devolución jornada',
  'Faltante jornada',
];

export const CatalogoEstadisticasView: React.FC<CatalogoEstadisticasViewProps> = ({
  dataset,
  productosTabName,
  movimientosTabName,
  onRequestMutation,
  onCreateProducto,
  onUpdateProducto,
  onDeleteProducto,
  onAdjustInventarioBatch,
  onCreateMovimientosInventario,
}) => {
  const [activeTab, setActiveTab] = useState<'catalogo' | 'kardex' | 'estadisticas'>('catalogo');
  const [searchQuery, setSearchQuery] = useState('');

  // Form modal for add/edit product
  const [showModal, setShowModal] = useState(false);
  const [editingProd, setEditingProd] = useState<Producto | null>(null);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Dulce típico');
  const [unidad, setUnidad] = useState('Pieza');
  const [precioMayoreo, setPrecioMayoreo] = useState('');
  const [precioMenudeo, setPrecioMenudeo] = useState('');
  const [inventario, setInventario] = useState('0');
  const [editInvMode, setEditInvMode] = useState<'sumar' | 'fijar'>('sumar');
  const [activo, setActivo] = useState(true);

  // Bulk stock adjustment modal ('sumar' adds to current stock, 'fijar' sets exact total)
  const [showBulkStockModal, setShowBulkStockModal] = useState(false);
  const [bulkMode, setBulkMode] = useState<'sumar' | 'fijar'>('sumar');
  const [bulkTipo, setBulkTipo] = useState<MovimientoInventarioTipo>('Entrada producción');
  const [bulkNota, setBulkNota] = useState('');
  const [bulkStockValues, setBulkStockValues] = useState<Record<string, string>>({});

  // Kardex filters & registration modal
  const [kardexSearch, setKardexSearch] = useState('');
  const [kardexTipoFilter, setKardexTipoFilter] = useState<string>('Todos');
  const [showMovModal, setShowMovModal] = useState(false);
  const [movProdId, setMovProdId] = useState('');
  const [movTipo, setMovTipo] = useState<MovimientoInventarioTipo>('Entrada producción');
  const [movSign, setMovSign] = useState<1 | -1>(1);
  const [movCantidad, setMovCantidad] = useState('');
  const [movFecha, setMovFecha] = useState(getTodayISO());
  const [movReferencia, setMovReferencia] = useState('');
  const [movNotas, setMovNotas] = useState('');
  const [movApplyStock, setMovApplyStock] = useState(true);

  // Top 10 filter by route + optional product
  const [selectedRutaStats, setSelectedRutaStats] = useState<string>(
    dataset.rutas[0]?.nombre || 'Todas'
  );
  const [selectedProdFilter, setSelectedProdFilter] = useState<string>('Todos');

  const filteredKardex = useMemo(() => {
    const q = normalizeText(kardexSearch);
    return [...(dataset.movimientosInventario || [])]
      .reverse()
      .filter((m) => {
        if (kardexTipoFilter !== 'Todos' && m.tipo !== kardexTipoFilter) return false;
        if (!q) return true;
        return (
          normalizeText(m.productoNombre).includes(q) ||
          normalizeText(m.referencia).includes(q) ||
          normalizeText(m.notas).includes(q)
        );
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [dataset.movimientosInventario, kardexSearch, kardexTipoFilter]);

  const inventorySummary = useMemo(() => {
    const totalPiezas = dataset.productos.reduce((s, p) => s + (p.inventario || 0), 0);
    const lowStockCount = dataset.productos.filter((p) => p.activo && (p.inventario || 0) <= 5).length;
    return { totalPiezas, lowStockCount };
  }, [dataset.productos]);

  const filteredProducts = useMemo(() => {
    const q = normalizeText(searchQuery);
    return dataset.productos.filter((p) => {
      if (!q) return true;
      return (
        normalizeText(p.nombre).includes(q) || normalizeText(p.categoria).includes(q)
      );
    });
  }, [dataset.productos, searchQuery]);

  // Sales statistics per product
  const productStats = useMemo(() => {
    const stats = new Map<
      string,
      { nombre: string; piezas: number; ingresos: number; tickets: number }
    >();
    dataset.productos.forEach((p) => {
      stats.set(normalizeText(p.nombre), {
        nombre: p.nombre,
        piezas: 0,
        ingresos: 0,
        tickets: 0,
      });
    });

    for (const t of dataset.tickets) {
      const seenInTicket = new Set<string>();
      for (const it of t.items) {
        const delta = getTicketItemSalesStatsDelta(it);
        const key = normalizeText(it.productoNombre);
        const curr = stats.get(key) || {
          nombre: it.productoNombre,
          piezas: 0,
          ingresos: 0,
          tickets: 0,
        };
        curr.piezas += delta.piezasVendidas;
        curr.ingresos += delta.importe;
        if (!seenInTicket.has(key)) {
          curr.tickets += 1;
          seenInTicket.add(key);
        }
        stats.set(key, curr);
      }
    }

    return Array.from(stats.values()).sort((a, b) => b.piezas - a.piezas);
  }, [dataset.productos, dataset.tickets]);

  // Top 10 clients with highest consumption by route (and optional product)
  const top10ClientsByRoute = useMemo(() => {
    const map = new Map<
      string,
      { clienteNombre: string; ruta: string; piezas: number; importe: number; tickets: number }
    >();

    for (const t of dataset.tickets) {
      if (
        selectedRutaStats !== 'Todas' &&
        normalizeText(t.ruta) !== normalizeText(selectedRutaStats)
      ) {
        continue;
      }

      let ticketPieces = t.totalPiezas;
      let ticketAmount = t.totalImporte;

      if (selectedProdFilter !== 'Todos') {
        const matchedItems = t.items.filter(
          (it) => normalizeText(it.productoNombre) === normalizeText(selectedProdFilter)
        );
        if (matchedItems.length === 0) continue;
        ticketPieces = matchedItems.reduce(
          (s, it) => s + getTicketItemSalesStatsDelta(it).piezasVendidas,
          0
        );
        ticketAmount = matchedItems.reduce(
          (s, it) => s + getTicketItemSalesStatsDelta(it).importe,
          0
        );
      }

      const key = `${normalizeText(t.clienteNombre)}::${normalizeText(t.ruta)}`;
      const curr = map.get(key) || {
        clienteNombre: t.clienteNombre,
        ruta: t.ruta,
        piezas: 0,
        importe: 0,
        tickets: 0,
      };
      curr.piezas += ticketPieces;
      curr.importe += ticketAmount;
      curr.tickets += 1;
      map.set(key, curr);
    }

    return Array.from(map.values())
      .sort((a, b) => b.piezas - a.piezas || b.importe - a.importe)
      .slice(0, 10);
  }, [dataset.tickets, selectedRutaStats, selectedProdFilter]);

  const openNewModal = () => {
    setEditingProd(null);
    setNombre('');
    setCategoria('Dulce típico');
    setUnidad('Pieza');
    setPrecioMayoreo('');
    setPrecioMenudeo('');
    setInventario('0');
    setEditInvMode('fijar');
    setActivo(true);
    setShowModal(true);
  };

  const openEditModal = (prod: Producto) => {
    setEditingProd(prod);
    setNombre(prod.nombre);
    setCategoria(prod.categoria);
    setUnidad(prod.unidad);
    setPrecioMayoreo(String(prod.precioMayoreo));
    setPrecioMenudeo(String(prod.precioMenudeo));
    setEditInvMode('sumar');
    setInventario('0');
    setActivo(prod.activo);
    setShowModal(true);
  };

  const openBulkStockModal = (initialMode: 'sumar' | 'fijar' = 'sumar') => {
    const initial: Record<string, string> = {};
    dataset.productos.forEach((p) => {
      initial[p.id] = initialMode === 'sumar' ? '' : String(p.inventario ?? 0);
    });
    setBulkMode(initialMode);
    setBulkTipo(initialMode === 'sumar' ? 'Entrada producción' : 'Ajuste manual');
    setBulkNota('');
    setBulkStockValues(initial);
    setShowBulkStockModal(true);
  };

  const handleSwitchBulkMode = (nextMode: 'sumar' | 'fijar') => {
    if (nextMode === bulkMode) return;
    const nextValues: Record<string, string> = {};
    dataset.productos.forEach((p) => {
      nextValues[p.id] = nextMode === 'sumar' ? '' : String(p.inventario ?? 0);
    });
    setBulkMode(nextMode);
    setBulkTipo(nextMode === 'sumar' ? 'Entrada producción' : 'Ajuste manual');
    setBulkStockValues(nextValues);
  };

  const handleSaveBulkStock = (e: React.FormEvent) => {
    e.preventDefault();
    const changes: { prod: Producto; prevInv: number; nextInv: number; delta: number }[] = [];
    for (const p of dataset.productos) {
      const prevInv = p.inventario ?? 0;
      if (bulkMode === 'sumar') {
        const added = Math.max(0, parseInt(bulkStockValues[p.id] || '0', 10) || 0);
        if (added > 0) {
          changes.push({
            prod: p,
            prevInv,
            nextInv: prevInv + added,
            delta: added,
          });
        }
      } else {
        const parsed = Math.max(
          0,
          parseInt(bulkStockValues[p.id] ?? String(prevInv), 10) || 0
        );
        if (parsed !== prevInv) {
          changes.push({
            prod: p,
            prevInv,
            nextInv: parsed,
            delta: parsed - prevInv,
          });
        }
      }
    }
    if (changes.length === 0) {
      setShowBulkStockModal(false);
      return;
    }

    const totalAdded = changes.reduce((s, c) => s + c.delta, 0);
    const summaryLabel =
      bulkMode === 'sumar'
        ? `Entrada producción (+${formatNumber(totalAdded)} pzas en ${changes.length} prod.)`
        : `Conteo físico (${changes.length} prod.)`;

    onRequestMutation({
      title:
        bulkMode === 'sumar'
          ? 'Sumar producción al inventario'
          : 'Actualizar inventario por conteo físico',
      description:
        bulkMode === 'sumar'
          ? `Se sumarán nuevas piezas a las existencias actuales de ${changes.length} producto(s) y se registrará la entrada en Kardex.`
          : `Se actualizarán las existencias de ${changes.length} producto(s) en la hoja de Productos en Google Sheets.`,
      sheetTab: `${productosTabName} y ${movimientosTabName}`,
      details: changes.slice(0, 5).map((c) => ({
        label: c.prod.nombre,
        value:
          bulkMode === 'sumar'
            ? `${formatNumber(c.prevInv)} + ${formatNumber(c.delta)} → ${formatNumber(c.nextInv)} pzas`
            : `${formatNumber(c.prevInv)} → ${formatNumber(c.nextInv)} pzas`,
      })),
      confirmLabel: bulkMode === 'sumar' ? 'Sumar al inventario' : 'Guardar conteo',
      onConfirm: async () => {
        await onAdjustInventarioBatch(
          changes.map((c) => ({
            productoId: c.prod.id,
            productoNombre: c.prod.nombre,
            delta: c.delta,
          })),
          summaryLabel,
          {
            tipo: bulkMode === 'sumar' ? bulkTipo : 'Ajuste manual',
            referencia: bulkMode === 'sumar' ? bulkTipo : 'Conteo físico',
            notas:
              bulkNota.trim() ||
              (bulkMode === 'sumar' ? 'Suma a inventario existente' : 'Ajuste por conteo directo'),
          }
        );
        setShowBulkStockModal(false);
      },
    });
  };

  const openMovModal = (preselectedProdId?: string) => {
    setMovProdId(preselectedProdId || dataset.productos[0]?.id || '');
    setMovTipo('Entrada producción');
    setMovSign(1);
    setMovCantidad('');
    setMovFecha(getTodayISO());
    setMovReferencia('');
    setMovNotas('');
    setMovApplyStock(true);
    setShowMovModal(true);
  };

  const handleSaveMovimiento = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = dataset.productos.find((p) => p.id === movProdId);
    const qty = Math.abs(parseInt(movCantidad, 10) || 0);
    if (!prod || qty <= 0) return;

    let delta = qty;
    if (movTipo === 'Merma' || movTipo === 'Cortesía') {
      delta = -qty;
    } else if (movTipo === 'Ajuste manual') {
      delta = movSign * qty;
    }

    const nextStock = movApplyStock ? Math.max(0, (prod.inventario ?? 0) + delta) : prod.inventario ?? 0;

    onRequestMutation({
      title: `Registrar ${movTipo.toLowerCase()}`,
      description: movApplyStock
        ? `Se guardará el movimiento en "${movimientosTabName}" y se ajustará el inventario general de ${prod.nombre}.`
        : `Se guardará el movimiento histórico en "${movimientosTabName}" sin modificar existencias.`,
      sheetTab: movApplyStock ? `${movimientosTabName} y ${productosTabName}` : movimientosTabName,
      details: [
        { label: 'Producto', value: prod.nombre },
        { label: 'Tipo', value: movTipo },
        { label: 'Cantidad', value: `${delta > 0 ? `+${delta}` : delta} pzas` },
        { label: 'Stock resultante', value: `${formatNumber(nextStock)} pzas` },
      ],
      confirmLabel: 'Registrar movimiento',
      onConfirm: async () => {
        await onCreateMovimientosInventario(
          [
            {
              fecha: movFecha,
              tipo: movTipo,
              productoId: prod.id,
              productoNombre: prod.nombre,
              cantidadDelta: delta,
              stockResultante: nextStock,
              referencia: movReferencia.trim() || movTipo,
              notas: movNotas.trim(),
            },
          ],
          movApplyStock
        );
        setShowMovModal(false);
      },
    });
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const mayoreoNum = parseFloat(precioMayoreo) || 0;
    const menudeoNum = parseFloat(precioMenudeo) || 0;
    const rawInvNum = Math.max(0, parseInt(inventario, 10) || 0);
    if (!nombre.trim()) return;

    if (editingProd) {
      const currentInv = editingProd.inventario ?? 0;
      const finalInventario =
        editInvMode === 'sumar' ? currentInv + rawInvNum : rawInvNum;
      onRequestMutation({
        title: 'Actualizar producto',
        description: 'Se actualizarán los datos, precios e inventario de este producto en Google Sheets.',
        sheetTab: productosTabName,
        details: [
          { label: 'Producto', value: nombre.trim() },
          { label: 'Precio Mayoreo', value: formatCurrency(mayoreoNum) },
          { label: 'Precio Menudeo', value: formatCurrency(menudeoNum) },
          {
            label: 'Inventario general',
            value:
              editInvMode === 'sumar' && rawInvNum > 0
                ? `${formatNumber(currentInv)} + ${formatNumber(rawInvNum)} = ${formatNumber(finalInventario)} piezas`
                : `${formatNumber(finalInventario)} piezas`,
          },
          { label: 'Estado', value: activo ? 'Activo' : 'Inactivo' },
        ],
        confirmLabel: 'Actualizar producto',
        onConfirm: async () => {
          await onUpdateProducto({
            ...editingProd,
            nombre: nombre.trim(),
            categoria: categoria.trim() || 'Dulce típico',
            unidad: unidad.trim() || 'Pieza',
            precioMayoreo: mayoreoNum,
            precioMenudeo: menudeoNum,
            inventario: finalInventario,
            activo,
          });
          setShowModal(false);
        },
      });
    } else {
      onRequestMutation({
        title: 'Agregar nuevo producto',
        description: 'Se agregará el artículo con su inventario inicial al catálogo de Google Sheets.',
        sheetTab: productosTabName,
        details: [
          { label: 'Producto', value: nombre.trim() },
          { label: 'Categoría', value: categoria.trim() || 'Dulce típico' },
          { label: 'Precio Mayoreo', value: formatCurrency(mayoreoNum) },
          { label: 'Precio Menudeo', value: formatCurrency(menudeoNum) },
          { label: 'Inventario inicial', value: `${formatNumber(rawInvNum)} piezas` },
        ],
        confirmLabel: 'Guardar producto',
        onConfirm: async () => {
          await onCreateProducto({
            nombre: nombre.trim(),
            categoria: categoria.trim() || 'Dulce típico',
            unidad: unidad.trim() || 'Pieza',
            precioMayoreo: mayoreoNum,
            precioMenudeo: menudeoNum,
            inventario: rawInvNum,
            activo,
          });
          setShowModal(false);
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F1A17]">Catálogo y estadísticas</h1>
          <p className="text-sm text-[#6E6259]">
            Precios de mayoreo/menudeo, piezas vendidas y Top 10 clientes con mayor consumo por ruta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 rounded-xl bg-[#EFECE6]">
            <button
              type="button"
              onClick={() => setActiveTab('catalogo')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'catalogo'
                  ? 'bg-white text-[#1F1A17] shadow-xs'
                  : 'text-[#6E6259] hover:text-[#1F1A17]'
              }`}
            >
              Catálogo ({dataset.productos.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kardex')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'kardex'
                  ? 'bg-white text-[#1F1A17] shadow-xs'
                  : 'text-[#6E6259] hover:text-[#1F1A17]'
              }`}
            >
              Kardex y Mermas ({(dataset.movimientosInventario || []).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('estadisticas')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'estadisticas'
                  ? 'bg-white text-[#1F1A17] shadow-xs'
                  : 'text-[#6E6259] hover:text-[#1F1A17]'
              }`}
            >
              Estadísticas y Top 10
            </button>
          </div>

          {dataset.productos.length > 0 && activeTab === 'kardex' && (
            <button
              type="button"
              onClick={() => openMovModal()}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)] whitespace-nowrap"
            >
              <History className="w-4 h-4 text-[var(--theme-accent)]" />
              <span>Registrar movimiento / merma</span>
            </button>
          )}

          {dataset.productos.length > 0 && activeTab !== 'kardex' && (
            <button
              type="button"
              onClick={() => openBulkStockModal('sumar')}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)] whitespace-nowrap"
            >
              <Boxes className="w-4 h-4 text-[var(--theme-accent)]" />
              <span>Sumar producción / inventario</span>
            </button>
          )}

          <button
            type="button"
            onClick={openNewModal}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar producto</span>
          </button>
        </div>
      </div>

      {/* Inventory summary strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
          <p className="text-xs font-medium text-[#6E6259]">Inventario general total</p>
          <p className="text-2xl font-bold text-[var(--theme-primary)] tabular-nums mt-1">
            {formatNumber(inventorySummary.totalPiezas)} pzas
          </p>
          <p className="text-xs text-[#8C7E73] mt-0.5">En almacén / bodega disponible</p>
        </div>
        <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
          <p className="text-xs font-medium text-[#6E6259]">Productos activos</p>
          <p className="text-2xl font-bold text-[#1F1A17] tabular-nums mt-1">
            {dataset.productos.filter((p) => p.activo).length}
          </p>
          <p className="text-xs text-[#8C7E73] mt-0.5">De {dataset.productos.length} en catálogo</p>
        </div>
        <div className="rounded-2xl bg-white border border-[#E7E3DC] p-4">
          <p className="text-xs font-medium text-[#6E6259]">Stock bajo (≤ 5 pzas)</p>
          <p
            className={`text-2xl font-bold tabular-nums mt-1 ${
              inventorySummary.lowStockCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {inventorySummary.lowStockCount}
          </p>
          <p className="text-xs text-[#8C7E73] mt-0.5">
            {inventorySummary.lowStockCount > 0 ? 'Requieren reposición' : 'Todo surtido'}
          </p>
        </div>
      </section>

      {activeTab === 'catalogo' ? (
        <section className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
          <div className="p-4 border-b border-[#EFECE6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1F1A17]">
              <Package className="w-4 h-4 text-[var(--theme-primary)]" />
              <span>Lista de precios e inventario general</span>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#8C7E73] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto o categoría..."
                className="w-full h-10 rounded-xl border border-[#D8D1C7] pl-9 pr-3 text-sm text-[#1F1A17] focus:outline-none focus:border-[#4A2511]"
              />
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#6E6259]">
              Aún no hay productos registrados. Usa &ldquo;Agregar producto&rdquo; para cargar tu catálogo en Google Sheets.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EFECE6] bg-[#FAF8F5] text-xs font-semibold text-[#6E6259]">
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4">Unidad</th>
                    <th className="py-3 px-4 text-right">Mayoreo</th>
                    <th className="py-3 px-4 text-right">Menudeo</th>
                    <th className="py-3 px-4 text-right">Inventario</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6] text-sm">
                  {filteredProducts.map((p) => {
                    const stock = p.inventario ?? 0;
                    const stockColor =
                      stock === 0
                        ? 'text-red-700'
                        : stock <= 5
                        ? 'text-amber-700'
                        : 'text-emerald-700';
                    return (
                      <tr key={p.id} className="hover:bg-[#FAF8F5]">
                        <td className="py-3 px-4 font-semibold text-[#1F1A17]">{p.nombre}</td>
                        <td className="py-3 px-4 text-[#6E6259]">{p.categoria}</td>
                        <td className="py-3 px-4 text-[#6E6259]">{p.unidad}</td>
                        <td className="py-3 px-4 text-right font-semibold text-[var(--theme-primary)] tabular-nums">
                          {formatCurrency(p.precioMayoreo)}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-[#1F1A17] tabular-nums">
                          {formatCurrency(p.precioMenudeo)}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold tabular-nums ${stockColor}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {stock <= 5 && <AlertTriangle className="w-3.5 h-3.5" />}
                            <span>{formatNumber(stock)}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium">
                          <span className={p.activo ? 'text-emerald-700' : 'text-[#8C7E73]'}>
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openMovModal(p.id)}
                              title={`Sumar producción o registrar movimiento de ${p.nombre}`}
                              className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 whitespace-nowrap"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Sumar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(p)}
                              aria-label={`Editar ${p.nombre}`}
                              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-[var(--theme-primary)] hover:bg-[var(--theme-tint)]"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {p.rowNumber && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRequestMutation({
                                    title: 'Eliminar producto',
                                    description:
                                      'Se eliminará este artículo de la hoja de Productos en Google Sheets.',
                                    sheetTab: productosTabName,
                                    details: [
                                      { label: 'Producto', value: p.nombre },
                                      { label: 'Mayoreo', value: formatCurrency(p.precioMayoreo) },
                                    ],
                                    confirmLabel: 'Eliminar producto',
                                    onConfirm: async () => {
                                      await onDeleteProducto(p);
                                    },
                                  })
                                }
                                aria-label={`Eliminar ${p.nombre}`}
                                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : activeTab === 'kardex' ? (
        <section className="rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
          <div className="p-4 border-b border-[#EFECE6] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1F1A17]">
              <History className="w-4 h-4 text-[var(--theme-primary)]" />
              <span>Kardex de movimientos, entradas y mermas ({filteredKardex.length})</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <select
                value={kardexTipoFilter}
                onChange={(e) => setKardexTipoFilter(e.target.value)}
                className="h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs font-semibold text-[#1F1A17]"
              >
                <option value="Todos">Todos los movimientos</option>
                {MOVIMIENTO_TIPOS_FILTRO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-[#8C7E73] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={kardexSearch}
                  onChange={(e) => setKardexSearch(e.target.value)}
                  placeholder="Producto, folio o nota..."
                  className="w-full h-10 rounded-xl border border-[#D8D1C7] pl-9 pr-3 text-xs text-[#1F1A17]"
                />
              </div>
            </div>
          </div>

          {filteredKardex.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm text-[#6E6259]">
                No hay movimientos registrados con los filtros actuales.
              </p>
              <p className="text-xs text-[#8C7E73]">
                Los movimientos se registran automáticamente en ventas directas, jornadas y ajustes, o manualmente desde &ldquo;Registrar movimiento / merma&rdquo;.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EFECE6] bg-[#FAF8F5] text-xs font-semibold text-[#6E6259]">
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-4 text-right">Movimiento</th>
                    <th className="py-3 px-4 text-right">Stock final</th>
                    <th className="py-3 px-4">Referencia / Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6] text-xs">
                  {filteredKardex.map((m) => {
                    const isPositive = m.cantidadDelta > 0;
                    const isZero = m.cantidadDelta === 0;
                    const isMerma = m.tipo === 'Merma' || m.tipo === 'Faltante jornada' || m.tipo === 'Cortesía';
                    const badgeClass =
                      m.tipo === 'Devolución cliente'
                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                        : m.tipo === 'Cambio cliente'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : isMerma
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : isPositive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-[#FAF8F5] text-[#49403A] border-[#E7E3DC]';
                    return (
                      <tr key={m.id} className="hover:bg-[#FAF8F5]">
                        <td className="py-3 px-4 text-[#6E6259] whitespace-nowrap">
                          {formatDateShort(m.fecha)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}>
                            {m.tipo}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#1F1A17]">
                          {m.productoNombre}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                            isZero ? 'text-[#6E6259]' : isPositive ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {isPositive ? `+${formatNumber(m.cantidadDelta)}` : formatNumber(m.cantidadDelta)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#1F1A17] tabular-nums">
                          {formatNumber(m.stockResultante)}
                        </td>
                        <td className="py-3 px-4 text-[#6E6259]">
                          <span className="font-semibold text-[#1F1A17]">{m.referencia}</span>
                          {m.notas ? ` · ${m.notas}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Pieces sold per product */}
          <section className="lg:col-span-6 rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFECE6]">
              <h2 className="text-base font-bold text-[#1F1A17]">Ventas por producto</h2>
              <p className="text-xs text-[#6E6259] mt-0.5">
                Total de piezas vendidas e ingresos acumulados
              </p>
            </div>
            <div className="divide-y divide-[#EFECE6] max-h-[540px] overflow-y-auto">
              {productStats.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#6E6259]">
                  Aún no hay ventas registradas.
                </div>
              ) : (
                productStats.map((st, idx) => (
                  <div
                    key={st.nombre}
                    className="px-5 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1F1A17] truncate">
                        <span className="text-xs font-mono text-[#8C7E73] mr-2">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        {st.nombre}
                      </p>
                      <p className="text-xs text-[#6E6259] tabular-nums mt-0.5">
                        {st.tickets} ticket(s) · {formatCurrency(st.ingresos)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-bold text-[var(--theme-primary)] tabular-nums">
                        {formatNumber(st.piezas)}
                      </span>
                      <span className="block text-[11px] text-[#6E6259]">piezas</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Top 10 clients by route */}
          <section className="lg:col-span-6 rounded-2xl bg-white border border-[#E7E3DC] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFECE6] space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[var(--theme-accent)]" />
                <div>
                  <h2 className="text-base font-bold text-[#1F1A17]">
                    Top 10 clientes con mayor consumo por ruta
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={selectedRutaStats}
                  onChange={(e) => setSelectedRutaStats(e.target.value)}
                  className="h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs font-semibold text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
                >
                  <option value="Todas">Todas las rutas</option>
                  {dataset.rutas.map((r) => (
                    <option key={r.id} value={r.nombre}>
                      {r.nombre}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedProdFilter}
                  onChange={(e) => setSelectedProdFilter(e.target.value)}
                  className="h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs font-semibold text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
                >
                  <option value="Todos">Todos los productos</option>
                  {dataset.productos.map((p) => (
                    <option key={p.id} value={p.nombre}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {top10ClientsByRoute.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#6E6259]">
                No hay consumo registrado para esta ruta o producto.
              </div>
            ) : (
              <div className="divide-y divide-[#EFECE6]">
                {top10ClientsByRoute.map((row, idx) => (
                  <div
                    key={`${row.clienteNombre}-${row.ruta}`}
                    className="px-5 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#1F1A17] truncate">
                        <span className="font-mono text-xs text-[var(--theme-accent)] mr-2">
                          #{idx + 1}
                        </span>
                        {row.clienteNombre}
                      </p>
                      <p className="text-xs text-[#6E6259] mt-0.5 tabular-nums">
                        {row.ruta} · {row.tickets} compra(s) · {formatCurrency(row.importe)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-bold text-[var(--theme-primary)] tabular-nums">
                        {formatNumber(row.piezas)}
                      </span>
                      <span className="block text-[11px] text-[#6E6259]">piezas</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveForm}
            className="w-full max-w-md rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <h3 className="text-lg font-bold text-[#1F1A17]">
                {editingProd ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Nombre del producto *
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Palanqueta de cacahuate 100g"
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    placeholder="Dulce típico"
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                    Unidad
                  </label>
                  <input
                    type="text"
                    value={unidad}
                    onChange={(e) => setUnidad(e.target.value)}
                    placeholder="Pieza / Bolsa"
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                    Precio Mayoreo ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={precioMayoreo}
                    onChange={(e) => setPrecioMayoreo(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-mono text-[#1F1A17]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                    Precio Menudeo ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={precioMenudeo}
                    onChange={(e) => setPrecioMenudeo(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-mono text-[#1F1A17]"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-semibold text-[#6E6259]">
                    {editingProd
                      ? editInvMode === 'sumar'
                        ? 'Agregar piezas al inventario'
                        : 'Fijar inventario total exacto'
                      : 'Inventario inicial disponible (piezas)'}
                  </label>
                  {editingProd && (
                    <div className="inline-flex rounded-lg bg-[#EFECE6] p-0.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setEditInvMode('sumar');
                          setInventario('0');
                        }}
                        className={`px-2 py-0.5 rounded-md transition-colors ${
                          editInvMode === 'sumar'
                            ? 'bg-white text-[var(--theme-primary)] shadow-xs'
                            : 'text-[#6E6259]'
                        }`}
                      >
                        + Sumar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditInvMode('fijar');
                          setInventario(String(editingProd.inventario ?? 0));
                        }}
                        className={`px-2 py-0.5 rounded-md transition-colors ${
                          editInvMode === 'fijar'
                            ? 'bg-white text-[var(--theme-primary)] shadow-xs'
                            : 'text-[#6E6259]'
                        }`}
                      >
                        = Fijar total
                      </button>
                    </div>
                  )}
                </div>

                {editingProd && editInvMode === 'sumar' ? (
                  <div className="rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#6E6259]">
                      <span>Existencia actual en bodega:</span>
                      <strong className="text-[#1F1A17] tabular-nums">
                        {formatNumber(editingProd.inventario ?? 0)} pzas
                      </strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-emerald-700">+</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={inventario}
                        onChange={(e) => setInventario(e.target.value)}
                        placeholder="Ej. 100"
                        className="flex-1 h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm font-mono font-bold text-[#1F1A17]"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E7E3DC]">
                      <span className="font-semibold text-[#49403A]">Nuevo inventario total:</span>
                      <strong className="text-sm text-emerald-700 tabular-nums">
                        {formatNumber(
                          (editingProd.inventario ?? 0) +
                            Math.max(0, parseInt(inventario, 10) || 0)
                        )}{' '}
                        pzas
                      </strong>
                    </div>
                  </div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={inventario}
                    onChange={(e) => setInventario(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-mono font-bold text-[#1F1A17]"
                  />
                )}
              </div>
              <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  className="h-4 w-4 accent-[#4A2511]"
                />
                <span className="text-sm text-[#1F1A17]">Producto activo para venta</span>
              </label>
            </div>
            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-sm font-semibold text-[#49403A]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[var(--theme-primary)] text-sm font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
              >
                {editingProd ? 'Guardar cambios' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Stock Addition / Count Adjustment Modal */}
      {showBulkStockModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveBulkStock}
            className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <div>
                <h3 className="text-lg font-bold text-[#1F1A17]">
                  {bulkMode === 'sumar'
                    ? 'Sumar producción / entradas al inventario'
                    : 'Ajuste por conteo físico'}
                </h3>
                <p className="text-xs text-[#6E6259]">
                  {bulkMode === 'sumar'
                    ? 'Escribe solo las piezas nuevas producidas o compradas para sumarlas a lo que ya tienes.'
                    : 'Escribe el conteo exacto que hay en bodega para sobrescribir las existencias.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkStockModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-3 bg-[#FAF8F5] border-b border-[#EFECE6] space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#EFECE6]">
                <button
                  type="button"
                  onClick={() => handleSwitchBulkMode('sumar')}
                  className={`min-h-[36px] rounded-lg text-xs font-bold transition-colors ${
                    bulkMode === 'sumar'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-[#6E6259] hover:text-[#1F1A17]'
                  }`}
                >
                  + Sumar a existencias actuales
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchBulkMode('fijar')}
                  className={`min-h-[36px] rounded-lg text-xs font-bold transition-colors ${
                    bulkMode === 'fijar'
                      ? 'bg-white text-[var(--theme-primary)] shadow-xs'
                      : 'text-[#6E6259] hover:text-[#1F1A17]'
                  }`}
                >
                  = Fijar conteo total exacto
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bulkMode === 'sumar' && (
                  <select
                    value={bulkTipo}
                    onChange={(e) => setBulkTipo(e.target.value as MovimientoInventarioTipo)}
                    className="h-9 rounded-lg border border-[#D8D1C7] bg-white px-2.5 text-xs font-semibold text-[#1F1A17]"
                  >
                    <option value="Entrada producción">Motivo: Entrada producción</option>
                    <option value="Compra">Motivo: Compra</option>
                    <option value="Ajuste manual">Motivo: Ajuste manual (+)</option>
                  </select>
                )}
                <input
                  type="text"
                  value={bulkNota}
                  onChange={(e) => setBulkNota(e.target.value)}
                  placeholder="Nota opcional (ej. Producción martes)"
                  className={`h-9 rounded-lg border border-[#D8D1C7] bg-white px-3 text-xs text-[#1F1A17] ${
                    bulkMode === 'fijar' ? 'sm:col-span-2' : ''
                  }`}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#EFECE6] px-6">
              {dataset.productos.map((p) => {
                const currentInv = p.inventario ?? 0;
                const rawVal = bulkStockValues[p.id] ?? (bulkMode === 'sumar' ? '' : String(currentInv));
                const parsedVal = Math.max(0, parseInt(rawVal || '0', 10) || 0);
                const nextInv = bulkMode === 'sumar' ? currentInv + parsedVal : parsedVal;
                const diff = nextInv - currentInv;
                return (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1F1A17] truncate">{p.nombre}</p>
                      <p className="text-xs text-[#6E6259] tabular-nums">
                        Actual: <strong>{formatNumber(currentInv)}</strong> {p.unidad.toLowerCase()}
                        {diff !== 0 && (
                          <span
                            className={`ml-2 font-bold ${
                              diff > 0 ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {bulkMode === 'sumar'
                              ? `+ ${formatNumber(diff)} = ${formatNumber(nextInv)}`
                              : `→ ${formatNumber(nextInv)} (${diff > 0 ? `+${diff}` : diff})`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setBulkStockValues((prev) => ({
                            ...prev,
                            [p.id]:
                              bulkMode === 'sumar' && Math.max(0, parsedVal - 1) === 0
                                ? ''
                                : String(Math.max(0, parsedVal - 1)),
                          }))
                        }
                        className="h-9 w-9 rounded-lg border border-[#D8D1C7] text-sm font-bold text-[#49403A]"
                      >
                        -
                      </button>
                      <div className="relative">
                        {bulkMode === 'sumar' && (
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-700">
                            +
                          </span>
                        )}
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={rawVal}
                          placeholder={bulkMode === 'sumar' ? '0' : undefined}
                          onChange={(e) =>
                            setBulkStockValues((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          className={`w-20 h-9 rounded-lg border border-[#D8D1C7] text-center text-sm font-mono font-bold tabular-nums ${
                            bulkMode === 'sumar' ? 'pl-4 text-emerald-700' : 'text-[#1F1A17]'
                          }`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setBulkStockValues((prev) => ({
                            ...prev,
                            [p.id]: String(parsedVal + 1),
                          }))
                        }
                        className="h-9 w-9 rounded-lg border border-[#D8D1C7] text-sm font-bold text-[#49403A]"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                {bulkMode === 'sumar'
                  ? `Total a sumar: +${formatNumber(
                      dataset.productos.reduce(
                        (sum, p) => sum + Math.max(0, parseInt(bulkStockValues[p.id] || '0', 10) || 0),
                        0
                      )
                    )} pzas`
                  : 'Modo conteo físico exacto'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkStockModal(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-sm font-semibold text-[#49403A]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-[var(--theme-primary)] text-sm font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
                >
                  {bulkMode === 'sumar' ? 'Sumar al inventario' : 'Guardar conteo'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      {/* Register Inventory Movement / Merma Modal */}
      {showMovModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <form
            onSubmit={handleSaveMovimiento}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
              <div>
                <h3 className="text-lg font-bold text-[#1F1A17]">Registrar movimiento / merma</h3>
                <p className="text-xs text-[#6E6259]">
                  Entradas de producción, compras, mermas o cortesías en Kardex.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMovModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Producto *</label>
                <select
                  value={movProdId}
                  onChange={(e) => setMovProdId(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                >
                  {dataset.productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (Stock: {formatNumber(p.inventario ?? 0)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">Tipo *</label>
                  <select
                    value={movTipo}
                    onChange={(e) => setMovTipo(e.target.value as MovimientoInventarioTipo)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                  >
                    <option value="Entrada producción">Entrada producción (+)</option>
                    <option value="Compra">Compra (+)</option>
                    <option value="Merma">Merma / Dañado (-)</option>
                    <option value="Cortesía">Cortesía (-)</option>
                    <option value="Ajuste manual">Ajuste manual (+/-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={movFecha}
                    onChange={(e) => setMovFecha(e.target.value)}
                    className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3 text-sm text-[#1F1A17]"
                  />
                </div>
              </div>

              {movTipo === 'Ajuste manual' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMovSign(1)}
                    className={`min-h-[38px] rounded-xl border text-xs font-bold ${
                      movSign === 1
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white border-[#D8D1C7] text-[#49403A]'
                    }`}
                  >
                    + Sumar stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovSign(-1)}
                    className={`min-h-[38px] rounded-xl border text-xs font-bold ${
                      movSign === -1
                        ? 'bg-red-700 text-white border-red-700'
                        : 'bg-white border-[#D8D1C7] text-[#49403A]'
                    }`}
                  >
                    - Restar stock
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Cantidad de piezas *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={movCantidad}
                  onChange={(e) => setMovCantidad(e.target.value)}
                  placeholder="Ej. 100"
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm font-mono font-bold text-[#1F1A17]"
                />
                {(() => {
                  const selectedProd = dataset.productos.find((p) => p.id === movProdId);
                  if (!selectedProd) return null;
                  const current = selectedProd.inventario ?? 0;
                  const qtyNum = Math.abs(parseInt(movCantidad, 10) || 0);
                  const signed =
                    movTipo === 'Merma' || movTipo === 'Cortesía'
                      ? -qtyNum
                      : movTipo === 'Ajuste manual'
                      ? movSign * qtyNum
                      : qtyNum;
                  const result = movApplyStock ? Math.max(0, current + signed) : current;
                  return (
                    <div className="mt-2 rounded-xl bg-[#FAF8F5] border border-[#E7E3DC] px-3 py-2 flex items-center justify-between text-xs tabular-nums">
                      <span className="text-[#6E6259]">
                        Actual: <strong className="text-[#1F1A17]">{formatNumber(current)}</strong>
                        {qtyNum > 0 && movApplyStock && (
                          <span className={signed >= 0 ? ' text-emerald-700 font-bold' : ' text-red-700 font-bold'}>
                            {' '}
                            {signed >= 0 ? `+ ${formatNumber(signed)}` : `- ${formatNumber(Math.abs(signed))}`}
                          </span>
                        )}
                      </span>
                      <span className="font-bold text-[var(--theme-primary)]">
                        Nuevo stock: {formatNumber(result)} pzas
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Referencia (opcional)
                </label>
                <input
                  type="text"
                  value={movReferencia}
                  onChange={(e) => setMovReferencia(e.target.value)}
                  placeholder="Ej. Lote cocina #12 / Proveedor"
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">Notas</label>
                <input
                  type="text"
                  value={movNotas}
                  onChange={(e) => setMovNotas(e.target.value)}
                  placeholder="Detalle o motivo del movimiento..."
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] px-3.5 text-sm text-[#1F1A17]"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={movApplyStock}
                  onChange={(e) => setMovApplyStock(e.target.checked)}
                  className="h-4 w-4 accent-[var(--theme-primary)]"
                />
                <span className="text-xs font-medium text-[#1F1A17]">
                  Actualizar existencias en Inventario General ({productosTabName})
                </span>
              </label>
            </div>
            <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMovModal(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-xs font-semibold text-[#49403A]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-[var(--theme-primary)] text-xs font-bold text-white"
              >
                Registrar movimiento
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
