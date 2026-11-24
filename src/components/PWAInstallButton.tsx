import React, { useState } from 'react';
import {
  Download,
  ExternalLink,
  Share,
  PlusSquare,
  X,
  MoreVertical,
  Copy,
  Check,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, browserKind, install } = usePWAInstall();
  const [showFallback, setShowFallback] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return null;
  }

  const isInIframe =
    typeof window !== 'undefined' && window.self !== window.top;

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowFallback(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[44px] ${
          isInstallable
            ? 'bg-[var(--theme-primary)] text-white hover:bg-[var(--theme-primary-hover)]'
            : 'border border-[var(--theme-primary)]/30 bg-[var(--theme-tint)] text-[var(--theme-primary)] hover:opacity-90'
        } ${compact ? 'px-3.5 py-2 text-xs sm:text-sm' : 'px-4 py-2.5 text-sm w-full'}`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Instalar App</span>
      </button>

      {showFallback && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 border border-[#E7E3DC] shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-[#1F1A17]">
                Instalar Productos Astorga
              </h3>
              <button
                type="button"
                onClick={() => setShowFallback(false)}
                aria-label="Cerrar"
                className="min-h-[36px] min-w-[36px] -mt-1 -mr-1 flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isInIframe ? (
              <div className="space-y-3 text-xs text-[#49403A] leading-relaxed">
                <p>
                  El navegador no permite instalar aplicaciones dentro de la ventana de vista previa. Ábrela en una pestaña propia en <strong>Chrome</strong> o <strong>Edge</strong> para activar la instalación directa:
                </p>
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowFallback(false)}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--theme-primary-hover)]"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir en pestaña para instalar</span>
                </a>
              </div>
            ) : isIOS ? (
              <div className="space-y-2.5 text-xs text-[#49403A] leading-relaxed">
                <p className="flex items-center gap-2">
                  <Share className="w-4 h-4 shrink-0 text-[var(--theme-primary)]" />
                  <span>
                    En iPhone/iPad, toca <strong>Compartir</strong> y luego{' '}
                    <strong>Agregar a inicio</strong> <PlusSquare className="w-3.5 h-3.5 inline" />.
                  </span>
                </p>
              </div>
            ) : browserKind === 'firefox' ? (
              <div className="space-y-2.5 text-xs text-[#49403A] leading-relaxed">
                <p>
                  <strong>Firefox</strong> no permite instalar aplicaciones web directamente en computadora (y en Android usa el menú <strong>⋮ → Instalar</strong>). Para instalación directa en 1 toque, abre el enlace en <strong>Chrome</strong> o <strong>Edge</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs text-[#49403A] leading-relaxed">
                <p className="flex items-start gap-2">
                  <MoreVertical className="w-4 h-4 shrink-0 mt-0.5 text-[var(--theme-primary)]" />
                  <span>
                    Tu navegador aún no activó el botón automático (puede pasar si ya se instaló antes o estás en modo incógnito). Usa el menú <strong>⋮</strong> → <strong>Instalar aplicación</strong> en Chrome o Edge.
                  </span>
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-[#FAF8F5] py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[var(--theme-tint)]"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Enlace copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar enlace</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
