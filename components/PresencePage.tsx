import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PresenceRecord, User } from '../types.ts';
import PersonCard from './PersonCard.tsx';

interface PresencePageProps {
  user: User;
  googleWebAppUrl: string;
}

type PresenceFilterValue = 'todos' | 'presentes' | 'faltantes';

interface PresenceFilters {
  nome: string;
  circulo: string;
  ano: string;
  presenca: PresenceFilterValue;
}

const PAGE_SIZE = 20;

const MONTH_NAMES: Record<string, string> = {
  '1': 'Janeiro',
  '2': 'Fevereiro',
  '3': 'Março',
  '4': 'Abril',
  '5': 'Maio',
  '6': 'Junho',
  '7': 'Julho',
  '8': 'Agosto',
  '9': 'Setembro',
  '10': 'Outubro',
  '11': 'Novembro',
  '12': 'Dezembro',
};

const DEFAULT_FILTERS: PresenceFilters = {
  nome: '',
  circulo: '',
  ano: '',
  presenca: 'todos',
};

const toClean = (value: any) => String(value ?? '').trim();

const normalizeText = (value: any) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizePhoneKey = (value: any) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  if (digits.length > 11) digits = digits.slice(-11);
  return digits;
};

const formatPhone = (value: any) => {
  const digits = normalizePhoneKey(value);
  if (!digits) return '-';
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
};

const parseDateFlexible = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const raw = toClean(value);
  if (!raw) return null;

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]) - 1;
    const y = Number(br[3]);
    const hh = Number(br[4] || 0);
    const mm = Number(br[5] || 0);
    const ss = Number(br[6] || 0);
    const parsed = new Date(y, m, d, hh, mm, ss, 0);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    const hh = Number(iso[4] || 0);
    const mm = Number(iso[5] || 0);
    const ss = Number(iso[6] || 0);
    const parsed = new Date(y, m, d, hh, mm, ss, 0);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const native = new Date(raw);
  return isNaN(native.getTime()) ? null : native;
};

const isPresent = (record: PresenceRecord) => Boolean(record?.presente || toClean(record?.timestamp));

const getMonthValue = (record: PresenceRecord): string => {
  const explicit = toClean(record?.mes);
  if (/^\d{1,2}$/.test(explicit)) return String(Number(explicit));

  const ts = parseDateFlexible(record?.timestamp);
  if (ts) return String(ts.getMonth() + 1);
  return '';
};

const getMonthLabel = (record: PresenceRecord): string => {
  const month = getMonthValue(record);
  return MONTH_NAMES[month] || 'Não informado';
};

const getYearValue = (record: PresenceRecord): string => {
  const ts = parseDateFlexible(record?.timestamp);
  if (!ts) return '';
  return String(ts.getFullYear());
};

const getPresenceUniqueKey = (record: PresenceRecord) => {
  const nomeKey = normalizeText(record.nome);
  if (nomeKey) return `nome:${nomeKey}`;
  const phoneKey = normalizePhoneKey(record.telefone || record.telCadastrado);
  return phoneKey ? `tel:${phoneKey}` : '';
};

const countUniquePresentPeople = (list: PresenceRecord[]) => {
  const set = new Set<string>();
  (Array.isArray(list) ? list : []).forEach((r) => {
    if (!isPresent(r)) return;
    const key = getPresenceUniqueKey(r);
    if (!key) return;
    set.add(key);
  });
  return set.size;
};

const formatDateTime = (value: any) => {
  const dt = parseDateFlexible(value);
  if (!dt) return '-';
  return dt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

async function callApiProxy(action: string, googleWebAppUrl: string, payload: any = {}) {
  const response = await fetch('/api/comunicados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data: payload, googleWebAppUrl }),
  });

  const raw = await response.text();
  if (!raw) return { success: false, error: `Resposta vazia da API (HTTP ${response.status}).` };

  try {
    const parsed = JSON.parse(raw);
    if (!response.ok) return { success: false, ...parsed };
    return { ...parsed, success: Boolean(parsed?.success ?? parsed?.ok ?? false) };
  } catch (err: any) {
    return {
      success: false,
      error: `Resposta inválida da API (/api/comunicados): ${err?.message || 'JSON malformado.'}`,
    };
  }
}

