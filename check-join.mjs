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
  const { data, error } = await supabase
    .from('inscricoes')
    .select(`
      id as inscricao_id,
      status as status_inscricao,
      origem_dado as origem_inscricao,
      criado_via_sistema as inscricao_criada_via_sistema,
      data_inscricao,
      encontros(id as encontro_id, nome as encontro_nome, numero as encontro_numero, data_inicio, data_fim, status as status_encontro),
      adolescentes(id as adolescente_id, aceite_normas, ja_fez_eac, pessoas(id as pessoa_adolescente_id, nome_completo as nome_adolescente, data_nascimento, idade_calculada, telefone as telefone_adolescente, telefone_normalizado as telefone_adolescente_normalizado, bairro)),
      adolescente_responsaveis(id as vinculo_id, principal, grau_parentesco, origem_dado as origem_vinculo, criado_via_sistema as vinculo_criado_via_sistema, responsaveis(id as responsavel_id, nome as nome_responsavel, telefone as telefone_responsavel, telefone_normalizado as telefone_responsavel_normalizado, pessoas(id as pessoa_responsavel_id)))
    `)
    .ilike('adolescentes.pessoas.nome_completo', '%Teste US019 Final%')
    .order('criado_em', { ascending: false })
    .limit(1);

  console.log({ data, error });
}

checkJoin();