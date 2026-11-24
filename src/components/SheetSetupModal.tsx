import React, { useState } from 'react';
import {
  FileSpreadsheet,
  FolderOpen,
  Link2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Copy,
  Wrench,
} from 'lucide-react';
import {
  DriveSpreadsheetFile,
  LogicalTabKey,
  SheetTabMapping,
} from '../types/business';
import { DEFAULT_TAB_NAMES } from '../services/sheetsApi';
import { extractSpreadsheetId, formatDateShort } from '../utils/formatters';

interface SheetSetupModalProps {
  isOpen: boolean;
  onClose?: () => void;
  canClose: boolean;
  driveFiles: DriveSpreadsheetFile[];
  isLoadingFiles: boolean;
  onRefreshFiles: () => void;
  onSelectSpreadsheet: (spreadsheetId: string) => Promise<void>;
  onCreateSpreadsheet: (customTitle: string, migrateCurrentData: boolean) => void;
  hasExistingData: boolean;
  connectedTitle?: string;
  connectedId?: string;
  tabMapping?: Partial<SheetTabMapping>;
  missingTabs?: LogicalTabKey[];
  availableSheetTitles?: string[];
  sheetHealthIssues?: string[];
  onRepairSpreadsheet?: () => void;
  onUpdateTabMapping?: (key: LogicalTabKey, tabName: string) => void;
  onInitializeMissingTabs?: () => void;
}

const TAB_LABELS: Record<LogicalTabKey, string> = {
  productos: 'Catálogo de Productos',
  clientes: 'Clientes',
  rutas: 'Rutas',
  tickets: 'Tickets / Pedidos',
  jornadas: 'Jornadas de Venta',
  movimientosInventario: 'Movimientos / Kardex',
  otrosIngresos: 'Otros Ingresos',
  conceptosIngreso: 'Conceptos de Ingreso',
  egresos: 'Egresos y Gastos',
  conceptosGasto: 'Conceptos de Gasto',
  sueldos: 'Sueldos',
  finanzasMensuales: 'Finanzas y Fondo Base',
  configuracion: 'Configuración y Respaldo',
};

