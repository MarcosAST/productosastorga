import { Ticket } from '../types/business';
import { CustomChartConfig } from './customCharts';
import { formatCurrency, formatDateShort } from './formatters';
import { getTicketPaymentSummary } from './paymentHelpers';
import { AppTheme, DEFAULT_LOGO_PATH, SurfaceMode } from './themeManager';
import { getTicketItemTipo, getTicketSummary } from './ticketAdjustments';

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
  const summary = getTicketSummary(ticket);
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
    const tipo = getTicketItemTipo(it);
    const tag = tipo !== 'Venta' ? ` [${tipo}]` : '';
    const motivoStr = it.motivo ? ` (${it.motivo})` : '';
    const amountStr =
      tipo === 'Cortesía' || tipo === 'Cambio'
        ? '$0.00'
        : tipo === 'Devolución'
        ? `-${formatCurrency(Math.abs(it.subtotal))}`
        : formatCurrency(it.subtotal);
    lines.push(`• ${it.cantidad}x ${it.productoNombre}${tag}${motivoStr} — ${amountStr}`);
  });

  lines.push('');
  if (summary.devolucionesMonto > 0 || summary.descuentoMonto > 0) {
    lines.push(`Subtotal: ${formatCurrency(summary.subtotalBruto)}`);
    if (summary.devolucionesMonto > 0) {
      lines.push(`Devoluciones: -${formatCurrency(summary.devolucionesMonto)}`);
    }
    if (summary.descuentoMonto > 0) {
      const descPct =
        summary.descuentoTipo === 'porcentaje' && summary.descuentoValor > 0
          ? ` (${summary.descuentoValor}%)`
          : '';
      const descMotivo = summary.descuentoMotivo ? ` · ${summary.descuentoMotivo}` : '';
      lines.push(
        `Descuento${descPct}${descMotivo}: -${formatCurrency(summary.descuentoMonto)}`
      );
    }
  }
  lines.push(
    `*Total:* ${formatCurrency(ticket.totalImporte)} (${ticket.totalPiezas} pzas${
      summary.piezasCortesia > 0 ? ` · ${summary.piezasCortesia} cortesía` : ''
    }${summary.piezasCambio > 0 ? ` · ${summary.piezasCambio} cambio` : ''})`
  );
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