const PresencePage: React.FC<PresencePageProps> = ({ googleWebAppUrl }) => {
  const [records, setRecords] = useState<PresenceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarking, setIsMarking] = useState<string | null>(null);
  const [quickPhone, setQuickPhone] = useState('');
  const [quickStatus, setQuickStatus] = useState('');

  const [showFilters, setShowFilters] = useState(true);
  const [draftFilters, setDraftFilters] = useState<PresenceFilters>({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<PresenceFilters>({ ...DEFAULT_FILTERS });

  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await callApiProxy('GET_PRESENCE', googleWebAppUrl);
      if (!res?.success) throw new Error(res?.error || 'Falha ao carregar presença.');

      const list = Array.isArray(res?.presence) ? res.presence : [];
      setRecords(list);
    } catch (err: any) {
      alert(err?.message || 'Erro ao carregar presença.');
    } finally {
      setIsLoading(false);
    }
  }, [googleWebAppUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const circles = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      const c = toClean(r.circulo);
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [records]);

  const years = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      const y = getYearValue(r);
      if (y) set.add(y);
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [records]);

  const indicators = useMemo(() => {
    const circulosAtivos = circles.length;
    const adolescentesPresentesUnicos = countUniquePresentPeople(records);

    return { circulosAtivos, adolescentesPresentesUnicos };
  }, [records, circles]);

  const filteredRecords = useMemo(() => {
    const query = normalizeText(appliedFilters.nome);

    const list = records.filter((r) => {
      if (query && !normalizeText(r.nome).includes(query)) return false;

      if (appliedFilters.circulo && normalizeText(r.circulo) !== normalizeText(appliedFilters.circulo)) {
        return false;
      }

      if (appliedFilters.ano) {
        const rowYear = getYearValue(r);
        if (rowYear !== appliedFilters.ano) return false;
      }

      const present = isPresent(r);
      if (appliedFilters.presenca === 'presentes' && !present) return false;
      if (appliedFilters.presenca === 'faltantes' && present) return false;

      return true;
    });

    return list.sort((a, b) => toClean(a.nome).localeCompare(toClean(b.nome), 'pt-BR'));
  }, [records, appliedFilters]);

  const filteredPresentesUnicos = useMemo(() => {
    return countUniquePresentPeople(filteredRecords);
  }, [filteredRecords]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, safePage]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const summaryByCircle = useMemo(() => {
    const map: Record<string, { total: number; presentes: number }> = {};

    filteredRecords.forEach((r) => {
      const circle = toClean(r.circulo) || 'Não informado';
      if (!map[circle]) map[circle] = { total: 0, presentes: 0 };
      map[circle].total += 1;
      if (isPresent(r)) map[circle].presentes += 1;
    });

    return Object.keys(map)
      .map((circle) => ({
        circulo: circle,
        total: map[circle].total,
        presentes: map[circle].presentes,
        faltantes: Math.max(0, map[circle].total - map[circle].presentes),
      }))
      .sort((a, b) => b.presentes - a.presentes);
  }, [filteredRecords]);

  const applyFilters = () => {
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  };

  const applyPresenceFilterFromIndicators = (
    mode: 'presentes_geral' | 'presentes_com_filtros' | 'todos'
  ) => {
    if (mode === 'presentes_geral') {
      const next = { ...DEFAULT_FILTERS, presenca: 'presentes' as PresenceFilterValue };
      setDraftFilters(next);
      setAppliedFilters(next);
      setPage(1);
      return;
    }

    if (mode === 'presentes_com_filtros') {
      const next = { ...draftFilters, presenca: 'presentes' as PresenceFilterValue };
      setDraftFilters(next);
      setAppliedFilters(next);
      setPage(1);
      return;
    }

    const next = { ...draftFilters, presenca: 'todos' as PresenceFilterValue };
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftFilters({ ...DEFAULT_FILTERS });
    setAppliedFilters({ ...DEFAULT_FILTERS });
    setPage(1);
  };

  const markPresence = async (record: PresenceRecord) => {
    const key = normalizePhoneKey(record.telefone || record.telCadastrado);
    if (!key) {
      alert('Telefone não informado para este registro.');
      return;
    }

    setIsMarking(key);
    try {
      const res = await callApiProxy('MARK_PRESENCE', googleWebAppUrl, {
        telefone: record.telefone || record.telCadastrado,
        nome: record.nome,
        circulo: record.circulo,
      });

      if (!res?.success) throw new Error(res?.error || 'Não foi possível registrar presença.');
      await fetchData();
    } catch (err: any) {
      alert(err?.message || 'Erro ao marcar presença.');
    } finally {
      setIsMarking(null);
    }
  };

  const handleQuickCheckin = async () => {
    const key = normalizePhoneKey(quickPhone);
    if (!key) {
      setQuickStatus('Informe um telefone válido para check-in rápido.');
      return;
    }

    const target = records.find((r) => {
      const a = normalizePhoneKey(r.telefone);
      const b = normalizePhoneKey(r.telCadastrado);
      return a === key || b === key;
    });

    if (!target) {
      setQuickStatus('Telefone não encontrado na lista de presença.');
      return;
    }

    setIsMarking(key);
    setQuickStatus('');
    try {
      const res = await callApiProxy('MARK_PRESENCE', googleWebAppUrl, {
        telefone: target.telefone || target.telCadastrado || quickPhone,
        nome: target.nome,
        circulo: target.circulo,
      });

      if (!res?.success) throw new Error(res?.error || 'Não foi possível registrar presença.');
      setQuickStatus(`Presença registrada para ${toClean(target.nome) || 'participante'}.`);
      setQuickPhone('');
      await fetchData();
    } catch (err: any) {
      setQuickStatus(err?.message || 'Erro ao registrar presença no check-in rápido.');
    } finally {
      setIsMarking(null);
    }
  };

  const exportCsv = () => {
    try {
      const headers = ['Nome', 'Telefone', 'Círculo', 'Data presença'];
      const rows = filteredRecords.map((r) => [
        toClean(r.nome),
        toClean(r.telefone || r.telCadastrado),
        toClean(r.circulo),
        isPresent(r) ? formatDateTime(r.timestamp) : '',
      ]);

      const sep = ';';
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = '\ufeff' + [headers.map(esc).join(sep), ...rows.map((row) => row.map(esc).join(sep))].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'presenca-eac.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Não foi possível exportar o CSV de presença.');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-[100rem] mx-auto space-y-6 pb-24">
      <header className="flex flex-col xl:flex-row justify-between gap-6 xl:items-end">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none">Controle de Presença</h2>
          <p className="text-slate-500 font-medium italic mt-3 text-sm">Painel operacional de check-in por participante e círculo.</p>
        </div>

        <div className="flex flex-wrap gap-3 w-full xl:w-auto xl:justify-end">
          <button
            type="button"
            onClick={fetchData}
            disabled={isLoading}
            className="px-6 py-4 bg-white text-slate-500 border-2 rounded-2xl font-black text-[10px] uppercase shadow-sm disabled:opacity-60 whitespace-nowrap"
          >
            {isLoading ? 'Carregando...' : 'Recarregar'}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm whitespace-nowrap"
          >
            Exportar presença
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => applyPresenceFilterFromIndicators('presentes_geral')}
          className={`text-left rounded-2xl p-4 shadow-sm transition-all border ${
            appliedFilters.presenca === 'presentes' &&
            !appliedFilters.nome &&
            !appliedFilters.circulo &&
            !appliedFilters.ano
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-100'
              : 'bg-white border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Adolescentes presentes</p>
          <p className="mt-2 text-2xl font-black text-emerald-700">{indicators.adolescentesPresentesUnicos}</p>
          <p className="text-[10px] font-bold text-emerald-600 mt-1">Contagem única geral</p>
        </button>
        <button
          type="button"
          onClick={() => applyPresenceFilterFromIndicators('presentes_com_filtros')}
          className={`text-left rounded-2xl p-4 shadow-sm transition-all border ${
            appliedFilters.presenca === 'presentes' &&
            (Boolean(appliedFilters.nome) || Boolean(appliedFilters.circulo) || Boolean(appliedFilters.ano))
              ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-100'
              : 'bg-white border-indigo-200 hover:bg-indigo-50'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Presentes no filtro</p>
          <p className="mt-2 text-2xl font-black text-indigo-700">{filteredPresentesUnicos}</p>
          <p className="text-[10px] font-bold text-indigo-600 mt-1">Contagem única com filtros aplicados</p>
        </button>
        <button
          type="button"
          onClick={() => applyPresenceFilterFromIndicators('todos')}
          className={`text-left rounded-2xl p-4 shadow-sm transition-all border ${
            appliedFilters.presenca === 'todos'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100'
              : 'bg-white border-blue-200 hover:bg-blue-50'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Círculos ativos</p>
          <p className="mt-2 text-2xl font-black text-blue-700">{indicators.circulosAtivos}</p>
        </button>
      </section>

      <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Check-in rápido por telefone</label>
            <input
              value={quickPhone}
              onChange={(e) => setQuickPhone(e.target.value)}
              placeholder="Digite o telefone para marcar presença"
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={handleQuickCheckin}
            disabled={Boolean(isMarking)}
            className="px-5 py-3 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60"
          >
            {isMarking ? 'Processando...' : 'Marcar presença'}
          </button>
        </div>
        {quickStatus && <p className="text-sm font-bold text-slate-600">{quickStatus}</p>}
      </section>

      <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Filtros de presença</h3>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50"
          >
            {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
          </button>
        </div>

        {showFilters && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Buscar por nome</label>
                <input
                  value={draftFilters.nome}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Nome do participante"
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Círculo</label>
                <select
                  value={draftFilters.circulo}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, circulo: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="">Todos os círculos</option>
                  {circles.map((circle) => (
                    <option key={circle} value={circle}>{circle}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Ano</label>
                <select
                  value={draftFilters.ano}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, ano: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="">Todos os anos</option>
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Presença</label>
                <select
                  value={draftFilters.presenca}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, presenca: e.target.value as PresenceFilterValue }))}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="todos">Todos</option>
                  <option value="presentes">Presentes</option>
                  <option value="faltantes">Faltantes</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="px-4 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
              >
                Pesquisar
              </button>
            </div>
          </>
        )}
      </section>

      <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lista de presença ({filteredRecords.length})</h3>
        </div>

        <div className="p-4 md:p-6">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-400 font-bold text-sm">
              Carregando dados de presença...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-400 font-bold text-sm">
              Nenhum participante encontrado para os filtros aplicados.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
              {paginatedRecords.map((record) => {
                const phoneKey = normalizePhoneKey(record.telefone || record.telCadastrado);
                const present = isPresent(record);
                const isProcessing = isMarking === phoneKey && !!phoneKey;

                return (
                  <PersonCard
                    key={record.id || `${record.rowNumber}-${phoneKey}`}
                    ageLabel={present ? 'Presente' : 'Pendente'}
                    ageClassName={present ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-slate-100 border-slate-200 text-slate-700'}
                    statusLabel={present ? 'Presente' : 'Não registrado'}
                    statusTextClassName={present ? 'text-emerald-700' : 'text-slate-600'}
                    statusDotClassName={present ? 'bg-emerald-500' : 'bg-slate-400'}
                    nome={toClean(record.nome) || '-'}
                    bairro={`Círculo: ${toClean(record.circulo) || 'Não informado'}`}
                    cadastroText={`Telefone: ${formatPhone(record.telefone || record.telCadastrado)}`}
                    badges={[
                      {
                        label: `Presença: ${present ? formatDateTime(record.timestamp) : 'Não registrada'}`,
                        className: present
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border border-slate-200',
                      },
                      {
                        label: `Mês: ${getMonthLabel(record)}`,
                        className: 'bg-blue-50 text-blue-700 border border-blue-200',
                      },
                    ]}
                    primaryAction={{
                      label: isProcessing ? 'Marcando...' : 'Marcar presença',
                      onClick: () => {
                        void markPresence(record);
                      },
                      disabled: isProcessing,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {filteredRecords.length > 0 && (
          <div className="px-4 md:px-6 py-4 border-t bg-slate-50 flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Página {safePage} de {totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo por círculo</h3>
        </div>

        {summaryByCircle.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-400 font-bold text-sm">
            Sem dados para resumo por círculo.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {summaryByCircle.map((item) => (
              <div key={item.circulo} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.circulo}</p>
                <p className="mt-2 text-sm font-black text-emerald-700">{item.presentes} presentes</p>
                <p className="text-xs font-bold text-slate-500">{item.faltantes} faltantes • {item.total} total</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default PresencePage;
