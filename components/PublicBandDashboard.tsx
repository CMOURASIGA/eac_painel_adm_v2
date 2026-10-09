import React, { useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../services/eacApiClient.ts';

type BandItem = {
  id: string;
  nome: string;
  telefone_mascarado: string;
  status: string;
  origem: string;
  criado_em?: string | null;
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

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const r = await postComunicadosAction<any>('GET_BANDA_RESPONSAVEIS_DASHBOARD', { token });
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
  }, [token]);

  const activeItems = useMemo(() => items.filter((item) => item.status !== 'DESISTIU'), [items]);

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-50"><p className="font-bold text-slate-500">Carregando inscrições...</p></div>;
  if (error) return <div className="min-h-screen grid place-items-center bg-slate-50 p-4"><div className="max-w-lg rounded-2xl border border-rose-200 bg-white p-7 text-center font-bold text-rose-700">{error}</div></div>;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-[28px] bg-[#0f1b33] p-6 text-white shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">Banda do EAC</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Interessados</h1>
              <p className="mt-1 text-sm text-white/70">Acompanhamento compartilhável para os responsáveis pela banda.</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center">
              <p className="text-3xl font-black">{total}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/70">inscritos ativos</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {['INSCRITO','CONTATADO','ENTROU_NA_BANDA','DESISTIU'].map((status) => (
            <div key={status} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-black text-slate-900">{counts[status] || 0}</p>
              <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-slate-500">{STATUS_LABEL[status]}</p>
            </div>
          ))}
        </section>

        {cabecaUrl ? (
          <a href={cabecaUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-purple-200 bg-purple-50 p-4 text-purple-900">
            <div>
              <p className="font-black">Cabeça do EAC</p>
              <p className="text-sm text-purple-700">Abrir o livro de músicas e repertórios.</p>
            </div>
            <span className="font-black">Abrir ↗</span>
          </a>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-black text-slate-900">Lista de interessados</h2>
            <p className="text-xs text-slate-500">Telefones são mascarados neste link compartilhável.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {activeItems.map((item) => (
              <div key={item.id} className="grid gap-1 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4">
                <div>
                  <p className="font-bold text-slate-900">{item.nome}</p>
                  <p className="text-xs text-slate-400">{item.telefone_mascarado}</p>
                </div>
                <span className="text-xs font-bold text-slate-500">{item.criado_em ? new Date(item.criado_em).toLocaleDateString('pt-BR') : '-'}</span>
                <span className="justify-self-start rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 sm:justify-self-end">{STATUS_LABEL[item.status] || item.status}</span>
              </div>
            ))}
            {activeItems.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-400">Nenhum interessado registrado.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default PublicBandDashboard;
