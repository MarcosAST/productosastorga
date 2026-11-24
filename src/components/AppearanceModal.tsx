import React, { useRef, useState } from 'react';
import {
  Palette,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  X,
  Sun,
  Moon,
  Sparkles,
  CloudUpload,
  CloudDownload,
  Download,
  FileUp,
} from 'lucide-react';
import {
  AppTheme,
  DEFAULT_LOGO_PATH,
  PRESET_THEMES,
  SurfaceMode,
  processLogoImageFile,
} from '../utils/themeManager';
import { CustomChartConfig } from '../utils/customCharts';
import {
  AppSettingsBackupPayload,
  downloadSettingsBackupJson,
  parseSettingsBackupJson,
} from '../utils/ticketShare';

interface AppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  logoUrl: string;
  onChangeLogo: (newUrl: string) => void;
  onResetLogo: () => void;
  surfaceMode: SurfaceMode;
  onChangeSurfaceMode: (mode: SurfaceMode) => void;
  activeThemeId: string;
  customThemes: AppTheme[];
  onSelectTheme: (theme: AppTheme) => void;
  onAddCustomTheme: (theme: AppTheme) => void;
  onDeleteCustomTheme: (id: string) => void;
  customCharts: CustomChartConfig[];
  canCloudSync: boolean;
  onSaveConfigToSheet: () => Promise<void>;
  onLoadConfigFromSheet: () => Promise<AppSettingsBackupPayload | null>;
  onApplySettingsBackup: (payload: AppSettingsBackupPayload) => void;
}

const SURFACE_MODES: {
  id: SurfaceMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'claro',
    label: 'Modo Claro',
    description: 'Cálido y suave',
    icon: Sun,
  },
  {
    id: 'oscuro',
    label: 'Modo Oscuro',
    description: 'Descanso visual',
    icon: Moon,
  },
  {
    id: 'nitido',
    label: 'Modo Nítido',
    description: 'Alto contraste',
    icon: Sparkles,
  },
];

