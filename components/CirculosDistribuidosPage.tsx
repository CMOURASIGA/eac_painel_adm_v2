import React, { useCallback, useEffect, useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import { sanitizeTextDeep, toCleanString } from '../utils/textEncoding.ts';

type PessoaCirculo = {
  nome?: string;
  idade?: string | number;
  bairro?: string;
  sexo?: string;
  grupoSugerido?: string;
};

interface CirculosDistribuidosPageProps {
  googleWebAppUrl: string;
  onBack: () => void;
}

const CIRCLE_NAMES = [
  'Circulo 1',
  'Circulo 2',
  'Circulo 3',
  'Circulo 4',
  'Circulo 5',
  'Circulo 6',
  'Circulo Excedente',
];

const DISTRIBUTION_RULES = [
  'Faixa principal: 13 a 16 anos.',
  'Idade 12 entra na faixa principal somente quando faltar ate 6 meses para completar 13 anos.',
  'Matriz de combinacao de idade: 13 com 14; 14 com 15 e 16; 15 com 16 e 17; e assim sucessivamente.',
  'C1 a C6: ate 6 meninos e ate 6 meninas por circulo (maximo 12).',
  'Quando faltar gente na faixa principal, o sistema completa vagas com idades fora da faixa.',
];

function getCircleTheme(name: string) {
  const map: Record<string, { card: string; title: string; badge: string; colorLabel: string }> = {
    'Circulo 1': {
      card: 'bg-sky-50/80 border-sky-100',
      title: 'text-sky-900',
      badge: 'bg-sky-100 text-sky-700 border-sky-200',
      colorLabel: 'Azul'
    },
    'Circulo 2': {
      card: 'bg-purple-50/80 border-purple-100',
      title: 'text-purple-900',
      badge: 'bg-purple-100 text-purple-700 border-purple-200',
      colorLabel: 'Roxo'
    },
    'Circulo 3': {
      card: 'bg-red-50/80 border-red-100',
      title: 'text-red-900',
      badge: 'bg-red-100 text-red-700 border-red-200',
      colorLabel: 'Vermelho'
    },
    'Circulo 4': {
      card: 'bg-emerald-50/80 border-emerald-100',
      title: 'text-emerald-900',
      badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      colorLabel: 'Verde'
    },
    'Circulo 5': {
      card: 'bg-orange-50/80 border-orange-100',
      title: 'text-orange-900',
      badge: 'bg-orange-100 text-orange-700 border-orange-200',
      colorLabel: 'Laranja'
    },
    'Circulo 6': {
      card: 'bg-yellow-50/80 border-yellow-100',
      title: 'text-yellow-900',
      badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      colorLabel: 'Amarelo'
    },
    'Circulo Excedente': {
      card: 'bg-slate-100/80 border-slate-200',
      title: 'text-slate-900',
      badge: 'bg-slate-200 text-slate-700 border-slate-300',
      colorLabel: 'Cinza'
    },
  };
  return map[name] || {
    card: 'bg-white border-slate-200',
    title: 'text-slate-900',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    colorLabel: 'Cor'
  };
}

function createEmptyGroups() {
  return CIRCLE_NAMES.reduce((acc, name) => {
    acc[name] = [];
    return acc;
  }, {} as Record<string, PessoaCirculo[]>);
}

function normalizeHeaderLite(value: any) {
  return toCleanString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeGroupName(rawName: any) {
  const raw = String(rawName || '').trim();
  if (!raw) return 'Circulo Excedente';
  const norm = normalizeHeaderLite(raw);
  const m = norm.match(/circulo\s*(\d+)/);
  if (m && m[1]) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 6) return `Circulo ${n}`;
  }
  if (norm.includes('exced')) return 'Circulo Excedente';
  return 'Circulo Excedente';
}

function normalizeCirculosPayload(input: any) {
  const grouped = createEmptyGroups();
  if (!input || typeof input !== 'object') return grouped;

  Object.keys(input).forEach((groupName) => {
    const target = normalizeGroupName(groupName);
    const rows = Array.isArray(input[groupName]) ? input[groupName] : [];
    rows.forEach((row: any) => {
      grouped[target].push({
        nome: toCleanString(row?.nome),
        idade: toCleanString(row?.idade ?? ''),
        bairro: toCleanString(row?.bairro),
        sexo: toCleanString(row?.sexo),
        grupoSugerido: target,
      });
    });
  });

  return grouped;
}

