import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname);

dotenv.config({ path: path.join(repoRoot, '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase config missing');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'public' }
});

// Função para obter um encontro aberto
async function getOpenEncontro() {
  const { data, error } = await supabase
    .from('encontros')
    .select('id, data_inicio, status')
    .in('status', ['ATIVO', 'PLANEJADO'])
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

// Função para testar o endpoint (simulando)
async function testCreateInscricao(id_encontro) {
  const payload = {
    id_encontro,
    nome_adolescente: 'Teste Adolescente',
    data_nascimento: '2010-05-01',
    telefone_adolescente: '11999999999',
    nome_responsavel: 'Teste Responsavel',
    telefone_responsavel: '11888888888',
    aceite_termos: true,
    bairro: 'Teste Bairro',
    paroquia: 'Teste Paroquia',
    participou_antes: false,
    observacoes: 'Teste observacao'
  };

  // Simular a lógica do endpoint
  const inscricoesTable = 'inscricoes';
  const encontrosTable = 'encontros';

  // Verificar encontro
  const { data: encontro, error: encontroError } = await supabase
    .from(encontrosTable)
    .select('id,data_inicio,status')
    .eq('id', id_encontro)
    .maybeSingle();

  if (encontroError) throw encontroError;
  if (!encontro) throw new Error('Encontro não encontrado');

  const encontroStatus = encontro.status.toUpperCase();
  if (!['ATIVO', 'PLANEJADO'].includes(encontroStatus)) {
    throw new Error('Encontro indisponível');
  }

  // Verificar duplicidade
  const telDigits = payload.telefone_adolescente.replace(/\D/g, '');
  const { data: existing } = await supabase
    .from(inscricoesTable)
    .select('id,id_encontro,nome_adolescente,data_nascimento,telefone_adolescente,status_inscricao,created_at')
    .eq('id_encontro', id_encontro)
    .or(
      [
        `telefone_adolescente.eq.${payload.telefone_adolescente}`,
        `telefone_adolescente.ilike.%${telDigits}%`,
        `and(nome_adolescente.ilike.%${payload.nome_adolescente}%,data_nascimento.eq.${payload.data_nascimento})`,
      ].filter(Boolean).join(',')
    )
    .limit(1);

  const firstExisting = existing && existing.length > 0 ? existing[0] : null;
  if (firstExisting) {
    return { success: true, duplicate: true, data: firstExisting, status: 200 };
  }

  // Calcular idade
  const dataInicio = new Date(encontro.data_inicio);
  const dataNasc = new Date(payload.data_nascimento);
  let idade = dataInicio.getFullYear() - dataNasc.getFullYear();
  const m = dataInicio.getMonth() - dataNasc.getMonth();
  if (m < 0 || (m === 0 && dataInicio.getDate() < dataNasc.getDate())) idade -= 1;

  // Inserir
  const insertPayload = {
    id_encontro,
    nome_adolescente: payload.nome_adolescente,
    data_nascimento: payload.data_nascimento,
    idade,
    telefone_adolescente: payload.telefone_adolescente,
    nome_responsavel: payload.nome_responsavel,
    telefone_responsavel: payload.telefone_responsavel,
    bairro: payload.bairro,
    paroquia: payload.paroquia,
    participou_antes: payload.participou_antes,
    observacoes: payload.observacoes,
    aceite_termos: true,
    status_inscricao: 'INSCRITO',
    origem_dado: 'SISTEMA',
    criado_via_sistema: true,
    data_inscricao: new Date().toISOString(),
  };

  const { data: created, error: createErr } = await supabase
    .from(inscricoesTable)
    .insert(insertPayload)
    .select('*')
    .single();

  if (createErr) throw createErr;

  return { success: true, data: created, status: 201 };
}

// Função para verificar JOIN
async function checkJoin(id) {
  const { data, error } = await supabase
    .from('inscricoes')
    .select(`
      *,
      encontros!inner(id, data_inicio, status)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// Função para testar duplicidade
async function testDuplicate(id_encontro) {
  const payload = {
    id_encontro,
    nome_adolescente: 'Teste Adolescente',
    data_nascimento: '2010-05-01',
    telefone_adolescente: '11999999999',
    nome_responsavel: 'Teste Responsavel 2',
    telefone_responsavel: '11888888889',
    aceite_termos: true
  };

  // Mesmo nome e data, deve detectar duplicata
  const telDigits = payload.telefone_adolescente.replace(/\D/g, '');
  const { data: existing } = await supabase
    .from('inscricoes')
    .select('id,id_encontro,nome_adolescente,data_nascimento,telefone_adolescente,status_inscricao,created_at')
    .eq('id_encontro', id_encontro)
    .or(
      [
        `telefone_adolescente.eq.${payload.telefone_adolescente}`,
        `telefone_adolescente.ilike.%${telDigits}%`,
        `and(nome_adolescente.ilike.%${payload.nome_adolescente}%,data_nascimento.eq.${payload.data_nascimento})`,
      ].filter(Boolean).join(',')
    )
    .limit(1);

  return existing && existing.length > 0 ? existing[0] : null;
}

// Função para limpar dados de teste
async function cleanupTestData(id_encontro) {
  const { error } = await supabase
    .from('inscricoes')
    .delete()
    .eq('id_encontro', id_encontro)
    .ilike('nome_adolescente', '%Teste%');

  if (error) throw error;
}

async function main() {
  try {
    console.log('Testando acesso a vw_cadastro_oficial...');
    const { data, error } = await supabase.from('vw_cadastro_oficial').select('*').limit(1);
    if (error) {
      console.error('Erro:', error);
      return;
    }
    console.log('Acesso OK, vw_cadastro_oficial:', data);

    console.log('Testando encontros...');
    const { data: data2, error: error2 } = await supabase.from('encontros').select('*').limit(1);
    if (error2) {
      console.error('Erro encontros:', error2);
      return;
    }
    console.log('Acesso OK, encontros:', data2);
  } catch (error) {
    console.error('Erro:', error);
  }
}

main();