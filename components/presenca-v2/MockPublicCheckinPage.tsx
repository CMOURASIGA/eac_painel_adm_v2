import React, { useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../../services/eacApiClient.ts';

const action = async (name: string, data: any) => {
  const result = await postComunicadosAction<any>(name, data);
  if (!result.success) throw new Error(result.error || 'Não foi possível concluir o check-in.');
  return result.data as any;
};

const normalizeName = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');

const MockPublicCheckinPage: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [resultBanner, setResultBanner] = useState<{ title: string; detail: string; tone: 'success' | 'pending' } | null>(null);
  const [busy, setBusy] = useState(false);
  const token = new URLSearchParams(window.location.search).get('session') || 'mock-qr-mock-session-1';

  useEffect(() => { void action('PRESENCA_V2_GET_PUBLIC_SESSION', { token }).then((data) => setSession(data.session)).catch((error) => setMessage(error.message)); }, [token]);
  const matches = useMemo(() => {
    const filtered = (session?.people || [])
      .filter((person: any) => normalizeName(person.name).includes(normalizeName(query)));

    const grouped = new Map<string, any>();
    for (const person of filtered) {
      const key = normalizeName(person.name);
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { ...person, duplicateCount: 1 });
        continue;
      }

      const sameCircle = String(current.circle || '') === String(person.circle || '');
      const samePhone = String(current.phoneLast4 || '') === String(person.phoneLast4 || '');
      if (sameCircle && samePhone) {
        current.duplicateCount += 1;
      } else {
        grouped.set(`${key}::${person.id}`, { ...person, duplicateCount: 1 });
      }
    }

    return Array.from(grouped.values()).slice(0, 6);
  }, [session, query]);
  const selected = useMemo(() => (session?.people || []).find((person: any) => person.id === selectedId), [session, selectedId]);
  const selectedPhoneHint = selected?.hasPhone
    ? 'O telefone cadastrado foi preenchido abaixo. Confira e, se estiver incorreto, faça a correção antes de confirmar.'
    : 'Não há telefone cadastrado para esta pessoa. Informe o número e, após a confirmação, ele será incluído no cadastro.';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return setMessage('Selecione seu nome na lista para continuar.');
    if (selected.alreadyPresent) return setMessage('Sua presença já foi confirmada nesta reunião.');
    setBusy(true); setMessage('');
    try {
      const data = await action('PRESENCA_V2_PUBLIC_CHECKIN', { sessionId: session.id, personId: selected?.id || null, name: selected?.name || query, phone });
      const status = data.result?.status;
      if (status === 'CONFIRMED') {
        const phoneAdded = Boolean(data.result?.phoneAddedToProfile);
        setSession((current:any) => current ? ({
          ...current,
          people:(current.people||[]).map((person:any) => person.id === selected?.id ? {...person,alreadyPresent:true} : person),
          confirmedCount:Number(current.confirmedCount||0)+1,
        }) : current);
        setMessage(phoneAdded ? 'Presença confirmada e telefone incluído no cadastro.' : 'Presença confirmada nesta reunião.');
        setResultBanner({
          title: 'Presença confirmada',
          detail: phoneAdded
            ? 'Seu registro foi gravado e o telefone informado foi incluído no cadastro porque estava ausente.'
            : 'Seu registro foi gravado com sucesso nesta reunião.',
          tone: 'success'
        });
      } else if (status === 'ALREADY_PRESENT') {
        setSession((current:any) => current ? ({
          ...current,
          people:(current.people||[]).map((person:any) => person.id === selected?.id ? {...person,alreadyPresent:true} : person),
        }) : current);
        setMessage('Sua presença já foi confirmada nesta reunião.');
        setResultBanner({ title: 'Presença já confirmada', detail: 'Já existe um registro seu para esta reunião. Não é necessário registrar novamente.', tone: 'success' });
      } else if (status === 'NOT_ELIGIBLE') {
        setMessage('Seu nome não está entre os participantes habilitados para esta reunião. Procure o responsável.');
        setResultBanner(null);
      } else if (status === 'PENDING' || status === 'ALREADY_PENDING') {
        setMessage('Recebemos seu registro. A equipe administrativa fará a validação após o encerramento.');
        setResultBanner({ title: 'Registro de presença recebido', detail: 'Seu envio foi gravado e ficou aguardando validação administrativa.', tone: 'pending' });
      } else if (status === 'SESSION_CLOSED') {
        setMessage('Esta reunião já foi encerrada e não aceita novos registros de presença.');
        setResultBanner({
          title: 'Reunião encerrada',
          detail: 'O QR continua identificando esta reunião, mas novos check-ins não são mais permitidos.',
          tone: 'pending'
        });
      } else {
        setMessage('Não foi possível confirmar a presença.');
        setResultBanner(null);
      }
    } catch (error: any) { setMessage(error?.message || 'Não foi possível registrar.'); } finally { setBusy(false); }
  };

  if (!session) return <main className="mx-auto max-w-lg p-6"><p className="rounded-xl bg-white p-5 text-slate-700 shadow">{message || 'Carregando sessão…'}</p></main>;
  if (session.status !== 'ABERTA') return <main className="mx-auto max-w-lg p-6"><section className="rounded-2xl bg-white p-6 text-center shadow"><h1 className="text-xl font-black">Esta sessão não está aberta</h1><p className="mt-2 text-slate-600">Não recebemos novos check-ins depois do encerramento.</p></section></main>;

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8">
    <section className="mx-auto max-w-lg overflow-hidden rounded-3xl bg-white shadow-lg">
      <header className="bg-[#044372] p-7 text-white"><p className="text-xs font-black tracking-wider text-sky-200">CHECK-IN</p><h1 className="mt-1 text-2xl font-black">{session.title}</h1><p className="mt-2 text-sm text-sky-100">Confirme apenas sua própria presença.</p></header>
      <form onSubmit={submit} className="space-y-5 p-6">
        <p className="text-sm text-slate-600">Não há escolha de evento nesta tela: o QR já identifica a sessão aberta.</p>
        <label className="grid gap-1 text-sm font-bold text-slate-700">Digite parte do seu nome<input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(''); setPhone(''); }} autoComplete="off" className="rounded-xl border border-slate-300 px-3 py-3 text-base font-normal" /></label>
        {query && !selectedId && <div className="rounded-xl border border-slate-200">{matches.map((person: any) => <button type="button" key={person.id} disabled={person.alreadyPresent} onClick={() => { setSelectedId(person.id); setQuery(person.name); setPhone(person.phone || ''); }} className={`block w-full border-b border-slate-100 px-3 py-3 text-left text-sm last:border-0 ${person.alreadyPresent ? 'cursor-not-allowed bg-emerald-50 opacity-80' : 'hover:bg-slate-50'}`}>
          <span className="block font-semibold text-slate-800">{person.name}</span>
          {(person.circle || person.hasPhone || person.duplicateCount > 1) && <span className="mt-0.5 block text-xs text-slate-500">
            {person.circle ? `Círculo ${person.circle}` : 'Sem círculo identificado'}
            {person.hasPhone ? ` · telefone final ${person.phoneLast4}` : ' · sem telefone cadastrado'}
            {person.duplicateCount > 1 ? ` · cadastro duplicado detectado (${person.duplicateCount})` : ''}
            {person.alreadyPresent ? ' · presença já confirmada' : ''}
          </span>}
        </button>)}{matches.length === 0 && <p className="p-3 text-sm text-slate-500">Nome não encontrado entre os participantes habilitados para esta reunião. Procure o responsável.</p>}</div>}
        {selected && <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
          <div>Identidade selecionada: <strong>{selected.name}</strong>{selected.circle ? ` · círculo ${selected.circle}` : ''}</div>
          {selected.alreadyPresent
            ? <div className="mt-2 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">Presença já confirmada nesta reunião.</div>
            : <div className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ${selected.hasPhone ? 'bg-white/70 text-sky-900' : 'bg-amber-50 text-amber-800'}`}>{selectedPhoneHint}</div>}
        </div>}
        <label className="grid gap-1 text-sm font-bold text-slate-700">Confirme seu telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="numeric" placeholder="Somente números" className="rounded-xl border border-slate-300 px-3 py-3 text-base font-normal" /></label>
        <p className="text-xs text-slate-500">{selected?.hasPhone
          ? 'O telefone atual veio preenchido do cadastro. Se você alterar o número, a mudança será enviada para validação administrativa antes de substituir o cadastro.'
          : selected
            ? 'Como o cadastro está sem telefone, o número informado será incluído após a confirmação desta presença.'
            : 'Selecione seu nome para carregar o telefone cadastrado e o círculo correspondente.'}</p>
        <button disabled={busy || !selected || Boolean(selected?.alreadyPresent)} className="w-full rounded-xl bg-[#044372] px-4 py-3 font-black text-white disabled:opacity-50">{busy ? 'Enviando…' : selected?.alreadyPresent ? 'Presença já confirmada' : selected ? 'Confirmar presença' : 'Selecione seu nome'}</button>
        {message && <p className="rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-700">{message}</p>}
      </form>
    </section>
    {resultBanner && <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-4">
      <div className={`w-full max-w-sm rounded-3xl border bg-white p-6 text-center shadow-2xl ${resultBanner.tone === 'success' ? 'border-emerald-200' : 'border-amber-200'}`}>
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black ${resultBanner.tone === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>✓</div>
        <h2 className="mt-4 text-2xl font-black text-slate-900">{resultBanner.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{resultBanner.detail}</p>
        <button type="button" onClick={() => setResultBanner(null)} className="mt-5 w-full rounded-xl bg-[#044372] px-4 py-3 font-black text-white">OK</button>
      </div>
    </div>}
  </main>;
};

export default MockPublicCheckinPage;
