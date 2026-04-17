
import React from 'react';

const HelpPage: React.FC = () => {
  const routines = [
    {
      title: 'Dashboard (Início)',
      desc: 'Visão 360º da operação. Centraliza KPIs de membros, agenda ativa e o feed de auditoria em tempo real.',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
    },
    {
      title: 'Cadastro de Encontrista',
      desc: 'Gestão da base de encontristas com busca avançada, manutenção cadastral e integração com o fluxo de não inscritos.',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
    },
    {
      title: 'Inscrições Prioritárias',
      desc: 'Lista priorizada com filtros por pesquisa, detalhamento do cadastro e ações para distribuição de círculos.',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5h10M11 9h7M11 13h10M11 17h7M5 6v.01M5 10v.01M5 14v.01M5 18v.01"/></svg>
    },
    {
      title: 'Distribuição de Círculos',
      desc: 'Subtela com cards coloridos por círculo, divisão por sexo, contadores de equilíbrio e geração de imagem.',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16M8 4v16M16 4v16"/></svg>
    },
    {
      title: 'Cadastro Encontreiro',
      desc: 'Gestão dedicada em cards padronizados com filtros por pesquisa, exportação CSV e ações operacionais por registro.',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m1-12H8a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2zM9 4h6v4H9V4z"/></svg>
    },
    {
      title: 'Presença (Controle Operacional)',
      desc: 'Check-in por card e por telefone, filtros por nome/círculo/ano, indicadores sem duplicidade e resumo por círculo.',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
    },
    {
      title: 'Disparos (Operações)',
      desc: 'Execução de rotinas massivas: E-mail de Aniversariantes, Agenda da Semana e Comunicados Especiais (ID 99).',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    },
    {
      title: 'Calendário (Agenda)',
      desc: 'Planejamento de atividades paroquiais. Permite o controle de status (Confirmado/Agendado) para automação.',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
    },
    {
      title: 'Logs (Auditoria)',
      desc: 'Rastro operacional completo com histórico de execuções, respostas do backend e acompanhamento de ações críticas.',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
    }
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700 pb-24">
      {/* Hero Section */}
      <header className="text-center space-y-6">
        <div className="inline-flex items-center space-x-2 bg-blue-100 text-blue-800 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-blue-200">
          Manual de Operação Segura
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight uppercase">Entendendo o Sistema</h2>
        <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">
          O Painel EAC centraliza cadastro, priorização, distribuição de círculos, presença e disparos em um único fluxo seguro.
        </p>
      </header>

      {/* Objetivo Principal */}
      <section className="bg-white rounded-[3rem] p-8 md:p-12 border border-slate-200 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 blue-gradient opacity-5 rounded-full -mr-32 -mt-32"></div>
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
             <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">O Objetivo do Painel</h3>
             <p className="text-slate-600 leading-relaxed font-medium">
                Nossa missão é <strong>centralizar e proteger</strong>. Antes, os dados do EAC estavam espalhados em múltiplas planilhas de difícil acesso. 
                <br/><br/>
                Hoje, este painel serve como uma ponte segura que permite aos coordenadores executar tarefas críticas com poucos cliques: priorizar inscrições, distribuir círculos, controlar presença e disparar comunicações sem perder rastreabilidade.
             </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
                <p className="text-2xl font-black text-blue-600">100%</p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Auditável</p>
             </div>
             <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
                <p className="text-2xl font-black text-blue-600">ZERO</p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Duplicidade</p>
             </div>
             <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center col-span-2">
                <p className="text-2xl font-black text-blue-600">REAL-TIME</p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sincronização Cloud</p>
             </div>
          </div>
        </div>
      </section>

      {/* Dicionário de Rotinas */}
      <section className="space-y-8">
        <div className="flex items-center space-x-4">
           <div className="w-12 h-1 blue-gradient rounded-full"></div>
           <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">Dicionário de Rotinas</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {routines.map((r, i) => (
             <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-200 hover:border-blue-500 transition-all hover:shadow-xl group">
                <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-600 transition-all shadow-lg">
                   {r.icon}
                </div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-3">{r.title}</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">{r.desc}</p>
             </div>
           ))}
        </div>
      </section>

      {/* Protocolo de Segurança */}
      <section className="group">
        <div className="flex items-center space-x-6 mb-8">
          <div className="flex-shrink-0 w-16 h-16 blue-gradient text-white rounded-3xl flex items-center justify-center font-black text-2xl shadow-xl shadow-blue-200 group-hover:scale-110 transition-transform">
            !
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Protocolo Operação Segura</h3>
            <p className="text-slate-500 font-medium italic">A regra de ouro do operador</p>
          </div>
        </div>
        <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl space-y-6">
          <p className="text-blue-100 leading-relaxed font-medium opacity-90">
            Nenhuma ação destrutiva ou de disparo em massa é feita sem a <strong>Confirmação em Duas Etapas</strong>:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
               <span className="text-blue-400 font-black text-[10px] uppercase block mb-2">Etapa 01</span>
               <p className="text-sm">O sistema apresenta as regras da planilha para garantir que os dados de origem estão corretos.</p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
               <span className="text-blue-400 font-black text-[10px] uppercase block mb-2">Etapa 02</span>
               <p className="text-sm">O operador deve marcar o checkbox de ciência. Ao clicar em confirmar, seu nome é selado no log de auditoria.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="pt-16 border-t border-slate-200 text-center text-slate-400 space-y-4">
        <div className="flex justify-center space-x-6">
           <span className="text-[10px] font-black uppercase tracking-[0.3em]">Integridade</span>
           <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600">Eficiência</span>
           <span className="text-[10px] font-black uppercase tracking-[0.3em]">Comunidade</span>
        </div>
        <p className="text-[10px] font-medium">EAC - Painel Administrativo de Alta Performance | 2024</p>
      </footer>
    </div>
  );
};

export default HelpPage;
