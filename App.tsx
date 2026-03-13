import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, User, Dispatch, Log, Comunicado, LogStatus, SystemSettings, CalendarEvent } from './types.ts';
import { INITIAL_DISPATCHES } from './constants.tsx';
import LoginPage from './components/LoginPage.tsx';
import Header from './components/Header.tsx';
import Dashboard from './components/Dashboard.tsx';
import LogsPage from './components/LogsPage.tsx';
import HelpPage from './components/HelpPage.tsx';
import DispatchesPage from './components/DispatchesPage.tsx';
import ComunicadosPage from './components/ComunicadosPage.tsx';
import SettingsPage from './components/SettingsPage.tsx';
import CalendarPage from './components/CalendarPage.tsx';
import UserManagementPage from './components/UserManagementPage.tsx';
import MembersPage from './components/MembersPage.tsx';
import InscricoesPrioritariasPage from './components/InscricoesPrioritariasPage.tsx';
import CirculosDistribuidosPage from './components/CirculosDistribuidosPage.tsx';
import EncontreiroPage from './components/EncontreiroPage.tsx';
import PresencePage from './components/PresencePage.tsx';
import PublicInterestForm from './components/PublicInterestForm.tsx';
import Toast from './components/Toast.tsx';
import AppDialog from './components/AppDialog.tsx';
import { AppDialogRequest, installWindowAlertBridge, registerAppDialogHandler } from './utils/appDialog.ts';

const viewPathMap: Partial<Record<View, string>> = {
  members: '/cadastro',
  presence: '/cadastro/presenca',
  inscricoes_prioritarias: '/prioritarios',
  inscricoes_prioritarias_circulos: '/distribuicao-circulos',
  encontreiros: '/encontreiros',
};

const pathViewMap: Record<string, View> = {
  '/cadastro': 'members',
  '/cadastro/presenca': 'presence',
  '/prioritarios': 'inscricoes_prioritarias',
  '/distribuicao-circulos': 'inscricoes_prioritarias_circulos',
  '/encontreiros': 'encontreiros',
};

