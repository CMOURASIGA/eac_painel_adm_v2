
import React, { useState } from "react";
import type { User, View } from "../types"; // ajuste o caminho conforme sua estrutura
import { sanitizeTextDeep, toCleanString } from "../utils/textEncoding.ts";
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
  const MASCOTE_URL = "/mascote-eac.png";

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
            allowedModules: ['dashboard','dispatches','calendar','comunicados','logs','users','settings','help','members','inscricoes_prioritarias','inscricoes_prioritarias_circulos','visitacao','encontreiros','presence'],
            modulePermissions: {
              encontreiros: { canCreate: true, canEdit: true, canView: true, canDelete: true }
            }
          }
        };
        onLogin(devUser);
        setLoading(false);
        return;
      }

      const authResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const authResult = sanitizeTextDeep(await authResponse.json());

      if (authResult?.success && authResult?.user) {
        onLogin(authResult.user as User);
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

      const result = sanitizeTextDeep(await response.json());

      if (result.success && result.user) {
        const u = result.user;
        const isAdmin = u.perfil === 'Administrador';
        const allowedModules: View[] = ['dashboard'];
        const boolSim = (v: any) => toCleanString(v).toLowerCase() === 'sim';
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
        const hasPrioritariosConfigured = toCleanString(u.prioritarios) !== '';
        if (isAdmin || boolSim(u.prioritarios) || (!hasPrioritariosConfigured && boolSim(u.cadastro))) {
          pushUnique('inscricoes_prioritarias');
        }
        const hasCirculosConfigured = toCleanString(u.circulos) !== '';
        if (isAdmin || boolSim(u.circulos) || (!hasCirculosConfigured && (boolSim(u.prioritarios) || boolSim(u.cadastro)))) {
          pushUnique('inscricoes_prioritarias_circulos');
        }
        const hasVisitacaoConfigured = toCleanString((u as any).visitacao) !== '';
        if (isAdmin || boolSim((u as any).visitacao) || (!hasVisitacaoConfigured && boolSim(u.prioritarios))) {
          pushUnique('visitacao');
        }
        const hasPresencaConfigured = toCleanString(u.presenca) !== '';
        if (isAdmin || boolSim(u.presenca) || (!hasPresencaConfigured && boolSim(u.cadastro))) {
          pushUnique('presence');
        }

        const hasEncontreiroAccessConfigured = toCleanString(u.encontreiro) !== '';
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
                canCreate: isAdmin || boolSim(u.encontreiro_inclusao) || (!toCleanString(u.encontreiro_inclusao) && boolSim(u.inclusao)),
                canEdit: isAdmin || boolSim(u.encontreiro_alteracao) || (!toCleanString(u.encontreiro_alteracao) && boolSim(u.alteracao)),
                canView: isAdmin || boolSim(u.encontreiro_visualizacao) || (!toCleanString(u.encontreiro_visualizacao) && boolSim(u.visualizacao)),
                canDelete: isAdmin || boolSim(u.encontreiro_exclusao) || (!toCleanString(u.encontreiro_exclusao) && boolSim(u.exclusao)),
                canViewSensitive: isAdmin || boolSim(u.encontreiro_dados_sensiveis) || (!toCleanString(u.encontreiro_dados_sensiveis) && (boolSim(u.encontreiro_visualizacao) || boolSim(u.visualizacao))),
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

      <div className="w-full max-w-4xl relative z-10 animate-in fade-in slide-in-from-bottom-12 duration-1000">
        <div className="bg-white rounded-[3rem] shadow-2xl border border-white/20 overflow-hidden grid md:grid-cols-2">
          {/* Painel de marca, com a mascote parada ao lado do formulário */}
          <div className="blue-gradient relative flex flex-col p-10 pb-0 min-h-[300px] md:min-h-[600px] overflow-visible isolate">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/10 flex items-center justify-center overflow-hidden p-1.5 shrink-0">
                <img src={LOGO_URL} alt="EAC Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-white font-black text-lg tracking-tight">Painel EAC</span>
            </div>

            <div className="mt-8 pr-8">
              <h1 className="text-white font-black text-2xl md:text-[28px] leading-tight [text-wrap:balance]">
                Firmes na fé,<br />unidos no amor.
              </h1>
              <p className="text-white/75 text-sm leading-relaxed mt-2.5 max-w-[28ch]">
                Porciúncula de Sant'Ana — acesso da equipe do Encontro de Adolescentes com Cristo.
              </p>
            </div>

            <div className="mt-5 mr-8 inline-flex items-center gap-2 bg-white/12 border border-white/15 text-white text-[13px] font-bold px-3.5 py-2 rounded-full w-fit backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0" />
              Oi! Preenche aí que eu ajudo 👋
            </div>

            <div
              className="relative mt-auto self-end w-[58%] md:w-[64%] max-w-[300px] -mr-[10%] md:-mr-[12%] z-10 pointer-events-none"
              style={{ aspectRatio: '700 / 1050' }}
            >
              <div
                className="absolute left-[8%] right-[30%] bottom-[2%] h-[5%] rounded-full"
                style={{ background: 'radial-gradient(closest-side, rgba(0,0,0,0.32), transparent 75%)' }}
              />
              <img
                src={MASCOTE_URL}
                alt="Mascote da EAC apontando para o formulário de login"
                className="block w-full h-full object-contain object-bottom"
                style={{ filter: 'drop-shadow(0 16px 18px rgba(0,0,0,0.3))' }}
              />
            </div>
          </div>

          {/* Painel do formulário */}
          <div className="relative z-[1] p-10 md:p-14 flex flex-col justify-center">
            <p className="text-red-600 text-[11px] font-black uppercase tracking-[0.12em] mb-1.5">Acesso ao painel</p>
            <h2 className="text-slate-900 text-2xl font-black mb-8">Entrar na sua conta</h2>

            {error && (
              <div className="bg-red-50 border-2 border-red-100 p-5 mb-6 rounded-2xl text-center">
                <p className="text-xs text-red-700 font-black">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Usuário</label>
                <input type="text" required className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Senha</label>
                <input type="password" required className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="submit" disabled={loading} className="w-full blue-gradient text-white font-black py-4 rounded-2xl shadow-xl transition-all hover:-translate-y-0.5 active:scale-95 text-sm uppercase tracking-widest disabled:opacity-60">
                {loading ? 'Aguarde...' : 'Acessar Painel'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

