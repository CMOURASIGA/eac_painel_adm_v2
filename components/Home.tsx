import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User, View } from '../types.ts';
import { getJson } from '../services/eacApiClient.ts';

export type HomeNavigateFilters = Record<string, string>;

interface HomeProps {
  user: User;
  onNavigate: (view: View, filters?: HomeNavigateFilters) => void;
  lastSync?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

type Tab = 'adolescentes' | 'encontreiros' | 'priorizados' | 'presencas';

interface AgeRow {
  idade: number;
  masculino: number;
  feminino: number;
  total: number;
}

interface FaixaRow {
  faixa: string;
  total: number;
  masculino: number;
  feminino: number;
}

interface HomeData {
  encontros: Array<{ id: string; nome: string; numero?: string | number; status: string }>;
  encontroSelecionadoId: string;
  adolescentes: {
    total: number;
    masculino: number;
    feminino: number;
    distribuicaoPorIdade: AgeRow[];
    cadastrosIncompletos: number;
    criterios: string;
  };
  encontreiros: {
    total: number;
    masculino: number;
    feminino: number;
    porFaixaEtaria: FaixaRow[];
    origem: { comOrigemEncontrista: number; semOrigemEncontrista: number };
    criterios: string;
  };
  priorizados: {
    encontroId: string | null;
    total: number;
    capacidadeTotal: number;
    masculino: number;
    capacidadeMasculino: number;
    feminino: number;
    capacidadeFeminino: number;
    distribuicaoPorIdade: AgeRow[];
    visitacao: {
      total: number;
      porStatus: Record<string, number>;
      pendentes: number;
      concluidas: number;
      percentualConcluido: number;
    };
  };
  presencas: {
    tipoEvento: 'POS_ENCONTRO' | 'REUNIAO_CIRCULO';
    ano: string;
    eventosRealizados: number;
    presentes: number;
    participantesEsperados: number;
    ausentes: number;
    percentualPresenca: number | null;
    ranking: Array<{ nome: string; presencas: number; assiduidade: number | null }>;
  };
  atencao: Array<{ chave: string; total: number; label: string; view: View; filtros: HomeNavigateFilters }>;
}

const STATUS_VISITACAO_LABEL: Record<string, string> = {
  NENHUMA_ACAO: 'Nenhuma ação',
  CONTATO_INICIAL_FEITO: 'Deseja fazer',
  VISITACAO_REALIZADA: 'Visitação realizada',
  NAO_CONSEGUIU_CONTATO: 'Não conseguiu contato',
  AGUARDANDO_RETORNO: 'Aguardando retorno',
  NAO_DESEJA_VISITA: 'Não deseja fazer',
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'adolescentes', label: 'Adolescentes' },
  { id: 'encontreiros', label: 'Encontreiros' },
  { id: 'priorizados', label: 'Priorizados' },
  { id: 'presencas', label: 'Presenças' },
];

