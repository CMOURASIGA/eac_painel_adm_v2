import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Drawer from './Drawer.tsx';
import { inscricoesService, type EncontroItem, type InscricaoAdminItem, type InscricoesAdminFilters } from '../services/inscricoesService.ts';

type Pagination = { page: number; page_size: number; total: number; total_pages: number };
type Summary = { total: number; por_status: Record<string, number> };

const STATUS_OPTIONS = [
  'INSCRITO',
  'EM_ANALISE',
  'PRIORIZADO',
  'FILA',
  'CONFIRMADO',
  'NAO_SELECIONADO',
  'DESISTENTE',
  'CANCELADO',
];

const STATUS_CHANGE_OPTIONS = [
  'EM_ANALISE',
  'PRIORIZADO',
  'FILA',
  'CONFIRMADO',
  'NAO_SELECIONADO',
  'DESISTENTE',
  'CANCELADO',
];

const JUSTIFICATIVA_OBRIGATORIA_STATUS = new Set(['NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO']);
const QUICK_STATUS_OPTIONS = ['EM_ANALISE', 'PRIORIZADO', 'FILA', 'CONFIRMADO'];
const STATUS_TRANSITIONS_ALLOWED: Record<string, string[]> = {
  INSCRITO: ['EM_ANALISE', 'PRIORIZADO', 'FILA', 'NAO_SELECIONADO', 'CANCELADO'],
  EM_ANALISE: ['PRIORIZADO', 'FILA', 'CONFIRMADO', 'NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO'],
  PRIORIZADO: ['EM_ANALISE', 'FILA', 'CONFIRMADO', 'NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO'],
  FILA: ['EM_ANALISE', 'PRIORIZADO', 'CONFIRMADO', 'NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO'],
  CONFIRMADO: ['FILA', 'NAO_SELECIONADO', 'DESISTENTE', 'CANCELADO'],
  NAO_SELECIONADO: ['EM_ANALISE', 'FILA', 'DESISTENTE', 'CANCELADO'],
  DESISTENTE: ['EM_ANALISE', 'FILA'],
  CANCELADO: ['EM_ANALISE', 'FILA'],
};

const ORIGEM_OPTIONS = ['SISTEMA', 'PLANILHA'];

function formatDateTime(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const dt = new Date(raw);
  if (isNaN(dt.getTime())) return raw;
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function getAllowedStatusTargets(statusAtual: string) {
  return STATUS_TRANSITIONS_ALLOWED[String(statusAtual || '').trim()] || [];
}

function splitBairroAndEmail(rawBairro: any, fallbackEmail: any) {
  const bairroRaw = String(rawBairro || '').trim();
  const fallback = String(fallbackEmail || '').trim();
  const emailRegex = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
  const match = bairroRaw.match(emailRegex);
  if (!match) {
    return { bairro: bairroRaw || '-', email: fallback || '-' };
  }

  const email = match[1];
  const bairro = bairroRaw.replace(email, '').replace(/[,\s]+$/g, '').trim();
  return { bairro: bairro || '-', email: fallback || email || '-' };
}

function getInitials(name: any) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '--';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function getAdminInfo() {
  if (typeof window === 'undefined') return { alterado_por: undefined, alterado_por_nome: undefined };

  const candidates = ['user', 'usuario', 'authUser', 'currentUser'];
  for (const key of candidates) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const alteradoPor = String(parsed?.id || parsed?.email || parsed?.uid || '').trim() || undefined;
      const alteradoPorNome = String(parsed?.name || parsed?.nome || parsed?.displayName || '').trim() || undefined;
      if (alteradoPor || alteradoPorNome) return { alterado_por: alteradoPor, alterado_por_nome: alteradoPorNome };
    } catch {
      // ignora conteúdo não JSON
    }
  }

  return { alterado_por: undefined, alterado_por_nome: undefined };
}

