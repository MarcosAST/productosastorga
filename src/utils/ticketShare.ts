import { Ticket } from '../types/business';
import { CustomChartConfig } from './customCharts';
import { formatCurrency, formatDateShort } from './formatters';
import { getTicketPaymentSummary } from './paymentHelpers';
import { AppTheme, DEFAULT_LOGO_PATH, SurfaceMode } from './themeManager';

export const BUSINESS_BRANDING = {
  name: 'Productos Astorga',
  location: 'Guamúchil, Sinaloa.',
  instagram: '@productos_astorga',
  phone: '673 147 5446',
} as const;

export function sanitizePhoneDigits(phone: string): string {
  return (phone || '').replace(/\D+/g, '');
}

export function formatWhatsAppPhone(phone: string): string {
  const digits = sanitizePhoneDigits(phone);
  if (!digits) return '';
  // Default MX country code (+52) for 10-digit numbers
  if (digits.length === 10) return `52${digits}`;
  return digits;
}

export function buildWhatsAppClientUrl(phone: string, text?: string): string {
  const waPhone = formatWhatsAppPhone(phone);
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return waPhone ? `https://wa.me/${waPhone}${query}` : `https://wa.me/${query}`;
}

export function extractLatLngFromText(
  address: string
): { lat: number; lng: number } | null {
  const clean = (address || '').trim();
  if (!clean) return null;
  const match = clean.match(/(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

export function buildGoogleMapsUrl(address: string): string {
  const clean = (address || '').trim();
  if (!clean) return 'https://www.google.com/maps';
  const coords = extractLatLngFromText(clean);
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`;
}

export function buildWhatsAppTicketMessage(ticket: Ticket): string {
  const payment = getTicketPaymentSummary(ticket);
  const lines: string[] = [
    `*${BUSINESS_BRANDING.name}*`,
    BUSINESS_BRANDING.location,
    `Instagram: ${BUSINESS_BRANDING.instagram} · Cel/WhatsApp: ${BUSINESS_BRANDING.phone}`,
    '',
    `Comprobante de pedido *${ticket.folio}*`,
    `Fecha: ${formatDateShort(ticket.fecha)}`,
    `Cliente: ${ticket.clienteNombre}`,
    `Ruta: ${ticket.ruta}`,
    '',
    '*Productos:*',
  ];

  ticket.items.forEach((it) => {
    lines.push(
      `• ${it.cantidad}x ${it.productoNombre} — ${formatCurrency(it.subtotal)}`
    );
  });

  lines.push('');
  lines.push(`*Total:* ${formatCurrency(ticket.totalImporte)} (${ticket.totalPiezas} pzas)`);
  lines.push(`Estado de pago: *${payment.estadoPago}* (${payment.metodoPago})`);
  if (payment.saldoPendiente > 0) {
    lines.push(`Abonado: ${formatCurrency(payment.montoPagado)}`);
    lines.push(`*Saldo pendiente:* ${formatCurrency(payment.saldoPendiente)}`);
  }
  lines.push('');
  lines.push('¡Gracias por su preferencia!');

  return lines.join('\n');
}

export function buildWhatsAppTicketUrl(
  ticket: Ticket,
  clienteTelefono?: string
): string {
  const text = buildWhatsAppTicketMessage(ticket);
  return buildWhatsAppClientUrl(clienteTelefono || '', text);
}

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderTicketReceiptBlob(
  ticket: Ticket,
  logoUrl?: string
): Promise<Blob> {
  const payment = getTicketPaymentSummary(ticket);
  const width = 560;
  const padX = 34;
  const contentW = width - padX * 2;

  // Measure height dynamically
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d')!;
  mCtx.font = '600 16px system-ui, sans-serif';

  const itemLayouts = ticket.items.map((it) => ({
    item: it,
    lines: wrapTextLines(mCtx, `${it.cantidad} × ${it.productoNombre}`, contentW - 130),
  }));

  const resolvedLogoUrl = logoUrl || DEFAULT_LOGO_PATH;
  const logoImg = resolvedLogoUrl ? await loadImageSafe(resolvedLogoUrl) : null;
  const logoHeight = logoImg ? 78 : 0;

  const itemsHeight = itemLayouts.reduce(
    (sum, l) => sum + Math.max(1, l.lines.length) * 22 + 18,
    0
  );
  const paymentExtraHeight = payment.saldoPendiente > 0 ? 54 : 0;
  const totalHeight =
    60 + // top margin
    (logoHeight > 0 ? logoHeight + 16 : 0) +
    198 + // brand (location, IG, WhatsApp) & metadata block
    40 + // items header
    Math.max(40, itemsHeight) +
    130 + // totals & payment box
    paymentExtraHeight +
    70; // footer

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  // Clean paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, totalHeight);

  // Subtle top accent bar
  ctx.fillStyle = '#4A2511';
  ctx.fillRect(0, 0, width, 10);

  let y = 36;

  if (logoImg) {
    const scale = Math.min(180 / logoImg.width, 72 / logoImg.height);
    const dw = logoImg.width * scale;
    const dh = logoImg.height * scale;
    ctx.drawImage(logoImg, (width - dw) / 2, y, dw, dh);
    y += dh + 16;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1F1A17';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText('PRODUCTOS ASTORGA', width / 2, y);
  y += 20;

  ctx.fillStyle = '#49403A';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(BUSINESS_BRANDING.location, width / 2, y);
  y += 18;

  ctx.fillStyle = '#6E6259';
  ctx.font = '500 12.5px system-ui, sans-serif';
  ctx.fillText(`Instagram: ${BUSINESS_BRANDING.instagram}`, width / 2, y);
  y += 17;
  ctx.fillText(`Cel / WhatsApp: ${BUSINESS_BRANDING.phone}`, width / 2, y);
  y += 20;

  // Dashed divider
  ctx.strokeStyle = '#D8D1C7';
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(width - padX, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 24;

  // Metadata
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6E6259';
  ctx.font = '500 13px system-ui, sans-serif';
  ctx.fillText('Folio:', padX, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#4A2511';
  ctx.font = '700 15px monospace';
  ctx.fillText(ticket.folio, width - padX, y);
  y += 24;

  const metaRows: [string, string][] = [
    ['Fecha:', formatDateShort(ticket.fecha)],
    ['Cliente:', ticket.clienteNombre],
    ['Ruta:', ticket.ruta],
  ];
  for (const [label, value] of metaRows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6E6259';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillText(label, padX, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1F1A17';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(value.slice(0, 38), width - padX, y);
    y += 22;
  }

  y += 8;
  ctx.strokeStyle = '#E7E3DC';
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(width - padX, y);
  ctx.stroke();
  y += 24;

  // Table header
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6E6259';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillText('PRODUCTO', padX, y);
  ctx.textAlign = 'right';
  ctx.fillText('SUBTOTAL', width - padX, y);
  y += 18;

  for (const layout of itemLayouts) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1F1A17';
    ctx.font = '600 15px system-ui, sans-serif';
    layout.lines.forEach((line, idx) => {
      ctx.fillText(line, padX, y + idx * 20);
    });

    ctx.textAlign = 'right';
    ctx.font = '700 15px monospace';
    ctx.fillText(formatCurrency(layout.item.subtotal), width - padX, y);

    const nextY = y + Math.max(1, layout.lines.length) * 20;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8C7E73';
    ctx.font = '400 12px system-ui, sans-serif';
    ctx.fillText(
      `P. unitario: ${formatCurrency(layout.item.precioUnitario)}`,
      padX,
      nextY
    );
    y = nextY + 18;
  }

  y += 6;
  ctx.strokeStyle = '#4A2511';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(width - padX, y);
  ctx.stroke();
  ctx.lineWidth = 1;
  y += 28;

  // Total & pieces
  ctx.textAlign = 'left';
  ctx.fillStyle = '#49403A';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(`Total piezas: ${ticket.totalPiezas}`, padX, y);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#4A2511';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(formatCurrency(ticket.totalImporte), width - padX, y + 2);
  y += 28;

  // Payment status box
  ctx.fillStyle = '#FAF6F0';
  const boxH = payment.saldoPendiente > 0 ? 74 : 44;
  ctx.fillRect(padX, y, contentW, boxH);
  ctx.strokeStyle = '#E7E3DC';
  ctx.strokeRect(padX, y, contentW, boxH);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#1F1A17';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(`Pago: ${payment.estadoPago} (${payment.metodoPago})`, padX + 12, y + 26);

  if (payment.saldoPendiente > 0) {
    ctx.fillStyle = '#6E6259';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(`Abonado: ${formatCurrency(payment.montoPagado)}`, padX + 12, y + 52);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#B91C1C';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(
      `Pendiente: ${formatCurrency(payment.saldoPendiente)}`,
      width - padX - 12,
      y + 52
    );
  }

  y += boxH + 30;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8C7E73';
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.fillText('¡Gracias por su compra en Productos Astorga!', width / 2, y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No se pudo generar la imagen del comprobante.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export async function downloadTicketReceiptPng(
  ticket: Ticket,
  logoUrl?: string
): Promise<void> {
  const blob = await renderTicketReceiptBlob(ticket, logoUrl);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ticket-${ticket.folio}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function shareTicketReceiptPng(
  ticket: Ticket,
  logoUrl?: string
): Promise<'shared' | 'downloaded'> {
  const blob = await renderTicketReceiptBlob(ticket, logoUrl);
  const file = new File([blob], `Ticket-${ticket.folio}.png`, {
    type: 'image/png',
  });
  const nav: any = navigator;
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({
          title: `Ticket ${ticket.folio} - Productos Astorga`,
          text: buildWhatsAppTicketMessage(ticket),
          files: [file],
        });
        return 'shared';
      }
    } catch {
      // User cancelled or share unsupported; fall back to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ticket-${ticket.folio}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return 'downloaded';
}

export interface AppSettingsBackupPayload {
  version: 1;
  updatedAt: string;
  activeThemeId: string;
  surfaceMode: SurfaceMode;
  customThemes: AppTheme[];
  customCharts: CustomChartConfig[];
  logoUrl?: string;
}

export function downloadSettingsBackupJson(payload: AppSettingsBackupPayload): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `astorga-respaldo-ajustes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseSettingsBackupJson(rawText: string): AppSettingsBackupPayload {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('El archivo no tiene un formato JSON válido.');
  }
  const surface: SurfaceMode =
    parsed.surfaceMode === 'oscuro' || parsed.surfaceMode === 'nitido'
      ? parsed.surfaceMode
      : 'claro';
  return {
    version: 1,
    updatedAt: String(parsed.updatedAt || new Date().toISOString()),
    activeThemeId: String(parsed.activeThemeId || 'cacao-clasico'),
    surfaceMode: surface,
    customThemes: Array.isArray(parsed.customThemes) ? parsed.customThemes : [],
    customCharts: Array.isArray(parsed.customCharts) ? parsed.customCharts : [],
    logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : undefined,
  };
}
