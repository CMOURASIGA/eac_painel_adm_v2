
import React, { useState, useEffect, useCallback } from 'react';
import { User, View } from '../types.ts';
import Badge from './Badge.tsx';
import { sanitizeTextDeep, toCleanString } from '../utils/textEncoding.ts';

interface UserManagementPageProps {
  currentUser: User;
  googleWebAppUrl: string;
}

// Interface estendida para refletir todos os campos da planilha de usuários do EAC
interface FullUserFormData {
  usuario: string;
  senha: string;
  perfil: 'Administrador' | 'Simples';
  status: 'Ativo' | 'Inativo';
  inclusao: 'Sim' | 'Não';
  alteracao: 'Sim' | 'Não';
  visualizacao: 'Sim' | 'Não';
  exclusao: 'Sim' | 'Não';
  disparo: 'Sim' | 'Não';
  calendario: 'Sim' | 'Não';
  comunicado: 'Sim' | 'Não';
  log: 'Sim' | 'Não';
  usuario_mod: 'Sim' | 'Não';
  ajuste: 'Sim' | 'Não';
  ajuda: 'Sim' | 'Não';
  cadastro: 'Sim' | 'Não';
  encontreiro: 'Sim' | 'Não';
  encontreiro_inclusao: 'Sim' | 'Não';
  encontreiro_alteracao: 'Sim' | 'Não';
  encontreiro_visualizacao: 'Sim' | 'Não';
  encontreiro_exclusao: 'Sim' | 'Não';
  prioritarios: 'Sim' | 'Não';
  circulos: 'Sim' | 'Não';
  presenca: 'Sim' | 'Não';
  originalEmail?: string;
}

