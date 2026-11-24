import React from 'react';
import {
  ShoppingBag,
  Users,
  UserPlus,
  Package,
  TrendingUp,
  Receipt,
  Wallet,
  BarChart3,
  ArrowRight,
  RefreshCw,
  Palette,
  Truck,
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { AppModule, BusinessDataset } from '../types/business';
import {
  formatCurrency,
  formatMonthLabel,
  formatNumber,
  getCurrentMonthISO,
} from '../utils/formatters';
import {
  computeIncomeSummaryForPeriod,
  getGeneralEgresos,
} from '../utils/incomeConsolidation';
import { getTicketPaymentSummary } from '../utils/paymentHelpers';

interface InicioViewProps {
  dataset: BusinessDataset;
  logoUrl: string;
  spreadsheetTitle?: string;
  onNavigate: (module: AppModule) => void;
  onOpenSheetSetup: () => void;
  onOpenAppearance: () => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
}

const MENU_ITEMS: {
  id: AppModule;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}[] = [
  {
    id: 'nuevo-pedido',
    title: 'Nuevo pedido y ticket',
    description: 'Genera folios consecutivos, asigna a jornada o venta directa',
    icon: ShoppingBag,
    accent: 'bg-[#4A2511] text-white',
  },
  {
    id: 'jornadas',
    title: 'Jornadas e inventario',
    description: 'Abre jornadas con inventario cargado y actualiza al finalizar',
    icon: Truck,
    accent: 'bg-[#FAF6F0] text-[#4A2511]',
  },
  {
    id: 'clientes',
    title: 'Clientes e historial',
    description: 'Consulta clientes por ruta y todos sus tickets',
    icon: Users,
    accent: 'bg-[#FAF6F0] text-[#4A2511]',
  },
  {
    id: 'agregar-cliente',
    title: 'Agregar clientes',
    description: 'Registra clientes nuevos y asigna o crea rutas',
    icon: UserPlus,
    accent: 'bg-[#FAF6F0] text-[#4A2511]',
  },
  {
    id: 'catalogo',
    title: 'Catálogo e inventario',
    description: 'Precios, inventario general, piezas vendidas y Top 10',
    icon: Package,
    accent: 'bg-[#FAF6F0] text-[#4A2511]',
  },
  {
    id: 'ingresos',
    title: 'Ingresos y otros conceptos',
    description: 'Jornadas consolidadas, ventas directas por ruta y otros ingresos',
    icon: TrendingUp,
    accent: 'bg-[#FAF6F0] text-[#4A2511]',
  },
  {
    id: 'egresos',
    title: 'Egresos y gastos',
    description: 'Materia prima, gasolina, insumos y conceptos reutilizables',
    icon: Receipt,
    accent: 'bg-[#FAF6F0] text-[#4A2511]',
  },
  {
    id: 'finanzas',
    title: 'Finanzas y sueldos',
    description: 'Utilidad preliminar, sueldos, fondo base y cierre mensual',
    icon: Wallet,
    accent: 'bg-[#FAF6F0] text-[#4A2511]',
  },
  {
    id: 'reportes',
    title: 'Reportes y gráficas',
    description: 'Estado de resultados, tablas y constructor de gráficas propias',
    icon: BarChart3,
    accent: 'bg-[#FAF6F0] text-[#4A2511]',
  },
];

export const InicioView: React.FC<InicioViewProps> = ({
  dataset,
  logoUrl,
  spreadsheetTitle,
  onNavigate,
  onOpenSheetSetup,
  onOpenAppearance,
  onRefreshData,
  isRefreshing,
}) => {
  const currentMonth = getCurrentMonthISO();
  const incomeSummary = computeIncomeSummaryForPeriod(dataset, currentMonth);
  const ingresosMes = incomeSummary.totalIngresos;
  const egresosMes = getGeneralEgresos(dataset, currentMonth).reduce(
    (acc, e) => acc + e.monto,
    0
  );
  const sueldosMes = dataset.sueldos
    .filter((s) => s.fecha.startsWith(currentMonth))
    .reduce((acc, s) => acc + s.monto, 0);
  const finMes = dataset.finanzasMensuales.find((f) => f.mes === currentMonth);
  const fondoBase = finMes?.fondoBase ?? 0;
  const utilidadNeta = ingresosMes - egresosMes - sueldosMes;
  const fondoTotal = fondoBase + utilidadNeta;
  const porCobrar = dataset.tickets.reduce(
    (acc, t) => {
      const pay = getTicketPaymentSummary(t);
      if (pay.saldoPendiente > 0.01) {
        return { total: acc.total + pay.saldoPendiente, count: acc.count + 1 };
      }
      return acc;
    },
    { total: 0, count: 0 }
  );

  return (
    <div className="space-y-8">
      {/* Hero brand panel */}
      <section className="rounded-2xl bg-white border border-[#E7E3DC] p-5 sm:p-7">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-40 sm:w-44 shrink-0 rounded-2xl bg-[#FFFCF7] border border-[#EFECE6] p-2.5 flex items-center justify-center">
              <img
                src={logoUrl}
                alt="Logotipo Productos Astorga"
                referrerPolicy="no-referrer"
                className="w-full h-auto max-h-32 object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-[#8C7E73]">
                Panel de control · {formatMonthLabel(currentMonth)}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1F1A17] mt-1">
                Productos Astorga
              </h1>
              <p className="text-sm text-[#6E6259] mt-1 max-w-xl">
                Administración de dulces típicos, control de rutas, emisión de tickets y cierre financiero conectado en tiempo real a Google Sheets.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6E6259]">
                {spreadsheetTitle && (
                  <>
                    <span>
                      Base activa:{' '}
                      <strong className="text-[var(--theme-primary)]">{spreadsheetTitle}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={onOpenSheetSetup}
                      className="font-semibold text-[var(--theme-accent)] hover:underline"
                    >
                      Cambiar hoja
                    </button>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={onOpenAppearance}
                  className="inline-flex items-center gap-1 font-semibold text-[var(--theme-primary)] hover:underline"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Cambiar logo y colores</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={onRefreshData}
              disabled={isRefreshing}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-4 py-2 text-sm font-semibold text-[#49403A] hover:bg-[#FAF8F5] transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('nuevo-pedido')}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--theme-primary-hover)] transition-colors whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Nuevo pedido</span>
            </button>
          </div>
        </div>

        {/* Clean 4-column summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[#EFECE6]">
          <div>
            <p className="text-xs font-medium text-[#6E6259]">Ingresos del mes</p>
            <p className="text-xl sm:text-2xl font-bold text-[#1F1A17] tabular-nums mt-1">
              {formatCurrency(ingresosMes)}
            </p>
            <p className="text-xs text-[#8C7E73] mt-0.5 tabular-nums">
              {incomeSummary.countJornadas} jor. · {incomeSummary.countTicketsDirectos} dir. · {incomeSummary.countOtros} otros
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[#6E6259]">Egresos y sueldos</p>
            <p className="text-xl sm:text-2xl font-bold text-[#B91C1C] tabular-nums mt-1">
              {formatCurrency(egresosMes + sueldosMes)}
            </p>
            <p className="text-xs text-[#8C7E73] mt-0.5 tabular-nums">
              Gastos {formatCurrency(egresosMes)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[#6E6259]">Utilidad neta</p>
            <p
              className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${
                utilidadNeta >= 0 ? 'text-emerald-700' : 'text-[#B91C1C]'
              }`}
            >
              {formatCurrency(utilidadNeta)}
            </p>
            <p className="text-xs text-[#8C7E73] mt-0.5">Después de sueldos</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[#6E6259]">Fondo total actual</p>
            <p className="text-xl sm:text-2xl font-bold text-[#4A2511] tabular-nums mt-1">
              {formatCurrency(fondoTotal)}
            </p>
            <p className="text-xs text-[#8C7E73] mt-0.5 tabular-nums">
              Base {formatCurrency(fondoBase)}
            </p>
          </div>
        </div>
      </section>

      {/* Quick access modules */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold text-[#1F1A17]">Módulos de operación</h2>
          <p className="text-xs text-[#6E6259] tabular-nums">
            {dataset.productos.length} productos (
            {formatNumber(dataset.productos.reduce((s, p) => s + (p.inventario || 0), 0))} pzas en stock) ·{' '}
            {dataset.jornadas.filter((j) => j.estado === 'Abierta').length} jornadas abiertas ·{' '}
            {porCobrar.count > 0 ? (
              <button
                type="button"
                onClick={() => onNavigate('clientes')}
                className="font-bold text-[#B91C1C] hover:underline"
              >
                Por cobrar: {formatCurrency(porCobrar.total)} ({porCobrar.count})
              </button>
            ) : (
              <span className="text-emerald-700 font-semibold">Sin saldos por cobrar</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="group text-left rounded-2xl bg-white border border-[#E7E3DC] p-5 hover:border-[#4A2511]/40 transition-colors flex flex-col justify-between gap-4 min-h-[140px]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.accent}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#9E9187] group-hover:text-[#4A2511] group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1F1A17]">{item.title}</h3>
                  <p className="text-xs text-[#6E6259] mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
