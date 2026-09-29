import type { VisitacaoCadastro, VisitacaoPriorizado, VisitacaoRespostaOpcao } from '../types.ts';

const clean = (value: any) => String(value ?? '').trim();

export const VISITACAO_SIM_NAO_OPCOES: Array<{ value: VisitacaoRespostaOpcao; label: string }> = [
  { value: 'NAO_INFORMADO', label: 'Não informado' },
  { value: 'SIM', label: 'Sim' },
  { value: 'NAO', label: 'Não' },
];

export const TAMANHOS_CAMISA_VISITACAO = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'];

export function createVisitacaoCadastroFromItem(item?: VisitacaoPriorizado | null): VisitacaoCadastro {
  const cadastro = item?.cadastro || {};
  return {
    nome_completo: cadastro.nome_completo ?? item?.nome ?? '',
    nome_social: cadastro.nome_social ?? '',
    data_nascimento: cadastro.data_nascimento ?? item?.data_nascimento ?? '',
    idade: cadastro.idade ?? item?.idade ?? null,
    sexo: cadastro.sexo ?? item?.sexo ?? '',
    telefone: cadastro.telefone ?? item?.telefone ?? '',
    email: cadastro.email ?? item?.email ?? '',
    endereco: cadastro.endereco ?? '',
    bairro: cadastro.bairro ?? item?.bairro ?? '',
    cidade: cadastro.cidade ?? '',
    estado: cadastro.estado ?? 'RJ',
    responsavel_nome: cadastro.responsavel_nome ?? item?.responsavel_nome ?? '',
    responsavel_telefone: cadastro.responsavel_telefone ?? item?.responsavel_telefone ?? '',
    responsavel_email: cadastro.responsavel_email ?? item?.responsavel_email ?? '',
    tamanho_camisa: cadastro.tamanho_camisa ?? '',
    escola_id: cadastro.escola_id ?? '',
    escola_nome: cadastro.escola_nome ?? '',
    escola_nome_outro: cadastro.escola_nome_outro ?? '',
    turno_escolar: cadastro.turno_escolar ?? '',
    serie_escolar: cadastro.serie_escolar ?? '',
    grau_escolar: cadastro.grau_escolar ?? '',
    encontro_anterior: cadastro.encontro_anterior ?? '',
    convidado_por: cadastro.convidado_por ?? '',
    pais_fizeram_ecc: cadastro.pais_fizeram_ecc ?? 'NAO_INFORMADO',
    primeira_comunhao: cadastro.primeira_comunhao ?? 'NAO_INFORMADO',
    paroquia: cadastro.paroquia ?? '',
    toca_instrumento: cadastro.toca_instrumento ?? 'NAO_INFORMADO',
    instrumento: cadastro.instrumento ?? '',
    gosta_cantar: cadastro.gosta_cantar ?? 'NAO_INFORMADO',
    motivacao: cadastro.motivacao ?? '',
    outra_doutrina_familia: cadastro.outra_doutrina_familia ?? 'NAO_INFORMADO',
    outra_doutrina_descricao: cadastro.outra_doutrina_descricao ?? '',
    restricao_alimentar: cadastro.restricao_alimentar ?? 'NAO_INFORMADO',
    restricao_alimentar_descricao: cadastro.restricao_alimentar_descricao ?? '',
  };
}

const COMPLETUDE_FIELDS: Array<keyof VisitacaoCadastro> = [
  'nome_completo',
  'data_nascimento',
  'telefone',
  'bairro',
  'responsavel_nome',
  'responsavel_telefone',
  'tamanho_camisa',
  'escola_nome',
  'primeira_comunhao',
  'paroquia',
  'restricao_alimentar',
];

export function summarizeVisitacaoCadastro(cadastro?: VisitacaoCadastro | null) {
  const current = cadastro || {};
  let preenchidos = 0;
  for (const key of COMPLETUDE_FIELDS) {
    const value = current[key];
    if (value === 'SIM' || value === 'NAO') {
      preenchidos += 1;
      continue;
    }
    if (clean(value)) preenchidos += 1;
  }
  const total = COMPLETUDE_FIELDS.length;
  const pendentes = Math.max(0, total - preenchidos);
  const percentual = total ? Math.round((preenchidos / total) * 100) : 0;
  return { preenchidos, pendentes, total, percentual };
}

export function diffVisitacaoCadastro(
  original?: VisitacaoCadastro | null,
  next?: VisitacaoCadastro | null,
) {
  const before = original || {};
  const after = next || {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])) as Array<keyof VisitacaoCadastro>;
  return keys
    .map((key) => {
      const anterior = clean(before[key]);
      const novo = clean(after[key]);
      if (anterior === novo) return null;
      if (!novo && anterior) return null;
      return { campo: String(key), anterior: anterior || null, novo: novo || null };
    })
    .filter(Boolean);
}