const App: React.FC = () => {
  type PendingDialog = AppDialogRequest & { resolve: (value: boolean | void) => void };

  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [dispatches] = useState<Dispatch[]>(INITIAL_DISPATCHES);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [membersCount, setMembersCount] = useState<number>(0);
  const [nonEnrolledCount, setNonEnrolledCount] = useState<number>(0);
  const [nonEnrolledIndicators, setNonEnrolledIndicators] = useState({
    preConfirmadasCount: 0,
    interesseCount: 0,
    interesseNoCount: 0,
  });
  const [lastSync, setLastSync] = useState<string>('');
  
  const syncInProgress = useRef(false);

  const envWebAppUrl = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GOOGLE_WEBAPP_URL) || (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_WEBAPP_URL) || '';

  const [settings, setSettings] = useState<SystemSettings>(() => {
    const saved = localStorage.getItem('eac_settings');
    const parsed = saved ? JSON.parse(saved) : null;
    return parsed || {
      googleWebAppUrl: envWebAppUrl,
      botUrl: 'https://seu-bot.render.com',
      chaveMestra: 'EAC-Admin-Secure-778899'
    };
  });

  const effectiveGoogleWebAppUrl = envWebAppUrl || settings?.googleWebAppUrl || '';

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dialogQueue, setDialogQueue] = useState<PendingDialog[]>([]);
  const [activeDialog, setActiveDialog] = useState<PendingDialog | null>(null);

  const [queryParams, setQueryParams] = useState({ mode: '', email: '', name: '' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    setQueryParams({
      mode: params.get('mode') || '',
      email: params.get('email') || '',
      name: params.get('name') || '',
    });

    const pathView = pathViewMap[pathname];
    if (pathView) {
      setCurrentView(pathView);
      return;
    }

    // Se houver view na URL, aplica como view inicial (ex: ?view=members)
    const urlView = params.get('view') as View | null;
    const allowedViews: View[] = ['dashboard','members','inscricoes_prioritarias','inscricoes_prioritarias_circulos','encontreiros','presence','dispatches','calendar','comunicados','logs','users','settings','help'];
    if (urlView && allowedViews.includes(urlView)) {
      setCurrentView(urlView);
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const enqueueDialog = useCallback((request: AppDialogRequest) => {
    return new Promise<boolean | void>((resolve) => {
      setDialogQueue((prev) => [...prev, { ...request, resolve }]);
    });
  }, []);

  useEffect(() => {
    registerAppDialogHandler(enqueueDialog);
    return () => registerAppDialogHandler(null);
  }, [enqueueDialog]);

  useEffect(() => {
    if (activeDialog || dialogQueue.length === 0) return;
    const [next, ...rest] = dialogQueue;
    setActiveDialog(next);
    setDialogQueue(rest);
  }, [dialogQueue, activeDialog]);

  const handleResolveDialog = useCallback((confirmed: boolean) => {
    setActiveDialog((current) => {
      if (!current) return null;
      if (current.kind === 'confirm') current.resolve(confirmed);
      else current.resolve();
      return null;
    });
  }, []);

  useEffect(() => {
    return installWindowAlertBridge();
  }, []);

  const callApiProxy = useCallback(async (action: string, payload: any) => {
    const localUrl = effectiveGoogleWebAppUrl;
    try {
      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data: payload, googleWebAppUrl: localUrl })
      });
      const raw = await response.text();
      if (!raw) {
        return { success: false, error: `Resposta vazia da API (HTTP ${response.status}).` };
      }
      try {
        const parsed = JSON.parse(raw);
        if (!response.ok) return { success: false, ...parsed };
        return {
          ...parsed,
          success: Boolean(parsed?.success ?? parsed?.ok ?? false),
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Resposta inválida da API (/api/comunicados): ${err?.message || 'JSON malformado.'}`,
          sample: raw.slice(0, 300)
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [effectiveGoogleWebAppUrl]);

  const handleNavigate = useCallback((view: View) => {
    setCurrentView(view);
    if (typeof window === 'undefined') return;

    const path = viewPathMap[view];
    const url = new URL(window.location.href);
    if (path) {
      url.pathname = path;
      url.searchParams.delete('view');
    } else {
      url.pathname = '/';
      if (view === 'dashboard') url.searchParams.delete('view');
      else url.searchParams.set('view', view);
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const fetchSpreadsheetData = useCallback(async () => {
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    setIsLoadingSheet(true);
    try {
      const [comRes, calRes, logRes, memRes, nonRes] = await Promise.all([
        callApiProxy('GET_COMUNICADOS', {}),
        callApiProxy('GET_EVENTS', {}),
        callApiProxy('GET_LOGS', {}),
        callApiProxy('GET_MEMBERS', {}),
        callApiProxy('GET_NON_ENROLLED', {})
      ]);
      
      if (comRes.success) setComunicados(comRes.comunicados || []);
      if (calRes.success) setCalendarEvents(calRes.events || []);
      if (logRes.success) setLogs(logRes.logs || []);
      if (memRes.success) setMembersCount(memRes.members?.length || 0);
      if (nonRes.success) {
        const list = Array.isArray(nonRes.nonEnrolled) ? nonRes.nonEnrolled : [];
        setNonEnrolledCount(list.length);

        const toClean = (v: any) => String(v ?? '').trim().toLowerCase();
        const readField = (row: any, aliases: string[]) => {
          if (!row || typeof row !== 'object') return '';
          for (const key of aliases) {
            const value = row[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
          }
          return '';
        };
        const isYes = (v: any) => ['sim', 's', 'yes', 'y', '1', 'true', 'verdadeiro', 'x'].includes(toClean(v));
        const isNo = (v: any) => ['não', 'nao', 'n', 'no', '0', 'false', 'falso'].includes(toClean(v));
        const isSimStrict = (v: any) => toClean(v) === 'sim';

        const computedInteresseCount = list.filter((ne: any) =>
          isYes(readField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']))
        ).length;

        const computedInteresseNoCount = list.filter((ne: any) =>
          isNo(readField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']))
        ).length;

        const computedPreConfirmadasCount = list.filter((ne: any) => {
          const interesse = readField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']);
          const preConfirmacao = readField(ne, ['statusPreConfirmacao', 'preConfirmacaoStatus', 'preConfirmacao', 'Status Pre Confirmacao', 'P']);
          return isSimStrict(interesse) && String(preConfirmacao ?? '').trim() !== '';
        }).length;

        const interestStats = nonRes?.interestStats;
        const hasInterestStats =
          interestStats &&
          typeof interestStats === 'object' &&
          (Number(interestStats.sim) + Number(interestStats.nao) + Number(interestStats.vazio) > 0);
        const preConfirmadasFromApi =
          typeof nonRes?.preConfirmadasCount === 'number'
            ? Number(nonRes.preConfirmadasCount) || 0
            : null;

        setNonEnrolledIndicators({
          interesseCount: hasInterestStats ? Number(interestStats.sim) || 0 : computedInteresseCount,
          interesseNoCount: hasInterestStats ? Number(interestStats.nao) || 0 : computedInteresseNoCount,
          // Regra fixa do indicador:
          // I = SIM e P preenchida (mesma regra do COUNTIFS da planilha).
          preConfirmadasCount: preConfirmadasFromApi !== null ? preConfirmadasFromApi : computedPreConfirmadasCount,
        });
      }
      
      setLastSync(new Date().toLocaleTimeString('pt-BR'));
    } catch (e: any) { 
      showToast('Sincroniza��o offline.', 'error');
    } finally {
      setIsLoadingSheet(false);
      syncInProgress.current = false;
    }
  }, [callApiProxy]);

  useEffect(() => {
    const savedUser = localStorage.getItem('eac_user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  useEffect(() => {
    if (user && effectiveGoogleWebAppUrl) fetchSpreadsheetData();
  }, [user, effectiveGoogleWebAppUrl, fetchSpreadsheetData]);

  // Sempre que o usuário navegar para uma tela operacional, força nova sincronização
  useEffect(() => {
    if (!user) return;
    if (!effectiveGoogleWebAppUrl) return;
    const viewsThatNeedSync: View[] = ['dashboard', 'members', 'inscricoes_prioritarias', 'inscricoes_prioritarias_circulos', 'encontreiros', 'presence', 'dispatches', 'calendar', 'comunicados', 'logs'];
    if (viewsThatNeedSync.includes(currentView)) {
      fetchSpreadsheetData();
    }
  }, [currentView, user, effectiveGoogleWebAppUrl, fetchSpreadsheetData]);

  useEffect(() => {
    if (!user || user.role === 'ADMIN') return;
    const allowed = user.permissions?.allowedModules || [];
    const isPrioritariasView = currentView === 'inscricoes_prioritarias';
    if (isPrioritariasView && !allowed.includes('inscricoes_prioritarias')) {
      setCurrentView('dashboard');
      showToast('Seu usuário não possui acesso ao módulo Inscrições Prioritárias.', 'error');
      return;
    }
    if (currentView === 'inscricoes_prioritarias_circulos' && !allowed.includes('inscricoes_prioritarias_circulos')) {
      setCurrentView('dashboard');
      showToast('Seu usuário não possui acesso à subtela de Distribuição de Círculos.', 'error');
      return;
    }
    if (currentView === 'members' && !allowed.includes('members')) {
      setCurrentView('dashboard');
      showToast('Seu usuário não possui acesso ao módulo Cadastro.', 'error');
      return;
    }
    if (currentView === 'presence' && !allowed.includes('presence')) {
      setCurrentView('dashboard');
      showToast('Seu usuário não possui acesso ao módulo Controle de Presença.', 'error');
      return;
    }
    if (currentView === 'encontreiros' && !allowed.includes('encontreiros')) {
      setCurrentView('dashboard');
      showToast('Seu usuário não possui acesso ao módulo Cadastro de Encontreiro.', 'error');
    }
  }, [currentView, user]);

  const handleExecuteDispatch = async (d: Dispatch) => {
    setIsLoadingSheet(true);
    let action = '';
    if (d.type === 'comunicado_99_cadastro') action = 'EXECUTE_COMUNICADO_99';
    else if (d.type === 'aniversariantes_dia') action = 'EXECUTE_ANIVERSARIANTES';
    else if (d.type === 'eventos') action = 'EXECUTE_EVENTOS';
    else if (d.type === 'waitlist_non_enrolled') action = 'EXECUTE_WAITLIST_NON_ENROLLED';
    else if (d.type === 'confirmacao_interesse_espera') action = 'EXECUTE_INTEREST_CONFIRMATION';
    else if (d.type === 'confirm_nao_inscritos') action = 'EXECUTE_CONFIRM_NAO_INSCRITOS';

    if (action) {
      const r = await callApiProxy(action, {});
      if (r.success) { showToast(r.message, 'success'); fetchSpreadsheetData(); }
      else showToast(r.error, 'error');
    }
    setIsLoadingSheet(false);
  };

  const dialogNode = <AppDialog request={activeDialog} onResolve={handleResolveDialog} />;

  if (queryParams.mode === 'interest_form' && queryParams.email) {
    const effectiveUrl = effectiveGoogleWebAppUrl;

    const handleSuccess = () => {
      setTimeout(() => {
        window.location.href = 'https://www.instagram.com/eacporciunculadesantana/';
      }, 3000);
    };

    return (
      <div className="min-h-screen bg-slate-50">
        <PublicInterestForm
          email={queryParams.email}
          nome={queryParams.name}
          googleWebAppUrl={effectiveUrl}
          onSuccess={handleSuccess}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {dialogNode}
      </div>
    );
  }

  if (!user) return (
    <>
      <LoginPage onLogin={(u) => { setUser(u); localStorage.setItem('eac_user', JSON.stringify(u)); handleNavigate(pathViewMap[window.location.pathname.replace(/\/+$/, '') || '/'] || 'dashboard'); }} googleWebAppUrl={effectiveGoogleWebAppUrl} />
      {dialogNode}
    </>
  );


  return (
    <div className="min-h-screen flex flex-col text-slate-900 overflow-x-hidden">
      <Header user={user} onLogout={() => { setUser(null); localStorage.removeItem('eac_user'); }} onNavigate={handleNavigate} currentView={currentView} />
      <main className="flex-grow pt-16 bg-slate-50 relative">
        {currentView === 'dashboard' && <Dashboard user={user} logs={logs} calendarEvents={calendarEvents} comunicados={comunicados} membersCount={membersCount} nonEnrolledCount={nonEnrolledCount} nonEnrolledPreConfirmadasCount={nonEnrolledIndicators.preConfirmadasCount} nonEnrolledInteresseCount={nonEnrolledIndicators.interesseCount} nonEnrolledInteresseNoCount={nonEnrolledIndicators.interesseNoCount} onNavigate={handleNavigate} lastSync={lastSync} onRefresh={fetchSpreadsheetData} isLoading={isLoadingSheet} />}
        {currentView === 'members' && (
          <MembersPage
            user={user}
            googleWebAppUrl={effectiveGoogleWebAppUrl}
            onOpenPresence={() => handleNavigate('presence')}
          />
        )}
        {currentView === 'inscricoes_prioritarias' && (
          <InscricoesPrioritariasPage
            googleWebAppUrl={effectiveGoogleWebAppUrl}
            onOpenCirculos={() => handleNavigate('inscricoes_prioritarias_circulos')}
          />
        )}
        {currentView === 'inscricoes_prioritarias_circulos' && (
          <CirculosDistribuidosPage
            googleWebAppUrl={effectiveGoogleWebAppUrl}
            onBack={() => handleNavigate('inscricoes_prioritarias')}
          />
        )}
        {currentView === 'encontreiros' && <EncontreiroPage user={user} googleWebAppUrl={effectiveGoogleWebAppUrl} />}
        {currentView === 'presence' && <PresencePage user={user} googleWebAppUrl={effectiveGoogleWebAppUrl} />}
        {currentView === 'dispatches' && <DispatchesPage dispatches={dispatches} onExecute={handleExecuteDispatch} onClearStatus={async (d) => { await callApiProxy('CLEAR_DISPATCH_STATUS', { type: d.type }); fetchSpreadsheetData(); }} operator={user.name} />}
        {currentView === 'calendar' && <CalendarPage googleWebAppUrl={effectiveGoogleWebAppUrl} user={user} />}
        {currentView === 'comunicados' && <ComunicadosPage comunicados={comunicados} onSave={async (c) => { await callApiProxy('SAVE_COMUNICADO', c); fetchSpreadsheetData(); }} onDelete={async (id) => { await callApiProxy('DELETE_COMUNICADO', { id }); fetchSpreadsheetData(); }} onSync={fetchSpreadsheetData} isLoading={isLoadingSheet} user={user} />}
        {currentView === 'logs' && <LogsPage logs={logs} />}
        {currentView === 'users' && <UserManagementPage currentUser={user} googleWebAppUrl={effectiveGoogleWebAppUrl} />}
        {currentView === 'help' && <HelpPage />}
        {currentView === 'settings' && <SettingsPage settings={settings} onSave={(s) => { setSettings(s); localStorage.setItem('eac_settings', JSON.stringify(s)); showToast('Ajustes salvos.', 'success'); }} />}
      </main>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {dialogNode}
    </div>
  );
};

export default App;
