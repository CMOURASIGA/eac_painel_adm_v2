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

async function simplifiedValidation() {
  console.log("=== VALIDAÇÃO FINAL SIMPLIFICADA ===\n");

  // Get latest inscription
  const { data: inscricoes } = await supabase
    .from('inscricoes')
    .select('id, status, origem_dado, criado_via_sistema, adolescente_id, encontro_id')
    .order('criado_em', { ascending: false })
    .limit(5);

  console.log("Últimas 5 inscrições:");
  (inscricoes ?? []).forEach((ins, i) => {
    console.log(`${i + 1}. ${ins.id.substring(0, 8)}... - Status: ${ins.status}, Origem: ${ins.origem_dado}, Sistema: ${ins.criado_via_sistema}`);
  });

  if (inscricoes && inscricoes.length > 0) {
    const latest = inscricoes[0];
    
    console.log(`\nÚltima inscrição: ${latest.id}`);
    console.log(`  - Status: ${latest.status} ${latest.status === 'INSCRITO' ? '✅' : '❌'}`);
    console.log(`  - Origem: ${latest.origem_dado} ${latest.origem_dado === 'SISTEMA' ? '✅' : '❌'}`);
    console.log(`  - Sistema: ${latest.criado_via_sistema} ${latest.criado_via_sistema ? '✅' : '❌'}`);

    // Check duplicates for this adolescente + encontro
    const { data: duplicates } = await supabase
      .from('inscricoes')
      .select('id')
      .eq('adolescente_id', latest.adolescente_id)
      .eq('encontro_id', latest.encontro_id);

    console.log(`\nInscrições para adolescente_id=${latest.adolescente_id.substring(0, 8)}... + encontro_id=${latest.encontro_id.substring(0, 8)}...:`);
    console.log(`  Total: ${(duplicates ?? []).length}`);
    
    if ((duplicates ?? []).length === 1) {
      console.log("  ✅ Nenhuma duplicidade");
    } else {
      console.log(`  ❌ ${(duplicates ?? []).length} inscrições encontradas`);
    }
  }
}

simplifiedValidation();