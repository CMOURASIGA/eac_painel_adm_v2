import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { EncontreiroRecord, User } from '../types.ts';
import { showAppConfirm } from '../utils/appDialog.ts';
import PersonCard from './PersonCard.tsx';
import { toCleanString } from '../utils/textEncoding.ts';
import DataOriginAudit from './DataOriginAudit.tsx';
import { encontreirosService } from '../services/encontreirosService.ts';

interface EncontreiroPageProps {
  user: User;
  googleWebAppUrl: string;
}

const PAGE_SIZE = 20;

type IndicatorFilter = 'novosSemestre' | null;

interface EncontreiroFormData {
  id?: string;
  timestamp: string;
  nomeCompleto: string;
  dataNascimento: string;
  idade: string;
  email: string;
  celularWhatsapp: string;
  enderecoCompleto: string;
  responsavelContato: string;
  bairro: string;
  frequentaMissas: string;
  ondeMissas: string;
  participaMovimento: string;
  movimentoParoquia: string;
  paroquiaFezEac: string;
  jaTrabalhouEac: string;
  jaCoordenouEquipe: string;
  paisFizeramEncontro: string;
  possuiAlergia: string;
  tomaRemedio: string;
  alimentacaoEspecial: string;
  sugestaoUltimoEncontro: string;
  dicaPosEncontro: string;
  classificacao: string;
}

const EMPTY_FORM: EncontreiroFormData = {
  timestamp: '',
  nomeCompleto: '',
  dataNascimento: '',
  idade: '',
  email: '',
  celularWhatsapp: '',
  enderecoCompleto: '',
  responsavelContato: '',
  bairro: '',
  frequentaMissas: '',
  ondeMissas: '',
  participaMovimento: '',
  movimentoParoquia: '',
  paroquiaFezEac: '',
  jaTrabalhouEac: '',
  jaCoordenouEquipe: '',
  paisFizeramEncontro: '',
  possuiAlergia: '',
  tomaRemedio: '',
  alimentacaoEspecial: '',
  sugestaoUltimoEncontro: '',
  dicaPosEncontro: '',
  classificacao: '',
};

const FIELD_DEFS: Array<{ key: keyof EncontreiroFormData; label: string; multiline?: boolean }> = [
  { key: 'nomeCompleto', label: 'Nome completo' },
  { key: 'dataNascimento', label: 'Data de nascimento' },
  { key: 'idade', label: 'Idade' },
  { key: 'email', label: 'E-mail' },
  { key: 'celularWhatsapp', label: 'Celular / WhatsApp' },
  { key: 'enderecoCompleto', label: 'Endereco completo', multiline: true },
  { key: 'responsavelContato', label: 'Responsavel / Parentesco / Contato', multiline: true },
  { key: 'bairro', label: 'Bairro onde mora' },
  { key: 'frequentaMissas', label: 'Frequenta missas?' },
  { key: 'ondeMissas', label: 'Se sim, onde?' },
  { key: 'participaMovimento', label: 'Participa de movimento da igreja?' },
  { key: 'movimentoParoquia', label: 'Se sim, qual e em qual paroquia?', multiline: true },
  { key: 'paroquiaFezEac', label: 'Paroquia onde fez o EAC' },
  { key: 'jaTrabalhouEac', label: 'Ja trabalhou em algum EAC?' },
  { key: 'jaCoordenouEquipe', label: 'Ja coordenou alguma equipe?' },
  { key: 'paisFizeramEncontro', label: 'Seus pais ja fizeram algum encontro?' },
  { key: 'possuiAlergia', label: 'Possui alergia? Se sim, qual?', multiline: true },
  { key: 'tomaRemedio', label: 'Toma remedio? Se sim, qual?', multiline: true },
  { key: 'alimentacaoEspecial', label: 'Possui alimentacao especial?', multiline: true },
  { key: 'sugestaoUltimoEncontro', label: 'Sugestao para melhorarmos', multiline: true },
  { key: 'dicaPosEncontro', label: 'Dica para pos-encontro', multiline: true },
  { key: 'classificacao', label: 'Classificacao' },
];
const REQUIRED_FIELDS = new Set<keyof EncontreiroFormData>(['nomeCompleto', 'celularWhatsapp', 'bairro']);
const SENSITIVE_FIELDS = new Set<keyof EncontreiroFormData>([
  'possuiAlergia',
  'tomaRemedio',
  'alimentacaoEspecial',
]);

