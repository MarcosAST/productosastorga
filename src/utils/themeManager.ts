export type SurfaceMode = 'claro' | 'oscuro' | 'nitido';

export interface AppTheme {
  id: string;
  name: string;
  primary: string;
  accent: string;
  bg: string;
  tint: string;
  isCustom?: boolean;
}

export const DEFAULT_LOGO_PATH = '/assets/aistudio/productos_astorga__1__4f8f8c35.png';
const LOGO_STORAGE_KEY = 'astorga_custom_logo_v1';
const THEME_STORAGE_KEY = 'astorga_active_theme_v1';
const CUSTOM_THEMES_STORAGE_KEY = 'astorga_custom_themes_v1';
const SURFACE_MODE_STORAGE_KEY = 'astorga_surface_mode_v1';

export const PRESET_THEMES: AppTheme[] = [
  {
    id: 'cacao-clasico',
    name: 'Cacao Clásico',
    primary: '#4A2511',
    accent: '#D98218',
    bg: '#F8F7F4',
    tint: '#FAF6F0',
  },
  {
    id: 'miel-canela',
    name: 'Miel y Canela',
    primary: '#7C2D12',
    accent: '#EA580C',
    bg: '#FBF8F6',
    tint: '#FFF5EE',
  },
  {
    id: 'agave-verde',
    name: 'Agave y Bosque',
    primary: '#14532D',
    accent: '#65A30D',
    bg: '#F6F9F7',
    tint: '#F0F7F2',
  },
  {
    id: 'jamaica-rosa',
    name: 'Jamaica Artesanal',
    primary: '#831843',
    accent: '#DB2777',
    bg: '#FAF7F8',
    tint: '#FDF2F7',
  },
  {
    id: 'anil-azul',
    name: 'Añil Tradicional',
    primary: '#1E3A8A',
    accent: '#0284C7',
    bg: '#F6F8FB',
    tint: '#EFF6FF',
  },
  {
    id: 'carbon-ambar',
    name: 'Carbón y Ámbar',
    primary: '#18181B',
    accent: '#D97706',
    bg: '#F7F7F8',
    tint: '#F4F4F5',
  },
  {
    id: 'esmeralda-fresca',
    name: 'Esmeralda Fresca',
    primary: '#065F46',
    accent: '#10B981',
    bg: '#F4FBF8',
    tint: '#ECFDF5',
  },
  {
    id: 'violeta-real',
    name: 'Violeta Real',
    primary: '#4C1D95',
    accent: '#8B5CF6',
    bg: '#F8F6FC',
    tint: '#F5F3FF',
  },
  {
    id: 'terracota-solar',
    name: 'Terracota Solar',
    primary: '#9A3412',
    accent: '#F59E0B',
    bg: '#FCF8F4',
    tint: '#FFF7ED',
  },
  {
    id: 'oceano-turquesa',
    name: 'Océano Turquesa',
    primary: '#115E59',
    accent: '#06B6D4',
    bg: '#F3FAFA',
    tint: '#ECFEFF',
  },
];

function darkenHex(hex: string, amount = 0.18): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#3A1C0C';
  const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function lightenHex(hex: string, amount = 0.45): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#E6A957';
  const r = Math.min(
    255,
    Math.round(parseInt(clean.slice(0, 2), 16) + (255 - parseInt(clean.slice(0, 2), 16)) * amount)
  );
  const g = Math.min(
    255,
    Math.round(parseInt(clean.slice(2, 4), 16) + (255 - parseInt(clean.slice(2, 4), 16)) * amount)
  );
  const b = Math.min(
    255,
    Math.round(parseInt(clean.slice(4, 6), 16) + (255 - parseInt(clean.slice(4, 6), 16)) * amount)
  );
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function applyThemeToDocument(theme: AppTheme, surfaceMode: SurfaceMode = 'claro'): void {
  const root = document.documentElement;
  root.setAttribute('data-surface-mode', surfaceMode);

  let effectiveBg = theme.bg;
  let effectiveTint = theme.tint;
  let effectivePrimary = theme.primary;
  let effectivePrimaryInk = theme.primary;

  if (surfaceMode === 'oscuro') {
    effectiveBg = '#12100E';
    effectiveTint = '#2A2521';
    effectivePrimaryInk = lightenHex(theme.accent || theme.primary, 0.25);
    if (theme.primary.toLowerCase() === '#18181b') {
      effectivePrimary = '#D97706';
    }
  } else if (surfaceMode === 'nitido') {
    effectiveBg = '#FFFFFF';
    effectiveTint = '#F4F4F5';
    effectivePrimaryInk = theme.primary;
  }

  root.style.setProperty('--theme-primary', effectivePrimary);
  root.style.setProperty('--theme-primary-hover', darkenHex(effectivePrimary, 0.2));
  root.style.setProperty('--theme-primary-ink', effectivePrimaryInk);
  root.style.setProperty('--theme-accent', theme.accent);
  root.style.setProperty('--theme-bg', effectiveBg);
  root.style.setProperty('--theme-tint', effectiveTint);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', surfaceMode === 'oscuro' ? '#12100E' : effectivePrimary);
  }
}

export function loadSurfaceMode(): SurfaceMode {
  try {
    const val = localStorage.getItem(SURFACE_MODE_STORAGE_KEY);
    if (val === 'claro' || val === 'oscuro' || val === 'nitido') return val;
    return 'claro';
  } catch {
    return 'claro';
  }
}

export function saveSurfaceMode(mode: SurfaceMode): void {
  try {
    localStorage.setItem(SURFACE_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore
  }
}

export function loadActiveThemeId(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || PRESET_THEMES[0].id;
  } catch {
    return PRESET_THEMES[0].id;
  }
}

export function saveActiveThemeId(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Ignore
  }
}

export function loadCustomThemes(): AppTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes: AppTheme[]): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
  } catch {
    // Ignore
  }
}

export function loadSavedLogo(): string {
  try {
    return localStorage.getItem(LOGO_STORAGE_KEY) || DEFAULT_LOGO_PATH;
  } catch {
    return DEFAULT_LOGO_PATH;
  }
}

export function saveCustomLogo(dataUrl: string): void {
  try {
    localStorage.setItem(LOGO_STORAGE_KEY, dataUrl);
  } catch {
    // Ignore storage quota errors
  }
}

export function resetCustomLogo(): string {
  try {
    localStorage.removeItem(LOGO_STORAGE_KEY);
  } catch {
    // Ignore
  }
  return DEFAULT_LOGO_PATH;
}

export async function processLogoImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const maxSize = 512;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function compressLogoForSheetSync(
  logoUrl: string,
  maxChars = 42000
): Promise<string | undefined> {
  if (!logoUrl) return undefined;
  if (!logoUrl.startsWith('data:image')) return logoUrl;
  if (logoUrl.length <= maxChars) return logoUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      for (const size of [256, 180, 128]) {
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.72);
        if (compressed.length <= maxChars) {
          resolve(compressed);
          return;
        }
      }
      resolve(undefined);
    };
    img.onerror = () => resolve(undefined);
    img.src = logoUrl;
  });
}

