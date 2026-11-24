import React from 'react';
import { CloudUpload, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  manualOfflineMode?: boolean;
  pendingCount?: number;
  isSyncingQueue?: boolean;
  onSyncPending?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  manualOfflineMode = false,
  pendingCount = 0,
  isSyncingQueue = false,
  onSyncPending,
}) => {
  const isOnline = useOnlineStatus();
  const effectiveOffline = !isOnline || manualOfflineMode;

  if (effectiveOffline || pendingCount === 0) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 right-4 sm:right-auto z-40 flex items-center gap-2.5 rounded-xl bg-[var(--theme-primary)] px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg">
      <CloudUpload className="w-4 h-4 shrink-0" />
      <span>{pendingCount} cambio(s) offline listos para subir</span>
      {onSyncPending && (
        <button
          type="button"
          disabled={isSyncingQueue}
          onClick={onSyncPending}
          className="ml-auto sm:ml-1 inline-flex items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold hover:bg-white/30 disabled:opacity-60"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncingQueue ? 'animate-spin' : ''}`} />
          <span>{isSyncingQueue ? 'Subiendo...' : 'Sincronizar'}</span>
        </button>
      )}
    </div>
  );
};
