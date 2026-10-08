import React, { useEffect, useMemo, useState } from 'react';

type Term = {
  codigo: string;
  titulo: string;
  versao: string;
  obrigatorio: boolean;
  tipo_resposta: 'ACEITE' | 'SIM_NAO';
  resumo: string;
  texto: string;
};

type LoadState = {
  inscricao_id: string;
  status: string;
  ja_confirmada: boolean;
  adolescente: { nome: string; data_nascimento?: string | null };
  responsavel: { nome: string; email_mascarado?: string | null };
  termos: Term[];
};

const PublicInscricaoConfirmacao: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<LoadState | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/inscricoes/create?resource=confirmacao&token=' + encodeURIComponent(token));
        const body = await response.json();
        if (!response.ok || !body?.success) throw new Error(body?.message || 'Não foi possível carregar a confirmação.');
        setData(body.data);
        if (body.data?.ja_confirmada) setDone(true);
      } catch (e: any) {
        setError(e?.message || 'Não foi possível carregar a confirmação.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const canSubmit = useMemo(() => {
    if (!data || data.ja_confirmada) return false;
    return data.termos.every((term) => {
      const value = String(responses[term.codigo] || '').toUpperCase();
      if (term.tipo_resposta === 'SIM_NAO') return value === 'SIM' || value === 'NAO';
      if (term.obrigatorio) return value === 'ACEITO';
      return true;
    });
  }, [data, responses]);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/inscricoes/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirmar_responsavel', token, respostas: responses }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.message || 'Não foi possível concluir a inscrição.');
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível concluir a inscrição.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 grid place-items-center p-4"><p className="font-bold text-slate-600">Carregando confirmação...</p></div>;
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center p-4">
        <div className="max-w-lg rounded-3xl border border-rose-200 bg-white p-8 text-center shadow">
          <h1 className="text-2xl font-black text-slate-900">Não foi possível abrir este link</h1>
          <p className="mt-3 text-rose-700 font-semibold">{error}</p>
          <p className="mt-4 text-sm text-slate-500">Entre em contato com a equipe do EAC para solicitar um novo envio.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#eef4ff] via-[#f8fafc] to-[#eef2f7] grid place-items-center p-4">
        <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-black">✓</div>
          <h1 className="text-3xl font-black text-emerald-700">Inscrição confirmada</h1>
          <p className="mt-4 text-slate-700">A confirmação do responsável foi registrada e a inscrição foi concluída.</p>
          <p className="mt-2 text-sm text-slate-500">Obrigado por confiar no EAC.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eef4ff] via-[#f8fafc] to-[#eef2f7] py-8 px-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-[28px] border border-slate-200 bg-white shadow overflow-hidden">
          <div className="bg-[#044372] px-8 py-7 text-center">
            <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" className="h-16 mx-auto" />
          </div>
          <div className="p-6 md:p-8">
            <h1 className="text-3xl font-black text-slate-900 text-center">Confirmação do responsável</h1>
            <p className="mt-2 text-center text-slate-600">Leia os termos abaixo e confirme para concluir a inscrição.</p>

            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs uppercase tracking-widest font-black text-blue-700">Inscrição</p>
              <p className="mt-1 text-lg font-black text-slate-900">{data?.adolescente?.nome || '-'}</p>
              <p className="text-sm text-slate-600">Responsável: {data?.responsavel?.nome || '-'}</p>
              {data?.responsavel?.email_mascarado ? <p className="text-sm text-slate-600">E-mail: {data.responsavel.email_mascarado}</p> : null}
            </div>

            <div className="mt-6 space-y-4">
              {(data?.termos || []).map((term) => {
                const value = responses[term.codigo] || '';
                const activeYes = value === 'SIM';
                const activeNo = value === 'NAO';
                return (
                  <section key={term.codigo} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{term.titulo}{term.obrigatorio ? ' *' : ''}</p>
                        <p className="mt-1 text-xs text-slate-500">Versão {term.versao}</p>
                        <p className="mt-2 text-sm text-slate-600">{term.resumo}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [term.codigo]: !prev[term.codigo] }))}
                        className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700"
                      >
                        {expanded[term.codigo] ? 'Fechar' : 'Ler termo'}
                      </button>
                    </div>

                    {expanded[term.codigo] ? (
                      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 whitespace-pre-line">
                        {term.texto}
                      </div>
                    ) : null}

                    {term.tipo_resposta === 'SIM_NAO' ? (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setResponses((prev) => ({ ...prev, [term.codigo]: 'SIM' }))}
                          className={'rounded-xl border px-4 py-3 text-sm font-black ' + (activeYes ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-700')}
                        >
                          Sim, autorizo
                        </button>
                        <button
                          type="button"
                          onClick={() => setResponses((prev) => ({ ...prev, [term.codigo]: 'NAO' }))}
                          className={'rounded-xl border px-4 py-3 text-sm font-black ' + (activeNo ? 'border-rose-600 bg-rose-50 text-rose-700' : 'border-slate-300 text-slate-700')}
                        >
                          Não autorizo
                        </button>
                      </div>
                    ) : (
                      <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                        <input
                          type="checkbox"
                          checked={value === 'ACEITO'}
                          onChange={(e) => setResponses((prev) => ({ ...prev, [term.codigo]: e.target.checked ? 'ACEITO' : '' }))}
                          className="mt-1 h-5 w-5"
                        />
                        <span className="text-sm font-semibold text-slate-700">Li o termo completo e estou de acordo.</span>
                      </label>
                    )}
                  </section>
                );
              })}
            </div>

            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Ao confirmar, o sistema registrará a versão dos termos, suas respostas e a data/hora da confirmação vinculadas a esta inscrição.
            </div>

            {error ? <p className="mt-4 text-sm font-bold text-rose-700">{error}</p> : null}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || submitting}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#0a4a86] to-[#1f64bb] px-4 py-4 font-black uppercase tracking-wide text-white disabled:opacity-40"
            >
              {submitting ? 'Confirmando...' : 'Confirmar e concluir inscrição'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicInscricaoConfirmacao;
