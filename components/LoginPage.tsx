
import React, { useState } from "react";
import type { User, View } from "../types"; // ajuste o caminho conforme sua estrutura
// import type { UserRole } from "../types"; // só se você realmente usa UserRole aqui

// resto do arquivo...



interface LoginPageProps {
  onLogin: (user: User) => void;
  googleWebAppUrl: string;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, googleWebAppUrl }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const LOGO_URL = "https://i.imgur.com/c5XQ7TW.png";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
      if (isLocalhost && email === 'admin@eac.com' && password === 'admin123') {
        const devUser: User = {
          id: 'dev-admin',
          name: 'Admin Local',
          email,
          role: 'ADMIN',
          status: 'Ativo',
          permissions: {
            canCreate: true,
            canEdit: true,
            canView: true,
            canDelete: true,
            allowedModules: ['dashboard','dispatches','calendar','comunicados','logs','users','settings','help','members','inscricoes_prioritarias','inscricoes_prioritarias_circulos','encontreiros','presence'],
            modulePermissions: {
              encontreiros: { canCreate: true, canEdit: true, canView: true, canDelete: true }
            }
          }
        };
        onLogin(devUser);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/comunicados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'USER_LOGIN',
          googleWebAppUrl,
          data: {
            email: email,
            password: password,
          }
        })
      });

      const result = await response.json();

      if (result.success && result.user) {
        const u = result.user;
        const isAdmin = u.perfil === 'Administrador';
        const allowedModules: View[] = ['dashboard'];
        const boolSim = (v: any) => String(v || '').trim().toLowerCase() === 'sim';
        const pushUnique = (module: View) => {
          if (!allowedModules.includes(module)) allowedModules.push(module);
        };

        if (isAdmin || boolSim(u.disparo)) pushUnique('dispatches');
        if (isAdmin || boolSim(u.calendario)) pushUnique('calendar');
        if (isAdmin || boolSim(u.comunicado)) pushUnique('comunicados');
        if (isAdmin || boolSim(u.log)) pushUnique('logs');
        if (isAdmin || boolSim(u.usuario_mod)) pushUnique('users');
        if (isAdmin || boolSim(u.ajuste)) pushUnique('settings');
        if (isAdmin || boolSim(u.ajuda)) pushUnique('help');
        if (isAdmin || boolSim(u.cadastro)) {
          pushUnique('members');
        }
        const hasPrioritariosConfigured = String(u.prioritarios || '').trim() !== '';
        if (isAdmin || boolSim(u.prioritarios) || (!hasPrioritariosConfigured && boolSim(u.cadastro))) {
          pushUnique('inscricoes_prioritarias');
        }
        const hasCirculosConfigured = String(u.circulos || '').trim() !== '';
        if (isAdmin || boolSim(u.circulos) || (!hasCirculosConfigured && (boolSim(u.prioritarios) || boolSim(u.cadastro)))) {
          pushUnique('inscricoes_prioritarias_circulos');
        }
        const hasPresencaConfigured = String(u.presenca || '').trim() !== '';
        if (isAdmin || boolSim(u.presenca) || (!hasPresencaConfigured && boolSim(u.cadastro))) {
          pushUnique('presence');
        }

        const hasEncontreiroAccessConfigured = String(u.encontreiro || '').trim() !== '';
        if (isAdmin || boolSim(u.encontreiro) || (!hasEncontreiroAccessConfigured && boolSim(u.cadastro))) {
          pushUnique('encontreiros');
        }

        const authenticatedUser: User = {
          id: u.id || new Date().getTime().toString(), // Ensure ID exists
          name: u.usuario,
          email: u.usuario,
          role: isAdmin ? 'ADMIN' : 'VIEWER',
          status: u.status || 'Ativo',
          permissions: {
            canCreate: isAdmin || boolSim(u.inclusao),
            canEdit: isAdmin || boolSim(u.alteracao),
            canView: isAdmin || boolSim(u.visualizacao),
            canDelete: isAdmin || boolSim(u.exclusao),
            allowedModules,
            modulePermissions: {
              encontreiros: {
                canCreate: isAdmin || boolSim(u.encontreiro_inclusao) || (!String(u.encontreiro_inclusao || '').trim() && boolSim(u.inclusao)),
                canEdit: isAdmin || boolSim(u.encontreiro_alteracao) || (!String(u.encontreiro_alteracao || '').trim() && boolSim(u.alteracao)),
                canView: isAdmin || boolSim(u.encontreiro_visualizacao) || (!String(u.encontreiro_visualizacao || '').trim() && boolSim(u.visualizacao)),
                canDelete: isAdmin || boolSim(u.encontreiro_exclusao) || (!String(u.encontreiro_exclusao || '').trim() && boolSim(u.exclusao)),
              }
            }
          }
        };

        if (authenticatedUser.status === 'Inativo') {
          setError('Sua conta está inativa. Entre em contato com o administrador.');
          setLoading(false);
          return;
        }

        onLogin(authenticatedUser);

      } else {
        setError(result.error || 'Acesso negado. Credenciais inválidas.');
        setLoading(false);
      }
    } catch (err) {
      setError('Erro de conexão. Verifique sua rede e tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen blue-gradient flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="w-full max-w-lg relative z-10 animate-in fade-in slide-in-from-bottom-12 duration-1000">
        <div className="bg-white rounded-[3rem] shadow-2xl p-12 md:p-16 border border-white/20">
          <div className="flex justify-center mb-10">
            <div className="blue-gradient p-5 rounded-[2rem] shadow-2xl rotate-12 hover:rotate-0 transition-transform border-4 border-white/10 flex items-center justify-center overflow-hidden">
              <img src={LOGO_URL} alt="EAC Logo" className="w-16 h-16 object-contain" />
            </div>
          </div>

          <div className="text-center mb-12">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Login Operacional</h1>
            <p className="text-slate-400 mt-3 font-bold uppercase tracking-[0.2em] text-[10px]">Painel de Gestão EAC</p>
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-100 p-6 mb-10 rounded-3xl text-center">
              <p className="text-sm text-red-700 font-black">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Usuário</label>
              <input type="text" required className="w-full px-8 py-5 rounded-3xl border-2 border-blue-900/10 bg-[#0f172a] font-bold text-white outline-none focus:border-blue-600 transition-all" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Senha</label>
              <input type="password" required className="w-full px-8 py-5 rounded-3xl border-2 border-blue-900/10 bg-[#0f172a] font-bold text-white outline-none focus:border-blue-600 transition-all" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="w-full blue-gradient text-white font-black py-6 rounded-3xl shadow-2xl transition-all hover:-translate-y-1 active:scale-95 text-lg uppercase tracking-widest">
              {loading ? 'Aguarde...' : 'Acessar Painel'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
