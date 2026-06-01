import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Adolescente, User, NonEnrolledMember } from '../types.ts';
import Badge from './Badge.tsx';
import Drawer from './Drawer.tsx';
import MemberCard from './MemberCard.tsx';
import NonEnrolledCard from './NonEnrolledCard.tsx';
import { calculateAgeFromBirthDate, getMemberAgeInfo } from './memberAge.ts';
import { showAppConfirm } from '../utils/appDialog.ts';
import { sanitizeTextDeep, toCleanString } from '../utils/textEncoding.ts';
import DataOriginAudit from './DataOriginAudit.tsx';
import { getJson, patchJson, postComunicadosAction } from '../services/eacApiClient.ts';

// =========================
// Helpers ..
// =========================
async function callApiProxy(
  action: string,
  googleWebAppUrl: string,
  payload: any = {},
  options: { signal?: AbortSignal } = {}
) {
  const r = await postComunicadosAction<any>(action, payload, { googleWebAppUrl, signal: options.signal });
  if (!r.success) {
    return {
      success: false,
      error: r.error,
      sample: r.sample,
      status: r.status,
    };
  }
  return {
    ...(r.data as any),
    success: true,
  };
}

const normalizeBairroStats = (raw: any): Array<{ nome: string; quantidade: number }> => {
  if (!raw) return [];
  // Caso venha como objeto { "Icara": 66, ... }
  if (!Array.isArray(raw) && typeof raw === 'object') {
    return Object.entries(raw)
      .map(([nome, qtd]) => ({ nome: toCleanString(nome), quantidade: Number(qtd) || 0 }))
      .filter((x) => x.nome);
  }
  // Caso venha como array de objetos [{nome, quantidade}] ou [{nome, total}] etc.
  if (Array.isArray(raw)) {
    return raw
      .map((s: any) => ({
        nome: toCleanString(s?.nome ?? s?.bairro ?? s?.name),
        quantidade: Number(s?.quantidade ?? s?.total ?? s?.count ?? s?.qtd) || 0,
      }))
      .filter((x) => x.nome);
  }
  return [];
};

const isYes = (v: any) => {
  const s = toCleanString(v).toLowerCase();
  return s === 'sim' || s === 's' || s === 'yes' || s === 'y' || s === 'true' || s === '1';
};

const isSimStrict = (v: any) => {
  return toCleanString(v).toLowerCase() === 'sim';
};

const isNo = (v: any) => {
  const s = toCleanString(v).toLowerCase();
  return s === 'nao' || s === 'não' || s === 'n' || s === 'no' || s === 'false' || s === '0';
};

const isPrioritizedStatus = (v: any) => {
  const s = toCleanString(v).toLowerCase();
  return s === 'sim' || s === 's' || s === 'yes' || s === 'y' || s === 'true' || s === '1';
};

const normalizeStatusToken = (v: any) =>
  toCleanString(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const isTruthyFlag = (v: any) => {
  const s = normalizeStatusToken(v);
  return s === 'sim' || s === 's' || s === 'yes' || s === 'y' || s === 'true' || s === '1';
};

const resolveMemberOperationalStatus = (member: any): 'inscrito' | 'priorizado' | 'confirmado' | 'nao_selecionado' | 'desistente' | 'cancelado' => {
  const status = normalizeStatusToken(
    member?.statusOperacional ||
      member?.status_inscricao ||
      member?.statusInscricao ||
      member?.status ||
      member?.situacao
  );

  if (
    status.includes('cancel') ||
    status === 'cancelado' ||
    isTruthyFlag(member?.cancelado)
  ) {
    return 'cancelado';
  }
  if (
    status.includes('desist') ||
    status === 'desistente' ||
    isTruthyFlag(member?.desistente)
  ) {
    return 'desistente';
  }
  if (
    status.includes('nao_selecion') ||
    status.includes('nao_inclu') ||
    status === 'nao_selecionado' ||
    isTruthyFlag(member?.naoSelecionado)
  ) {
    return 'nao_selecionado';
  }
  if (
    status.includes('confirm') ||
    status === 'confirmado' ||
    status === 'encontrista' ||
    isTruthyFlag(member?.confirmado)
  ) {
    return 'confirmado';
  }
  if (
    status.includes('prioriz') ||
    status === 'priorizado' ||
    isTruthyFlag(member?.priorizado)
  ) {
    return 'priorizado';
  }
  return 'inscrito';
};

const getNonEnrolledField = (ne: any, keys: string[]) => {
  for (const k of keys) {
    if (ne && ne[k] !== undefined && ne[k] !== null && String(ne[k]).trim() !== '') return ne[k];
  }
  return '';
};

const getNonEnrolledId = (ne: any) => {
  return toCleanString(
    getNonEnrolledField(ne, [
      'idPessoa',
      'id_pessoa',
      'linhaOrigem',
      'Linha Origem',
      'linha_origem',
      'id',
      'A',
    ])
  );
};

const isApiSuccess = (res: any) => Boolean(res?.success ?? res?.ok);

const unwrapApiPayload = (res: any) => {
  if (!res || typeof res !== 'object') return {};
  if (Array.isArray(res?.nonEnrolled) || res?.stats || res?.kpis) return res;
  if (res?.data && typeof res.data === 'object') return res.data;
  if (res?.result && typeof res.result === 'object') return res.result;
  return res;
};

const formatYesNoOrBlank = (raw: any) => {
  const val = toCleanString(raw);
  if (!val) return 'Em branco';
  return isYes(val) ? 'Sim' : 'Não';
};

const computeInterestStatsFromList = (list: any[]) => {
  const stats = { sim: 0, nao: 0, vazio: 0 };
  (Array.isArray(list) ? list : []).forEach((item: any) => {
    const raw = toCleanString(getNonEnrolledField(item, ['Interesse Confirmado','interesseConfirmado','interesse','confirmouInteresse','Interesse','I'])).toLowerCase();
    if (!raw) stats.vazio += 1;
    else if (raw === 'sim' || raw === 's' || raw === 'yes' || raw === 'y' || raw === '1') stats.sim += 1;
    else stats.nao += 1;
  });
  return stats;
};

const formatWhatsAppLink = (phone: string) => {
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, "");
  const withCountry = clean.length <= 11 ? `55${clean}` : clean;
  return `https://wa.me/${withCountry}`;
};

const formatDateTime = (val: any) => {
  if (!val) return '-';
  try {
    if (val instanceof Date) {
      return val.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    }
  } catch (e) {}
  return toCleanString(val);
};

const formatDateTimeShort = (val: any) => {
  if (!val) return '-';
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) {}
  return toCleanString(val);
};

const stripPreConfirmPrefix = (val: any) =>
  toCleanString(val).replace(/^Enviado[_\s-]*Confirmacao\s*-\s*/i, '').trim();

type ParsedSheetDate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  hasTime: boolean;
};

const isValidDatePart = (year: number, month: number, day: number) => {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const maxDay = new Date(year, month, 0).getDate();
  return day <= maxDay;
};

const isValidTimePart = (hour: number, minute: number) => {
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
};

const buildParsedSheetDate = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  hasTime: boolean
): ParsedSheetDate | null => {
  if (!isValidDatePart(year, month, day)) return null;
  if (hasTime && !isValidTimePart(hour, minute)) return null;
  return {
    year,
    month,
    day,
    hour: hasTime ? hour : 0,
    minute: hasTime ? minute : 0,
    hasTime,
  };
};

const parseSheetDate = (val: any): ParsedSheetDate | null => {
  if (!val) return null;

  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    return {
      year: val.getFullYear(),
      month: val.getMonth() + 1,
      day: val.getDate(),
      hour: val.getHours(),
      minute: val.getMinutes(),
      hasTime: true,
    };
  }

  const raw = stripPreConfirmPrefix(val);
  if (!raw) return null;

  const br = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const hasTime = Boolean(br[4] && br[5]);
    const hour = Number(br[4] || 0);
    const minute = Number(br[5] || 0);
    return buildParsedSheetDate(year, month, day, hour, minute, hasTime);
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const hasTime = Boolean(iso[4] && iso[5]);
    const hour = Number(iso[4] || 0);
    const minute = Number(iso[5] || 0);
    return buildParsedSheetDate(year, month, day, hour, minute, hasTime);
  }

  if (/[A-Za-z]|GMT|UTC|Z|[+-]\d{2}:\d{2}/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        year: parsed.getFullYear(),
        month: parsed.getMonth() + 1,
        day: parsed.getDate(),
        hour: parsed.getHours(),
        minute: parsed.getMinutes(),
        hasTime: true,
      };
    }
  }

  return null;
};

const formatSheetDatePartsBR = (parts: ParsedSheetDate, includeTime = false) => {
  const dd = String(parts.day).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  const yyyy = String(parts.year);
  if (includeTime && parts.hasTime) {
    const hh = String(parts.hour).padStart(2, '0');
    const mi = String(parts.minute).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }
  return `${dd}/${mm}/${yyyy}`;
};

const formatSheetDateCell = (val: any, options: { includeTime?: boolean } = {}) => {
  const parsed = parseSheetDate(val);
  if (parsed) return formatSheetDatePartsBR(parsed, Boolean(options.includeTime));
  const raw = stripPreConfirmPrefix(val);
  return raw || '-';
};

const formatSheetDateForEditor = (val: any, options: { includeTime?: boolean } = {}) => {
  const formatted = formatSheetDateCell(val, options);
  return formatted === '-' ? '' : formatted;
};

const normalizeBirthDateForSave = (value: any): { ok: boolean; value: string; error?: string } => {
  const raw = toCleanString(value).trim();
  if (!raw) return { ok: true, value: '' };
  const parsed = parseSheetDate(raw);
  if (!parsed) {
    return { ok: false, value: raw, error: 'Data de nascimento inválida. Use DD/MM/AAAA ou YYYY-MM-DD.' };
  }
  return { ok: true, value: formatSheetDatePartsBR(parsed, false) };
};

const getSheetDateSortKey = (val: any) => {
  const parsed = parseSheetDate(val);
  if (parsed) {
    const y = String(parsed.year);
    const m = String(parsed.month).padStart(2, '0');
    const d = String(parsed.day).padStart(2, '0');
    const hh = String(parsed.hasTime ? parsed.hour : 0).padStart(2, '0');
    const mm = String(parsed.hasTime ? parsed.minute : 0).padStart(2, '0');
    return `${y}${m}${d}${hh}${mm}`;
  }
  const raw = stripPreConfirmPrefix(val);
  return raw ? raw.toLowerCase() : '';
};

const cleanReplySnippet = (snippet: any) => {
  let s = toCleanString(snippet);
  if (!s) return '-';
  // Remove parte citada aps "escreveu:" ou "wrote:"
  const lower = s.toLowerCase();
  const markers = [' escreveu:', ' wrote:'];
  for (const mk of markers) {
    const idx = lower.indexOf(mk);
    if (idx !== -1) {
      s = s.slice(0, idx);
      break;
    }
  }
  // Remove prefixos de citao ">"
  s = s.replace(/>\s*/g, ' ');
  // Normaliza espaos
  s = s.replace(/\s+/g, ' ').trim();

  const parts: string[] = [];
  // Captura linha de data "Em qui., 12 de fev..." se existir (traz para o topo)
  const dateMatch = s.match(/(Em\s+[\p{L}0-9.,\s\-]+@\S+)/iu);
  if (dateMatch && dateMatch[0]) {
    parts.push(dateMatch[0].trim());
    s = (s.slice(0, dateMatch.index || 0) + s.slice((dateMatch.index || 0) + dateMatch[0].length)).trim();
  }

  // Quebras antes de agradecimentos/assinaturas comuns
  s = s.replace(/\b(obrigad[ao]|obg|obgd)\b/gi, '\n$1');
  s = s.replace(/\b(att[.,]?)\b/gi, '\n$1');

  // Normaliza quebras
  s = s.replace(/\s*\n\s*/g, '\n').trim();
  if (s) parts.push(s);

  const finalText = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return finalText || '-';
};

const InputField = ({ label, value, onChange, type = "text", placeholder = "", disabled = false, rightElement = null, helperText = '' }: any) => (
  <div className="space-y-1.5 flex-1 relative">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
    <div className="relative">
      <input
        type={type}
        disabled={disabled}
        className={`w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm ${rightElement ? 'pr-14' : ''}`}
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {rightElement && <div className="absolute right-2 top-2 bottom-2 flex items-center">{rightElement}</div>}
    </div>
    {helperText ? <p className="text-[11px] font-semibold text-slate-400 ml-1">{helperText}</p> : null}
  </div>
);

