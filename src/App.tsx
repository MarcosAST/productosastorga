import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Home,
  ShoppingBag,
  Users,
  UserPlus,
  Package,
  TrendingUp,
  Receipt,
  Wallet,
  BarChart3,
  FileSpreadsheet,
  RefreshCw,
  LogOut,
  Menu,
  X,
  AlertTriangle,
  Palette,
  Wifi,
  WifiOff,
  CloudUpload,
  Wrench,
  CheckCircle2,
  Truck,
  Sparkles,
} from 'lucide-react';
import {
  AppModule,
  BusinessDataset,
  Cliente,
  ConceptoGasto,
  ConceptoIngreso,
  DriveSpreadsheetFile,
  Egreso,
  FinanzaMensual,
  IngresoOtro,
  Jornada,
  LogicalTabKey,
  MovimientoInventario,
  MovimientoInventarioTipo,
  Producto,
  Ruta,
  SheetTabMapping,
  Sueldo,
  Ticket,
  TicketAbono,
} from './types/business';
import {
  applyAuthPersistence,
  clearCachedAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  loadKeepSignedInPreference,
  logout,
  saveKeepSignedInPreference,
} from './services/auth';
import {
  adjustProductosInventarioByDelta,
  appendCliente,
  appendEgreso,
  appendIngresoOtro,
  appendJornadaAndAssignTickets,
  appendMovimientosInventarioBatch,
  appendProducto,
  appendRuta,
  appendSueldo,
  appendTicketSafe,
  assignTicketsToJornada,
  AuthExpiredError,
  clearJornadaOnEgresos,
  clearJornadaOnTickets,
  createAstorgaSpreadsheet,
  DEFAULT_TAB_NAMES,
  deleteSheetRow,
  detectTabMapping,
  getSpreadsheetMetadata,
  initializeMissingTabs,
  inspectSpreadsheetStructure,
  listUserSpreadsheets,
  loadAllBusinessData,
  loadAppConfigFromSheet,
  repairSpreadsheetStructure,
  updateClienteRow,
  updateEgresoRow,
  updateIngresoOtroRow,
  updateJornadaRow,
  updateProductoRow,
  updateRutaRow,
  updateSueldoRow,
  updateTicketRow,
  upsertAppConfigInSheet,
  upsertConceptoGasto,
  upsertConceptoIngreso,
  upsertFinanzaMensual,
} from './services/sheetsApi';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PWAUpdateBanner } from './components/PWAUpdateBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  ConfirmMutationModal,
  PendingMutation,
} from './components/ConfirmMutationModal';
import { SheetSetupModal } from './components/SheetSetupModal';
import { AppearanceModal } from './components/AppearanceModal';
import { TicketDetailModal } from './components/TicketDetailModal';
import {
  AppTheme,
  PRESET_THEMES,
  SurfaceMode,
  applyThemeToDocument,
  compressLogoForSheetSync,
  loadActiveThemeId,
  loadCustomThemes,
  loadSavedLogo,
  loadSurfaceMode,
  resetCustomLogo,
  saveActiveThemeId,
  saveCustomLogo,
  saveCustomThemes,
  saveSurfaceMode,
} from './utils/themeManager';
import {
  CustomChartConfig,
  loadCustomCharts,
  saveCustomCharts,
} from './utils/customCharts';
import {
  AppSettingsBackupPayload,
  parseSettingsBackupJson,
} from './utils/ticketShare';
import { applyAbonoToTicket } from './utils/paymentHelpers';
import {
  InventoryDelta,
  OfflineQueuedAction,
  loadManualOfflineMode,
  loadOfflineQueue,
  saveManualOfflineMode,
  saveOfflineQueue,
} from './utils/offlineQueue';
import { generateNextFolio, getTodayISO, normalizeText } from './utils/formatters';
import { recalculateJornadaFromTickets } from './utils/incomeConsolidation';
import {
  buildTicketDetalleTexto,
  computeTicketGeneralInventoryEffects,
  computeTicketTotals,
} from './utils/ticketAdjustments';
import { InicioView } from './modules/InicioView';
import { NuevoPedidoView } from './modules/NuevoPedidoView';
import { JornadasView } from './modules/JornadasView';
import { ClientesHistorialView } from './modules/ClientesHistorialView';
import { AgregarClienteView } from './modules/AgregarClienteView';
import { CatalogoEstadisticasView } from './modules/CatalogoEstadisticasView';
import { IngresosRutasView } from './modules/IngresosRutasView';
import { EgresosView } from './modules/EgresosView';
import { FinanzasView } from './modules/FinanzasView';
import { ReportesGraficasView } from './modules/ReportesGraficasView';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAUpdate } from './hooks/usePWAUpdate';

const STORAGE_CONFIG_KEY = 'astorga_sheet_config_v1';
const STORAGE_CACHE_PREFIX = 'astorga_data_cache_v1_';

const EMPTY_DATASET: BusinessDataset = {
  productos: [],
  clientes: [],
  rutas: [],
  tickets: [],
  jornadas: [],
  movimientosInventario: [],
  otrosIngresos: [],
  conceptosIngreso: [],
  egresos: [],
  conceptosGasto: [],
  sueldos: [],
  finanzasMensuales: [],
};

const NAV_ITEMS: {
  id: AppModule;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'inicio', label: 'Inicio', shortLabel: 'Inicio', icon: Home },
  { id: 'nuevo-pedido', label: 'Nuevo pedido', shortLabel: 'Pedido', icon: ShoppingBag },
  { id: 'jornadas', label: 'Jornadas e inventario', shortLabel: 'Jornadas', icon: Truck },
  { id: 'clientes', label: 'Clientes e historial', shortLabel: 'Clientes', icon: Users },
  { id: 'agregar-cliente', label: 'Agregar clientes', shortLabel: 'Nuevo Cli.', icon: UserPlus },
  { id: 'catalogo', label: 'Catálogo e inventario', shortLabel: 'Catálogo', icon: Package },
  { id: 'ingresos', label: 'Ingresos y otros', shortLabel: 'Ingresos', icon: TrendingUp },
  { id: 'egresos', label: 'Egresos y gastos', shortLabel: 'Egresos', icon: Receipt },
  { id: 'finanzas', label: 'Finanzas y sueldos', shortLabel: 'Finanzas', icon: Wallet },
  { id: 'reportes', label: 'Reportes y gráficas', shortLabel: 'Reportes', icon: BarChart3 },
];

