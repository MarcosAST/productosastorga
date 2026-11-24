import React from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

interface PWAUpdateBannerProps {
  visible: boolean;
  isApplying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}

export const PWAUpdateBanner: React.FC<PWAUpdateBannerProps> = ({
  visible,
  isApplying,
  onApply,
  onDismiss,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed bottom-[76px] lg:bottom-5 right-3 left-3 sm:left-auto sm:max-w-sm z-[60] rounded-2xl bg-[var(--theme-primary)] text-white p-4 shadow-2xl border border-white/20">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">Nueva actualización lista</p>
          <p className="text-xs text-white/85 mt-1 leading-relaxed">
            Hay mejoras nuevas disponibles. Actualiza ahora sin tener que reinstalar la app.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={isApplying}
              onClick={onApply}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-[#1F1A17] hover:bg-white/90 disabled:opacity-70"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isApplying ? 'animate-spin' : ''}`} />
              <span>{isApplying ? 'Actualizando...' : 'Actualizar ahora'}</span>
            </button>
            <button
              type="button"
              disabled={isApplying}
              onClick={onDismiss}
              className="min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/15"
            >
              Después
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso de actualización"
          className="p-1 rounded-lg text-white/75 hover:bg-white/15"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
