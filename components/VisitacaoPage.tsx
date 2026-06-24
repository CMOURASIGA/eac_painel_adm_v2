import React, { useEffect, useMemo, useState } from 'react';
import PersonCard from './PersonCard.tsx';
import Drawer from './Drawer.tsx';
import { visitacaoService } from '../services/visitacaoService.ts';
import type { User, VisitacaoHistoricoItem, VisitacaoPriorizado, VisitacaoStatus } from '../types.ts';
import { toCleanString } from '../utils/textEncoding.ts';

const STATUS_VISITACAO_UI: Record<VisitacaoStatus, { label: string; badge: string; dot: string }> = {
  NENHUMA_ACAO: { label: 'Nenhuma ação', badge: 'bg-slate-50 text-slate-700 border border-slate-200', dot: 'bg-slate-400' },
  CONTATO_INICIAL_FEITO: { label: 'Deseja fazer', badge: 'bg-blue-50 text-blue-700 border border-blue-200', dot: 'bg-blue-500' },
  VISITACAO_REALIZADA: { label: 'Visitação realizada', badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  NAO_CONSEGUIU_CONTATO: { label: 'Não conseguiu contato', badge: 'bg-rose-50 text-rose-700 border border-rose-200', dot: 'bg-rose-500' },
  AGUARDANDO_RETORNO: { label: 'Aguardando retorno', badge: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' },
  NAO_DESEJA_VISITA: { label: 'Não deseja fazer', badge: 'bg-zinc-50 text-zinc-700 border border-zinc-200', dot: 'bg-zinc-500' },
};

const ACTION_STATUSES: VisitacaoStatus[] = [
  'CONTATO_INICIAL_FEITO',
  'VISITACAO_REALIZADA',
  'NAO_CONSEGUIU_CONTATO',
  'AGUARDANDO_RETORNO',
  'NAO_DESEJA_VISITA',
];

const normalize = (value: any) => toCleanString(value).toLowerCase();
const digitsOnly = (value: any) => String(value ?? '').replace(/\D/g, '');

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const whatsappHref = (value: string) => {
  const digits = digitsOnly(value);
  return digits ? `https://wa.me/${digits}` : '';
};

const VisitacaoPage: React.FC<{ user: User }> = ({ user }) => {
  const [items, setItems] = useState<VisitacaoPriorizado[]>([]);
  const [indicadores, setIndicadores] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<VisitacaoStatus[]>([]);
  const [filters, setFilters] = useState({ nome: '', telefone: '', bairro: '', sexo: '', responsavel: '' });
  const [selectedItem, setSelectedItem] = useState<VisitacaoPriorizado | null>(null);
  const [history, setHistory] = useState<VisitacaoHistoricoItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status_visitacao: 'CONTATO_INICIAL_FEITO' as VisitacaoStatus,
    data_acao: new Date().toISOString().slice(0, 16),
    responsavel_acao: user.name || user.email || '',
    observacao: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    const result = await visitacaoService.listar();
    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setItems(result.data.items || []);
    setIndicadores(result.data.indicadores || null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(item.status_visitacao)) return false;
      if (filters.nome && !normalize(item.nome).includes(normalize(filters.nome))) return false;
      if (filters.telefone && !digitsOnly(item.telefone_normalizado || item.telefone).includes(digitsOnly(filters.telefone))) return false;
      if (filters.bairro && !normalize(item.bairro).includes(normalize(filters.bairro))) return false;
      if (filters.sexo && normalize(item.sexo) !== normalize(filters.sexo)) return false;
      if (filters.responsavel && !normalize(item.responsavel_acao).includes(normalize(filters.responsavel))) return false;
      return true;
    });
  }, [filters, items, selectedStatuses]);

  const openAction = (item: VisitacaoPriorizado, status: VisitacaoStatus) => {
    setSelectedItem(item);
    setForm({
      status_visitacao: status,
      data_acao: new Date().toISOString().slice(0, 16),
      responsavel_acao: user.name || user.email || '',
      observacao: item.observacao || '',
    });
    setModalOpen(true);
  };

  const openHistory = async (item: VisitacaoPriorizado) => {
    setSelectedItem(item);
    setHistory([]);
    setHistoryLoading(true);
    setHistoryOpen(true);
    const result = await visitacaoService.historico(item.inscricao_id);
    if (result.success) setHistory(result.data.items || []);
    else setError(result.error);
    setHistoryLoading(false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedItem) return;
    setSaving(true);
    setError('');
    setSuccess('');
    const result = await visitacaoService.registrar(selectedItem.inscricao_id, {
      ...form,
      origem_registro: 'PAINEL',
      data_acao: new Date(form.data_acao).toISOString(),
    });
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setModalOpen(false);
    setSuccess('Ação de visitação registrada com sucesso.');
    await load();
    setSaving(false);
  };

  const totals = indicadores || {
    total: items.length,
    nenhumaAcao: items.filter((item) => item.status_visitacao === 'NENHUMA_ACAO').length,
    contatoInicialFeito: items.filter((item) => item.status_visitacao === 'CONTATO_INICIAL_FEITO').length,
    visitacaoRealizada: items.filter((item) => item.status_visitacao === 'VISITACAO_REALIZADA').length,
    pendentesVisitacao: items.filter((item) => ['CONTATO_INICIAL_FEITO', 'AGUARDANDO_RETORNO'].includes(item.status_visitacao)).length,
    naoConseguiuContato: items.filter((item) => item.status_visitacao === 'NAO_CONSEGUIU_CONTATO').length,
    aguardandoRetorno: items.filter((item) => item.status_visitacao === 'AGUARDANDO_RETORNO').length,
    naoDesejaVisita: items.filter((item) => item.status_visitacao === 'NAO_DESEJA_VISITA').length,
  };

  const indicatorCards: Array<{ label: string; value: number; status?: VisitacaoStatus }> = [
    { label: 'Nenhuma ação', value: totals.nenhumaAcao, status: 'NENHUMA_ACAO' },
    { label: 'Deseja fazer', value: totals.contatoInicialFeito, status: 'CONTATO_INICIAL_FEITO' },
    { label: 'Visitação realizada', value: totals.visitacaoRealizada, status: 'VISITACAO_REALIZADA' },
    { label: 'Não conseguiu contato', value: totals.naoConseguiuContato, status: 'NAO_CONSEGUIU_CONTATO' },
    { label: 'Aguardando retorno', value: totals.aguardandoRetorno, status: 'AGUARDANDO_RETORNO' },
  ];

  return (
    <section className="p-4 md:p-8 space-y-6">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-600">Visitação</p>
        <div className="mt-2 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Controle operacional dos priorizados</h2>
            <p className="mt-2 text-sm text-slate-500">Acompanhe contato inicial, visita realizada e pendências sem alterar a inscrição oficial.</p>
          </div>
          <button type="button" onClick={load} className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-xs font-black uppercase tracking-widest">
            Recarregar
          </button>
        </div>
      </div>

      {(error || success) ? (
        <div className={`rounded-2xl border px-5 py-4 text-sm font-bold ${error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {error || success}
        </div>
      ) : null}

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <div className="rounded-3xl bg-slate-900 text-white p-5">
          <div className="text-[11px] font-black uppercase tracking-widest text-slate-300">Total priorizados</div>
          <div className="mt-3 text-4xl font-black">{totals.total || 0}</div>
        </div>
        {indicatorCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => card.status && setSelectedStatuses((current) => current.includes(card.status!) ? current.filter((item) => item !== card.status) : [...current, card.status!])}
            className={`rounded-3xl border p-5 text-left ${card.status && selectedStatuses.includes(card.status) ? STATUS_VISITACAO_UI[card.status].badge : 'bg-white border-slate-200 text-slate-700'}`}
          >
            <div className="text-[11px] font-black uppercase tracking-widest">{card.label}</div>
            <div className="mt-3 text-4xl font-black">{card.value || 0}</div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
          <input value={filters.nome} onChange={(event) => setFilters((current) => ({ ...current, nome: event.target.value }))} placeholder="Buscar por nome" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold text-sm outline-none focus:border-blue-500" />
          <input value={filters.telefone} onChange={(event) => setFilters((current) => ({ ...current, telefone: event.target.value }))} placeholder="Buscar por telefone" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold text-sm outline-none focus:border-blue-500" />
          <input value={filters.bairro} onChange={(event) => setFilters((current) => ({ ...current, bairro: event.target.value }))} placeholder="Filtrar por bairro" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold text-sm outline-none focus:border-blue-500" />
          <select value={filters.sexo} onChange={(event) => setFilters((current) => ({ ...current, sexo: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold text-sm outline-none focus:border-blue-500">
            <option value="">Todos os sexos</option>
            <option value="Masculino">Masculino</option>
            <option value="Feminino">Feminino</option>
          </select>
          <input value={filters.responsavel} onChange={(event) => setFilters((current) => ({ ...current, responsavel: event.target.value }))} placeholder="Responsável da última ação" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold text-sm outline-none focus:border-blue-500" />
        </div>
        {(selectedStatuses.length > 0 || Object.values(filters).some(Boolean)) ? (
          <button
            type="button"
            onClick={() => {
              setSelectedStatuses([]);
              setFilters({ nome: '', telefone: '', bairro: '', sexo: '', responsavel: '' });
            }}
            className="text-xs font-black uppercase tracking-widest text-blue-700"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="bg-white rounded-[2rem] border border-slate-200 p-10 text-center font-bold text-slate-500">Carregando visitações...</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const ui = STATUS_VISITACAO_UI[item.status_visitacao];
            const latestDate = item.data_visitacao || item.data_contato_inicial || item.atualizado_em || item.data_cadastro;
            const phone = item.telefone || item.responsavel_telefone || '';
            return (
              <PersonCard
                key={item.inscricao_id}
                ageLabel={item.idade ? `${item.idade}` : 'Sem idade'}
                statusLabel={ui.label}
                statusDotClassName={ui.dot}
                statusTextClassName="text-slate-700"
                nome={item.nome || '-'}
                bairro={item.bairro || 'Bairro não informado'}
                cadastroText={`Cadastro: ${formatDate(item.data_cadastro)} | Última ação: ${formatDateTime(latestDate)}`}
                badges={[
                  { label: ui.label, className: ui.badge },
                  ...(item.sexo ? [{ label: item.sexo, className: 'bg-white border border-slate-200 text-slate-600' }] : []),
                  ...(item.responsavel_acao ? [{ label: `Por ${item.responsavel_acao}`, className: 'bg-white border border-blue-200 text-blue-700' }] : []),
                ]}
                actions={[
                  ...(whatsappHref(phone) ? [{
                    key: 'whatsapp',
                    title: 'Abrir WhatsApp',
                    href: whatsappHref(phone),
                    variant: 'whatsapp' as const,
                    icon: <span className="text-base font-black">W</span>,
                  }] : []),
                  {
                    key: 'history',
                    title: 'Ver histórico',
                    onClick: () => openHistory(item),
                    variant: 'view' as const,
                    icon: <span className="text-base font-black">H</span>,
                  },
                  {
                    key: 'observation',
                    title: 'Adicionar observação',
                    onClick: () => openAction(item, item.status_visitacao),
                    variant: 'edit' as const,
                    icon: <span className="text-base font-black">+</span>,
                  },
                ]}
                primaryAction={{
                  label: item.status_visitacao === 'VISITACAO_REALIZADA' ? 'Atualizar visitação' : 'Registrar visitação realizada',
                  onClick: () => openAction(item, 'VISITACAO_REALIZADA'),
                }}
              />
            );
          })}
        </div>
      )}

      {!loading && filteredItems.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-slate-200 p-10 text-center font-bold text-slate-500">Nenhum priorizado encontrado com os filtros aplicados.</div>
      ) : null}

      {modalOpen && selectedItem ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setModalOpen(false)} />
          <form onSubmit={handleSave} className="relative w-full max-w-2xl rounded-[2rem] bg-white border border-slate-200 shadow-2xl p-6 space-y-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-600">Atualizar visitação</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">{selectedItem.nome}</h3>
              <p className="mt-1 text-sm text-slate-500">{selectedItem.bairro || 'Bairro não informado'} • Responsável cadastrado: {selectedItem.responsavel_nome || 'não informado'}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Status da ação</span>
                <select value={form.status_visitacao} onChange={(event) => setForm((current) => ({ ...current, status_visitacao: event.target.value as VisitacaoStatus }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-blue-500">
                  {ACTION_STATUSES.map((status) => <option key={status} value={status}>{STATUS_VISITACAO_UI[status].label}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Data da ação</span>
                <input type="datetime-local" value={form.data_acao} onChange={(event) => setForm((current) => ({ ...current, data_acao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-blue-500" required />
              </label>
            </div>
            <label className="space-y-2 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Responsável pela ação</span>
              <input value={form.responsavel_acao} onChange={(event) => setForm((current) => ({ ...current, responsavel_acao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-blue-500" required />
            </label>
            <label className="space-y-2 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Observação</span>
              <textarea rows={4} value={form.observacao} onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-blue-500" placeholder="Detalhes do contato, retorno ou observação operacional." />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-600">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-xs font-black uppercase tracking-widest disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar atualização'}</button>
            </div>
          </form>
        </div>
      ) : null}

      <Drawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title={selectedItem ? `Histórico de ${selectedItem.nome}` : 'Histórico'}>
        {historyLoading ? (
          <p className="font-bold text-slate-500">Carregando histórico...</p>
        ) : history.length === 0 ? (
          <p className="font-bold text-slate-500">Nenhum histórico registrado até o momento.</p>
        ) : (
          <div className="space-y-4">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-slate-900">{entry.tipo_acao.replace(/_/g, ' ')}</p>
                  <p className="text-xs font-bold text-slate-500">{formatDateTime(entry.criado_em)}</p>
                </div>
                <p className="mt-2 text-sm text-slate-600">Responsável: {entry.responsavel_acao || '-'}</p>
                <p className="text-sm text-slate-600">Status: {entry.status_anterior || 'NENHUMA_ACAO'} → {entry.status_novo || '-'}</p>
                {entry.descricao ? <p className="mt-3 text-sm text-slate-700">{entry.descricao}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </section>
  );
};

export default VisitacaoPage;
