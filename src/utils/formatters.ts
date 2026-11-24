export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-MX').format(safe);
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getNextMonthISO(mesISO: string): string {
  const [yStr, mStr] = mesISO.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  if (!y || !m) return getCurrentMonthISO();
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function formatMonthLabel(mesISO: string): string {
  const [yStr, mStr] = mesISO.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (!y || !m) return mesISO;
  const date = new Date(y, m - 1, 1);
  const label = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDateShort(dateISO: string): string {
  if (!dateISO) return '';
  const parts = dateISO.split('-');
  if (parts.length !== 3) return dateISO;
  const [y, m, d] = parts.map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dateISO;
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function normalizeText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function parseNumericValue(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (typeof raw !== 'string') return 0;
  const cleaned = raw.replace(/[$,\sMXN]/gi, '').trim();
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

const SPANISH_MONTHS: Record<string, string> = {
  ene: '01',
  enero: '01',
  jan: '01',
  feb: '02',
  febrero: '02',
  mar: '03',
  marzo: '03',
  abr: '04',
  abril: '04',
  apr: '04',
  may: '05',
  mayo: '05',
  jun: '06',
  junio: '06',
  jul: '07',
  julio: '07',
  ago: '08',
  agosto: '08',
  aug: '08',
  sep: '09',
  sept: '09',
  septiembre: '09',
  oct: '10',
  octubre: '10',
  nov: '11',
  noviembre: '11',
  dic: '12',
  diciembre: '12',
  dec: '12',
};

export function normalizeSheetDate(raw: unknown): string {
  const s = String(raw ?? '').trim().replace(/^'/, '');
  if (!s) return '';

  // Already YYYY-MM-DD or YYYY-MM-DDTHH...
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or D/M/YYYY (es_MX standard in Google Sheets)
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const [, first, second, y] = dmyMatch;
    const p1 = parseInt(first, 10);
    const p2 = parseInt(second, 10);
    // In es_MX, first is day and second is month unless second > 12
    const day = p2 > 12 ? second : first;
    const month = p2 > 12 ? first : second;
    if (parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12 && p1 >= 1 && p1 <= 31) {
      return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return s;
}

export function normalizeSheetMonth(raw: unknown): string {
  const s = String(raw ?? '').trim().replace(/^'/, '');
  if (!s) return '';

  // Already YYYY-MM or YYYY-MM-DD
  const ymMatch = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (ymMatch) {
    return `${ymMatch[1]}-${ymMatch[2].padStart(2, '0')}`;
  }

  // DD/MM/YYYY -> YYYY-MM (Google Sheets converts '2026-11' into 01/11/2026)
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, first, second, y] = dmyMatch;
    const monthNum = parseInt(second, 10) > 12 ? parseInt(first, 10) : parseInt(second, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      return `${y}-${String(monthNum).padStart(2, '0')}`;
    }
  }

  // MM/YYYY or MM-YYYY
  const myMatch = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (myMatch) {
    return `${myMatch[2]}-${myMatch[1].padStart(2, '0')}`;
  }

  // Spanish/English text months like "nov-26", "noviembre 2026", "nov. 2026"
  const norm = normalizeText(s).replace(/\./g, '');
  const textMatch = norm.match(/^([a-z]+)[-\s]+(\d{2,4})$/);
  if (textMatch) {
    const m = SPANISH_MONTHS[textMatch[1]];
    if (m) {
      const yr = textMatch[2].length === 2 ? `20${textMatch[2]}` : textMatch[2];
      return `${yr}-${m}`;
    }
  }

  return s;
}

export function parseFolioNumber(folio: string): number {
  const match = (folio || '').match(/(\d+)/g);
  if (!match || match.length === 0) return 0;
  const num = parseInt(match[match.length - 1], 10);
  return Number.isFinite(num) ? num : 0;
}

export function generateNextFolio(existingFolios: string[], prefix = 'AST'): string {
  let maxNum = 0;
  for (const f of existingFolios) {
    const n = parseFolioNumber(f);
    if (n > maxNum) maxNum = n;
  }
  const next = maxNum + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  return trimmed;
}
