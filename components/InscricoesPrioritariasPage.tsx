import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Drawer from './Drawer.tsx';
import PersonCard from './PersonCard.tsx';
import { showAppAlert, showAppConfirm } from '../utils/appDialog.ts';
import { sanitizeTextDeep, toCleanString } from '../utils/textEncoding.ts';

type Prioritario = {
  id?: string;
  linhaOrigem?: string;
  nome?: string;
  email?: string;
  status?: string;
  statusEnvio?: string;
  interesseConfirmado?: string;
  jaFezEac?: string;
  contatoMudou?: string;
  recado?: string;
  dataResposta?: any;
  amigo?: string;
  nomeAmigo?: string;
  telefone?: string;
  bairro?: string;
  dataCadastro?: any;
  dataNascimento?: any;
  idade?: string | number;
  sexo?: string;
  statusValidacao?: string;
};

interface InscricoesPrioritariasPageProps {
  googleWebAppUrl: string;
  onOpenCirculos: () => void;
}

const formatDate = (value: any) => {
  if (!value) return '-';
  const raw = toCleanString(value);

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, d, m, y] = br;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d}/${m}/${y}`;
  }

  const dt = new Date(raw);
  if (!isNaN(dt.getTime())) {
    return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  return raw;
};

const normalize = (value: any) => toCleanString(value).toLowerCase();
const parseAgeNumber = (value: any) => {
  const raw = String(value || '').replace(',', '.').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!isFinite(n) || n < 0) return null;
  return Math.floor(n);
};

const matchesAgeFilter = (idadeRaw: any, filtroIdade: string) => {
  const filter = String(filtroIdade || '').trim();
  if (!filter) return true;

  const age = parseAgeNumber(idadeRaw);
  if (age === null) return false;

  if (/^\d+\+$/.test(filter)) {
    return age >= Number(filter.replace('+', ''));
  }
  if (/^\d+\s*-\s*\d+$/.test(filter)) {
    const parts = filter.split('-').map((p) => Number(p.trim()));
    return age >= parts[0] && age <= parts[1];
  }
  if (/^\d+$/.test(filter)) {
    return age === Number(filter);
  }

  return String(age).includes(filter);
};

async function readJsonResponseSafe(response: Response, source: string) {
  const raw = await response.text();
  if (!raw) throw new Error(`Resposta vazia da API (${source}) (HTTP ${response.status}).`);
  try {
    return sanitizeTextDeep(JSON.parse(raw));
  } catch (e: any) {
    const sample = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(`Resposta inválida da API (${source}): ${e?.message || 'JSON malformado.'}${sample ? ` | amostra: ${sample}` : ''}`);
  }
}

const uniqueOptions = (values: any[]) => {
  const map = new Map<string, string>();
  values.forEach((v) => {
    const label = toCleanString(v);
    if (!label) return;
    const key = normalize(label);
    if (!map.has(key)) map.set(key, label);
  });
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

const getAgeBadgeClass = (age: number | null) => {
  if (age === null || Number.isNaN(age)) return 'bg-slate-100 border-slate-200 text-slate-700';
  if (age <= 11) return 'bg-amber-100 border-amber-300 text-amber-800';
  if (age <= 16) return 'bg-blue-100 border-blue-300 text-blue-800';
  return 'bg-purple-100 border-purple-300 text-purple-800';
};

const getAgeLabel = (idade: any) => {
  const age = parseAgeNumber(idade);
  return age === null ? 'Sem idade' : `${age} anos`;
};

const getStatusUi = (statusRaw: any) => {
  const status = normalize(statusRaw);
  if (!status) return { label: 'Sem status', dot: 'bg-slate-400', text: 'text-slate-600' };
  if (status === 'ativo') return { label: 'Ativo', dot: 'bg-emerald-500', text: 'text-emerald-700' };
  if (status === 'inativo') return { label: 'Inativo', dot: 'bg-rose-500', text: 'text-rose-700' };
  return { label: String(statusRaw || '').trim(), dot: 'bg-amber-500', text: 'text-amber-700' };
};

const PRIORITARIO_EXPORT_BASE_COLUMNS = [
  'id',
  'linhaOrigem',
  'nome',
  'email',
  'status',
  'statusEnvio',
  'interesseConfirmado',
  'jaFezEac',
  'contatoMudou',
  'recado',
  'dataResposta',
  'amigo',
  'nomeAmigo',
  'telefone',
  'bairro',
  'dataCadastro',
  'dataNascimento',
  'idade',
  'sexo',
  'statusValidacao',
];

const PRIORITARIO_EXPORT_LABELS: Record<string, string> = {
  id: 'ID',
  linhaOrigem: 'Linha origem',
  nome: 'Nome',
  email: 'E-mail',
  status: 'Status',
  statusEnvio: 'Status envio',
  interesseConfirmado: 'Interesse confirmado',
  jaFezEac: 'Ja fez EAC',
  contatoMudou: 'Contato mudou',
  recado: 'Recado',
  dataResposta: 'Data resposta',
  amigo: 'Amigo para fazer junto',
  nomeAmigo: 'Nome do amigo',
  telefone: 'Telefone',
  bairro: 'Bairro',
  dataCadastro: 'Data cadastro',
  dataNascimento: 'Data nascimento',
  idade: 'Idade',
  sexo: 'Sexo',
  statusValidacao: 'Status validacao',
};

const getPrioritarioColumnLabel = (key: string) => {
  if (PRIORITARIO_EXPORT_LABELS[key]) return PRIORITARIO_EXPORT_LABELS[key];
  const withSpaces = String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!withSpaces) return key;
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
};

const getPrioritarioExportColumns = (records: Prioritario[]) => {
  const keys = new Set<string>();
  (Array.isArray(records) ? records : []).forEach((record) => {
    Object.keys(record || {}).forEach((k) => {
      if (k) keys.add(k);
    });
  });

  const preferred = PRIORITARIO_EXPORT_BASE_COLUMNS.filter((col) => keys.has(col));
  const extra = Array.from(keys)
    .filter((col) => !PRIORITARIO_EXPORT_BASE_COLUMNS.includes(col))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return [...preferred, ...extra];
};

const formatPrioritarioExportValue = (columnKey: string, value: any) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  const raw = toCleanString(value);
  if (!raw) return '';

  if (/^data/i.test(columnKey)) {
    const formatted = formatDate(raw);
    return formatted === '-' ? '' : formatted;
  }

  return raw;
};

const escapeCsvCell = (value: any) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
const escapeHtml = (value: any) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const InscricoesPrioritariasPage: React.FC<InscricoesPrioritariasPageProps> = ({ googleWebAppUrl, onOpenCirculos }) => {
  const [items, setItems] = useState<Prioritario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [selectedItem, setSelectedItem] = useState<Prioritario | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [updatingDeprioritizeId, setUpdatingDeprioritizeId] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState({
    nome: '',
    bairro: '',
    sexo: '',
    idade: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    nome: '',
    bairro: '',
    sexo: '',
    idade: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = googleWebAppUrl ? `?googleWebAppUrl=${encodeURIComponent(googleWebAppUrl)}` : '';
      let response = await fetch(`/api/inscricoes-prioritarias${qs}`, { method: 'GET' });
      let json: any;
      let usedFallback = false;

      try {
        json = await readJsonResponseSafe(response, '/api/inscricoes-prioritarias');
      } catch (_primaryErr) {
        usedFallback = true;
        response = await fetch('/api/comunicados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'GET_INSCRICOES_PRIORITARIAS',
            data: {},
            ...(googleWebAppUrl ? { googleWebAppUrl } : {})
          })
        });
        json = await readJsonResponseSafe(response, '/api/comunicados (fallback)');
      }

      if (!response.ok || !(json?.success ?? json?.ok)) {
        throw new Error(json?.error || 'Falha ao listar inscrições prioritárias.');
      }

      const list = Array.isArray(json?.inscricoesPrioritarias)
        ? json.inscricoesPrioritarias
        : (Array.isArray(json?.items) ? json.items : []);

      setItems(list);
      if (usedFallback) {
        setInfo('Endpoint alternativo acionado para carregar inscrições prioritárias.');
        setTimeout(() => setInfo(''), 3200);
      }
    } catch (err: any) {
      setItems([]);
      setError(err?.message || 'Erro ao carregar inscrições prioritárias.');
    } finally {
      setLoading(false);
    }
  }, [googleWebAppUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showInfo = useCallback((message: string) => {
    setInfo(message);
    setTimeout(() => setInfo(''), 2800);
  }, []);

  const handleView = useCallback((item: Prioritario) => {
    setSelectedItem(item);
    setShowDrawer(true);
  }, []);

  const handleDistribuir = useCallback(async () => {
    const confirmed = await showAppConfirm({
      title: 'Distribuir Círculos',
      message: 'Confirma a execução da distribuição de círculos para todos os registros prioritários aptos?',
      tone: 'warning',
      confirmLabel: 'Executar',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setIsDistributing(true);
    setError('');
    try {
      let response = await fetch('/api/inscricoes-prioritarias/distribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleWebAppUrl })
      });

      let json: any;
      let usedFallback = false;
      try {
        json = await readJsonResponseSafe(response, '/api/inscricoes-prioritarias/distribuir');
      } catch (_primaryErr) {
        usedFallback = true;
        response = await fetch('/api/comunicados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'EXECUTE_DISTRIBUICAO_CIRCULOS',
            data: {},
            ...(googleWebAppUrl ? { googleWebAppUrl } : {})
          })
        });
        json = await readJsonResponseSafe(response, '/api/comunicados (fallback)');
      }

      if (!response.ok || !(json?.success ?? json?.ok)) {
        throw new Error(json?.error || 'Não foi possível executar a distribuição de círculos.');
      }

      const successMessage = usedFallback
        ? 'Distribuição feita com sucesso (endpoint alternativo).'
        : 'Distribuição feita com sucesso.';
      showInfo(successMessage);
      await showAppAlert({
        title: 'Distribuição finalizada',
        message: successMessage,
        tone: 'success',
        confirmLabel: 'Fechar',
      });
    } catch (err: any) {
      setError(err?.message || 'Erro ao distribuir círculos.');
    } finally {
      setIsDistributing(false);
    }
  }, [googleWebAppUrl, showInfo]);

  const bairroOptions = useMemo(() => uniqueOptions(items.map((it) => it.bairro)), [items]);
  const sexoOptions = useMemo(() => uniqueOptions(items.map((it) => it.sexo)), [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (appliedFilters.nome && !normalize(it.nome).includes(normalize(appliedFilters.nome))) return false;
      if (appliedFilters.bairro && normalize(it.bairro) !== normalize(appliedFilters.bairro)) return false;
      if (appliedFilters.sexo && normalize(it.sexo) !== normalize(appliedFilters.sexo)) return false;
      if (!matchesAgeFilter(it.idade, appliedFilters.idade)) return false;
      return true;
    });
  }, [items, appliedFilters]);

  const applyFilters = useCallback(() => {
    setAppliedFilters({ ...draftFilters });
  }, [draftFilters]);

  const clearFilters = useCallback(() => {
    const empty = { nome: '', bairro: '', sexo: '', idade: '' };
    setDraftFilters(empty);
    setAppliedFilters(empty);
  }, []);

  const handleDeprioritize = useCallback(async (item: Prioritario) => {
    const linhaOrigem = String(item?.linhaOrigem || '').trim();
    if (!linhaOrigem) {
      setError('Nao foi possivel despriorizar: linha de origem nao encontrada para este registro.');
      return;
    }

    const nomeRef = toCleanString(item?.nome || item?.email || linhaOrigem);
    const confirmed = await showAppConfirm({
      title: 'Despriorizar registro',
      message: `Confirma despriorizar "${nomeRef}"?`,
      tone: 'warning',
      confirmLabel: 'Despriorizar',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setError('');
    setUpdatingDeprioritizeId(linhaOrigem);
    try {
      const response = await fetch('/api/nao-inscritos/priorizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhaOrigem, priorizar: false }),
      });
      const json = await readJsonResponseSafe(response, '/api/nao-inscritos/priorizar');
      if (!response.ok || !(json?.success ?? json?.ok)) {
        throw new Error(json?.error || 'Nao foi possivel despriorizar o registro.');
      }

      if (selectedItem && String(selectedItem?.linhaOrigem || '').trim() === linhaOrigem) {
        setSelectedItem(null);
        setShowDrawer(false);
      }

      showInfo(json?.message || 'Registro despriorizado com sucesso.');
      await fetchData();
    } catch (err: any) {
      setError(err?.message || 'Erro ao despriorizar registro.');
    } finally {
      setUpdatingDeprioritizeId(null);
    }
  }, [fetchData, selectedItem, showInfo]);

  const handleExportCsv = useCallback(() => {
    if (filtered.length === 0) {
      void showAppAlert({
        title: 'Exportar CSV',
        message: 'Nenhum registro disponível para exportação.',
        tone: 'warning',
        confirmLabel: 'Fechar',
      });
      return;
    }

    try {
      const columns = getPrioritarioExportColumns(filtered);
      const headers = columns.map((col) => getPrioritarioColumnLabel(col));
      const rows = filtered.map((item) =>
        columns.map((col) => formatPrioritarioExportValue(col, (item as any)?.[col]))
      );

      const sep = ';';
      const csvLines = [
        headers.map(escapeCsvCell).join(sep),
        ...rows.map((row) => row.map(escapeCsvCell).join(sep)),
      ];
      const csv = '\ufeff' + csvLines.join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const fileName = `inscricoes_prioritarias_${yyyy}-${mm}-${dd}.csv`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showInfo('CSV exportado com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel exportar o CSV.');
    }
  }, [filtered, showInfo]);

  const handleExportPdfReport = useCallback(() => {
    if (filtered.length === 0) {
      void showAppAlert({
        title: 'Relatório PDF',
        message: 'Nenhum registro disponível para gerar relatório.',
        tone: 'warning',
        confirmLabel: 'Fechar',
      });
      return;
    }

    const columns = getPrioritarioExportColumns(filtered);
    const generatedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const headerHtml = [
      '<th>#</th>',
      ...columns.map((col) => `<th>${escapeHtml(getPrioritarioColumnLabel(col))}</th>`),
    ].join('');

    const bodyHtml = filtered
      .map((item, index) => {
        const rowCells = columns
          .map((col) => {
            const value = formatPrioritarioExportValue(col, (item as any)?.[col]) || '-';
            return `<td>${escapeHtml(value)}</td>`;
          })
          .join('');
        return `<tr><td>${index + 1}</td>${rowCells}</tr>`;
      })
      .join('');

    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      void showAppAlert({
        title: 'Relatório PDF',
        message: 'Nao foi possivel abrir a janela de impressao. Verifique se o navegador bloqueou pop-up.',
        tone: 'error',
        confirmLabel: 'Fechar',
      });
      return;
    }

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatorio Inscricoes Prioritarias</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #0f172a; }
    .wrap { padding: 8px; }
    h1 { margin: 0 0 4px 0; font-size: 18px; }
    .meta { margin: 0 0 12px 0; font-size: 11px; color: #475569; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
    thead th { background: #f1f5f9; font-weight: 700; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; word-break: break-word; }
    th:first-child, td:first-child { width: 40px; text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Relatorio de Inscricoes Prioritarias</h1>
    <p class="meta">Gerado em ${escapeHtml(generatedAt)} | Registros: ${filtered.length}</p>
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    showInfo('Relatório aberto para impressão em PDF.');
  }, [filtered, showInfo]);

  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 py-6">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Inscrições Prioritárias</h2>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 font-black mt-1">
              Total: {filtered.length} de {items.length}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={fetchData}
              disabled={loading || isDistributing}
              className="px-4 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => { void handleDistribuir(); }}
              disabled={loading || isDistributing || items.length === 0}
              className="px-4 py-3 rounded-2xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-60"
            >
              {isDistributing ? 'Distribuindo...' : 'Distribuir Círculos'}
            </button>
            <button
              type="button"
              onClick={handleExportPdfReport}
              disabled={loading || isDistributing || filtered.length === 0}
              className="px-4 py-3 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 disabled:opacity-60"
              title="Gera relatório por linha com todos os campos disponíveis"
            >
              Relatorio PDF
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || isDistributing || filtered.length === 0}
              className="px-4 py-3 rounded-2xl bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-60"
              title="Exporta em CSV com todos os campos disponíveis"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={onOpenCirculos}
              disabled={loading || isDistributing}
              className="px-4 py-3 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60"
            >
              Ver Distribuição de Círculos
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <input
            value={draftFilters.nome}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, nome: e.target.value }))}
            placeholder="Filtrar por nome"
            className="px-4 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
          />

          <select
            value={draftFilters.bairro}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, bairro: e.target.value }))}
            className="px-4 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">Todos os bairros</option>
            {bairroOptions.map((bairro) => (
              <option key={bairro} value={bairro}>{bairro}</option>
            ))}
          </select>

          <select
            value={draftFilters.sexo}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, sexo: e.target.value }))}
            className="px-4 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="">Todos os sexos</option>
            {sexoOptions.map((sexo) => (
              <option key={sexo} value={sexo}>{sexo}</option>
            ))}
          </select>

          <input
            value={draftFilters.idade}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, idade: e.target.value }))}
            placeholder="Idade: 14, 12-16, 17+"
            className="px-4 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>
        <div className="mt-3 flex justify-end gap-2">
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

        {error && (
          <div className="mt-4 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-bold">
            {error}
          </div>
        )}

        {info && (
          <div className="mt-4 p-4 rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-bold">
            {info}
          </div>
        )}

        {loading ? (
          <div className="mt-6 p-10 text-center text-slate-500 text-sm font-bold">Carregando inscrições prioritárias...</div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 p-10 text-center text-slate-500 text-sm font-bold">Nenhum registro prioritário encontrado.</div>
        ) : (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((item, idx) => {
              const cardId = String(item.linhaOrigem || item.id || `pri-row-${idx}`);
              const linhaOrigem = String(item.linhaOrigem || '').trim();
              const isDeprioritizing = Boolean(updatingDeprioritizeId && updatingDeprioritizeId === linhaOrigem);
              const ageNum = parseAgeNumber(item.idade);
              const statusUi = getStatusUi(item.status);
              return (
                <PersonCard
                  key={cardId}
                  ageLabel={getAgeLabel(item.idade)}
                  ageClassName={getAgeBadgeClass(ageNum)}
                  statusLabel={statusUi.label}
                  statusTextClassName={statusUi.text}
                  statusDotClassName={statusUi.dot}
                  nome={item.nome || '-'}
                  bairro={item.bairro || 'Bairro não informado'}
                  cadastroText={`Cadastro: ${formatDate(item.dataCadastro)}`}
                  badges={[
                    {
                      label: `Interesse: ${item.interesseConfirmado || '-'}`,
                      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    },
                    ...(item.sexo ? [{
                      label: `Sexo: ${item.sexo}`,
                      className: 'bg-violet-50 text-violet-700 border border-violet-200'
                    }] : [])
                  ]}
                  actions={[
                    {
                      key: 'deprioritize',
                      title: linhaOrigem
                        ? 'Despriorizar registro'
                        : 'Despriorizar (linha de origem não encontrada)',
                      variant: 'delete',
                      onClick: () => { void handleDeprioritize(item); },
                      disabled: loading || isDistributing || isDeprioritizing || !linhaOrigem,
                      icon: isDeprioritizing ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 3a9 9 0 1 0 9 9" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      )
                    },
                    {
                      key: 'view',
                      title: 'Ver cadastro',
                      variant: 'view',
                      onClick: () => handleView(item),
                      icon: (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )
                    }
                  ]}
                />
              );
            })}
          </div>
        )}
      </div>

      <Drawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        title={`Cadastro Prioritário${selectedItem?.nome ? ` - ${selectedItem.nome}` : ''}`}
      >
        {!selectedItem ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Nome completo</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.nome || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">E-mail</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.email || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Status</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.status || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Data cadastro</p>
                <p className="text-sm font-black text-slate-800 mt-1">{formatDate(selectedItem.dataCadastro)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Telefone</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.telefone || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Bairro</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.bairro || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Status envio</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.statusEnvio || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Interesse confirmado</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.interesseConfirmado || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Já fez EAC</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.jaFezEac || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Contato mudou</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.contatoMudou || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Data resposta</p>
                <p className="text-sm font-black text-slate-800 mt-1">{formatDate(selectedItem.dataResposta)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Amigo para fazer junto?</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.amigo || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Nome do amigo</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.nomeAmigo || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Data de nascimento</p>
                <p className="text-sm font-black text-slate-800 mt-1">{formatDate(selectedItem.dataNascimento)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Idade</p>
                <p className="text-sm font-black text-slate-800 mt-1">{getAgeLabel(selectedItem.idade)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Sexo</p>
                <p className="text-sm font-black text-slate-800 mt-1">{selectedItem.sexo || '-'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 md:col-span-2">
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Recado</p>
                <p className="text-sm font-black text-slate-800 mt-1 whitespace-pre-wrap">{selectedItem.recado || '-'}</p>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </section>
  );
};

export default InscricoesPrioritariasPage;
