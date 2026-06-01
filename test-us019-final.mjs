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

// Função para obter encontro ativo/planejado
async function getEncontroAtivo() {
  const { data, error } = await supabase
    .from('encontros')
    .select('id, nome, numero, data_inicio, status')
    .in('status', ['ATIVO', 'PLANEJADO'])
    .order('data_inicio', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

// Função para testar criação
async function testCreateInscricao(id_encontro) {
  const payload = {
    nome_adolescente: 'Teste US019 Final',
    data_nascimento: '2011-05-10',
    telefone_adolescente: '21999990019',
    nome_responsavel: 'Responsável US019 Final',
    telefone_responsavel: '21988880019',
    bairro: 'Bairro Teste',
    paroquia: 'Paróquia Teste',
    participou_antes: false,
    aceite_termos: true,
    id_encontro
  };

  // Simular lógica do endpoint
  const data_nascimento = new Date(payload.data_nascimento);
  const dataInicio = new Date('2024-05-01'); // exemplo
  const idade = dataInicio.getFullYear() - data_nascimento.getFullYear();

  // Verificar duplicidade
  const telDigits = payload.telefone_adolescente.replace(/\D/g, '');
  const { data: existing } = await supabase
    .from('inscricoes')
    .select('id')
    .eq('encontro_id', id_encontro)
    .or(`pessoas.telefone_normalizado.eq.${telDigits}`);

  if (existing && existing.length > 0) {
    return { success: true, duplicate: true };
  }

  // Inserir pessoa adolescente
  const { data: pessoaAdolescente, error: err1 } = await supabase
    .from('pessoas')
    .insert({
      nome_completo: payload.nome_adolescente,
      data_nascimento: payload.data_nascimento,
      idade_calculada: idade,
      telefone: payload.telefone_adolescente,
      telefone_normalizado: telDigits,
      bairro: payload.bairro,
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (err1) throw err1;

  // Inserir adolescente
  const { data: adolescente, error: err2 } = await supabase
    .from('adolescentes')
    .insert({
      pessoa_id: pessoaAdolescente.id,
      aceite_normas: true,
      ja_fez_eac: false,
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (err2) throw err2;

  // Inserir pessoa responsável
  const telRespDigits = payload.telefone_responsavel.replace(/\D/g, '');
  const { data: pessoaResponsavel, error: err3 } = await supabase
    .from('pessoas')
    .insert({
      nome_completo: payload.nome_responsavel,
      telefone: payload.telefone_responsavel,
      telefone_normalizado: telRespDigits,
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (err3) throw err3;

  // Inserir responsável
  const { data: responsavel, error: err4 } = await supabase
    .from('responsaveis')
    .insert({
      pessoa_id: pessoaResponsavel.id,
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (err4) throw err4;

  // Inserir vínculo
  const { data: vinculo, error: err5 } = await supabase
    .from('adolescente_responsaveis')
    .insert({
      adolescente_id: adolescente.id,
      responsavel_id: responsavel.id,
      principal: true,
      grau_parentesco: 'Pai/Mãe',
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_importacao: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (err5) throw err5;

  // Inserir inscrição
  const { data: inscricao, error: err6 } = await supabase
    .from('inscricoes')
    .insert({
      encontro_id: id_encontro,
      adolescente_id: adolescente.id,
      status: 'INSCRITO',
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_inscricao: new Date().toISOString(),
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (err6) throw err6;

  return {
    success: true,
    data: {
      inscricao_id: inscricao.id,
      adolescente_id: adolescente.id,
      pessoa_adolescente_id: pessoaAdolescente.id,
      responsavel_id: responsavel.id,
      pessoa_responsavel_id: pessoaResponsavel.id,
      vinculo_id: vinculo.id,
    }
  };
}

// Função para executar JOIN
async function checkJoin() {
  const { data, error } = await supabase
    .from('inscricoes')
    .select(`
      id as inscricao_id,
      status as status_inscricao,
      origem_dado as origem_inscricao,
      criado_via_sistema as inscricao_criada_via_sistema,
      data_inscricao,
      encontros!inner(id as encontro_id, nome as encontro_nome, numero as encontro_numero, data_inicio, status as status_encontro),
      adolescentes!inner(id as adolescente_id, aceite_normas, ja_fez_eac, pessoas!inner(id as pessoa_adolescente_id, nome_completo as nome_adolescente, data_nascimento, idade_calculada, telefone as telefone_adolescente, telefone_normalizado as telefone_adolescente_normalizado, bairro)),
      adolescente_responsaveis!left(id as vinculo_id, principal, grau_parentesco, origem_dado as origem_vinculo, criado_via_sistema as vinculo_criado_via_sistema, responsaveis!inner(id as responsavel_id, pessoas!inner(id as pessoa_responsavel_id, nome_completo as nome_responsavel, telefone as telefone_responsavel, telefone_normalizado as telefone_responsavel_normalizado)))
    `)
    .ilike('pessoas.nome_completo', '%Teste US019 Final%')
    .order('criado_em', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data;
}

// Função para limpar
async function cleanup() {
  // Primeiro, deletar inscrições
  const { data: inscricoes } = await supabase
    .from('inscricoes')
    .select('id, adolescente_id')
    .ilike('pessoas.nome_completo', '%Teste US019 Final%');

  if (inscricoes) {
    for (const i of inscricoes) {
      await supabase.from('inscricoes').delete().eq('id', i.id);
      await supabase.from('adolescente_responsaveis').delete().eq('adolescente_id', i.adolescente_id);
      await supabase.from('adolescentes').delete().eq('id', i.adolescente_id);
      await supabase.from('responsaveis').delete().eq('id', i.responsavel_id); // assumindo
      // Deletar pessoas se necessário
    }
  }
}

async function main() {
  try {
    console.log('1. Obtendo encontro ativo...');
    const encontro = await getEncontroAtivo();
    console.log('Encontro:', encontro);

    console.log('2. Testando criação...');
    const result = await testCreateInscricao(encontro.id);
    console.log('Resultado criação:', result);

    console.log('3. Verificando JOIN...');
    const joinResult = await checkJoin();
    console.log('JOIN:', JSON.stringify(joinResult, null, 2));

    console.log('4. Testando duplicidade...');
    const duplicateResult = await testCreateInscricao(encontro.id);
    console.log('Duplicata:', duplicateResult);

    console.log('5. Limpando...');
    await cleanup();
    console.log('Limpeza concluída.');

  } catch (error) {
    console.error('Erro:', error);
  }
}

main();