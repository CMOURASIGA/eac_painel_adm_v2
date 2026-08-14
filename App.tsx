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
import InscricoesReviewPage from './components/InscricoesReviewPage.tsx';
import CirculosDistribuidosPage from './components/CirculosDistribuidosPage.tsx';
import EncontreiroPage from './components/EncontreiroPage.tsx';
import PresencePage from './components/PresencePage.tsx';
import VisitacaoPage from './components/VisitacaoPage.tsx';
import PublicInterestForm from './components/PublicInterestForm.tsx';
import PublicInscricaoForm from './components/PublicInscricaoForm.tsx';
import PublicEncontreiroForm from './components/PublicEncontreiroForm.tsx';
import PublicPresenceForm from './components/PublicPresenceForm.tsx';
import VisitacaoForm from './components/VisitacaoForm.tsx';
import Toast from './components/Toast.tsx';
import AppDialog from './components/AppDialog.tsx';
import { AppDialogRequest, installWindowAlertBridge, registerAppDialogHandler } from './utils/appDialog.ts';
import { sanitizeTextDeep } from './utils/textEncoding.ts';
import { getJson, postComunicadosAction } from './services/eacApiClient.ts';
import { NAVIGATION_ROADMAP, isViewEnabledInRoadmap } from './utils/navigationRoadmap.ts';

const viewPathMap: Partial<Record<View, string>> = {
  members: '/cadastro',
  presence: '/cadastro/presenca',
  inscricoes_prioritarias: '/prioritarios',
  visitacao: '/visitacao',
  inscricoes_review: '/inscricoes/revisao',
  inscricoes_prioritarias_circulos: '/distribuicao-circulos',
  encontreiros: '/encontreiros',
};

const pathViewMap: Record<string, View> = {
  '/cadastro': 'members',
  '/cadastro/presenca': 'presence',
  '/prioritarios': 'inscricoes_prioritarias',
  '/visitacao': 'visitacao',
  '/inscricoes/revisao': 'inscricoes_review',
  '/distribuicao-circulos': 'inscricoes_prioritarias_circulos',
  '/encontreiros': 'encontreiros',
};

