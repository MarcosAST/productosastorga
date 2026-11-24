import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  BarChart3,
  BarChartHorizontal,
  TrendingUp,
  Activity,
  PieChart as PieChartIcon,
  X,
} from 'lucide-react';
import { BusinessDataset } from '../types/business';
import { formatCurrency, formatNumber } from '../utils/formatters';
import {
  CHART_SOURCE_SPECS,
  CUSTOM_CHART_PALETTE,
  computeCustomChartData,
  CustomChartConfig,
  CustomChartGroupBy,
  CustomChartMetric,
  CustomChartSource,
  CustomChartType,
  getMetricMeta,
} from '../utils/customCharts';

interface CustomChartRendererProps {
  config: CustomChartConfig;
  data: { name: string; value: number }[];
  heightClass?: string;
}

export const CustomChartRenderer: React.FC<CustomChartRendererProps> = ({
  config,
  data,
  heightClass = 'h-72',
}) => {
  const metricMeta = getMetricMeta(config.fuente, config.metrica);
  const formatVal = (val: number) =>
    metricMeta.isCurrency ? formatCurrency(val) : formatNumber(val);

  if (data.length === 0) {
    return (
      <div className={`${heightClass} flex items-center justify-center text-sm text-[#6E6259]`}>
        No hay datos para esta combinación en el periodo seleccionado.
      </div>
    );
  }

  const tooltipStyle = {
    borderRadius: '12px',
    border: '1px solid #E7E3DC',
    fontSize: '12px',
  };

  if (config.tipo === 'pie') {
    return (
      <div className={`${heightClass} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={88}
              paddingAngle={2}
              label={({ name }) => (String(name).length > 14 ? `${String(name).slice(0, 14)}…` : name)}
            >
              {data.map((_, idx) => (
                <Cell
                  key={`pie-${idx}`}
                  fill={
                    idx === 0
                      ? config.color
                      : CUSTOM_CHART_PALETTE[(idx + 1) % CUSTOM_CHART_PALETTE.length]
                  }
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: any) => [formatVal(Number(v)), metricMeta.label]}
              contentStyle={tooltipStyle}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.tipo === 'horizontal_bar') {
    return (
      <div className={`${heightClass} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 10, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#6E6259' }} />
            <YAxis
              type="category"
              dataKey="name"
              width={118}
              tick={{ fontSize: 11, fill: '#1F1A17' }}
            />
            <Tooltip
              formatter={(v: any) => [formatVal(Number(v)), metricMeta.label]}
              contentStyle={tooltipStyle}
            />
            <Bar dataKey="value" fill={config.color} radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.tipo === 'line') {
    return (
      <div className={`${heightClass} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6E6259' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6E6259' }} />
            <Tooltip
              formatter={(v: any) => [formatVal(Number(v)), metricMeta.label]}
              contentStyle={tooltipStyle}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={config.color}
              strokeWidth={3}
              dot={{ r: 4, fill: config.color }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.tipo === 'area') {
    return (
      <div className={`${heightClass} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6E6259' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6E6259' }} />
            <Tooltip
              formatter={(v: any) => [formatVal(Number(v)), metricMeta.label]}
              contentStyle={tooltipStyle}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={config.color}
              strokeWidth={2.5}
              fill={config.color}
              fillOpacity={0.18}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={`${heightClass} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6E6259' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6E6259' }} />
          <Tooltip
            formatter={(v: any) => [formatVal(Number(v)), metricMeta.label]}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="value" fill={config.color} radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

interface CustomChartBuilderModalProps {
  isOpen: boolean;
  editingChart: CustomChartConfig | null;
  dataset: BusinessDataset;
  monthPrefix?: string;
  onClose: () => void;
  onSave: (chart: CustomChartConfig) => void;
}

const CHART_TYPE_OPTIONS: {
  id: CustomChartType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'bar', label: 'Barras', icon: BarChart3 },
  { id: 'horizontal_bar', label: 'Horiz.', icon: BarChartHorizontal },
  { id: 'line', label: 'Línea', icon: TrendingUp },
  { id: 'area', label: 'Área', icon: Activity },
  { id: 'pie', label: 'Pastel', icon: PieChartIcon },
];

export const CustomChartBuilderModal: React.FC<CustomChartBuilderModalProps> = ({
  isOpen,
  editingChart,
  dataset,
  monthPrefix,
  onClose,
  onSave,
}) => {
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<CustomChartType>('bar');
  const [fuente, setFuente] = useState<CustomChartSource>('ingresos_consolidados');
  const [agruparPor, setAgruparPor] = useState<CustomChartGroupBy>('ruta');
  const [metrica, setMetrica] = useState<CustomChartMetric>('monto');
  const [limite, setLimite] = useState<number>(10);
  const [orden, setOrden] = useState<'desc' | 'asc' | 'label'>('desc');
  const [color, setColor] = useState<string>(CUSTOM_CHART_PALETTE[0]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingChart) {
      setTitulo(editingChart.titulo);
      setTipo(editingChart.tipo);
      setFuente(editingChart.fuente);
      setAgruparPor(editingChart.agruparPor);
      setMetrica(editingChart.metrica);
      setLimite(editingChart.limite);
      setOrden(editingChart.orden);
      setColor(editingChart.color || CUSTOM_CHART_PALETTE[0]);
    } else {
      setTitulo('');
      setTipo('bar');
      setFuente('ingresos_consolidados');
      setAgruparPor('tipo');
      setMetrica('monto');
      setLimite(10);
      setOrden('desc');
      setColor(CUSTOM_CHART_PALETTE[0]);
    }
  }, [isOpen, editingChart]);

  const currentSpec = useMemo(
    () => CHART_SOURCE_SPECS.find((s) => s.id === fuente) || CHART_SOURCE_SPECS[0],
    [fuente]
  );

  const handleChangeFuente = (nextSource: CustomChartSource) => {
    setFuente(nextSource);
    const spec = CHART_SOURCE_SPECS.find((s) => s.id === nextSource) || CHART_SOURCE_SPECS[0];
    if (!spec.groupings.some((g) => g.id === agruparPor)) {
      setAgruparPor(spec.groupings[0].id);
    }
    if (!spec.metrics.some((m) => m.id === metrica)) {
      setMetrica(spec.metrics[0].id);
    }
    if (nextSource === 'mensual_comparativa') {
      setOrden('label');
    }
  };

  const previewConfig: CustomChartConfig = useMemo(() => {
    const autoTitle =
      titulo.trim() ||
      `${currentSpec.label.split('(')[0].trim()} por ${
        currentSpec.groupings.find((g) => g.id === agruparPor)?.label || agruparPor
      }`;
    return {
      id: editingChart?.id || `CHART-${Date.now()}`,
      titulo: autoTitle,
      tipo,
      fuente,
      agruparPor,
      metrica,
      limite,
      orden,
      color,
      createdAt: editingChart?.createdAt || new Date().toISOString(),
    };
  }, [
    titulo,
    currentSpec,
    agruparPor,
    editingChart,
    tipo,
    fuente,
    metrica,
    limite,
    orden,
    color,
  ]);

  const previewData = useMemo(
    () => computeCustomChartData(previewConfig, dataset, monthPrefix),
    [previewConfig, dataset, monthPrefix]
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(previewConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-4xl rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#EFECE6] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1F1A17]">
              {editingChart ? 'Editar gráfica personalizada' : 'Crear gráfica personalizada'}
            </h2>
            <p className="text-xs text-[#6E6259]">
              Elige los datos, el tipo de gráfica y mira la vista previa en tiempo real.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar constructor de gráficas"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#FAF8F5]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5"
        >
          {/* Controls */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Título de la gráfica
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder={previewConfig.titulo}
                className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Tipo de gráfica
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {CHART_TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = tipo === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTipo(opt.id)}
                      className={`min-h-[54px] flex flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold transition-colors ${
                        active
                          ? 'bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]'
                          : 'bg-[#FAF8F5] text-[#49403A] border-[#E7E3DC] hover:bg-[var(--theme-tint)]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Fuente de datos
              </label>
              <select
                value={fuente}
                onChange={(e) => handleChangeFuente(e.target.value as CustomChartSource)}
                className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
              >
                {CHART_SOURCE_SPECS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Agrupar por
                </label>
                <select
                  value={agruparPor}
                  onChange={(e) => setAgruparPor(e.target.value as CustomChartGroupBy)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                >
                  {currentSpec.groupings.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Métrica
                </label>
                <select
                  value={metrica}
                  onChange={(e) => setMetrica(e.target.value as CustomChartMetric)}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                >
                  {currentSpec.metrics.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Orden
                </label>
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as 'desc' | 'asc' | 'label')}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                >
                  <option value="desc">Mayor a menor</option>
                  <option value="asc">Menor a mayor</option>
                  <option value="label">Cronológico / Alfabético</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                  Límite de elementos
                </label>
                <select
                  value={limite}
                  onChange={(e) => setLimite(Number(e.target.value))}
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                >
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                  <option value={15}>Top 15</option>
                  <option value={0}>Todos</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1.5">
                Color principal
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {CUSTOM_CHART_PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColor(hex)}
                    aria-label={`Color ${hex}`}
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${
                      color === hex ? 'border-[#1F1A17] scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="lg:col-span-7 flex flex-col rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-[#1F1A17] truncate">
                {previewConfig.titulo}
              </p>
              <span className="text-[11px] font-semibold text-[#6E6259] shrink-0">
                Vista previa ({previewData.length} elementos)
              </span>
            </div>
            <div className="flex-1 rounded-xl bg-white border border-[#E7E3DC] p-3 flex items-center justify-center min-h-[280px]">
              <CustomChartRenderer
                config={previewConfig}
                data={previewData}
                heightClass="h-72"
              />
            </div>
          </div>

          <div className="lg:col-span-12 pt-2 border-t border-[#EFECE6] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-[#D8D1C7] bg-white text-sm font-semibold text-[#49403A] hover:bg-[#FAF8F5]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-[var(--theme-primary)] text-white text-sm font-bold hover:bg-[var(--theme-primary-hover)]"
            >
              {editingChart ? 'Guardar cambios' : 'Agregar gráfica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
