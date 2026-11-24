import React from 'react';
import { AlertCircle, Check, X } from 'lucide-react';

export interface PendingMutation {
  title: string;
  description: string;
  sheetTab: string;
  details: { label: string; value: string }[];
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
}

interface ConfirmMutationModalProps {
  mutation: PendingMutation | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmMutationModal: React.FC<ConfirmMutationModalProps> = ({
  mutation,
  isSubmitting,
  onCancel,
  onConfirm,
}) => {
  if (!mutation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white border border-[#E7E3DC] shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-[#EFECE6]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF6EC] text-[#B45309]">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1F1A17]">{mutation.title}</h3>
              <p className="text-xs text-[#6E6259] mt-0.5">
                Hoja destino: <span className="font-semibold text-[#4A2511]">{mutation.sheetTab}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            aria-label="Cancelar"
            className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 flex items-center justify-center rounded-xl text-[#6E6259] hover:bg-[#F5F2EC]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-[#49403A]">{mutation.description}</p>

          {mutation.details.length > 0 && (
            <div className="rounded-xl bg-[#FAF8F5] border border-[#EFECE6] divide-y divide-[#EFECE6]">
              {mutation.details.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <span className="text-[#6E6259] shrink-0">{item.label}</span>
                  <span className="font-semibold text-[#1F1A17] text-right tabular-nums truncate">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#FAF8F5] border-t border-[#EFECE6]">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D8D1C7] bg-white text-sm font-semibold text-[#49403A] hover:bg-[#F5F2EC] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className={`min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-colors ${
              mutation.title.toLowerCase().includes('eliminar')
                ? 'bg-[#B91C1C] hover:bg-[#991B1B]'
                : 'bg-[var(--theme-primary)] hover:bg-[var(--theme-primary-hover)]'
            }`}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>{isSubmitting ? 'Guardando...' : mutation.confirmLabel || 'Confirmar y guardar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
