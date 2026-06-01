import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const envLines = envContent.split("\n");
const env = {};
for (const line of envLines) {
  const [key, value] = line.split("=");
  if (key && value) env[key.trim()] = value.trim();
}

const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

async function checkJoin() {
  // Find the inscription
  const { data: inscricoes, error: inscError } = await supabase
    .from('inscricoes')
    .select('id, status, origem_dado, criado_via_sistema, data_inscricao, encontro_id, adolescente_id')
    .order('criado_em', { ascending: false })
    .limit(1);

  if (inscError || !inscricoes || inscricoes.length === 0) {
    console.log('No inscription found', { inscError });
    return;
  }

  const inscricao = inscricoes[0];
  console.log('Inscricao:', inscricao);

  // Get encontro
  const { data: encontro, error: encError } = await supabase
    .from('encontros')
    .select('id, nome, numero, data_inicio, data_fim, status')
    .eq('id', inscricao.encontro_id)
    .single();

  console.log('Encontro:', encontro, encError);

  // Get adolescente and pessoa
  const { data: adolescente, error: adoError } = await supabase
    .from('adolescentes')
    .select('id, aceite_normas, ja_fez_eac, pessoa_id')
    .eq('id', inscricao.adolescente_id)
    .single();

  const { data: pessoaAdo, error: pesAdoError } = await supabase
    .from('pessoas')
    .select('id, nome_completo, data_nascimento, idade_calculada, telefone, telefone_normalizado, bairro')
    .eq('id', adolescente.pessoa_id)
    .single();

  console.log('Adolescente:', adolescente, adoError);
  console.log('Pessoa Adolescente:', pessoaAdo, pesAdoError);

  // Get vinculo
  const { data: vinculos, error: vinError } = await supabase
    .from('adolescente_responsaveis')
    .select('id, principal, grau_parentesco, origem_dado, criado_via_sistema, responsavel_id')
    .eq('adolescente_id', inscricao.adolescente_id);

  if (vinculos && vinculos.length > 0) {
    const vinculo = vinculos[0];
    console.log('Vinculo:', vinculo, vinError);

    // Get responsavel and pessoa
    const { data: responsavel, error: resError } = await supabase
      .from('responsaveis')
      .select('id, nome, telefone, telefone_normalizado, pessoa_id')
      .eq('id', vinculo.responsavel_id)
      .single();

    const { data: pessoaRes, error: pesResError } = await supabase
      .from('pessoas')
      .select('id')
      .eq('id', responsavel.pessoa_id)
      .single();

    console.log('Responsavel:', responsavel, resError);
    console.log('Pessoa Responsavel:', pessoaRes, pesResError);
  } else {
    console.log('No vinculo found', vinError);
  }
}

checkJoin();