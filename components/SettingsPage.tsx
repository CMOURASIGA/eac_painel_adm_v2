import React, { useState } from 'react';
import { SystemSettings } from '../types';
import { getJson, patchJson, postComunicadosAction, postJson } from '../services/eacApiClient.ts';

type EncontroAdminItem = {
  id: string;
  numero?: string | number | null;
  nome?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  local?: string | null;
  status?: string | null;
  observacoes?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
};

interface SettingsPageProps {
  settings: SystemSettings;
  onSave: (settings: SystemSettings) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<SystemSettings>(settings);
  const [safeSettings, setSafeSettings] = useState<any>(null);
  const [encontros, setEncontros] = useState<EncontroAdminItem[]>([]);
  const [loadingEncontros, setLoadingEncontros] = useState(false);
  const [savingEncontro, setSavingEncontro] = useState(false);
  const [encontrosError, setEncontrosError] = useState('');
  const [encontrosFeedback, setEncontrosFeedback] = useState('');
  const [editingId, setEditingId] = useState('');
  const [encontroForm, setEncontroForm] = useState({
    numero: '',
    nome: '',
    data_inicio: '',
    data_fim: '',
    local: '',
    status: 'PLANEJADO',
    observacoes: '',
  });

  const vercelUrlEnv = process.env.NEXT_PUBLIC_GOOGLE_WEBAPP_URL;
  const isVercelConfigured = !!vercelUrlEnv;

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  React.useEffect(() => {
    const load = async () => {
      const r = await postComunicadosAction<any>('GET_SAFE_SETTINGS', {});
      if (r.success) setSafeSettings((r.data as any)?.settings || null);
    };
    void load();
  }, []);

  const loadEncontros = React.useCallback(async () => {
    setLoadingEncontros(true);
    setEncontrosError('');
    try {
      const r = await getJson<any>('/api/encontros/abertos?scope=admin');
      if (!r.success) throw new Error(r.error || 'Não foi possível carregar os encontros.');
      setEncontros(Array.isArray((r.data as any)?.data) ? (r.data as any).data : []);
    } catch (e: any) {
      setEncontros([]);
      setEncontrosError(e?.message || 'Não foi possível carregar os encontros.');
    } finally {
      setLoadingEncontros(false);
    }
  }, []);

  React.useEffect(() => {
    void loadEncontros();
  }, [loadEncontros]);

  const handleChange = (field: keyof SystemSettings, value: string) => {
    setLocalSettings({ ...localSettings, [field]: value });
  };

  const resetEncontroForm = () => {
    setEditingId('');
    setEncontroForm({
      numero: '',
      nome: '',
      data_inicio: '',
      data_fim: '',
      local: '',
      status: 'PLANEJADO',
      observacoes: '',
    });
  };

