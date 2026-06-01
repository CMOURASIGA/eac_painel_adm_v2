
import React, { useState } from 'react';
import { Comunicado, User } from '../types';
import Badge from './Badge';
import { toCleanString } from '../utils/textEncoding.ts';
import DataOriginAudit from './DataOriginAudit.tsx';

interface ComunicadosPageProps {
  comunicados: Comunicado[];
  onSave: (comunicado: Comunicado) => void;
  onDelete: (id: string) => void;
  onSync: () => void;
  isLoading: boolean;
  user: User;
}

const ComunicadosPage: React.FC<ComunicadosPageProps> = ({ comunicados, onSave, onDelete, onSync, isLoading, user }) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const initialForm: Comunicado = {
    id: '',
    titulo: '',
    assunto: '',
    corpo: '',
    status: 'Ativo',
    dataAgendada: '',
    dataEventos: '',
    dataCriacao: new Date().toISOString()
  };

  const [formData, setFormData] = useState<Comunicado>(initialForm);
  
  const canDelete = user.role === 'ADMIN' || user.permissions.canDelete;
  const canEdit = user.role === 'ADMIN' || user.permissions.canEdit;

  const handleExecuteDelete = () => {
    if (deletingId) {
      onDelete(deletingId);
      setIsDeleteModalOpen(false);
      setDeletingId(null);
    }
  };

  const handleOpenNew = () => {
    setFormData(initialForm);
    setIsFormOpen(true);
  };

  const handleEdit = (com: Comunicado) => {
    setFormData({
      ...com,
      id: toCleanString(com.id),
      titulo: toCleanString(com.titulo),
      assunto: toCleanString(com.assunto),
      corpo: toCleanString(com.corpo),
      status: toCleanString(com.status),
      dataAgendada: toCleanString((com as any).dataAgendada),
      dataEventos: toCleanString((com as any).dataEventos),
    } as Comunicado);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id || !formData.titulo) {
      alert("ID e Título são obrigatórios.");
      return;
    }
    onSave(formData);
    setIsFormOpen(false);
  };

  return (
    <div className="p-4 md:p-8 max-w-[98rem] mx-auto animate-in fade-in duration-500 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h2 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight uppercase leading-none">Gestão de Comunicados</h2>
          <p className="text-slate-500 font-medium italic mt-2 text-sm">Sincronização estratégica com a base de dados em nuvem.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onSync} disabled={isLoading} className="px-6 py-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-700 hover:bg-slate-50 text-xs uppercase tracking-widest transition-all">
            {isLoading ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button 
            onClick={handleOpenNew}
            className="blue-gradient text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:scale-105 transition-all text-xs uppercase tracking-widest"
          >
            + NOVO REGISTRO
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-8 py-6">ID</th>
              <th className="px-8 py-6">Título</th>
              <th className="px-8 py-6">Assunto</th>
              <th className="px-8 py-6 text-center">Status</th>
              <th className="px-8 py-6 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {comunicados.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center text-slate-400 italic font-bold">Nenhum comunicado encontrado.</td>
              </tr>
            ) : comunicados.map(com => (
              <tr key={com.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-8 py-6 font-black text-slate-900">#{toCleanString(com.id)}</td>
                <td className="px-8 py-6 font-bold text-slate-800">{toCleanString(com.titulo)}</td>
                <td className="px-8 py-6 text-blue-600 font-bold text-xs uppercase">{toCleanString(com.assunto)}</td>
                <td className="px-8 py-6 text-center"><Badge type={toCleanString(com.status) === 'Ativo' ? 'success' : 'gray'}>{toCleanString(com.status) || 'Ativo'}</Badge></td>
                <td className="px-8 py-6 text-center space-x-2">
                  <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>
                  {canEdit && (
                    <button onClick={() => handleEdit(com)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                  )}
                  {canDelete && (
                    <button onClick={() => { setDeletingId(toCleanString(com.id)); setIsDeleteModalOpen(true); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL DE FORMULÁRIO */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-6 bg-slate-900/90 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200">
            <form onSubmit={handleSubmit}>
              <div className="blue-gradient p-8 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Registro de Comunicado</h3>
                  <p className="text-blue-100 text-[9px] uppercase tracking-widest font-bold opacity-70 mt-1">Configuração de Template EAC</p>
                </div>
                <button type="button" onClick={() => setIsFormOpen(false)} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ID (Ex: 99)</label>
                    <input 
                      required 
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm" 
                      value={formData.id} 
                      onChange={e => setFormData({...formData, id: e.target.value})} 
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título Interno</label>
                    <input 
                      required 
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm" 
                      value={formData.titulo} 
                      onChange={e => setFormData({...formData, titulo: e.target.value})} 
                    />
                  </div>
                </div>

                <DataOriginAudit record={formData} />

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assunto do E-mail</label>
                  <input 
                    required 
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 transition-all text-sm" 
                    value={formData.assunto} 
                    onChange={e => setFormData({...formData, assunto: e.target.value})} 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Corpo do Comunicado (HTML ou Texto)</label>
                  <textarea 
                    required 
                    rows={8}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-medium text-slate-700 outline-none focus:border-blue-500 transition-all text-sm font-mono" 
                    value={formData.corpo} 
                    onChange={e => setFormData({...formData, corpo: e.target.value})}
                    placeholder="Cole o HTML do template aqui..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                  <select 
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm"
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value})}
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="px-8 py-8 bg-slate-50 border-t flex flex-col md:flex-row gap-3">
                <button type="submit" disabled={isLoading} className="w-full blue-gradient text-white px-10 py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all tracking-[0.2em]">
                  {isLoading ? 'SINCRONIZANDO...' : 'GRAVAR NA NUVEM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EXCLUSÃO */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 border-4 border-white shadow-lg">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <div>
                <p className="text-slate-900 font-black text-xl uppercase tracking-tighter leading-tight">Apagar Comunicado?</p>
                <p className="text-slate-500 text-sm font-medium mt-2 leading-relaxed px-4">Tem certeza que deseja remover permanentemente o comunicado <b>#{deletingId}</b>?</p>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={handleExecuteDelete} className="w-full bg-red-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all uppercase tracking-widest">SIM, EXCLUIR TEMPLATE</button>
                <button onClick={() => { setIsDeleteModalOpen(false); setDeletingId(null); }} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest">CANCELAR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComunicadosPage;

