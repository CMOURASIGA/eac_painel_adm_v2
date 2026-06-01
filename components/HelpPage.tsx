import React, { useEffect, useState } from 'react';
import { postComunicadosAction } from '../services/eacApiClient.ts';

const HelpPage: React.FC = () => {
  const [contextualModules, setContextualModules] = useState<Record<string, { title: string; quickGuide: string[] }>>({});
  const [activeTab, setActiveTab] = useState<'visao' | 'disparos' | 'modulos'>('visao');

  useEffect(() => {
    const load = async () => {
      const r = await postComunicadosAction<any>('GET_CONTEXT_HELP', {});
      if (r.success && (r.data as any)?.modules) {
        setContextualModules((r.data as any).modules);
      }
    };
    void load();
  }, []);

  const routines = [
    {
      title: 'Dashboard (Inicio)',
      desc: 'Visao geral com KPIs e eventos vindos das APIs internas conectadas ao Supabase.',
    },
    {
      title: 'Cadastro de Encontrista',
      desc: 'Gestao da base no Supabase com filtros, edicao, integracao com nao inscritos e rastreabilidade.',
    },
    {
      title: 'Inscricoes Prioritarias',
      desc: 'Triagem operacional com filtros por botao Pesquisar, detalhamento e acao de priorizacao.',
    },
    {
      title: 'Presenca',
      desc: 'Check-in por telefone/cartao, filtros com botao Pesquisar e exportacao com dados do Supabase.',
    },
    {
      title: 'Disparos e Logs',
      desc: 'Disparos com controle de duplicidade e logs de execucao/destinatarios gravados no Supabase.',
    },
    {
      title: 'Calendario',
      desc: 'CRUD de agenda no Supabase, importacao de Externos 2026 e agenda semanal com bloqueio por semana.',
    },
  ];

  const dispatchMap = [
    {
      title: '1) Disparo e acionado no frontend',
      lines: [
        'A tela Disparos monta payload com tipo de envio e filtros.',
        'A chamada segue para /api/comunicados via callApiProxy.',
      ],
    },
    {
      title: '2) Backend valida permissao e acao',
      lines: [
        'A API valida modulo/comportamento antes de executar.',
        'Somente perfil com permissao de disparo segue para processamento.',
      ],
    },
    {
      title: '3) Origem de dados usada na selecao',
      lines: [
        'Fluxo principal: Supabase (tabelas operacionais).',
        'Fluxos legados pontuais: Google Script (code.gs).',
      ],
    },
    {
      title: '4) Regras de segmentacao de destinatarios',
      lines: [
        'Filtros por status, periodo, priorizacao e campos de contato.',
        'Regra de negocio aplicada no backend antes do envio.',
      ],
    },
    {
      title: '5) Execucao e controle de duplicidade',
      lines: [
        'Execucao registra status operacional da rotina.',
        'Motor evita reprocessar o mesmo contexto sem controle.',
      ],
    },
    {
      title: '6) Auditoria e rastreabilidade',
      lines: [
        'Logs de execucao e resultado ficam gravados no Supabase.',
        'Tela de Logs consolida status, erros e volume processado.',
      ],
    },
    {
      title: '7) Padrao legado do code.gs',
      lines: [
        'No legado, regras consultavam colunas de planilha e status de envio.',
        'Hoje existe operacao hibrida: principal no backend + compatibilidade legada.',
      ],
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700 pb-24">
      <header className="text-center space-y-6">
        <div className="inline-flex items-center space-x-2 bg-blue-100 text-blue-800 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-blue-200">
          Manual Operacional
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight uppercase">Fluxo Atual do Sistema</h2>
        <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">
          O painel usa APIs internas como camada de negocio e o Supabase como origem principal de dados.
        </p>
      </header>

      <section className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setActiveTab('visao')} className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border ${activeTab === 'visao' ? 'blue-gradient text-white border-transparent' : 'bg-white text-slate-700 border-slate-200'}`}>
            Visao Geral
          </button>
          <button onClick={() => setActiveTab('disparos')} className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border ${activeTab === 'disparos' ? 'blue-gradient text-white border-transparent' : 'bg-white text-slate-700 border-slate-200'}`}>
            Mapa de Disparos
          </button>
          <button onClick={() => setActiveTab('modulos')} className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border ${activeTab === 'modulos' ? 'blue-gradient text-white border-transparent' : 'bg-white text-slate-700 border-slate-200'}`}>
            Ajuda por Modulo
          </button>
        </div>

        {activeTab === 'visao' && (
          <div className="space-y-8">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-1 blue-gradient rounded-full"></div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">Dicionario de Rotinas</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {routines.map((r, i) => (
                <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-200 hover:border-blue-500 transition-all hover:shadow-xl group">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-3">{r.title}</h4>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'disparos' && (
          <div className="space-y-8">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-1 blue-gradient rounded-full"></div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">Mapa Operacional de Disparos</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {dispatchMap.map((item, idx) => (
                <div key={idx} className="bg-white p-8 rounded-[2rem] border border-slate-200">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-3">{item.title}</h4>
                  <ul className="space-y-2 text-xs text-slate-600 font-medium">
                    {item.lines.map((line, lineIdx) => (
                      <li key={`${idx}-${lineIdx}`}>- {line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'modulos' && (
          <div className="space-y-8">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-1 blue-gradient rounded-full"></div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">Ajuda Contextual por Modulo</h3>
            </div>
            {Object.keys(contextualModules).length === 0 ? (
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 text-xs text-slate-500 font-semibold">
                Nenhum conteudo contextual retornado pela API.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(contextualModules).map(([moduleName, data]) => (
                  <div key={moduleName} className="bg-white p-8 rounded-[2rem] border border-slate-200">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-3">{data.title}</h4>
                    <ul className="space-y-2 text-xs text-slate-600 font-medium">
                      {(Array.isArray(data.quickGuide) ? data.quickGuide : []).map((line, idx) => (
                        <li key={`${moduleName}-${idx}`}>- {line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default HelpPage;