const toClean = (value: any) => toCleanString(value);

const parseDateFlexible = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const raw = toClean(value);
  if (!raw) return null;

  // Prioriza formato brasileiro para evitar ambiguidade com parser nativo (MM/dd).
  const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]) - 1;
    const year = Number(brMatch[3]);
    const hour = Number(brMatch[4] || 0);
    const minute = Number(brMatch[5] || 0);
    const second = Number(brMatch[6] || 0);
    const parsed = new Date(year, month, day, hour, minute, second, 0);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Suporte explícito a ISO simples (yyyy-MM-dd / yyyy-MM-ddTHH:mm:ss).
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const hour = Number(isoMatch[4] || 0);
    const minute = Number(isoMatch[5] || 0);
    const second = Number(isoMatch[6] || 0);
    const parsed = new Date(year, month, day, hour, minute, second, 0);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const native = new Date(raw);
  return isNaN(native.getTime()) ? null : native;
};

const parseDateInputBoundary = (value: string, endOfDay: boolean): Date | null => {
  const raw = toClean(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (endOfDay) {
    return new Date(year, month, day, 23, 59, 59, 999);
  }
  return new Date(year, month, day, 0, 0, 0, 0);
};

const formatDate = (value: any) => {
  const date = parseDateFlexible(value);
  if (!date) return toClean(value) || '-';
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const formatDateTime = (value: any) => {
  const date = parseDateFlexible(value);
  if (!date) return toClean(value) || '-';
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const calculateAge = (birthDate: string) => {
  const birth = parseDateFlexible(birthDate);
  if (!birth) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
};

const formatAgeLabel = (record: EncontreiroRecord) => {
  const raw = toClean(record.idade) || calculateAge(toClean(record.dataNascimento));
  if (!raw) return '-';
  const digits = String(raw).match(/\d+/)?.[0];
  if (digits) return `${digits} anos`;
  if (String(raw).toLowerCase().includes('ano')) return String(raw);
  return `${raw} anos`;
};

const getAgeBadgeClass = (record: EncontreiroRecord) => {
  const ageText = formatAgeLabel(record);
  const ageNum = Number(String(ageText).match(/\d+/)?.[0] || NaN);
  if (!isFinite(ageNum)) return 'bg-slate-100 border-slate-200 text-slate-700';
  if (ageNum <= 11) return 'bg-amber-100 border-amber-300 text-amber-800';
  if (ageNum <= 16) return 'bg-blue-100 border-blue-300 text-blue-800';
  return 'bg-purple-100 border-purple-300 text-purple-800';
};

const getYesNoBadgeClass = (value: string) => {
  const raw = toClean(value).toLowerCase();
  if (raw === 'sim') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (raw === 'não' || raw === 'nao') return 'bg-slate-100 text-slate-700 border border-slate-200';
  return 'bg-slate-50 text-slate-500 border border-slate-200';
};

const getCurrentBusinessSemesterRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1..12

  // Regra solicitada:
  // - Se estamos no 1o semestre: considera 01..06
  // - Se estamos no 2o semestre: considera 06..12
  const start = month <= 6
    ? new Date(year, 0, 1, 0, 0, 0, 0)
    : new Date(year, 5, 1, 0, 0, 0, 0);

  const end = month <= 6
    ? new Date(year, 5, 30, 23, 59, 59, 999)
    : new Date(year, 11, 31, 23, 59, 59, 999);

  return { start, end };
};

const isInCurrentBusinessSemester = (value: any) => {
  const date = parseDateFlexible(value);
  if (!date) return false;
  const { start, end } = getCurrentBusinessSemesterRange();
  return date >= start && date <= end;
};

const EncontreiroPage: React.FC<EncontreiroPageProps> = ({ user, googleWebAppUrl }) => {
  const [records, setRecords] = useState<EncontreiroRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [normalizingId, setNormalizingId] = useState<string | null>(null);

  const [indicators, setIndicators] = useState({ total: 0, novosSemestre: 0 });
  const [bairroStats, setBairroStats] = useState<Array<{ nome: string; quantidade: number }>>([]);

  const [indicatorFilter, setIndicatorFilter] = useState<IndicatorFilter>(null);
  const [bairroCardFilter, setBairroCardFilter] = useState<string>('');
  const [appliedIndicatorFilter, setAppliedIndicatorFilter] = useState<IndicatorFilter>(null);
  const [appliedBairroCardFilter, setAppliedBairroCardFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(true);

  // Filtros (draft): editados na UI sem aplicar automaticamente.
  const [searchTerm, setSearchTerm] = useState('');
  const [bairroFilter, setBairroFilter] = useState('');
  const [frequentaMissasFilter, setFrequentaMissasFilter] = useState('');
  const [participaMovimentoFilter, setParticipaMovimentoFilter] = useState('');
  const [classificacaoFilter, setClassificacaoFilter] = useState('');
  const [dataInicioFilter, setDataInicioFilter] = useState('');
  const [dataFimFilter, setDataFimFilter] = useState('');
  // Filtros aplicados: só mudam ao clicar em "Pesquisar".
  const [appliedFilters, setAppliedFilters] = useState({
    searchTerm: '',
    bairroFilter: '',
    frequentaMissasFilter: '',
    participaMovimentoFilter: '',
    classificacaoFilter: '',
    dataInicioFilter: '',
    dataFimFilter: '',
  });
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<EncontreiroFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState<EncontreiroRecord | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [equipes, setEquipes] = useState<Array<{ id: string; nome: string }>>([]);
  const [selectedEquipeIds, setSelectedEquipeIds] = useState<string[]>([]);

  const modulePerm = user.permissions?.modulePermissions?.encontreiros;
  const canCreate = user.role === 'ADMIN' || Boolean(modulePerm?.canCreate ?? user.permissions?.canCreate);
  const canEdit = user.role === 'ADMIN' || Boolean(modulePerm?.canEdit ?? user.permissions?.canEdit);
  const canDelete = user.role === 'ADMIN' || Boolean(modulePerm?.canDelete ?? user.permissions?.canDelete);
  const canViewSensitiveData = user.role === 'ADMIN' || Boolean((modulePerm as any)?.canViewSensitive);

  const uniqueBairros = useMemo(() => {
    return [...new Set((records || []).map(r => toClean(r.bairro)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [records]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await encontreirosService.listar(
        { classificacao: appliedFilters.classificacaoFilter || '', includeSensitive: canViewSensitiveData },
        { googleWebAppUrl }
      );
      const result: any = r.success
        ? { success: true, encontreiros: r.data.items, indicators: r.data.indicators, bairroStats: r.data.bairroStats }
        : { success: false, error: r.error };
      if (!result?.success) throw new Error(result?.error || 'Falha ao carregar cadastro de encontreiros.');

      setRecords(Array.isArray(result.encontreiros) ? result.encontreiros : []);
      setIndicators({
        total: Number(result?.indicators?.total) || 0,
        novosSemestre: Number(result?.indicators?.novosSemestre ?? result?.indicators?.novos7dias) || 0,
      });
      setBairroStats(Array.isArray(result?.bairroStats) ? result.bairroStats : []);
    } catch (err: any) {
      alert(err?.message || 'Erro ao carregar cadastro de encontreiros.');
    } finally {
      setIsLoading(false);
    }
  }, [googleWebAppUrl, appliedFilters.classificacaoFilter, canViewSensitiveData]);

  const fetchEquipes = useCallback(async () => {
    try {
      const r = await encontreirosService.listarEquipes({ googleWebAppUrl });
      if (!r.success) return;
      const list = Array.isArray(r.data?.equipes) ? r.data.equipes : [];
      setEquipes(
        list
          .map((e: any) => ({ id: toClean(e.id), nome: toClean(e.nome) || toClean(e.descricao) || '-' }))
          .filter((e: any) => e.id)
      );
    } catch {
      // sem bloqueio da tela
    }
  }, [googleWebAppUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchEquipes();
  }, [fetchEquipes]);

  const filteredRecords = useMemo(() => {
    let list = [...records];

    if (appliedIndicatorFilter === 'novosSemestre') {
      list = list.filter(r => isInCurrentBusinessSemester(r.timestamp));
    }

    if (appliedBairroCardFilter) {
      list = list.filter(r => toClean(r.bairro).toLowerCase() === appliedBairroCardFilter.toLowerCase());
    }

    const search = appliedFilters.searchTerm.toLowerCase().trim();
    if (search) {
      list = list.filter((r) => {
        const name = toClean(r.nomeCompleto).toLowerCase();
        const email = toClean(r.email).toLowerCase();
        const phone = toClean(r.celularWhatsapp).toLowerCase();
        const bairro = toClean(r.bairro).toLowerCase();
        return name.includes(search) || email.includes(search) || phone.includes(search) || bairro.includes(search);
      });
    }

    if (appliedFilters.bairroFilter) {
      list = list.filter(r => toClean(r.bairro).toLowerCase() === appliedFilters.bairroFilter.toLowerCase());
    }

    if (appliedFilters.frequentaMissasFilter) {
      list = list.filter(r => toClean(r.frequentaMissas).toLowerCase() === appliedFilters.frequentaMissasFilter.toLowerCase());
    }

    if (appliedFilters.participaMovimentoFilter) {
      list = list.filter(r => toClean(r.participaMovimento).toLowerCase() === appliedFilters.participaMovimentoFilter.toLowerCase());
    }

    if (appliedFilters.classificacaoFilter) {
      list = list.filter(r => toClean(r.classificacao).toLowerCase() === appliedFilters.classificacaoFilter.toLowerCase());
    }

    const inicio = parseDateInputBoundary(appliedFilters.dataInicioFilter, false);
    if (inicio) {
      list = list.filter((r) => {
        const ts = parseDateFlexible(r.timestamp);
        return Boolean(ts && ts >= inicio);
      });
    }

    const fim = parseDateInputBoundary(appliedFilters.dataFimFilter, true);
    if (fim) {
      list = list.filter((r) => {
        const ts = parseDateFlexible(r.timestamp);
        return Boolean(ts && ts <= fim);
      });
    }

    list.sort((a, b) => {
      const da = parseDateFlexible(a.timestamp);
      const db = parseDateFlexible(b.timestamp);
      if (da && db) return da.getTime() - db.getTime();
      if (da) return 1;
      if (db) return -1;
      return (a.rowNumber || 0) - (b.rowNumber || 0);
    });

    return list;
  }, [records, appliedIndicatorFilter, appliedBairroCardFilter, appliedFilters]);

  const applyFilters = () => {
    setAppliedIndicatorFilter(indicatorFilter);
    setAppliedBairroCardFilter(bairroCardFilter);
    setAppliedFilters({
      searchTerm,
      bairroFilter,
      frequentaMissasFilter,
      participaMovimentoFilter,
      classificacaoFilter,
      dataInicioFilter,
      dataFimFilter,
    });
    setPage(1);
  };

  const resetFilters = async () => {
    setIndicatorFilter(null);
    setBairroCardFilter('');
    setAppliedIndicatorFilter(null);
    setAppliedBairroCardFilter('');
    setSearchTerm('');
    setBairroFilter('');
    setFrequentaMissasFilter('');
    setParticipaMovimentoFilter('');
    setClassificacaoFilter('');
    setDataInicioFilter('');
    setDataFimFilter('');
    setAppliedFilters({
      searchTerm: '',
      bairroFilter: '',
      frequentaMissasFilter: '',
      participaMovimentoFilter: '',
      classificacaoFilter: '',
      dataInicioFilter: '',
      dataFimFilter: '',
    });
    setPage(1);
    await fetchData();
  };

  useEffect(() => {
    setPage(1);
  }, [appliedIndicatorFilter, appliedBairroCardFilter, appliedFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, safePage]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const exportCsv = () => {
    try {
      const headers = [
        'Timestamp',
        'Nome completo',
        'Data de nascimento',
        'Idade',
        'E-mail',
        'Celular / WhatsApp',
        'Endereco completo',
        'Responsavel / Parentesco / Contato',
        'Bairro onde mora',
        'Frequenta missas?',
        'Se sim, onde?',
        'Participa de movimento da igreja?',
        'Se sim, qual e em qual paroquia?',
        'Paroquia onde fez o EAC',
        'Ja trabalhou em algum EAC?',
        'Ja coordenou alguma equipe?',
        'Seus pais ja fizeram algum encontro?',
        'Possui alergia? Se sim, qual?',
        'Toma remedio? Se sim, qual?',
        'Possui alimentacao especial?',
        'Sugestao para melhorarmos',
        'Dica para pos-encontro',
        'Classificacao',
      ];

      const rows = filteredRecords.map((r) => ([
        formatDateTime(r.timestamp),
        toClean(r.nomeCompleto),
        formatDate(r.dataNascimento),
        toClean(r.idade) || calculateAge(toClean(r.dataNascimento)),
        toClean(r.email),
        toClean(r.celularWhatsapp),
        toClean(r.enderecoCompleto),
        toClean(r.responsavelContato),
        toClean(r.bairro),
        toClean(r.frequentaMissas),
        toClean(r.ondeMissas),
        toClean(r.participaMovimento),
        toClean(r.movimentoParoquia),
        toClean(r.paroquiaFezEac),
        toClean(r.jaTrabalhouEac),
        toClean(r.jaCoordenouEquipe),
        toClean(r.paisFizeramEncontro),
        canViewSensitiveData ? toClean(r.possuiAlergia) : 'SEM PERMISSAO',
        canViewSensitiveData ? toClean(r.tomaRemedio) : 'SEM PERMISSAO',
        canViewSensitiveData ? toClean(r.alimentacaoEspecial) : 'SEM PERMISSAO',
        toClean(r.sugestaoUltimoEncontro),
        toClean(r.dicaPosEncontro),
        toClean(r.classificacao),
      ]));

      const sep = ';';
      const esc = (value: any) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
      const csv = '\ufeff' + [headers.map(esc).join(sep), ...rows.map(row => row.map(esc).join(sep))].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const filename = `cadastro_encontreiro_${yyyy}-${mm}-${dd}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Nao foi possivel exportar o CSV.');
    }
  };

  const openNewForm = () => {
    setFormData(EMPTY_FORM);
    setSelectedEquipeIds([]);
    setShowForm(true);
  };

  const openEditForm = (record: EncontreiroRecord) => {
    setFormData({
      id: record.id,
      timestamp: toClean(record.timestamp),
      nomeCompleto: toClean(record.nomeCompleto),
      dataNascimento: toClean(record.dataNascimento),
      idade: toClean(record.idade),
      email: toClean(record.email),
      celularWhatsapp: toClean(record.celularWhatsapp),
      enderecoCompleto: toClean(record.enderecoCompleto),
      responsavelContato: toClean(record.responsavelContato),
      bairro: toClean(record.bairro),
      frequentaMissas: toClean(record.frequentaMissas),
      ondeMissas: toClean(record.ondeMissas),
      participaMovimento: toClean(record.participaMovimento),
      movimentoParoquia: toClean(record.movimentoParoquia),
      paroquiaFezEac: toClean(record.paroquiaFezEac),
      jaTrabalhouEac: toClean(record.jaTrabalhouEac),
      jaCoordenouEquipe: toClean(record.jaCoordenouEquipe),
      paisFizeramEncontro: toClean(record.paisFizeramEncontro),
      possuiAlergia: toClean(record.possuiAlergia),
      tomaRemedio: toClean(record.tomaRemedio),
      alimentacaoEspecial: toClean(record.alimentacaoEspecial),
      sugestaoUltimoEncontro: toClean(record.sugestaoUltimoEncontro),
      dicaPosEncontro: toClean(record.dicaPosEncontro),
      classificacao: toClean(record.classificacao),
    });
    setSelectedEquipeIds([]);
    setShowForm(true);
    void (async () => {
      const r = await encontreirosService.listarEquipesDoEncontreiro({ encontreiroId: record.id }, { googleWebAppUrl });
      if (r.success) {
        setSelectedEquipeIds(Array.isArray(r.data?.equipeIds) ? r.data.equipeIds : []);
      }
    })();
  };

  const handleSave = async () => {
    if (!toClean(formData.nomeCompleto)) {
      alert('Nome completo e obrigatorio.');
      return;
    }
    if (!toClean(formData.celularWhatsapp)) {
      alert('Celular / WhatsApp e obrigatorio.');
      return;
    }
    if (!toClean(formData.bairro)) {
      alert('Bairro e obrigatorio.');
      return;
    }

    const payload = {
      ...formData,
      idade: toClean(formData.idade) || calculateAge(formData.dataNascimento),
    };

    setIsSaving(true);
    try {
      const apiRes = await encontreirosService.salvar(payload, { googleWebAppUrl });
      if (!apiRes.success) throw new Error(apiRes.error || 'Nao foi possivel salvar.');
      const savedId = toClean((apiRes.data as any)?.data?.id) || toClean(formData.id);
      if (savedId) {
        const vinculoRes = await encontreirosService.salvarEquipesDoEncontreiro(
          { encontreiroId: savedId, equipeIds: selectedEquipeIds },
          { googleWebAppUrl }
        );
        if (!vinculoRes.success) {
          throw new Error(vinculoRes.error || 'Nao foi possivel salvar vinculos de equipe.');
        }
      }
      setShowForm(false);
      await fetchData();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar cadastro de encontreiro.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (record: EncontreiroRecord) => {
    if (!canDelete) return;
    const ok = await showAppConfirm({
      title: 'Excluir cadastro',
      message: `Excluir o cadastro de ${toClean(record.nomeCompleto) || 'encontreiro'}?`,
      tone: 'warning',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    setIsLoading(true);
    try {
      const apiRes = await encontreirosService.excluir({ id: record.id }, { googleWebAppUrl });
      if (!apiRes.success) throw new Error(apiRes.error || 'Nao foi possivel excluir.');
      await fetchData();
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir cadastro.');
      setIsLoading(false);
    }
  };

  const handleOpenWhatsapp = async (record: EncontreiroRecord) => {
    setNormalizingId(record.id);
    try {
      const apiRes = await encontreirosService.normalizarWhatsapp({ id: record.id }, { googleWebAppUrl });
      const result: any = apiRes.success ? { success: true, ...(apiRes.data as any) } : { success: false, error: apiRes.error };
      if (!result?.success) throw new Error(result?.error || 'Nao foi possivel normalizar o WhatsApp.');

      const link = result?.whatsappLink;
      const celularWhatsapp = result?.celularWhatsapp;

      if (celularWhatsapp) {
        setRecords(prev => prev.map(item => item.id === record.id ? { ...item, celularWhatsapp, whatsappNormalizado: celularWhatsapp, whatsappLink: link || `https://wa.me/${celularWhatsapp}` } : item));
      }

      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      } else {
        alert('WhatsApp normalizado, mas o link nao foi gerado.');
      }
    } catch (err: any) {
      alert(err?.message || 'Erro ao abrir WhatsApp.');
    } finally {
      setNormalizingId(null);
    }
  };

  const indicatorButtonClass = (active: boolean) => {
    return `p-5 rounded-[1.8rem] border transition-all min-w-[180px] text-left ${active ? 'bg-blue-600 border-blue-600 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-700 hover:shadow-md'}`;
  };

  return (
    <div className="p-4 md:p-8 max-w-[100rem] mx-auto animate-in fade-in duration-500 pb-24 space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 leading-none">Cadastro de Encontreiros</h2>
          <p className="text-slate-500 font-bold mt-2 text-sm">Gestao completa de encontreiros com indicadores e filtros.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {canCreate && (
            <button
              onClick={openNewForm}
              className="px-6 py-4 blue-gradient text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm"
            >
              Novo Cadastro
            </button>
          )}
          <button
            onClick={exportCsv}
            className="px-6 py-4 bg-white text-slate-700 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-slate-50"
            title="Exporta os dados com os filtros atuais"
          >
            Exportar CSV
          </button>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="px-6 py-4 bg-slate-100 border border-slate-200 rounded-2xl text-slate-600 font-black text-[10px] uppercase tracking-widest disabled:opacity-60 hover:bg-slate-200"
          >
            {isLoading ? 'Carregando...' : 'Recarregar'}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          className={indicatorButtonClass(indicatorFilter === null)}
          onClick={() => setIndicatorFilter(null)}
        >
          <p className={`text-[10px] font-black uppercase tracking-widest ${indicatorFilter === null ? 'text-blue-100' : 'text-slate-400'}`}>Total de encontreiros</p>
          <p className="text-3xl font-black mt-2">{indicators.total}</p>
        </button>

        <button
          className={indicatorButtonClass(indicatorFilter === 'novosSemestre')}
          onClick={() => setIndicatorFilter(prev => prev === 'novosSemestre' ? null : 'novosSemestre')}
        >
          <p className={`text-[10px] font-black uppercase tracking-widest ${indicatorFilter === 'novosSemestre' ? 'text-blue-100' : 'text-slate-400'}`}>Novos no semestre</p>
          <p className="text-3xl font-black mt-2">{indicators.novosSemestre}</p>
        </button>
      </section>

      <section className="bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Indicador por bairro</h3>
          <button
            type="button"
            onClick={() => setBairroCardFilter('')}
            className="px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50"
          >
            Limpar bairro
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setBairroCardFilter('')}
            className={`px-4 py-3 rounded-2xl border text-left min-w-[150px] ${bairroCardFilter ? 'bg-white border-slate-200' : 'bg-blue-600 border-blue-600 text-white'}`}
          >
            <p className={`text-[10px] font-black uppercase tracking-widest ${bairroCardFilter ? 'text-slate-400' : 'text-blue-100'}`}>Todos</p>
            <p className="text-lg font-black">{indicators.total}</p>
          </button>

          {bairroStats.map((bairro) => {
            const nome = toClean(bairro.nome) || 'Nao informado';
            const active = bairroCardFilter.toLowerCase() === nome.toLowerCase();
            return (
              <button
                key={nome}
                type="button"
                onClick={() => setBairroCardFilter(active ? '' : nome)}
                className={`px-4 py-3 rounded-2xl border text-left min-w-[170px] transition-all ${active ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 hover:shadow-sm'}`}
              >
                <p className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-blue-100' : 'text-slate-400'}`}>{nome}</p>
                <p className="text-lg font-black">{Number(bairro.quantidade) || 0}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtros de pesquisa</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50"
            >
              {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Busca geral</label>
                <input
                  className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Buscar por nome, e-mail, telefone ou bairro"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
                <select
                  className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                  value={bairroFilter}
                  onChange={(e) => setBairroFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  {uniqueBairros.map((bairro) => (
                    <option key={bairro} value={bairro}>{bairro}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Frequenta missas?</label>
                <select
                  className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                  value={frequentaMissasFilter}
                  onChange={(e) => setFrequentaMissasFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="Sim">Sim</option>
                  <option value="Nao">Nao</option>
                  <option value="Nao">Nao</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Participa de movimento?</label>
                <select
                  className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                  value={participaMovimentoFilter}
                  onChange={(e) => setParticipaMovimentoFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="Sim">Sim</option>
                  <option value="Nao">Nao</option>
                  <option value="Nao">Nao</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Classificacao</label>
                <select
                  className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                  value={classificacaoFilter}
                  onChange={(e) => setClassificacaoFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="Adulto">Adulto</option>
                  <option value="Adolescente">Adolescente</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data inicio</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                  value={dataInicioFilter}
                  onChange={(e) => setDataInicioFilter(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data fim</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                  value={dataFimFilter}
                  onChange={(e) => setDataFimFilter(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={async () => { await resetFilters(); }}
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
          </div>
        )}
      </section>

      <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registros ({filteredRecords.length})</h3>
        </div>

        <div className="p-4 md:p-6">
          {filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-400 font-bold text-sm">
              Nenhum registro encontrado com os filtros atuais.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
              {paginatedRecords.map((record) => (
                <PersonCard
                  key={record.id}
                  ageLabel={formatAgeLabel(record)}
                  ageClassName={getAgeBadgeClass(record)}
                  nome={toClean(record.nomeCompleto) || '-'}
                  bairro={toClean(record.bairro) || 'Bairro nao informado'}
                  cadastroText={`Cadastro: ${formatDate(record.timestamp)}`}
                  badges={[
                    {
                      label: `Frequenta missas: ${toClean(record.frequentaMissas) || '-'}`,
                      className: getYesNoBadgeClass(toClean(record.frequentaMissas))
                    },
                    {
                      label: `Participa movimento: ${toClean(record.participaMovimento) || '-'}`,
                      className: getYesNoBadgeClass(toClean(record.participaMovimento))
                    }
                  ]}
                  actions={[
                    {
                      key: 'view',
                      title: 'Visualizar',
                      variant: 'view',
                      onClick: () => { setSelectedRecord(record); setShowDetails(true); },
                      icon: (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )
                    },
                    ...(canEdit ? [{
                      key: 'edit',
                      title: 'Editar',
                      variant: 'edit' as const,
                      onClick: () => openEditForm(record),
                      icon: (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      )
                    }] : []),
                    {
                      key: 'whatsapp',
                      title: normalizingId === record.id ? 'Ajustando WhatsApp' : 'WhatsApp',
                      variant: 'whatsapp',
                      onClick: () => handleOpenWhatsapp(record),
                      disabled: normalizingId === record.id,
                      icon: normalizingId === record.id
                        ? <span className="w-4 h-4 rounded-full border-2 border-green-300 border-t-green-700 animate-spin" />
                        : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 11.5A8.5 8.5 0 0 1 8.4 19l-4.2 1 1.1-4A8.5 8.5 0 1 1 21 11.5Z" />
                          </svg>
                        )
                    },
                    ...(canDelete ? [{
                      key: 'delete',
                      title: 'Excluir',
                      variant: 'delete' as const,
                      onClick: () => handleDelete(record),
                      icon: (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 7h12" />
                          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          <path d="m8 7 1 12h6l1-12" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      )
                    }] : []),
                  ]}
                />
              ))}
            </div>
          )}
        </div>

        {filteredRecords.length > 0 && (
          <div className="px-4 md:px-6 py-4 border-t bg-slate-50 flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Pagina {safePage} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50"
              >
                Anterior
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                .map((n, i, arr) => (
                  <React.Fragment key={`p-${n}`}>
                    {i > 0 && arr[i - 1] !== n - 1 && (
                      <span className="text-slate-400 text-xs font-black px-1">...</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPage(n)}
                      className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                        n === safePage
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {n}
                    </button>
                  </React.Fragment>
                ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50"
              >
                Proximo
              </button>
            </div>
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden">
            <div className="blue-gradient px-6 md:px-8 py-5 text-white flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100">Cadastro de Encontreiro</p>
                <h3 className="text-xl md:text-2xl font-black">{formData.id ? 'Editar registro' : 'Novo registro'}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto max-h-[calc(92vh-170px)]">
              <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold">
                Campos obrigatorios marcados com <span className="text-rose-600">*</span>.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {FIELD_DEFS.filter((field) => canViewSensitiveData || !SENSITIVE_FIELDS.has(field.key)).map((field) => (
                  <div key={String(field.key)} className={field.multiline ? 'md:col-span-2' : ''}>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      {field.label}
                      {REQUIRED_FIELDS.has(field.key) ? <span className="text-rose-600 ml-1">*</span> : null}
                    </label>
                    {field.multiline ? (
                      <textarea
                        rows={3}
                        className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 resize-y"
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    ) : (
                      <input
                        className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                        value={formData[field.key] || ''}
                        placeholder={REQUIRED_FIELDS.has(field.key) ? 'Obrigatorio' : 'Opcional'}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Equipes vinculadas</label>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {equipes.length === 0 ? (
                    <p className="text-xs font-bold text-slate-500">Nenhuma equipe cadastrada.</p>
                  ) : (
                    equipes.map((eq) => {
                      const checked = selectedEquipeIds.includes(eq.id);
                      return (
                        <label key={eq.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEquipeIds((prev) => Array.from(new Set([...prev, eq.id])));
                              } else {
                                setSelectedEquipeIds((prev) => prev.filter((id) => id !== eq.id));
                              }
                            }}
                          />
                          <span className="text-sm font-bold text-slate-700">{eq.nome}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 md:px-8 py-4 bg-slate-50 border-t flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-8 py-3 rounded-2xl blue-gradient text-white font-black text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-60"
              >
                {isSaving ? 'Salvando...' : 'Salvar cadastro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetails && selectedRecord && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden">
            <div className="px-6 md:px-8 py-5 border-b flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Visualizacao completa</p>
                <h3 className="text-xl md:text-2xl font-black text-slate-900">{toClean(selectedRecord.nomeCompleto) || 'Cadastro de encontreiro'}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto max-h-[calc(92vh-120px)]">
              {!canViewSensitiveData && (
                <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold">
                  Dados medicos/alimentares ocultos para o seu perfil.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FIELD_DEFS.filter((field) => canViewSensitiveData || !SENSITIVE_FIELDS.has(field.key)).map((field) => {
                  const value = toClean((selectedRecord as any)[field.key]);
                  return (
                    <div key={String(field.key)} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{field.label}</p>
                      <p className="mt-2 text-sm font-bold text-slate-700 whitespace-pre-wrap">{value || '-'}</p>
                    </div>
                  );
                })}

                <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Timestamp</p>
                  <p className="mt-2 text-sm font-bold text-slate-700">{formatDateTime(selectedRecord.timestamp)}</p>
                </div>

                <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">WhatsApp normalizado</p>
                  <p className="mt-2 text-sm font-bold text-slate-700">{toClean(selectedRecord.whatsappNormalizado) || '-'}</p>
                </div>

                <div className="md:col-span-2">
                  <DataOriginAudit record={selectedRecord} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EncontreiroPage;




