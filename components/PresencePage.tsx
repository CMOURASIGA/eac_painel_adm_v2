import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PresenceRecord, User } from '../types.ts';
import PersonCard from './PersonCard.tsx';
import { toCleanString } from '../utils/textEncoding.ts';
import { presencaService } from '../services/presencaService.ts';

interface PresencePageProps {
  user: User;
  googleWebAppUrl: string;
}

type PresenceFilterValue = 'todos' | 'presentes' | 'faltantes';

interface PresenceFilters {
  nome: string;
  encontro: string;
  circulo: string;
  mes: string;
  ano: string;
  presenca: PresenceFilterValue;
}

type PresenceEventType = 'POS_ENCONTRO' | 'REUNIAO_CIRCULO';

interface PresenceCandidate {
  key: string;
  nome: string;
  telefone: string;
  circulo: string;
  origem: 'ENCONTREIRO' | 'ENCONTRISTA' | 'AMBOS';
}

const PAGE_SIZE = 20;
const NOW = new Date();
const CURRENT_MONTH = String(NOW.getMonth() + 1);
const CURRENT_YEAR = String(NOW.getFullYear());

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

const MONTH_NAME_TO_NUMBER: Record<string, string> = {
  janeiro: '1',
  fevereiro: '2',
  marco: '3',
  março: '3',
  abril: '4',
  maio: '5',
  junho: '6',
  julho: '7',
  agosto: '8',
  setembro: '9',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
};

const DEFAULT_FILTERS: PresenceFilters = {
  nome: '',
  encontro: '',
  circulo: '',
  mes: CURRENT_MONTH,
  ano: CURRENT_YEAR,
  presenca: 'todos',
};

const toClean = (value: any) => toCleanString(value);

const normalizeText = (value: any) =>
  toCleanString(value)
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

const normalizeNameKey = (value: any) => normalizeText(value);

const resolveCandidateCircle = (row: any) =>
  toClean(row?.circulo || row?.grupoSugerido || row?.grupo_sugerido || row?.circuloInformado || row?.circulo_informado);

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
  if (/^\d{4}[-/]\d{1,2}$/.test(explicit)) {
    const monthPart = explicit.split(/[-/]/)[1];
    return String(Number(monthPart));
  }
  if (explicit) {
    const normalized = explicit
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (MONTH_NAME_TO_NUMBER[normalized]) return MONTH_NAME_TO_NUMBER[normalized];
  }

  const ts = parseDateFlexible(record?.timestamp);
  if (ts) return String(ts.getMonth() + 1);
  return '';
};

const getMonthLabel = (record: PresenceRecord): string => {
  const month = getMonthValue(record);
  return MONTH_NAMES[month] || 'Não informado';
};