  const handleChangeEncontro = (field: keyof typeof encontroForm, value: string) => {
    setEncontroForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditEncontro = (item: EncontroAdminItem) => {
    setEditingId(String(item.id || ''));
    setEncontroForm({
      numero: String(item.numero ?? ''),
      nome: String(item.nome ?? ''),
      data_inicio: String(item.data_inicio ?? '').slice(0, 10),
      data_fim: String(item.data_fim ?? '').slice(0, 10),
      local: String(item.local ?? ''),
      status: String(item.status || 'PLANEJADO').toUpperCase(),
      observacoes: String(item.observacoes ?? ''),
    });
    setEncontrosFeedback('');
    setEncontrosError('');
  };

  const handleSaveEncontro = async () => {
    setSavingEncontro(true);
    setEncontrosError('');
    setEncontrosFeedback('');
    try {
      const payload = {
        ...encontroForm,
        numero: encontroForm.numero.trim(),
        nome: encontroForm.nome.trim(),
        data_inicio: encontroForm.data_inicio || null,
        data_fim: encontroForm.data_fim || null,
        local: encontroForm.local.trim(),
        status: encontroForm.status.trim().toUpperCase(),
        observacoes: encontroForm.observacoes.trim(),
      };

      const r = editingId
        ? await patchJson<any>('/api/encontros/abertos?scope=admin', { id: editingId, ...payload })
        : await postJson<any>('/api/encontros/abertos?scope=admin', payload);

      if (!r.success) throw new Error(r.error || 'Não foi possível salvar o encontro.');

      setEncontrosFeedback(editingId ? 'Encontro atualizado com sucesso.' : 'Encontro criado com sucesso.');
      resetEncontroForm();
      await loadEncontros();
    } catch (e: any) {
      setEncontrosError(e?.message || 'Não foi possível salvar o encontro.');
    } finally {
      setSavingEncontro(false);
    }
  };

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Configuracoes do Sistema</h2>
        <p className="text-slate-500 mt-1 font-medium">Gerencie o motor de integracao e endpoints globais da operacao EAC.</p>
      </header>

      <div className="grid grid-cols-1 gap-8">
        <section className={`bg-white rounded-[2.5rem] border overflow-hidden shadow-sm transition-all ${isVercelConfigured ? 'border-green-300 ring-4 ring-green-50 shadow-green-100/50' : 'border-slate-200'}`}>
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center space-x-4">
              <div className={`p-3 rounded-2xl text-white ${isVercelConfigured ? 'bg-green-600' : 'bg-blue-600'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12l2 2 4-4"/></svg>
              </div>
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-wider text-sm">Google Sheets Engine</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Conector via Apps Script</p>
              </div>
            </div>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">URL da Implantacao</label>
              <input
                type="text"
                disabled={isVercelConfigured}
                className="w-full px-6 py-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold"
                value={isVercelConfigured ? vercelUrlEnv : localSettings.googleWebAppUrl}
                onChange={(e) => handleChange('googleWebAppUrl', e.target.value)}
              />
            </div>

            {safeSettings && (
              <div className="space-y-2 bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Diagnostico Seguro do Ambiente</p>
                <p className="text-xs text-slate-600 font-semibold">Ambiente: {String(safeSettings.env || '-')}</p>
                <p className="text-xs text-slate-600 font-semibold">Modo de dados: {String(safeSettings.dataMode || 'supabase').toUpperCase()}</p>
                <p className="text-xs text-slate-600 font-semibold">Fallback leitura planilha: {safeSettings.allowSheetsFallbackRead ? 'Ativo' : 'Inativo'}</p>
                <p className="text-xs text-slate-600 font-semibold">SUPABASE_URL: {safeSettings.authConfigured?.hasUrl ? 'OK' : 'Ausente'}</p>
                <p className="text-xs text-slate-600 font-semibold">SUPABASE_ANON_KEY: {safeSettings.authConfigured?.hasAnon ? 'OK' : 'Ausente'}</p>
                <p className="text-xs text-slate-600 font-semibold">SUPABASE_SERVICE_ROLE_KEY: {safeSettings.authConfigured?.hasServiceRole ? 'OK' : 'Ausente'}</p>
              </div>
            )}

            {safeSettings?.tables && (
              <div className="space-y-2 bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Mapa de Tabelas Operacionais</p>
                <p className="text-xs text-slate-700 font-semibold">Cadastro: {String(safeSettings.tables.members || '-')}</p>
                <p className="text-xs text-slate-700 font-semibold">Nao Inscritos: {String(safeSettings.tables.nonEnrolled || '-')}</p>
                <p className="text-xs text-slate-700 font-semibold">Calendario: {String(safeSettings.tables.events || '-')}</p>
                <p className="text-xs text-slate-700 font-semibold">Comunicados: {String(safeSettings.tables.comunicados || '-')}</p>
                <p className="text-xs text-slate-700 font-semibold">Logs: {String(safeSettings.tables.logs || '-')}</p>
                <p className="text-xs text-slate-700 font-semibold">Perfis: {String(safeSettings.tables.profiles || '-')}</p>
              </div>
            )}

            {safeSettings && (
              <div className="space-y-1 bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Prontidao Operacional</p>
                <p className="text-xs font-semibold text-slate-700">
                  {safeSettings.authConfigured?.hasUrl && safeSettings.authConfigured?.hasAnon && safeSettings.authConfigured?.hasServiceRole
                    ? 'Banco apto para operacao (credenciais presentes).'
                    : 'Banco parcialmente configurado. Revise variaveis no .env.local.'}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-2xl text-white bg-indigo-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-wider text-sm">Cadastro de Encontros</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Gerencie os encontros usados na triagem e formulários</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { resetEncontroForm(); setEncontrosFeedback(''); setEncontrosError(''); }}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-[11px] font-black uppercase tracking-widest"
            >
              Novo encontro
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Número</label>
                <input value={encontroForm.numero} onChange={(e) => handleChangeEncontro('numero', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold" />
              </div>
              <div className="space-y-2 xl:col-span-3">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Nome do encontro</label>
                <input value={encontroForm.nome} onChange={(e) => handleChangeEncontro('nome', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold" />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data início</label>
                <input type="date" value={encontroForm.data_inicio} onChange={(e) => handleChangeEncontro('data_inicio', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold" />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data fim</label>
                <input type="date" value={encontroForm.data_fim} onChange={(e) => handleChangeEncontro('data_fim', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold" />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</label>
                <select value={encontroForm.status} onChange={(e) => handleChangeEncontro('status', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold">
                  {['PLANEJADO', 'CANCELADO'].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Local</label>
                <input value={encontroForm.local} onChange={(e) => handleChangeEncontro('local', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold" />
              </div>
              <div className="space-y-2 md:col-span-2 xl:col-span-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Observações</label>
                <textarea value={encontroForm.observacoes} onChange={(e) => handleChangeEncontro('observacoes', e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold resize-y" />
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              A tabela de encontros no banco hoje aceita apenas os status `PLANEJADO` e `CANCELADO`. `ATIVO` e `ENCERRADO` estao bloqueados pela constraint atual do Supabase.
            </div>

            {encontrosError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{encontrosError}</div> : null}
            {encontrosFeedback ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{encontrosFeedback}</div> : null}

            <div className="flex justify-end gap-3">
              {editingId ? (
                <button
                  type="button"
                  onClick={resetEncontroForm}
                  className="px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 text-[11px] font-black uppercase tracking-widest"
                >
                  Cancelar edição
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSaveEncontro}
                disabled={savingEncontro}
                className="px-6 py-3 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                {savingEncontro ? 'Salvando...' : editingId ? 'Atualizar encontro' : 'Criar encontro'}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Encontros cadastrados</p>
                <button type="button" onClick={() => void loadEncontros()} className="text-[11px] font-black text-indigo-600 uppercase tracking-widest">Recarregar</button>
              </div>
              {loadingEncontros ? (
                <div className="p-6 text-sm font-bold text-slate-500">Carregando encontros...</div>
              ) : encontros.length === 0 ? (
                <div className="p-6 text-sm font-bold text-slate-500">Nenhum encontro cadastrado.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {encontros.map((item) => (
                    <div key={item.id} className="p-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest">{item.status || '-'}</span>
                          {item.numero ? <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nº {item.numero}</span> : null}
                        </div>
                        <p className="mt-2 text-base font-black text-slate-900">{item.nome || '-'}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {item.data_inicio ? String(item.data_inicio).slice(0, 10) : 'Sem data início'} {item.data_fim ? `até ${String(item.data_fim).slice(0, 10)}` : ''}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{item.local || 'Local não informado'}</p>
                        {item.observacoes ? <p className="mt-1 text-sm text-slate-600">{item.observacoes}</p> : null}
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleEditEncontro(item)}
                          className="px-4 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-700 text-[11px] font-black uppercase tracking-widest"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            className="blue-gradient text-white px-12 py-5 rounded-2xl font-black shadow-2xl active:scale-95 transition-all uppercase text-sm tracking-widest"
          >
            Salvar Alteracoes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
