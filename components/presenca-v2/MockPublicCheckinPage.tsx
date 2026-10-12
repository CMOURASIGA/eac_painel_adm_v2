import React, { useEffect, useMemo, useState } from 'react';
import { postComunicadosAction } from '../../services/eacApiClient.ts';

const action = async (name: string, data: any) => {
  const result = await postComunicadosAction<any>(name, data);
  if (!result.success) throw new Error(result.error || 'Não foi possível concluir o check-in.');
  return result.data as any;
};

const MockPublicCheckinPage: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const token = new URLSearchParams(window.location.search).get('session') || 'mock-qr-mock-session-1';

  useEffect(() => { void action('PRESENCA_V2_GET_PUBLIC_SESSION', { token }).then((data) => setSession(data.session)).catch((error) => setMessage(error.message)); }, [token]);
  const matches = useMemo(() => (session?.people || []).filter((person: any) => person.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 6), [session, query]);
  const selected = useMemo(() => (session?.people || []).find((person: any) => person.id === selectedId), [session, selectedId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected && !query.trim()) return setMessage('Informe seu nome para continuar.');
    setBusy(true); setMessage('');
    try {
      const data = await action('PRESENCA_V2_PUBLIC_CHECKIN', { sessionId: session.id, personId: selected?.id || null, name: selected?.name || query, phone });
      const status = data.result?.status;
      setMessage(status === 'CONFIRMED' ? 'Presença confirmada nesta sessão.' : status === 'ALREADY_PRESENT' ? 'Sua presença já foi registrada nesta sessão.' : 'Recebemos sua solicitação. A equipe administrativa fará a conciliação após o encerramento.');
    } catch (error: any) { setMessage(error?.message || 'Não foi possível registrar.'); } finally { setBusy(false); }
  };

  if (!session) return <main className="mx-auto max-w-lg p-6"><p className="rounded-xl bg-white p-5 text-slate-700 shadow">{message || 'Carregando sessão…'}</p></main>;
  if (session.status !== 'ABERTA') return <main className="mx-auto max-w-lg p-6"><section className="rounded-2xl bg-white p-6 text-center shadow"><h1 className="text-xl font-black">Esta sessão não está aberta</h1><p className="mt-2 text-slate-600">Não recebemos novos check-ins depois do encerramento.</p></section></main>;

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><section className="mx-auto max-w-lg overflow-hidden rounded-3xl bg-white shadow-lg"><header className="bg-[#044372] p-7 text-white"><p className="text-xs font-black tracking-wider text-sky-200">CHECK-IN</p><h1 className="mt-1 text-2xl font-black">{session.title}</h1><p className="mt-2 text-sm text-sky-100">Confirme apenas sua própria presença.</p></header><form onSubmit={submit} className="space-y-5 p-6"><p className="text-sm text-slate-600">Não há escolha de evento nesta tela: o QR já identifica a sessão aberta.</p><label className="grid gap-1 text-sm font-bold text-slate-700">Digite parte do seu nome<input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(''); }} autoComplete="off" className="rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label>{query && !selectedId && <div className="rounded-xl border border-slate-200">{matches.map((person: any) => <button type="button" key={person.id} onClick={() => { setSelectedId(person.id); setQuery(person.name); }} className="block w-full border-b border-slate-100 px-3 py-3 text-left text-sm last:border-0 hover:bg-slate-50">{person.name}</button>)}{matches.length === 0 && <p className="p-3 text-sm text-slate-500">Nome não encontrado. Sua solicitação será enviada para análise, sem criar cadastro automaticamente.</p>}</div>}{selected && <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Identidade selecionada: <strong>{selected.name}</strong>{selected.circle ? ` · círculo ${selected.circle}` : ''}</div>}<label className="grid gap-1 text-sm font-bold text-slate-700">Confirme seu telefone<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="numeric" placeholder="Somente números" className="rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label><p className="text-xs text-slate-500">Telefone ausente, divergente ou compartilhado gera solicitação pendente. Nenhum dado cadastral é alterado automaticamente.</p><button disabled={busy || !query.trim()} className="w-full rounded-xl bg-[#044372] px-4 py-3 font-black text-white disabled:opacity-50">{busy ? 'Enviando…' : selected ? 'Confirmar presença' : 'Enviar para análise'}</button>{message && <p className="rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-700">{message}</p>}</form></section></main>;
};

export default MockPublicCheckinPage;