const getYearValue = (record: PresenceRecord): string => {
  const explicitYear = toClean((record as any)?.ano || (record as any)?.year);
  if (/^\d{4}$/.test(explicitYear)) return explicitYear;

  const explicitMonth = toClean(record?.mes);
  const monthYear = explicitMonth.match(/^(\d{4})[-/]\d{1,2}$/);
  if (monthYear) return monthYear[1];

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

// (removido) callApiProxy duplicado: usar presencaService














const PresencePage: React.FC<PresencePageProps> = ({ googleWebAppUrl }) => {
  const [records, setRecords] = useState<PresenceRecord[]>([]);
  const [encontreirosBase, setEncontreirosBase] = useState<any[]>([]);
  const [encontristasBase, setEncontristasBase] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPublico, setIsLoadingPublico] = useState(false);
  const [isMarking, setIsMarking] = useState<string | null>(null);
  const [quickPhone, setQuickPhone] = useState('');
  const [quickStatus, setQuickStatus] = useState('');
  const [eventType, setEventType] = useState<PresenceEventType>('POS_ENCONTRO');
  const [selectedCandidateKey, setSelectedCandidateKey] = useState('');
  const [manualCircle, setManualCircle] = useState('');

  const [showFilters, setShowFilters] = useState(true);
  const [draftFilters, setDraftFilters] = useState<PresenceFilters>({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<PresenceFilters>({ ...DEFAULT_FILTERS });

  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await presencaService.listar({ googleWebAppUrl });
      if (!r.success) throw new Error(r.error || 'Falha ao carregar presença.');
      setRecords(Array.isArray(r.data.items) ? r.data.items : []);
    } catch (err: any) {
      alert(err?.message || 'Erro ao carregar presença.');
    } finally {
      setIsLoading(false);
    }
  }, [googleWebAppUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let active = true;
    async function fetchPublico() {
      setIsLoadingPublico(true);
      try {
        const r = await presencaService.listarPublicoPresenca({ googleWebAppUrl });
        if (!r.success) throw new Error(r.error || 'Falha ao carregar público de presença.');
        if (!active) return;
        setEncontreirosBase(Array.isArray(r.data.encontreiros) ? r.data.encontreiros : []);
        setEncontristasBase(Array.isArray(r.data.encontristas) ? r.data.encontristas : []);
      } catch (e: any) {
        if (!active) return;
        alert(e?.message || 'Erro ao carregar base de pessoas para presença.');
      } finally {
        if (active) setIsLoadingPublico(false);
      }
    }
    fetchPublico();
    return () => {
      active = false;
    };
  }, [googleWebAppUrl]);

  const circles = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      const c = toClean(r.circulo);
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [records]);

  const encontreiroCandidates = useMemo(() => {
    const map = new Map<string, PresenceCandidate>();
    (Array.isArray(encontreirosBase) ? encontreirosBase : []).forEach((row: any) => {
      const nome = toClean(row?.nomeCompleto || row?.nome || row?.nome_completo);
      if (!nome) return;
      const telefone = toClean(row?.celularWhatsapp || row?.telefone || row?.whatsapp || row?.celular);
      const telKey = normalizePhoneKey(telefone);
      const key = telKey ? `tel:${telKey}` : `nome:${normalizeNameKey(nome)}`;
      const prev = map.get(key);
      map.set(key, {
        key,
        nome,
        telefone: telefone || prev?.telefone || '',
        circulo: resolveCandidateCircle(row) || prev?.circulo || '',
        origem: prev?.origem === 'ENCONTRISTA' ? 'AMBOS' : 'ENCONTREIRO',
      });
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [encontreirosBase]);

  const encontristaCandidates = useMemo(() => {
    const map = new Map<string, PresenceCandidate>();
    (Array.isArray(encontristasBase) ? encontristasBase : []).forEach((row: any) => {
      const nome = toClean(row?.nome || row?.name || row?.nomeCompleto || row?.nome_completo);
      if (!nome) return;
      const telefone = toClean(row?.telefone || row?.celular || row?.whatsapp || row?.phone);
      const telKey = normalizePhoneKey(telefone);
      const key = telKey ? `tel:${telKey}` : `nome:${normalizeNameKey(nome)}`;
      const prev = map.get(key);
      map.set(key, {
        key,
        nome,
        telefone: telefone || prev?.telefone || '',
        circulo: resolveCandidateCircle(row) || prev?.circulo || '',
        origem: prev?.origem === 'ENCONTREIRO' ? 'AMBOS' : 'ENCONTRISTA',
      });
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [encontristasBase]);

  const posEventCandidates = useMemo(() => {
    const map = new Map<string, PresenceCandidate>();
    [...encontreiroCandidates, ...encontristaCandidates].forEach((item) => {
      const prev = map.get(item.key);
      map.set(item.key, {
        ...item,
        telefone: item.telefone || prev?.telefone || '',
        circulo: item.circulo || prev?.circulo || '',
        origem:
          prev && prev.origem !== item.origem
            ? 'AMBOS'
            : prev?.origem === 'AMBOS'
              ? 'AMBOS'
              : item.origem,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [encontreiroCandidates, encontristaCandidates]);

  const eventCandidates = useMemo(
    () => (eventType === 'REUNIAO_CIRCULO' ? encontristaCandidates : posEventCandidates),
    [eventType, encontristaCandidates, posEventCandidates]
  );

  const selectedCandidate = useMemo(
    () => eventCandidates.find((c) => c.key === selectedCandidateKey) || null,
    [eventCandidates, selectedCandidateKey]
  );

  const encontros = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r: any) => {
      const nome = toClean((r as any).encontroNome);
      if (nome) set.add(nome);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [records]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1)), []);

  const years = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      const y = getYearValue(r);
      if (y) set.add(y);
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = normalizeText(appliedFilters.nome);

    const list = records.filter((r) => {
      if (query && !normalizeText(r.nome).includes(query)) return false;

      if (appliedFilters.circulo && normalizeText(r.circulo) !== normalizeText(appliedFilters.circulo)) {
        return false;
      }

      if (appliedFilters.encontro && normalizeText((r as any).encontroNome) !== normalizeText(appliedFilters.encontro)) {
        return false;
      }

      if (appliedFilters.mes) {
        const rowMonth = getMonthValue(r);
        if (rowMonth !== appliedFilters.mes) return false;
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

  const indicators = useMemo(() => {
    const currentMonthPresentes = countUniquePresentPeople(
      records.filter((r) => getMonthValue(r) === CURRENT_MONTH && getYearValue(r) === CURRENT_YEAR)
    );
    const totalNoFiltro = filteredRecords.length;
    return { currentMonthPresentes, totalNoFiltro };
  }, [records, filteredRecords]);

  const segmentedIndicators = useMemo(() => {
    const isPos = (r: PresenceRecord) => normalizeText((r as any).encontroNome).includes('pos');
    const isCirculoEvent = (r: PresenceRecord) =>
      normalizeText((r as any).encontroNome).includes('circulo') || normalizeText((r as any).encontroNome).includes('círculo');

    const memberNameSet = new Set(encontristaCandidates.map((c) => normalizeNameKey(c.nome)));
    const memberPhoneSet = new Set(encontristaCandidates.map((c) => normalizePhoneKey(c.telefone)).filter(Boolean));

    const unique = (list: PresenceRecord[]) => countUniquePresentPeople(list);
    const presentList = records.filter((r) => isPresent(r));
    const presentEncontreiro = presentList.filter((r) => {
      const n = normalizeNameKey(r.nome);
      const t = normalizePhoneKey(r.telefone || r.telCadastrado);
      return !memberNameSet.has(n) && (!t || !memberPhoneSet.has(t));
    });
    const presentEncontrista = presentList.filter((r) => {
      const n = normalizeNameKey(r.nome);
      const t = normalizePhoneKey(r.telefone || r.telCadastrado);
      return memberNameSet.has(n) || (t && memberPhoneSet.has(t));
    });

    return {
      encontroeiroPresentes: unique(presentEncontreiro),
      encontristaPresentes: unique(presentEncontrista),
      posPresentes: unique(presentList.filter(isPos)),
      circuloPresentes: unique(presentList.filter(isCirculoEvent)),
    };
  }, [records, encontristaCandidates]);

  const topPresence = useMemo(() => {
    const bucket = new Map<string, { nome: string; total: number }>();
    records.forEach((r) => {
      if (!isPresent(r)) return;
      const key = getPresenceUniqueKey(r);
      if (!key) return;
      const prev = bucket.get(key) || { nome: toClean(r.nome) || '-', total: 0 };
      prev.total += 1;
      bucket.set(key, prev);
    });
    return Array.from(bucket.values())
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 5);
  }, [records]);

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

  useEffect(() => {
    if (!selectedCandidate) return;
    if (!manualCircle) {
      setManualCircle(selectedCandidate.circulo || '');
    }
  }, [selectedCandidate, manualCircle]);

  const applyFilters = () => {
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  };

  const applyPresenceFilterFromIndicators = (
    mode: 'presentes_mes_atual' | 'presentes_com_filtros' | 'total_no_filtro'
  ) => {
    if (mode === 'presentes_mes_atual') {
      const next = {
        ...DEFAULT_FILTERS,
        mes: CURRENT_MONTH,
        ano: CURRENT_YEAR,
        presenca: 'presentes' as PresenceFilterValue,
      };
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

  const applyCircleFilter = (circulo: string) => {
    const next = {
      ...draftFilters,
      circulo,
      mes: draftFilters.mes || CURRENT_MONTH,
      ano: draftFilters.ano || CURRENT_YEAR,
    };
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
      const apiRes = await presencaService.marcar({
        telefone: record.telefone || record.telCadastrado,
        nome: record.nome,
        circulo: record.circulo,
      }, { googleWebAppUrl });
      if (!apiRes.success) throw new Error(apiRes.error || 'Não foi possível registrar presença.');
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
      const apiRes = await presencaService.marcar({
        telefone: target.telefone || target.telCadastrado || quickPhone,
        nome: target.nome,
        circulo: target.circulo,
      }, { googleWebAppUrl });
      if (!apiRes.success) throw new Error(apiRes.error || 'Não foi possível registrar presença.');
      setQuickStatus(`Presença registrada para ${toClean(target.nome) || 'participante'}.`);
      setQuickPhone('');
      await fetchData();
    } catch (err: any) {
      setQuickStatus(err?.message || 'Erro ao registrar presença no check-in rápido.');
    } finally {
      setIsMarking(null);
    }
  };

  const handleFormCheckin = async () => {
    if (!selectedCandidate) {
      alert('Selecione um nome para registrar a presença.');
      return;
    }
    const telefone = toClean(selectedCandidate.telefone);
    if (!normalizePhoneKey(telefone)) {
      alert('Este cadastro não possui telefone válido para registrar presença.');
      return;
    }
    setIsMarking(selectedCandidate.key);
    try {
      const apiRes = await presencaService.marcar(
        {
          telefone,
          nome: selectedCandidate.nome,
          circulo: toClean(manualCircle) || toClean(selectedCandidate.circulo),
          tipoEvento: eventType,
        },
        { googleWebAppUrl }
      );
      if (!apiRes.success) throw new Error(apiRes.error || 'Não foi possível registrar presença.');
      await fetchData();
      setSelectedCandidateKey('');
      setManualCircle('');
    } catch (err: any) {
      alert(err?.message || 'Erro ao registrar presença.');
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

      <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5 md:p-6 space-y-4">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Novo formulário de presença</h3>
          <p className="text-sm text-slate-500 mt-1 font-semibold">Selecione o evento primeiro. A lista de nomes muda conforme sua regra de negócio.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Tipo de evento</label>
            <select
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value as PresenceEventType);
                setSelectedCandidateKey('');
                setManualCircle('');
              }}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="POS_ENCONTRO">Pós-Encontro (encontreiro + encontrista)</option>
              <option value="REUNIAO_CIRCULO">Reunião de Círculo (somente encontrista)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Nome completo</label>
            <select
              value={selectedCandidateKey}
              onChange={(e) => setSelectedCandidateKey(e.target.value)}
              disabled={isLoadingPublico}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500 disabled:opacity-60"
            >
              <option value="">{isLoadingPublico ? 'Carregando nomes...' : 'Selecione o nome'}</option>
              {eventCandidates.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.nome} {item.origem === 'AMBOS' ? '(Encontreiro + Encontrista)' : item.origem === 'ENCONTREIRO' ? '(Encontreiro)' : '(Encontrista)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Círculo</label>
            <input
              value={manualCircle}
              onChange={(e) => setManualCircle(e.target.value)}
              placeholder="Ex: Azul / Círculo 1"
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs font-bold text-slate-500">
            Telefone para check-in: {selectedCandidate ? formatPhone(selectedCandidate.telefone) : '-'}
          </p>
          <button
            type="button"
            onClick={handleFormCheckin}
            disabled={Boolean(isMarking) || !selectedCandidate}
            className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60"
          >
            {isMarking === selectedCandidate?.key ? 'Processando...' : 'Registrar presença'}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => applyPresenceFilterFromIndicators('presentes_mes_atual')}
          className={`text-left rounded-2xl p-4 shadow-sm transition-all border ${
            appliedFilters.presenca === 'presentes' &&
            appliedFilters.mes === CURRENT_MONTH &&
            appliedFilters.ano === CURRENT_YEAR
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-100'
              : 'bg-white border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Presentes no mês atual</p>
          <p className="mt-2 text-2xl font-black text-emerald-700">{indicators.currentMonthPresentes}</p>
          <p className="text-[10px] font-bold text-emerald-600 mt-1">Contagem única de {MONTH_NAMES[CURRENT_MONTH]} / {CURRENT_YEAR}</p>
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
          onClick={() => applyPresenceFilterFromIndicators('total_no_filtro')}
          className={`text-left rounded-2xl p-4 shadow-sm transition-all border ${
            appliedFilters.presenca === 'todos'
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100'
              : 'bg-white border-blue-200 hover:bg-blue-50'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Total no filtro</p>
          <p className="mt-2 text-2xl font-black text-blue-700">{indicators.totalNoFiltro}</p>
        </button>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4 border border-slate-200 bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Presença Encontreiro</p>
          <p className="text-2xl font-black text-slate-800 mt-2">{segmentedIndicators.encontroeiroPresentes}</p>
        </div>
        <div className="rounded-2xl p-4 border border-slate-200 bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Presença Encontrista</p>
          <p className="text-2xl font-black text-slate-800 mt-2">{segmentedIndicators.encontristaPresentes}</p>
        </div>
        <div className="rounded-2xl p-4 border border-slate-200 bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Presença Pós-Encontro</p>
          <p className="text-2xl font-black text-slate-800 mt-2">{segmentedIndicators.posPresentes}</p>
        </div>
        <div className="rounded-2xl p-4 border border-slate-200 bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Presença Reunião Círculo</p>
          <p className="text-2xl font-black text-slate-800 mt-2">{segmentedIndicators.circuloPresentes}</p>
        </div>
      </section>

      <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5 md:p-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Top 5 mais presentes</h3>
        {topPresence.length === 0 ? (
          <p className="text-sm font-bold text-slate-400 mt-3">Sem dados de presença para o ranking.</p>
        ) : (
          <div className="mt-3 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-3">Posição</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Total de presenças</th>
                </tr>
              </thead>
              <tbody>
                {topPresence.map((item, idx) => (
                  <tr key={`${item.nome}-${idx}`} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-black">{idx + 1}</td>
                    <td className="py-2 pr-3 font-semibold">{item.nome}</td>
                    <td className="py-2 pr-3 font-bold text-slate-700">{item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Encontro</label>
                <select
                  value={draftFilters.encontro}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, encontro: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="">Todos os encontros</option>
                  {encontros.map((encontro) => (
                    <option key={encontro} value={encontro}>{encontro}</option>
                  ))}
                </select>
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Mês</label>
                <select
                  value={draftFilters.mes}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, mes: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="">Todos os meses</option>
                  {months.map((month) => (
                    <option key={month} value={month}>{MONTH_NAMES[month] || month}</option>
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
              <button
                key={item.circulo}
                type="button"
                onClick={() => applyCircleFilter(item.circulo === 'Não informado' ? '' : item.circulo)}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.circulo}</p>
                <p className="mt-2 text-sm font-black text-emerald-700">{item.presentes} presentes</p>
                <p className="text-xs font-bold text-slate-500">{item.faltantes} faltantes • {item.total} total</p>
              </button>
            ))}
          </div>
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

    </div>
  );
};

export default PresencePage;

