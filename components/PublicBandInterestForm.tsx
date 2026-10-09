import React, { useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../services/eacApiClient.ts';

type Candidate = {
  pessoa_id?: string | null;
  cadastro_oficial_id?: string | null;
  nome: string;
  telefone?: string;
  telefone_mascarado?: string;
};

const PublicBandInterestForm: React.FC = () => {
  const [active, setActive] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canSearch = useMemo(() => {
    const digits = query.replace(/\D/g, '');
    return digits.length >= 4 || query.trim().length >= 3;
  }, [query]);

  useEffect(() => {
    void (async () => {
      const r = await postComunicadosAction<any>('GET_BANDA_PUBLIC_CONFIG', {});
      if (!r.success) {
        setActive(false);
        setError(r.error || 'Não foi possível carregar o formulário.');
        return;
      }
      setActive((r.data as any)?.ativo !== false);
    })();
  }, []);

  useEffect(() => {
    if (!canSearch) {
      setCandidates([]);
      return;
    }
    const id = window.setTimeout(async () => {
      setSearching(true);
      setError('');
      const r = await postComunicadosAction<any>('SEARCH_BANDA_CANDIDATES', { query });
      setSearching(false);
      if (!r.success) {
        setCandidates([]);
        setError(r.error || 'Não foi possível pesquisar o cadastro.');
        return;
      }
      setCandidates(Array.isArray((r.data as any)?.items) ? (r.data as any).items : []);
    }, 350);
    return () => window.clearTimeout(id);
  }, [query, canSearch]);

  const choose = (candidate: Candidate) => {
    setSelected(candidate);
    setNome(candidate.nome || '');
    if (candidate.telefone) setTelefone(candidate.telefone);
    else if (/\d{8,}/.test(query.replace(/\D/g, ''))) setTelefone(query);
    setCandidates([]);
    setQuery(candidate.nome || '');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nome.trim() || telefone.replace(/\D/g, '').length < 8) {
      setError('Informe seu nome completo e um telefone válido.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const r = await postComunicadosAction<any>('SAVE_BANDA_INTEREST', {
      pessoa_id: selected?.pessoa_id || null,
      cadastro_oficial_id: selected?.cadastro_oficial_id || null,
      nome,
      telefone,
    });
    setSaving(false);
    if (!r.success) {
      setError(r.error || 'Não foi possível registrar o interesse.');
      return;
    }
    setMessage(String((r.data as any)?.message || 'Interesse registrado com sucesso.'));
  };

  if (active === null) {
    return <div className="min-h-screen grid place-items-center bg-[#fff9e8] p-4"><p className="font-bold text-slate-500">Carregando...</p></div>;
  }

  if (!active) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#fff9e8] p-4">
        <div className="w-full max-w-xl rounded-[28px] border border-amber-200 bg-white p-8 text-center shadow-sm">
          <div className="text-4xl">🎵</div>
          <h1 className="mt-4 text-2xl font-black text-slate-900">Interesse na Banda do EAC</h1>
          <p className="mt-3 text-slate-600">O formulário está fechado no momento.</p>
        </div>
      </div>
    );
  }

  if (message) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#fff9e8] p-4">
        <div className="w-full max-w-xl rounded-[28px] border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">✓</div>
          <h1 className="mt-4 text-2xl font-black text-emerald-700">Interesse registrado!</h1>
          <p className="mt-3 text-slate-600">{message}</p>
          <p className="mt-3 text-sm text-slate-500">Os responsáveis pela banda poderão entrar em contato com você.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fff9e8] to-[#f5f7fb] px-3 py-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-4 sm:py-8">
      <form onSubmit={submit} className="mx-auto w-full max-w-xl overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-lg sm:rounded-[30px]">
        <div className="bg-[#0f1b33] px-4 py-5 text-white sm:px-6 sm:py-7">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">EAC Porciúncula</p>
          <h1 className="mt-1 text-[26px] font-black leading-tight sm:text-3xl">Quero participar da Banda 🎶</h1>
          <p className="mt-2 text-sm text-white/80">Registre seu interesse para participar da equipe de música do EAC.</p>
        </div>

        <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-black">Já fez o EAC?</p>
            <p className="mt-1">Pesquise seu cadastro pelo nome ou telefone. Isso ajuda a evitar cadastro duplicado e agiliza o preenchimento.</p>
          </div>

          <div className="relative">
            <label className="mb-1.5 block text-sm font-black text-slate-800">Localizar meu cadastro</label>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Digite seu nome ou telefone"
              className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-blue-500"
            />
            {searching ? <p className="mt-2 text-xs font-bold text-slate-400">Pesquisando...</p> : null}
            {candidates.length > 0 ? (
              <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {candidates.map((candidate, index) => (
                  <button
                    type="button"
                    key={(candidate.pessoa_id || candidate.nome) + index}
                    onClick={() => choose(candidate)}
                    className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1 break-words font-bold text-slate-800">{candidate.nome}</span>
                    <span className="shrink-0 text-xs text-slate-400">{candidate.telefone_mascarado}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {selected ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Cadastro localizado</p>
              <p className="mt-1 font-bold text-emerald-900">{selected.nome}</p>
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-sm font-black text-slate-800">Nome completo *</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-black text-slate-800">Telefone / WhatsApp *</label>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(21) 99999-9999" className="h-12 w-full rounded-xl border border-slate-300 px-4 text-base outline-none focus:border-blue-500" />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
            Ao enviar, você registra seu interesse em participar da equipe de banda do EAC. O envio não representa convocação automática para a equipe.
          </div>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}

          <button type="submit" disabled={saving} className="h-13 w-full rounded-xl bg-[#0f1b33] px-5 py-4 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50">
            {saving ? 'Registrando...' : 'Registrar meu interesse'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PublicBandInterestForm;
