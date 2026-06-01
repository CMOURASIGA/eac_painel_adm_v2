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

async function checkDuplicate() {
  const { data, error } = await supabase
    .from('inscricoes')
    .select(`
      id,
      encontro_id,
      adolescentes(pessoas(telefone_normalizado))
    `)
    .eq('encontro_id', '6781a087-6a98-43fb-b7cb-6f5a13aee21e')
    .ilike('adolescentes.pessoas.telefone_normalizado', '5521999990019');

  console.log('Inscricoes with same phone:', data, error);
  console.log('Count:', data ? data.length : 0);
}

checkDuplicate();