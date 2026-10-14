import React, { useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../services/eacApiClient.ts';

type BandItem = {
  id: string;
  pessoa_id?: string | null;
  cadastro_oficial_id?: string | null;
  nome: string;
  telefone_mascarado: string;
  status: string;
  origem: string;
  criado_em?: string | null;
  cadastro_disponivel?: boolean;
};

type BandCadastroDetail = {
  cadastro_disponivel: boolean;
  interesse?: {
    id: string;
    nome: string;
    telefone: string;
    status: string;
    origem: string;
    criado_em?: string | null;
  };
  cadastro?: {
    nome?: string;
    nascimento?: string;
    idade?: string;
    sexo?: string;
    telefone?: string;
    email?: string;
    endereco?: string;
    bairro?: string;
    responsavel_nome?: string;
    responsavel_telefone?: string;
    responsavel_email?: string;
    tempo_paroquia?: string;
    participa_grupo?: string;
    motivacao?: string;
    expectativas?: string;
    pertence_porciuncula?: string;
    autoriza_imagem?: string;
    concorda_normas?: string;
  };
};

const STATUS_LABEL: Record<string, string> = {
  INSCRITO: 'Inscrito',
  CONTATADO: 'Contatado',
  ENTROU_NA_BANDA: 'Entrou na banda',
  DESISTIU: 'Desistiu',
};

const PublicBandDashboard: React.FC<{ token: string }> = ({ token }) => {
  const [items, setItems] = useState<BandItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cabecaUrl, setCabecaUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [selected, setSelected] = useState<BandItem | null>(null);
  const [detail, setDetail] = useState<BandCadastroDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const r = await postComunicadosAction<any>('GET_BANDA_RESPONSAVEIS_DASHBOARD', { token, query: appliedQuery });
      setLoading(false);
      if (!r.success) {
        setError(r.error || 'Não foi possível abrir o acompanhamento.');
        return;
      }
      const data: any = r.data;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total || 0));
      setCounts(data?.counts || {});
      setCabecaUrl(String(data?.cabeca_eac_url || ''));
    })();
  }, [token, appliedQuery]);

  const activeItems = useMemo(() => items.filter((item) => item.status !== 'DESISTIU'), [items]);
  const openCadastro = async (item: BandItem) => {
    setSelected(item);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    const r = await postComunicadosAction<any>('GET_BANDA_RESPONSAVEL_CADASTRO', { token, interesse_id: item.id });
    setDetailLoading(false);
    if (!r.success) {
      setDetailError(r.error || 'Não foi possível carregar os dados de cadastro.');
      return;
    }
    const data: any = r.data;
    if (data?.success === false) {
      setDetailError(data?.error || 'Não foi possível carregar os dados de cadastro.');
      return;
    }
    setDetail(data as BandCadastroDetail);
  };

  const closeCadastro = () => {
    setSelected(null);
    setDetail(null);
    setDetailError('');
    setDetailLoading(false);
  };

  const detailValue = (label: string, value: unknown) => (
    <div className="min-w-0 rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{String(value || '').trim() || 'Não informado'}</p>
    </div>
  );

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-50"><p className="font-bold text-slate-500">Carregando inscrições...</p></div>;
  if (error) return <div className="min-h-screen grid place-items-center bg-slate-50 p-4"><div className="max-w-lg rounded-2xl border border-rose-200 bg-white p-7 text-center font-bold text-rose-700">{error}</div></div>;

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-4 sm:py-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-[22px] bg-[#0f1b33] p-4 text-white shadow-sm sm:rounded-[28px] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">Banda do EAC</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[28px] font-black leading-tight sm:text-3xl">Interessados</h1>
              <p className="mt-1 text-sm text-white/70">Acompanhamento compartilhável para os responsáveis pela banda.</p>
            </div>
            <div className="w-full rounded-2xl bg-white/10 px-5 py-3 text-center sm:w-auto">
              <p className="text-3xl font-black">{total}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/70">inscritos ativos</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
          {['INSCRITO','CONTATADO','ENTROU_NA_BANDA','DESISTIU'].map((status) => (
            <div key={status} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
              <p className="text-2xl font-black text-slate-900">{counts[status] || 0}</p>
              <p className="mt-1 break-words text-[10px] font-black uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]">{STATUS_LABEL[status]}</p>
            </div>
          ))}
        </section>

        {cabecaUrl ? (
          <a href={cabecaUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-purple-900">
            <div>
              <p className="font-black">Cabeça do EAC</p>
              <p className="text-sm text-purple-700">Abrir o livro de músicas e repertórios.</p>
            </div>
            <span className="shrink-0 font-black">Abrir ↗</span>
          </a>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-black text-slate-900">Lista de interessados</h2>
                <p className="text-xs text-slate-500">Ordem alfabética. Telefones permanecem mascarados neste link compartilhável.</p>
              </div>
              <div className="w-full sm:max-w-sm">
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Pesquisar</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setAppliedQuery(query.trim());
                      }
                    }}
                    placeholder="Nome ou telefone"
                    inputMode="search"
                    className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base outline-none focus:border-blue-500 sm:h-11 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setAppliedQuery(query.trim())}
                    className="h-12 w-full shrink-0 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wide text-white sm:h-11 sm:w-auto"
                  >
                    Pesquisar
                  </button>
                </div>
                {appliedQuery ? (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setAppliedQuery(''); }}
                    className="mt-2 text-[11px] font-bold text-slate-500 hover:text-blue-700"
                  >
                    Limpar pesquisa
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {activeItems.map((item) => (
              <div key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4 sm:px-5">
                <div>
                  <p className="font-bold text-slate-900">{item.nome}</p>
                  <p className="text-xs text-slate-400">{item.telefone_mascarado}</p>
                </div>
                <span className="text-xs font-bold text-slate-500">{item.criado_em ? new Date(item.criado_em).toLocaleDateString('pt-BR') : '-'}</span>
                <span className="justify-self-start rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 sm:justify-self-end">{STATUS_LABEL[item.status] || item.status}</span>
                <button
                  type="button"
                  onClick={() => void openCadastro(item)}
                  className="h-10 justify-self-start rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-800 sm:justify-self-end"
                >
                  Ver cadastro
                </button>
              </div>
            ))}
            {activeItems.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">{appliedQuery ? 'Nenhum interessado encontrado para esta pesquisa.' : 'Nenhum interessado registrado.'}</p> : null}
          </div>
        </section>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[26px] bg-white shadow-2xl sm:rounded-[26px]">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Cadastro do adolescente</p>
                <h2 className="mt-1 truncate text-xl font-black text-slate-900">{selected.nome}</h2>
                <p className="mt-1 text-xs text-slate-500">Consulta disponível somente pelo link protegido dos responsáveis da banda.</p>
              </div>
              <button type="button" onClick={closeCadastro} className="h-10 shrink-0 rounded-xl border border-slate-300 px-3 text-sm font-black text-slate-700">Fechar</button>
            </header>

            <div className="space-y-5 p-5">
              {detailLoading ? <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">Carregando cadastro...</p> : null}
              {detailError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{detailError}</p> : null}

              {!detailLoading && !detailError && detail ? (
                detail.cadastro_disponivel && detail.cadastro ? (
                  <>
                    <section>
                      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Dados pessoais</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {detailValue('Nome completo', detail.cadastro.nome)}
                        {detailValue('Data de nascimento', detail.cadastro.nascimento)}
                        {detailValue('Idade', detail.cadastro.idade)}
                        {detailValue('Sexo', detail.cadastro.sexo)}
                        {detailValue('Telefone / WhatsApp', detail.cadastro.telefone)}
                        {detailValue('E-mail', detail.cadastro.email)}
                        {detailValue('Endereço', detail.cadastro.endereco)}
                        {detailValue('Bairro', detail.cadastro.bairro)}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Responsável</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {detailValue('Nome do responsável', detail.cadastro.responsavel_nome)}
                        {detailValue('Telefone do responsável', detail.cadastro.responsavel_telefone)}
                        {detailValue('E-mail do responsável', detail.cadastro.responsavel_email)}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Informações do cadastro</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {detailValue('Pertence à Porciúncula', detail.cadastro.pertence_porciuncula)}
                        {detailValue('Tempo de participação na paróquia', detail.cadastro.tempo_paroquia)}
                        {detailValue('Grupo / ministério', detail.cadastro.participa_grupo)}
                        {detailValue('Autorização de imagem', detail.cadastro.autoriza_imagem)}
                        {detailValue('Concorda com as normas', detail.cadastro.concorda_normas)}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Interesse e expectativa</h3>
                      <div className="mt-3 grid gap-3">
                        {detailValue('Motivação', detail.cadastro.motivacao)}
                        {detailValue('Expectativas', detail.cadastro.expectativas)}
                      </div>
                    </section>
                  </>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-black text-amber-900">Cadastro oficial não vinculado</p>
                    <p className="mt-1 text-sm text-amber-800">Este interesse existe na Banda, mas ainda não possui vínculo com um cadastro oficial do adolescente.</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {detailValue('Nome informado', detail.interesse?.nome)}
                      {detailValue('Telefone informado', detail.interesse?.telefone)}
                    </div>
                  </div>
                )
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default PublicBandDashboard;
