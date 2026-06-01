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

async function listTestData() {
  const { data, error } = await supabase
    .from('pessoas')
    .select(`
      id,
      nome_completo,
      telefone_normalizado
    `)
    .or('nome_completo.ilike.%Teste US019 Final%,nome_completo.ilike.%Responsável US019 Final%,telefone_normalizado.ilike.%21999990019%,telefone_normalizado.ilike.%21988880019%');

  console.log('Pessoas de teste:', data, error);
}

listTestData();