export const SheetSetupModal: React.FC<SheetSetupModalProps> = ({
  isOpen,
  onClose,
  canClose,
  driveFiles,
  isLoadingFiles,
  onRefreshFiles,
  onSelectSpreadsheet,
  onCreateSpreadsheet,
  hasExistingData,
  connectedTitle,
  connectedId,
  tabMapping,
  missingTabs = [],
  availableSheetTitles = [],
  sheetHealthIssues = [],
  onRepairSpreadsheet,
  onUpdateTabMapping,
  onInitializeMissingTabs,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('Productos Astorga - Registro Completo');
  const [errorMsg, setErrorMsg] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  if (!isOpen) return null;

  const handleConnectByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const id = extractSpreadsheetId(urlInput);
    if (!id || id.length < 10) {
      setErrorMsg('Pega una URL válida o el ID de tu hoja de Google Sheets.');
      return;
    }
    setIsConnecting(true);
    try {
      await onSelectSpreadsheet(id);
      setUrlInput('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo abrir esa hoja de Google Sheets.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePickFile = async (id: string) => {
    setErrorMsg('');
    setIsConnecting(true);
    try {
      await onSelectSpreadsheet(id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al cargar la hoja seleccionada.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#EFECE6]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-tint)] text-[var(--theme-primary)]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-[#1F1A17] truncate">
                Base de datos en Google Sheets
              </h2>
              <p className="text-xs text-[#6E6259] truncate">
                Conecta tu hoja existente o crea un nuevo documento estructurado por hojas
              </p>
            </div>
          </div>
          {canClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Create new improved multi-sheet spreadsheet CTA */}
          <div className="rounded-2xl border border-[#E7E3DC] p-4 bg-[#FFFCF7] space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[#1F1A17]">
                Crear nuevo documento mejorado en Google Sheets
              </h3>
              <p className="text-xs text-[#6E6259] mt-0.5 leading-relaxed">
                Genera un libro nuevo con <strong>14 pestañas organizadas por color</strong> (incluyendo Kardex, Cobranza y Respaldo de Configuración), hoja de <strong>Resumen_General con fórmulas automáticas</strong>, filtros, encabezados fijos y formato de moneda ($).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                Nombre del nuevo documento
              </label>
              <input
                type="text"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Productos Astorga - Registro Completo"
                className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
              />
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={isConnecting}
                onClick={() => onCreateSpreadsheet(newDocTitle, false)}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)] transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Crear documento nuevo limpio</span>
              </button>

              {hasExistingData && (
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => onCreateSpreadsheet(newDocTitle, true)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>Crear nuevo y copiar datos actuales</span>
                </button>
              )}
            </div>
          </div>

          {/* Connected status & tab mapping & structure repair */}
          {connectedId && connectedTitle && (
            <div className="rounded-xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[#1F1A17]">{connectedTitle}</p>
                    <p className="text-xs text-[#6E6259] font-mono truncate max-w-[260px]">
                      ID: {connectedId}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {missingTabs.length > 0 && onInitializeMissingTabs && (
                    <button
                      type="button"
                      onClick={onInitializeMissingTabs}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--theme-accent)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-tint)] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Crear {missingTabs.length} faltante(s)</span>
                    </button>
                  )}
                  {onRepairSpreadsheet && (
                    <button
                      type="button"
                      onClick={onRepairSpreadsheet}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-accent)] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-colors"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>
                        {sheetHealthIssues.length > 0
                          ? `Ajustar hojas (${sheetHealthIssues.length})`
                          : 'Verificar y ajustar hojas'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {sheetHealthIssues.length > 0 && (
                <div className="rounded-xl bg-[var(--theme-tint)] border border-[var(--theme-accent)]/30 p-3 space-y-1.5">
                  <p className="text-xs font-bold text-[var(--theme-primary)] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Ajustes detectados en este documento:</span>
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 text-xs text-[#49403A]">
                    {sheetHealthIssues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#E7E3DC]">
                {(Object.keys(DEFAULT_TAB_NAMES) as LogicalTabKey[]).map((key) => {
                  const mapped = tabMapping?.[key] || '';
                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-[#6E6259]">
                        {TAB_LABELS[key]}
                      </label>
                      <select
                        value={mapped}
                        onChange={(e) => onUpdateTabMapping?.(key, e.target.value)}
                        className="h-10 rounded-lg border border-[#D8D1C7] bg-white px-2.5 text-xs font-medium text-[#1F1A17] focus:outline-none focus:border-[var(--theme-primary)]"
                      >
                        <option value="">Sin asignar ({DEFAULT_TAB_NAMES[key]})</option>
                        {availableSheetTitles.map((title) => (
                          <option key={title} value={title}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paste link or ID */}
          <form onSubmit={handleConnectByUrl} className="space-y-2">
            <label className="block text-sm font-semibold text-[#1F1A17]">
              Pegar enlace o ID de Google Sheets existente
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-[#8C7E73] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full h-11 rounded-xl border border-[#D8D1C7] pl-10 pr-3 text-sm text-[#1F1A17] placeholder:text-[#9E9187] focus:outline-none focus:border-[var(--theme-primary)]"
                />
              </div>
              <button
                type="submit"
                disabled={isConnecting}
                className="min-h-[44px] px-5 rounded-xl border border-[var(--theme-primary)] text-sm font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-tint)] transition-colors whitespace-nowrap"
              >
                {isConnecting ? 'Conectando...' : 'Conectar hoja'}
              </button>
            </div>
          </form>

          {/* Drive Spreadsheets list */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1F1A17] flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[var(--theme-primary)]" />
                Tus hojas recientes en Google Drive
              </span>
              <button
                type="button"
                onClick={onRefreshFiles}
                disabled={isLoadingFiles}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-primary)] hover:underline min-h-[36px] px-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                <span>Actualizar</span>
              </button>
            </div>

            {isLoadingFiles ? (
              <div className="space-y-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 rounded-xl bg-[#F3EFE8] animate-pulse" />
                ))}
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D8D1C7] p-6 text-center text-sm text-[#6E6259]">
                No se encontraron hojas de cálculo recientes. Pega el enlace arriba o crea un documento nuevo.
              </div>
            ) : (
              <div className="divide-y divide-[#EFECE6] rounded-xl border border-[#E7E3DC] overflow-hidden">
                {driveFiles.map((file) => {
                  const isActive = file.id === connectedId;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      disabled={isConnecting}
                      onClick={() => handlePickFile(file.id)}
                      className={`w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                        isActive ? 'bg-[var(--theme-tint)]' : 'bg-white hover:bg-[#FAF8F5]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1F1A17] truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-[#6E6259] truncate">
                          {file.modifiedTime
                            ? `Modificado: ${formatDateShort(file.modifiedTime.slice(0, 10))}`
                            : 'Google Sheets'}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          isActive ? 'text-emerald-700' : 'text-[var(--theme-primary)]'
                        }`}
                      >
                        {isActive ? 'Conectada' : 'Seleccionar'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {canClose && onClose && (
          <div className="px-6 py-3.5 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--theme-primary)] text-sm font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