export const AppearanceModal: React.FC<AppearanceModalProps> = ({
  isOpen,
  onClose,
  logoUrl,
  onChangeLogo,
  onResetLogo,
  surfaceMode,
  onChangeSurfaceMode,
  activeThemeId,
  customThemes,
  onSelectTheme,
  onAddCustomTheme,
  onDeleteCustomTheme,
  customCharts,
  canCloudSync,
  onSaveConfigToSheet,
  onLoadConfigFromSheet,
  onApplySettingsBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoError, setLogoError] = useState('');
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);

  // Sync & Backup state
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const [isSyncingConfig, setIsSyncingConfig] = useState(false);

  // New custom theme form
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [themeName, setThemeName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#5B2333');
  const [accentColor, setAccentColor] = useState('#E07A5F');
  const [bgColor, setBgColor] = useState('#F8F7F4');

  if (!isOpen) return null;

  const allThemes = [...PRESET_THEMES, ...customThemes];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');
    setIsProcessingLogo(true);
    try {
      const dataUrl = await processLogoImageFile(file);
      onChangeLogo(dataUrl);
    } catch (err: any) {
      setLogoError(err?.message || 'Error al cargar la imagen.');
    } finally {
      setIsProcessingLogo(false);
      e.target.value = '';
    }
  };

  const handleCreateCustomTheme = (e: React.FormEvent) => {
    e.preventDefault();
    const name = themeName.trim();
    if (!name) return;

    const newTheme: AppTheme = {
      id: `custom-${Date.now()}`,
      name,
      primary: primaryColor,
      accent: accentColor,
      bg: bgColor,
      tint: `${primaryColor}14`,
      isCustom: true,
    };
    onAddCustomTheme(newTheme);
    onSelectTheme(newTheme);
    setThemeName('');
    setShowCustomForm(false);
  };

  const handleCloudSave = async () => {
    setSyncMessage('');
    setSyncError('');
    setIsSyncingConfig(true);
    try {
      await onSaveConfigToSheet();
      setSyncMessage('Ajustes, colores, logo y gráficas guardados en tu Google Sheet.');
    } catch (err: any) {
      setSyncError(err?.message || 'No se pudo guardar en Google Sheets.');
    } finally {
      setIsSyncingConfig(false);
    }
  };

  const handleCloudLoad = async () => {
    setSyncMessage('');
    setSyncError('');
    setIsSyncingConfig(true);
    try {
      const loaded = await onLoadConfigFromSheet();
      if (!loaded) {
        setSyncError('Aún no hay ajustes respaldados en la hoja Configuracion de este documento.');
      } else {
        setSyncMessage('Ajustes y gráficas restaurados desde Google Sheets.');
      }
    } catch (err: any) {
      setSyncError(err?.message || 'No se pudo cargar desde Google Sheets.');
    } finally {
      setIsSyncingConfig(false);
    }
  };

  const handleExportJson = () => {
    setSyncMessage('');
    setSyncError('');
    downloadSettingsBackupJson({
      version: 1,
      updatedAt: new Date().toISOString(),
      activeThemeId,
      surfaceMode,
      customThemes,
      customCharts,
      logoUrl,
    });
    setSyncMessage('Archivo de respaldo .json descargado.');
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncMessage('');
    setSyncError('');
    try {
      const text = await file.text();
      const parsed = parseSettingsBackupJson(text);
      onApplySettingsBackup(parsed);
      setSyncMessage(
        `Respaldo aplicado (${parsed.customThemes.length} tema(s) y ${parsed.customCharts.length} gráfica(s)).`
      );
    } catch (err: any) {
      setSyncError(err?.message || 'No se pudo leer el archivo JSON de respaldo.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFECE6]">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5 text-[var(--theme-primary)]" />
            <h2 className="text-lg font-bold text-[#1F1A17]">
              Apariencia, modo y colores
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Surface Appearance Mode: Claro / Oscuro / Nítido */}
          <section className="space-y-3">
            <div>
              <span className="text-sm font-bold text-[#1F1A17]">Modo de pantalla</span>
              <p className="text-xs text-[#6E6259]">
                Elige entre estilo claro, oscuro nocturno o nítido de alto contraste.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {SURFACE_MODES.map((mode) => {
                const Icon = mode.icon;
                const active = surfaceMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onChangeSurfaceMode(mode.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3.5 text-center transition-colors min-h-[84px] ${
                      active
                        ? 'border-[var(--theme-primary)] bg-[var(--theme-tint)]'
                        : 'border-[#E7E3DC] bg-white hover:bg-[#FAF8F5]'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        active ? 'text-[var(--theme-primary)]' : 'text-[#6E6259]'
                      }`}
                    />
                    <span className="text-xs font-bold text-[#1F1A17]">{mode.label}</span>
                    <span className="text-[11px] text-[#6E6259]">{mode.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Color Themes */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#1F1A17]">
                Colores del tema ({allThemes.length})
              </span>
              <button
                type="button"
                onClick={() => setShowCustomForm((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--theme-accent)] hover:underline min-h-[36px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showCustomForm ? 'Cancelar tema' : 'Crear color personalizado'}</span>
              </button>
            </div>

            {showCustomForm && (
              <form
                onSubmit={handleCreateCustomTheme}
                className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-[#6E6259] mb-1">
                    Nombre del tema *
                  </label>
                  <input
                    type="text"
                    required
                    value={themeName}
                    onChange={(e) => setThemeName(e.target.value)}
                    placeholder="Ej. Dorado Astorga"
                    className="w-full h-10 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm text-[#1F1A17]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#6E6259]">
                    <span>Color principal</span>
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-full rounded-lg border border-[#D8D1C7] bg-white p-1 cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#6E6259]">
                    <span>Color acento</span>
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-10 w-full rounded-lg border border-[#D8D1C7] bg-white p-1 cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#6E6259]">
                    <span>Fondo (claro)</span>
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-10 w-full rounded-lg border border-[#D8D1C7] bg-white p-1 cursor-pointer"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-xl bg-[var(--theme-primary)] text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
                >
                  Guardar y aplicar tema
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {allThemes.map((theme) => {
                const isActive = theme.id === activeThemeId;
                return (
                  <div
                    key={theme.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-3 transition-colors ${
                      isActive
                        ? 'border-[var(--theme-primary)] bg-[var(--theme-tint)]'
                        : 'border-[#E7E3DC] bg-white hover:bg-[#FAF8F5]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTheme(theme)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <span className="flex items-center shrink-0 -space-x-1.5">
                        <span
                          className="h-6 w-6 rounded-full border border-white shadow-xs"
                          style={{ backgroundColor: theme.primary }}
                        />
                        <span
                          className="h-6 w-6 rounded-full border border-white shadow-xs"
                          style={{ backgroundColor: theme.accent }}
                        />
                      </span>
                      <span className="text-sm font-semibold text-[#1F1A17] truncate">
                        {theme.name}
                      </span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {isActive && <Check className="w-4 h-4 text-[var(--theme-primary)]" />}
                      {theme.isCustom && (
                        <button
                          type="button"
                          onClick={() => onDeleteCustomTheme(theme.id)}
                          aria-label={`Eliminar tema ${theme.name}`}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[#8C7E73] hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Logo customization */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1F1A17]">
              <ImageIcon className="w-4 h-4 text-[var(--theme-primary)]" />
              <span>Imagen del logotipo</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4">
              <div className="w-28 h-24 shrink-0 rounded-xl bg-white border border-[#EFECE6] p-2 flex items-center justify-center overflow-hidden">
                <img
                  src={logoUrl}
                  alt="Logotipo actual"
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              <div className="flex-1 space-y-2.5 text-center sm:text-left">
                <p className="text-xs text-[#6E6259]">
                  Sube una nueva imagen desde tu galería o computadora para actualizar el logotipo en toda la aplicación.
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isProcessingLogo}
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)] transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isProcessingLogo ? 'Cargando...' : 'Subir nuevo logo'}</span>
                  </button>
                  {logoUrl !== DEFAULT_LOGO_PATH && (
                    <button
                      type="button"
                      onClick={onResetLogo}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D1C7] bg-white px-3 py-2 text-xs font-semibold text-[#49403A] hover:bg-[#FAF8F5]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restaurar original</span>
                    </button>
                  )}
                </div>
                {logoError && <p className="text-xs text-red-700">{logoError}</p>}
              </div>
            </div>
          </section>

          {/* Respaldo y sincronización entre dispositivos */}
          <section className="space-y-3">
            <div>
              <span className="text-sm font-bold text-[#1F1A17]">
                Respaldo y sincronización entre dispositivos
              </span>
              <p className="text-xs text-[#6E6259]">
                Guarda o restaura tu tema, modo, logo y {customCharts.length} gráfica(s) personalizada(s) usando tu Google Sheet o un archivo JSON.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7E3DC] bg-[#FAF8F5] p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={!canCloudSync || isSyncingConfig}
                  onClick={handleCloudSave}
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] px-3.5 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)] disabled:opacity-45"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>{isSyncingConfig ? 'Guardando...' : 'Guardar en Google Sheets'}</span>
                </button>
                <button
                  type="button"
                  disabled={!canCloudSync || isSyncingConfig}
                  onClick={handleCloudLoad}
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)] disabled:opacity-45"
                >
                  <CloudDownload className="w-4 h-4 text-[var(--theme-accent)]" />
                  <span>Cargar de Google Sheets</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-xs font-semibold text-[#49403A] hover:bg-[var(--theme-tint)]"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar respaldo JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-3.5 text-xs font-semibold text-[#49403A] hover:bg-[var(--theme-tint)]"
                >
                  <FileUp className="w-4 h-4" />
                  <span>Importar archivo JSON</span>
                </button>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportJson}
                  className="hidden"
                />
              </div>

              {!canCloudSync && (
                <p className="text-[11px] text-[#8C7E73]">
                  Conecta tu hoja de Google Sheets en línea para activar el respaldo directo en la nube.
                </p>
              )}
              {syncMessage && <p className="text-xs font-semibold text-emerald-700">{syncMessage}</p>}
              {syncError && <p className="text-xs font-semibold text-red-700">{syncError}</p>}
            </div>
          </section>
        </div>

        <div className="px-6 py-3.5 bg-[#FAF8F5] border-t border-[#EFECE6] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 rounded-xl bg-[var(--theme-primary)] text-sm font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
