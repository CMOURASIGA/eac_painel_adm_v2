import React, { useEffect, useMemo, useState } from 'react';

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

declare global {
  interface Window {
    __eacPwaInstallPrompt?: DeferredInstallPrompt | null;
  }
}

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as any).standalone);
};

const InstallEacAppPrompt: React.FC = () => {
  const [installed, setInstalled] = useState(isStandaloneMode);
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(() => (
    typeof window !== 'undefined' ? window.__eacPwaInstallPrompt || null : null
  ));
  const [showInstructions, setShowInstructions] = useState(false);

  const platform = useMemo(() => {
    if (typeof navigator === 'undefined') return 'other';
    const ua = navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'other';
  }, []);

  const mobileLike = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return platform !== 'other' || (
      window.matchMedia('(pointer: coarse)').matches &&
      Math.min(window.screen.width || window.innerWidth, window.innerWidth) <= 1280
    );
  }, [platform]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/eac-sw.js').catch((error) => {
        console.error('[EAC PWA] falha ao registrar service worker', error);
      });
    }

    const ready = () => setDeferredPrompt(window.__eacPwaInstallPrompt || null);
    const beforeInstall = (event: Event) => {
      const promptEvent = event as DeferredInstallPrompt;
      promptEvent.preventDefault();
      window.__eacPwaInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };
    const appInstalled = () => {
      window.__eacPwaInstallPrompt = null;
      setDeferredPrompt(null);
      setInstalled(true);
      setDismissed(false);
    };
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const displayChanged = () => setInstalled(isStandaloneMode());

    window.addEventListener('eac:pwa-install-ready', ready);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    displayMode.addEventListener?.('change', displayChanged);

    return () => {
      window.removeEventListener('eac:pwa-install-ready', ready);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
      displayMode.removeEventListener?.('change', displayChanged);
    };
  }, []);

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      } else {
        setDismissed(true);
      }
      window.__eacPwaInstallPrompt = null;
      setDeferredPrompt(null);
      return;
    }
    setShowInstructions(true);
  };

  if (!mobileLike || installed || dismissed) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl sm:bottom-5">
      <div className="flex gap-3">
        <img src="https://i.imgur.com/c5XQ7TW.png" alt="EAC" className="h-14 w-14 shrink-0 rounded-xl border border-amber-100 bg-amber-50 p-1" />
        <div className="min-w-0 flex-1">
          <p className="font-black text-slate-900">Quer instalar o EAC no telefone?</p>
          <p className="mt-1 text-sm text-slate-600">Assim este acesso fica como um app na sua tela inicial e você não precisa procurar o link novamente.</p>
        </div>
      </div>

      {showInstructions && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          {platform === 'ios'
            ? <>No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</>
            : <>Abra o menu do navegador e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</>}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setDismissed(true)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-700">
          Agora não
        </button>
        <button type="button" onClick={() => void install()} className="rounded-xl bg-[#044372] px-3 py-3 text-sm font-black text-white">
          {deferredPrompt ? 'Instalar app' : 'Como instalar'}
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">Este aviso deixa de aparecer quando o acesso estiver instalado como app.</p>
    </div>
  );
};

export default InstallEacAppPrompt;