const logoDataUrlCache = new Map<string, string>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo convertir la imagen.'));
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo imagen.'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string, useCrossOrigin: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    if (useCrossOrigin && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function fetchAsDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    const absoluteUrl = src.startsWith('/')
      ? `${window.location.origin}${src}`
      : src;
    const isSameOrigin = absoluteUrl.startsWith(window.location.origin);
    const res = await fetch(absoluteUrl, {
      mode: isSameOrigin ? 'same-origin' : 'cors',
      cache: 'force-cache',
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

export async function resolveLogoDataUrl(logoUrl?: string): Promise<string> {
  const candidates = Array.from(
    new Set([logoUrl?.trim() || '', DEFAULT_LOGO_PATH].filter(Boolean))
  );

  for (const src of candidates) {
    const cached = logoDataUrlCache.get(src);
    if (cached) return cached;

    const fetched = await fetchAsDataUrl(src);
    if (fetched) {
      logoDataUrlCache.set(src, fetched);
      return fetched;
    }

    // Fallback via Image -> Canvas (handles cases where Image works even if fetch fails)
    const img =
      (await loadImageElement(src, true)) ||
      (src.startsWith('/') ? await loadImageElement(src, false) : null);
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      try {
        const tmp = document.createElement('canvas');
        tmp.width = img.naturalWidth;
        tmp.height = img.naturalHeight;
        const tCtx = tmp.getContext('2d');
        if (tCtx) {
          tCtx.drawImage(img, 0, 0);
          const dataUrl = tmp.toDataURL('image/png');
          if (dataUrl.startsWith('data:')) {
            logoDataUrlCache.set(src, dataUrl);
            return dataUrl;
          }
        }
      } catch {
        // Canvas tainted by cross-origin URL without CORS; continue to fallback candidate
      }
    }
  }

  return DEFAULT_LOGO_PATH;
}

async function loadImageSafe(src?: string): Promise<HTMLImageElement | null> {
  const resolved = await resolveLogoDataUrl(src);
  const img = await loadImageElement(resolved, false);
  if (img) return img;
  if (resolved !== DEFAULT_LOGO_PATH) {
    return await loadImageElement(DEFAULT_LOGO_PATH, false);
  }
  return null;
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
  const summary = getTicketSummary(ticket);
  const width = 560;
  const padX = 34;
  const contentW = width - padX * 2;

  // Measure height dynamically
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d')!;
  mCtx.font = '600 16px system-ui, sans-serif';

  const itemLayouts = ticket.items.map((it) => {
    const tipo = getTicketItemTipo(it);
    const label =
      tipo !== 'Venta'
        ? `${it.cantidad} × ${it.productoNombre} [${tipo}]`
        : `${it.cantidad} × ${it.productoNombre}`;
    return {
      item: it,
      tipo,
      lines: wrapTextLines(mCtx, label, contentW - 135),
    };
  });

  const logoImg = await loadImageSafe(logoUrl);
  const headerBlockHeight = 96;

  const itemsHeight = itemLayouts.reduce(
    (sum, l) => sum + Math.max(1, l.lines.length) * 22 + 18,
    0
  );
  const adjustmentsExtraHeight =
    (summary.devolucionesMonto > 0 || summary.descuentoMonto > 0 ? 26 : 0) +
    (summary.devolucionesMonto > 0 ? 22 : 0) +
    (summary.descuentoMonto > 0 ? 22 : 0) +
    (summary.piezasCortesia > 0 || summary.piezasCambio > 0 ? 18 : 0);
  const paymentExtraHeight = payment.saldoPendiente > 0 ? 54 : 0;
  const totalHeight =
    46 + // top margin
    headerBlockHeight + // horizontal logo + brand info
    140 + // metadata block
    40 + // items header
    Math.max(40, itemsHeight) +
    adjustmentsExtraHeight +
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

  let y = 32;

  // Header: Logo on the LEFT beside "PRODUCTOS ASTORGA" (centered horizontal lockup)
  const brandTitle = 'PRODUCTOS ASTORGA';
  const locLine = BUSINESS_BRANDING.location;
  const igLine = `Instagram: ${BUSINESS_BRANDING.instagram}`;
  const phoneLine = `Cel / WhatsApp: ${BUSINESS_BRANDING.phone}`;

  ctx.font = '700 21px system-ui, sans-serif';
  const titleW = ctx.measureText(brandTitle).width;
  ctx.font = '600 13px system-ui, sans-serif';
  const locW = ctx.measureText(locLine).width;
  ctx.font = '500 12px system-ui, sans-serif';
  const igW = ctx.measureText(igLine).width;
  const phoneW = ctx.measureText(phoneLine).width;
  const textBlockW = Math.max(titleW, locW, igW, phoneW);

  if (logoImg) {
    const scale = Math.min(76 / logoImg.width, 76 / logoImg.height);
    const dw = Math.round(logoImg.width * scale);
    const dh = Math.round(logoImg.height * scale);
    const gap = 16;
    const totalLockupW = dw + gap + textBlockW;
    const startX = Math.max(padX, Math.round((width - totalLockupW) / 2));
    const textX = startX + dw + gap;
    const textBlockH = 74;
    const lockupH = Math.max(dh, textBlockH);
    const imgY = y + Math.round((lockupH - dh) / 2);

    ctx.drawImage(logoImg, startX, imgY, dw, dh);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#1F1A17';
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillText(brandTitle, textX, y + 20);

    ctx.fillStyle = '#49403A';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(locLine, textX, y + 40);

    ctx.fillStyle = '#6E6259';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(igLine, textX, y + 57);
    ctx.fillText(phoneLine, textX, y + 73);

    y += lockupH + 18;
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1F1A17';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(brandTitle, width / 2, y + 20);

    ctx.fillStyle = '#49403A';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(locLine, width / 2, y + 40);

    ctx.fillStyle = '#6E6259';
    ctx.font = '500 12.5px system-ui, sans-serif';
    ctx.fillText(igLine, width / 2, y + 58);
    ctx.fillText(phoneLine, width / 2, y + 75);
    y += 94;
  }

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
    const isDevolucion = layout.tipo === 'Devolución';
    const isFree = layout.tipo === 'Cortesía' || layout.tipo === 'Cambio';

    ctx.textAlign = 'left';
    ctx.fillStyle = isDevolucion ? '#B91C1C' : '#1F1A17';
    ctx.font = '600 15px system-ui, sans-serif';
    layout.lines.forEach((line, idx) => {
      ctx.fillText(line, padX, y + idx * 20);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = isDevolucion ? '#B91C1C' : isFree ? '#047857' : '#1F1A17';
    ctx.font = '700 15px monospace';
    const amountLabel = isFree
      ? '$0.00'
      : isDevolucion
      ? `-${formatCurrency(Math.abs(layout.item.subtotal))}`
      : formatCurrency(layout.item.subtotal);
    ctx.fillText(amountLabel, width - padX, y);

    const nextY = y + Math.max(1, layout.lines.length) * 20;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8C7E73';
    ctx.font = '400 12px system-ui, sans-serif';
    const subDetail =
      layout.tipo === 'Cortesía'
        ? `Cortesía sin costo${layout.item.motivo ? ` · ${layout.item.motivo}` : ''}`
        : layout.tipo === 'Cambio'
        ? `Cambio físico sin costo${layout.item.motivo ? ` · ${layout.item.motivo}` : ''}`
        : isDevolucion
        ? `Bonificación: ${formatCurrency(layout.item.precioUnitario)} c/u${
            layout.item.motivo ? ` · ${layout.item.motivo}` : ''
          }`
        : `P. unitario: ${formatCurrency(layout.item.precioUnitario)}`;
    ctx.fillText(subDetail, padX, nextY);
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
  y += 22;

  if (summary.devolucionesMonto > 0 || summary.descuentoMonto > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6E6259';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillText('Subtotal:', padX, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1F1A17';
    ctx.font = '600 13px monospace';
    ctx.fillText(formatCurrency(summary.subtotalBruto), width - padX, y);
    y += 20;

    if (summary.devolucionesMonto > 0) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#B91C1C';
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillText(`Devoluciones (${summary.piezasDevolucion} pzas):`, padX, y);
      ctx.textAlign = 'right';
      ctx.font = '600 13px monospace';
      ctx.fillText(`-${formatCurrency(summary.devolucionesMonto)}`, width - padX, y);
      y += 20;
    }

    if (summary.descuentoMonto > 0) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#047857';
      ctx.font = '500 13px system-ui, sans-serif';
      const descLabel =
        summary.descuentoTipo === 'porcentaje' && summary.descuentoValor > 0
          ? `Descuento (${summary.descuentoValor}%)${
              summary.descuentoMotivo ? ` · ${summary.descuentoMotivo}` : ''
            }:`
          : `Descuento${summary.descuentoMotivo ? ` (${summary.descuentoMotivo})` : ''}:`;
      ctx.fillText(descLabel.slice(0, 42), padX, y);
      ctx.textAlign = 'right';
      ctx.font = '600 13px monospace';
      ctx.fillText(`-${formatCurrency(summary.descuentoMonto)}`, width - padX, y);
      y += 20;
    }
    y += 6;
  }

  // Total & pieces
  ctx.textAlign = 'left';
  ctx.fillStyle = '#49403A';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(`Total piezas: ${ticket.totalPiezas}`, padX, y);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#4A2511';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(formatCurrency(ticket.totalImporte), width - padX, y + 2);
  y += 22;

  if (summary.piezasCortesia > 0 || summary.piezasCambio > 0) {
    const parts: string[] = [];
    if (summary.piezasCortesia > 0) parts.push(`${summary.piezasCortesia} cortesía`);
    if (summary.piezasCambio > 0) parts.push(`${summary.piezasCambio} cambio`);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6E6259';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(`Incluye: ${parts.join(' · ')}`, padX, y);
    y += 18;
  } else {
    y += 6;
  }

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