const RadioField = ({ label, currentValue, onChange, options }: any) => (
  <div className="space-y-3">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
    <div className="flex flex-wrap gap-3">
      {options.map((opt: string) => (
        <button
          key={opt}
          type="button"
          className={`flex-1 min-w-[120px] p-4 rounded-2xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${currentValue === opt ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

const StatIndicator = ({ label, count, color, isActive, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-4 rounded-[2rem] border transition-all ${isActive ? 'bg-blue-600 border-blue-600 ring-4 ring-blue-100 scale-105' : 'bg-white border-slate-100 shadow-sm hover:shadow-md'} flex-1 min-w-[110px]`}
  >
    <span className={`text-[13px] md:text-[14px] font-black uppercase tracking-wide mb-1 ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>{label}</span>
    <span className={`text-2xl font-black ${isActive ? 'text-white' : color}`}>{count}</span>
  </button>
);

interface MembersPageProps {
  user: User;
  googleWebAppUrl: string;
}

type BairroCardStat = { nome: string; quantidade: number };
type MemberSearchUiState = 'sem_busca' | 'carregando' | 'resultados' | 'nenhum_resultado';
type MemberSearchFilters = {
  query: string;
  bairro: string;
  telefone: string;
  email: string;
  sexo: string;
  pertencePorciuncula: string;
  faixaEtaria: string;
};

const DEFAULT_MEMBER_SEARCH_FILTERS: MemberSearchFilters = {
  query: '',
  bairro: '',
  telefone: '',
  email: '',
  sexo: '',
  pertencePorciuncula: '',
  faixaEtaria: '',
};

const DEFAULT_NON_ENROLLED_TABLE_FILTERS = {
  nome: '',
  bairro: '',
  interesse: '',
  jaFezEac: '',
  contatoMudou: '',
  statusEnvio: '',
  recebeuConfirmacaoCadastro: '',
  statusUltimoChamado: '',
};

const NON_ENROLLED_QUERY_LIMIT = 30;

type NonEnrolledEditDraft = {
  nome: string;
  email: string;
  status: string;
  dataCadastro: string;
  telefone: string;
  bairro: string;
  statusEnvio: string;
  dataNascimento: string;
  sexo: string;
  interesseConfirmado: string;
  jaFezEac: string;
  contatoMudou: string;
  recado: string;
  dataResposta: string;
  amigo: string;
  nomeAmigo: string;
  statusPreConfirmacao: string;
  statusPriorizacao: string;
};

const EMPTY_NON_ENROLLED_EDIT_DRAFT: NonEnrolledEditDraft = {
  nome: '',
  email: '',
  status: '',
  dataCadastro: '',
  telefone: '',
  bairro: '',
  statusEnvio: '',
  dataNascimento: '',
  sexo: '',
  interesseConfirmado: '',
  jaFezEac: '',
  contatoMudou: '',
  recado: '',
  dataResposta: '',
  amigo: '',
  nomeAmigo: '',
  statusPreConfirmacao: '',
  statusPriorizacao: '',
};

const normalizeEditableYesNo = (value: any) => {
  const normalized = formatYesNoOrBlank(value);
  return normalized === 'Em branco' ? '' : normalized;
};

const buildNonEnrolledEditDraft = (ne: any): NonEnrolledEditDraft => ({
  nome: toCleanString(ne?.nome || ne?.Nome || ne?.['Nome']),
  email: toCleanString(ne?.email || ne?.Email || ne?.['Email']),
  status: toCleanString(getNonEnrolledField(ne, ['status', 'Status'])),
  dataCadastro: formatSheetDateForEditor(getNonEnrolledField(ne, ['dataCadastro', 'Data Cadastro', 'dataInscricao', 'Data Inscrição', 'E']), { includeTime: true }),
  telefone: toCleanString(getNonEnrolledField(ne, ['telefone', 'Telefone', 'whatsapp'])),
  bairro: toCleanString(ne?.bairro || ne?.Bairro || ne?.BAIRRO || ne?.['Bairro']),
  statusEnvio: toCleanString(getNonEnrolledField(ne, ['statusEnvio', 'Status Envio', 'status_envio', 'H'])),
  dataNascimento: formatSheetDateForEditor(getNonEnrolledField(ne, ['dataNascimento', 'nascimento', 'Nascimento', 'Data de nascimento', 'Data Nascimento', 'R'])),
  sexo: toCleanString(getNonEnrolledField(ne, ['sexo', 'Sexo', 'S'])),
  interesseConfirmado: normalizeEditableYesNo(getNonEnrolledField(ne, ['interesseConfirmado', 'Interesse Confirmado', 'interesse', 'Interesse', 'I'])),
  jaFezEac: normalizeEditableYesNo(getNonEnrolledField(ne, ['jaFezEac', 'Ja fez o EAC', 'J fez o EAC', 'J'])),
  contatoMudou: normalizeEditableYesNo(getNonEnrolledField(ne, ['contatoMudou', 'Contato Mudou', 'K'])),
  recado: toCleanString(getNonEnrolledField(ne, ['recado', 'Recado', 'L'])),
  dataResposta: formatSheetDateForEditor(getNonEnrolledField(ne, ['dataResposta', 'Data Resposta', 'M']), { includeTime: true }),
  amigo: toCleanString(getNonEnrolledField(ne, ['amigo', 'Amigo para', 'N'])),
  nomeAmigo: toCleanString(getNonEnrolledField(ne, ['nomeAmigo', 'Nome do amigo', 'O'])),
  statusPreConfirmacao: toCleanString(getNonEnrolledField(ne, ['statusPreConfirmacao', 'preConfirmacao', 'Status Pre Confirmacao', 'P'])),
  statusPriorizacao: isPrioritizedStatus(getNonEnrolledField(ne, ['statusPriorizacao', 'Status Priorizacao', 'Q'])) ? 'SIM' : '',
});

const applyNonEnrolledDraftToItem = (item: any, draft: NonEnrolledEditDraft) => ({
  ...item,
  nome: draft.nome,
  email: draft.email,
  status: draft.status,
  dataCadastro: draft.dataCadastro,
  telefone: draft.telefone,
  bairro: draft.bairro,
  statusEnvio: draft.statusEnvio,
  dataNascimento: draft.dataNascimento,
  nascimento: draft.dataNascimento,
  sexo: draft.sexo,
  interesseConfirmado: draft.interesseConfirmado,
  interesse: draft.interesseConfirmado,
  jaFezEac: draft.jaFezEac,
  contatoMudou: draft.contatoMudou,
  recado: draft.recado,
  dataResposta: draft.dataResposta,
  amigo: draft.amigo,
  nomeAmigo: draft.nomeAmigo,
  statusPreConfirmacao: draft.statusPreConfirmacao,
  statusPriorizacao: draft.statusPriorizacao,
});

const MembersPage: React.FC<MembersPageProps> = ({ user, googleWebAppUrl }) => {
  const [members, setMembers] = useState<Adolescente[]>([]);
  const [nonEnrolled, setNonEnrolled] = useState<NonEnrolledMember[]>([]);
  const [bairroStats, setBairroStats] = useState<BairroCardStat[]>([]);
  const [nonEnrolledMeta, setNonEnrolledMeta] = useState<any>({
    interestStats: null,
    jaFezStats: null,
    contatoMudouStats: null,
    statusEnvioBlankCount: null,
    preConfirmadasCount: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingMembersCsv, setIsExportingMembersCsv] = useState(false);
  const [memberFiltersDraft, setMemberFiltersDraft] = useState<MemberSearchFilters>({ ...DEFAULT_MEMBER_SEARCH_FILTERS });
  const [memberFiltersApplied, setMemberFiltersApplied] = useState<MemberSearchFilters>({ ...DEFAULT_MEMBER_SEARCH_FILTERS });
  const [showAdvancedMemberFilters, setShowAdvancedMemberFilters] = useState(false);
  const [memberSearchTotal, setMemberSearchTotal] = useState<number | null>(null);
  const [isMemberSearching, setIsMemberSearching] = useState(false);
  const memberSearchAbortRef = useRef<AbortController | null>(null);
  const memberSearchRequestSeqRef = useRef(0);

  const [activeTab, setActiveTab] = useState<'pessoais' | 'responsaveis' | 'eac' | 'termos'>('pessoais');
  const [showNonEnrolledView, setShowNonEnrolledView] = useState(false);
  const [selectedBairroFilter, setSelectedBairroFilter] = useState<string | null>(null);
  const [selectedBairroInterestSimFilter, setSelectedBairroInterestSimFilter] = useState<string | null>(null);
  const [selectedIndicatorFilter, setSelectedIndicatorFilter] = useState<string | null>(null);
  const [tableFilters, setTableFilters] = useState({ ...DEFAULT_NON_ENROLLED_TABLE_FILTERS });
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);

  const [selectedNonEnrolled, setSelectedNonEnrolled] = useState<any | null>(null);
  const [showNonEnrolledDrawer, setShowNonEnrolledDrawer] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState({ to: '', name: '', subject: '', body: '' });
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyAction, setReplyAction] = useState<'send' | 'close' | null>(null);
  const [updatingInterestId, setUpdatingInterestId] = useState<string | null>(null);
  const [updatingRecadoId, setUpdatingRecadoId] = useState<string | null>(null);
  const [updatingPrioridadeId, setUpdatingPrioridadeId] = useState<string | null>(null);
  const [showNonEnrolledEditor, setShowNonEnrolledEditor] = useState(false);
  const [editingNonEnrolledId, setEditingNonEnrolledId] = useState<string | null>(null);
  const [isSavingNonEnrolledEdit, setIsSavingNonEnrolledEdit] = useState(false);
  const [nonEnrolledEditDraft, setNonEnrolledEditDraft] = useState<NonEnrolledEditDraft>({ ...EMPTY_NON_ENROLLED_EDIT_DRAFT });

  const [isConverting, setIsConverting] = useState(false);
  const [originalEmail, setOriginalEmail] = useState<string | null>(null);
  const [emailStatusSummary, setEmailStatusSummary] = useState<Record<string, any>>({});
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [replyPreview, setReplyPreview] = useState<{ from: string; at: any; snippet: string } | null>(null);
  const [emailHistory, setEmailHistory] = useState<Record<string, any[]>>({});
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Adolescente>({
    nome: '', nascimento: '', sexo: 'Masculino', endereco: '', bairro: '', telefone: '', email: '',
    responsavelNome: '', responsavelTel: '', responsavelEmail: '',
    tempoParoquia: '', participaGrupo: '', motivacao: '', expectativas: '',
    autorizaImagem: 'Sim', concordaNormas: 'Sim', pertencePorciuncula: 'Sim',
    whatsapp: ''
  });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'dataCadastro', direction: 'asc' });
  const [isEditing, setIsEditing] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedMemberCard, setSelectedMemberCard] = useState<Adolescente | null>(null);
  const [showMemberDrawer, setShowMemberDrawer] = useState(false);
  const [memberViewTab, setMemberViewTab] = useState<'pessoais' | 'responsaveis' | 'eac' | 'termos' | 'auditoria'>('pessoais');
  const [nonEnrolledViewTab, setNonEnrolledViewTab] = useState<'pessoais' | 'responsaveis' | 'eac' | 'termos'>('pessoais');
  const [deletingMemberEmail, setDeletingMemberEmail] = useState<string | null>(null);
  const [isNonEnrolledSearching, setIsNonEnrolledSearching] = useState(false);
  const [isNonEnrolledRefreshing, setIsNonEnrolledRefreshing] = useState(false);
  const [nonEnrolledSearchDone, setNonEnrolledSearchDone] = useState(false);
  const [nonEnrolledSearchTotal, setNonEnrolledSearchTotal] = useState(0);
  const selectedMemberAgeInfo = useMemo(
    () => getMemberAgeInfo(toCleanString((selectedMemberCard as any)?.nascimento)),
    [selectedMemberCard]
  );

  const applyNonEnrolledDataset = useCallback((neData: any) => {
    const list = Array.isArray(neData?.nonEnrolled) ? neData.nonEnrolled : [];
    setNonEnrolled(list);

    setNonEnrolledMeta({
      interestStats: neData?.interestStats || null,
      jaFezStats: neData?.jaFezStats || null,
      contatoMudouStats: neData?.contatoMudouStats || null,
      statusEnvioBlankCount: typeof neData?.statusEnvioBlankCount === 'number' ? neData.statusEnvioBlankCount : null,
      preConfirmadasCount: typeof neData?.preConfirmadasCount === 'number' ? neData.preConfirmadasCount : null,
    });

    const rawStats = neData?.stats;
    const normalizedStats = normalizeBairroStats(rawStats);
    if (normalizedStats.length) {
      setBairroStats(normalizedStats);
    } else {
      const map = new Map<string, number>();
      list.forEach((ne: any) => {
        const b = toCleanString(ne?.bairro);
        if (!b) return;
        map.set(b, (map.get(b) || 0) + 1);
      });
      const arr = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([nome, quantidade]) => ({ nome, quantidade }));
      setBairroStats(arr);
    }

    return list;
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [mData, summaryData] = await Promise.all([
        callApiProxy('GET_MEMBERS', googleWebAppUrl),
        callApiProxy('GET_EMAIL_STATUS_SUMMARY', googleWebAppUrl),
      ]);

      if (mData?.success) {
        const loadedMembers = Array.isArray(mData.members) ? mData.members : [];
        setMembers(loadedMembers);
        setMemberSearchTotal(loadedMembers.length);
      }

      if (summaryData?.success) {
        setEmailStatusSummary(summaryData.summary || {});
      }
    } catch (e) {
      console.error('Erro ao buscar dados:', e);
    } finally {
      setIsLoading(false);
    }
  }, [googleWebAppUrl]);

  const handleSearchNonEnrolled = useCallback(async () => {
    setIsNonEnrolledSearching(true);
    try {
      const [response, summaryResponse] = await Promise.all([
        getJson<any>('/api/nao-inscritos'),
        getJson<any>('/api/nao-inscritos/resumo'),
      ]);
      if (response.success) {
        const payload: any = unwrapApiPayload(response.data);
        if (summaryResponse.success) {
          const summary = (summaryResponse.data as any)?.summary || {};
          payload.interestStats = {
            sim: Number(summary.interesse_sim) || 0,
            nao: Number(summary.interesse_nao) || 0,
            vazio: Number(summary.interesse_em_branco) || 0,
          };
          payload.contatoMudouStats = {
            sim: Number(summary.contato_mudou_sim) || 0,
            nao: 0,
            vazio: 0,
          };
          payload.jaFezStats = {
            sim: Number(summary.ja_fez_eac_sim) || 0,
            nao: 0,
            vazio: 0,
          };
        }
        const list = applyNonEnrolledDataset(payload);
        setNonEnrolledSearchDone(true);
        const totalFromApi =
          typeof payload?.total === 'number' && payload.total >= 0
            ? payload.total
            : list.length;
        setNonEnrolledSearchTotal(totalFromApi);
      } else {
        alert(response.error || 'Não foi possível pesquisar Não Inscritos.');
      }
    } catch (e) {
      alert('Erro ao pesquisar Não Inscritos.');
    } finally {
      setIsNonEnrolledSearching(false);
    }
  }, [applyNonEnrolledDataset]);

  const handleRefreshNonEnrolledRecords = useCallback(async () => {
    setIsNonEnrolledRefreshing(true);
    try {
      const updateRes = await callApiProxy('ATUALIZAR_NAO_INSCRITOS', googleWebAppUrl, {});
      if (!isApiSuccess(updateRes)) {
        alert(updateRes?.error || 'Não foi possível atualizar os registros de Não Inscritos.');
        return;
      }

      const neData = await callApiProxy('GET_NON_ENROLLED', googleWebAppUrl);
      if (isApiSuccess(neData)) {
        const payload = unwrapApiPayload(neData);
        const list = applyNonEnrolledDataset(payload);
        const totalFromApi =
          typeof payload?.total === 'number' && payload.total >= 0
            ? payload.total
            : list.length;
        setNonEnrolledSearchTotal(totalFromApi);
      }

      const lidas = Number(updateRes?.lidas || 0);
      const inseridos = Number(updateRes?.inseridos || 0);
      alert(`Atualização concluída. Linhas lidas: ${lidas}. Novos registros inseridos: ${inseridos}.`);
    } catch (e) {
      alert('Erro ao atualizar os registros de Não Inscritos.');
    } finally {
      setIsNonEnrolledRefreshing(false);
    }
  }, [googleWebAppUrl, applyNonEnrolledDataset]);

  const fetchNonEnrolledCountRealtime = useCallback(async () => {
    try {
      const neData = await callApiProxy('GET_NON_ENROLLED', googleWebAppUrl);
      if (!isApiSuccess(neData)) return;

      const payload = unwrapApiPayload(neData);
      const totalFromApi =
        typeof payload?.total === 'number' && payload.total >= 0
          ? payload.total
          : (Array.isArray(payload?.nonEnrolled) ? payload.nonEnrolled.length : 0);

      setNonEnrolledSearchTotal(totalFromApi);
    } catch (e) {
      console.error('Erro ao atualizar contador de Não Inscritos:', e);
    }
  }, [googleWebAppUrl]);

  const fetchNonEnrolledIndicatorsRealtime = useCallback(async () => {
    try {
      const neData = await callApiProxy('GET_NON_ENROLLED', googleWebAppUrl);
      if (!isApiSuccess(neData)) return;

      const payload = unwrapApiPayload(neData);
      const list = applyNonEnrolledDataset(payload);
      const totalFromApi =
        typeof payload?.total === 'number' && payload.total >= 0
          ? payload.total
          : list.length;
      setNonEnrolledSearchTotal(totalFromApi);
    } catch (e) {
      console.error('Erro ao atualizar indicadores de Não Inscritos:', e);
    }
  }, [googleWebAppUrl, applyNonEnrolledDataset]);

  const openNonEnrolledView = useCallback(() => {
    setShowNonEnrolledView(true);
    setNonEnrolled([]);
    setBairroStats([]);
    setSelectedBairroFilter(null);
    setSelectedBairroInterestSimFilter(null);
    setSelectedIndicatorFilter(null);
    setTableFilters({ ...DEFAULT_NON_ENROLLED_TABLE_FILTERS });
    setShowFiltersPanel(true);
    setNonEnrolledMeta({
      interestStats: null,
      jaFezStats: null,
      contatoMudouStats: null,
      statusEnvioBlankCount: null,
      preConfirmadasCount: null,
    });
    setNonEnrolledSearchDone(false);
    setNonEnrolledSearchTotal(0);
  }, []);

  useEffect(() => {
    if (!showNonEnrolledView) return;

    fetchNonEnrolledIndicatorsRealtime();
    const intervalId = setInterval(fetchNonEnrolledIndicatorsRealtime, 30000);

    return () => clearInterval(intervalId);
  }, [showNonEnrolledView, fetchNonEnrolledIndicatorsRealtime]);

  useEffect(() => {
    if (showNonEnrolledView) return;

    fetchNonEnrolledCountRealtime();
    const intervalId = setInterval(fetchNonEnrolledCountRealtime, 30000);

    return () => clearInterval(intervalId);
  }, [showNonEnrolledView, fetchNonEnrolledCountRealtime]);

  const fetchEmailStatusSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      const res = await callApiProxy('GET_EMAIL_STATUS_SUMMARY', googleWebAppUrl);
      if (res?.success) {
        setEmailStatusSummary(res.summary || {});
      }
    } catch (e) {
      console.error('Erro ao buscar resumo de chamados:', e);
    } finally {
      setIsLoadingSummary(false);
    }
  }, [googleWebAppUrl]);

  const fetchEmailHistory = useCallback(async (idPessoa: string) => {
    const id = toCleanString(idPessoa);
    if (!id) return;
    setIsLoadingHistory(true);
    try {
      const res = await callApiProxy('GET_EMAIL_CALLS_BY_PERSON', googleWebAppUrl, { idPessoa: id });
      if (res?.success) {
        setEmailHistory(prev => ({ ...prev, [id]: res.history || [] }));
      }
    } catch (e) {
      console.error('Erro ao buscar histrico de chamados:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [googleWebAppUrl]);

  // Atualiza automaticamente o histórico quando abrimos um "Não inscrito"
  useEffect(() => {
    const id = getNonEnrolledId(selectedNonEnrolled);
    if (selectedNonEnrolled && id) {
      fetchEmailHistory(id);
    }
  }, [selectedNonEnrolled, fetchEmailHistory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ====== Indicadores do "Não inscritos" (planilha colunas I/J/K)
  const nonEnrolledIndicators = useMemo(() => {
    const list: any[] = Array.isArray(nonEnrolled) ? (nonEnrolled as any[]) : [];
    const computed = {
      interesseCount: list.filter(ne => isYes(getNonEnrolledField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']))).length,
      interesseNoCount: list.filter(ne => isNo(getNonEnrolledField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']))).length,
      interesseNotSimCount: list.filter(ne => !isYes(getNonEnrolledField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']))).length,
      interessePendenteCount: list.filter(ne => {
        const interesse = getNonEnrolledField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']);
        const preConfirmacao = toCleanString(getNonEnrolledField(ne, ['statusPreConfirmacao','preConfirmacaoStatus','preConfirmacao','Status Pre Confirmacao','P']));
        return !isYes(interesse) && !isNo(interesse) && preConfirmacao === '';
      }).length,
      fezEacCount: list.filter(ne => isYes(getNonEnrolledField(ne, ['J fez o EAC', 'Ja fez o EAC', 'jaFezEac', 'fezEac', 'eacOutraParoquia', 'JaFezEac', 'J']))).length,
      contatoMudouCount: list.filter(ne => isYes(getNonEnrolledField(ne, ['Contato Mudou', 'contatoMudou', 'mudouContato', 'ContatoMudou', 'K']))).length,
      statusEnvioBlank: list.filter(ne => toCleanString(getNonEnrolledField(ne, ['statusEnvio','Status Envio','status_envio','H'])) === '').length,
      preConfirmadasCount: list.filter(ne => {
        const interesse = getNonEnrolledField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']);
        const preConfirmacao = toCleanString(getNonEnrolledField(ne, ['statusPreConfirmacao','preConfirmacaoStatus','preConfirmacao','Status Pre Confirmacao','P']));
        return isSimStrict(interesse) && preConfirmacao !== '';
      }).length,
    };

    const interestStats = nonEnrolledMeta?.interestStats;
    const jaFezStats = nonEnrolledMeta?.jaFezStats;
    const contatoStats = nonEnrolledMeta?.contatoMudouStats;
    const statusEnvioBlankFromApi = typeof nonEnrolledMeta?.statusEnvioBlankCount === 'number' ? nonEnrolledMeta.statusEnvioBlankCount : null;
    const preConfirmadasFromApi = typeof nonEnrolledMeta?.preConfirmadasCount === 'number' ? nonEnrolledMeta.preConfirmadasCount : null;

    const hasAny = (s: any) => s && typeof s === 'object' && (Number(s.sim) + Number(s.nao) + Number(s.vazio) > 0);

    return {
      interesseCount: hasAny(interestStats) ? Number(interestStats.sim) || 0 : computed.interesseCount,
      interesseNoCount: hasAny(interestStats) ? Number(interestStats.nao) || 0 : computed.interesseNoCount,
      interesseNotSimCount: hasAny(interestStats)
        ? (Number(interestStats.nao) || 0) + (Number(interestStats.vazio) || 0)
        : computed.interesseNotSimCount,
      interessePendenteCount: computed.interessePendenteCount,
      fezEacCount: hasAny(jaFezStats) ? Number(jaFezStats.sim) || 0 : computed.fezEacCount,
      contatoMudouCount: hasAny(contatoStats) ? Number(contatoStats.sim) || 0 : computed.contatoMudouCount,
      statusEnvioBlank: statusEnvioBlankFromApi !== null ? statusEnvioBlankFromApi : computed.statusEnvioBlank,
      // Regra fixa do indicador:
      // I = SIM e P preenchida (mesma regra do COUNTIFS da planilha).
      preConfirmadasCount: preConfirmadasFromApi !== null ? preConfirmadasFromApi : computed.preConfirmadasCount,
    };
  }, [nonEnrolled, nonEnrolledMeta]);

  const bairroStatsInterestSim = useMemo(() => {
    const map = new Map<string, number>();
    (Array.isArray(nonEnrolled) ? nonEnrolled : []).forEach((ne: any) => {
      const interesse = getNonEnrolledField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']);
      if (!isYes(interesse)) return;
      const bairro = toCleanString(ne?.bairro || ne?.Bairro || ne?.BAIRRO || ne?.['Bairro']);
      if (!bairro) return;
      map.set(bairro, (map.get(bairro) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nome, quantidade]) => ({ nome, quantidade }));
  }, [nonEnrolled]);

  const filteredMembers = useMemo(() => {
    const list = Array.isArray(members) ? members : [];
    const faixaEtariaFilter = toCleanString(memberFiltersApplied.faixaEtaria).toLowerCase();

    const resolveAge = (m: any): number | null => {
      const idadeRaw = toCleanString(m?.idade);
      const idadeNum = Number(idadeRaw.replace(',', '.'));
      if (isFinite(idadeNum) && idadeNum >= 0) return Math.floor(idadeNum);
      return calculateAgeFromBirthDate(toCleanString(m?.nascimento));
    };

    const matchesFaixaEtaria = (age: number | null, faixa: string) => {
      if (!faixa) return true;
      if (age === null) return false;
      if (faixa === '0_11') return age >= 0 && age <= 11;
      if (faixa === '12_16') return age >= 12 && age <= 16;
      if (faixa === '17_plus') return age >= 17;
      return true;
    };

    if (memberSearchTotal !== null) {
      if (!faixaEtariaFilter) return list;
      return list.filter((m: any) => matchesFaixaEtaria(resolveAge(m), faixaEtariaFilter));
    }

    const query = toCleanString(memberFiltersApplied.query).toLowerCase();
    const bairroFilter = toCleanString(memberFiltersApplied.bairro).toLowerCase();
    const telefoneFilterRaw = toCleanString(memberFiltersApplied.telefone);
    const telefoneFilterDigits = telefoneFilterRaw.replace(/\D/g, '');
    const emailFilter = toCleanString(memberFiltersApplied.email).toLowerCase();
    const sexoFilter = toCleanString(memberFiltersApplied.sexo).toLowerCase();
    const pertenceFilter = toCleanString(memberFiltersApplied.pertencePorciuncula).toLowerCase();

    return list.filter((m: any) => {
      const nome = toCleanString(m?.nome).toLowerCase();
      const email = toCleanString(m?.email).toLowerCase();
      const telRaw = toCleanString(m?.telefone || m?.whatsapp);
      const telDigits = telRaw.replace(/\D/g, '');
      const bairro = toCleanString(m?.bairro).toLowerCase();
      const sexo = toCleanString(m?.sexo).toLowerCase();
      const pertence = toCleanString(m?.pertencePorciuncula).toLowerCase();

      if (query) {
        const queryDigits = query.replace(/\D/g, '');
        const inText = nome.includes(query) || email.includes(query) || bairro.includes(query) || telRaw.toLowerCase().includes(query);
        const inDigits = queryDigits ? telDigits.includes(queryDigits) : false;
        if (!inText && !inDigits) return false;
      }

      if (bairroFilter && !bairro.includes(bairroFilter)) return false;
      if (emailFilter && !email.includes(emailFilter)) return false;
      if (sexoFilter && sexo !== sexoFilter) return false;
      if (pertenceFilter && pertence !== pertenceFilter) return false;
      if (!matchesFaixaEtaria(resolveAge(m), faixaEtariaFilter)) return false;

      if (telefoneFilterRaw) {
        if (telefoneFilterDigits) {
          if (!telDigits.includes(telefoneFilterDigits)) return false;
        } else if (!telRaw.toLowerCase().includes(telefoneFilterRaw.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [members, memberFiltersApplied, memberSearchTotal]);

  const membersStatusIndicators = useMemo(() => {
    const counters = {
      inscrito: 0,
      priorizado: 0,
      confirmado: 0,
      naoSelecionado: 0,
      desistente: 0,
      cancelado: 0,
    };
    (Array.isArray(members) ? members : []).forEach((member: any) => {
      const resolved = resolveMemberOperationalStatus(member);
      if (resolved === 'inscrito') counters.inscrito += 1;
      else if (resolved === 'priorizado') counters.priorizado += 1;
      else if (resolved === 'confirmado') counters.confirmado += 1;
      else if (resolved === 'nao_selecionado') counters.naoSelecionado += 1;
      else if (resolved === 'desistente') counters.desistente += 1;
      else if (resolved === 'cancelado') counters.cancelado += 1;
    });
    return counters;
  }, [members]);

  const memberBairroOptions = useMemo(() => {
    const set = new Set<string>();
    (Array.isArray(members) ? members : []).forEach((m: any) => {
      const bairro = toCleanString(m?.bairro);
      if (bairro) set.add(bairro);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [members]);

  const hasAdvancedFiltersActive = useMemo(() => {
    return Boolean(
      toCleanString(memberFiltersDraft.email) ||
      toCleanString(memberFiltersDraft.sexo) ||
      toCleanString(memberFiltersDraft.pertencePorciuncula) ||
      toCleanString(memberFiltersDraft.faixaEtaria)
    );
  }, [memberFiltersDraft]);

  const abortPendingMemberSearch = useCallback(() => {
    if (memberSearchAbortRef.current) {
      memberSearchAbortRef.current.abort();
      memberSearchAbortRef.current = null;
    }
  }, []);

  const handleMemberFilterChange = useCallback((field: keyof MemberSearchFilters, value: string) => {
    setMemberFiltersDraft(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleMemberSearch = useCallback(async () => {
    const applied = { ...memberFiltersDraft };
    setMemberFiltersApplied(applied);

    const requestSeq = memberSearchRequestSeqRef.current + 1;
    memberSearchRequestSeqRef.current = requestSeq;

    abortPendingMemberSearch();
    const controller = new AbortController();
    memberSearchAbortRef.current = controller;
    setIsMemberSearching(true);

    try {
      const payload = {
        query: applied.query,
        bairro: applied.bairro,
        telefone: applied.telefone,
        email: applied.email,
        sexo: applied.sexo,
        pertencePorciuncula: applied.pertencePorciuncula,
        faixaEtaria: applied.faixaEtaria,
        ageRange: applied.faixaEtaria,
        page: 1,
        limit: 30,
        sortBy: 'nome',
        sortDir: 'asc',
      };
      const res = await callApiProxy('SEARCH_MEMBERS', googleWebAppUrl, payload, { signal: controller.signal });
      if (requestSeq !== memberSearchRequestSeqRef.current) return;

      if (res?.success) {
        const items = Array.isArray(res.items) ? res.items : (Array.isArray(res.members) ? res.members : []);
        setMembers(items);
        setMemberSearchTotal(Number(res.total) || items.length);
      } else {
        alert(res?.error || 'Não foi possível pesquisar participantes.');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      alert('Erro ao pesquisar participantes.');
    } finally {
      if (requestSeq === memberSearchRequestSeqRef.current) {
        setIsMemberSearching(false);
        if (memberSearchAbortRef.current === controller) {
          memberSearchAbortRef.current = null;
        }
      }
    }
  }, [googleWebAppUrl, memberFiltersDraft, abortPendingMemberSearch]);

  const handleMemberSearchClear = useCallback(async () => {
    abortPendingMemberSearch();
    memberSearchRequestSeqRef.current += 1;
    setIsMemberSearching(false);

    const reset = { ...DEFAULT_MEMBER_SEARCH_FILTERS };
    setMemberFiltersDraft(reset);
    setMemberFiltersApplied(reset);
    setMemberSearchTotal(null);
    await fetchData();
  }, [fetchData, abortPendingMemberSearch]);

  useEffect(() => {
    return () => {
      abortPendingMemberSearch();
    };
  }, [abortPendingMemberSearch]);

  const memberSearchUiState = useMemo<MemberSearchUiState>(() => {
    if (isMemberSearching) return 'carregando';
    if (memberSearchTotal === null) return 'sem_busca';
    return filteredMembers.length > 0 ? 'resultados' : 'nenhum_resultado';
  }, [isMemberSearching, memberSearchTotal, filteredMembers.length]);

  const getEmailStatusData = useCallback(
    (ne: any) => {
      const id = getNonEnrolledId(ne);
      if (!id) return null;
      return emailStatusSummary ? (emailStatusSummary as any)[id] || null : null;
    },
    [emailStatusSummary]
  );

  const filteredNonEnrolled = useMemo(() => {
    try {
      let list: any[] = Array.isArray(nonEnrolled) ? (nonEnrolled as any[]) : [];

      const normalizeStatus = (s: any) => {
        const norm = String(toCleanString(s) || '').toUpperCase();
        if (!norm) return '';
        if (norm.includes('RESP')) return 'RESPONDIDO';
        if (norm.includes('ENVIADO')) return 'ENVIADO';
        if (norm.includes('ERRO')) return 'ERRO';
        if (norm.includes('ENCERR')) return 'ENCERRADO';
        return norm;
      };

      // filtro por bairro via cards (se existir)
      if (selectedBairroFilter) {
        list = list.filter(ne => toCleanString(ne?.bairro || ne?.Bairro || ne?.BAIRRO || ne?.['Bairro']) === selectedBairroFilter);
      }
      if (selectedBairroInterestSimFilter) {
        list = list.filter(ne => {
          const bairro = toCleanString(ne?.bairro || ne?.Bairro || ne?.BAIRRO || ne?.['Bairro']);
          const interesse = getNonEnrolledField(ne, ['Interesse Confirmado','interesseConfirmado','interesse_confirmado','interesse','confirmouInteresse','Interesse','I']);
          return bairro === selectedBairroInterestSimFilter && isYes(interesse);
        });
      }

      // filtro por indicador clicado
      if (selectedIndicatorFilter) {
        list = list.filter((ne: any) => {
          const interesse = getNonEnrolledField(ne, ['Interesse Confirmado', 'interesse', 'interesseConfirmado', 'confirmouInteresse', 'Interesse', 'I']);
          const jaFez = getNonEnrolledField(ne, ['J fez o EAC', 'Ja fez o EAC', 'jaFezEac', 'fezEac', 'eacOutraParoquia', 'JaFezEac', 'J']);
          const contatoMudou = getNonEnrolledField(ne, ['Contato Mudou', 'contatoMudou', 'mudouContato', 'ContatoMudou', 'K']);
          const statusEnvio = toCleanString(getNonEnrolledField(ne, ['statusEnvio', 'Status Envio', 'status_envio', 'H']));
          const preConfirmacao = toCleanString(getNonEnrolledField(ne, ['statusPreConfirmacao', 'preConfirmacaoStatus', 'preConfirmacao', 'Status Pre Confirmacao', 'P']));

          switch (selectedIndicatorFilter) {
            case 'interesse_sim':
              return isYes(interesse);
            case 'interesse_nao':
              return isNo(interesse);
            case 'fez_eac_sim':
              return isYes(jaFez);
            case 'contato_mudou_sim':
              return isYes(contatoMudou);
            case 'interesse_pendente':
              return !isYes(interesse) && !isNo(interesse) && preConfirmacao === '';
            case 'status_envio_blank':
              return statusEnvio === '';
            case 'pre_confirmadas':
              return isSimStrict(interesse) && preConfirmacao !== '';
            default:
              return true;
          }
        });
      }

      // filtros da tabela
      const fNome = toCleanString(tableFilters.nome).toLowerCase();
      const fBairro = toCleanString(tableFilters.bairro);
      const fInteresse = toCleanString(tableFilters.interesse);
      const fJaFez = toCleanString(tableFilters.jaFezEac);
      const fContato = toCleanString(tableFilters.contatoMudou);
      const fStatusEnvio = toCleanString(tableFilters.statusEnvio);
      const fRecebeuConfirmacao = toCleanString(tableFilters.recebeuConfirmacaoCadastro);
      const fStatusUltimo = normalizeStatus(tableFilters.statusUltimoChamado);

      if (fNome) {
        list = list.filter(ne => toCleanString(ne?.nome || ne?.Nome || ne?.['Nome']).toLowerCase().includes(fNome));
      }
      if (fBairro) {
        list = list.filter(ne => toCleanString(ne?.bairro || ne?.Bairro || ne?.BAIRRO || ne?.['Bairro']) === fBairro);
      }
      if (fInteresse) {
        list = list.filter(ne => {
          const raw = toCleanString(getNonEnrolledField(ne, ['Interesse Confirmado','interesseConfirmado','interesse_confirmado','interesse','confirmouInteresse','Interesse','I']));
          if (fInteresse.toLowerCase() === 'em branco') return raw === '';
          const wanted = fInteresse.toLowerCase() === 'sim';
          return isYes(raw) === wanted;
        });
      }
      if (fJaFez) {
        const wanted = fJaFez.toLowerCase() === 'sim';
        list = list.filter(ne => (isYes(getNonEnrolledField(ne, ['J fez o EAC','Ja fez o EAC','jaFezEac','fezEac','eacOutraParoquia','JaFezEac','J'])) === wanted));
      }
      if (fContato) {
        const wanted = fContato.toLowerCase() === 'sim';
        list = list.filter(ne => (isYes(getNonEnrolledField(ne, ['Contato Mudou','contatoMudou','mudouContato','ContatoMudou','K'])) === wanted));
      }
      if (fStatusEnvio) {
        list = list.filter(ne => {
          const raw = toCleanString(getNonEnrolledField(ne, ['statusEnvio','Status Envio','status_envio','H']));
          const isFilled = raw !== '';
          return fStatusEnvio.toLowerCase() === 'preenchido' ? isFilled : !isFilled;
        });
      }
      if (fRecebeuConfirmacao) {
        list = list.filter(ne => {
          const raw = toCleanString(getNonEnrolledField(ne, ['statusPreConfirmacao', 'preConfirmacaoStatus', 'preConfirmacao', 'Status Pre Confirmacao', 'P']));
          const recebeu = raw !== '';
          return fRecebeuConfirmacao.toLowerCase() === 'recebeu' ? recebeu : !recebeu;
        });
      }

      if (fStatusUltimo) {
        list = list.filter(ne => {
          const s = normalizeStatus(getEmailStatusData(ne)?.status || '');
          if (fStatusUltimo === 'EM BRANCO') return !s;
          return s === fStatusUltimo;
        });
      }

      return list;
    } catch (err) {
      console.error('Erro ao filtrar Não Inscritos:', err);
      return [];
    }
  }, [nonEnrolled, selectedBairroFilter, selectedBairroInterestSimFilter, selectedIndicatorFilter, tableFilters, getEmailStatusData]);

  const sortedNonEnrolled = useMemo(() => {
    const list = [...(filteredNonEnrolled || [])];
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    const key = sortConfig.key;
    const getVal = (ne: any) => {
      switch (key) {
        case 'interesse':
          return formatYesNoOrBlank(getNonEnrolledField(ne, ['Interesse Confirmado','interesseConfirmado','interesse','I']));
        case 'jaFezEac':
          return formatYesNoOrBlank(getNonEnrolledField(ne, ['J fez o EAC','Ja fez o EAC','jaFezEac','fezEac','eacOutraParoquia','J']));
        case 'contatoMudou':
          return formatYesNoOrBlank(getNonEnrolledField(ne, ['Contato Mudou','contatoMudou','mudouContato','ContatoMudou','K']));
        case 'status':
          return toCleanString(getEmailStatusData(ne)?.status || '');
        case 'sentAt':
          return getEmailStatusData(ne)?.sentAt || '';
        case 'replyAt':
          return getEmailStatusData(ne)?.lastReplyAt || '';
        case 'dataCadastro':
          return getSheetDateSortKey(getNonEnrolledField(ne, ['dataCadastro', 'dataInscricao', 'Data Cadastro', 'Data Inscrição', 'E']));
        case 'preConfirmacao':
          return getSheetDateSortKey(getNonEnrolledField(ne, ['statusPreConfirmacao', 'preConfirmacaoStatus', 'preConfirmacao', 'Status Pre Confirmacao', 'P']));
        case 'nome':
        default:
          return toCleanString(ne?.nome || ne?.Nome || ne?.['Nome']);
      }
    };
    list.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return list;
  }, [filteredNonEnrolled, sortConfig, getEmailStatusData]);

  const hasNonEnrolledLocalFilters = useMemo(() => {
    const hasCardFilter =
      Boolean(selectedIndicatorFilter) ||
      Boolean(selectedBairroFilter) ||
      Boolean(selectedBairroInterestSimFilter);
    const hasTableFilter = Object.values(tableFilters || {}).some((value) => toCleanString(value) !== '');
    return hasCardFilter || hasTableFilter;
  }, [selectedIndicatorFilter, selectedBairroFilter, selectedBairroInterestSimFilter, tableFilters]);

  const limitedNonEnrolled = useMemo(() => {
    if (hasNonEnrolledLocalFilters) return sortedNonEnrolled;
    return sortedNonEnrolled.slice(0, NON_ENROLLED_QUERY_LIMIT);
  }, [sortedNonEnrolled, hasNonEnrolledLocalFilters]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

const openEmailComposer = (ne: any) => {
  const email = toCleanString(ne?.email || ne?.Email || ne?.['Email']);
  const nome = toCleanString(ne?.nome || ne?.Nome || ne?.['Nome']);
  setSelectedNonEnrolled(ne);
  const idPessoa = getNonEnrolledId(ne);
  if (idPessoa) {
    fetchEmailHistory(idPessoa);
  }
  setEmailDraft({
    to: email,
    name: nome,
    subject: nome ? `Contato EAC - ${nome}` : 'Contato EAC',
    body: nome ? `Ol ${nome.split(' ')[0]},\n\n` : 'Ol,\n\n',
    });
    setShowEmailComposer(true);
  };

const renderStatusBadge = (statusRaw: string) => {
  const status = toCleanString(statusRaw).toUpperCase();
  const base = "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest";
  if (status === "RESPONDIDO") return <span className={`${base} bg-emerald-50 text-emerald-700 border border-emerald-200`}>Respondido</span>;
  if (status === "ENVIADO") return <span className={`${base} bg-sky-50 text-sky-700 border border-sky-200`}>Enviado</span>;
  if (status === "ERRO") return <span className={`${base} bg-rose-50 text-rose-700 border border-rose-200`}>Erro</span>;
  if (status === "ENCERRADO") return <span className={`${base} bg-slate-100 text-slate-600 border border-slate-200`}>Encerrado</span>;
  if (status) return <span className={`${base} bg-amber-50 text-amber-700 border border-amber-200`}>{status}</span>;
  return <span className={`${base} bg-slate-100 text-slate-500 border border-slate-200`}>-</span>;
};

const renderYesNoBadge = (label: string) => {
  const v = toCleanString(label).toLowerCase();
  const base = "px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center min-w-[88px]";
  if (v === 'sim') return <span className={`${base} bg-emerald-50 text-emerald-700 border border-emerald-200`}>Sim</span>;
  if (v === 'No' || v === 'nao') return <span className={`${base} bg-slate-100 text-slate-600 border border-slate-200`}>No</span>;
  return <span className={`${base} bg-slate-50 text-slate-400 border border-slate-100`}>Em branco</span>;
};

const handleUpdateInterest = async (ne: any, selection: 'Sim' | 'Não' | 'Em branco') => {
  const idPessoa = getNonEnrolledId(ne);
  if (!idPessoa) {
    alert('ID do Não Inscrito (coluna A) não encontrado.');
    return;
  }

  const target = selection === 'Em branco' ? '' : selection;
  const email = toCleanString(ne?.email || ne?.Email || ne?.['Email']);
  const previousList = Array.isArray(nonEnrolled) ? [...nonEnrolled] : [];

  const optimistic = previousList.map((item) => {
    if (getNonEnrolledId(item) !== idPessoa) return item;
    const updated: any = { ...item };
    updated.interesseConfirmado = target;
    updated.interesse = target;
    updated.Interesse = target;
    updated.dataResposta = target ? new Date().toISOString() : '';
    return updated;
  });

  setNonEnrolled(optimistic);
  setNonEnrolledMeta((prev: any) => ({ ...prev, interestStats: computeInterestStatsFromList(optimistic) }));
  setUpdatingInterestId(idPessoa);

  try {
    const response = await patchJson<any>('/api/nao-inscritos/interesse', {
      idPessoa,
      interesse: target,
      email,
    });
    const res = response.success ? response.data : { success: false, error: response.error };

    if (!res?.success) {
      throw new Error(res?.error || 'Não foi possível atualizar o interesse.');
    }

    let finalList = optimistic;
    if (res.updatedRow) {
      finalList = optimistic.map((item) => {
        if (getNonEnrolledId(item) !== idPessoa) return item;
        return {
          ...item,
          ...res.updatedRow,
          interesseConfirmado: res.updatedRow.interesseConfirmado,
          interesse: res.updatedRow.interesseConfirmado,
          dataResposta: res.updatedRow.dataResposta || item.dataResposta,
        };
      });
    }

    setNonEnrolled(finalList);
    setNonEnrolledMeta((prev: any) => ({ ...prev, interestStats: computeInterestStatsFromList(finalList) }));
    setSelectedNonEnrolled((current) => {
      if (current && getNonEnrolledId(current) === idPessoa) {
        return finalList.find((item) => getNonEnrolledId(item) === idPessoa) || current;
      }
      return current;
    });
  } catch (err: any) {
    alert(err?.message || 'Erro ao atualizar interesse.');
    setNonEnrolled(previousList);
    setNonEnrolledMeta((prev: any) => ({ ...prev, interestStats: computeInterestStatsFromList(previousList) }));
    setSelectedNonEnrolled((current) => {
      if (current && getNonEnrolledId(current) === idPessoa) {
        return previousList.find((item) => getNonEnrolledId(item) === idPessoa) || current;
      }
      return current;
    });
  } finally {
    setUpdatingInterestId(null);
  }
};

const handleUpdateRecado = async (ne: any, recadoInput: string) => {
  const idPessoa = getNonEnrolledId(ne);
  if (!idPessoa) {
    alert('ID do Não Inscrito (coluna A) não encontrado.');
    return;
  }

  const recado = String(recadoInput ?? '').trim();
  const email = toCleanString(ne?.email || ne?.Email || ne?.['Email']);
  const previousList = Array.isArray(nonEnrolled) ? [...nonEnrolled] : [];

  const optimistic = previousList.map((item) => {
    if (getNonEnrolledId(item) !== idPessoa) return item;
    const updated: any = { ...item };
    updated.recado = recado;
    updated.Recado = recado;
    return updated;
  });

  setNonEnrolled(optimistic);
  setSelectedNonEnrolled((current) => {
    if (current && getNonEnrolledId(current) === idPessoa) {
      return optimistic.find((item) => getNonEnrolledId(item) === idPessoa) || current;
    }
    return current;
  });
  setUpdatingRecadoId(idPessoa);

  try {
    const res = await callApiProxy('UPDATE_NON_ENROLLED_RECADO', googleWebAppUrl, {
      idPessoa,
      recado,
      email,
    });

    if (!res?.success) {
      throw new Error(res?.error || 'Não foi possível atualizar o recado.');
    }

    let finalList = optimistic;
    if (res.updatedRow) {
      finalList = optimistic.map((item) => {
        if (getNonEnrolledId(item) !== idPessoa) return item;
        return {
          ...item,
          ...res.updatedRow,
          recado: res.updatedRow.recado ?? recado,
        };
      });
    }

    setNonEnrolled(finalList);
    setSelectedNonEnrolled((current) => {
      if (current && getNonEnrolledId(current) === idPessoa) {
        return finalList.find((item) => getNonEnrolledId(item) === idPessoa) || current;
      }
      return current;
    });
  } catch (err: any) {
    alert(err?.message || 'Erro ao atualizar recado.');
    setNonEnrolled(previousList);
    setSelectedNonEnrolled((current) => {
      if (current && getNonEnrolledId(current) === idPessoa) {
        return previousList.find((item) => getNonEnrolledId(item) === idPessoa) || current;
      }
      return current;
    });
  } finally {
    setUpdatingRecadoId(null);
  }
};

const openNonEnrolledEditor = (ne: any) => {
  const idPessoa = getNonEnrolledId(ne);
  if (!idPessoa) {
    alert('ID do Não Inscrito (coluna A) não encontrado.');
    return;
  }
  setEditingNonEnrolledId(idPessoa);
  setNonEnrolledEditDraft(buildNonEnrolledEditDraft(ne));
  setShowNonEnrolledEditor(true);
};

const closeNonEnrolledEditor = () => {
  if (isSavingNonEnrolledEdit) return;
  setShowNonEnrolledEditor(false);
  setEditingNonEnrolledId(null);
  setNonEnrolledEditDraft({ ...EMPTY_NON_ENROLLED_EDIT_DRAFT });
};

const handleSaveNonEnrolledEdit = async () => {
  if (!editingNonEnrolledId) {
    alert('ID do Não Inscrito (coluna A) não encontrado.');
    return;
  }

  const normalizedBirthDate = normalizeBirthDateForSave(nonEnrolledEditDraft.dataNascimento);
  if (!normalizedBirthDate.ok) {
    alert(normalizedBirthDate.error || 'Data de nascimento inválida.');
    return;
  }

  const draftToSave: NonEnrolledEditDraft = {
    ...nonEnrolledEditDraft,
    dataNascimento: normalizedBirthDate.value,
  };

  setNonEnrolledEditDraft(draftToSave);

  const previousList = Array.isArray(nonEnrolled) ? [...nonEnrolled] : [];
  const optimistic = previousList.map((item) => (
    getNonEnrolledId(item) === editingNonEnrolledId
      ? applyNonEnrolledDraftToItem(item, draftToSave)
      : item
  ));

  setNonEnrolled(optimistic);
  setSelectedNonEnrolled((current) => {
    if (current && getNonEnrolledId(current) === editingNonEnrolledId) {
      return optimistic.find((item) => getNonEnrolledId(item) === editingNonEnrolledId) || current;
    }
    return current;
  });
  setNonEnrolledMeta((prev: any) => ({
    ...prev,
    interestStats: null,
    jaFezStats: null,
    contatoMudouStats: null,
  }));
  setIsSavingNonEnrolledEdit(true);

  try {
    const res = await callApiProxy('UPDATE_NON_ENROLLED_RECORD', googleWebAppUrl, {
      idPessoa: editingNonEnrolledId,
      email: draftToSave.email,
      record: { ...draftToSave },
    });

    if (!res?.success) {
      throw new Error(res?.error || 'Não foi possível atualizar o cadastro do não inscrito.');
    }

    let finalList = optimistic;
    if (res.updatedRow) {
      const serverDraft = buildNonEnrolledEditDraft(res.updatedRow);
      finalList = optimistic.map((item) => (
        getNonEnrolledId(item) === editingNonEnrolledId
          ? applyNonEnrolledDraftToItem(item, serverDraft)
          : item
      ));
      setNonEnrolledEditDraft(serverDraft);
    }

    setNonEnrolled(finalList);
    setSelectedNonEnrolled((current) => {
      if (current && getNonEnrolledId(current) === editingNonEnrolledId) {
        return finalList.find((item) => getNonEnrolledId(item) === editingNonEnrolledId) || current;
      }
      return current;
    });
    setShowNonEnrolledEditor(false);
    setEditingNonEnrolledId(null);
  } catch (err: any) {
    alert(err?.message || 'Erro ao atualizar cadastro do não inscrito.');
    setNonEnrolled(previousList);
    setSelectedNonEnrolled((current) => {
      if (current && getNonEnrolledId(current) === editingNonEnrolledId) {
        return previousList.find((item) => getNonEnrolledId(item) === editingNonEnrolledId) || current;
      }
      return current;
    });
  } finally {
    setIsSavingNonEnrolledEdit(false);
  }
};

const handlePrioritizeNonEnrolled = async (ne: any) => {
  const idPessoa = getNonEnrolledId(ne);
  if (!idPessoa) {
    alert('ID do Não Inscrito (coluna A) não encontrado.');
    return;
  }

  const email = toCleanString(ne?.email || ne?.Email || ne?.['Email']);
  const previousList = Array.isArray(nonEnrolled) ? [...nonEnrolled] : [];
  const currentStatus = toCleanString(getNonEnrolledField(ne, [
    'statusPriorizacao',
    'Status Priorizacao',
    'status_priorizacao',
    'Q'
  ]));
  const isCurrentlyPrioritized = isPrioritizedStatus(currentStatus);
  const optimisticStatus = isCurrentlyPrioritized ? '' : 'SIM';

  const optimistic = previousList.map((item) => {
    if (getNonEnrolledId(item) !== idPessoa) return item;
    const updated: any = { ...item };
    updated.statusPriorizacao = optimisticStatus;
    return updated;
  });

  setNonEnrolled(optimistic);
  setSelectedNonEnrolled((current) => {
    if (current && getNonEnrolledId(current) === idPessoa) {
      return optimistic.find((item) => getNonEnrolledId(item) === idPessoa) || current;
    }
    return current;
  });
  setUpdatingPrioridadeId(idPessoa);

  try {
    const response = await fetch('/api/nao-inscritos/priorizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linhaOrigem: idPessoa, priorizar: !isCurrentlyPrioritized }),
    });
    const raw = await response.text();
    let res: any = {};
    try {
      res = raw ? sanitizeTextDeep(JSON.parse(raw)) : {};
    } catch (e) {
      throw new Error('Resposta inválida ao priorizar candidato.');
    }

    if (!response.ok || !res?.success) {
      throw new Error(res?.error || 'Não foi possível atualizar a priorização do candidato.');
    }

    let finalList = optimistic;
    if (res.updatedRow) {
      finalList = optimistic.map((item) => {
        if (getNonEnrolledId(item) !== idPessoa) return item;
        return {
          ...item,
          ...res.updatedRow,
          statusPriorizacao: res.updatedRow.statusPriorizacao ?? optimisticStatus,
        };
      });
    }

    setNonEnrolled(finalList);
    setSelectedNonEnrolled((current) => {
      if (current && getNonEnrolledId(current) === idPessoa) {
        return finalList.find((item) => getNonEnrolledId(item) === idPessoa) || current;
      }
      return current;
    });
  } catch (err: any) {
    alert(err?.message || 'Erro ao atualizar priorização do candidato.');
    setNonEnrolled(previousList);
    setSelectedNonEnrolled((current) => {
      if (current && getNonEnrolledId(current) === idPessoa) {
        return previousList.find((item) => getNonEnrolledId(item) === idPessoa) || current;
      }
      return current;
    });
  } finally {
    setUpdatingPrioridadeId(null);
  }
};

const handleEditRecado = (ne: any) => {
  const currentRecado = toCleanString(getNonEnrolledField(ne, ['recado', 'Recado', 'L']));
  const nextRecado = window.prompt('Editar recado (coluna L da aba Não inscritos):', currentRecado);
  if (nextRecado === null) return;

  const normalizedNext = String(nextRecado).trim();
  if (normalizedNext === currentRecado) return;

  handleUpdateRecado(ne, normalizedNext);
};

const renderInterestEditor = (ne: any, currentLabel: string) => {
  const idPessoa = getNonEnrolledId(ne);
  const isLoading = updatingInterestId === idPessoa;
  const primaryOpts: Array<'Sim' | 'Não'> = ['Sim', 'Não'];
  const blankOpt: 'Em branco' = 'Em branco';

  const base = "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors min-w-[68px] text-center";

  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <div className="flex items-center gap-1">
        {primaryOpts.map((opt) => {
          const isActive = currentLabel.toLowerCase() === opt.toLowerCase();
          const palette = opt === 'Sim'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-rose-50 text-rose-700 border-rose-200';
          return (
            <button
              key={opt}
              type="button"
              disabled={isLoading}
              onClick={() => handleUpdateInterest(ne, opt)}
              className={`${base} ${isActive ? palette : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleUpdateInterest(ne, blankOpt)}
          className={`${base} ${currentLabel.toLowerCase() === blankOpt.toLowerCase() ? 'bg-slate-50 text-slate-400 border-slate-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
        >
          —
        </button>
        {isLoading && <span className="w-3 h-3 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />}
      </div>
    </div>
  );
};

  const handleSendEmail = async () => {
    if (!emailDraft.to) {
      alert('E-mail do destinatário não encontrado.');
      return;
    }
    const idPessoa = getNonEnrolledId(selectedNonEnrolled);
    if (!idPessoa) {
      alert('ID do Não Inscrito (coluna A da planilha) não encontrado para gerar o chamado.');
      return;
    }
    setIsSendingEmail(true);
    try {
      const response = await callApiProxy('SEND_NON_ENROLLED_EMAIL', googleWebAppUrl, {
        ...emailDraft,
        subjectBase: emailDraft.subject,
        idPessoa,
        operator: user.name || user.email,
      });
      if (response?.success) {
        alert(response?.message || 'E-mail enviado com sucesso.');
        setShowEmailComposer(false);
        fetchEmailStatusSummary();
      } else {
        alert(response?.error || 'Não foi possível enviar o e-mail.');
      }
    } catch (e) {
      alert('Erro ao enviar o e-mail.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendReply = async (closeCall = false) => {
    if (!selectedNonEnrolled) {
      alert('Selecione um contato para responder.');
      return;
    }
    const statusData = getEmailStatusData(selectedNonEnrolled);
    const idChamado = statusData?.idChamado || '';
    const token = (statusData as any)?.token || '';
    if (!replyBody.trim()) { alert('Digite uma mensagem.'); return; }
    if (!idChamado && !token) { alert('Não foi possível identificar o chamado para responder.'); return; }
    setIsSendingReply(true);
    setReplyAction(closeCall ? 'close' : 'send');
    try {
      const res = await callApiProxy('SEND_EMAIL_REPLY', googleWebAppUrl, {
        idChamado,
        token,
        body: replyBody,
        operator: user?.name || user?.email || 'Operador',
        closeCall: closeCall,
      });
      if (res?.success) {
        alert(closeCall ? 'Resposta enviada e chamado encerrado.' : 'Resposta enviada.');
        setShowReplyComposer(false);
        setReplyBody('');
        const personId = getNonEnrolledId(selectedNonEnrolled);
        if (personId) {
          fetchEmailHistory(personId);
        }
        fetchEmailStatusSummary();
      } else {
        alert(res?.error || 'Não foi possível enviar a resposta.');
      }
    } catch (e) {
      alert('Erro ao enviar resposta.');
    } finally {
      setIsSendingReply(false);
      setReplyAction(null);
    }
  };

  const convertFromNonEnrolled = (ne: any) => {
    const bairro = toCleanString(ne?.bairro || ne?.Bairro || ne?.BAIRRO || ne?.['Bairro']);
    setFormData({
      nome: toCleanString(ne?.nome || ne?.Nome || ne?.['Nome']),
      email: toCleanString(ne?.email || ne?.Email || ne?.['Email']),
      telefone: toCleanString(ne?.telefone || ne?.Telefone || ne?.['Telefone']),
      bairro: bairro,
      nascimento: toCleanString(ne?.nascimento || ne?.Nascimento || ne?.['Nascimento']),
      whatsapp: toCleanString(ne?.telefone || ne?.Telefone || ne?.['Telefone']),
      sexo: 'Masculino',
      endereco: '',
      responsavelNome: '',
      responsavelTel: '',
      responsavelEmail: '',
      tempoParoquia: '',
      participaGrupo: '',
      motivacao: '',
      expectativas: '',
      autorizaImagem: 'Sim',
      concordaNormas: 'Sim',
      pertencePorciuncula: 'Sim',
    } as any);
    setOriginalEmail(null);
    setIsEditing(false);
    setIsConverting(true);
    setShowNonEnrolledView(false);
    setActiveTab('pessoais');
    setShowEditor(true);
  };

  const handleSelectMember = (m: Adolescente) => {
    setOriginalEmail((m as any).email || null);
    setFormData({ ...(m as any) });
    setIsEditing(true);
    setIsConverting(false);
    setActiveTab('pessoais');
    setShowEditor(true);
  };

  const handleViewMember = (m: Adolescente) => {
    setSelectedMemberCard({ ...(m as any) });
    setMemberViewTab('pessoais');
    setShowMemberDrawer(true);
  };

  const handleDeleteMember = async (m: Adolescente) => {
    const email = toCleanString((m as any)?.email).toLowerCase();
    if (!email) {
      alert('Não foi possível excluir: e-mail não informado.');
      return;
    }

    const nome = toCleanString((m as any)?.nome) || email;
    const confirmed = await showAppConfirm({
      title: 'Excluir cadastro',
      message: `Confirma a exclusão do cadastro de "${nome}"?`,
      tone: 'warning',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setDeletingMemberEmail(email);
    try {
      const res = await callApiProxy('DELETE_MEMBER', googleWebAppUrl, { email });
      if (res?.success) {
        if (selectedMemberCard && toCleanString((selectedMemberCard as any)?.email).toLowerCase() === email) {
          setShowMemberDrawer(false);
          setSelectedMemberCard(null);
        }
        await fetchData();
        alert(res?.message || 'Cadastro removido com sucesso.');
      } else {
        alert(res?.error || 'Não foi possível remover o cadastro.');
      }
    } catch (e) {
      alert('Erro ao remover cadastro.');
    } finally {
      setDeletingMemberEmail(null);
    }
  };

  const handleNewRegistry = () => {
    setOriginalEmail(null);
    setFormData({
      nome: '', nascimento: '', sexo: 'Masculino', endereco: '', bairro: '', telefone: '', email: '',
      responsavelNome: '', responsavelTel: '', responsavelEmail: '',
      tempoParoquia: '', participaGrupo: '', motivacao: '', expectativas: '',
      autorizaImagem: 'Sim', concordaNormas: 'Sim', pertencePorciuncula: 'Sim',
      whatsapp: ''
    });
    setIsEditing(false);
    setIsConverting(false);
    setActiveTab('pessoais');
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setIsEditing(false);
    setIsConverting(false);
    setOriginalEmail(null);
  };

  const updateField = (field: keyof Adolescente, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.email) return alert("Nome e E-mail so obrigatrios.");
    setIsLoading(true);
    try {
      const data = await callApiProxy('SAVE_MEMBER', googleWebAppUrl, { ...formData, originalEmail });
      if (data?.success) {
        alert("Operao concluda!");
        await fetchData();
        handleCloseEditor();
      } else {
        alert("Erro: " + (data?.error || 'Falha ao salvar.'));
      }
    } catch (e) {
      alert('Erro na comunicao.');
    } finally {
      setIsLoading(false);
    }
  };

  const exportMembersCsv = async () => {
    setIsExportingMembersCsv(true);
    try {
      const res = await callApiProxy('GET_MEMBERS', googleWebAppUrl);
      if (!res?.success) {
        throw new Error(res?.error || 'Não foi possível carregar os dados de cadastro.');
      }

      const base: any[] = Array.isArray(res.members) ? res.members : [];
      const columnDefs: Array<{ header: string; getter: (m: any) => any }> = [
        { header: 'Timestamp', getter: (m) => m?.timestamp },
        { header: 'Nome', getter: (m) => m?.nome },
        { header: 'Nascimento', getter: (m) => m?.nascimento },
        { header: 'Sexo', getter: (m) => m?.sexo },
        { header: 'Endereco', getter: (m) => m?.endereco },
        { header: 'Bairro', getter: (m) => m?.bairro },
        { header: 'Telefone', getter: (m) => m?.telefone },
        { header: 'E-mail', getter: (m) => m?.email },
        { header: 'Responsavel Nome', getter: (m) => m?.responsavelNome },
        { header: 'Responsavel Telefone', getter: (m) => m?.responsavelTel },
        { header: 'Responsavel E-mail', getter: (m) => m?.responsavelEmail },
        { header: 'Tempo de Paroquia', getter: (m) => m?.tempoParoquia },
        { header: 'Participa de Grupo', getter: (m) => m?.participaGrupo },
        { header: 'Motivacao', getter: (m) => m?.motivacao },
        { header: 'Expectativas', getter: (m) => m?.expectativas },
        { header: 'Autoriza Imagem', getter: (m) => m?.autorizaImagem },
        { header: 'Concorda Normas', getter: (m) => m?.concordaNormas },
        { header: 'Idade', getter: (m) => m?.idade },
        { header: 'Pertence a Porciuncula', getter: (m) => m?.pertencePorciuncula },
        { header: 'Status Aniversario', getter: (m) => m?.statusAniv },
        { header: 'WhatsApp', getter: (m) => m?.whatsapp },
        { header: 'Aniversario Sim/Nao', getter: (m) => m?.anivSimNao },
        { header: 'Status Envio Comunicado', getter: (m) => m?.statusEnvioCom },
        { header: 'Status Envio Semanal', getter: (m) => m?.statusEnvioSem },
      ];

      const headers = columnDefs.map((c) => c.header);
      const escapeCell = (value: any) => {
        const s = String(value ?? '');
        const safe = s.replace(/"/g, '""').replace(/\r?\n/g, ' ');
        return `"${safe}"`;
      };
      const sep = ';';

      const csvLines = [
        headers.map((h) => escapeCell(h)).join(sep),
        ...base.map((item) =>
          columnDefs.map((col) => escapeCell(toCleanString(col.getter(item)))).join(sep)
        ),
      ];

      const csv = '\ufeff' + csvLines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const filename = `cadastro_encontrista_${yyyy}-${mm}-${dd}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Não foi possível exportar o CSV.');
    } finally {
      setIsExportingMembersCsv(false);
    }
  };

  const exportNonEnrolledCsv = () => {
    try {
      // Exporta TODAS as colunas da aba "Não inscritos" (A a O)
      // Obs: usamos aliases porque o backend pode devolver chaves em formatos diferentes.
      const columnDefs: Array<{ header: string; aliases: string[]; formatter?: (v: any) => string }> = [
        { header: 'Linha Origem', aliases: ['linhaOrigem', 'Linha Origem', 'linha_origem', 'A'] },
        { header: 'Nome', aliases: ['name', 'nome', 'Nome', 'B'] },
        { header: 'E-mail', aliases: ['email', 'E-mail', 'Email', 'C'] },
        { header: 'Status', aliases: ['status', 'Status', 'D'] },
        {
          header: 'Data Cadastro',
          aliases: ['dataCadastro', 'dataInscricao', 'Data Cadastro', 'Data Inscrição', 'E'],
          formatter: (v) => {
            const s = String(v ?? '').trim();
            if (!s) return '';
            // tenta exibir ISO como YYYY-MM-DD
            const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
            return iso ? iso[0] : s;
          },
        },
        { header: 'Telefone', aliases: ['telefone', 'Telefone', 'F'] },
        // Coluna extra (No exibida na tabela), mas existe no retorno do backend e ajuda no trabalho fora do painel.
        { header: 'Nascimento', aliases: ['nascimento', 'Nascimento'] },
        { header: 'Bairro', aliases: ['bairro', 'Bairro', 'BAIRRO', 'G'] },
        { header: 'Status Envio', aliases: ['statusEnvio', 'Status Envio', 'status_envio', 'H'] },
        { header: 'Interesse Confirmado', aliases: ['interesseConfirmado', 'Interesse Confirmado', 'interesse', 'I'] },
        { header: 'J fez o EAC', aliases: ['jaFezEac', 'J fez o EAC', 'Ja fez o EAC', 'J'] },
        { header: 'Contato Mudou', aliases: ['contatoMudou', 'Contato Mudou', 'K'] },
        { header: 'Recado', aliases: ['recado', 'Recado', 'L'] },
        {
          header: 'Data Resposta',
          aliases: ['dataResposta', 'Data Resposta', 'data_resposta', 'M'],
          formatter: (v) => {
            const s = String(v ?? '').trim();
            if (!s) return '';
            const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
            return iso ? iso[0] : s;
          },
        },
        { header: 'Amigo para', aliases: ['amigo', 'Amigo para', 'amigoPara', 'N'] },
        { header: 'Nome do amigo', aliases: ['nomeAmigo', 'Nome do amigo', 'nome_amigo', 'O'] },
      ];

      const headers = columnDefs.map(c => c.header);

      const rows = (Array.isArray(filteredNonEnrolled) ? filteredNonEnrolled : []).map((ne: any) => {
        const out: Record<string, string> = {};
        for (const col of columnDefs) {
          const raw = getNonEnrolledField(ne, col.aliases);
          const value = col.formatter ? col.formatter(raw) : toCleanString(raw);
          out[col.header] = value ?? '';
        }
        return out;
      });

      const sep = ';'; // melhor para Excel pt-BR

      const escapeCell = (value: any) => {
        const s = String(value ?? '');
        const safe = s.replace(/"/g, '""').replace(/\r?\n/g, ' ');
        return `"${safe}"`;
      };

      const csvLines = [
        headers.map(h => escapeCell(h)).join(sep),
        ...rows.map(r => headers.map(h => escapeCell((r as any)[h])).join(sep)),
      ];

      const csv = "\ufeff" + csvLines.join("\n");
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const filename = `nao_inscritos_${yyyy}-${mm}-${dd}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[Não inscritos] export csv erro:', e);
      alert('Não foi possível exportar o CSV.');
    }
  };


// ======================
  // VIEW: NÃO INSCRITOS
  // ======================
  if (showNonEnrolledView) {
    return (
      <div className="p-4 md:p-8 max-w-[100rem] mx-auto animate-in fade-in duration-500 pb-24">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => setShowNonEnrolledView(false)} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 shadow-sm transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeWidth="3" strokeLinecap="round"/></svg>
            </button>
            <h2 className="text-2xl font-black uppercase text-slate-900">Não inscritos ({nonEnrolledSearchTotal})</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefreshNonEnrolledRecords}
              disabled={isNonEnrolledRefreshing || isNonEnrolledSearching}
              className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              title="Atualiza manualmente os novos registros de Não Inscritos"
            >
              {isNonEnrolledRefreshing ? 'Atualizando dados...' : 'Atualizar registros'}
            </button>

            <button
              onClick={exportNonEnrolledCsv}
              className="px-6 py-3 bg-white text-blue-700 border border-blue-200 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-blue-50"
              title="Exporta para CSV (respeita os filtros aplicados)"
            >
              Exportar CSV
            </button>

            <button
              onClick={handleSearchNonEnrolled}
              disabled={isNonEnrolledSearching}
              className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm disabled:opacity-60"
            >
              {isNonEnrolledSearching ? 'Pesquisando...' : (nonEnrolledSearchDone ? 'Atualizar busca' : 'Pesquisar')}
            </button>
          </div>
        </header>

        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatIndicator
              label="Confirmaram interesse (I = Sim)"
              count={nonEnrolledIndicators.interesseCount}
              color="text-blue-600"
              isActive={selectedIndicatorFilter === 'interesse_sim'}
              onClick={() => setSelectedIndicatorFilter(prev => prev === 'interesse_sim' ? null : 'interesse_sim')}
            />
            <StatIndicator
              label="Não confirmaram interesse (I = Não)"
              count={nonEnrolledIndicators.interesseNoCount}
              color="text-rose-600"
              isActive={selectedIndicatorFilter === 'interesse_nao'}
              onClick={() => setSelectedIndicatorFilter(prev => prev === 'interesse_nao' ? null : 'interesse_nao')}
            />
            <StatIndicator
              label="Já fizeram EAC (J = Sim)"
              count={nonEnrolledIndicators.fezEacCount}
              color="text-indigo-600"
              isActive={selectedIndicatorFilter === 'fez_eac_sim'}
              onClick={() => setSelectedIndicatorFilter(prev => prev === 'fez_eac_sim' ? null : 'fez_eac_sim')}
            />
            <StatIndicator
              label="Contato mudou (K = Sim)"
              count={nonEnrolledIndicators.contatoMudouCount}
              color="text-emerald-600"
              isActive={selectedIndicatorFilter === 'contato_mudou_sim'}
              onClick={() => setSelectedIndicatorFilter(prev => prev === 'contato_mudou_sim' ? null : 'contato_mudou_sim')}
            />
            <StatIndicator
              label="Interesse pendente (I sem Sim/Não)"
              count={nonEnrolledIndicators.interessePendenteCount}
              color="text-amber-600"
              isActive={selectedIndicatorFilter === 'interesse_pendente'}
              onClick={() => setSelectedIndicatorFilter(prev => prev === 'interesse_pendente' ? null : 'interesse_pendente')}
            />
            <StatIndicator
              label="necessidade de envio de email de confirmação novas inscrições"
              count={nonEnrolledIndicators.statusEnvioBlank}
              color="text-cyan-600"
              isActive={selectedIndicatorFilter === 'status_envio_blank'}
              onClick={() => setSelectedIndicatorFilter(prev => prev === 'status_envio_blank' ? null : 'status_envio_blank')}
            />
            <StatIndicator
              label="INSCRIÇÕES NOVAS PRÉ CONFIRMADAS"
              count={nonEnrolledIndicators.preConfirmadasCount}
              color="text-fuchsia-600"
              isActive={selectedIndicatorFilter === 'pre_confirmadas'}
              onClick={() => setSelectedIndicatorFilter(prev => prev === 'pre_confirmadas' ? null : 'pre_confirmadas')}
            />
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Filtrar por Bairro</h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              <StatIndicator
                label="Todos"
                count={nonEnrolled.length}
                color="text-slate-900"
                isActive={selectedBairroFilter === null && selectedBairroInterestSimFilter === null}
                onClick={() => {
                  setSelectedBairroFilter(null);
                  setSelectedBairroInterestSimFilter(null);
                }}
              />
              {Array.isArray(bairroStats) && bairroStats.map((b, i) => (
                <StatIndicator
                  key={i}
                  label={toCleanString((b as any).nome)}
                  count={Number((b as any).quantidade) || 0}
                  color="text-blue-600"
                  isActive={selectedBairroFilter === toCleanString((b as any).nome)}
                  onClick={() => {
                    setSelectedBairroFilter(toCleanString((b as any).nome));
                    setSelectedBairroInterestSimFilter(null);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Filtrar por Bairro (Somente Interesse I = Sim)</h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              <StatIndicator
                label="Todos"
                count={bairroStatsInterestSim.reduce((acc, b) => acc + (Number(b.quantidade) || 0), 0)}
                color="text-slate-900"
                isActive={selectedBairroInterestSimFilter === null && selectedBairroFilter === null}
                onClick={() => {
                  setSelectedBairroFilter(null);
                  setSelectedBairroInterestSimFilter(null);
                }}
              />
              {Array.isArray(bairroStatsInterestSim) && bairroStatsInterestSim.map((b, i) => (
                <StatIndicator
                  key={i}
                  label={toCleanString(b.nome)}
                  count={Number(b.quantidade) || 0}
                  color="text-blue-600"
                  isActive={selectedBairroInterestSimFilter === toCleanString(b.nome)}
                  onClick={() => {
                    setSelectedBairroFilter(null);
                    setSelectedBairroInterestSimFilter(toCleanString(b.nome));
                  }}
                />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-6 md:p-8 border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtros</h3>
                <p className="text-sm font-bold text-slate-500">Use os filtros principais e, se necessário, abra os filtros complementares.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSearchNonEnrolled}
                  disabled={isNonEnrolledSearching}
                  className="px-4 py-2 rounded-xl border border-blue-200 bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60"
                >
                  {isNonEnrolledSearching ? 'Pesquisando...' : 'Pesquisar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFiltersPanel((v) => !v)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50"
                >
                  {showFiltersPanel ? 'Ocultar filtros' : 'Mostrar filtros'}
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilters({ ...DEFAULT_NON_ENROLLED_TABLE_FILTERS })}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 text-[11px] font-black uppercase tracking-widest hover:bg-slate-200"
                >
                  Limpar filtros
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <InputField
                label="Nome"
                value={tableFilters.nome}
                onChange={(v: string) => setTableFilters(prev => ({ ...prev, nome: v }))}
                placeholder="Digite para filtrar..."
              />

              <div className="space-y-1.5 flex-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bairro</label>
                <select
                  className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                  value={tableFilters.bairro}
                  onChange={(e) => setTableFilters(prev => ({ ...prev, bairro: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {(Array.isArray(bairroStats) ? bairroStats : []).map((b: any, i: number) => {
                    const nome = toCleanString((b as any).nome ?? (b as any).bairro);
                    return <option key={i} value={nome}>{nome}</option>;
                  })}
                </select>
              </div>
            </div>

            {showFiltersPanel && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Interesse (I)</label>
                  <select
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                    value={tableFilters.interesse}
                    onChange={(e) => setTableFilters(prev => ({ ...prev, interesse: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                    <option value="Em Branco">Em Branco</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Já fez EAC (J)</label>
                  <select
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                    value={tableFilters.jaFezEac}
                    onChange={(e) => setTableFilters(prev => ({ ...prev, jaFezEac: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contato mudou (K)</label>
                  <select
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                    value={tableFilters.contatoMudou}
                    onChange={(e) => setTableFilters(prev => ({ ...prev, contatoMudou: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status envio (H)</label>
                  <select
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                    value={tableFilters.statusEnvio}
                    onChange={(e) => setTableFilters(prev => ({ ...prev, statusEnvio: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="Preenchido">Preenchido</option>
                    <option value="Em Branco">Em Branco</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recebeu e-mail confirmação (P)</label>
                  <select
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                    value={tableFilters.recebeuConfirmacaoCadastro}
                    onChange={(e) => setTableFilters(prev => ({ ...prev, recebeuConfirmacaoCadastro: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="Recebeu">Recebeu</option>
                    <option value="Não recebeu">Não recebeu</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status último chamado</label>
                  <select
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                    value={tableFilters.statusUltimoChamado}
                    onChange={(e) => setTableFilters(prev => ({ ...prev, statusUltimoChamado: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="ENVIADO">Enviado</option>
                    <option value="RESPONDIDO">Respondido</option>
                    <option value="ERRO">Erro</option>
                    <option value="ENCERRADO">Encerrado</option>
                    <option value="EM BRANCO">Em branco</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-2xl">
            {!nonEnrolledSearchDone && !isNonEnrolledSearching ? (
              <div className="px-8 py-12 text-center space-y-2">
                <p className="text-slate-500 font-black uppercase tracking-widest text-[11px]">Nenhum resultado carregado</p>
                <p className="text-slate-400 font-bold text-sm">Utilize os filtros e clique em pesquisar.</p>
              </div>
            ) : isNonEnrolledSearching ? (
              <div className="px-8 py-12 text-center space-y-3">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
                <div className="text-slate-500 font-black uppercase tracking-widest text-[11px]">Pesquisando Não Inscritos...</div>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 border-b bg-slate-50/70">
                  <p className="font-black text-slate-800 text-sm">
                    Não inscritos encontrados | {new Intl.NumberFormat('pt-BR').format(nonEnrolledSearchTotal)}
                  </p>
                  <p className="text-slate-500 font-bold text-xs">
                    {hasNonEnrolledLocalFilters
                      ? `Exibindo ${new Intl.NumberFormat('pt-BR').format(limitedNonEnrolled.length)} registros (filtros ativos).`
                      : `Exibindo os ${Math.min(NON_ENROLLED_QUERY_LIMIT, sortedNonEnrolled.length)} primeiros registros.`}
                  </p>
                  {sortedNonEnrolled.length !== nonEnrolledSearchTotal && (
                    <p className="text-slate-500 font-bold text-xs">
                      Após filtros locais: {new Intl.NumberFormat('pt-BR').format(sortedNonEnrolled.length)} registros.
                    </p>
                  )}
                  <p className="text-slate-400 font-bold text-xs">Utilize os filtros para refinar sua busca.</p>
                </div>

                <div
                  className="p-5 grid gap-4"
                  style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
                >
                  {limitedNonEnrolled.map((ne: any, i: number) => {
                    const bairro = toCleanString(ne?.bairro || ne?.Bairro || ne?.BAIRRO || ne?.['Bairro']);
                    const interesse = formatYesNoOrBlank(getNonEnrolledField(ne, ['Interesse Confirmado','interesseConfirmado','interesse_confirmado','interesse','confirmouInteresse','Interesse','I']));
                    const dataCadastro = getNonEnrolledField(ne, ['dataCadastro', 'dataInscricao', 'Data Cadastro', 'Data Inscrição', 'E']);
                    const nascimento = getNonEnrolledField(ne, [
                      'nascimento',
                      'Nascimento',
                      'dataNascimento',
                      'Data de nascimento',
                      'Data Nascimento',
                      'data_nascimento',
                    ]);
                    const idadeCalculadaFromNascimento = calculateAgeFromBirthDate(nascimento);
                    const idadeFallbackRaw = getNonEnrolledField(ne, ['idade', 'Idade']);
                    const idadeFallback = (() => {
                      const digits = String(idadeFallbackRaw || '').replace(/\D/g, '');
                      if (!digits) return null;
                      const n = Number(digits);
                      return Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
                    })();
                    const idadeCalculada = idadeCalculadaFromNascimento !== null ? idadeCalculadaFromNascimento : idadeFallback;
                    const idadeText = idadeCalculada === null ? 'Sem idade' : `${idadeCalculada} anos`;
                    const statusData = getEmailStatusData(ne);
                    const status = toCleanString(statusData?.status || '');
                    const statusPriorizacao = toCleanString(getNonEnrolledField(ne, [
                      'statusPriorizacao',
                      'Status Priorizacao',
                      'status_priorizacao',
                      'Q',
                    ]));
                    const idPessoa = getNonEnrolledId(ne);
                    const isRecadoUpdating = updatingRecadoId === idPessoa;
                    const isPrioritizing = updatingPrioridadeId === idPessoa;
                    const isCadastroUpdating = isSavingNonEnrolledEdit && editingNonEnrolledId === idPessoa;
                    const nome = toCleanString(ne?.nome || ne?.Nome || ne?.['Nome']);
                    const whatsappHref = formatWhatsAppLink(toCleanString(ne?.telefone || ne?.Telefone || ne?.whatsapp || ne?.['Telefone']));
                    const handleOpenDetails = () => {
                      setNonEnrolledViewTab('pessoais');
                      setSelectedNonEnrolled(ne);
                      setShowNonEnrolledDrawer(true);
                      if (idPessoa) fetchEmailHistory(idPessoa);
                    };

                    return (
                      <NonEnrolledCard
                        key={i}
                        idade={idadeCalculada}
                        idadeText={idadeText}
                        statusUltimoChamado={status}
                        statusPriorizacao={statusPriorizacao}
                        nome={nome}
                        bairro={bairro}
                        dataCadastro={formatSheetDateCell(dataCadastro)}
                        interesse={interesse}
                        whatsappHref={whatsappHref}
                        isEditingRecado={isRecadoUpdating || isCadastroUpdating}
                        isPrioritizing={isPrioritizing}
                        onEditar={() => openNonEnrolledEditor(ne)}
                        onEnviarEmail={() => openEmailComposer(ne)}
                        onPriorizar={() => handlePrioritizeNonEnrolled(ne)}
                        onVerDetalhes={handleOpenDetails}
                        onExcluir={() => convertFromNonEnrolled(ne)}
                        onConverter={() => convertFromNonEnrolled(ne)}
                      />
                    );
                  })}

                  {sortedNonEnrolled.length === 0 && (
                    <div className="col-span-full px-8 py-10 text-center text-slate-400 font-bold">Nenhum registro encontrado.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      <Drawer
        isOpen={showNonEnrolledDrawer}
        onClose={() => setShowNonEnrolledDrawer(false)}
        title="Detalhes do Não Inscrito"
      >
        <div className="space-y-4">
          <div>
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome</div>
            <div className="font-black text-slate-900 text-lg">{toCleanString(selectedNonEnrolled?.nome || selectedNonEnrolled?.Nome || selectedNonEnrolled?.['Nome'])}</div>
            <div className="text-sm text-slate-500 font-bold">{toCleanString(selectedNonEnrolled?.bairro || selectedNonEnrolled?.Bairro || selectedNonEnrolled?.BAIRRO || selectedNonEnrolled?.['Bairro']) || 'No Informado'}</div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-50 border p-2">
            {[
              { id: 'pessoais', label: 'Pessoais' },
              { id: 'responsaveis', label: 'Responsáveis' },
              { id: 'eac', label: 'EAC' },
              { id: 'termos', label: 'Termos' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setNonEnrolledViewTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  nonEnrolledViewTab === tab.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {nonEnrolledViewTab === 'pessoais' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</div>
                  <div className="font-bold text-slate-700 break-all">{toCleanString(selectedNonEnrolled?.email || selectedNonEnrolled?.Email || selectedNonEnrolled?.['Email']) || '-'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Telefone</div>
                  <div className="font-bold text-slate-700">{toCleanString(selectedNonEnrolled?.telefone || selectedNonEnrolled?.Telefone || selectedNonEnrolled?.whatsapp || selectedNonEnrolled?.['Telefone']) || '-'}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data cadastro</div>
                  <div className="font-bold text-slate-700">{formatSheetDateCell(getNonEnrolledField(selectedNonEnrolled, ['dataCadastro', 'dataInscricao', 'Data Cadastro', 'Data Inscrição', 'E']), { includeTime: true })}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status último chamado</div>
                  <div className="font-bold text-slate-700">{toCleanString(getEmailStatusData(selectedNonEnrolled)?.status || '') || '-'}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data nascimento (R)</div>
                  <div className="font-bold text-slate-700">
                    {formatSheetDateCell(getNonEnrolledField(selectedNonEnrolled, ['dataNascimento', 'nascimento', 'Nascimento', 'Data de nascimento', 'Data Nascimento', 'R']))}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Idade calculada</div>
                  <div className="font-bold text-slate-700">
                    {(() => {
                      const rawNascimento = getNonEnrolledField(selectedNonEnrolled, ['dataNascimento', 'nascimento', 'Nascimento', 'Data de nascimento', 'Data Nascimento', 'R']);
                      const idade = calculateAgeFromBirthDate(rawNascimento);
                      return idade === null ? '-' : `${idade} anos`;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {nonEnrolledViewTab === 'responsaveis' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-50 border">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do responsável</div>
                <div className="font-bold text-slate-700">
                  {toCleanString(getNonEnrolledField(selectedNonEnrolled, ['responsavelNome', 'Responsável', 'responsavel', 'nomeResponsavel'])) || '-'}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp responsável</div>
                  <div className="font-bold text-slate-700">
                    {toCleanString(getNonEnrolledField(selectedNonEnrolled, ['responsavelTel', 'responsavelTelefone', 'telefoneResponsavel'])) || '-'}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail responsável</div>
                  <div className="font-bold text-slate-700 break-all">
                    {toCleanString(getNonEnrolledField(selectedNonEnrolled, ['responsavelEmail', 'emailResponsavel'])) || '-'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {nonEnrolledViewTab === 'eac' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-white border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interesse (I)</div>
                  <div className="font-black text-slate-900 text-base">
                    {formatYesNoOrBlank(getNonEnrolledField(selectedNonEnrolled, ['Interesse Confirmado','interesseConfirmado','interesse','I']))}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-white border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Já fez EAC (J)</div>
                  <div className="font-black text-slate-900 text-base">
                    {formatYesNoOrBlank(getNonEnrolledField(selectedNonEnrolled, ['J fez o EAC','Ja fez o EAC','jaFezEac','J']))}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-white border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contato mudou (K)</div>
                  <div className="font-black text-slate-900 text-base">
                    {formatYesNoOrBlank(getNonEnrolledField(selectedNonEnrolled, ['Contato Mudou','contatoMudou','K']))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data resposta (M)</div>
                  <div className="font-bold text-slate-700">{formatSheetDateCell(getNonEnrolledField(selectedNonEnrolled, ['dataResposta','Data Resposta','M']), { includeTime: true })}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amigo para (N/O)</div>
                  <div className="font-bold text-slate-700">
                    {toCleanString(getNonEnrolledField(selectedNonEnrolled, ['amigo','Amigo para','N'])) || '-'}
                    {toCleanString(getNonEnrolledField(selectedNonEnrolled, ['nomeAmigo','Nome do amigo','O'])) ? ` - ${toCleanString(getNonEnrolledField(selectedNonEnrolled, ['nomeAmigo','Nome do amigo','O']))}` : ''}
                  </div>
                </div>
              </div>
            </div>
          )}

          {nonEnrolledViewTab === 'termos' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-50 border">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recado (L)</div>
                <div className="font-bold text-slate-700 whitespace-pre-wrap">{toCleanString(getNonEnrolledField(selectedNonEnrolled, ['recado','Recado','L'])) || '-'}</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status pré confirmação (P)</div>
                <div className="font-bold text-slate-700">
                  {formatSheetDateCell(getNonEnrolledField(selectedNonEnrolled, ['statusPreConfirmacao', 'preConfirmacaoStatus', 'preConfirmacao', 'Status Pre Confirmacao', 'P']))}
                </div>
              </div>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-white border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Histórico de chamados</div>
                <p className="text-sm text-slate-500 font-medium">Linha do tempo de e-mails enviados para este contato.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReplyComposer(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700"
                  disabled={String(getEmailStatusData(selectedNonEnrolled)?.status || '').toUpperCase() !== 'RESPONDIDO'}
                >
                  Responder
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idPessoa = getNonEnrolledId(selectedNonEnrolled);
                    if (idPessoa) fetchEmailHistory(idPessoa);
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                >
                  {isLoadingHistory ? 'Atualizando...' : 'Atualizar'}
                </button>
              </div>
            </div>

              <div className="space-y-3">
                {((emailHistory[getNonEnrolledId(selectedNonEnrolled)] || []).filter(h => toCleanString((h as any)?.status) !== '')).map((call) => {
                  const isOpen = expandedCallId === call.idChamado;
                  return (
                    <div key={call.idChamado} className="py-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-black text-slate-900">{call.idChamado}</span>
                          {renderStatusBadge(call.status)}
                        </div>
                        <div className="text-[12px] text-slate-500 font-medium">
                          Enviado: {call.sentAt ? formatDateTime(call.sentAt) : '-'} · Última resposta: {call.lastReplyAt ? formatDateTime(call.lastReplyAt) : '-'}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {call.status === 'RESPONDIDO' && (
                          <button
                            type="button"
                            onClick={() => setReplyPreview({ from: toCleanString(call.lastReplyFrom), at: call.lastReplyAt, snippet: call.lastReplySnippet })}
                            className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-200 hover:bg-emerald-600 hover:text-white"
                          >
                            Ver resposta
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedCallId(isOpen ? null : call.idChamado)}
                          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                        >
                          {isOpen ? 'Esconder' : 'Detalhes'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-3 p-4 rounded-2xl bg-slate-50 border space-y-3">
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assunto</div>
                          <div className="font-bold text-slate-800 break-words">{toCleanString(call.subjectFinal) || '-'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mensagem enviada</div>
                          <p className="text-slate-700 font-medium whitespace-pre-wrap">{toCleanString(call.body) || '-'}</p>
                        </div>
                        <div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resposta (trecho)</div>
                          <p className="text-slate-700 font-medium whitespace-pre-wrap">{cleanReplySnippet(call.lastReplySnippet)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

                {((emailHistory[getNonEnrolledId(selectedNonEnrolled)] || []).filter(h => toCleanString((h as any)?.status) !== '')).length === 0 && (
                  <div className="text-sm text-slate-500 font-medium py-3">Nenhum chamado encontrado para este contato.</div>
                )}
              </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (selectedNonEnrolled) openNonEnrolledEditor(selectedNonEnrolled);
              }}
              className="flex-1 px-4 py-3 rounded-2xl bg-amber-50 text-amber-700 font-black uppercase text-[10px] tracking-widest text-center hover:bg-amber-600 hover:text-white transition-all"
            >
              Editar cadastro
            </button>
            <a
              href={formatWhatsAppLink(toCleanString(selectedNonEnrolled?.telefone || selectedNonEnrolled?.whatsapp || selectedNonEnrolled?.Telefone || selectedNonEnrolled?.['Telefone'])) || '#'}
              target="_blank"
              className="flex-1 px-4 py-3 rounded-2xl bg-green-50 text-green-700 font-black uppercase text-[10px] tracking-widest text-center hover:bg-green-600 hover:text-white transition-all"
            >
              WhatsApp
            </a>
            <button
              type="button"
              onClick={() => {
                if (selectedNonEnrolled) convertFromNonEnrolled(selectedNonEnrolled);
                setShowNonEnrolledDrawer(false);
              }}
              className="flex-1 px-4 py-3 rounded-2xl bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all"
            >
              Converter em Membro
            </button>
          </div>
        </div>
      </Drawer>

      {showNonEnrolledEditor && (
        <div className="fixed inset-0 z-[82] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Não Inscritos</p>
                <h3 className="text-xl font-black text-slate-900">Editar cadastro completo</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Esta edição atualiza as abas Não inscritos e Inscricoes_Sem_Duplicidade.
                </p>
              </div>
              <button
                type="button"
                onClick={closeNonEnrolledEditor}
                disabled={isSavingNonEnrolledEdit}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 disabled:opacity-60"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-auto">
              <div className="p-4 rounded-2xl bg-slate-50 border">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Linha Origem (A)</div>
                <div className="font-black text-slate-800">{editingNonEnrolledId || '-'}</div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Dados base</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <InputField
                    label="Nome completo"
                    value={nonEnrolledEditDraft.nome}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, nome: value }))}
                  />
                  <InputField
                    label="E-mail"
                    value={nonEnrolledEditDraft.email}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, email: value }))}
                  />
                  <InputField
                    label="Telefone"
                    value={nonEnrolledEditDraft.telefone}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, telefone: value }))}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <InputField
                    label="Bairro"
                    value={nonEnrolledEditDraft.bairro}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, bairro: value }))}
                  />
                  <InputField
                    label="Data cadastro (E)"
                    value={nonEnrolledEditDraft.dataCadastro}
                    placeholder="DD/MM/AAAA ou DD/MM/AAAA HH:mm"
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, dataCadastro: value }))}
                  />
                  <InputField
                    label="Data nascimento (R)"
                    value={nonEnrolledEditDraft.dataNascimento}
                    placeholder="DD/MM/AAAA"
                    helperText="Salvo no padrão DD/MM/AAAA"
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, dataNascimento: value }))}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sexo (S)</label>
                    <select
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                      value={nonEnrolledEditDraft.sexo}
                      onChange={(e) => setNonEnrolledEditDraft(prev => ({ ...prev, sexo: e.target.value }))}
                    >
                      <option value="">Em branco</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                  <InputField
                    label="Status (D)"
                    value={nonEnrolledEditDraft.status}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, status: value }))}
                  />
                  <InputField
                    label="Status envio (H)"
                    value={nonEnrolledEditDraft.statusEnvio}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, statusEnvio: value }))}
                  />
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status priorização (Q)</label>
                    <select
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                      value={nonEnrolledEditDraft.statusPriorizacao}
                      onChange={(e) => setNonEnrolledEditDraft(prev => ({ ...prev, statusPriorizacao: e.target.value }))}
                    >
                      <option value="">Em branco</option>
                      <option value="SIM">SIM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Respostas e acompanhamento</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Interesse (I)</label>
                    <select
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                      value={nonEnrolledEditDraft.interesseConfirmado}
                      onChange={(e) => setNonEnrolledEditDraft(prev => ({ ...prev, interesseConfirmado: e.target.value }))}
                    >
                      <option value="">Em branco</option>
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Já fez EAC (J)</label>
                    <select
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                      value={nonEnrolledEditDraft.jaFezEac}
                      onChange={(e) => setNonEnrolledEditDraft(prev => ({ ...prev, jaFezEac: e.target.value }))}
                    >
                      <option value="">Em branco</option>
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contato mudou (K)</label>
                    <select
                      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all text-sm shadow-sm"
                      value={nonEnrolledEditDraft.contatoMudou}
                      onChange={(e) => setNonEnrolledEditDraft(prev => ({ ...prev, contatoMudou: e.target.value }))}
                    >
                      <option value="">Em branco</option>
                      <option value="Sim">Sim</option>
                      <option value="Não">Não</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InputField
                    label="Data resposta (M)"
                    value={nonEnrolledEditDraft.dataResposta}
                    placeholder="DD/MM/AAAA HH:mm"
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, dataResposta: value }))}
                  />
                  <InputField
                    label="Status pré confirmação (P)"
                    value={nonEnrolledEditDraft.statusPreConfirmacao}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, statusPreConfirmacao: value }))}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InputField
                    label="Amigo para fazer junto? (N)"
                    value={nonEnrolledEditDraft.amigo}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, amigo: value }))}
                  />
                  <InputField
                    label="Nome do amigo (O)"
                    value={nonEnrolledEditDraft.nomeAmigo}
                    onChange={(value: string) => setNonEnrolledEditDraft(prev => ({ ...prev, nomeAmigo: value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recado (L)</label>
                  <textarea
                    value={nonEnrolledEditDraft.recado}
                    onChange={(e) => setNonEnrolledEditDraft(prev => ({ ...prev, recado: e.target.value }))}
                    rows={4}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 bg-white font-bold text-slate-800 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                    placeholder="Digite o recado..."
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3">
              <button
                type="button"
                onClick={closeNonEnrolledEditor}
                disabled={isSavingNonEnrolledEdit}
                className="px-6 py-3 rounded-2xl bg-white text-slate-500 font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNonEnrolledEdit}
                disabled={isSavingNonEnrolledEdit || !editingNonEnrolledId}
                className="px-8 py-3 rounded-2xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {isSavingNonEnrolledEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmailComposer && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Enviar E-mail</p>
                <h3 className="text-xl font-black text-slate-900">Contato com Não Inscrito</h3>
              </div>
              <button onClick={() => setShowEmailComposer(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Para</label>
                  <input value={emailDraft.to} readOnly className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assunto</label>
                  <input
                    value={emailDraft.subject}
                    onChange={(e) => setEmailDraft(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 bg-white font-bold text-slate-800 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="Assunto do e-mail"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mensagem</label>
                <textarea
                  value={emailDraft.body}
                  onChange={(e) => setEmailDraft(prev => ({ ...prev, body: e.target.value }))}
                  rows={8}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 bg-white font-bold text-slate-800 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                  placeholder="Digite o corpo do e-mail..."
                />
                <p className="text-[11px] text-slate-500 font-medium">
                  A assinatura padro do disparo de Confirmao de Interesse ser adicionada automaticamente.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowEmailComposer(false)}
                className="px-6 py-3 rounded-2xl bg-white text-slate-500 font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={isSendingEmail || !emailDraft.to}
                className="px-8 py-3 rounded-2xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {isSendingEmail ? 'Enviando...' : 'Enviar e-mail'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReplyComposer && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Responder chamado</p>
                <h3 className="text-xl font-black text-slate-900">Envie sua mensagem</h3>
              </div>
              <button onClick={() => setShowReplyComposer(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-6 space-y-3">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={8}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 bg-white font-bold text-slate-800 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                placeholder="Digite sua resposta aqui..."
              />
              <p className="text-[11px] text-slate-500 font-medium">
                A resposta será enviada no mesmo thread do chamado. Use "Encerrar chamado" para enviar a mensagem e finalizar o fluxo.
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowReplyComposer(false)}
                className="px-6 py-3 rounded-2xl bg-white text-slate-500 font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSendReply(true)}
                disabled={isSendingReply}
                className="px-8 py-3 rounded-2xl bg-rose-50 text-rose-700 font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-rose-600 hover:text-white disabled:opacity-60 border border-rose-100"
              >
                {isSendingReply && replyAction === 'close' ? 'Encerrando...' : 'Encerrar chamado'}
              </button>
              <button
                type="button"
                onClick={() => handleSendReply(false)}
                disabled={isSendingReply}
                className="px-8 py-3 rounded-2xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {isSendingReply && replyAction === 'send' ? 'Enviando...' : 'Enviar resposta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {replyPreview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Resposta do candidato</p>
                <h3 className="text-xl font-black text-slate-900">Última resposta recebida</h3>
              </div>
              <button onClick={() => setReplyPreview(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">De</div>
                  <div className="font-bold text-slate-800 break-words">{replyPreview.from || '-'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data/Hora</div>
                  <div className="font-bold text-slate-800">{formatDateTime(replyPreview.at)}</div>
                </div>
              </div>

                <div className="p-4 rounded-2xl bg-white border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Trecho da resposta</div>
                <p className="text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{cleanReplySnippet(replyPreview.snippet)}</p>
                </div>
              </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end">
              <button
                type="button"
                onClick={() => setReplyPreview(null)}
                className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-blue-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  }

  // ======================
  // VIEW: LISTA (verso antiga)
  // ======================
  if (!showEditor) {
    return (
      <div className="p-4 md:p-8 max-w-[100rem] mx-auto animate-in fade-in duration-500 pb-24 space-y-6">
        <header className="flex flex-col xl:flex-row justify-between gap-6 xl:items-end">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none">Cadastro de Encontrista</h2>
            <p className="text-slate-500 font-medium italic mt-3 text-sm">Gestão dos adolescentes cadastrados oficiais.</p>
          </div>

          <div className="flex flex-wrap gap-3 w-full xl:w-auto xl:justify-end">
            <button onClick={handleNewRegistry} className="px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm whitespace-nowrap">
              Novo
            </button>

            <button
              onClick={exportMembersCsv}
              disabled={isExportingMembersCsv}
              className="px-6 py-4 bg-white text-slate-700 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
              title="Exporta todos os campos da base de encontristas"
            >
              {isExportingMembersCsv ? 'Exportando...' : 'Exportar CSV'}
            </button>

            <button onClick={fetchData} disabled={isLoading} className="px-6 py-4 bg-white text-slate-500 border-2 rounded-2xl font-black text-[10px] uppercase shadow-sm disabled:opacity-60 whitespace-nowrap">
              {isLoading ? 'Carregando...' : 'Recarregar'}
            </button>
          </div>
        </header>

        <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-4 md:p-6">
          <div className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Indicadores por status</p>
            <h3 className="text-lg md:text-xl font-black text-slate-900">Status operacional do cadastro</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatIndicator label="Inscrito" count={membersStatusIndicators.inscrito} color="text-slate-700" isActive={false} onClick={() => {}} />
            <StatIndicator label="Priorizado" count={membersStatusIndicators.priorizado} color="text-amber-600" isActive={false} onClick={() => {}} />
            <StatIndicator label="Confirmado" count={membersStatusIndicators.confirmado} color="text-emerald-600" isActive={false} onClick={() => {}} />
            <StatIndicator label="Não selecionado" count={membersStatusIndicators.naoSelecionado} color="text-rose-600" isActive={false} onClick={() => {}} />
            <StatIndicator label="Desistente" count={membersStatusIndicators.desistente} color="text-orange-600" isActive={false} onClick={() => {}} />
            <StatIndicator label="Cancelado" count={membersStatusIndicators.cancelado} color="text-fuchsia-600" isActive={false} onClick={() => {}} />
          </div>
        </section>

        <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Busca de cadastro</p>
              <h3 className="text-lg md:text-xl font-black text-slate-900">Filtros principais</h3>
            </div>
            <div className="bg-slate-100 px-3 py-2 rounded-xl text-right min-w-[170px]">
              {memberSearchUiState === 'sem_busca' ? (
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Sem busca</p>
              ) : memberSearchUiState === 'carregando' ? (
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Carregando...</p>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-[11px] font-black text-slate-700">{`${memberSearchTotal || 0} cadastros encontrados`}</p>
                  <p className="text-[11px] font-bold text-slate-500">{`Mostrando ${filteredMembers.length}`}</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-3">
            <div className="xl:col-span-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Busca geral</label>
              <input
                type="text"
                value={memberFiltersDraft.query}
                onChange={(e) => handleMemberFilterChange('query', e.target.value)}
                placeholder="Nome, e-mail, telefone ou bairro"
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
              />
            </div>

            <div className="xl:col-span-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Bairro</label>
              <select
                value={memberFiltersDraft.bairro}
                onChange={(e) => handleMemberFilterChange('bairro', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
              >
                <option value="">Todos os bairros</option>
                {memberBairroOptions.map((bairro) => (
                  <option key={bairro} value={bairro}>{bairro}</option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Telefone</label>
              <input
                type="text"
                value={memberFiltersDraft.telefone}
                onChange={(e) => handleMemberFilterChange('telefone', e.target.value)}
                placeholder="(00) 00000-0000"
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
              />
            </div>

            <div className="xl:col-span-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Ações</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={handleMemberSearch}
                  disabled={isMemberSearching}
                  className="w-full min-h-[44px] px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-60"
                >
                  {isMemberSearching ? 'Pesquisando...' : 'Pesquisar'}
                </button>
                <button
                  type="button"
                  onClick={handleMemberSearchClear}
                  className="w-full min-h-[44px] px-4 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvancedMemberFilters(v => !v)}
                  className={`w-full min-h-[44px] px-4 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border-2 transition-colors ${
                    showAdvancedMemberFilters
                      ? 'bg-slate-900 text-white border-slate-900'
                      : hasAdvancedFiltersActive
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Filtros avançados
                </button>
              </div>
            </div>
          </div>

          <div className={`transition-all duration-300 ${showAdvancedMemberFilters ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
            <div className="pt-1">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">E-mail</label>
                  <input
                    type="text"
                    value={memberFiltersDraft.email}
                    onChange={(e) => handleMemberFilterChange('email', e.target.value)}
                    placeholder="usuario@email.com"
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Sexo</label>
                  <select
                    value={memberFiltersDraft.sexo}
                    onChange={(e) => handleMemberFilterChange('sexo', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="">Todos</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Pertence à Porciúncula</label>
                  <select
                    value={memberFiltersDraft.pertencePorciuncula}
                    onChange={(e) => handleMemberFilterChange('pertencePorciuncula', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="">Todos</option>
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                    <option value="Nao">Nao</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Faixa etária</label>
                  <select
                    value={memberFiltersDraft.faixaEtaria}
                    onChange={(e) => handleMemberFilterChange('faixaEtaria', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="">Todas</option>
                    <option value="0_11">0 - 11 anos</option>
                    <option value="12_16">12 - 16 anos</option>
                    <option value="17_plus">17+ anos</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-2xl p-4 md:p-6">
          {memberSearchUiState === 'resultados' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-5">
              {(filteredMembers || []).slice(0, 200).map((m: any, i: number) => (
                <MemberCard
                  key={i}
                  member={m}
                  onView={handleViewMember}
                  onEdit={handleSelectMember}
                  onDelete={handleDeleteMember}
                  isDeleting={deletingMemberEmail === toCleanString((m as any)?.email).toLowerCase()}
                  toCleanString={toCleanString}
                  getWhatsAppLink={formatWhatsAppLink}
                />
              ))}
            </div>
          ) : memberSearchUiState === 'carregando' ? (
            <div className="px-8 py-12 text-center space-y-3">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
              <div className="text-slate-500 font-black uppercase tracking-widest text-[11px]">Carregando resultados...</div>
            </div>
          ) : memberSearchUiState === 'sem_busca' ? (
            <div className="px-8 py-12 text-center space-y-2">
              <p className="text-slate-500 font-black uppercase tracking-widest text-[11px]">Sem busca</p>
              <p className="text-slate-400 font-bold text-sm">Preencha os filtros e clique em Pesquisar para listar participantes.</p>
            </div>
          ) : (
            <div className="px-8 py-12 text-center space-y-2">
              <p className="text-slate-500 font-black uppercase tracking-widest text-[11px]">Nenhum resultado</p>
              <p className="text-slate-400 font-bold text-sm">Nenhum participante encontrado para os filtros informados.</p>
            </div>
          )}
        </div>

        <Drawer
          isOpen={showMemberDrawer}
          onClose={() => setShowMemberDrawer(false)}
          title="Visualizar Cadastro"
        >
          <div className="space-y-4">
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome</div>
              <div className="font-black text-slate-900 text-lg">{toCleanString((selectedMemberCard as any)?.nome) || '-'}</div>
              <div className="text-sm text-slate-500 font-bold">{toCleanString((selectedMemberCard as any)?.bairro) || 'Não informado'}</div>
            </div>

            <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-50 border p-2">
              {[
                { id: 'pessoais', label: 'Pessoais' },
                { id: 'responsaveis', label: 'Responsáveis' },
                { id: 'eac', label: 'EAC' },
                { id: 'termos', label: 'Termos' },
                { id: 'auditoria', label: 'Auditoria' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMemberViewTab(tab.id as any)}
                  className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                    memberViewTab === tab.id
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {memberViewTab === 'pessoais' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nascimento</div>
                    <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.nascimento) || '-'}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Idade</div>
                    <div className="font-bold text-slate-700">{selectedMemberAgeInfo.age === null ? '-' : `${selectedMemberAgeInfo.age} anos`}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</div>
                    <div className="font-bold text-slate-700 break-all">{toCleanString((selectedMemberCard as any)?.email) || '-'}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Telefone</div>
                    <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.telefone) || '-'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</div>
                    <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.whatsapp || (selectedMemberCard as any)?.telefone) || '-'}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sexo</div>
                    <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.sexo) || '-'}</div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Endereço</div>
                  <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.endereco) || '-'}</div>
                </div>
              </div>
            )}

            {memberViewTab === 'responsaveis' && (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do responsável</div>
                  <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.responsavelNome) || '-'}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp responsável</div>
                    <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.responsavelTel) || '-'}</div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail responsável</div>
                    <div className="font-bold text-slate-700 break-all">{toCleanString((selectedMemberCard as any)?.responsavelEmail) || '-'}</div>
                  </div>
                </div>
              </div>
            )}

            {memberViewTab === 'eac' && (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tempo de paróquia</div>
                  <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.tempoParoquia) || '-'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Participa de grupo</div>
                  <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.participaGrupo) || '-'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Motivação</div>
                  <div className="font-bold text-slate-700 whitespace-pre-wrap">{toCleanString((selectedMemberCard as any)?.motivacao) || '-'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expectativas</div>
                  <div className="font-bold text-slate-700 whitespace-pre-wrap">{toCleanString((selectedMemberCard as any)?.expectativas) || '-'}</div>
                </div>
              </div>
            )}

            {memberViewTab === 'termos' && (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Autoriza uso de imagem</div>
                  <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.autorizaImagem) || '-'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Concorda com normas</div>
                  <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.concordaNormas) || '-'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pertence à Porciúncula</div>
                  <div className="font-bold text-slate-700">{toCleanString((selectedMemberCard as any)?.pertencePorciuncula) || '-'}</div>
                </div>
              </div>
            )}

            {memberViewTab === 'auditoria' && (
              <div className="space-y-3">
                <DataOriginAudit record={selectedMemberCard} />
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={formatWhatsAppLink(toCleanString((selectedMemberCard as any)?.whatsapp || (selectedMemberCard as any)?.telefone)) || '#'}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-3 rounded-2xl bg-green-50 text-green-700 font-black uppercase text-[10px] tracking-widest text-center hover:bg-green-600 hover:text-white transition-all"
              >
                WhatsApp
              </a>
              <button
                type="button"
                onClick={() => {
                  if (!selectedMemberCard) return;
                  setShowMemberDrawer(false);
                  handleSelectMember(selectedMemberCard);
                }}
                className="px-4 py-3 rounded-2xl bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => selectedMemberCard && handleDeleteMember(selectedMemberCard)}
                disabled={deletingMemberEmail === toCleanString((selectedMemberCard as any)?.email).toLowerCase()}
                className="px-4 py-3 rounded-2xl bg-rose-50 text-rose-700 font-black uppercase text-[10px] tracking-widest hover:bg-rose-600 hover:text-white transition-all disabled:opacity-60"
              >
                {deletingMemberEmail === toCleanString((selectedMemberCard as any)?.email).toLowerCase() ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Drawer>
      </div>
    );
  }

  // ======================
  // VIEW: EDITOR (formulrio)
  // ======================
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-24">
      <header className="flex flex-col md:flex-row justify-between gap-6 items-end">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none">
            {isConverting ? 'Converso de Candidato' : isEditing ? 'Editar Registro' : 'Novo Cadastro'}
          </h2>
          <p className="text-slate-500 font-medium italic mt-3 text-sm">Base de manuteno EAC Porcincula.</p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={handleCloseEditor} className="px-6 py-4 bg-white text-slate-400 border-2 rounded-2xl font-black text-[10px] uppercase">
            Voltar
          </button>
          <button onClick={fetchData} disabled={isLoading} className="px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm disabled:opacity-60">
            {isLoading ? 'Carregando...' : 'Recarregar'}
          </button>
        </div>
      </header>

      {isConverting && (
        <div className="bg-blue-600 text-white p-6 md:p-8 rounded-[2.5rem] shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center font-black text-3xl shadow-inner">!</div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] mb-1 text-blue-200">Fluxo de Converso Ativo</p>
              <p className="text-white text-lg font-black leading-tight">Revise os dados e faa o contato antes de salvar.</p>
            </div>
          </div>
          <a href={formatWhatsAppLink(toCleanString((formData as any).whatsapp)) || '#'} target="_blank" className="w-full md:w-auto px-10 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:scale-105 shadow-2xl flex items-center justify-center gap-3">
            FALAR NO WHATSAPP
          </a>
        </div>
      )}

      <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden min-h-[600px] flex flex-col">
        <div className="flex bg-slate-50 border-b p-4 gap-2">
          {['pessoais', 'responsaveis', 'eac', 'termos'].map(id => (
            <button key={id} onClick={() => setActiveTab(id as any)} className={`px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-200'}`}>
              {id}
            </button>
          ))}
        </div>

        <div className="p-8 md:p-12 flex-grow overflow-y-auto">
          {activeTab === 'pessoais' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <InputField label="Nome Completo" value={(formData as any).nome} onChange={(v: string) => updateField('nome', v)} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputField label="Nascimento" placeholder="DD/MM/AAAA" value={(formData as any).nascimento} onChange={(v: string) => updateField('nascimento', v)} />
                <InputField label="E-mail" value={(formData as any).email} onChange={(v: string) => updateField('email', v)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputField
                  label="WhatsApp"
                  value={(formData as any).whatsapp || ''}
                  onChange={(v: string) => updateField('whatsapp', v)}
                  rightElement={(formData as any).whatsapp && (
                    <a href={formatWhatsAppLink(toCleanString((formData as any).whatsapp)) || '#'} target="_blank" className="p-2.5 bg-green-500 text-white rounded-lg shadow-md">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.481 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.305 1.656z"/></svg>
                    </a>
                  )}
                />
                <InputField label="Bairro" value={(formData as any).bairro} onChange={(v: string) => updateField('bairro', v)} />
              </div>
              <InputField label="Endereo Completo" value={(formData as any).endereco} onChange={(v: string) => updateField('endereco', v)} />
              <RadioField label="Sexo" currentValue={(formData as any).sexo} onChange={(v: string) => updateField('sexo', v)} options={['Masculino', 'Feminino']} />
            </div>
          )}

          {activeTab === 'responsaveis' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <InputField label="Nome do Responsvel" value={(formData as any).responsavelNome} onChange={(v: string) => updateField('responsavelNome', v)} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputField
                  label="WhatsApp Responsvel"
                  value={(formData as any).responsavelTel || ''}
                  onChange={(v: string) => updateField('responsavelTel', v)}
                  rightElement={(formData as any).responsavelTel && (
                    <a href={formatWhatsAppLink(toCleanString((formData as any).responsavelTel)) || '#'} target="_blank" className="p-2.5 bg-green-500 text-white rounded-lg shadow-md">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.481 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.305 1.656z"/></svg>
                    </a>
                  )}
                />
                <InputField label="E-mail Responsvel" value={(formData as any).responsavelEmail} onChange={(v: string) => updateField('responsavelEmail', v)} />
              </div>
            </div>
          )}

          {activeTab === 'eac' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <InputField label="Tempo de Parquia" value={(formData as any).tempoParoquia} onChange={(v: string) => updateField('tempoParoquia', v)} />
              <InputField label="Participa de Grupo" value={(formData as any).participaGrupo} onChange={(v: string) => updateField('participaGrupo', v)} />
              <InputField label="Motivao" value={(formData as any).motivacao} onChange={(v: string) => updateField('motivacao', v)} />
              <InputField label="Expectativas" value={(formData as any).expectativas} onChange={(v: string) => updateField('expectativas', v)} />
            </div>
          )}

          {activeTab === 'termos' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <RadioField label="Autoriza uso de imagem" currentValue={(formData as any).autorizaImagem} onChange={(v: string) => updateField('autorizaImagem', v)} options={['Sim', 'No']} />
              <RadioField label="Concorda com normas" currentValue={(formData as any).concordaNormas} onChange={(v: string) => updateField('concordaNormas', v)} options={['Sim', 'No']} />
              <RadioField label="Pertence à Porciúncula" currentValue={(formData as any).pertencePorciuncula} onChange={(v: string) => updateField('pertencePorciuncula', v)} options={['Sim', 'Não']} />
            </div>
          )}
        </div>

        <div className="p-8 bg-slate-50 border-t flex justify-center sticky bottom-0 z-10">
          <button onClick={handleSave} disabled={isLoading} className="w-full md:w-auto px-20 py-5 blue-gradient text-white rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-2xl transition-all disabled:opacity-60">
            {isLoading ? 'Sincronizando...' : 'Confirmar e Gravar Dados'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MembersPage;