const publicFormPathMap = {
  inscricao: '/inscricao/form',
  encontreiro: '/encontreiro/form',
  presenca: '/presenca/form',
  visitacao: '/visitacao/form',
} as const;

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
  const [dashboardInsights, setDashboardInsights] = useState({
    encontreirosCount: 0,
    triagemStatusCounts: { inscrito: 0, priorizado: 0, confirmado: 0 },
    ageDistributionByStatus: { INSCRITO: {}, PRIORIZADO: {}, CONFIRMADO: {} } as Record<string, Record<string, number>>,
    monthlyInscricoesCurrentYear: [] as Array<{ mes: string; mesIndex: number; total: number }>,
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

  const [queryParams, setQueryParams] = useState({ mode: '', email: '', name: '', token: '' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    const modeFromPath =
      pathname === publicFormPathMap.inscricao ? 'inscricao_form'
      : pathname === publicFormPathMap.encontreiro ? 'encontreiro_form'
      : pathname === publicFormPathMap.presenca ? 'presenca_form'
      : pathname === publicFormPathMap.visitacao ? 'visitacao_form'
      : '';

    setQueryParams({
      mode: params.get('mode') || modeFromPath,
      email: params.get('email') || '',
      name: params.get('name') || '',
      token: params.get('token') || '',
    });

    const pathView = pathViewMap[pathname];
    if (pathView) {
      setCurrentView(pathView);
      return;
    }

    // Se houver view na URL, aplica como view inicial (ex: ?view=members)
    const urlView = params.get('view') as View | null;
    const enabledViews = NAVIGATION_ROADMAP.filter((item) => item.enabled).map((item) => item.view);
    const allowedViews: View[] = Array.from(new Set<View>([...enabledViews, 'inscricoes_prioritarias_circulos']));
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (w.__eacFetchWrapped) return;

    const originalFetch = window.fetch.bind(window);
    w.__eacFetchWrapped = true;
    w.__eacFetchOriginal = originalFetch;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === 'string'
          ? input
          : (input instanceof URL ? input.toString() : String((input as Request).url || ''));

        const isApiCall =
          url.startsWith('/api/') ||
          url.includes('/api/');

        if (!isApiCall) {
          return originalFetch(input, init);
        }

        const savedUserRaw = window.localStorage.getItem('eac_user');
        const savedUser = savedUserRaw ? JSON.parse(savedUserRaw) : null;
        const email = String(savedUser?.email || '').trim().toLowerCase();

        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (email && !headers.has('x-eac-user-email')) {
          headers.set('x-eac-user-email', email);
        }

        return originalFetch(input, { ...(init || {}), headers });
      } catch {
        return originalFetch(input, init);
      }
    };
  }, []);

  const callApiProxy = useCallback(async (action: string, payload: any) => {
    const localUrl = effectiveGoogleWebAppUrl;
    const r = await postComunicadosAction<any>(action, payload, { googleWebAppUrl: localUrl });
    if (!r.success) {
      return { success: false, error: r.error, sample: r.sample, status: r.status };
    }
    return { ...(r.data as any), success: true };
  }, [effectiveGoogleWebAppUrl]);

  const handleNavigate = useCallback((view: View) => {
    if (!isViewEnabledInRoadmap(view) && view !== 'inscricoes_prioritarias_circulos') {
      showToast('Este módulo ainda não foi liberado no menu desta fase.', 'info');
      return;
    }

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
      const [syncRes, comRes, calRes, logRes, memRes, nonRes, dashboardSummaryRes] = await Promise.all([
        callApiProxy('GET_SYNC_STATUS', {}),
        callApiProxy('GET_COMUNICADOS', {}),
        callApiProxy('GET_EVENTS', {}),
        callApiProxy('GET_OPERATIONAL_LOGS', {}),
        callApiProxy('GET_MEMBERS', {}),
        callApiProxy('GET_NON_ENROLLED', {}),
        getJson<any>('/api/dashboard/resumo')
      ]);
      
      if (comRes.success) setComunicados(comRes.comunicados || []);
      if (calRes.success) setCalendarEvents(calRes.events || []);
      if (logRes.success) setLogs(logRes.logs || []);
      if (dashboardSummaryRes.success) {
        const summary = (dashboardSummaryRes.data as any)?.summary || {};
        setMembersCount(Number(summary.membersCount) || 0);
        setNonEnrolledCount(Number(summary.nonEnrolledCount) || 0);
        setNonEnrolledIndicators({
          preConfirmadasCount: Number(summary?.nonEnrolledIndicators?.preConfirmadasCount) || 0,
          interesseCount: Number(summary?.nonEnrolledIndicators?.interesseCount) || 0,
          interesseNoCount: Number(summary?.nonEnrolledIndicators?.interesseNoCount) || 0,
        });
        setDashboardInsights({
          encontreirosCount: Number(summary?.encontreirosCount) || 0,
          triagemStatusCounts: {
            inscrito: Number(summary?.triagemStatusCounts?.inscrito) || 0,
            priorizado: Number(summary?.triagemStatusCounts?.priorizado) || 0,
            confirmado: Number(summary?.triagemStatusCounts?.confirmado) || 0,
          },
          ageDistributionByStatus: (summary?.ageDistributionByStatus && typeof summary.ageDistributionByStatus === 'object')
            ? summary.ageDistributionByStatus
            : { INSCRITO: {}, PRIORIZADO: {}, CONFIRMADO: {} },
          monthlyInscricoesCurrentYear: Array.isArray(summary?.monthlyInscricoesCurrentYear) ? summary.monthlyInscricoesCurrentYear : [],
        });
      } else {
        if (memRes.success) setMembersCount(memRes.members?.length || 0);
      }

      if (nonRes.success && !dashboardSummaryRes.success) {
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
        const isNo = (v: any) => ['nÃ£o', 'nao', 'n', 'no', '0', 'false', 'falso'].includes(toClean(v));
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
      
      const rawLastUpdate = (syncRes && syncRes.success) ? (syncRes.lastUpdate || syncRes.last_update || '') : '';
      if (rawLastUpdate) {
        const dt = new Date(String(rawLastUpdate));
        setLastSync(!isNaN(dt.getTime())
          ? dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          : String(rawLastUpdate)
        );
      } else {
        setLastSync(new Date().toLocaleTimeString('pt-BR'));
      }
    } catch (e: any) { 
      showToast('Sincronizaï¿½ï¿½o offline.', 'error');
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
    if (user) fetchSpreadsheetData();
  }, [user, fetchSpreadsheetData]);

  // Sempre que o usuÃ¡rio navegar para uma tela operacional, forÃ§a nova sincronizaÃ§Ã£o
  useEffect(() => {
    if (!user) return;
    const viewsThatNeedSync: View[] = ['dashboard', 'members', 'inscricoes_prioritarias', 'inscricoes_prioritarias_circulos', 'visitacao', 'encontreiros', 'presence', 'dispatches', 'calendar', 'comunicados', 'logs'];
    if (viewsThatNeedSync.includes(currentView)) {
      fetchSpreadsheetData();
    }
  }, [currentView, user, fetchSpreadsheetData]);

  useEffect(() => {
    if (!user || user.role === 'ADMIN') return;
    const allowed = user.permissions?.allowedModules || [];
    const isPrioritariasView = currentView === 'inscricoes_prioritarias';
    if (isPrioritariasView && !allowed.includes('inscricoes_prioritarias')) {
      setCurrentView('dashboard');
      showToast('Seu usuÃ¡rio nÃ£o possui acesso ao mÃ³dulo InscriÃ§Ãµes PrioritÃ¡rias.', 'error');
      return;
    }
    if (currentView === 'inscricoes_prioritarias_circulos' && !allowed.includes('inscricoes_prioritarias_circulos')) {
      setCurrentView('dashboard');
      showToast('Seu usuÃ¡rio nÃ£o possui acesso Ã  subtela de DistribuiÃ§Ã£o de CÃ­rculos.', 'error');
      return;
    }
    if (currentView === 'visitacao' && !allowed.includes('visitacao')) {
      setCurrentView('dashboard');
      showToast('Seu usuÃ¡rio nÃ£o possui acesso ao mÃ³dulo de VisitaÃ§Ã£o.', 'error');
      return;
    }
    if (currentView === 'inscricoes_review' && !allowed.includes('inscricoes_review')) {
      setCurrentView('dashboard');
      showToast('Seu usuÃ¡rio nÃ£o possui acesso ao mÃ³dulo RevisÃ£o de InscriÃ§Ãµes.', 'error');
      return;
    }
    if (currentView === 'members' && !allowed.includes('members')) {
      setCurrentView('dashboard');
      showToast('Seu usuÃ¡rio nÃ£o possui acesso ao mÃ³dulo Cadastro de Encontrista.', 'error');
      return;
    }
    if (currentView === 'presence' && !allowed.includes('presence')) {
      setCurrentView('dashboard');
      showToast('Seu usuÃ¡rio nÃ£o possui acesso ao mÃ³dulo Controle de PresenÃ§a.', 'error');
      return;
    }
    if (currentView === 'encontreiros' && !allowed.includes('encontreiros')) {
      setCurrentView('dashboard');
      showToast('Seu usuÃ¡rio nÃ£o possui acesso ao mÃ³dulo Cadastro de Encontreiro.', 'error');
    }
  }, [currentView, user]);

  const handleExecuteDispatch = async (d: Dispatch, payload: any = {}) => {
    const getWeekId = (date: Date) => {
      const dt = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const day = dt.getUTCDay() || 7;
      dt.setUTCDate(dt.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    };

    if (d.type === 'aniversariantes_dia') {
      const currentYear = new Date().getFullYear();
      const alreadyExecutedThisYear = (Array.isArray(logs) ? logs : []).some((entry: any) => {
        const dispatchId = String((entry as any)?.dispatchId || (entry as any)?.dispatch_id || '');
        const status = String((entry as any)?.status || '').toUpperCase();
        const tsRaw = String((entry as any)?.timestamp || '');
        if (dispatchId !== d.id) return false;
        if (status !== 'SUCCESS') return false;
        const ts = new Date(tsRaw);
        if (Number.isNaN(ts.getTime())) return false;
        return ts.getFullYear() === currentYear;
      });

      if (alreadyExecutedThisYear) {
        showToast(`Disparo de aniversariantes já executado em ${currentYear}. Reenvio anual bloqueado.`, 'info');
        return;
      }
    }

    setIsLoadingSheet(true);
    const startedAt = Date.now();
    let action = '';
    if (d.type === 'comunicado_99_cadastro') action = 'EXECUTE_COMUNICADO_99';
    else if (d.type === 'aniversariantes_dia') action = 'EXECUTE_ANIVERSARIANTES';
    else if (d.type === 'eventos') action = 'EXECUTE_EVENTOS';
    else if (d.type === 'waitlist_non_enrolled') action = 'EXECUTE_WAITLIST_NON_ENROLLED';
    else if (d.type === 'confirmacao_interesse_espera') action = 'EXECUTE_INTEREST_CONFIRMATION';
    else if (d.type === 'confirm_nao_inscritos') action = 'EXECUTE_CONFIRM_INSCRITOS';
    else if (d.type === 'comunicacao_nao_participacao_eac') action = 'EXECUTE_COMUNICACAO_NAO_PARTICIPACAO_EAC';
    else if (d.type === 'emergencia_nov2025') action = 'EXECUTE_EMERGENCIA_NOV2025';
    const semanaId = action === 'EXECUTE_EVENTOS' ? getWeekId(new Date()) : '';

    if (action === 'EXECUTE_EVENTOS') {
      const alreadyExecutedThisWeek = (Array.isArray(logs) ? logs : []).some((entry: any) => {
        const dispatchId = String((entry as any)?.dispatchId || (entry as any)?.dispatch_id || '').trim();
        const status = String((entry as any)?.status || '').toUpperCase();
        const tsRaw = String((entry as any)?.timestamp || '');
        if (dispatchId !== d.id) return false;
        if (status !== 'SUCCESS') return false;
        const ts = new Date(tsRaw);
        if (Number.isNaN(ts.getTime())) return false;
        return getWeekId(ts) === semanaId;
      });

      if (alreadyExecutedThisWeek) {
        showToast(`Disparo de agenda semanal já executado na semana ${semanaId}.`, 'info');
        return;
      }
    }

    if (action) {
      const finalPayload = { ...(payload || {}) };
      let preselectedRecipients: any[] = [];
      if (action === 'EXECUTE_INTEREST_CONFIRMATION' && !finalPayload.appUrl && typeof window !== 'undefined') {
        finalPayload.appUrl = window.location.origin;
      }
      if (action === 'EXECUTE_WAITLIST_NON_ENROLLED' || action === 'EXECUTE_COMUNICACAO_NAO_PARTICIPACAO_EAC') {
        const audienceTipo = action === 'EXECUTE_WAITLIST_NON_ENROLLED' ? 'waitlist' : 'nao_participacao';
        const audienceRes = await callApiProxy('BUILD_NON_ENROLLED_DISPATCH_AUDIENCE', { tipo: audienceTipo });
        if (audienceRes.success) {
          preselectedRecipients = Array.isArray(audienceRes.recipients) ? audienceRes.recipients : [];
          finalPayload.recipients = preselectedRecipients;
        }
      }

      const r = await callApiProxy(action, finalPayload);
      const duration = Date.now() - startedAt;
      await callApiProxy('LOG_DISPATCH_EXECUTION', {
        dispatchId: d.id,
        dispatchName: d.name,
        operator: user?.name || user?.email || 'Sistema',
        status: r.success ? 'SUCCESS' : 'ERROR',
        responseSummary: r.success ? (r.message || 'Disparo executado com sucesso.') : (r.error || 'Falha no disparo.'),
        duration,
        semanaId: semanaId || undefined,
      });

      const toRecipientItems = (result: any) => {
        const items: Array<{ destinatario: string; status: string; detalhe?: string }> = [];
        const pushMany = (arr: any[], status: string) => {
          (Array.isArray(arr) ? arr : []).forEach((entry: any) => {
            const destinatario =
              String(entry?.destinatario || entry?.email || entry?.telefone || entry?.nome || entry || '').trim();
            if (!destinatario) return;
            items.push({
              destinatario,
              status,
              detalhe: String(entry?.detalhe || entry?.message || '').trim(),
            });
          });
        };
        pushMany(result?.destinatarios, 'PROCESSADO');
        pushMany(result?.enviados, 'ENVIADO');
        pushMany(result?.errors || result?.erros, 'ERRO');
        pushMany(result?.ignorados, 'IGNORADO');
        return items;
      };

      const recipientItems = toRecipientItems(r);
      const fallbackRecipientItems =
        recipientItems.length === 0 && preselectedRecipients.length > 0
          ? preselectedRecipients.map((entry: any) => ({
              destinatario: String(entry?.email || entry?.telefone || entry?.nome || '').trim(),
              status: r.success ? 'PROCESSADO' : 'ERRO',
              detalhe: r.success ? 'Público pré-selecionado no Supabase.' : (r.error || 'Falha no disparo.'),
            })).filter((entry: any) => entry.destinatario)
          : [];
      const recipientItemsFinal = recipientItems.length > 0 ? recipientItems : fallbackRecipientItems;
      if (recipientItemsFinal.length > 0) {
        await callApiProxy('LOG_DISPATCH_DESTINATARIOS', {
          dispatchId: d.id,
          dispatchName: d.name,
          operator: user?.name || user?.email || 'Sistema',
          itens: recipientItemsFinal,
          semanaId: semanaId || undefined,
        });
      }

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
          token={queryParams.token}
          googleWebAppUrl={effectiveUrl}
          onSuccess={handleSuccess}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {dialogNode}
      </div>
    );
  }

  if (queryParams.mode === 'inscricao_form') {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicInscricaoForm />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {dialogNode}
      </div>
    );
  }

  if (queryParams.mode === 'encontreiro_form') {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicEncontreiroForm />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {dialogNode}
      </div>
    );
  }

  if (queryParams.mode === 'presenca_form') {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicPresenceForm />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {dialogNode}
      </div>
    );
  }

  if (queryParams.mode === 'visitacao_form') {
    return (
      <div className="min-h-screen bg-slate-50">
        <VisitacaoForm token={queryParams.token} />
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
        {currentView === 'dashboard' && <Dashboard user={user} logs={logs} calendarEvents={calendarEvents} comunicados={comunicados} membersCount={membersCount} nonEnrolledCount={nonEnrolledCount} nonEnrolledPreConfirmadasCount={nonEnrolledIndicators.preConfirmadasCount} nonEnrolledInteresseCount={nonEnrolledIndicators.interesseCount} nonEnrolledInteresseNoCount={nonEnrolledIndicators.interesseNoCount} dashboardInsights={dashboardInsights} onNavigate={handleNavigate} lastSync={lastSync} onRefresh={fetchSpreadsheetData} isLoading={isLoadingSheet} />}
        {currentView === 'members' && (
          <MembersPage
            user={user}
            googleWebAppUrl={effectiveGoogleWebAppUrl}
          />
        )}
        {currentView === 'inscricoes_prioritarias' && (
          <InscricoesPrioritariasPage
            googleWebAppUrl={effectiveGoogleWebAppUrl}
            onOpenCirculos={() => handleNavigate('inscricoes_prioritarias_circulos')}
          />
        )}
        {currentView === 'visitacao' && <VisitacaoPage user={user} />}
        {currentView === 'inscricoes_review' && <InscricoesReviewPage />}
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


