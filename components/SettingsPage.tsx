import React, { useState } from 'react';
import { SystemSettings } from '../types';
import { postComunicadosAction } from '../services/eacApiClient.ts';

interface SettingsPageProps {
  settings: SystemSettings;
  onSave: (settings: SystemSettings) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<SystemSettings>(settings);
  const [safeSettings, setSafeSettings] = useState<any>(null);

  const vercelUrlEnv = process.env.NEXT_PUBLIC_GOOGLE_WEBAPP_URL;
  const isVercelConfigured = !!vercelUrlEnv;

  React.useEffect(() => {
    const load = async () => {
      const r = await postComunicadosAction<any>('GET_SAFE_SETTINGS', {});
      if (r.success) setSafeSettings((r.data as any)?.settings || null);
    };
    void load();
  }, []);

  const handleChange = (field: keyof SystemSettings, value: string) => {
    setLocalSettings({ ...localSettings, [field]: value });
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