// Célula de indicador clicável: todo número apresentado deve permitir navegação
// para a tela responsável, já filtrada (ver docs "Reconstrução da Home", seção 2).
const Cell: React.FC<{ value: React.ReactNode; onClick?: () => void; className?: string }> = ({ value, onClick, className }) => {
  if (!onClick) return <span className={className}>{value}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hover:underline hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded ${className || ''}`}
      title="Ver registros deste indicador"
    >
      {value}
    </button>
  );
};

const InfoCriterios: React.FC<{ texto: string }> = ({ texto }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest"
      >
        ⓘ Critérios
      </button>
      {open && (
        <div className="absolute z-10 mt-2 w-72 md:w-96 p-4 bg-slate-900 text-slate-100 text-xs font-medium rounded-2xl shadow-xl leading-relaxed right-0">
          {texto}
        </div>
      )}
    </div>
  );
};

const SyncHeader: React.FC<{ lastSync?: string; isLoading?: boolean; onRefresh?: () => void }> = ({ lastSync, isLoading, onRefresh }) => {
  const erro = false; // reservado para quando houver detecção real de falha de sincronização
  const dotColor = erro ? 'bg-red-500' : isLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500';
  const label = erro ? 'Falha na sincronização' : isLoading ? 'Sincronizando...' : 'Sincronizado';
  const textColor = erro ? 'text-red-600' : 'text-slate-500';

  return (
    <div className={`flex items-center gap-2 ${erro ? 'font-black' : 'font-bold'}`}>
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      <span className={`text-xs ${textColor}`}>{label}</span>
      {!isLoading && lastSync && <span className="text-[11px] text-slate-400">· Última atualização: {lastSync}</span>}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="ml-1 p-1.5 text-blue-600 hover:bg-blue-50 rounded-full transition-colors active:rotate-180 duration-500"
          title="Atualizar agora"
        >
          <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}
    </div>
  );
};

const Home: React.FC<HomeProps> = ({ user, onNavigate, lastSync, onRefresh, isLoading }) => {
  const [activeTab, setActiveTab] = useState<Tab>('adolescentes');
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [encontroId, setEncontroId] = useState('');
  const [tipoEvento, setTipoEvento] = useState<'POS_ENCONTRO' | 'REUNIAO_CIRCULO'>('POS_ENCONTRO');

  const fetchHome = useCallback(async (params: { encontroId?: string; tipoEvento?: string } = {}) => {
    setLoading(true);
    setError('');
    try {
      const search = new URLSearchParams();
      if (params.encontroId) search.set('encontroId', params.encontroId);
      if (params.tipoEvento) search.set('tipoEvento', params.tipoEvento);
      const suffix = search.toString();
      const r = await getJson<HomeData>(`/api/dashboard/home${suffix ? `?${suffix}` : ''}`);
      if (!r.success) throw new Error(r.error || 'Não foi possível carregar os indicadores da Home.');
      const payload = r.data as any as HomeData;
      setData(payload);
      if (!params.encontroId) setEncontroId(payload.encontroSelecionadoId || '');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar os indicadores da Home.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!encontroId) return;
    fetchHome({ encontroId, tipoEvento });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encontroId, tipoEvento]);

  const openExternal = (url: string) => {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  };

  const quickAccess = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return [
      { label: 'Encontrista', desc: 'Formulário de inscrição', action: () => openExternal(`${origin}/inscricao/form`) },
      { label: 'Encontreiro', desc: 'Formulário de cadastro', action: () => openExternal(`${origin}/encontreiro/form`) },
      { label: 'Presença', desc: 'Registro de presença', action: () => openExternal(`${origin}/presenca/form`) },
      { label: 'Compra de Camisas', desc: 'Loja oficial do EAC', action: () => openExternal('https://webappcamisa.vercel.app/') },
    ];
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-slate-900">Painel Geral do EAC</h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">Acompanhamento operacional da base do EAC.</p>
        </div>
        <SyncHeader lastSync={lastSync} isLoading={isLoading} onRefresh={onRefresh} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-2xl p-4">{error}</div>
      )}

      {/* Indicadores do EAC */}
      <section className="bg-white rounded-[2rem] shadow-sm border border-slate-200">
        <div className="px-4 md:px-6 pt-5">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Indicadores do EAC</h2>
        </div>
        <div className="flex gap-1 px-4 md:px-6 mt-3 overflow-x-auto no-scrollbar border-b border-slate-100">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${
                activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-6">
          {loading && !data ? (
            <p className="text-sm text-slate-400 font-bold italic py-10 text-center">Carregando indicadores...</p>
          ) : !data ? null : (
            <>
              {activeTab === 'adolescentes' && (
                <AdolescentesTab data={data.adolescentes} onNavigate={onNavigate} />
              )}
              {activeTab === 'encontreiros' && (
                <EncontreirosTab data={data.encontreiros} onNavigate={onNavigate} />
              )}
              {activeTab === 'priorizados' && (
                <PriorizadosTab
                  data={data.priorizados}
                  encontros={data.encontros}
                  encontroId={encontroId}
                  onChangeEncontro={setEncontroId}
                  onNavigate={onNavigate}
                />
              )}
              {activeTab === 'presencas' && (
                <PresencasTab
                  data={data.presencas}
                  tipoEvento={tipoEvento}
                  onChangeTipoEvento={setTipoEvento}
                  onNavigate={onNavigate}
                />
              )}
            </>
          )}
        </div>
      </section>

      {/* Acessos rápidos */}
      <section>
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 px-2 mb-3">Acessos rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickAccess.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <p className="font-black text-slate-900 text-sm">{item.label}</p>
              <p className="text-[11px] text-slate-500 font-semibold mt-1">{item.desc}</p>
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-3">Abrir ↗</p>
            </button>
          ))}
        </div>
      </section>

      {/* Atenção */}
      {data && (
        <section className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-5">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-3">Atenção</h2>
          {data.atencao?.length ? (
            <div className="divide-y divide-slate-100">
              {data.atencao.map((item) => (
                <button
                  key={item.chave}
                  onClick={() => onNavigate(item.view, item.filtros)}
                  className="w-full flex items-center justify-between py-3 text-left hover:bg-slate-50 rounded-xl px-2 transition-colors"
                >
                  <span className="text-sm font-bold text-slate-700">
                    {item.total} {item.label}
                  </span>
                  <span className="text-slate-300">›</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 font-semibold italic">Nenhuma pendência no momento. Equipe EAC em dia.</p>
          )}
        </section>
      )}
    </div>
  );
};

// =========================================================================
// Aba 1 - Adolescentes
// =========================================================================
const AdolescentesTab: React.FC<{ data: HomeData['adolescentes']; onNavigate: HomeProps['onNavigate'] }> = ({ data, onNavigate }) => {
  const irParaTriagem = (filtros: HomeNavigateFilters) =>
    onNavigate('inscricoes_review', { status_excluir: 'PRIORIZADO,CONFIRMADO', ...filtros });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <IndicatorBlock label="Total de adolescentes" value={data.total} onClick={() => irParaTriagem({})} />
        <IndicatorBlock label="Masculino" value={data.masculino} onClick={() => irParaTriagem({ sexo: 'MASCULINO' })} />
        <IndicatorBlock label="Feminino" value={data.feminino} onClick={() => irParaTriagem({ sexo: 'FEMININO' })} />
      </div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Distribuição por idade</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">
                <th className="text-left pb-2">Idade</th>
                <th className="pb-2">Masculino</th>
                <th className="pb-2">Feminino</th>
                <th className="pb-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.distribuicaoPorIdade.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400 italic">Sem dados para os critérios atuais.</td></tr>
              )}
              {data.distribuicaoPorIdade.map((row) => (
                <tr key={row.idade} className="text-right">
                  <td className="text-left py-2 font-black text-slate-700">{row.idade} anos</td>
                  <td className="py-2"><Cell value={row.masculino} onClick={() => irParaTriagem({ idade_min: String(row.idade), idade_max: String(row.idade), sexo: 'MASCULINO' })} /></td>
                  <td className="py-2"><Cell value={row.feminino} onClick={() => irParaTriagem({ idade_min: String(row.idade), idade_max: String(row.idade), sexo: 'FEMININO' })} /></td>
                  <td className="py-2 font-black"><Cell value={row.total} onClick={() => irParaTriagem({ idade_min: String(row.idade), idade_max: String(row.idade) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <InfoCriterios texto={data.criterios} />
    </div>
  );
};

// =========================================================================
// Aba 2 - Encontreiros
// =========================================================================
const EncontreirosTab: React.FC<{ data: HomeData['encontreiros']; onNavigate: HomeProps['onNavigate'] }> = ({ data, onNavigate }) => {
  const irParaEncontreiros = (filtros: HomeNavigateFilters) => onNavigate('encontreiros', filtros);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <IndicatorBlock label="Total de encontreiros" value={data.total} onClick={() => irParaEncontreiros({})} />
        <IndicatorBlock label="Masculino" value={data.masculino} onClick={() => irParaEncontreiros({ sexo: 'masculino' })} />
        <IndicatorBlock label="Feminino" value={data.feminino} onClick={() => irParaEncontreiros({ sexo: 'feminino' })} />
      </div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Distribuição por faixa etária</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">
                <th className="text-left pb-2">Faixa etária</th>
                <th className="pb-2">Masculino</th>
                <th className="pb-2">Feminino</th>
                <th className="pb-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.porFaixaEtaria.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400 italic">Sem encontreiros cadastrados.</td></tr>
              )}
              {data.porFaixaEtaria.map((row) => (
                <tr key={row.faixa} className="text-right">
                  <td className="text-left py-2 font-black text-slate-700">{row.faixa}</td>
                  <td className="py-2"><Cell value={row.masculino} onClick={() => irParaEncontreiros({ faixaEtaria: row.faixa, sexo: 'masculino' })} /></td>
                  <td className="py-2"><Cell value={row.feminino} onClick={() => irParaEncontreiros({ faixaEtaria: row.faixa, sexo: 'feminino' })} /></td>
                  <td className="py-2 font-black"><Cell value={row.total} onClick={() => irParaEncontreiros({ faixaEtaria: row.faixa })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <IndicatorBlock
          label="Com origem encontrista"
          value={data.origem.comOrigemEncontrista}
          onClick={() => irParaEncontreiros({})}
          small
        />
        <IndicatorBlock
          label="Sem origem encontrista"
          value={data.origem.semOrigemEncontrista}
          onClick={() => irParaEncontreiros({})}
          small
        />
      </div>

      <InfoCriterios texto={data.criterios} />
    </div>
  );
};

// =========================================================================
// Aba 3 - Priorizados
// =========================================================================
const PriorizadosTab: React.FC<{
  data: HomeData['priorizados'];
  encontros: HomeData['encontros'];
  encontroId: string;
  onChangeEncontro: (id: string) => void;
  onNavigate: HomeProps['onNavigate'];
}> = ({ data, encontros, encontroId, onChangeEncontro, onNavigate }) => {
  const irParaPrioritarias = (filtros: HomeNavigateFilters) => onNavigate('inscricoes_prioritarias', filtros);
  const irParaVisitacao = (filtros: HomeNavigateFilters) => onNavigate('visitacao', { ...filtros, encontroId: encontroId || '' });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Encontro</label>
        <select
          value={encontroId}
          onChange={(e) => onChangeEncontro(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
        >
          {encontros.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}{e.numero ? ` (${e.numero})` : ''} {e.status === 'ATIVO' ? '· Ativo' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <IndicatorBlock
          label="Priorizados"
          value={`${data.total} / ${data.capacidadeTotal}`}
          onClick={() => irParaPrioritarias({})}
        />
        <IndicatorBlock
          label="Masculino"
          value={`${data.masculino} / ${data.capacidadeMasculino}`}
          onClick={() => irParaPrioritarias({ sexo: 'masculino' })}
        />
        <IndicatorBlock
          label="Feminino"
          value={`${data.feminino} / ${data.capacidadeFeminino}`}
          onClick={() => irParaPrioritarias({ sexo: 'feminino' })}
        />
      </div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Distribuição por idade</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">
                <th className="text-left pb-2">Idade</th>
                <th className="pb-2">Masculino</th>
                <th className="pb-2">Feminino</th>
                <th className="pb-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.distribuicaoPorIdade.map((row) => (
                <tr key={row.idade} className="text-right">
                  <td className="text-left py-2 font-black text-slate-700">{row.idade} anos</td>
                  <td className="py-2"><Cell value={row.masculino} onClick={() => irParaPrioritarias({ idade: String(row.idade), sexo: 'masculino' })} /></td>
                  <td className="py-2"><Cell value={row.feminino} onClick={() => irParaPrioritarias({ idade: String(row.idade), sexo: 'feminino' })} /></td>
                  <td className="py-2 font-black"><Cell value={row.total} onClick={() => irParaPrioritarias({ idade: String(row.idade) })} /></td>
                </tr>
              ))}
              <tr className="text-right font-black bg-slate-50">
                <td className="text-left py-2">Total</td>
                <td className="py-2">{data.masculino}</td>
                <td className="py-2">{data.feminino}</td>
                <td className="py-2">{data.total}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Visitação</h3>
          <button onClick={() => irParaVisitacao({})} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">
            Ver visitação completa →
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(Object.keys(data.visitacao.porStatus) as Array<string>).map((status) => (
            <IndicatorBlock
              key={status}
              label={STATUS_VISITACAO_LABEL[status] || status}
              value={data.visitacao.porStatus[status]}
              onClick={() => irParaVisitacao({ status })}
              small
            />
          ))}
        </div>
        <p className="text-xs font-bold text-slate-500 mt-3">
          {data.visitacao.concluidas} concluídas de {data.visitacao.total} priorizados · {data.visitacao.percentualConcluido}% concluído
        </p>
      </div>
    </div>
  );
};

// =========================================================================
// Aba 4 - Presenças
// =========================================================================
const PresencasTab: React.FC<{
  data: HomeData['presencas'];
  tipoEvento: 'POS_ENCONTRO' | 'REUNIAO_CIRCULO';
  onChangeTipoEvento: (t: 'POS_ENCONTRO' | 'REUNIAO_CIRCULO') => void;
  onNavigate: HomeProps['onNavigate'];
}> = ({ data, tipoEvento, onChangeTipoEvento, onNavigate }) => {
  const irParaPresenca = (filtros: HomeNavigateFilters) => onNavigate('presence', { tipoEvento, ...filtros });

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['POS_ENCONTRO', 'REUNIAO_CIRCULO'] as const).map((t) => (
          <button
            key={t}
            onClick={() => onChangeTipoEvento(t)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
              tipoEvento === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {t === 'POS_ENCONTRO' ? 'Pós-Encontro' : 'Reunião de Círculo'}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-black text-slate-400 uppercase tracking-widest self-center">Ano: {data.ano}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <IndicatorBlock label="Eventos realizados" value={data.eventosRealizados} onClick={() => irParaPresenca({})} />
        <IndicatorBlock label="Presentes" value={data.presentes} onClick={() => irParaPresenca({ presenca: 'presentes' })} />
        <IndicatorBlock label="Ausentes" value={data.ausentes} onClick={() => irParaPresenca({ presenca: 'faltantes' })} />
        <IndicatorBlock
          label="% de presença"
          value={data.percentualPresenca !== null ? `${data.percentualPresenca}%` : '-'}
          onClick={() => irParaPresenca({})}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Ranking {tipoEvento === 'POS_ENCONTRO' ? 'Pós-Encontro' : 'Reunião de Círculo'} · Top 5
          </h3>
          <button onClick={() => irParaPresenca({})} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">
            Ver ranking completo →
          </button>
        </div>
        {data.ranking.length === 0 ? (
          <p className="text-sm text-slate-400 font-semibold italic">Sem presenças registradas para este tipo de evento no ano selecionado.</p>
        ) : (
          <ol className="space-y-2">
            {data.ranking.map((r, i) => (
              <li key={`${r.nome}-${i}`} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2">
                <span className="font-bold text-slate-700 text-sm">{i + 1}. {r.nome}</span>
                <button
                  onClick={() => irParaPresenca({ nome: r.nome })}
                  className="text-xs font-black text-blue-700 hover:underline"
                >
                  {r.presencas} presenças{r.assiduidade !== null ? ` · ${r.assiduidade}% assiduidade` : ''}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

const IndicatorBlock: React.FC<{ label: string; value: React.ReactNode; onClick?: () => void; small?: boolean }> = ({ label, value, onClick, small }) => (
  <div className={`bg-slate-50 rounded-2xl border border-slate-100 ${small ? 'p-3' : 'p-5'} flex flex-col justify-between`}>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{label}</p>
    <Cell
      value={value}
      onClick={onClick}
      className={`font-black text-slate-900 tracking-tight ${small ? 'text-base mt-1' : 'text-2xl mt-2'}`}
    />
  </div>
);

export default Home;
