import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __pwaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export type BrowserKind =
  | 'safari'
  | 'chrome'
  | 'edge'
  | 'samsung'
  | 'firefox'
  | 'opera'
  | 'brave'
  | 'other';

export type PlatformTab = 'android' | 'ios' | 'desktop';

function detectBrowserAndPlatform(): {
  isIOS: boolean;
  isAndroid: boolean;
  isInAppBrowser: boolean;
  browserKind: BrowserKind;
  defaultPlatformTab: PlatformTab;
} {
  if (typeof window === 'undefined') {
    return {
      isIOS: false,
      isAndroid: false,
      isInAppBrowser: false,
      browserKind: 'other',
      defaultPlatformTab: 'desktop',
    };
  }

  const ua = window.navigator.userAgent || '';
  const uaLower = ua.toLowerCase();
  const isIPadOS =
    window.navigator.platform === 'MacIntel' && (window.navigator.maxTouchPoints || 0) > 1;
  const isIOS = /iphone|ipad|ipod/.test(uaLower) || isIPadOS;
  const isAndroid = /android/.test(uaLower);
  const isInAppBrowser =
    /fban|fbav|instagram|whatsapp|line|micromessenger|snapchat|tiktok|; wv\)/i.test(ua);

  let browserKind: BrowserKind = 'other';
  if ((window.navigator as unknown as { brave?: unknown }).brave) {
    browserKind = 'brave';
  } else if (/samsungbrowser/i.test(ua)) {
    browserKind = 'samsung';
  } else if (/edg|edga|edgios/i.test(ua)) {
    browserKind = 'edge';
  } else if (/opr|opera|opt/i.test(ua)) {
    browserKind = 'opera';
  } else if (/firefox|fxios/i.test(ua)) {
    browserKind = 'firefox';
  } else if (/chrome|crios/i.test(ua)) {
    browserKind = 'chrome';
  } else if (/safari/i.test(ua)) {
    browserKind = 'safari';
  }

  const defaultPlatformTab: PlatformTab = isIOS
    ? 'ios'
    : isAndroid
    ? 'android'
    : 'desktop';

  return {
    isIOS,
    isAndroid,
    isInAppBrowser,
    browserKind,
    defaultPlatformTab,
  };
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__pwaInstallPrompt ?? null : null
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [envInfo, setEnvInfo] = useState(() => detectBrowserAndPlatform());

  useEffect(() => {
    setEnvInfo(detectBrowserAndPlatform());

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const checkStandalone = () => {
      const standalone =
        mediaQuery.matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };
    checkStandalone();

    if (window.__pwaInstallPrompt && !deferredPrompt) {
      setDeferredPrompt(window.__pwaInstallPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__pwaInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      window.__pwaInstallPrompt = null;
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener?.('change', checkStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener?.('change', checkStandalone);
    };
  }, [deferredPrompt]);

  const install = async () => {
    const promptToUse = deferredPrompt || window.__pwaInstallPrompt;
    if (!promptToUse) return false;
    try {
      await promptToUse.prompt();
      const { outcome } = await promptToUse.userChoice;
      window.__pwaInstallPrompt = null;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setIsInstalled(true);
        return true;
      }
      return false;
    } catch {
      window.__pwaInstallPrompt = null;
      setDeferredPrompt(null);
      return false;
    }
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS: envInfo.isIOS,
    isAndroid: envInfo.isAndroid,
    isInAppBrowser: envInfo.isInAppBrowser,
    browserKind: envInfo.browserKind,
    defaultPlatformTab: envInfo.defaultPlatformTab,
    install,
  };
}