function getSexoKey(value: any) {
  const norm = normalizeHeaderLite(value);
  if (norm === 'masculino' || norm === 'masc' || norm === 'm') return 'masculino';
  if (norm === 'feminino' || norm === 'fem' || norm === 'f') return 'feminino';
  return 'outro';
}

function formatAdolescentesCount(total: number) {
  return `${total} ${total === 1 ? 'adolescente' : 'adolescentes'}`;
}

function sortByNome(list: PessoaCirculo[]) {
  return (Array.isArray(list) ? list.slice() : []).sort((a, b) =>
    String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' })
  );
}

function formatIdadeBairro(idade: any, bairro: any) {
  const ageRaw = toCleanString(idade);
  const bairroRaw = toCleanString(bairro) || '-';
  const ageLabel = ageRaw ? `${ageRaw} anos` : '-';
  return `${ageLabel} • ${bairroRaw}`;
}

const CirculosDistribuidosPage: React.FC<CirculosDistribuidosPageProps> = ({ googleWebAppUrl, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUpdatingDistribution, setIsUpdatingDistribution] = useState(false);
  const [error, setError] = useState('');
  const [circulos, setCirculos] = useState<Record<string, PessoaCirculo[]>>(createEmptyGroups());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = googleWebAppUrl ? `?googleWebAppUrl=${encodeURIComponent(googleWebAppUrl)}` : '';
      const response = await fetch(`/api/circulos-distribuidos${qs}`, { method: 'GET' });
      const raw = await response.text();
      if (!raw) throw new Error(`Resposta vazia (HTTP ${response.status}).`);

      let json: any;
      try {
        json = sanitizeTextDeep(JSON.parse(raw));
      } catch (e: any) {
        throw new Error(`Resposta inválida da API: ${e?.message || 'JSON malformado.'}`);
      }

      if (!response.ok || !(json?.success ?? json?.ok)) {
        throw new Error(json?.error || 'Falha ao carregar distribuição de círculos.');
      }

      setCirculos(normalizeCirculosPayload(json?.circulos));
    } catch (err: any) {
      setCirculos(createEmptyGroups());
      setError(err?.message || 'Erro ao carregar distribuição de círculos.');
    } finally {
      setLoading(false);
    }
  }, [googleWebAppUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const total = useMemo(() => {
    return CIRCLE_NAMES.reduce((acc, name) => acc + (circulos[name]?.length || 0), 0);
  }, [circulos]);

  async function gerarImagemCirculos() {
    setIsGeneratingImage(true);
    try {
      const elemento = document.querySelector('#quadro-circulos') as HTMLElement | null;
      if (!elemento) throw new Error('Quadro de círculos não encontrado para gerar imagem.');

      const canvas = await html2canvas(elemento, {
        backgroundColor: '#f8fafc',
        scale: 2,
        useCORS: true,
      });

      const link = document.createElement('a');
      link.download = 'distribuicao-circulos-eac.png';
      link.href = canvas.toDataURL();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setError(err?.message || 'Erro ao gerar imagem da distribuição.');
    } finally {
      setIsGeneratingImage(false);
    }
  }

  const atualizarDistribuicao = useCallback(async () => {
    setIsUpdatingDistribution(true);
    setError('');
    try {
      const response = await fetch('/api/inscricoes-prioritarias/distribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleWebAppUrl })
      });

      const raw = await response.text();
      if (!raw) throw new Error(`Resposta vazia da API (HTTP ${response.status}).`);

      let json: any;
      try {
        json = sanitizeTextDeep(JSON.parse(raw));
      } catch (e: any) {
        throw new Error(`Resposta inválida da API: ${e?.message || 'JSON malformado.'}`);
      }

      if (!response.ok || !(json?.success ?? json?.ok)) {
        throw new Error(json?.error || 'Não foi possível atualizar a distribuição.');
      }

      await fetchData();
    } catch (err: any) {
      setError(err?.message || 'Erro ao atualizar distribuição.');
    } finally {
      setIsUpdatingDistribution(false);
    }
  }, [fetchData, googleWebAppUrl]);

  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 py-6">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-3 rounded-2xl bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={fetchData}
              disabled={loading || isUpdatingDistribution}
              className="px-4 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-60"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => { void atualizarDistribuicao(); }}
              disabled={loading || isUpdatingDistribution || isGeneratingImage}
              className="px-4 py-3 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60"
            >
              {isUpdatingDistribution ? 'Atualizando distribuição...' : 'Atualizar distribuição'}
            </button>
            <button
              type="button"
              onClick={() => { void gerarImagemCirculos(); }}
              disabled={loading || isGeneratingImage || isUpdatingDistribution}
              className="px-4 py-3 rounded-2xl bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-60"
            >
              {isGeneratingImage ? 'Gerando imagem...' : 'Gerar imagem da distribuição'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-bold">
            {error}
          </div>
        )}

        <div className="mt-6 bg-white rounded-3xl border border-slate-100 p-4 md:p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              Distribuição dos Círculos - EAC
            </h2>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black mt-1">
              Total distribuído: {total}
            </p>
          </div>
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Regras da distribuição</p>
            <ul className="mt-2 space-y-1.5">
              {DISTRIBUTION_RULES.map((rule) => (
                <li key={rule} className="text-xs font-bold text-amber-900 leading-relaxed">
                  • {rule}
                </li>
              ))}
            </ul>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-500 text-sm font-bold">Carregando distribuição...</div>
          ) : (
            <div id="quadro-circulos" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
              {CIRCLE_NAMES.map((groupName) => {
                const list = circulos[groupName] || [];
                const theme = getCircleTheme(groupName);
                const meninos = sortByNome(list.filter((item) => getSexoKey(item.sexo) === 'masculino'));
                const meninas = sortByNome(list.filter((item) => getSexoKey(item.sexo) === 'feminino'));
                const outros = sortByNome(list.filter((item) => getSexoKey(item.sexo) === 'outro'));
                const totalCirculo = list.length;
                return (
                  <article
                    key={groupName}
                    className={`rounded-2xl p-4 shadow-sm border min-h-[260px] flex flex-col ${theme.card}`}
                  >
                    <div className="mb-3 pb-2 border-b border-black/5">
                      <h3 className={`text-sm md:text-base font-black ${theme.title}`}>{groupName}</h3>
                      <p className={`text-[11px] md:text-xs font-black uppercase tracking-widest mt-1 ${theme.title}`}>
                        {theme.colorLabel}
                      </p>
                      {totalCirculo > 0 && (
                        <>
                          <p className={`text-[11px] font-black uppercase tracking-widest mt-2 ${theme.title}`}>
                            {formatAdolescentesCount(totalCirculo)}
                          </p>
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-600 mt-1">
                            {meninos.length} meninos • {meninas.length} meninas
                          </p>
                        </>
                      )}
                    </div>

                    {totalCirculo === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-500">
                        Sem adolescentes neste círculo.
                      </div>
                    ) : (
                      <div className="space-y-3 overflow-auto pr-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 mb-2">
                              Meninos
                            </p>
                            {meninos.length === 0 ? (
                              <p className="text-xs font-bold text-slate-400">— Nenhum</p>
                            ) : (
                              <ul className="space-y-2">
                                {meninos.map((item, idx) => (
                                  <li key={`${groupName}-m-${idx}`} className="text-xs">
                                    <p className="font-black text-slate-900 leading-tight">🔵 {item.nome || '-'}</p>
                                    <p className="font-bold text-slate-600 mt-0.5">
                                      {formatIdadeBairro(item.idade, item.bairro)}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 mb-2">
                              Meninas
                            </p>
                            {meninas.length === 0 ? (
                              <p className="text-xs font-bold text-slate-400">— Nenhum</p>
                            ) : (
                              <ul className="space-y-2">
                                {meninas.map((item, idx) => (
                                  <li key={`${groupName}-f-${idx}`} className="text-xs">
                                    <p className="font-black text-slate-900 leading-tight">🟣 {item.nome || '-'}</p>
                                    <p className="font-bold text-slate-600 mt-0.5">
                                      {formatIdadeBairro(item.idade, item.bairro)}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        {outros.length > 0 && (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 mb-2">
                              Não informado ({outros.length})
                            </p>
                            <ul className="space-y-1.5">
                              {outros.map((item, idx) => (
                                <li key={`${groupName}-o-${idx}`} className="text-xs font-bold text-slate-700">
                                  {item.nome || '-'} • {formatIdadeBairro(item.idade, item.bairro)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CirculosDistribuidosPage;