const ActionIconButton: React.FC<{
  title: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, className = '', disabled = false, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    disabled={disabled}
    className={`w-9 h-9 rounded-xl border flex items-center justify-center disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2 12c2.7-4.5 6-7 10-7s7.3 2.5 10 7c-2.7 4.5-6 7-10 7s-7.3-2.5-10-7Z" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m4 20 4.5-1 9.2-9.2a1.8 1.8 0 0 0 0-2.6l-.9-.9a1.8 1.8 0 0 0-2.6 0L5 15.5 4 20Z" stroke="currentColor" strokeWidth="1.8" />
    <path d="m12.5 7.5 4 4" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 7V5h6v2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M7 7l1 12h8l1-12" stroke="currentColor" strokeWidth="1.8" />
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" fill="currentColor" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m5 12 4 4 10-10" stroke="currentColor" strokeWidth="2.2" />
  </svg>
);

const MinusCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 12h8" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

function escapeCsvCell(value: any) {
  const raw = String(value ?? '');
  if (/[;"\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

const TRIAGEM_EXPORT_LABELS: Record<string, string> = {
  inscricao_id: 'Inscrição ID',
  status_inscricao: 'Status inscrição',
  origem_inscricao: 'Origem inscrição',
  criado_via_sistema: 'Criado via sistema',
  data_inscricao: 'Data inscrição',
  criado_em: 'Criado em',
  encontro_id: 'Encontro ID',
  encontro_nome: 'Encontro',
  encontro_numero: 'Número encontro',
  encontro_status: 'Status encontro',
  data_inicio_encontro: 'Data início encontro',
  data_fim_encontro: 'Data fim encontro',
  adolescente_id: 'Adolescente ID',
  aceite_normas: 'Aceite normas',
  ja_fez_eac: 'Já fez EAC',
  pessoa_adolescente_id: 'Pessoa adolescente ID',
  nome_adolescente: 'Nome adolescente',
  nome_adolescente_normalizado: 'Nome adolescente normalizado',
  data_nascimento: 'Data nascimento',
  sexo: 'Sexo',
  email_adolescente: 'E-mail adolescente',
  idade_calculada: 'Idade calculada',
  telefone_adolescente: 'Telefone adolescente',
  telefone_adolescente_normalizado: 'Telefone adolescente normalizado',
  endereco: 'Endereço',
  bairro: 'Bairro',
  observacoes: 'Observações',
  vinculo_responsavel_id: 'Vínculo responsável ID',
  responsavel_principal: 'Responsável principal',
  grau_parentesco: 'Grau parentesco',
  responsavel_id: 'Responsável ID',
  nome_responsavel: 'Nome responsável',
  telefone_responsavel: 'Telefone responsável',
  telefone_responsavel_normalizado: 'Telefone responsável normalizado',
  email_responsavel: 'E-mail responsável',
};

const TRIAGEM_EXPORT_PRIORITY = [
  'inscricao_id',
  'status_inscricao',
  'origem_inscricao',
  'criado_via_sistema',
  'data_inscricao',
  'criado_em',
  'encontro_id',
  'encontro_nome',
  'encontro_numero',
  'encontro_status',
  'data_inicio_encontro',
  'data_fim_encontro',
  'adolescente_id',
  'aceite_normas',
  'ja_fez_eac',
  'pessoa_adolescente_id',
  'nome_adolescente',
  'nome_adolescente_normalizado',
  'data_nascimento',
  'sexo',
  'email_adolescente',
  'idade_calculada',
  'telefone_adolescente',
  'telefone_adolescente_normalizado',
  'endereco',
  'bairro',
  'observacoes',
  'vinculo_responsavel_id',
  'responsavel_principal',
  'grau_parentesco',
  'responsavel_id',
  'nome_responsavel',
  'telefone_responsavel',
  'telefone_responsavel_normalizado',
  'email_responsavel',
];

function getTriagemExportColumns(items: InscricaoAdminItem[]) {
  const keys = new Set<string>();
  items.forEach((item) => {
    Object.keys(item || {}).forEach((key) => keys.add(key));
  });
  const rest = Array.from(keys).filter((key) => !TRIAGEM_EXPORT_PRIORITY.includes(key)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return [...TRIAGEM_EXPORT_PRIORITY.filter((key) => keys.has(key)), ...rest];
}

function getTriagemExportLabel(key: string) {
  return TRIAGEM_EXPORT_LABELS[key] || key;
}

function formatTriagemExportValue(key: string, value: any) {
  if (key === 'data_inscricao' || key === 'criado_em') return formatDateTime(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return value ?? '';
}

const InscricoesReviewPage: React.FC = () => {
  const [items, setItems] = useState<InscricaoAdminItem[]>([]);
  const [encontros, setEncontros] = useState<EncontroItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, por_status: {} });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 25, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<InscricaoAdminItem | null>(null);

  const [newStatus, setNewStatus] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [submittingCadastro, setSubmittingCadastro] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cadastroFeedback, setCadastroFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cadastroForm, setCadastroForm] = useState({
    nome_adolescente: '',
    data_nascimento: '',
    sexo: '',
    endereco: '',
    email_adolescente: '',
    telefone_adolescente: '',
    bairro: '',
    nome_responsavel: '',
    email_responsavel: '',
    telefone_responsavel: '',
  });

  const [draft, setDraft] = useState<InscricoesAdminFilters>({ page: 1, page_size: 25 });
  const [applied, setApplied] = useState<InscricoesAdminFilters>({ page: 1, page_size: 25 });

  const fetchEncontros = useCallback(async () => {
    const r = await inscricoesService.listarEncontrosAbertos();
    if (!r.success) return;
    setEncontros(r.data.encontros || []);
  }, []);

  const fetchList = useCallback(async (filters: InscricoesAdminFilters) => {
    setLoading(true);
    setError('');
    try {
      const r = await inscricoesService.listarInscricoesAdmin(filters);
      if (!r.success) throw new Error(r.error || 'Não foi possível carregar as inscrições.');

      setItems(Array.isArray((r.data as any)?.data) ? (r.data as any).data : []);
      setSummary((r.data as any)?.summary || { total: 0, por_status: {} });
      setPagination((r.data as any)?.pagination || { page: 1, page_size: 25, total: 0, total_pages: 1 });
    } catch (e: any) {
      setItems([]);
      setError(e?.message || 'Não foi possível carregar as inscrições.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEncontros();
    fetchList(applied);
  }, [applied, fetchEncontros, fetchList]);

  useEffect(() => {
    setNewStatus('');
    setJustificativa('');
    setStatusFeedback(null);
    setCadastroFeedback(null);
    setCadastroForm({
      nome_adolescente: String(selected?.nome_adolescente || ''),
      data_nascimento: String(selected?.data_nascimento || ''),
      sexo: String((selected as any)?.sexo || ''),
      endereco: String((selected as any)?.endereco || ''),
      email_adolescente: String((selected as any)?.email_adolescente || ''),
      telefone_adolescente: String(selected?.telefone_adolescente || ''),
      bairro: String(selected?.bairro || ''),
      nome_responsavel: String(selected?.nome_responsavel || ''),
      email_responsavel: String(selected?.email_responsavel || ''),
      telefone_responsavel: String(selected?.telefone_responsavel || ''),
    });
  }, [selected?.inscricao_id]);

  const applyFilters = () => setApplied({ ...draft, page: 1 });
  const applyQuickStatusFilter = (status: string) => {
    const normalized = String(status || '').trim();
    const nextStatus = normalized && normalized !== String(draft.status || '') ? normalized : '';
    setDraft((prev) => ({ ...prev, status: nextStatus, page: 1 }));
    setApplied((prev) => ({ ...prev, status: nextStatus, page: 1 }));
  };

  const clearFilters = () => {
    const reset = { page: 1, page_size: 25 };
    setDraft(reset);
    setApplied(reset);
  };

  const gotoPage = (page: number) => {
    const safePage = Math.min(Math.max(1, page), pagination.total_pages || 1);
    setApplied((prev) => ({ ...prev, page: safePage }));
    setDraft((prev) => ({ ...prev, page: safePage }));
  };

  const statusCards = useMemo(() => {
    const keys = ['INSCRITO', 'EM_ANALISE', 'PRIORIZADO', 'FILA', 'CONFIRMADO', 'NAO_SELECIONADO'];
    return keys.map((key) => ({ key, value: summary.por_status[key] || 0 }));
  }, [summary.por_status]);

  const allowedTargets = useMemo(() => getAllowedStatusTargets(String(selected?.status_inscricao || '')), [selected?.status_inscricao]);
  const quickTargets = useMemo(() => QUICK_STATUS_OPTIONS.filter((target) => allowedTargets.includes(target)), [allowedTargets]);
  const justificativaObrigatoria = JUSTIFICATIVA_OBRIGATORIA_STATUS.has(newStatus);

  const handleAlterarStatus = useCallback(async () => {
    if (!selected) return;

    const statusNovo = String(newStatus || '').trim();
    if (!statusNovo) {
      setStatusFeedback({ type: 'error', text: 'Selecione o novo status.' });
      return;
    }

    const statusAtual = String(selected.status_inscricao || '').trim();
    if (statusNovo === statusAtual) {
      setStatusFeedback({ type: 'error', text: 'O status informado já é o status atual da inscrição.' });
      return;
    }

    if (!allowedTargets.includes(statusNovo)) {
      setStatusFeedback({ type: 'error', text: `Transição inválida: ${statusAtual} -> ${statusNovo}.` });
      return;
    }

    if (JUSTIFICATIVA_OBRIGATORIA_STATUS.has(statusNovo) && !String(justificativa || '').trim()) {
      setStatusFeedback({ type: 'error', text: 'Informe uma justificativa para este status.' });
      return;
    }

    setSubmittingStatus(true);
    setStatusFeedback(null);

    try {
      const adminInfo = getAdminInfo();
      const r = await inscricoesService.alterarStatusInscricao({
        inscricao_id: selected.inscricao_id,
        status_novo: statusNovo,
        justificativa,
        ...adminInfo,
      });

      if (!r.success) {
        const message = (r.raw as any)?.message || 'Não foi possível atualizar o status da inscrição.';
        setStatusFeedback({ type: 'error', text: message });
        return;
      }

      const updated = {
        ...selected,
        status_inscricao: (r.data as any)?.data?.status_novo || statusNovo,
      };
      setSelected(updated);
      setItems((prev) => prev.map((it) => (it.inscricao_id === updated.inscricao_id ? { ...it, status_inscricao: updated.status_inscricao } : it)));
      setStatusFeedback({ type: 'success', text: 'Status atualizado com sucesso.' });

      await fetchList(applied);
    } catch {
      setStatusFeedback({ type: 'error', text: 'Não foi possível atualizar o status da inscrição.' });
    } finally {
      setSubmittingStatus(false);
    }
  }, [allowedTargets, applied, fetchList, justificativa, newStatus, selected]);

  const handleExcluirInscricao = useCallback(async (item: InscricaoAdminItem) => {
    const ok = typeof window !== 'undefined'
      ? window.confirm(`Confirma a exclusão da inscrição de ${item.nome_adolescente || 'registro sem nome'}?`)
      : false;

    if (!ok) return;

    setLoading(true);
    setError('');
    try {
      const r = await inscricoesService.excluirInscricao({ inscricao_id: item.inscricao_id });
      if (!r.success) {
        setError((r.raw as any)?.message || 'Não foi possível excluir a inscrição.');
        return;
      }

      if (selected?.inscricao_id === item.inscricao_id) setSelected(null);
      await fetchList(applied);
    } catch {
      setError('Não foi possível excluir a inscrição.');
    } finally {
      setLoading(false);
    }
  }, [applied, fetchList, selected?.inscricao_id]);

  const handleSalvarCadastro = useCallback(async () => {
    if (!selected) return;
    setSubmittingCadastro(true);
    setCadastroFeedback(null);
    try {
      const r = await inscricoesService.atualizarCadastroInscricao({
        inscricao_id: selected.inscricao_id,
        nome_adolescente: cadastroForm.nome_adolescente,
        data_nascimento: cadastroForm.data_nascimento,
        sexo: cadastroForm.sexo,
        endereco: cadastroForm.endereco,
        email_adolescente: cadastroForm.email_adolescente,
        telefone_adolescente: cadastroForm.telefone_adolescente,
        bairro: cadastroForm.bairro,
        nome_responsavel: cadastroForm.nome_responsavel,
        email_responsavel: cadastroForm.email_responsavel,
        telefone_responsavel: cadastroForm.telefone_responsavel,
      });
      if (!r.success) {
        setCadastroFeedback({ type: 'error', text: (r.raw as any)?.message || 'Não foi possível salvar o cadastro.' });
        return;
      }
      const updated = {
        ...selected,
        nome_adolescente: cadastroForm.nome_adolescente || selected.nome_adolescente,
        data_nascimento: cadastroForm.data_nascimento || selected.data_nascimento,
        sexo: cadastroForm.sexo || (selected as any).sexo,
        endereco: cadastroForm.endereco || (selected as any).endereco,
        email_adolescente: cadastroForm.email_adolescente || (selected as any).email_adolescente,
        telefone_adolescente: cadastroForm.telefone_adolescente || selected.telefone_adolescente,
        bairro: cadastroForm.bairro || selected.bairro,
        nome_responsavel: cadastroForm.nome_responsavel || selected.nome_responsavel,
        email_responsavel: cadastroForm.email_responsavel || selected.email_responsavel,
        telefone_responsavel: cadastroForm.telefone_responsavel || selected.telefone_responsavel,
        status_inscricao: (r.data as any)?.data?.status_inscricao_atual || selected.status_inscricao,
      };
      setSelected(updated);
      setItems((prev) => prev.map((it) => (
        it.inscricao_id === updated.inscricao_id
          ? {
              ...it,
              nome_adolescente: updated.nome_adolescente,
              data_nascimento: updated.data_nascimento,
              sexo: (updated as any).sexo,
              endereco: (updated as any).endereco,
              email_adolescente: (updated as any).email_adolescente,
              telefone_adolescente: updated.telefone_adolescente,
              bairro: updated.bairro,
              nome_responsavel: updated.nome_responsavel,
              email_responsavel: updated.email_responsavel,
              telefone_responsavel: updated.telefone_responsavel,
              status_inscricao: updated.status_inscricao,
            }
          : it
      )));
      setCadastroFeedback({ type: 'success', text: 'Cadastro atualizado com sucesso.' });
      await fetchList(applied);
    } catch {
      setCadastroFeedback({ type: 'error', text: 'Não foi possível salvar o cadastro.' });
    } finally {
      setSubmittingCadastro(false);
    }
  }, [applied, cadastroForm, fetchList, selected]);

  const handleQuickStatusFromCard = useCallback(async (item: InscricaoAdminItem, statusNovo: string) => {
    const statusAtual = String(item.status_inscricao || '').trim();
    const allowed = getAllowedStatusTargets(statusAtual);
    if (!allowed.includes(statusNovo)) {
      setError(`Transição inválida: ${statusAtual} -> ${statusNovo}.`);
      return;
    }

    let justificativa = '';
    if (JUSTIFICATIVA_OBRIGATORIA_STATUS.has(statusNovo)) {
      justificativa = String(window.prompt(`Justificativa obrigatória para ${statusNovo}:`, '') || '').trim();
      if (!justificativa) {
        setError('Justificativa obrigatória para este status.');
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const adminInfo = getAdminInfo();
      const r = await inscricoesService.alterarStatusInscricao({
        inscricao_id: item.inscricao_id,
        status_novo: statusNovo,
        justificativa,
        ...adminInfo,
      });
      if (!r.success) {
        setError((r.raw as any)?.message || 'Não foi possível atualizar o status.');
        return;
      }
      await fetchList(applied);
    } catch {
      setError('Não foi possível atualizar o status.');
    } finally {
      setLoading(false);
    }
  }, [applied, fetchList]);

  const handleExportCsv = useCallback(async () => {
    setExportingCsv(true);
    setError('');
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const allItems: InscricaoAdminItem[] = [];

      do {
        const r = await inscricoesService.listarInscricoesAdmin({
          ...applied,
          page,
          page_size: pageSize,
        });
        if (!r.success) throw new Error(r.error || 'Não foi possível carregar os dados filtrados para exportação.');

        const payload = r.data as any;
        const chunk = Array.isArray(payload?.data) ? payload.data as InscricaoAdminItem[] : [];
        const paginationInfo = payload?.pagination || {};
        allItems.push(...chunk);
        totalPages = Number(paginationInfo.total_pages || 1) || 1;
        page += 1;
      } while (page <= totalPages);

      if (allItems.length === 0) {
        setError('Nenhuma inscrição encontrada para exportação com os filtros atuais.');
        return;
      }

      const columns = getTriagemExportColumns(allItems);
      const headers = columns.map(getTriagemExportLabel);
      const rows = allItems.map((item) => columns.map((key) => formatTriagemExportValue(key, (item as any)?.[key])));

      const csv = '\ufeff' + [headers.map(escapeCsvCell).join(';'), ...rows.map((row) => row.map(escapeCsvCell).join(';'))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const fileName = `triagem_inscricoes_${yyyy}-${mm}-${dd}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível exportar o CSV da triagem.');
    } finally {
      setExportingCsv(false);
    }
  }, [applied]);


  return (
    <section className="w-full p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Triagem de Inscrições</h1>
            <p className="mt-1 text-sm text-slate-600">Acompanhe inscrições recebidas e revise os dados operacionais.</p>
          </div>
          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="self-start px-4 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            {exportingCsv ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => applyQuickStatusFilter('')}
            className={`p-3 rounded-xl border text-left transition-colors ${
              !String(applied.status || '').trim()
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Total</p>
            <p className="text-2xl font-black text-slate-900">{summary.total || 0}</p>
          </button>
          {statusCards.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => applyQuickStatusFilter(s.key)}
              className={`p-3 rounded-xl border text-left transition-colors ${
                String(applied.status || '').trim() === s.key
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{s.key}</p>
              <p className="text-2xl font-black text-slate-900">{s.value}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="mb-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900">
            <p className="text-[11px] font-black uppercase tracking-widest">Regra ativa de triagem</p>
            <p className="text-sm font-semibold mt-1">A triagem mostra o status operacional real das inscrições. Use os filtros para restringir idade, encontro, origem ou bairro quando necessário.</p>
          </div>

          <div className="mb-3 p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900">
            <p className="text-[11px] font-black uppercase tracking-widest">Fluxo operacional</p>
            <p className="text-sm font-semibold mt-1">Inscrito -&gt; Priorizado -&gt; Confirmado -&gt; Cadastro oficial (após participação).</p>
            <p className="text-xs mt-1">Exceções: Não selecionado (fechamento de ciclo), Desistente e Cancelado. Status legados não aparecem na edição.</p>
          </div>

          <div className="mb-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-500 font-black mb-2">Filtro rápido por status</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyQuickStatusFilter('')}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border ${
                  !String(applied.status || '').trim()
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                Todos ({summary.total || 0})
              </button>
              {statusCards.map((s) => (
                <button
                  key={`quick-filter-${s.key}`}
                  type="button"
                  onClick={() => applyQuickStatusFilter(s.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border ${
                    String(applied.status || '').trim() === s.key
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  {s.key} ({s.value})
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <select value={String(draft.encontro_id || '')} onChange={(e) => setDraft((prev) => ({ ...prev, encontro_id: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold">
              <option value="">Todos os encontros</option>
              {encontros.map((e) => <option key={e.id} value={e.id}>{String(e.nome || e.id)}</option>)}
            </select>

            <select value={String(draft.status || '')} onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold">
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <input value={String(draft.bairro || '')} onChange={(e) => setDraft((prev) => ({ ...prev, bairro: e.target.value }))} placeholder="Bairro" className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold" />
            <input value={String(draft.busca || '')} onChange={(e) => setDraft((prev) => ({ ...prev, busca: e.target.value }))} placeholder="Buscar por nome ou telefone" className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold" />
            <select value={String(draft.origem_dado || '')} onChange={(e) => setDraft((prev) => ({ ...prev, origem_dado: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold">
              <option value="">Todas as origens</option>
              {ORIGEM_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>

            <input type="date" value={String(draft.data_inicio || '')} onChange={(e) => setDraft((prev) => ({ ...prev, data_inicio: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold" />
            <input type="date" value={String(draft.data_fim || '')} onChange={(e) => setDraft((prev) => ({ ...prev, data_fim: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold" />
            <input type="number" min={0} value={String(draft.idade_min || '')} onChange={(e) => setDraft((prev) => ({ ...prev, idade_min: e.target.value }))} placeholder="Idade mínima" className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold" />
            <input type="number" min={0} value={String(draft.idade_max || '')} onChange={(e) => setDraft((prev) => ({ ...prev, idade_max: e.target.value }))} placeholder="Idade máxima" className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold" />
            <select value={String(draft.page_size || 25)} onChange={(e) => setDraft((prev) => ({ ...prev, page_size: Number(e.target.value) }))} className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold">
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
            </select>
          </div>

          <div className="mt-3 flex gap-2 justify-end">
            <button onClick={clearFilters} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-black uppercase tracking-widest">Limpar filtros</button>
            <button onClick={applyFilters} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest">Pesquisar</button>
          </div>
        </div>

        {error ? <div className="mt-4 p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold">Não foi possível carregar as inscrições. {error}</div> : null}

        {loading ? (
          <div className="mt-4 p-8 text-center text-slate-500 font-bold">Carregando inscrições...</div>
        ) : items.length === 0 ? (
          <div className="mt-4 p-8 text-center text-slate-500 font-bold">Nenhuma inscrição encontrada para os filtros selecionados.</div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((it) => (
                <article key={it.inscricao_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  {(() => {
                    const parsed = splitBairroAndEmail(it.bairro, it.email_responsavel);
                    const nome = String(it.nome_adolescente || '-').trim() || '-';
                    const responsavel = String(it.nome_responsavel || '-').trim() || '-';
                    return (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-black text-xs">{it.status_inscricao || '-'}</span>
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{it.idade_calculada ?? '-'} anos</span>
                        </div>

                        <div className="mt-3 flex items-start gap-3 min-w-0">
                          <div className="h-12 w-12 shrink-0 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center text-sm font-black">
                            {getInitials(nome)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-black text-slate-900 leading-tight [overflow-wrap:anywhere]">{nome}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-500">Inscrito em {formatDateTime(it.data_inscricao)}</p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Telefone</p>
                            <p className="mt-1 font-semibold text-slate-700 [overflow-wrap:anywhere]">{it.telefone_adolescente || '-'}</p>
                          </div>
                          <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Bairro</p>
                            <p className="mt-1 font-semibold text-slate-700 [overflow-wrap:anywhere]">{parsed.bairro}</p>
                          </div>
                          <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 sm:col-span-2">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">E-mail</p>
                            <p className="mt-1 font-semibold text-slate-700 [overflow-wrap:anywhere]">{parsed.email}</p>
                          </div>
                          <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 sm:col-span-2">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Responsável</p>
                            <p className="mt-1 font-semibold text-slate-700 [overflow-wrap:anywhere]">{responsavel}</p>
                          </div>
                          <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 sm:col-span-2">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Encontro</p>
                            <p className="mt-1 font-semibold text-slate-700 [overflow-wrap:anywhere]">{it.encontro_nome || '-'}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="flex flex-wrap gap-2">
                            <ActionIconButton title="Visualizar" onClick={() => setSelected(it)} className="border-slate-300 bg-white text-slate-700">
                              <EyeIcon />
                            </ActionIconButton>
                            <ActionIconButton title="Editar" onClick={() => setSelected(it)} className="border-blue-300 bg-blue-50 text-blue-700">
                              <PencilIcon />
                            </ActionIconButton>
                            <ActionIconButton title="Excluir" onClick={() => handleExcluirInscricao(it)} className="border-rose-300 bg-rose-50 text-rose-700">
                              <TrashIcon />
                            </ActionIconButton>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {getAllowedStatusTargets(String(it.status_inscricao || '')).filter((s) => QUICK_STATUS_OPTIONS.includes(s)).map((status) => (
                              <ActionIconButton
                                key={`${it.inscricao_id}-${status}`}
                                title={`Definir ${status}`}
                                onClick={() => handleQuickStatusFromCard(it, status)}
                                className="border-emerald-300 bg-emerald-50 text-emerald-700"
                              >
                                {status === 'PRIORIZADO' ? <StarIcon /> : status === 'CONFIRMADO' ? <CheckIcon /> : <MinusCircleIcon />}
                              </ActionIconButton>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </article>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600 font-bold">Página {pagination.page} de {pagination.total_pages} • Total {pagination.total}</p>
              <div className="flex gap-2">
                <button onClick={() => gotoPage(pagination.page - 1)} disabled={pagination.page <= 1} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-black disabled:opacity-50">Anterior</button>
                <button onClick={() => gotoPage(pagination.page + 1)} disabled={pagination.page >= pagination.total_pages} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-black disabled:opacity-50">Próxima</button>
              </div>
            </div>
          </>
        )}
      </div>

      <Drawer isOpen={!!selected} onClose={() => setSelected(null)} title="Detalhes da inscrição">
        {!selected ? null : (
          <div className="space-y-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-black">Inscrição</p>
              <p className="text-sm font-bold mt-1">ID: {selected.inscricao_id}</p>
              <p className="text-sm">Status: {selected.status_inscricao}</p>
              <p className="text-sm">Data inscrição: {formatDateTime(selected.data_inscricao)}</p>
              <p className="text-sm">Origem: {selected.origem_inscricao || '-'}</p>
              <p className="text-sm">Criado via sistema: {selected.criado_via_sistema ? 'Sim' : 'Não'}</p>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-black">Alterar status</p>
              <p className="text-sm mt-1">Status atual: <span className="font-black">{selected.status_inscricao || '-'}</span></p>

              <div className="mt-2 grid grid-cols-1 gap-2">
                <div className="flex flex-wrap gap-2">
                  {quickTargets.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={submittingStatus}
                      onClick={() => setNewStatus(status)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border ${
                        newStatus === status
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400'
                      } disabled:opacity-50`}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  disabled={submittingStatus}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                >
                  <option value="">Selecione o novo status</option>
                  {STATUS_CHANGE_OPTIONS.filter((s) => allowedTargets.includes(s)).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>

                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  disabled={submittingStatus}
                  rows={3}
                  placeholder={justificativaObrigatoria ? 'Justificativa obrigatória para este status' : 'Justificativa (opcional)'}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />

                {statusFeedback ? (
                  <div className={`p-2 rounded-lg text-sm font-bold ${statusFeedback.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
                    {statusFeedback.text}
                  </div>
                ) : null}

                <button
                  onClick={handleAlterarStatus}
                  disabled={submittingStatus}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {submittingStatus ? 'Atualizando...' : 'Atualizar status'}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-black">Adolescente</p>
              <p className="text-sm font-bold mt-1">{selected.nome_adolescente || '-'}</p>
              <p className="text-sm">Nascimento: {selected.data_nascimento || '-'}</p>
              <p className="text-sm">Idade: {selected.idade_calculada ?? '-'}</p>
              <p className="text-sm">Telefone: {selected.telefone_adolescente || '-'}</p>
              <p className="text-sm">Bairro: {selected.bairro || '-'}</p>
              <p className="text-sm">Aceite normas: {selected.aceite_normas ? 'Sim' : 'Não'}</p>
              <p className="text-sm">Já fez EAC: {selected.ja_fez_eac ? 'Sim' : 'Não'}</p>
              <p className="text-sm">Observações: {selected.observacoes || '-'}</p>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-black">Responsável</p>
              <p className="text-sm font-bold mt-1">{selected.nome_responsavel || '-'}</p>
              <p className="text-sm">Telefone: {selected.telefone_responsavel || '-'}</p>
              <p className="text-sm">Parentesco: {selected.grau_parentesco || '-'}</p>
              <p className="text-sm">E-mail: {selected.email_responsavel || '-'}</p>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-black">Editar cadastro</p>
              <p className="text-[11px] font-bold text-slate-500 mt-1">Disponível para qualquer status da inscrição.</p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <input
                  value={cadastroForm.nome_adolescente}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, nome_adolescente: e.target.value }))}
                  placeholder="Nome do adolescente"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                <input
                  value={cadastroForm.data_nascimento}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, data_nascimento: e.target.value }))}
                  placeholder="Nascimento do adolescente"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                <select
                  value={cadastroForm.sexo}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, sexo: e.target.value }))}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                >
                  <option value="">Selecione o sexo</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                </select>
                <input
                  value={cadastroForm.endereco}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, endereco: e.target.value }))}
                  placeholder="Endereço"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                <input
                  value={cadastroForm.email_adolescente}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, email_adolescente: e.target.value }))}
                  placeholder="E-mail do adolescente"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                <input
                  value={cadastroForm.telefone_adolescente}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, telefone_adolescente: e.target.value }))}
                  placeholder="Telefone do adolescente"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                <input
                  value={cadastroForm.bairro}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, bairro: e.target.value }))}
                  placeholder="Bairro"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                <input
                  value={cadastroForm.nome_responsavel}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, nome_responsavel: e.target.value }))}
                  placeholder="Nome do responsável"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                <input
                  value={cadastroForm.email_responsavel}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, email_responsavel: e.target.value }))}
                  placeholder="E-mail do responsável"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                <input
                  value={cadastroForm.telefone_responsavel}
                  onChange={(e) => setCadastroForm((prev) => ({ ...prev, telefone_responsavel: e.target.value }))}
                  placeholder="Telefone do responsável"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
                />
                {cadastroFeedback ? (
                  <div className={`p-2 rounded-lg text-sm font-bold ${cadastroFeedback.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
                    {cadastroFeedback.text}
                  </div>
                ) : null}
                <button
                  onClick={handleSalvarCadastro}
                  disabled={submittingCadastro}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {submittingCadastro ? 'Salvando...' : 'Salvar cadastro'}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-black">Encontro</p>
              <p className="text-sm font-bold mt-1">{selected.encontro_nome || '-'}</p>
              <p className="text-sm">Número: {selected.encontro_numero ?? '-'}</p>
              <p className="text-sm">Data início: {selected.data_inicio_encontro || '-'}</p>
              <p className="text-sm">Status: {selected.encontro_status || '-'}</p>
            </div>
          </div>
        )}
      </Drawer>
    </section>
  );
};

export default InscricoesReviewPage;