const UserManagementPage: React.FC<UserManagementPageProps> = ({ currentUser, googleWebAppUrl }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const initialForm: FullUserFormData = {
    usuario: '',
    senha: '',
    perfil: 'Simples',
    status: 'Ativo',
    inclusao: 'Não',
    alteracao: 'Não',
    visualizacao: 'Sim',
    exclusao: 'Não',
    disparo: 'Não',
    calendario: 'Não',
    comunicado: 'Não',
    log: 'Não',
    usuario_mod: 'Não',
    ajuste: 'Não',
    ajuda: 'Não',
    cadastro: 'Não',
    encontreiro: 'Não',
    encontreiro_inclusao: 'Não',
    encontreiro_alteracao: 'Não',
    encontreiro_visualizacao: 'Não',
    encontreiro_exclusao: 'Não',
    prioritarios: 'Não',
    circulos: 'Não',
    presenca: 'Não'
  };

  const [formData, setFormData] = useState<FullUserFormData>(initialForm);
  const [isEditing, setIsEditing] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GET_USERS', googleWebAppUrl })
      });
      const data = sanitizeTextDeep(await response.json());
      if (data.success && data.users) {
        const mappedUsers: User[] = data.users.map((u: any, idx: number) => ({
          id: String(idx + 1),
          name: toCleanString(u.usuario),
          email: toCleanString(u.usuario),
          password: u.senha,
          role: u.perfil === 'Administrador' ? 'ADMIN' : 'VIEWER',
          status: toCleanString(u.status) || 'Ativo',
          permissions: {
            canCreate: toCleanString(u.inclusao).toLowerCase() === 'sim',
            canEdit: toCleanString(u.alteracao).toLowerCase() === 'sim',
            canView: toCleanString(u.visualizacao).toLowerCase() === 'sim',
            canDelete: toCleanString(u.exclusao).toLowerCase() === 'sim',
            allowedModules: [], // Preenchido no login, aqui focado na gestão bruta
            // Guardamos os dados brutos para edição fácil
            _raw: u 
          }
        }));
        setUsers(mappedUsers);
      }
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }, [googleWebAppUrl]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleOpenNew = () => {
    setFormData(initialForm);
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleEdit = (u: any) => {
    const raw = u.permissions._raw;
    setFormData({
      ...initialForm,
      ...raw,
      originalEmail: raw.usuario
    });
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'SAVE_USER', 
          data: formData, 
          googleWebAppUrl 
        })
      });
      const res = sanitizeTextDeep(await response.json());
      if (res.success) {
        setIsFormOpen(false);
        fetchUsers();
      } else {
        alert(res.error || "Erro ao salvar usuário.");
      }
    } catch (e) { alert("Erro de conexão."); }
    finally { setIsLoading(false); }
  };

  const confirmDelete = (u: User) => {
    setUserToDelete(u);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!userToDelete) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'DELETE_USER', 
          data: { usuario: userToDelete.name }, 
          googleWebAppUrl 
        })
      });
      const res = sanitizeTextDeep(await response.json());
      if (res.success) {
        setIsDeleteModalOpen(false);
        setUserToDelete(null);
        fetchUsers();
      } else {
        alert(res.error || "Erro ao excluir.");
      }
    } catch (e) { alert("Erro de conexão."); }
    finally { setIsLoading(false); }
  };

  const PermissionToggle = ({ label, field }: { label: string, field: keyof FullUserFormData }) => (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white transition-all">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
      <button 
        type="button"
        onClick={() => setFormData({ ...formData, [field]: formData[field] === 'Sim' ? 'Não' : 'Sim' })}
        className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${formData[field] === 'Sim' ? 'bg-green-600 text-white shadow-md' : 'bg-slate-200 text-slate-400'}`}
      >
        {formData[field]}
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-12">
        <div>
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase leading-none">Gestão de Acessos</h2>
          <p className="text-slate-500 font-medium italic mt-3 text-sm">Configuração de permissões e rotinas operacionais.</p>
        </div>
        <button 
          onClick={handleOpenNew}
          className="blue-gradient text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:scale-105 transition-all text-xs tracking-widest uppercase"
        >
          + NOVO USUÁRIO
        </button>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200/50">
        <table className="w-full text-left">
          <thead className="bg-slate-900 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-8 py-6">Usuário</th>
              <th className="px-8 py-6 text-center">Perfil</th>
              <th className="px-8 py-6 text-center">Status</th>
              <th className="px-8 py-6 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {users.length === 0 && !isLoading && (
              <tr><td colSpan={4} className="p-20 text-center text-slate-400 font-bold italic">Nenhum usuário cadastrado.</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-8 py-6 font-black text-slate-900">{u.name}</td>
                <td className="px-8 py-6 text-center"><Badge type={u.role === 'ADMIN' ? 'warning' : 'info'}>{u.role}</Badge></td>
                <td className="px-8 py-6 text-center"><Badge type={u.status === 'Ativo' ? 'success' : 'danger'}>{u.status}</Badge></td>
                <td className="px-8 py-6 text-right space-x-2">
                  <button onClick={() => handleEdit(u)} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                  {u.name !== currentUser.name && (
                    <button onClick={() => confirmDelete(u)} className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL DE FORMULÁRIO (UPSERT) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
            <form onSubmit={handleSave}>
              <div className="blue-gradient p-8 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">{isEditing ? 'Editar Perfil' : 'Novo Usuário EAC'}</h3>
                  <p className="text-blue-100 text-[9px] uppercase tracking-widest font-bold opacity-70 mt-1">Configuração de Permissões</p>
                </div>
                <button type="button" onClick={() => setIsFormOpen(false)} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto scrollbar-hide">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuário / Email</label>
                    <input 
                      required 
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm" 
                      value={formData.usuario} 
                      onChange={e => setFormData({...formData, usuario: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha Provisória</label>
                    <input 
                      required={!isEditing}
                      type="password"
                      placeholder={isEditing ? 'Deixe em branco para manter a senha atual' : ''}
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm" 
                      value={formData.senha} 
                      onChange={e => setFormData({...formData, senha: e.target.value})} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Perfil</label>
                    <select 
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm"
                      value={formData.perfil}
                      onChange={e => setFormData({...formData, perfil: e.target.value as any})}
                    >
                      <option value="Administrador">Administrador</option>
                      <option value="Simples">Simples (USER)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                    <select 
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-black text-slate-800 outline-none focus:border-blue-500 transition-all text-sm"
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value as any})}
                    >
                      <option value="Ativo">Ativo</option>
                      <option value="Inativo">Inativo</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] border-b pb-2">Acesso a Módulos</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PermissionToggle label="Disparos" field="disparo" />
                    <PermissionToggle label="Calendário" field="calendario" />
                    <PermissionToggle label="Comunicados" field="comunicado" />
                    <PermissionToggle label="Auditoria / Log" field="log" />
                    <PermissionToggle label="Gestão Usuários" field="usuario_mod" />
                    <PermissionToggle label="Ajustes Sistema" field="ajuste" />
                    <PermissionToggle label="Manual Ajuda" field="ajuda" />
                    <PermissionToggle label="Cadastro de Encontrista" field="cadastro" />
                    <PermissionToggle label="Inscrições Prioritárias" field="prioritarios" />
                    <PermissionToggle label="Distribuição de Círculos" field="circulos" />
                    <PermissionToggle label="Controle de Presença" field="presenca" />
                    <PermissionToggle label="Cadastro Encontreiro" field="encontreiro" />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em] border-b pb-2">Ações de Escrita</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PermissionToggle label="Pode Criar (Inclusão)" field="inclusao" />
                    <PermissionToggle label="Pode Editar (Alteração)" field="alteracao" />
                    <PermissionToggle label="Pode Ver (Visualização)" field="visualizacao" />
                    <PermissionToggle label="Pode Apagar (Exclusão)" field="exclusao" />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] border-b pb-2">CRUD Cadastro Encontreiro</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PermissionToggle label="Encontreiro: Criar" field="encontreiro_inclusao" />
                    <PermissionToggle label="Encontreiro: Editar" field="encontreiro_alteracao" />
                    <PermissionToggle label="Encontreiro: Visualizar" field="encontreiro_visualizacao" />
                    <PermissionToggle label="Encontreiro: Excluir" field="encontreiro_exclusao" />
                  </div>
                </div>
              </div>

              <div className="px-8 py-8 bg-slate-50 border-t flex flex-col md:flex-row gap-3">
                <button 
                  type="submit" 
                  disabled={isLoading} 
                  className="w-full blue-gradient text-white px-10 py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all tracking-[0.2em]"
                >
                  {isLoading ? 'SINCRONIZANDO...' : isEditing ? 'ATUALIZAR NA NUVEM' : 'CRIAR ACESSO SEGURO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EXCLUSÃO */}
      {isDeleteModalOpen && userToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500 border-4 border-white shadow-xl">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <p className="text-slate-900 font-black text-xl uppercase tracking-tighter">Remover Acesso?</p>
                <p className="text-slate-500 text-sm font-medium mt-2 leading-relaxed px-4">Confirmar a exclusão permanente do usuário <b>{userToDelete.name}</b>?</p>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={executeDelete} disabled={isLoading} className="w-full bg-red-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all">{isLoading ? 'Processando...' : 'SIM, EXCLUIR'}</button>
                <button onClick={() => { setIsDeleteModalOpen(false); setUserToDelete(null); }} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest">CANCELAR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;