export default function App() {
  const isOnline = useOnlineStatus();
  const {
    needRefresh: pwaNeedRefresh,
    showUpdatePrompt,
    isCheckingUpdate,
    isApplyingUpdate,
    updateNotice,
    clearUpdateNotice,
    checkForUpdates,
    applyUpdate,
    forceHardRefresh,
    dismissUpdate,
  } = usePWAUpdate();
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [keepSignedIn, setKeepSignedIn] = useState<boolean>(() =>
    loadKeepSignedInPreference()
  );
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(() =>
    Boolean(getAccessToken())
  );
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState('');

  const [activeModule, setActiveModule] = useState<AppModule>('inicio');
  const [preselectedJornadaId, setPreselectedJornadaId] = useState<string>('');
  const [clientesInitialInactiveFilter, setClientesInitialInactiveFilter] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Google Sheets configuration
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      return saved ? JSON.parse(saved).spreadsheetId || '' : '';
    } catch {
      return '';
    }
  });
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      return saved ? JSON.parse(saved).spreadsheetTitle || '' : '';
    } catch {
      return '';
    }
  });
  const [tabMapping, setTabMapping] = useState<Partial<SheetTabMapping>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      return saved ? JSON.parse(saved).tabMapping || {} : {};
    } catch {
      return {};
    }
  });
  const [availableSheetTitles, setAvailableSheetTitles] = useState<string[]>([]);
  const [missingTabs, setMissingTabs] = useState<LogicalTabKey[]>([]);
  const [sheetHealthIssues, setSheetHealthIssues] = useState<string[]>([]);
  const [sheetRepairNotice, setSheetRepairNotice] = useState<string>('');

  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [showSheetSetup, setShowSheetSetup] = useState(false);

  // Business data
  const [dataset, setDataset] = useState<BusinessDataset>(() => {
    const cacheId = spreadsheetId || 'offline-local';
    try {
      const cached = localStorage.getItem(`${STORAGE_CACHE_PREFIX}${cacheId}`);
      if (!cached) return EMPTY_DATASET;
      const parsed = JSON.parse(cached);
      return {
        ...EMPTY_DATASET,
        ...parsed,
        movimientosInventario: parsed.movimientosInventario || [],
        otrosIngresos: parsed.otrosIngresos || [],
        conceptosIngreso: parsed.conceptosIngreso || [],
      };
    } catch {
      return EMPTY_DATASET;
    }
  });
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');

  // Offline mode & persistent sync queue
  const [manualOfflineMode, setManualOfflineMode] = useState<boolean>(() =>
    loadManualOfflineMode()
  );
  const [offlineSessionEntered, setOfflineSessionEntered] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedAction[]>(() =>
    loadOfflineQueue(spreadsheetId || 'offline-local')
  );
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const effectiveOffline = !isOnline || manualOfflineMode;
  const activeCacheKey = spreadsheetId || 'offline-local';

  // Pending confirmed mutation
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [isSubmittingMutation, setIsSubmittingMutation] = useState(false);

  // Appearance: Logo, Surface Mode, Color Themes & Custom Charts
  const [logoUrl, setLogoUrl] = useState<string>(() => loadSavedLogo());
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(() => loadSurfaceMode());
  const [customThemes, setCustomThemes] = useState<AppTheme[]>(() => loadCustomThemes());
  const [activeThemeId, setActiveThemeId] = useState<string>(() => loadActiveThemeId());
  const [customCharts, setCustomCharts] = useState<CustomChartConfig[]>(() =>
    loadCustomCharts()
  );
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);

  // Ticket detail / edit modal
  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null);
  const [viewingTicketEditMode, setViewingTicketEditMode] = useState(false);

  const openTicketModal = (ticket: Ticket, editMode = false) => {
    setViewingTicket(ticket);
    setViewingTicketEditMode(editMode);
  };

  useEffect(() => {
    const all = [...PRESET_THEMES, ...customThemes];
    const current = all.find((t) => t.id === activeThemeId) || PRESET_THEMES[0];
    applyThemeToDocument(current, surfaceMode);
  }, [activeThemeId, customThemes, surfaceMode]);

  const handleChangeSurfaceMode = (mode: SurfaceMode) => {
    setSurfaceMode(mode);
    saveSurfaceMode(mode);
  };

  const handleChangeLogo = (newUrl: string) => {
    saveCustomLogo(newUrl);
    setLogoUrl(newUrl);
  };

  const handleResetLogo = () => {
    const def = resetCustomLogo();
    setLogoUrl(def);
  };

  const handleSelectTheme = (theme: AppTheme) => {
    setActiveThemeId(theme.id);
    saveActiveThemeId(theme.id);
  };

  const handleAddCustomTheme = (theme: AppTheme) => {
    const next = [...customThemes, theme];
    setCustomThemes(next);
    saveCustomThemes(next);
  };

  const handleDeleteCustomTheme = (id: string) => {
    const next = customThemes.filter((t) => t.id !== id);
    setCustomThemes(next);
    saveCustomThemes(next);
    if (activeThemeId === id) {
      setActiveThemeId(PRESET_THEMES[0].id);
      saveActiveThemeId(PRESET_THEMES[0].id);
    }
  };

  const handleChangeCustomCharts = (next: CustomChartConfig[]) => {
    setCustomCharts(next);
    saveCustomCharts(next);
  };

  const buildSettingsBackupPayload = async (
    forGoogleSheet: boolean
  ): Promise<AppSettingsBackupPayload> => {
    const compressedLogo = forGoogleSheet
      ? await compressLogoForSheetSync(logoUrl, 42000)
      : logoUrl;
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      activeThemeId,
      surfaceMode,
      customThemes,
      customCharts,
      logoUrl: compressedLogo,
    };
  };

  const handleApplySettingsBackup = (payload: AppSettingsBackupPayload) => {
    const nextSurface: SurfaceMode =
      payload.surfaceMode === 'oscuro' || payload.surfaceMode === 'nitido'
        ? payload.surfaceMode
        : 'claro';
    setSurfaceMode(nextSurface);
    saveSurfaceMode(nextSurface);

    if (Array.isArray(payload.customThemes)) {
      setCustomThemes(payload.customThemes);
      saveCustomThemes(payload.customThemes);
    }
    if (payload.activeThemeId) {
      setActiveThemeId(payload.activeThemeId);
      saveActiveThemeId(payload.activeThemeId);
    }
    if (Array.isArray(payload.customCharts)) {
      setCustomCharts(payload.customCharts);
      saveCustomCharts(payload.customCharts);
    }
    if (payload.logoUrl) {
      saveCustomLogo(payload.logoUrl);
      setLogoUrl(payload.logoUrl);
    }
  };

  const persistDatasetCache = useCallback(
    (nextData: BusinessDataset, keyOverride?: string) => {
      const targetKey = keyOverride || activeCacheKey;
      try {
        localStorage.setItem(`${STORAGE_CACHE_PREFIX}${targetKey}`, JSON.stringify(nextData));
      } catch {
        // Ignore storage quota errors
      }
    },
    [activeCacheKey]
  );

  const updateOfflineQueueState = useCallback(
    (nextQueue: OfflineQueuedAction[], keyOverride?: string) => {
      const targetKey = keyOverride || activeCacheKey;
      setOfflineQueue(nextQueue);
      saveOfflineQueue(targetKey, nextQueue);
    },
    [activeCacheKey]
  );

  const enqueueOfflineMutation = useCallback(
    (action: OfflineQueuedAction, nextDataset: BusinessDataset) => {
      setDataset(nextDataset);
      persistDatasetCache(nextDataset);
      const nextQueue = [...offlineQueue, action];
      updateOfflineQueueState(nextQueue);
    },
    [offlineQueue, persistDatasetCache, updateOfflineQueueState]
  );

  const enqueueOfflineMutations = useCallback(
    (actions: OfflineQueuedAction[], nextDataset: BusinessDataset) => {
      setDataset(nextDataset);
      persistDatasetCache(nextDataset);
      const nextQueue = [...offlineQueue, ...actions];
      updateOfflineQueueState(nextQueue);
    },
    [offlineQueue, persistDatasetCache, updateOfflineQueueState]
  );

  const persistSheetConfig = (
    id: string,
    title: string,
    mapping: Partial<SheetTabMapping>
  ) => {
    try {
      localStorage.setItem(
        STORAGE_CONFIG_KEY,
        JSON.stringify({ spreadsheetId: id, spreadsheetTitle: title, tabMapping: mapping })
      );
    } catch {
      // Ignore storage quota errors
    }
  };

  const handleToggleKeepSignedIn = (nextValue: boolean) => {
    setKeepSignedIn(nextValue);
    saveKeepSignedInPreference(nextValue);
    void applyAuthPersistence(nextValue);
  };

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof AuthExpiredError) {
        clearCachedAccessToken();
        setHasGoogleToken(false);
        if (user && loadKeepSignedInPreference()) {
          setDataError(
            'La conexión con Google Sheets expiró. Toca "Sincronizar" para renovarla sin cerrar tu sesión.'
          );
        } else {
          setNeedsAuth(true);
          setAuthError(err.message);
        }
        return;
      }
      const msg =
        err instanceof Error ? err.message : 'Ocurrió un error al comunicarse con Google Sheets.';
      setDataError(msg);
    },
    [user]
  );

  const refreshDriveFiles = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsLoadingFiles(true);
    try {
      const files = await listUserSpreadsheets(token);
      setDriveFiles(files);
    } catch (err) {
      handleApiError(err);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [handleApiError]);

  const syncSpreadsheetData = useCallback(
    async (id: string, mappingOverride?: Partial<SheetTabMapping>) => {
      const token = getAccessToken();
      if (!token || !id) return;
      setIsLoadingData(true);
      setDataError('');
      try {
        const meta = await getSpreadsheetMetadata(token, id);
        setAvailableSheetTitles(meta.sheetTitles);
        setSpreadsheetTitle(meta.title);

        let effectiveMapping = mappingOverride;
        let detectedMissing: LogicalTabKey[] = [];

        if (!effectiveMapping || Object.keys(effectiveMapping).length === 0) {
          const detected = detectTabMapping(meta.sheetTitles);
          effectiveMapping = detected.mapping;
          detectedMissing = detected.missingKeys;
        } else {
          // Verify mapped tabs still exist
          const titleSet = new Set(meta.sheetTitles);
          const cleaned: Partial<SheetTabMapping> = {};
          (Object.keys(DEFAULT_TAB_NAMES) as LogicalTabKey[]).forEach((k) => {
            const mapped = effectiveMapping?.[k];
            if (mapped && titleSet.has(mapped)) {
              cleaned[k] = mapped;
            }
          });
          const fallback = detectTabMapping(meta.sheetTitles);
          (Object.keys(DEFAULT_TAB_NAMES) as LogicalTabKey[]).forEach((k) => {
            if (!cleaned[k] && fallback.mapping[k]) {
              cleaned[k] = fallback.mapping[k];
            }
          });
          effectiveMapping = cleaned;
          detectedMissing = (Object.keys(DEFAULT_TAB_NAMES) as LogicalTabKey[]).filter(
            (k) => !cleaned[k]
          );
        }

        setTabMapping(effectiveMapping);
        setMissingTabs(detectedMissing);
        persistSheetConfig(id, meta.title, effectiveMapping);

        const loaded = await loadAllBusinessData(token, id, effectiveMapping);
        setDataset(loaded);
        try {
          localStorage.setItem(`${STORAGE_CACHE_PREFIX}${id}`, JSON.stringify(loaded));
        } catch {
          // Ignore cache write error
        }

        try {
          const health = await inspectSpreadsheetStructure(
            token,
            id,
            effectiveMapping,
            meta.sheetTitles
          );
          setSheetHealthIssues(health.issues);
        } catch {
          setSheetHealthIssues([]);
        }
      } catch (err) {
        handleApiError(err);
      } finally {
        setIsLoadingData(false);
      }
    },
    [handleApiError]
  );

  // Initialize auth listener
  useEffect(() => {
    const unsub = initAuth(
      (signedInUser) => {
        setUser(signedInUser);
        setHasGoogleToken(Boolean(getAccessToken()));
        setNeedsAuth(false);
        setIsAuthChecking(false);
        setAuthError('');
      },
      (firebaseUser) => {
        setUser(firebaseUser);
        setHasGoogleToken(false);
        const shouldKeepSession = Boolean(firebaseUser) && loadKeepSignedInPreference();
        setNeedsAuth(!shouldKeepSession);
        setIsAuthChecking(false);
      }
    );
    return () => unsub();
  }, []);

  // Load files and data once authenticated with an active Google token
  useEffect(() => {
    if (!needsAuth && hasGoogleToken && getAccessToken()) {
      refreshDriveFiles();
      if (spreadsheetId) {
        syncSpreadsheetData(spreadsheetId, tabMapping);
      } else {
        setShowSheetSetup(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAuth, hasGoogleToken]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError('');
    try {
      const result = await googleSignIn();
      if (result) {
        saveKeepSignedInPreference(keepSignedIn);
        void applyAuthPersistence(keepSignedIn);
        setUser(result.user);
        setHasGoogleToken(true);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo completar el inicio de sesión con Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleReconnectGoogle = async (): Promise<string | null> => {
    setIsLoggingIn(true);
    setDataError('');
    try {
      const result = await googleSignIn({ loginHint: user?.email || undefined });
      if (result) {
        setUser(result.user);
        setHasGoogleToken(true);
        setNeedsAuth(false);
        return result.accessToken;
      }
      return null;
    } catch (err: any) {
      setDataError(err?.message || 'No se pudo conectar con Google Sheets.');
      return null;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleManualRefreshFiles = async () => {
    if (!getAccessToken()) {
      const token = await handleReconnectGoogle();
      if (!token) return;
    }
    await refreshDriveFiles();
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setHasGoogleToken(false);
    setNeedsAuth(true);
    setOfflineSessionEntered(false);
    setMobileMenuOpen(false);
  };

  const handleSelectSpreadsheet = async (newId: string) => {
    if (!getAccessToken()) {
      const token = await handleReconnectGoogle();
      if (!token) return;
    }
    setSpreadsheetId(newId);
    setTabMapping({});
    setOfflineQueue(loadOfflineQueue(newId));
    await syncSpreadsheetData(newId, {});
    setShowSheetSetup(false);
  };

  const handleCreateNewSpreadsheet = (customTitle: string, migrateCurrentData: boolean) => {
    const cleanTitle = customTitle.trim() || 'Productos Astorga - Registro Completo';
    const hasSeedData =
      migrateCurrentData &&
      (dataset.productos.length > 0 ||
        dataset.clientes.length > 0 ||
        dataset.rutas.length > 0 ||
        dataset.tickets.length > 0 ||
        (dataset.otrosIngresos || []).length > 0 ||
        dataset.egresos.length > 0 ||
        dataset.sueldos.length > 0);

    setPendingMutation({
      title: hasSeedData
        ? 'Crear documento mejorado y migrar datos'
        : 'Crear nuevo documento mejorado en Google Sheets',
      description: hasSeedData
        ? `Se creará "${cleanTitle}" con 14 pestañas organizadas (incluyendo Resumen_General, Kardex de Inventario, Cobranza y Configuracion) y se copiarán todos tus registros actuales.`
        : `Se creará "${cleanTitle}" en tu cuenta de Google con 14 pestañas formateadas por color, filtros y la hoja Resumen_General con fórmulas automáticas.`,
      sheetTab: 'Nuevo archivo en Google Sheets',
      details: [
        { label: 'Nombre del documento', value: cleanTitle },
        {
          label: 'Estructura',
          value: '14 hojas (Resumen_General + 13 hojas de datos)',
        },
        {
          label: 'Datos iniciales',
          value: hasSeedData
            ? `${dataset.productos.length} prod. · ${dataset.clientes.length} cli. · ${dataset.tickets.length} tickets`
            : 'Documento limpio listo para capturar',
        },
      ],
      confirmLabel: hasSeedData ? 'Crear y copiar datos' : 'Crear documento nuevo',
      onConfirm: async () => {
        const token = getAccessToken();
        if (!token) throw new AuthExpiredError();
        const { metadata, mapping } = await createAstorgaSpreadsheet(
          token,
          cleanTitle,
          hasSeedData ? dataset : undefined
        );
        setSpreadsheetId(metadata.spreadsheetId);
        setSpreadsheetTitle(metadata.title);
        setAvailableSheetTitles(metadata.sheetTitles);
        setTabMapping(mapping);
        setMissingTabs([]);
        persistSheetConfig(metadata.spreadsheetId, metadata.title, mapping);
        updateOfflineQueueState([], metadata.spreadsheetId);
        if (hasSeedData) {
          await syncSpreadsheetData(metadata.spreadsheetId, mapping);
        } else {
          setDataset(EMPTY_DATASET);
          persistDatasetCache(EMPTY_DATASET, metadata.spreadsheetId);
        }
        await refreshDriveFiles();
        setShowSheetSetup(false);
      },
    });
  };

  const handleInitializeMissingTabs = () => {
    if (!spreadsheetId || missingTabs.length === 0) return;
    setPendingMutation({
      title: 'Crear pestañas faltantes',
      description: `Se agregarán ${missingTabs.length} pestaña(s) con sus encabezados a "${spreadsheetTitle}" sin modificar tus datos existentes.`,
      sheetTab: spreadsheetTitle,
      details: [
        {
          label: 'Pestañas a crear',
          value: missingTabs.map((k) => DEFAULT_TAB_NAMES[k]).join(', '),
        },
      ],
      confirmLabel: 'Crear pestañas',
      onConfirm: async () => {
        const token = getAccessToken();
        if (!token) throw new AuthExpiredError();
        const added = await initializeMissingTabs(token, spreadsheetId, missingTabs);
        const merged = { ...tabMapping, ...added };
        await syncSpreadsheetData(spreadsheetId, merged);
      },
    });
  };

  const handleRepairSpreadsheet = () => {
    if (!spreadsheetId) return;
    setPendingMutation({
      title: 'Revisar y ajustar hojas del documento',
      description: `Se revisarán todas las hojas de "${spreadsheetTitle}" para asegurar que tengan sus encabezados, columnas completas, formato de moneda, filtros y Resumen_General con fórmulas. No se borrará ningún registro existente.`,
      sheetTab: spreadsheetTitle,
      details:
        sheetHealthIssues.length > 0
          ? sheetHealthIssues.slice(0, 4).map((issue, idx) => ({
              label: `Ajuste ${idx + 1}`,
              value: issue,
            }))
          : [
              {
                label: 'Alcance',
                value: 'Las 13 hojas de datos + Resumen_General',
              },
            ],
      confirmLabel: 'Revisar y ajustar hojas',
      onConfirm: async () => {
        const token = getAccessToken();
        if (!token) throw new AuthExpiredError();
        const result = await repairSpreadsheetStructure(token, spreadsheetId, tabMapping);
        setTabMapping(result.mapping);
        persistSheetConfig(spreadsheetId, result.metadata.title, result.mapping);
        setSheetRepairNotice(result.repairsApplied.join(' '));
        await syncSpreadsheetData(spreadsheetId, result.mapping);
      },
    });
  };

  const handleUpdateTabMapping = (key: LogicalTabKey, tabName: string) => {
    const next = { ...tabMapping, [key]: tabName || undefined };
    setTabMapping(next);
    persistSheetConfig(spreadsheetId, spreadsheetTitle, next);
    if (spreadsheetId && getAccessToken()) {
      syncSpreadsheetData(spreadsheetId, next);
    }
  };

  const executePendingMutation = async () => {
    if (!pendingMutation) return;
    setIsSubmittingMutation(true);
    setDataError('');
    try {
      await pendingMutation.onConfirm();
      setPendingMutation(null);
    } catch (err) {
      setPendingMutation(null);
      handleApiError(err);
    } finally {
      setIsSubmittingMutation(false);
    }
  };

  // Helper to ensure tab exists before writing
  const requireTab = (key: LogicalTabKey): string => {
    const name = tabMapping[key];
    if (!name) {
      setShowSheetSetup(true);
      throw new Error(
        `Falta asignar o crear la pestaña "${DEFAULT_TAB_NAMES[key]}" en tu Google Sheet.`
      );
    }
    return name;
  };

  const shouldSaveOffline = () => effectiveOffline || !getAccessToken() || !spreadsheetId;

  const toggleManualOfflineMode = (nextValue: boolean) => {
    setManualOfflineMode(nextValue);
    saveManualOfflineMode(nextValue);
    if (nextValue) {
      setOfflineSessionEntered(true);
    } else if (!getAccessToken()) {
      if (user && keepSignedIn) {
        setOfflineSessionEntered(true);
      } else {
        setOfflineSessionEntered(false);
        setNeedsAuth(true);
        setAuthError('Inicia sesión con Google para conectar y sincronizar con Google Sheets.');
      }
    } else if (isOnline && spreadsheetId) {
      if (offlineQueue.length > 0) {
        syncOfflineQueue();
      } else {
        syncSpreadsheetData(spreadsheetId, tabMapping);
      }
    }
  };

  const syncOfflineQueue = async () => {
    let token = getAccessToken();
    if (!token) {
      if (user && keepSignedIn) {
        token = await handleReconnectGoogle();
        if (!token) return;
      } else {
        setOfflineSessionEntered(false);
        setNeedsAuth(true);
        setAuthError('Inicia sesión con Google para subir tus registros offline a Google Sheets.');
        return;
      }
    }
    if (!spreadsheetId) {
      setShowSheetSetup(true);
      return;
    }
    if (offlineQueue.length === 0) {
      await syncSpreadsheetData(spreadsheetId, tabMapping);
      return;
    }

    setIsSyncingQueue(true);
    setDataError('');
    let remaining = [...offlineQueue];
    const remappedJornadaIds = new Map<string, string>();

    try {
      const mutableMapping = { ...tabMapping };
      const persistMappingChange = (key: LogicalTabKey, tabName: string) => {
        mutableMapping[key] = tabName;
        setTabMapping({ ...mutableMapping });
        persistSheetConfig(spreadsheetId, spreadsheetTitle, mutableMapping);
      };

      const ensureTabDuringSync = async (key: LogicalTabKey): Promise<string> => {
        let tab = mutableMapping[key];
        if (!tab) {
          const added = await initializeMissingTabs(token, spreadsheetId, [key]);
          tab = added[key] || DEFAULT_TAB_NAMES[key];
          persistMappingChange(key, tab);
        }
        return tab;
      };

      while (remaining.length > 0) {
        const action = remaining[0];
        if (action.type === 'create_ruta') {
          await appendRuta(token, spreadsheetId, requireTab('rutas'), {
            nombre: action.nombre,
            descripcion: action.descripcion,
            activa: true,
          });
        } else if (action.type === 'update_ruta') {
          if (action.ruta.rowNumber && action.ruta.rowNumber >= 2) {
            await updateRutaRow(token, spreadsheetId, requireTab('rutas'), action.ruta);
          }
          if (action.oldNombre && action.oldNombre !== action.ruta.nombre) {
            const loaded = await loadAllBusinessData(token, spreadsheetId, mutableMapping);
            if (mutableMapping.clientes) {
              for (const c of loaded.clientes) {
                if (c.ruta === action.oldNombre && c.rowNumber && c.rowNumber >= 2) {
                  await updateClienteRow(token, spreadsheetId, mutableMapping.clientes, {
                    ...c,
                    ruta: action.ruta.nombre,
                  });
                }
              }
            }
            if (mutableMapping.tickets) {
              for (const t of loaded.tickets) {
                if (t.ruta === action.oldNombre && t.rowNumber && t.rowNumber >= 2) {
                  await updateTicketRow(token, spreadsheetId, mutableMapping.tickets, {
                    ...t,
                    ruta: action.ruta.nombre,
                  });
                }
              }
            }
            if (mutableMapping.jornadas) {
              for (const j of loaded.jornadas) {
                if (j.ruta === action.oldNombre && j.rowNumber && j.rowNumber >= 2) {
                  await updateJornadaRow(token, spreadsheetId, mutableMapping.jornadas, {
                    ...j,
                    ruta: action.ruta.nombre,
                  });
                }
              }
            }
          }
        } else if (action.type === 'create_ticket') {
          const mappedJornadaId =
            (action.draft.jornadaId && remappedJornadaIds.get(action.draft.jornadaId)) ||
            action.draft.jornadaId;
          const createdTicket = await appendTicketSafe(token, spreadsheetId, requireTab('tickets'), {
            ...action.draft,
            jornadaId: mappedJornadaId,
          });
          if (action.deductGeneralInventory && !mappedJornadaId && mutableMapping.productos) {
            const { stockDeltas, kardexGroups } = computeTicketGeneralInventoryEffects(
              action.draft.items
            );
            let postProducts = dataset.productos;
            if (stockDeltas.length > 0) {
              postProducts = applyLocalInventoryDeltas(dataset.productos, stockDeltas);
              await adjustProductosInventarioByDelta(
                token,
                spreadsheetId,
                mutableMapping.productos,
                stockDeltas
              );
            }
            const movs = buildTicketKardexMovimientos(
              kardexGroups,
              createdTicket.folio,
              action.draft.clienteNombre,
              action.draft.fecha,
              postProducts
            );
            if (movs.length > 0) {
              const movTab = await ensureTabDuringSync('movimientosInventario');
              await appendMovimientosInventarioBatch(token, spreadsheetId, movTab, movs);
            }
          }
        } else if (action.type === 'update_ticket') {
          if (action.ticket.rowNumber && action.ticket.rowNumber >= 2) {
            const mappedJornadaId =
              (action.ticket.jornadaId && remappedJornadaIds.get(action.ticket.jornadaId)) ||
              action.ticket.jornadaId;
            await updateTicketRow(token, spreadsheetId, requireTab('tickets'), {
              ...action.ticket,
              jornadaId: mappedJornadaId,
            });
          }
        } else if (action.type === 'delete_ticket') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(token, spreadsheetId, requireTab('tickets'), action.rowNumber);
            remaining = remaining.map((a) =>
              a.type === 'delete_ticket' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
        } else if (action.type === 'create_cliente') {
          if (action.newRutaNombre && mutableMapping.rutas) {
            await appendRuta(token, spreadsheetId, mutableMapping.rutas, {
              nombre: action.newRutaNombre,
              descripcion: '',
              activa: true,
            });
          }
          await appendCliente(token, spreadsheetId, requireTab('clientes'), action.draft);
        } else if (action.type === 'update_cliente') {
          if (action.cliente.rowNumber && action.cliente.rowNumber >= 2) {
            await updateClienteRow(token, spreadsheetId, requireTab('clientes'), action.cliente);
          }
        } else if (action.type === 'delete_cliente') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(token, spreadsheetId, requireTab('clientes'), action.rowNumber);
            remaining = remaining.map((a) =>
              a.type === 'delete_cliente' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
        } else if (action.type === 'create_producto') {
          await appendProducto(token, spreadsheetId, requireTab('productos'), action.draft);
        } else if (action.type === 'update_producto') {
          if (action.prod.rowNumber && action.prod.rowNumber >= 2) {
            await updateProductoRow(token, spreadsheetId, requireTab('productos'), action.prod);
          }
        } else if (action.type === 'delete_producto') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(token, spreadsheetId, requireTab('productos'), action.rowNumber);
            remaining = remaining.map((a) =>
              a.type === 'delete_producto' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
        } else if (action.type === 'adjust_inventario') {
          await adjustProductosInventarioByDelta(
            token,
            spreadsheetId,
            requireTab('productos'),
            action.deltas
          );
          const movTab = await ensureTabDuringSync('movimientosInventario');
          await appendMovimientosInventarioBatch(
            token,
            spreadsheetId,
            movTab,
            buildMovimientosFromDeltas(
              action.deltas,
              'Ajuste manual',
              'Ajuste rápido',
              action.summary
            )
          );
        } else if (action.type === 'create_movimientos_inv') {
          if (action.adjustDeltas && action.adjustDeltas.length > 0 && mutableMapping.productos) {
            await adjustProductosInventarioByDelta(
              token,
              spreadsheetId,
              mutableMapping.productos,
              action.adjustDeltas
            );
          }
          if (action.items.length > 0) {
            const movTab = await ensureTabDuringSync('movimientosInventario');
            await appendMovimientosInventarioBatch(token, spreadsheetId, movTab, action.items);
          }
        } else if (action.type === 'create_jornada') {
          const created = await appendJornadaAndAssignTickets(
            token,
            spreadsheetId,
            requireTab('jornadas'),
            requireTab('tickets'),
            action.draft,
            action.selectedTickets
          );
          remappedJornadaIds.set(action.tempId, created.id);
          if (action.inventoryDeltas && action.inventoryDeltas.length > 0 && mutableMapping.productos) {
            await adjustProductosInventarioByDelta(
              token,
              spreadsheetId,
              mutableMapping.productos,
              action.inventoryDeltas
            );
            const movTab = await ensureTabDuringSync('movimientosInventario');
            await appendMovimientosInventarioBatch(
              token,
              spreadsheetId,
              movTab,
              buildMovimientosFromDeltas(
                action.inventoryDeltas,
                'Carga jornada',
                created.nombre,
                `Carga inicial ruta ${created.ruta}`,
                created.fecha
              )
            );
          }
        } else if (action.type === 'update_jornada') {
          if (action.jornada.rowNumber && action.jornada.rowNumber >= 2) {
            await updateJornadaRow(token, spreadsheetId, requireTab('jornadas'), action.jornada);
          }
          if (action.assignedTickets && action.assignedTickets.length > 0 && mutableMapping.tickets) {
            await assignTicketsToJornada(
              token,
              spreadsheetId,
              mutableMapping.tickets,
              action.jornada.id,
              action.assignedTickets
            );
          }
          if (action.inventoryDeltas && action.inventoryDeltas.length > 0 && mutableMapping.productos) {
            await adjustProductosInventarioByDelta(
              token,
              spreadsheetId,
              mutableMapping.productos,
              action.inventoryDeltas
            );
            const movTab = await ensureTabDuringSync('movimientosInventario');
            await appendMovimientosInventarioBatch(
              token,
              spreadsheetId,
              movTab,
              buildMovimientosFromDeltas(
                action.inventoryDeltas,
                'Carga jornada',
                action.jornada.nombre,
                'Ajuste carga en jornada',
                action.jornada.fecha
              )
            );
          }
        } else if (action.type === 'finalize_jornada') {
          if (action.jornada.rowNumber && action.jornada.rowNumber >= 2) {
            await updateJornadaRow(token, spreadsheetId, requireTab('jornadas'), action.jornada);
          }
          if (action.returnDeltas.length > 0 && mutableMapping.productos) {
            await adjustProductosInventarioByDelta(
              token,
              spreadsheetId,
              mutableMapping.productos,
              action.returnDeltas
            );
          }
          const concItems = (action.jornada.conciliacion || [])
            .filter((c) => c.diferencia !== 0 && c.motivo !== 'Sin novedad')
            .map((c) => ({
              fecha: action.jornada.fecha,
              tipo: (c.motivo === 'Merma'
                ? 'Merma'
                : c.motivo === 'Cortesía'
                ? 'Cortesía'
                : 'Faltante jornada') as MovimientoInventarioTipo,
              productoId: c.productoId,
              productoNombre: c.productoNombre,
              cantidadDelta: c.diferencia,
              stockResultante: 0,
              referencia: action.jornada.nombre,
              notas: c.notas || c.motivo,
            }));
          const retItems = buildMovimientosFromDeltas(
            action.returnDeltas,
            'Devolución jornada',
            action.jornada.nombre,
            'Devolución al cierre de jornada',
            action.jornada.fecha
          );
          if (retItems.length > 0 || concItems.length > 0) {
            const movTab = await ensureTabDuringSync('movimientosInventario');
            await appendMovimientosInventarioBatch(token, spreadsheetId, movTab, [
              ...retItems,
              ...concItems,
            ]);
          }
        } else if (action.type === 'delete_jornada') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(token, spreadsheetId, requireTab('jornadas'), action.rowNumber);
            remaining = remaining.map((a) =>
              a.type === 'delete_jornada' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
          if (action.restoreDeltas && action.restoreDeltas.length > 0 && mutableMapping.productos) {
            await adjustProductosInventarioByDelta(
              token,
              spreadsheetId,
              mutableMapping.productos,
              action.restoreDeltas
            );
          }
        } else if (action.type === 'create_ingreso_otro') {
          const ingresosTab = await ensureTabDuringSync('otrosIngresos');
          await appendIngresoOtro(token, spreadsheetId, ingresosTab, action.draft);
          if (action.saveConcept) {
            const conceptosTab = await ensureTabDuringSync('conceptosIngreso');
            await upsertConceptoIngreso(token, spreadsheetId, conceptosTab, action.saveConcept);
          }
        } else if (action.type === 'update_ingreso_otro') {
          if (action.ingreso.rowNumber && action.ingreso.rowNumber >= 2) {
            await updateIngresoOtroRow(
              token,
              spreadsheetId,
              requireTab('otrosIngresos'),
              action.ingreso
            );
          }
        } else if (action.type === 'create_concepto_ingreso') {
          const conceptosTab = await ensureTabDuringSync('conceptosIngreso');
          await upsertConceptoIngreso(token, spreadsheetId, conceptosTab, action.draft);
        } else if (action.type === 'delete_ingreso_otro') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(token, spreadsheetId, requireTab('otrosIngresos'), action.rowNumber);
            remaining = remaining.map((a) =>
              a.type === 'delete_ingreso_otro' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
        } else if (action.type === 'delete_concepto_ingreso') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(
              token,
              spreadsheetId,
              requireTab('conceptosIngreso'),
              action.rowNumber
            );
            remaining = remaining.map((a) =>
              a.type === 'delete_concepto_ingreso' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
        } else if (action.type === 'create_egreso') {
          const mappedJornadaId =
            (action.draft.jornadaId && remappedJornadaIds.get(action.draft.jornadaId)) ||
            action.draft.jornadaId;
          await appendEgreso(token, spreadsheetId, requireTab('egresos'), {
            ...action.draft,
            jornadaId: mappedJornadaId,
          });
          if (action.saveConcept) {
            const conceptosTab = await ensureTabDuringSync('conceptosGasto');
            await upsertConceptoGasto(token, spreadsheetId, conceptosTab, action.saveConcept);
          }
        } else if (action.type === 'update_egreso') {
          if (action.egreso.rowNumber && action.egreso.rowNumber >= 2) {
            const mappedJornadaId =
              (action.egreso.jornadaId && remappedJornadaIds.get(action.egreso.jornadaId)) ||
              action.egreso.jornadaId;
            await updateEgresoRow(token, spreadsheetId, requireTab('egresos'), {
              ...action.egreso,
              jornadaId: mappedJornadaId,
            });
          }
        } else if (action.type === 'create_concepto') {
          const conceptosTab = await ensureTabDuringSync('conceptosGasto');
          await upsertConceptoGasto(token, spreadsheetId, conceptosTab, action.draft);
        } else if (action.type === 'delete_egreso') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(token, spreadsheetId, requireTab('egresos'), action.rowNumber);
            remaining = remaining.map((a) =>
              a.type === 'delete_egreso' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
        } else if (action.type === 'delete_concepto') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(
              token,
              spreadsheetId,
              requireTab('conceptosGasto'),
              action.rowNumber
            );
            remaining = remaining.map((a) =>
              a.type === 'delete_concepto' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
        } else if (action.type === 'create_sueldo') {
          await appendSueldo(token, spreadsheetId, requireTab('sueldos'), action.draft);
        } else if (action.type === 'update_sueldo') {
          if (action.sueldo.rowNumber && action.sueldo.rowNumber >= 2) {
            await updateSueldoRow(token, spreadsheetId, requireTab('sueldos'), action.sueldo);
          }
        } else if (action.type === 'delete_sueldo') {
          if (action.rowNumber && action.rowNumber >= 2) {
            await deleteSheetRow(token, spreadsheetId, requireTab('sueldos'), action.rowNumber);
            remaining = remaining.map((a) =>
              a.type === 'delete_sueldo' && a.rowNumber && a.rowNumber > action.rowNumber!
                ? { ...a, rowNumber: a.rowNumber - 1 }
                : a
            );
          }
        } else if (action.type === 'upsert_finanza') {
          await upsertFinanzaMensual(
            token,
            spreadsheetId,
            requireTab('finanzasMensuales'),
            action.record
          );
        } else if (action.type === 'close_month') {
          const finTab = requireTab('finanzasMensuales');
          await upsertFinanzaMensual(token, spreadsheetId, finTab, action.closedRecord);
          await upsertFinanzaMensual(token, spreadsheetId, finTab, action.nextMonthRecord);
        }

        remaining = remaining.slice(1);
        updateOfflineQueueState(remaining);
      }

      await syncSpreadsheetData(spreadsheetId, mutableMapping);
    } catch (err) {
      updateOfflineQueueState(remaining);
      handleApiError(err);
    } finally {
      setIsSyncingQueue(false);
    }
  };

  // Business mutation handlers (online Google Sheets + offline local queue support)
  const handleCreateRuta = async (nombre: string, descripcion: string) => {
    if (shouldSaveOffline()) {
      const localRuta = {
        id: `RUT-OFF-${Date.now().toString().slice(-6)}`,
        nombre,
        descripcion,
        activa: true,
        rowNumber: -1,
      };
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Nueva ruta: ${nombre}`,
          type: 'create_ruta',
          nombre,
          descripcion,
        },
        { ...dataset, rutas: [...dataset.rutas, localRuta] }
      );
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('rutas');
    await appendRuta(token, spreadsheetId, tab, { nombre, descripcion, activa: true });
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const applyLocalInventoryDeltas = (
    productos: Producto[],
    deltas: InventoryDelta[]
  ): Producto[] => {
    if (deltas.length === 0) return productos;
    const byId = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const d of deltas) {
      if (d.productoId) {
        byId.set(d.productoId, (byId.get(d.productoId) || 0) + d.delta);
      }
      if (d.productoNombre) {
        const n = normalizeText(d.productoNombre);
        byName.set(n, (byName.get(n) || 0) + d.delta);
      }
    }
    return productos.map((p) => {
      const delta =
        byId.get(p.id) ?? byName.get(normalizeText(p.nombre)) ?? 0;
      if (delta === 0) return p;
      return {
        ...p,
        inventario: Math.max(0, (p.inventario ?? 0) + delta),
      };
    });
  };

  const mergeInventoryDeltas = (
    base: InventoryDelta[] = [],
    extra: InventoryDelta[] = []
  ): InventoryDelta[] => {
    const map = new Map<string, InventoryDelta>();
    for (const d of [...base, ...extra]) {
      const key = d.productoId || normalizeText(d.productoNombre);
      const curr = map.get(key);
      if (curr) {
        curr.delta += d.delta;
      } else {
        map.set(key, { ...d });
      }
    }
    return Array.from(map.values()).filter((d) => d.delta !== 0);
  };

  const buildMovimientosFromDeltas = (
    deltas: InventoryDelta[],
    tipo: MovimientoInventarioTipo,
    referencia: string,
    notas: string,
    fecha = getTodayISO(),
    postProducts?: Producto[]
  ): Omit<MovimientoInventario, 'id'>[] => {
    const productList = postProducts || dataset.productos;
    return deltas
      .filter((d) => d.delta !== 0)
      .map((d) => {
        const matched = productList.find(
          (p) =>
            (d.productoId && p.id === d.productoId) ||
            normalizeText(p.nombre) === normalizeText(d.productoNombre)
        );
        return {
          fecha,
          tipo,
          productoId: d.productoId || matched?.id || '',
          productoNombre: d.productoNombre || matched?.nombre || '',
          cantidadDelta: d.delta,
          stockResultante: matched ? matched.inventario : 0,
          referencia,
          notas,
        };
      });
  };

  const buildTicketKardexMovimientos = (
    kardexGroups: ReturnType<typeof computeTicketGeneralInventoryEffects>['kardexGroups'],
    referencia: string,
    clienteNombre: string,
    fecha = getTodayISO(),
    postProducts?: Producto[]
  ): Omit<MovimientoInventario, 'id'>[] => {
    const productList = postProducts || dataset.productos;
    const out: Omit<MovimientoInventario, 'id'>[] = [];
    for (const group of kardexGroups) {
      for (const d of group.deltas) {
        if (d.delta === 0 && group.tipo !== 'Merma' && group.tipo !== 'Cambio cliente') {
          continue;
        }
        const matched = productList.find(
          (p) =>
            (d.productoId && p.id === d.productoId) ||
            normalizeText(p.nombre) === normalizeText(d.productoNombre)
        );
        out.push({
          fecha,
          tipo: group.tipo,
          productoId: d.productoId || matched?.id || '',
          productoNombre: d.productoNombre || matched?.nombre || '',
          cantidadDelta: d.delta,
          stockResultante: matched ? matched.inventario : 0,
          referencia,
          notas: d.noteSuffix
            ? `Cliente: ${clienteNombre} · ${d.noteSuffix}`
            : `Cliente: ${clienteNombre}`,
        });
      }
    }
    return out;
  };

  const makeLocalMovimientos = (
    items: Omit<MovimientoInventario, 'id'>[]
  ): MovimientoInventario[] => {
    const stamp = Date.now().toString().slice(-6);
    return items.map((m, idx) => ({
      ...m,
      id: `MOV-OFF-${stamp}-${idx + 1}`,
      rowNumber: -1,
    }));
  };

  const appendMovimientosSmart = async (
    token: string,
    items: Omit<MovimientoInventario, 'id'>[],
    mappingBase: Partial<SheetTabMapping> = tabMapping
  ): Promise<Partial<SheetTabMapping>> => {
    if (items.length === 0) return mappingBase;
    let nextMapping = mappingBase;
    let movTab = nextMapping.movimientosInventario;
    if (!movTab) {
      const added = await initializeMissingTabs(token, spreadsheetId, [
        'movimientosInventario',
      ]);
      movTab = added.movimientosInventario || DEFAULT_TAB_NAMES.movimientosInventario;
      nextMapping = { ...nextMapping, movimientosInventario: movTab };
      setTabMapping(nextMapping);
      persistSheetConfig(spreadsheetId, spreadsheetTitle, nextMapping);
    }
    await appendMovimientosInventarioBatch(token, spreadsheetId, movTab, items);
    return nextMapping;
  };

  const handleSaveTicket = async (
    draft: Omit<Ticket, 'folio' | 'detalleTexto'>,
    options?: { deductGeneralInventory?: boolean }
  ): Promise<Ticket> => {
    const deductGeneralInventory =
      Boolean(options?.deductGeneralInventory) && !draft.jornadaId;
    const totals = computeTicketTotals(draft.items, draft);
    const normalizedDraft: Omit<Ticket, 'folio' | 'detalleTexto'> = {
      ...draft,
      totalPiezas: totals.totalPiezas,
      totalImporte: totals.totalImporte,
      subtotalBruto: totals.subtotalBruto,
      ...(totals.descuentoMonto > 0
        ? {
            descuentoTipo: totals.descuentoTipo,
            descuentoValor: totals.descuentoValor,
            descuentoMonto: totals.descuentoMonto,
            ...(totals.descuentoMotivo ? { descuentoMotivo: totals.descuentoMotivo } : {}),
          }
        : {}),
    };

    if (shouldSaveOffline()) {
      const tempFolio = generateNextFolio(
        dataset.tickets.map((t) => t.folio),
        'AST'
      );
      const detalleTexto = buildTicketDetalleTexto(normalizedDraft.items, normalizedDraft);
      const localTicket: Ticket = {
        ...normalizedDraft,
        folio: tempFolio,
        detalleTexto,
        rowNumber: -1,
      };
      const { stockDeltas, kardexGroups } = deductGeneralInventory
        ? computeTicketGeneralInventoryEffects(normalizedDraft.items)
        : { stockDeltas: [], kardexGroups: [] };
      const nextProductos =
        deductGeneralInventory && stockDeltas.length > 0
          ? applyLocalInventoryDeltas(dataset.productos, stockDeltas)
          : dataset.productos;

      const localMovs = deductGeneralInventory
        ? makeLocalMovimientos(
            buildTicketKardexMovimientos(
              kardexGroups,
              tempFolio,
              normalizedDraft.clienteNombre,
              normalizedDraft.fecha,
              nextProductos
            )
          )
        : [];

      const nextJornadas = normalizedDraft.jornadaId
        ? dataset.jornadas.map((j) =>
            j.id === normalizedDraft.jornadaId
              ? {
                  ...j,
                  ticketFolios: j.ticketFolios.includes(tempFolio)
                    ? j.ticketFolios
                    : [...j.ticketFolios, tempFolio],
                  totalTickets: j.totalTickets + 1,
                  totalPiezas: j.totalPiezas + normalizedDraft.totalPiezas,
                  totalImporte: j.totalImporte + normalizedDraft.totalImporte,
                }
              : j
          )
        : dataset.jornadas;

      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Ticket ${tempFolio} (${normalizedDraft.clienteNombre})`,
          type: 'create_ticket',
          tempFolio,
          draft: normalizedDraft,
          deductGeneralInventory,
        },
        {
          ...dataset,
          productos: nextProductos,
          movimientosInventario: [...(dataset.movimientosInventario || []), ...localMovs],
          jornadas: nextJornadas,
          tickets: [...dataset.tickets, localTicket],
        }
      );
      return localTicket;
    }

    const token = getAccessToken()!;
    const tab = requireTab('tickets');
    const saved = await appendTicketSafe(token, spreadsheetId, tab, normalizedDraft);
    let activeMapping = tabMapping;

    if (normalizedDraft.jornadaId && activeMapping.jornadas) {
      const targetJornada = dataset.jornadas.find((j) => j.id === normalizedDraft.jornadaId);
      if (targetJornada && targetJornada.rowNumber && targetJornada.rowNumber >= 2) {
        const existingTickets = dataset.tickets.filter(
          (t) =>
            t.jornadaId === targetJornada.id ||
            targetJornada.ticketFolios.includes(t.folio)
        );
        const allForJornada = [...existingTickets, saved];
        await updateJornadaRow(token, spreadsheetId, activeMapping.jornadas, {
          ...targetJornada,
          ticketFolios: allForJornada.map((t) => t.folio),
          totalTickets: allForJornada.length,
          totalPiezas: allForJornada.reduce((s, t) => s + t.totalPiezas, 0),
          totalImporte: allForJornada.reduce((s, t) => s + t.totalImporte, 0),
        });
      }
    } else if (deductGeneralInventory && activeMapping.productos) {
      const { stockDeltas, kardexGroups } = computeTicketGeneralInventoryEffects(
        normalizedDraft.items
      );
      let postProducts = dataset.productos;
      if (stockDeltas.length > 0) {
        postProducts = applyLocalInventoryDeltas(dataset.productos, stockDeltas);
        await adjustProductosInventarioByDelta(
          token,
          spreadsheetId,
          activeMapping.productos,
          stockDeltas
        );
      }
      const movs = buildTicketKardexMovimientos(
        kardexGroups,
        saved.folio,
        normalizedDraft.clienteNombre,
        normalizedDraft.fecha,
        postProducts
      );
      if (movs.length > 0) {
        activeMapping = await appendMovimientosSmart(token, movs, activeMapping);
      }
    }

    await syncSpreadsheetData(spreadsheetId, activeMapping);
    return saved;
  };

  const handleSaveCliente = async (
    clienteDraft: Omit<Cliente, 'id' | 'fechaRegistro'>,
    newRutaNombre?: string
  ): Promise<Cliente> => {
    if (shouldSaveOffline()) {
      const tempId = `CLI-OFF-${Date.now().toString().slice(-6)}`;
      const localCliente: Cliente = {
        ...clienteDraft,
        id: tempId,
        fechaRegistro: getTodayISO(),
        rowNumber: -1,
      };
      let nextRutas = dataset.rutas;
      if (
        newRutaNombre &&
        !dataset.rutas.some((r) => r.nombre.toLowerCase() === newRutaNombre.toLowerCase())
      ) {
        nextRutas = [
          ...dataset.rutas,
          {
            id: `RUT-OFF-${Date.now().toString().slice(-5)}`,
            nombre: newRutaNombre,
            descripcion: '',
            activa: true,
            rowNumber: -1,
          },
        ];
      }
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Nuevo cliente: ${clienteDraft.nombre}`,
          type: 'create_cliente',
          tempId,
          draft: clienteDraft,
          newRutaNombre,
        },
        {
          ...dataset,
          rutas: nextRutas,
          clientes: [...dataset.clientes, localCliente],
        }
      );
      return localCliente;
    }
    const token = getAccessToken()!;
    if (newRutaNombre) {
      const rutaExists = dataset.rutas.some(
        (r) => r.nombre.toLowerCase() === newRutaNombre.toLowerCase()
      );
      if (!rutaExists && tabMapping.rutas) {
        await appendRuta(token, spreadsheetId, tabMapping.rutas, {
          nombre: newRutaNombre,
          descripcion: '',
          activa: true,
        });
      }
    }
    const tab = requireTab('clientes');
    const created = await appendCliente(token, spreadsheetId, tab, clienteDraft);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
    return created;
  };

  const handleCreateProducto = async (prod: Omit<Producto, 'id'>) => {
    if (shouldSaveOffline()) {
      const tempId = `PROD-OFF-${Date.now().toString().slice(-6)}`;
      const localProd: Producto = { ...prod, id: tempId, rowNumber: -1 };
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Nuevo producto: ${prod.nombre}`,
          type: 'create_producto',
          tempId,
          draft: prod,
        },
        { ...dataset, productos: [...dataset.productos, localProd] }
      );
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('productos');
    await appendProducto(token, spreadsheetId, tab, prod);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleUpdateProducto = async (prod: Producto) => {
    if (shouldSaveOffline() || prod.rowNumber === -1) {
      const nextProducts = dataset.productos.map((p) => (p.id === prod.id ? prod : p));
      if (prod.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) =>
          a.type === 'create_producto' && a.tempId === prod.id
            ? {
                ...a,
                draft: {
                  nombre: prod.nombre,
                  categoria: prod.categoria,
                  unidad: prod.unidad,
                  precioMayoreo: prod.precioMayoreo,
                  precioMenudeo: prod.precioMenudeo,
                  inventario: prod.inventario,
                  activo: prod.activo,
                },
              }
            : a
        );
        setDataset({ ...dataset, productos: nextProducts });
        persistDatasetCache({ ...dataset, productos: nextProducts });
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Editar producto: ${prod.nombre}`,
            type: 'update_producto',
            prod,
          },
          { ...dataset, productos: nextProducts }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('productos');
    await updateProductoRow(token, spreadsheetId, tab, prod);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleAdjustInventarioBatch = async (
    deltas: InventoryDelta[],
    summaryLabel: string,
    options?: {
      tipo?: MovimientoInventarioTipo;
      referencia?: string;
      notas?: string;
    }
  ) => {
    if (deltas.length === 0) return;
    const postProducts = applyLocalInventoryDeltas(dataset.productos, deltas);
    const movDrafts = buildMovimientosFromDeltas(
      deltas,
      options?.tipo || 'Ajuste manual',
      options?.referencia || 'Inventario general',
      options?.notas || summaryLabel,
      getTodayISO(),
      postProducts
    );

    if (shouldSaveOffline()) {
      const localMovs = makeLocalMovimientos(movDrafts);
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: summaryLabel,
          type: 'adjust_inventario',
          deltas,
        },
        {
          ...dataset,
          productos: postProducts,
          movimientosInventario: [...(dataset.movimientosInventario || []), ...localMovs],
        }
      );
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('productos');
    await adjustProductosInventarioByDelta(token, spreadsheetId, tab, deltas);
    const nextMap = await appendMovimientosSmart(token, movDrafts, tabMapping);
    await syncSpreadsheetData(spreadsheetId, nextMap);
  };

  const handleCreateMovimientosInventario = async (
    items: Omit<MovimientoInventario, 'id'>[],
    applyStockDelta: boolean
  ) => {
    if (items.length === 0) return;
    const adjustDeltas: InventoryDelta[] = applyStockDelta
      ? items
          .filter((i) => i.cantidadDelta !== 0)
          .map((i) => ({
            productoId: i.productoId,
            productoNombre: i.productoNombre,
            delta: i.cantidadDelta,
          }))
      : [];
    const postProducts = applyStockDelta
      ? applyLocalInventoryDeltas(dataset.productos, adjustDeltas)
      : dataset.productos;

    const normalizedItems: Omit<MovimientoInventario, 'id'>[] = items.map((m) => {
      const prod = postProducts.find(
        (p) =>
          (m.productoId && p.id === m.productoId) ||
          normalizeText(p.nombre) === normalizeText(m.productoNombre)
      );
      return {
        ...m,
        stockResultante: prod ? prod.inventario : m.stockResultante,
      };
    });

    if (shouldSaveOffline()) {
      const localMovs = makeLocalMovimientos(normalizedItems);
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Movimiento inventario (${normalizedItems.length})`,
          type: 'create_movimientos_inv',
          items: normalizedItems,
          adjustDeltas: applyStockDelta ? adjustDeltas : undefined,
        },
        {
          ...dataset,
          productos: postProducts,
          movimientosInventario: [...(dataset.movimientosInventario || []), ...localMovs],
        }
      );
      return;
    }

    const token = getAccessToken()!;
    if (applyStockDelta && adjustDeltas.length > 0) {
      await adjustProductosInventarioByDelta(
        token,
        spreadsheetId,
        requireTab('productos'),
        adjustDeltas
      );
    }
    const nextMap = await appendMovimientosSmart(token, normalizedItems, tabMapping);
    await syncSpreadsheetData(spreadsheetId, nextMap);
  };

  const handleCreateJornada = async (
    jornadaDraft: Omit<Jornada, 'id'>,
    selectedTickets: Ticket[],
    inventoryDeltas: InventoryDelta[]
  ) => {
    if (shouldSaveOffline()) {
      const tempId = `JOR-OFF-${Date.now().toString().slice(-6)}`;
      const localJornada: Jornada = { ...jornadaDraft, id: tempId, rowNumber: -1 };
      const folioSet = new Set(selectedTickets.map((t) => t.folio));
      const nextTickets = dataset.tickets.map((t) =>
        folioSet.has(t.folio) ? { ...t, jornadaId: tempId } : t
      );
      const nextProductos = applyLocalInventoryDeltas(dataset.productos, inventoryDeltas);
      const localMovs = makeLocalMovimientos(
        buildMovimientosFromDeltas(
          inventoryDeltas,
          'Carga jornada',
          jornadaDraft.nombre,
          `Carga inicial ruta ${jornadaDraft.ruta}`,
          jornadaDraft.fecha,
          nextProductos
        )
      );
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Nueva jornada: ${jornadaDraft.nombre}`,
          type: 'create_jornada',
          tempId,
          draft: jornadaDraft,
          selectedTickets,
          inventoryDeltas,
        },
        {
          ...dataset,
          productos: nextProductos,
          movimientosInventario: [...(dataset.movimientosInventario || []), ...localMovs],
          jornadas: [...dataset.jornadas, localJornada],
          tickets: nextTickets,
        }
      );
      return;
    }
    const token = getAccessToken()!;
    const jornadasTab = requireTab('jornadas');
    const ticketsTab = requireTab('tickets');
    const created = await appendJornadaAndAssignTickets(
      token,
      spreadsheetId,
      jornadasTab,
      ticketsTab,
      jornadaDraft,
      selectedTickets
    );
    let nextMap = tabMapping;
    if (inventoryDeltas.length > 0 && nextMap.productos) {
      const postProducts = applyLocalInventoryDeltas(dataset.productos, inventoryDeltas);
      await adjustProductosInventarioByDelta(
        token,
        spreadsheetId,
        nextMap.productos,
        inventoryDeltas
      );
      nextMap = await appendMovimientosSmart(
        token,
        buildMovimientosFromDeltas(
          inventoryDeltas,
          'Carga jornada',
          created.nombre,
          `Carga inicial ruta ${created.ruta}`,
          created.fecha,
          postProducts
        ),
        nextMap
      );
    }
    await syncSpreadsheetData(spreadsheetId, nextMap);
  };

  const handleUpdateJornada = async (
    jornada: Jornada,
    inventoryDeltas: InventoryDelta[],
    assignedTickets?: Ticket[]
  ) => {
    if (shouldSaveOffline() || jornada.rowNumber === -1) {
      const nextProductos = applyLocalInventoryDeltas(dataset.productos, inventoryDeltas);
      const assignedSet = new Set((assignedTickets || []).map((t) => t.folio));
      const nextTickets =
        assignedSet.size > 0
          ? dataset.tickets.map((t) =>
              assignedSet.has(t.folio) ? { ...t, jornadaId: jornada.id } : t
            )
          : dataset.tickets;
      const nextJornadas = dataset.jornadas.map((j) => (j.id === jornada.id ? jornada : j));
      const localMovs =
        inventoryDeltas.length > 0
          ? makeLocalMovimientos(
              buildMovimientosFromDeltas(
                inventoryDeltas,
                'Carga jornada',
                jornada.nombre,
                'Ajuste carga en jornada',
                jornada.fecha,
                nextProductos
              )
            )
          : [];

      if (jornada.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) =>
          a.type === 'create_jornada' && a.tempId === jornada.id
            ? {
                ...a,
                draft: {
                  fecha: jornada.fecha,
                  ruta: jornada.ruta,
                  nombre: jornada.nombre,
                  ticketFolios: jornada.ticketFolios,
                  totalTickets: jornada.totalTickets,
                  totalPiezas: jornada.totalPiezas,
                  totalImporte: jornada.totalImporte,
                  estado: jornada.estado,
                  notas: jornada.notas,
                  inventario: jornada.inventario,
                  ...(jornada.visitas ? { visitas: jornada.visitas } : {}),
                  ...(jornada.conciliacion ? { conciliacion: jornada.conciliacion } : {}),
                },
                selectedTickets: assignedTickets
                  ? [...a.selectedTickets, ...assignedTickets]
                  : a.selectedTickets,
                inventoryDeltas: mergeInventoryDeltas(a.inventoryDeltas, inventoryDeltas),
              }
            : a
        );
        const nextData = {
          ...dataset,
          productos: nextProductos,
          movimientosInventario: [...(dataset.movimientosInventario || []), ...localMovs],
          tickets: nextTickets,
          jornadas: nextJornadas,
        };
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Actualizar jornada: ${jornada.nombre}`,
            type: 'update_jornada',
            jornada,
            inventoryDeltas,
            assignedTickets,
          },
          {
            ...dataset,
            productos: nextProductos,
            movimientosInventario: [...(dataset.movimientosInventario || []), ...localMovs],
            tickets: nextTickets,
            jornadas: nextJornadas,
          }
        );
      }
      return;
    }

    const token = getAccessToken()!;
    const jornadasTab = requireTab('jornadas');
    await updateJornadaRow(token, spreadsheetId, jornadasTab, jornada);
    if (assignedTickets && assignedTickets.length > 0 && tabMapping.tickets) {
      await assignTicketsToJornada(
        token,
        spreadsheetId,
        tabMapping.tickets,
        jornada.id,
        assignedTickets
      );
    }
    let nextMap = tabMapping;
    if (inventoryDeltas.length > 0 && nextMap.productos) {
      const postProducts = applyLocalInventoryDeltas(dataset.productos, inventoryDeltas);
      await adjustProductosInventarioByDelta(
        token,
        spreadsheetId,
        nextMap.productos,
        inventoryDeltas
      );
      nextMap = await appendMovimientosSmart(
        token,
        buildMovimientosFromDeltas(
          inventoryDeltas,
          'Carga jornada',
          jornada.nombre,
          'Ajuste carga en jornada',
          jornada.fecha,
          postProducts
        ),
        nextMap
      );
    }
    await syncSpreadsheetData(spreadsheetId, nextMap);
  };

  const handleFinalizeJornada = async (
    jornada: Jornada,
    returnDeltas: InventoryDelta[],
    extraMovimientos: Omit<MovimientoInventario, 'id'>[] = []
  ) => {
    const nextProductos = applyLocalInventoryDeltas(dataset.productos, returnDeltas);
    const returnMovsDraft = buildMovimientosFromDeltas(
      returnDeltas,
      'Devolución jornada',
      jornada.nombre,
      'Devolución al cierre de jornada',
      jornada.fecha,
      nextProductos
    );
    const extraWithStock = extraMovimientos.map((m) => {
      const prod = nextProductos.find(
        (p) =>
          (m.productoId && p.id === m.productoId) ||
          normalizeText(p.nombre) === normalizeText(m.productoNombre)
      );
      return {
        ...m,
        stockResultante: prod ? prod.inventario : m.stockResultante,
      };
    });
    const combinedMovDrafts = [...returnMovsDraft, ...extraWithStock];

    if (shouldSaveOffline() || jornada.rowNumber === -1) {
      const nextJornadas = dataset.jornadas.map((j) => (j.id === jornada.id ? jornada : j));
      const localMovs = makeLocalMovimientos(combinedMovDrafts);

      if (jornada.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) =>
          a.type === 'create_jornada' && a.tempId === jornada.id
            ? {
                ...a,
                draft: {
                  fecha: jornada.fecha,
                  ruta: jornada.ruta,
                  nombre: jornada.nombre,
                  ticketFolios: jornada.ticketFolios,
                  totalTickets: jornada.totalTickets,
                  totalPiezas: jornada.totalPiezas,
                  totalImporte: jornada.totalImporte,
                  estado: jornada.estado,
                  notas: jornada.notas,
                  inventario: jornada.inventario,
                  ...(jornada.visitas ? { visitas: jornada.visitas } : {}),
                  ...(jornada.conciliacion ? { conciliacion: jornada.conciliacion } : {}),
                },
                inventoryDeltas: mergeInventoryDeltas(a.inventoryDeltas, returnDeltas),
              }
            : a
        );
        const nextData = {
          ...dataset,
          productos: nextProductos,
          movimientosInventario: [...(dataset.movimientosInventario || []), ...localMovs],
          jornadas: nextJornadas,
        };
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Finalizar jornada: ${jornada.nombre}`,
            type: 'finalize_jornada',
            jornada,
            returnDeltas,
          },
          {
            ...dataset,
            productos: nextProductos,
            movimientosInventario: [...(dataset.movimientosInventario || []), ...localMovs],
            jornadas: nextJornadas,
          }
        );
      }
      return;
    }

    const token = getAccessToken()!;
    const jornadasTab = requireTab('jornadas');
    await updateJornadaRow(token, spreadsheetId, jornadasTab, jornada);
    let nextMap = tabMapping;
    if (returnDeltas.length > 0 && nextMap.productos) {
      await adjustProductosInventarioByDelta(
        token,
        spreadsheetId,
        nextMap.productos,
        returnDeltas
      );
    }
    if (combinedMovDrafts.length > 0) {
      nextMap = await appendMovimientosSmart(token, combinedMovDrafts, nextMap);
    }
    await syncSpreadsheetData(spreadsheetId, nextMap);
  };

  const upsertLocalConceptos = (
    list: ConceptoGasto[],
    concept: Omit<ConceptoGasto, 'id'>
  ): ConceptoGasto[] => {
    const target = concept.concepto.trim().toLowerCase();
    const exists = list.some((c) => c.concepto.trim().toLowerCase() === target);
    if (exists) {
      return list.map((c) =>
        c.concepto.trim().toLowerCase() === target ? { ...c, ...concept } : c
      );
    }
    return [
      ...list,
      { ...concept, id: `CON-OFF-${Date.now().toString().slice(-5)}`, rowNumber: -1 },
    ];
  };

  const handleSaveEgreso = async (
    egresoDraft: Omit<Egreso, 'id'>,
    saveConcept?: Omit<ConceptoGasto, 'id'>
  ) => {
    if (shouldSaveOffline()) {
      const tempId = `EGR-OFF-${Date.now().toString().slice(-6)}`;
      const localEgreso: Egreso = { ...egresoDraft, id: tempId, rowNumber: -1 };
      const nextConceptos = saveConcept
        ? upsertLocalConceptos(dataset.conceptosGasto, saveConcept)
        : dataset.conceptosGasto;
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Egreso: ${egresoDraft.concepto}`,
          type: 'create_egreso',
          tempId,
          draft: egresoDraft,
          saveConcept,
        },
        {
          ...dataset,
          egresos: [...dataset.egresos, localEgreso],
          conceptosGasto: nextConceptos,
        }
      );
      return;
    }
    const token = getAccessToken()!;
    const egresosTab = requireTab('egresos');
    await appendEgreso(token, spreadsheetId, egresosTab, egresoDraft);
    let nextMapping = tabMapping;
    if (saveConcept) {
      let conceptosTab = tabMapping.conceptosGasto;
      if (!conceptosTab) {
        const added = await initializeMissingTabs(token, spreadsheetId, ['conceptosGasto']);
        conceptosTab = added.conceptosGasto || DEFAULT_TAB_NAMES.conceptosGasto;
        nextMapping = { ...tabMapping, conceptosGasto: conceptosTab };
        setTabMapping(nextMapping);
        persistSheetConfig(spreadsheetId, spreadsheetTitle, nextMapping);
      }
      await upsertConceptoGasto(token, spreadsheetId, conceptosTab, saveConcept);
    }
    await syncSpreadsheetData(spreadsheetId, nextMapping);
  };

  const handleSaveConcepto = async (conceptDraft: Omit<ConceptoGasto, 'id'>) => {
    if (shouldSaveOffline()) {
      const tempId = `CON-OFF-${Date.now().toString().slice(-6)}`;
      const nextConceptos = upsertLocalConceptos(dataset.conceptosGasto, conceptDraft);
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Concepto: ${conceptDraft.concepto}`,
          type: 'create_concepto',
          tempId,
          draft: conceptDraft,
        },
        { ...dataset, conceptosGasto: nextConceptos }
      );
      return;
    }
    const token = getAccessToken()!;
    let nextMapping = tabMapping;
    let conceptosTab = tabMapping.conceptosGasto;
    if (!conceptosTab) {
      const added = await initializeMissingTabs(token, spreadsheetId, ['conceptosGasto']);
      conceptosTab = added.conceptosGasto || DEFAULT_TAB_NAMES.conceptosGasto;
      nextMapping = { ...tabMapping, conceptosGasto: conceptosTab };
      setTabMapping(nextMapping);
      persistSheetConfig(spreadsheetId, spreadsheetTitle, nextMapping);
    }
    await upsertConceptoGasto(token, spreadsheetId, conceptosTab, conceptDraft);
    await syncSpreadsheetData(spreadsheetId, nextMapping);
  };

  const upsertLocalConceptosIngreso = (
    list: ConceptoIngreso[],
    concept: Omit<ConceptoIngreso, 'id'>
  ): ConceptoIngreso[] => {
    const target = concept.concepto.trim().toLowerCase();
    const exists = list.some((c) => c.concepto.trim().toLowerCase() === target);
    if (exists) {
      return list.map((c) =>
        c.concepto.trim().toLowerCase() === target ? { ...c, ...concept } : c
      );
    }
    return [
      ...list,
      { ...concept, id: `CING-OFF-${Date.now().toString().slice(-5)}`, rowNumber: -1 },
    ];
  };

  const handleSaveIngresoOtro = async (
    ingresoDraft: Omit<IngresoOtro, 'id'>,
    saveConcept?: Omit<ConceptoIngreso, 'id'>
  ) => {
    if (shouldSaveOffline()) {
      const tempId = `ING-OFF-${Date.now().toString().slice(-6)}`;
      const localIngreso: IngresoOtro = { ...ingresoDraft, id: tempId, rowNumber: -1 };
      const nextConceptos = saveConcept
        ? upsertLocalConceptosIngreso(dataset.conceptosIngreso || [], saveConcept)
        : dataset.conceptosIngreso || [];
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Otro ingreso: ${ingresoDraft.concepto}`,
          type: 'create_ingreso_otro',
          tempId,
          draft: ingresoDraft,
          saveConcept,
        },
        {
          ...dataset,
          otrosIngresos: [...(dataset.otrosIngresos || []), localIngreso],
          conceptosIngreso: nextConceptos,
        }
      );
      return;
    }
    const token = getAccessToken()!;
    let nextMapping = tabMapping;
    let ingresosTab = tabMapping.otrosIngresos;
    if (!ingresosTab) {
      const added = await initializeMissingTabs(token, spreadsheetId, ['otrosIngresos']);
      ingresosTab = added.otrosIngresos || DEFAULT_TAB_NAMES.otrosIngresos;
      nextMapping = { ...nextMapping, otrosIngresos: ingresosTab };
    }
    await appendIngresoOtro(token, spreadsheetId, ingresosTab, ingresoDraft);
    if (saveConcept) {
      let conceptosTab = nextMapping.conceptosIngreso;
      if (!conceptosTab) {
        const added = await initializeMissingTabs(token, spreadsheetId, ['conceptosIngreso']);
        conceptosTab = added.conceptosIngreso || DEFAULT_TAB_NAMES.conceptosIngreso;
        nextMapping = { ...nextMapping, conceptosIngreso: conceptosTab };
      }
      await upsertConceptoIngreso(token, spreadsheetId, conceptosTab, saveConcept);
    }
    if (nextMapping !== tabMapping) {
      setTabMapping(nextMapping);
      persistSheetConfig(spreadsheetId, spreadsheetTitle, nextMapping);
    }
    await syncSpreadsheetData(spreadsheetId, nextMapping);
  };

  const handleSaveConceptoIngreso = async (conceptDraft: Omit<ConceptoIngreso, 'id'>) => {
    if (shouldSaveOffline()) {
      const tempId = `CING-OFF-${Date.now().toString().slice(-6)}`;
      const nextConceptos = upsertLocalConceptosIngreso(
        dataset.conceptosIngreso || [],
        conceptDraft
      );
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Concepto ingreso: ${conceptDraft.concepto}`,
          type: 'create_concepto_ingreso',
          tempId,
          draft: conceptDraft,
        },
        { ...dataset, conceptosIngreso: nextConceptos }
      );
      return;
    }
    const token = getAccessToken()!;
    let nextMapping = tabMapping;
    let conceptosTab = tabMapping.conceptosIngreso;
    if (!conceptosTab) {
      const added = await initializeMissingTabs(token, spreadsheetId, ['conceptosIngreso']);
      conceptosTab = added.conceptosIngreso || DEFAULT_TAB_NAMES.conceptosIngreso;
      nextMapping = { ...tabMapping, conceptosIngreso: conceptosTab };
      setTabMapping(nextMapping);
      persistSheetConfig(spreadsheetId, spreadsheetTitle, nextMapping);
    }
    await upsertConceptoIngreso(token, spreadsheetId, conceptosTab, conceptDraft);
    await syncSpreadsheetData(spreadsheetId, nextMapping);
  };

  const handleSaveSueldo = async (sueldoDraft: Omit<Sueldo, 'id'>) => {
    if (shouldSaveOffline()) {
      const tempId = `SUE-OFF-${Date.now().toString().slice(-6)}`;
      const localSueldo: Sueldo = { ...sueldoDraft, id: tempId, rowNumber: -1 };
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Sueldo: ${sueldoDraft.trabajador}`,
          type: 'create_sueldo',
          tempId,
          draft: sueldoDraft,
        },
        { ...dataset, sueldos: [...dataset.sueldos, localSueldo] }
      );
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('sueldos');
    await appendSueldo(token, spreadsheetId, tab, sueldoDraft);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleUpsertFinanza = async (record: FinanzaMensual) => {
    if (shouldSaveOffline()) {
      const exists = dataset.finanzasMensuales.some((f) => f.mes === record.mes);
      const nextFin = exists
        ? dataset.finanzasMensuales.map((f) => (f.mes === record.mes ? record : f))
        : [...dataset.finanzasMensuales, record];
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Fondo base ${record.mes}`,
          type: 'upsert_finanza',
          record,
        },
        { ...dataset, finanzasMensuales: nextFin }
      );
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('finanzasMensuales');
    await upsertFinanzaMensual(token, spreadsheetId, tab, record);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleCloseMonth = async (
    closedRecord: FinanzaMensual,
    nextMonthRecord: FinanzaMensual
  ) => {
    if (shouldSaveOffline()) {
      const byMonth = new Map(dataset.finanzasMensuales.map((f) => [f.mes, f]));
      byMonth.set(closedRecord.mes, closedRecord);
      byMonth.set(nextMonthRecord.mes, nextMonthRecord);
      enqueueOfflineMutation(
        {
          qid: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          summary: `Cierre de mes ${closedRecord.mes}`,
          type: 'close_month',
          closedRecord,
          nextMonthRecord,
        },
        { ...dataset, finanzasMensuales: Array.from(byMonth.values()) }
      );
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('finanzasMensuales');
    await upsertFinanzaMensual(token, spreadsheetId, tab, closedRecord);
    await upsertFinanzaMensual(token, spreadsheetId, tab, nextMonthRecord);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  // Delete & Update handlers
  const handleUpdateTicket = async (ticket: Ticket) => {
    const prevTicket = dataset.tickets.find((t) => t.folio === ticket.folio);
    const nextTickets = dataset.tickets.map((t) =>
      t.folio === ticket.folio ? ticket : t
    );
    const affectedJornadas = dataset.jornadas
      .filter(
        (j) =>
          j.id === prevTicket?.jornadaId ||
          j.id === ticket.jornadaId ||
          j.ticketFolios.includes(ticket.folio)
      )
      .map((j) => recalculateJornadaFromTickets(j, nextTickets));
    const affectedMap = new Map(affectedJornadas.map((j) => [j.id, j]));
    const nextJornadas = dataset.jornadas.map((j) => affectedMap.get(j.id) || j);

    if (shouldSaveOffline() || ticket.rowNumber === -1) {
      setViewingTicket(ticket);
      const nextData = { ...dataset, tickets: nextTickets, jornadas: nextJornadas };
      if (ticket.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) => {
          if (a.type === 'create_ticket' && a.tempFolio === ticket.folio) {
            return {
              ...a,
              draft: {
                fecha: ticket.fecha,
                ruta: ticket.ruta,
                clienteId: ticket.clienteId,
                clienteNombre: ticket.clienteNombre,
                tipoVenta: ticket.tipoVenta,
                totalPiezas: ticket.totalPiezas,
                totalImporte: ticket.totalImporte,
                ...(ticket.subtotalBruto !== undefined ? { subtotalBruto: ticket.subtotalBruto } : {}),
                ...(ticket.descuentoTipo !== undefined ? { descuentoTipo: ticket.descuentoTipo } : {}),
                ...(ticket.descuentoValor !== undefined ? { descuentoValor: ticket.descuentoValor } : {}),
                ...(ticket.descuentoMonto !== undefined ? { descuentoMonto: ticket.descuentoMonto } : {}),
                ...(ticket.descuentoMotivo !== undefined ? { descuentoMotivo: ticket.descuentoMotivo } : {}),
                jornadaId: ticket.jornadaId,
                items: ticket.items,
                ...(ticket.metodoPago !== undefined ? { metodoPago: ticket.metodoPago } : {}),
                ...(ticket.estadoPago !== undefined ? { estadoPago: ticket.estadoPago } : {}),
                ...(ticket.montoPagado !== undefined ? { montoPagado: ticket.montoPagado } : {}),
                ...(ticket.saldoPendiente !== undefined
                  ? { saldoPendiente: ticket.saldoPendiente }
                  : {}),
                ...(ticket.abonos !== undefined ? { abonos: ticket.abonos } : {}),
              },
            };
          }
          if (a.type === 'create_jornada' && affectedMap.has(a.tempId)) {
            const recalc = affectedMap.get(a.tempId)!;
            const syncedSelected = nextTickets.filter(
              (t) => t.jornadaId === recalc.id || recalc.ticketFolios.includes(t.folio)
            );
            return {
              ...a,
              selectedTickets: syncedSelected,
              draft: {
                ...a.draft,
                ticketFolios: recalc.ticketFolios,
                totalTickets: recalc.totalTickets,
                totalPiezas: recalc.totalPiezas,
                totalImporte: recalc.totalImporte,
              },
            };
          }
          return a;
        });
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        const actionsToQueue: OfflineQueuedAction[] = [
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Editar ticket ${ticket.folio}`,
            type: 'update_ticket',
            ticket,
          },
          ...affectedJornadas
            .filter((j) => j.rowNumber && j.rowNumber >= 2)
            .map((j, idx) => ({
              qid: `q-${Date.now()}-${idx + 1}`,
              createdAt: new Date().toISOString(),
              summary: `Recalcular jornada ${j.nombre}`,
              type: 'update_jornada' as const,
              jornada: j,
            })),
        ];
        enqueueOfflineMutations(actionsToQueue, nextData);
      }
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('tickets');
    const updated = await updateTicketRow(token, spreadsheetId, tab, ticket);
    if (tabMapping.jornadas) {
      for (const j of affectedJornadas) {
        if (j.rowNumber && j.rowNumber >= 2) {
          await updateJornadaRow(token, spreadsheetId, tabMapping.jornadas, j);
        }
      }
    }
    setViewingTicket(updated);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleRecordTicketAbono = async (ticket: Ticket, abono: TicketAbono) => {
    const updated = applyAbonoToTicket(ticket, abono);
    await handleUpdateTicket(updated);
  };

  const handleUpdateRuta = async (ruta: Ruta, oldNombre?: string) => {
    const renamed = Boolean(oldNombre && oldNombre !== ruta.nombre);
    const nextRutas = dataset.rutas.map((r) => (r.id === ruta.id ? ruta : r));
    const nextClientes = renamed
      ? dataset.clientes.map((c) => (c.ruta === oldNombre ? { ...c, ruta: ruta.nombre } : c))
      : dataset.clientes;
    const nextTickets = renamed
      ? dataset.tickets.map((t) => (t.ruta === oldNombre ? { ...t, ruta: ruta.nombre } : t))
      : dataset.tickets;
    const nextJornadas = renamed
      ? dataset.jornadas.map((j) => (j.ruta === oldNombre ? { ...j, ruta: ruta.nombre } : j))
      : dataset.jornadas;

    if (shouldSaveOffline() || ruta.rowNumber === -1) {
      const nextData = {
        ...dataset,
        rutas: nextRutas,
        clientes: nextClientes,
        tickets: nextTickets,
        jornadas: nextJornadas,
      };
      if (ruta.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) => {
          if (a.type === 'create_ruta' && oldNombre && a.nombre === oldNombre) {
            return { ...a, nombre: ruta.nombre, descripcion: ruta.descripcion };
          }
          if (renamed && a.type === 'create_cliente' && a.draft.ruta === oldNombre) {
            return { ...a, draft: { ...a.draft, ruta: ruta.nombre } };
          }
          if (renamed && a.type === 'create_ticket' && a.draft.ruta === oldNombre) {
            return { ...a, draft: { ...a.draft, ruta: ruta.nombre } };
          }
          if (renamed && a.type === 'create_jornada' && a.draft.ruta === oldNombre) {
            return { ...a, draft: { ...a.draft, ruta: ruta.nombre } };
          }
          return a;
        });
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Editar ruta: ${ruta.nombre}`,
            type: 'update_ruta',
            ruta,
            oldNombre,
          },
          nextData
        );
      }
      return;
    }

    const token = getAccessToken()!;
    const tab = requireTab('rutas');
    await updateRutaRow(token, spreadsheetId, tab, ruta);
    if (renamed) {
      if (tabMapping.clientes) {
        for (const c of dataset.clientes) {
          if (c.ruta === oldNombre && c.rowNumber && c.rowNumber >= 2) {
            await updateClienteRow(token, spreadsheetId, tabMapping.clientes, {
              ...c,
              ruta: ruta.nombre,
            });
          }
        }
      }
      if (tabMapping.tickets) {
        for (const t of dataset.tickets) {
          if (t.ruta === oldNombre && t.rowNumber && t.rowNumber >= 2) {
            await updateTicketRow(token, spreadsheetId, tabMapping.tickets, {
              ...t,
              ruta: ruta.nombre,
            });
          }
        }
      }
      if (tabMapping.jornadas) {
        for (const j of dataset.jornadas) {
          if (j.ruta === oldNombre && j.rowNumber && j.rowNumber >= 2) {
            await updateJornadaRow(token, spreadsheetId, tabMapping.jornadas, {
              ...j,
              ruta: ruta.nombre,
            });
          }
        }
      }
    }
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleUpdateCliente = async (cliente: Cliente) => {
    const nextClientes = dataset.clientes.map((c) => (c.id === cliente.id ? cliente : c));
    if (shouldSaveOffline() || cliente.rowNumber === -1) {
      const nextData = { ...dataset, clientes: nextClientes };
      if (cliente.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) =>
          a.type === 'create_cliente' && a.tempId === cliente.id
            ? {
                ...a,
                draft: {
                  nombre: cliente.nombre,
                  ruta: cliente.ruta,
                  telefono: cliente.telefono,
                  direccion: cliente.direccion,
                  notas: cliente.notas,
                },
              }
            : a
        );
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Editar cliente: ${cliente.nombre}`,
            type: 'update_cliente',
            cliente,
          },
          nextData
        );
      }
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('clientes');
    await updateClienteRow(token, spreadsheetId, tab, cliente);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleUpdateIngresoOtro = async (ingreso: IngresoOtro) => {
    const nextIngresos = (dataset.otrosIngresos || []).map((i) =>
      i.id === ingreso.id ? ingreso : i
    );
    if (shouldSaveOffline() || ingreso.rowNumber === -1) {
      const nextData = { ...dataset, otrosIngresos: nextIngresos };
      if (ingreso.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) =>
          a.type === 'create_ingreso_otro' && a.tempId === ingreso.id
            ? {
                ...a,
                draft: {
                  fecha: ingreso.fecha,
                  categoria: ingreso.categoria,
                  concepto: ingreso.concepto,
                  monto: ingreso.monto,
                  notas: ingreso.notas,
                },
              }
            : a
        );
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Editar ingreso: ${ingreso.concepto}`,
            type: 'update_ingreso_otro',
            ingreso,
          },
          nextData
        );
      }
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('otrosIngresos');
    await updateIngresoOtroRow(token, spreadsheetId, tab, ingreso);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleUpdateEgreso = async (egreso: Egreso) => {
    const nextEgresos = dataset.egresos.map((e) => (e.id === egreso.id ? egreso : e));
    if (shouldSaveOffline() || egreso.rowNumber === -1) {
      const nextData = { ...dataset, egresos: nextEgresos };
      if (egreso.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) =>
          a.type === 'create_egreso' && a.tempId === egreso.id
            ? {
                ...a,
                draft: {
                  fecha: egreso.fecha,
                  categoria: egreso.categoria,
                  concepto: egreso.concepto,
                  monto: egreso.monto,
                  notas: egreso.notas,
                  jornadaId: egreso.jornadaId || '',
                },
              }
            : a
        );
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Editar egreso: ${egreso.concepto}`,
            type: 'update_egreso',
            egreso,
          },
          nextData
        );
      }
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('egresos');
    await updateEgresoRow(token, spreadsheetId, tab, egreso);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleUpdateSueldo = async (sueldo: Sueldo) => {
    const nextSueldos = dataset.sueldos.map((s) => (s.id === sueldo.id ? sueldo : s));
    if (shouldSaveOffline() || sueldo.rowNumber === -1) {
      const nextData = { ...dataset, sueldos: nextSueldos };
      if (sueldo.rowNumber === -1) {
        const nextQueue = offlineQueue.map((a) =>
          a.type === 'create_sueldo' && a.tempId === sueldo.id
            ? {
                ...a,
                draft: {
                  fecha: sueldo.fecha,
                  trabajador: sueldo.trabajador,
                  concepto: sueldo.concepto,
                  monto: sueldo.monto,
                  notas: sueldo.notas,
                },
              }
            : a
        );
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Editar sueldo: ${sueldo.trabajador}`,
            type: 'update_sueldo',
            sueldo,
          },
          nextData
        );
      }
      return;
    }
    const token = getAccessToken()!;
    const tab = requireTab('sueldos');
    await updateSueldoRow(token, spreadsheetId, tab, sueldo);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleSaveConfigToSheet = async () => {
    const token = getAccessToken();
    if (!token) throw new AuthExpiredError();
    if (!spreadsheetId) {
      setShowSheetSetup(true);
      throw new Error('Conecta primero un documento de Google Sheets.');
    }
    let nextMapping = tabMapping;
    let configTab = nextMapping.configuracion;
    if (!configTab) {
      const added = await initializeMissingTabs(token, spreadsheetId, ['configuracion']);
      configTab = added.configuracion || DEFAULT_TAB_NAMES.configuracion;
      nextMapping = { ...nextMapping, configuracion: configTab };
      setTabMapping(nextMapping);
      persistSheetConfig(spreadsheetId, spreadsheetTitle, nextMapping);
    }
    const payload = await buildSettingsBackupPayload(true);
    await upsertAppConfigInSheet(token, spreadsheetId, configTab, JSON.stringify(payload));
  };

  const handleLoadConfigFromSheet = async (): Promise<AppSettingsBackupPayload | null> => {
    const token = getAccessToken();
    if (!token) throw new AuthExpiredError();
    if (!spreadsheetId) {
      setShowSheetSetup(true);
      throw new Error('Conecta primero un documento de Google Sheets.');
    }
    const configTab = tabMapping.configuracion || DEFAULT_TAB_NAMES.configuracion;
    const rawJson = await loadAppConfigFromSheet(token, spreadsheetId, configTab);
    if (!rawJson) return null;
    const payload = parseSettingsBackupJson(rawJson);
    handleApplySettingsBackup(payload);
    return payload;
  };

  const handleDeleteTicket = async (ticket: Ticket) => {
    const nextTickets = dataset.tickets.filter((t) => t.folio !== ticket.folio);
    const affectedJornadas = dataset.jornadas
      .filter((j) => j.id === ticket.jornadaId || j.ticketFolios.includes(ticket.folio))
      .map((j) => recalculateJornadaFromTickets(j, nextTickets));
    const affectedMap = new Map(affectedJornadas.map((j) => [j.id, j]));
    const nextJornadas = dataset.jornadas.map((j) => affectedMap.get(j.id) || j);

    if (shouldSaveOffline() || ticket.rowNumber === -1) {
      const nextData = { ...dataset, tickets: nextTickets, jornadas: nextJornadas };
      if (ticket.rowNumber === -1) {
        const nextQueue = offlineQueue
          .filter((a) => !(a.type === 'create_ticket' && a.tempFolio === ticket.folio))
          .map((a) => {
            if (a.type === 'create_jornada' && affectedMap.has(a.tempId)) {
              const recalc = affectedMap.get(a.tempId)!;
              return {
                ...a,
                selectedTickets: a.selectedTickets.filter((t) => t.folio !== ticket.folio),
                draft: {
                  ...a.draft,
                  ticketFolios: recalc.ticketFolios,
                  totalTickets: recalc.totalTickets,
                  totalPiezas: recalc.totalPiezas,
                  totalImporte: recalc.totalImporte,
                },
              };
            }
            return a;
          });
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        const actionsToQueue: OfflineQueuedAction[] = [
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar ticket ${ticket.folio}`,
            type: 'delete_ticket',
            folio: ticket.folio,
            rowNumber: ticket.rowNumber,
          },
          ...affectedJornadas
            .filter((j) => j.rowNumber && j.rowNumber >= 2)
            .map((j, idx) => ({
              qid: `q-${Date.now()}-${idx + 1}`,
              createdAt: new Date().toISOString(),
              summary: `Recalcular jornada ${j.nombre}`,
              type: 'update_jornada' as const,
              jornada: j,
            })),
        ];
        enqueueOfflineMutations(actionsToQueue, nextData);
      }
      return;
    }
    const token = getAccessToken()!;
    if (!ticket.rowNumber) throw new Error('No se encontró la fila del ticket en la hoja.');
    const tab = requireTab('tickets');
    await deleteSheetRow(token, spreadsheetId, tab, ticket.rowNumber);
    if (tabMapping.jornadas) {
      for (const j of affectedJornadas) {
        if (j.rowNumber && j.rowNumber >= 2) {
          await updateJornadaRow(token, spreadsheetId, tabMapping.jornadas, j);
        }
      }
    }
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleDeleteJornada = async (jornada: Jornada) => {
    const restoreDeltas: InventoryDelta[] =
      jornada.estado === 'Abierta'
        ? (jornada.inventario || [])
            .filter((it) => it.cantidadInicial > 0)
            .map((it) => ({
              productoId: it.productoId,
              productoNombre: it.productoNombre,
              delta: it.cantidadInicial,
            }))
        : [];

    if (shouldSaveOffline() || jornada.rowNumber === -1) {
      const nextJornadas = dataset.jornadas.filter((j) => j.id !== jornada.id);
      const nextTickets = dataset.tickets.map((t) =>
        t.jornadaId === jornada.id ? { ...t, jornadaId: '' } : t
      );
      const nextEgresos = dataset.egresos.map((e) =>
        e.jornadaId === jornada.id ? { ...e, jornadaId: '' } : e
      );
      const nextProductos = applyLocalInventoryDeltas(dataset.productos, restoreDeltas);
      if (jornada.rowNumber === -1) {
        const nextQueue = offlineQueue
          .filter((a) => !(a.type === 'create_jornada' && a.tempId === jornada.id))
          .map((a) =>
            a.type === 'create_egreso' && a.draft.jornadaId === jornada.id
              ? { ...a, draft: { ...a.draft, jornadaId: '' } }
              : a
          );
        const nextData = {
          ...dataset,
          productos: nextProductos,
          jornadas: nextJornadas,
          tickets: nextTickets,
          egresos: nextEgresos,
        };
        setDataset(nextData);
        persistDatasetCache(nextData);
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar jornada ${jornada.nombre}`,
            type: 'delete_jornada',
            id: jornada.id,
            rowNumber: jornada.rowNumber,
            restoreDeltas,
          },
          {
            ...dataset,
            productos: nextProductos,
            jornadas: nextJornadas,
            tickets: nextTickets,
            egresos: nextEgresos,
          }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    if (!jornada.rowNumber) throw new Error('No se encontró la fila de la jornada en la hoja.');
    const jornadasTab = requireTab('jornadas');
    if (tabMapping.tickets) {
      await clearJornadaOnTickets(
        token,
        spreadsheetId,
        tabMapping.tickets,
        jornada.id,
        dataset.tickets
      );
    }
    if (tabMapping.egresos) {
      await clearJornadaOnEgresos(
        token,
        spreadsheetId,
        tabMapping.egresos,
        jornada.id,
        dataset.egresos
      );
    }
    await deleteSheetRow(token, spreadsheetId, jornadasTab, jornada.rowNumber);
    if (restoreDeltas.length > 0 && tabMapping.productos) {
      await adjustProductosInventarioByDelta(
        token,
        spreadsheetId,
        tabMapping.productos,
        restoreDeltas
      );
    }
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleDeleteEgreso = async (egreso: Egreso) => {
    if (shouldSaveOffline() || egreso.rowNumber === -1) {
      const nextEgresos = dataset.egresos.filter((e) => e.id !== egreso.id);
      if (egreso.rowNumber === -1) {
        const nextQueue = offlineQueue.filter(
          (a) => !(a.type === 'create_egreso' && a.tempId === egreso.id)
        );
        setDataset({ ...dataset, egresos: nextEgresos });
        persistDatasetCache({ ...dataset, egresos: nextEgresos });
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar egreso ${egreso.concepto}`,
            type: 'delete_egreso',
            id: egreso.id,
            rowNumber: egreso.rowNumber,
          },
          { ...dataset, egresos: nextEgresos }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    if (!egreso.rowNumber) throw new Error('No se encontró la fila del egreso en la hoja.');
    const tab = requireTab('egresos');
    await deleteSheetRow(token, spreadsheetId, tab, egreso.rowNumber);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleDeleteConcepto = async (concepto: ConceptoGasto) => {
    if (shouldSaveOffline() || concepto.rowNumber === -1) {
      const nextConceptos = dataset.conceptosGasto.filter((c) => c.id !== concepto.id);
      if (concepto.rowNumber === -1) {
        const targetNorm = concepto.concepto.trim().toLowerCase();
        const nextQueue = offlineQueue
          .filter(
            (a) =>
              !(
                a.type === 'create_concepto' &&
                a.draft.concepto.trim().toLowerCase() === targetNorm
              )
          )
          .map((a) =>
            a.type === 'create_egreso' &&
            a.saveConcept?.concepto.trim().toLowerCase() === targetNorm
              ? { ...a, saveConcept: undefined }
              : a
          );
        setDataset({ ...dataset, conceptosGasto: nextConceptos });
        persistDatasetCache({ ...dataset, conceptosGasto: nextConceptos });
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar concepto ${concepto.concepto}`,
            type: 'delete_concepto',
            id: concepto.id,
            rowNumber: concepto.rowNumber,
          },
          { ...dataset, conceptosGasto: nextConceptos }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    if (!concepto.rowNumber) throw new Error('No se encontró la fila del concepto en la hoja.');
    const tab = requireTab('conceptosGasto');
    await deleteSheetRow(token, spreadsheetId, tab, concepto.rowNumber);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleDeleteIngresoOtro = async (ingreso: IngresoOtro) => {
    if (shouldSaveOffline() || ingreso.rowNumber === -1) {
      const nextIngresos = (dataset.otrosIngresos || []).filter((i) => i.id !== ingreso.id);
      if (ingreso.rowNumber === -1) {
        const nextQueue = offlineQueue.filter(
          (a) => !(a.type === 'create_ingreso_otro' && a.tempId === ingreso.id)
        );
        setDataset({ ...dataset, otrosIngresos: nextIngresos });
        persistDatasetCache({ ...dataset, otrosIngresos: nextIngresos });
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar ingreso ${ingreso.concepto}`,
            type: 'delete_ingreso_otro',
            id: ingreso.id,
            rowNumber: ingreso.rowNumber,
          },
          { ...dataset, otrosIngresos: nextIngresos }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    if (!ingreso.rowNumber) throw new Error('No se encontró la fila del ingreso en la hoja.');
    const tab = requireTab('otrosIngresos');
    await deleteSheetRow(token, spreadsheetId, tab, ingreso.rowNumber);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleDeleteConceptoIngreso = async (concepto: ConceptoIngreso) => {
    if (shouldSaveOffline() || concepto.rowNumber === -1) {
      const nextConceptos = (dataset.conceptosIngreso || []).filter(
        (c) => c.id !== concepto.id
      );
      if (concepto.rowNumber === -1) {
        const targetNorm = concepto.concepto.trim().toLowerCase();
        const nextQueue = offlineQueue
          .filter(
            (a) =>
              !(
                a.type === 'create_concepto_ingreso' &&
                a.draft.concepto.trim().toLowerCase() === targetNorm
              )
          )
          .map((a) =>
            a.type === 'create_ingreso_otro' &&
            a.saveConcept?.concepto.trim().toLowerCase() === targetNorm
              ? { ...a, saveConcept: undefined }
              : a
          );
        setDataset({ ...dataset, conceptosIngreso: nextConceptos });
        persistDatasetCache({ ...dataset, conceptosIngreso: nextConceptos });
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar concepto ingreso ${concepto.concepto}`,
            type: 'delete_concepto_ingreso',
            id: concepto.id,
            rowNumber: concepto.rowNumber,
          },
          { ...dataset, conceptosIngreso: nextConceptos }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    if (!concepto.rowNumber) throw new Error('No se encontró la fila del concepto en la hoja.');
    const tab = requireTab('conceptosIngreso');
    await deleteSheetRow(token, spreadsheetId, tab, concepto.rowNumber);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleDeleteSueldo = async (sueldo: Sueldo) => {
    if (shouldSaveOffline() || sueldo.rowNumber === -1) {
      const nextSueldos = dataset.sueldos.filter((s) => s.id !== sueldo.id);
      if (sueldo.rowNumber === -1) {
        const nextQueue = offlineQueue.filter(
          (a) => !(a.type === 'create_sueldo' && a.tempId === sueldo.id)
        );
        setDataset({ ...dataset, sueldos: nextSueldos });
        persistDatasetCache({ ...dataset, sueldos: nextSueldos });
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar sueldo ${sueldo.trabajador}`,
            type: 'delete_sueldo',
            id: sueldo.id,
            rowNumber: sueldo.rowNumber,
          },
          { ...dataset, sueldos: nextSueldos }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    if (!sueldo.rowNumber) throw new Error('No se encontró la fila del sueldo en la hoja.');
    const tab = requireTab('sueldos');
    await deleteSheetRow(token, spreadsheetId, tab, sueldo.rowNumber);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleDeleteProducto = async (prod: Producto) => {
    if (shouldSaveOffline() || prod.rowNumber === -1) {
      const nextProductos = dataset.productos.filter((p) => p.id !== prod.id);
      if (prod.rowNumber === -1) {
        const nextQueue = offlineQueue.filter(
          (a) => !(a.type === 'create_producto' && a.tempId === prod.id)
        );
        setDataset({ ...dataset, productos: nextProductos });
        persistDatasetCache({ ...dataset, productos: nextProductos });
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar producto ${prod.nombre}`,
            type: 'delete_producto',
            id: prod.id,
            rowNumber: prod.rowNumber,
          },
          { ...dataset, productos: nextProductos }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    if (!prod.rowNumber) throw new Error('No se encontró la fila del producto en la hoja.');
    const tab = requireTab('productos');
    await deleteSheetRow(token, spreadsheetId, tab, prod.rowNumber);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  const handleDeleteCliente = async (cliente: Cliente) => {
    if (shouldSaveOffline() || cliente.rowNumber === -1) {
      const nextClientes = dataset.clientes.filter((c) => c.id !== cliente.id);
      if (cliente.rowNumber === -1) {
        const nextQueue = offlineQueue.filter(
          (a) => !(a.type === 'create_cliente' && a.tempId === cliente.id)
        );
        setDataset({ ...dataset, clientes: nextClientes });
        persistDatasetCache({ ...dataset, clientes: nextClientes });
        updateOfflineQueueState(nextQueue);
      } else {
        enqueueOfflineMutation(
          {
            qid: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            summary: `Eliminar cliente ${cliente.nombre}`,
            type: 'delete_cliente',
            id: cliente.id,
            rowNumber: cliente.rowNumber,
          },
          { ...dataset, clientes: nextClientes }
        );
      }
      return;
    }
    const token = getAccessToken()!;
    if (!cliente.rowNumber) throw new Error('No se encontró la fila del cliente en la hoja.');
    const tab = requireTab('clientes');
    await deleteSheetRow(token, spreadsheetId, tab, cliente.rowNumber);
    await syncSpreadsheetData(spreadsheetId, tabMapping);
  };

  if (isAuthChecking && !effectiveOffline && !offlineSessionEntered) {
    return (
      <div className="min-h-screen bg-[var(--theme-bg)] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <img
            src={logoUrl}
            alt="Productos Astorga"
            referrerPolicy="no-referrer"
            className="w-32 h-auto object-contain"
          />
          <div className="flex items-center gap-2 text-sm font-semibold text-[#6E6259]">
            <RefreshCw className="w-4 h-4 animate-spin text-[var(--theme-primary)]" />
            <span>Abriendo Productos Astorga...</span>
          </div>
        </div>
      </div>
    );
  }

  // Sign-In screen when unauthenticated (unless offline mode is active / user chose offline)
  if (needsAuth && !effectiveOffline && !offlineSessionEntered) {
    return (
      <div className="min-h-screen bg-[var(--theme-bg)] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white border border-[#E7E3DC] p-7 sm:p-9 text-center space-y-6">
          <div className="w-48 mx-auto">
            <img
              src={logoUrl}
              alt="Productos Astorga"
              referrerPolicy="no-referrer"
              className="w-full h-auto max-h-40 object-contain mx-auto"
            />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-[#1F1A17]">
              Productos Astorga
            </h1>
            <p className="text-sm text-[#6E6259] leading-relaxed">
              Conecta tu cuenta de Google para sincronizar productos, clientes, rutas, tickets y finanzas directamente con Google Sheets.
            </p>
          </div>

          {authError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-800 text-left">
              {authError}
            </div>
          )}

          <div className="flex flex-col items-center gap-3 pt-1">
            <GoogleSignInButton
              onClick={handleLogin}
              disabled={isLoggingIn}
              label={isLoggingIn ? 'Conectando...' : 'Sign in with Google'}
            />
            <label className="w-full max-w-[230px] flex items-center justify-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#49403A] hover:bg-[#FAF8F5] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => handleToggleKeepSignedIn(e.target.checked)}
                className="w-4 h-4 rounded border-[#D8D1C7] accent-[var(--theme-primary)] cursor-pointer"
              />
              <span>Mantener sesión iniciada</span>
            </label>
            <button
              type="button"
              onClick={() => {
                toggleManualOfflineMode(true);
                setOfflineSessionEntered(true);
              }}
              className="w-full max-w-[230px] min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] px-4 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)]"
            >
              <WifiOff className="w-4 h-4 text-[var(--theme-accent)]" />
              <span>Trabajar en Modo Offline</span>
            </button>
            <div className="w-full max-w-[230px]">
              <PWAInstallButton />
            </div>
            <button
              type="button"
              disabled={isCheckingUpdate || isApplyingUpdate}
              onClick={() => {
                if (pwaNeedRefresh) {
                  applyUpdate();
                } else {
                  checkForUpdates();
                }
              }}
              className={`w-full max-w-[230px] min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                pwaNeedRefresh
                  ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white'
                  : 'border-[#E7E3DC] bg-white text-[#49403A] hover:bg-[#FAF8F5]'
              }`}
            >
              <Sparkles
                className={`w-4 h-4 ${
                  isCheckingUpdate || isApplyingUpdate ? 'animate-pulse' : ''
                }`}
              />
              <span>
                {isApplyingUpdate
                  ? 'Actualizando app...'
                  : pwaNeedRefresh
                  ? 'Nueva actualización · Actualizar'
                  : isCheckingUpdate
                  ? 'Buscando cambios...'
                  : 'Buscar actualización'}
              </span>
            </button>
          </div>

          <p className="text-xs text-[#8C7E73]">
            Instalable en Android y iOS · Funciona con o sin internet.
          </p>
        </div>
        <OfflineIndicator
          manualOfflineMode={manualOfflineMode}
          pendingCount={offlineQueue.length}
          isSyncingQueue={isSyncingQueue}
          onSyncPending={syncOfflineQueue}
        />
        {updateNotice && (
          <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-sm z-[60] rounded-2xl bg-white border border-[var(--theme-primary)]/30 p-3.5 shadow-2xl text-xs text-[#1F1A17] space-y-2.5">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[var(--theme-primary)]" />
                <span className="font-medium leading-snug">{updateNotice}</span>
              </div>
              <button
                type="button"
                onClick={clearUpdateNotice}
                aria-label="Cerrar aviso"
                className="p-1 rounded-lg text-[#6E6259] hover:bg-[#F5F2EC] shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {isOnline && (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isApplyingUpdate}
                  onClick={forceHardRefresh}
                  className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg bg-[var(--theme-tint)] border border-[#D8D1C7] px-3 py-1 text-[11px] font-bold text-[var(--theme-primary)] hover:opacity-90 disabled:opacity-60"
                >
                  <RefreshCw className={`w-3 h-3 ${isApplyingUpdate ? 'animate-spin' : ''}`} />
                  <span>Recargar última versión</span>
                </button>
              </div>
            )}
          </div>
        )}
        <PWAUpdateBanner
          visible={showUpdatePrompt}
          isApplying={isApplyingUpdate}
          onApply={applyUpdate}
          onDismiss={dismissUpdate}
        />
      </div>
    );
  }

  const currentNavItem = NAV_ITEMS.find((n) => n.id === activeModule) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[var(--theme-bg)] text-[#1F1A17] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-[#E7E3DC] z-30">
        <div className="p-5 border-b border-[#EFECE6] flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Productos Astorga"
            referrerPolicy="no-referrer"
            className="w-12 h-10 object-contain shrink-0"
          />
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-[#1F1A17] truncate">
              Productos Astorga
            </p>
            <p className="text-xs text-[#6E6259] truncate">
              {user?.email || 'Dulces típicos'}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left ${
                  active
                    ? 'bg-[var(--theme-primary)] text-white'
                    : 'text-[#49403A] hover:bg-[var(--theme-tint)] hover:text-[#1F1A17]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#EFECE6] space-y-2">
          <PWAInstallButton />
          <button
            type="button"
            disabled={isCheckingUpdate || isApplyingUpdate}
            onClick={() => {
              if (pwaNeedRefresh) {
                applyUpdate();
              } else {
                checkForUpdates();
              }
            }}
            className={`w-full min-h-[40px] flex items-center gap-2.5 px-3 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-60 ${
              pwaNeedRefresh
                ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white'
                : 'border-[#E7E3DC] text-[#49403A] hover:bg-[var(--theme-tint)]'
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 shrink-0 ${
                isCheckingUpdate || isApplyingUpdate ? 'animate-spin' : ''
              }`}
            />
            <span className="truncate flex-1 text-left">
              {isApplyingUpdate
                ? 'Actualizando app...'
                : pwaNeedRefresh
                ? 'Actualizar app ahora'
                : isCheckingUpdate
                ? 'Buscando cambios...'
                : 'Buscar actualización'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => toggleManualOfflineMode(!manualOfflineMode)}
            className={`w-full min-h-[40px] flex items-center gap-2.5 px-3 rounded-xl border text-xs font-semibold transition-colors ${
              effectiveOffline
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                : 'border-[#E7E3DC] text-[#49403A] hover:bg-[var(--theme-tint)]'
            }`}
          >
            {effectiveOffline ? (
              <WifiOff className="w-4 h-4 shrink-0" />
            ) : (
              <Wifi className="w-4 h-4 text-emerald-700 shrink-0" />
            )}
            <span className="truncate flex-1 text-left">
              {manualOfflineMode ? 'Modo Offline (Activo)' : 'Modo Offline'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowAppearanceModal(true)}
            className="w-full min-h-[40px] flex items-center gap-2.5 px-3 rounded-xl border border-[#E7E3DC] text-xs font-semibold text-[#49403A] hover:bg-[var(--theme-tint)] transition-colors"
          >
            <Palette className="w-4 h-4 text-[var(--theme-accent)] shrink-0" />
            <span className="truncate flex-1 text-left">Apariencia y colores</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSheetSetup(true)}
            className="w-full min-h-[42px] flex items-center gap-2.5 px-3 rounded-xl border border-[#E7E3DC] text-xs font-semibold text-[#49403A] hover:bg-[#FAF8F5] transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#15803D] shrink-0" />
            <span className="truncate flex-1 text-left">
              {spreadsheetTitle || 'Conectar Google Sheet'}
            </span>
          </button>
          <label className="w-full min-h-[38px] flex items-center justify-between gap-2 px-3 rounded-xl border border-[#E7E3DC] text-xs font-semibold text-[#49403A] hover:bg-[var(--theme-tint)] cursor-pointer select-none">
            <span>Mantener sesión iniciada</span>
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => handleToggleKeepSignedIn(e.target.checked)}
              className="w-4 h-4 rounded border-[#D8D1C7] accent-[var(--theme-primary)] cursor-pointer"
            />
          </label>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[40px] flex items-center gap-2.5 px-3 rounded-xl text-xs font-semibold text-[#6E6259] hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Compact Top Bar (Mobile: 48px, Desktop: 60px) */}
        {gmpQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}
        <header className="sticky top-0 z-20 h-12 lg:h-15 bg-white/95 backdrop-blur-md border-b border-[#E7E3DC] px-3 sm:px-6 flex items-center justify-between gap-1.5 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={logoUrl}
              alt="Productos Astorga"
              referrerPolicy="no-referrer"
              className="h-7 w-auto object-contain lg:hidden shrink-0"
            />
            <span className="text-sm lg:text-base font-bold text-[#1F1A17] truncate">
              {currentNavItem.label}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              disabled={isCheckingUpdate || isApplyingUpdate}
              onClick={() => {
                if (pwaNeedRefresh) {
                  applyUpdate();
                } else {
                  checkForUpdates();
                }
              }}
              title={
                pwaNeedRefresh
                  ? 'Nueva actualización lista — Toca para actualizar'
                  : 'Buscar actualización de la app'
              }
              aria-label={
                pwaNeedRefresh
                  ? 'Actualizar aplicación ahora'
                  : 'Buscar actualización de la app'
              }
              className={`min-h-[38px] sm:min-h-[40px] rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60 ${
                pwaNeedRefresh
                  ? 'px-2.5 border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white shadow-sm'
                  : 'lg:hidden px-2 border-[#E7E3DC] bg-white text-[#49403A] hover:bg-[var(--theme-tint)]'
              }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 shrink-0 ${
                  isCheckingUpdate || isApplyingUpdate
                    ? 'animate-spin'
                    : pwaNeedRefresh
                    ? 'animate-pulse'
                    : 'text-[var(--theme-primary)]'
                }`}
              />
              {pwaNeedRefresh && (
                <span>{isApplyingUpdate ? 'Actualizando...' : 'Actualizar'}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => toggleManualOfflineMode(!manualOfflineMode)}
              title={manualOfflineMode ? 'Desactivar modo offline' : 'Activar modo offline'}
              aria-label="Alternar modo offline"
              className={`min-h-[38px] sm:min-h-[40px] px-2 sm:px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${
                effectiveOffline
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-700'
                  : 'border-[#E7E3DC] bg-white text-[#49403A] hover:bg-[#FAF8F5]'
              }`}
            >
              {effectiveOffline ? (
                <WifiOff className="w-3.5 h-3.5" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span className="hidden xl:inline">
                {effectiveOffline ? 'Offline' : 'En línea'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowAppearanceModal(true)}
              aria-label="Personalizar apariencia, modo y colores"
              className="min-h-[38px] sm:min-h-[40px] px-2 sm:px-2.5 rounded-xl border border-[#E7E3DC] bg-white text-xs font-semibold text-[#49403A] hover:bg-[var(--theme-tint)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Palette className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
              <span className="hidden md:inline">Apariencia</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (effectiveOffline) return;
                let token = getAccessToken();
                if (!token) {
                  token = await handleReconnectGoogle();
                  if (!token) return;
                }
                if (offlineQueue.length > 0) {
                  await syncOfflineQueue();
                } else if (spreadsheetId) {
                  await syncSpreadsheetData(spreadsheetId, tabMapping);
                } else {
                  await refreshDriveFiles();
                  setShowSheetSetup(true);
                }
              }}
              disabled={
                isLoadingData ||
                isSyncingQueue ||
                isLoggingIn ||
                effectiveOffline ||
                (!spreadsheetId && hasGoogleToken)
              }
              aria-label="Sincronizar con Google Sheets"
              className="min-h-[38px] sm:min-h-[40px] px-2 sm:px-3 rounded-xl border border-[#E7E3DC] bg-white text-xs font-semibold text-[#49403A] hover:bg-[#FAF8F5] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isLoadingData || isSyncingQueue || isLoggingIn ? 'animate-spin' : ''
                }`}
              />
              <span className="hidden sm:inline">
                {isLoggingIn
                  ? 'Conectando...'
                  : isSyncingQueue
                  ? 'Subiendo...'
                  : isLoadingData
                  ? 'Sincronizando...'
                  : offlineQueue.length > 0
                  ? `Subir (${offlineQueue.length})`
                  : 'Sincronizar'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowSheetSetup(true)}
              className="min-h-[38px] sm:min-h-[40px] px-2 sm:px-3 rounded-xl bg-[var(--theme-tint)] border border-[#E7E3DC] text-xs font-semibold text-[var(--theme-primary)] hover:opacity-90 inline-flex items-center gap-1.5 whitespace-nowrap max-w-[100px] sm:max-w-[170px]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{spreadsheetTitle || 'Elegir hoja'}</span>
            </button>
          </div>
        </header>

        {/* Alerts for missing tabs or API errors */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-7xl w-full mx-auto space-y-5">

          {dataError && (
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-900">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                <span>{dataError}</span>
              </div>
              <button
                type="button"
                onClick={() => setDataError('')}
                className="text-xs font-semibold underline shrink-0"
              >
                Cerrar
              </button>
            </div>
          )}

          {sheetRepairNotice && (
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
                <span>{sheetRepairNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setSheetRepairNotice('')}
                className="text-xs font-semibold underline shrink-0"
              >
                Cerrar
              </button>
            </div>
          )}

          {spreadsheetId && sheetHealthIssues.length > 0 && !effectiveOffline && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[var(--theme-tint)] border border-[var(--theme-accent)]/35 px-4 py-3 text-sm text-[#1F1A17]">
              <div className="flex items-start gap-2.5">
                <Wrench className="w-4 h-4 shrink-0 mt-0.5 text-[var(--theme-accent)]" />
                <div>
                  <p className="font-bold text-[var(--theme-primary)]">
                    Se detectaron {sheetHealthIssues.length} ajuste(s) en &ldquo;{spreadsheetTitle}&rdquo;
                  </p>
                  <p className="text-xs text-[#6E6259] mt-0.5">
                    {sheetHealthIssues.slice(0, 2).join(' · ')}
                    {sheetHealthIssues.length > 2
                      ? ` · +${sheetHealthIssues.length - 2} más`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={handleRepairSpreadsheet}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[var(--theme-accent)] text-white text-xs font-semibold hover:opacity-90 whitespace-nowrap"
                >
                  Revisar y ajustar hojas
                </button>
              </div>
            </div>
          )}

          {offlineQueue.length > 0 && !effectiveOffline && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[var(--theme-tint)] border border-[var(--theme-accent)]/35 px-4 py-3 text-sm text-[#1F1A17]">
              <div className="flex items-start gap-2.5">
                <CloudUpload className="w-4 h-4 shrink-0 mt-0.5 text-[var(--theme-accent)]" />
                <div>
                  <p className="font-bold">
                    {offlineQueue.length} operación(es) guardada(s) pendiente(s) de subir
                  </p>
                  <p className="text-xs text-[#6E6259] mt-0.5">
                    {offlineQueue
                      .slice(0, 3)
                      .map((q) => q.summary)
                      .join(' · ')}
                    {offlineQueue.length > 3 ? ` · +${offlineQueue.length - 3} más` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSyncingQueue || isLoggingIn}
                onClick={syncOfflineQueue}
                className="min-h-[38px] px-3.5 rounded-xl bg-[var(--theme-primary)] text-white text-xs font-semibold hover:bg-[var(--theme-primary-hover)] whitespace-nowrap self-start sm:self-auto"
              >
                {isSyncingQueue ? 'Subiendo...' : 'Subir a Google Sheets'}
              </button>
            </div>
          )}

          {!spreadsheetId && !effectiveOffline && (
            <div className="rounded-2xl bg-white border border-[#E7E3DC] p-6 text-center space-y-3">
              <h2 className="text-lg font-bold text-[#1F1A17]">
                Conecta tu base de datos de Google Sheets
              </h2>
              <p className="text-sm text-[#6E6259]">
                Selecciona tu hoja de Google Sheets existente o crea un nuevo documento organizado por hojas para comenzar.
              </p>
              <button
                type="button"
                onClick={() => setShowSheetSetup(true)}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Seleccionar o crear documento</span>
              </button>
            </div>
          )}

          {activeModule === 'inicio' && (
            <InicioView
              dataset={dataset}
              logoUrl={logoUrl}
              spreadsheetTitle={spreadsheetTitle}
              onNavigate={setActiveModule}
              onOpenInactiveClients={() => {
                setClientesInitialInactiveFilter(true);
                setActiveModule('clientes');
              }}
              onOpenSheetSetup={() => setShowSheetSetup(true)}
              onOpenAppearance={() => setShowAppearanceModal(true)}
              onRefreshData={() =>
                spreadsheetId && syncSpreadsheetData(spreadsheetId, tabMapping)
              }
              isRefreshing={isLoadingData}
            />
          )}

          {activeModule === 'nuevo-pedido' && (
            <NuevoPedidoView
              dataset={dataset}
              logoUrl={logoUrl}
              ticketsTabName={tabMapping.tickets || DEFAULT_TAB_NAMES.tickets}
              rutasTabName={tabMapping.rutas || DEFAULT_TAB_NAMES.rutas}
              preselectedJornadaId={preselectedJornadaId}
              onClearPreselectedJornada={() => setPreselectedJornadaId('')}
              onRequestMutation={setPendingMutation}
              onCreateRuta={handleCreateRuta}
              onSaveTicket={handleSaveTicket}
              onViewTicket={openTicketModal}
              onDeleteTicket={handleDeleteTicket}
              onNavigateToAddCliente={() => setActiveModule('agregar-cliente')}
              onNavigateToJornadas={() => setActiveModule('jornadas')}
            />
          )}

          {activeModule === 'jornadas' && (
            <JornadasView
              dataset={dataset}
              jornadasTabName={tabMapping.jornadas || DEFAULT_TAB_NAMES.jornadas}
              productosTabName={tabMapping.productos || DEFAULT_TAB_NAMES.productos}
              ticketsTabName={tabMapping.tickets || DEFAULT_TAB_NAMES.tickets}
              egresosTabName={tabMapping.egresos || DEFAULT_TAB_NAMES.egresos}
              onRequestMutation={setPendingMutation}
              onCreateJornada={handleCreateJornada}
              onUpdateJornada={handleUpdateJornada}
              onFinalizeJornada={handleFinalizeJornada}
              onDeleteJornada={handleDeleteJornada}
              onViewTicket={openTicketModal}
              onDeleteTicket={handleDeleteTicket}
              onSaveEgreso={handleSaveEgreso}
              onUpdateEgreso={handleUpdateEgreso}
              onDeleteEgreso={handleDeleteEgreso}
              onCreateTicketInJornada={(j) => {
                setPreselectedJornadaId(j.id);
                setActiveModule('nuevo-pedido');
              }}
            />
          )}

          {activeModule === 'clientes' && (
            <ClientesHistorialView
              dataset={dataset}
              ticketsTabName={tabMapping.tickets || DEFAULT_TAB_NAMES.tickets}
              clientesTabName={tabMapping.clientes || DEFAULT_TAB_NAMES.clientes}
              rutasTabName={tabMapping.rutas || DEFAULT_TAB_NAMES.rutas}
              onRequestMutation={setPendingMutation}
              onViewTicket={openTicketModal}
              onDeleteTicket={handleDeleteTicket}
              onDeleteCliente={handleDeleteCliente}
              onUpdateCliente={handleUpdateCliente}
              onUpdateRuta={handleUpdateRuta}
              onNavigateToAddCliente={() => setActiveModule('agregar-cliente')}
              initialOnlyInactive15={clientesInitialInactiveFilter}
              onConsumeInitialInactiveFilter={() => setClientesInitialInactiveFilter(false)}
            />
          )}

          {activeModule === 'agregar-cliente' && (
            <AgregarClienteView
              dataset={dataset}
              clientesTabName={tabMapping.clientes || DEFAULT_TAB_NAMES.clientes}
              onRequestMutation={setPendingMutation}
              onSaveCliente={handleSaveCliente}
            />
          )}

          {activeModule === 'catalogo' && (
            <CatalogoEstadisticasView
              dataset={dataset}
              productosTabName={tabMapping.productos || DEFAULT_TAB_NAMES.productos}
              movimientosTabName={
                tabMapping.movimientosInventario || DEFAULT_TAB_NAMES.movimientosInventario
              }
              onRequestMutation={setPendingMutation}
              onCreateProducto={handleCreateProducto}
              onUpdateProducto={handleUpdateProducto}
              onDeleteProducto={handleDeleteProducto}
              onAdjustInventarioBatch={handleAdjustInventarioBatch}
              onCreateMovimientosInventario={handleCreateMovimientosInventario}
            />
          )}

          {activeModule === 'ingresos' && (
            <IngresosRutasView
              dataset={dataset}
              jornadasTabName={tabMapping.jornadas || DEFAULT_TAB_NAMES.jornadas}
              ticketsTabName={tabMapping.tickets || DEFAULT_TAB_NAMES.tickets}
              otrosIngresosTabName={
                tabMapping.otrosIngresos || DEFAULT_TAB_NAMES.otrosIngresos
              }
              conceptosIngresoTabName={
                tabMapping.conceptosIngreso || DEFAULT_TAB_NAMES.conceptosIngreso
              }
              onRequestMutation={setPendingMutation}
              onViewTicket={openTicketModal}
              onDeleteTicket={handleDeleteTicket}
              onDeleteJornada={handleDeleteJornada}
              onSaveIngresoOtro={handleSaveIngresoOtro}
              onUpdateIngresoOtro={handleUpdateIngresoOtro}
              onSaveConceptoIngreso={handleSaveConceptoIngreso}
              onDeleteIngresoOtro={handleDeleteIngresoOtro}
              onDeleteConceptoIngreso={handleDeleteConceptoIngreso}
              onNavigateToJornadas={() => setActiveModule('jornadas')}
            />
          )}

          {activeModule === 'egresos' && (
            <EgresosView
              dataset={dataset}
              egresosTabName={tabMapping.egresos || DEFAULT_TAB_NAMES.egresos}
              conceptosTabName={
                tabMapping.conceptosGasto || DEFAULT_TAB_NAMES.conceptosGasto
              }
              onRequestMutation={setPendingMutation}
              onSaveEgreso={handleSaveEgreso}
              onUpdateEgreso={handleUpdateEgreso}
              onSaveConcepto={handleSaveConcepto}
              onDeleteEgreso={handleDeleteEgreso}
              onDeleteConcepto={handleDeleteConcepto}
            />
          )}

          {activeModule === 'finanzas' && (
            <FinanzasView
              dataset={dataset}
              sueldosTabName={tabMapping.sueldos || DEFAULT_TAB_NAMES.sueldos}
              finanzasTabName={
                tabMapping.finanzasMensuales || DEFAULT_TAB_NAMES.finanzasMensuales
              }
              onRequestMutation={setPendingMutation}
              onSaveSueldo={handleSaveSueldo}
              onUpdateSueldo={handleUpdateSueldo}
              onDeleteSueldo={handleDeleteSueldo}
              onUpsertFinanza={handleUpsertFinanza}
              onCloseMonth={handleCloseMonth}
            />
          )}

          {activeModule === 'reportes' && (
            <ReportesGraficasView
              dataset={dataset}
              customCharts={customCharts}
              onChangeCustomCharts={handleChangeCustomCharts}
              onOpenSyncBackup={() => setShowAppearanceModal(true)}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (60px height, <=15% sticky cap combined with 48px header) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E7E3DC] pb-safe">
        <div className="grid grid-cols-5 h-[60px] items-center">
          {(
            [
              { id: 'inicio', label: 'Inicio', icon: Home },
              { id: 'nuevo-pedido', label: 'Pedido', icon: ShoppingBag },
              { id: 'clientes', label: 'Clientes', icon: Users },
              { id: 'finanzas', label: 'Finanzas', icon: Wallet },
            ] as { id: AppModule; label: string; icon: React.ComponentType<{ className?: string }> }[]
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeModule === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveModule(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex flex-col items-center justify-center h-full gap-0.5 ${
                  active ? 'text-[var(--theme-primary)]' : 'text-[#7A6E65]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold tracking-tight">{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`relative flex flex-col items-center justify-center h-full gap-0.5 ${
              mobileMenuOpen ? 'text-[var(--theme-primary)]' : 'text-[#7A6E65]'
            }`}
          >
            <span className="relative">
              <Menu className="w-5 h-5" />
              {pwaNeedRefresh && (
                <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-[var(--theme-primary)] ring-2 ring-white animate-pulse" />
              )}
            </span>
            <span className="text-[10px] font-semibold tracking-tight">Módulos</span>
          </button>
        </div>
      </nav>

      {/* Mobile All-Modules Bottom Sheet */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-xs">
          <div className="w-full rounded-t-3xl bg-white p-5 pb-8 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="w-10 h-1.5 bg-[#D8D1C7] rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1F1A17]">Todos los módulos</h2>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#6E6259]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              disabled={isCheckingUpdate || isApplyingUpdate}
              onClick={() => {
                setMobileMenuOpen(false);
                if (pwaNeedRefresh) {
                  applyUpdate();
                } else {
                  checkForUpdates();
                }
              }}
              className={`w-full min-h-[48px] flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border text-left text-xs font-bold disabled:opacity-60 ${
                pwaNeedRefresh
                  ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white shadow-sm'
                  : 'border-[#E7E3DC] bg-[var(--theme-tint)] text-[#1F1A17]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Sparkles
                  className={`w-4 h-4 shrink-0 ${
                    isCheckingUpdate || isApplyingUpdate
                      ? 'animate-spin'
                      : pwaNeedRefresh
                      ? 'animate-pulse'
                      : 'text-[var(--theme-primary)]'
                  }`}
                />
                <span className="truncate">
                  {isApplyingUpdate
                    ? 'Actualizando aplicación...'
                    : pwaNeedRefresh
                    ? 'Nueva actualización lista · Toca para actualizar'
                    : isCheckingUpdate
                    ? 'Buscando cambios nuevos...'
                    : 'Buscar actualización de la app'}
                </span>
              </span>
              <RefreshCw
                className={`w-4 h-4 shrink-0 ${
                  isCheckingUpdate || isApplyingUpdate ? 'animate-spin' : ''
                }`}
              />
            </button>

            <PWAInstallButton />

            <div className="grid grid-cols-2 gap-2.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[52px] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-xs font-bold ${
                      active
                        ? 'bg-[var(--theme-primary)] text-white border-[var(--theme-primary)]'
                        : 'bg-[#FAF8F5] text-[#1F1A17] border-[#E7E3DC]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#EFECE6] space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  toggleManualOfflineMode(!manualOfflineMode);
                  setMobileMenuOpen(false);
                }}
                className={`w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border text-xs font-semibold ${
                  effectiveOffline
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                    : 'border-[#D8D1C7] text-[#1F1A17]'
                }`}
              >
                {effectiveOffline ? (
                  <WifiOff className="w-4 h-4" />
                ) : (
                  <Wifi className="w-4 h-4 text-emerald-700" />
                )}
                <span>
                  {manualOfflineMode ? 'Desactivar Modo Offline' : 'Activar Modo Offline'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowAppearanceModal(true);
                }}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] text-xs font-semibold text-[#1F1A17]"
              >
                <Palette className="w-4 h-4 text-[var(--theme-accent)]" />
                <span>Apariencia: claro, oscuro, nítido y colores</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowSheetSetup(true);
                }}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] text-xs font-semibold text-[#1F1A17]"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#15803D]" />
                <span>Hojas de Google Sheets</span>
              </button>
              <label className="w-full min-h-[44px] flex items-center justify-between gap-2 px-4 rounded-xl border border-[#D8D1C7] text-xs font-semibold text-[#1F1A17] cursor-pointer select-none">
                <span>Mantener sesión iniciada</span>
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => handleToggleKeepSignedIn(e.target.checked)}
                  className="w-4 h-4 rounded border-[#D8D1C7] accent-[var(--theme-primary)] cursor-pointer"
                />
              </label>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[#B91C1C] bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar sesión ({user?.email || 'Local'})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View / Edit / Delete Ticket Modal */}
      <TicketDetailModal
        ticket={
          viewingTicket
            ? dataset.tickets.find((t) => t.folio === viewingTicket.folio) || viewingTicket
            : null
        }
        initialEditMode={viewingTicketEditMode}
        dataset={dataset}
        ticketsTabName={tabMapping.tickets || DEFAULT_TAB_NAMES.tickets}
        logoUrl={logoUrl}
        onClose={() => {
          setViewingTicket(null);
          setViewingTicketEditMode(false);
        }}
        onRequestMutation={setPendingMutation}
        onUpdateTicket={handleUpdateTicket}
        onRecordAbono={handleRecordTicketAbono}
        onDeleteTicket={handleDeleteTicket}
      />

      {/* Logo, Surface Mode, Color Themes & Settings Sync Modal */}
      <AppearanceModal
        isOpen={showAppearanceModal}
        onClose={() => setShowAppearanceModal(false)}
        logoUrl={logoUrl}
        onChangeLogo={handleChangeLogo}
        onResetLogo={handleResetLogo}
        surfaceMode={surfaceMode}
        onChangeSurfaceMode={handleChangeSurfaceMode}
        activeThemeId={activeThemeId}
        customThemes={customThemes}
        onSelectTheme={handleSelectTheme}
        onAddCustomTheme={handleAddCustomTheme}
        onDeleteCustomTheme={handleDeleteCustomTheme}
        customCharts={customCharts}
        canCloudSync={Boolean(spreadsheetId) && !effectiveOffline && hasGoogleToken}
        onSaveConfigToSheet={handleSaveConfigToSheet}
        onLoadConfigFromSheet={handleLoadConfigFromSheet}
        onApplySettingsBackup={handleApplySettingsBackup}
      />

      {/* Sheet Setup & Tab Mapping Modal */}
      <SheetSetupModal
        isOpen={showSheetSetup}
        canClose={Boolean(spreadsheetId) || effectiveOffline}
        onClose={() => setShowSheetSetup(false)}
        driveFiles={driveFiles}
        isLoadingFiles={isLoadingFiles}
        onRefreshFiles={handleManualRefreshFiles}
        onSelectSpreadsheet={handleSelectSpreadsheet}
        onCreateSpreadsheet={handleCreateNewSpreadsheet}
        hasExistingData={
          dataset.productos.length > 0 ||
          dataset.clientes.length > 0 ||
          dataset.rutas.length > 0 ||
          dataset.tickets.length > 0 ||
          (dataset.otrosIngresos || []).length > 0 ||
          dataset.egresos.length > 0 ||
          dataset.sueldos.length > 0
        }
        connectedId={spreadsheetId}
        connectedTitle={spreadsheetTitle}
        tabMapping={tabMapping}
        missingTabs={missingTabs}
        availableSheetTitles={availableSheetTitles}
        sheetHealthIssues={sheetHealthIssues}
        onRepairSpreadsheet={handleRepairSpreadsheet}
        onUpdateTabMapping={handleUpdateTabMapping}
        onInitializeMissingTabs={handleInitializeMissingTabs}
      />

      {/* Explicit User Confirmation Modal before any Google Sheets write/mutation */}
      <ConfirmMutationModal
        mutation={pendingMutation}
        isSubmitting={isSubmittingMutation}
        onCancel={() => setPendingMutation(null)}
        onConfirm={executePendingMutation}
      />

      <OfflineIndicator
        manualOfflineMode={manualOfflineMode}
        pendingCount={offlineQueue.length}
        isSyncingQueue={isSyncingQueue}
        onSyncPending={syncOfflineQueue}
      />
      {updateNotice && (
        <div className="fixed bottom-[76px] lg:bottom-5 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-sm z-[60] rounded-2xl bg-white border border-[var(--theme-primary)]/30 p-3.5 shadow-2xl text-xs text-[#1F1A17] space-y-2.5">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[var(--theme-primary)]" />
              <span className="font-medium leading-snug">{updateNotice}</span>
            </div>
            <button
              type="button"
              onClick={clearUpdateNotice}
              aria-label="Cerrar aviso"
              className="p-1 rounded-lg text-[#6E6259] hover:bg-[#F5F2EC] shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {isOnline && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isApplyingUpdate}
                onClick={forceHardRefresh}
                className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg bg-[var(--theme-tint)] border border-[#D8D1C7] px-3 py-1 text-[11px] font-bold text-[var(--theme-primary)] hover:opacity-90 disabled:opacity-60"
              >
                <RefreshCw className={`w-3 h-3 ${isApplyingUpdate ? 'animate-spin' : ''}`} />
                <span>Recargar última versión</span>
              </button>
            </div>
          )}
        </div>
      )}
      <PWAUpdateBanner
        visible={showUpdatePrompt}
        isApplying={isApplyingUpdate}
        onApply={applyUpdate}
        onDismiss={dismissUpdate}
      />
    </div>
  );
}
