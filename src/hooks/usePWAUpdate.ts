import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildId?: string };
    return typeof data?.buildId === 'string' ? data.buildId : null;
  } catch {
    return null;
  }
}

async function clearServiceWorkerAssetCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  } catch {
    // Ignore cache cleanup errors
  }
}

export function usePWAUpdate() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const attachedRegsRef = useRef<WeakSet<ServiceWorkerRegistration>>(new WeakSet());
  const isReloadingRef = useRef(false);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [updateNotice, setUpdateNotice] = useState('');
  const [dismissedRefresh, setDismissedRefresh] = useState(false);
  const [serverUpdateAvailable, setServerUpdateAvailable] = useState(false);

  const {
    needRefresh: [swNeedRefresh, setSwNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      setDismissedRefresh(false);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;

      if (registration.waiting) {
        setSwNeedRefresh(true);
        setDismissedRefresh(false);
      }

      if (!attachedRegsRef.current.has(registration)) {
        attachedRegsRef.current.add(registration);
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              setSwNeedRefresh(true);
              setDismissedRefresh(false);
            }
          });
        });
      }

      // Immediately check for updates on app launch (crucial for installed mobile PWAs)
      if (typeof navigator === 'undefined' || navigator.onLine) {
        registration.update().catch(() => {});
        void checkRemoteVersion();
      }
    },
    onRegisterError(error) {
      console.warn('Error al registrar Service Worker:', error);
    },
  });

  const checkRemoteVersion = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    const remoteId = await fetchRemoteBuildId();
    const localId = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : '';
    if (remoteId && localId && remoteId !== localId) {
      setServerUpdateAvailable(true);
      setDismissedRefresh(false);
      return true;
    }
    return false;
  }, []);

  // Listen for SW controller change to reload reliably once
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handleControllerChange = () => {
      if (isReloadingRef.current) return;
      isReloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  // Automatically check on launch, visibility/focus/pageshow (iOS Safari PWA), online, and periodically
  useEffect(() => {
    const triggerBackgroundCheck = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const reg = registrationRef.current;
      if (reg) {
        reg.update().catch(() => {});
        if (reg.waiting) {
          setSwNeedRefresh(true);
        }
      }
      void checkRemoteVersion();
    };

    const initialTimer = window.setTimeout(triggerBackgroundCheck, 1500);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerBackgroundCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', triggerBackgroundCheck);
    window.addEventListener('pageshow', triggerBackgroundCheck);
    window.addEventListener('online', triggerBackgroundCheck);
    const interval = window.setInterval(triggerBackgroundCheck, 5 * 60 * 1000);

    return () => {
      window.clearTimeout(initialTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', triggerBackgroundCheck);
      window.removeEventListener('pageshow', triggerBackgroundCheck);
      window.removeEventListener('online', triggerBackgroundCheck);
      window.clearInterval(interval);
    };
  }, [checkRemoteVersion, setSwNeedRefresh]);

  const checkForUpdates = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUpdateNotice('Necesitas conexión a internet para buscar actualizaciones.');
      return;
    }

    setDismissedRefresh(false);
    setUpdateNotice('');
    setIsCheckingUpdate(true);

    try {
      let reg = registrationRef.current;
      if (!reg && 'serviceWorker' in navigator) {
        reg = (await navigator.serviceWorker.getRegistration()) || null;
        registrationRef.current = reg;
      }

      const [hasNewVersion] = await Promise.all([
        checkRemoteVersion(),
        reg ? reg.update().catch(() => {}) : Promise.resolve(),
      ]);

      // Wait briefly if a new worker started installing
      if (reg?.installing) {
        await new Promise<void>((resolve) => {
          const worker = reg!.installing!;
          const timeout = window.setTimeout(resolve, 4500);
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' || worker.state === 'redundant') {
              window.clearTimeout(timeout);
              resolve();
            }
          });
        });
      }

      if (reg?.waiting) {
        setSwNeedRefresh(true);
        setDismissedRefresh(false);
        return;
      }

      if (hasNewVersion) {
        setServerUpdateAvailable(true);
        setDismissedRefresh(false);
        return;
      }

      setUpdateNotice('Ya tienes la versión más reciente instalada.');
    } catch {
      setUpdateNotice('No se pudo verificar actualizaciones en este momento.');
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [checkRemoteVersion, setSwNeedRefresh]);

  const applyUpdate = useCallback(async () => {
    setIsApplyingUpdate(true);
    try {
      const reg =
        registrationRef.current ||
        ('serviceWorker' in navigator
          ? (await navigator.serviceWorker.getRegistration()) || null
          : null);

      if (reg?.waiting) {
        await updateServiceWorker(true);
      }

      // Clear Workbox/runtime caches (never touches localStorage offline queue/data)
      await clearServiceWorkerAssetCaches();
      if (reg) {
        await reg.update().catch(() => {});
      }
    } catch {
      // Proceed to reload anyway
    } finally {
      window.setTimeout(() => {
        if (!isReloadingRef.current) {
          isReloadingRef.current = true;
          window.location.reload();
        }
      }, 450);
    }
  }, [updateServiceWorker]);

  const forceHardRefresh = useCallback(async () => {
    setIsApplyingUpdate(true);
    setUpdateNotice('');
    try {
      await clearServiceWorkerAssetCaches();
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update().catch(() => {});
          if (reg.waiting) {
            await updateServiceWorker(true).catch(() => {});
          }
        }
      }
    } finally {
      isReloadingRef.current = true;
      window.location.reload();
    }
  }, [updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    setDismissedRefresh(true);
  }, []);

  const needRefresh = swNeedRefresh || serverUpdateAvailable;

  return {
    needRefresh,
    showUpdatePrompt: needRefresh && !dismissedRefresh,
    isCheckingUpdate,
    isApplyingUpdate,
    updateNotice,
    clearUpdateNotice: () => setUpdateNotice(''),
    checkForUpdates,
    applyUpdate,
    forceHardRefresh,
    dismissUpdate,
  };
}
