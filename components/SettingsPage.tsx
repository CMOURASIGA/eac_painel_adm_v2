
import React, { useState } from 'react';
import { SystemSettings } from '../types';

interface SettingsPageProps {
  settings: SystemSettings;
  onSave: (settings: SystemSettings) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<SystemSettings>(settings);
  
  const vercelUrlEnv = process.env.NEXT_PUBLIC_GOOGLE_WEBAPP_URL;
  const isVercelConfigured = !!vercelUrlEnv;

  const handleChange = (field: keyof SystemSettings, value: string) => {
    setLocalSettings({ ...localSettings, [field]: value });
  };

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Configurações do Sistema</h2>
        <p className="text-slate-500 mt-1 font-medium">Gerencie o motor de integração e endpoints globais da operação EAC.</p>
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
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">URL da Implantação</label>
              <input 
                type="text" 
                disabled={isVercelConfigured}
                className="w-full px-6 py-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold"
                value={isVercelConfigured ? vercelUrlEnv : localSettings.googleWebAppUrl}
                onChange={(e) => handleChange('googleWebAppUrl', e.target.value)}
              />
            </div>
            
            {/* NOVO CAMPO: ID DA AGENDA */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">ID da Agenda Google (E-mail)</label>
              <input 
                type="text" 
                className="w-full px-6 py-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold text-blue-700"
                placeholder="eacporciunculadesantana@gmail.com"
                value={localSettings.calendarId || 'eacporciunculadesantana@gmail.com'}
                onChange={(e) => handleChange('calendarId', e.target.value)}
              />
              <p className="text-[9px] text-slate-400 italic">E-mail da conta Google que contém a agenda oficial.</p>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave}
            className="blue-gradient text-white px-12 py-5 rounded-2xl font-black shadow-2xl active:scale-95 transition-all uppercase text-sm tracking-widest"
          >
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
