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

async function cleanup() {
  // Delete vinculos
  await supabase
    .from('adolescente_responsaveis')
    .delete()
    .or('origem_dado.eq.SISTEMA,criado_via_sistema.eq.true');

  // Delete inscricoes
  await supabase
    .from('inscricoes')
    .delete()
    .eq('origem_dado', 'SISTEMA');

  // Delete adolescentes
  await supabase
    .from('adolescentes')
    .delete()
    .eq('origem_dado', 'SISTEMA');

  // Delete responsaveis
  await supabase
    .from('responsaveis')
    .delete()
    .or('origem_dado.eq.SISTEMA,criado_via_sistema.eq.true');

  // Delete pessoas
  await supabase
    .from('pessoas')
    .delete()
    .eq('origem_dado', 'SISTEMA');

  console.log('Cleanup done');
}

cleanup();