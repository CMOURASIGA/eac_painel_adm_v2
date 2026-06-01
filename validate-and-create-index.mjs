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

async function validateAndCreateIndex() {
  console.log("=== VALIDAÇÃO E CRIAÇÃO DO ÍNDICE ÚNICO ===\n");

  // Step 1: Check for duplicates
  console.log("PASSO 1: Verificando duplicidades...");
  console.log("Query: SELECT adolescente_id, encontro_id, count(*) FROM inscricoes GROUP BY adolescente_id, encontro_id HAVING count(*) > 1\n");

  const { data: allInscricoes } = await supabase
    .from('inscricoes')
    .select('adolescente_id, encontro_id')
    .limit(10000);

  const grouped = {};
  (allInscricoes ?? []).forEach((row) => {
    const key = `${row.adolescente_id}|${row.encontro_id}`;
    if (!grouped[key]) grouped[key] = 0;
    grouped[key]++;
  });

  const duplicates = Object.entries(grouped)
    .filter(([_, count]) => count > 1)
    .map(([key, count]) => {
      const [adolescente_id, encontro_id] = key.split('|');
      return { adolescente_id, encontro_id, total: count };
    });

  if (duplicates.length === 0) {
    console.log("✅ Nenhuma duplicidade encontrada!\n");
  } else {
    console.log("❌ Duplicidades encontradas:");
    duplicates.forEach((dup) => {
      console.log(`   adolescente_id: ${dup.adolescente_id}, encontro_id: ${dup.encontro_id}, total: ${dup.total}`);
    });
    console.log("\n⚠️ ABORTING: Corrigir duplicidades antes de criar o índice\n");
    return;
  }

  // Step 2: Provide SQL instructions
  console.log("PASSO 2: Instruções para criar o índice único\n");
  console.log("Como o Supabase client não permite executar SQL arbitrário,");
  console.log("você precisa executar o SQL a seguir no Supabase Dashboard:\n");
  console.log("1. Acesse: https://app.supabase.com/project/[SEU_PROJETO]/sql/new");
  console.log("2. Cole o SQL abaixo:");
  console.log("---");
  console.log("create unique index if not exists uq_inscricoes_adolescente_encontro");
  console.log("on public.inscricoes (adolescente_id, encontro_id);");
  console.log("---");
  console.log("\n3. Execute e confirme 'Success'");
  console.log("\n4. Depois rode o SQL de validação:");
  console.log("---");
  console.log("select");
  console.log("  indexname,");
  console.log("  indexdef");
  console.log("from pg_indexes");
  console.log("where schemaname = 'public'");
  console.log("  and tablename = 'inscricoes'");
  console.log("  and indexname = 'uq_inscricoes_adolescente_encontro';");
  console.log("---");
  console.log("\n5. Se retornar uma linha, o índice foi criado com sucesso ✅\n");

  // Step 3: Provide summary
  console.log("=== RESUMO ===");
  console.log(`Total de inscrições no banco: ${allInscricoes?.length ?? 0}`);
  console.log(`Pares adolescente_id + encontro_id únicos: ${Object.keys(grouped).length}`);
  console.log(`Duplicidades encontradas: ${duplicates.length}`);
  console.log("\n✅ Banco seguro para criar o índice!\n");
}

validateAndCreateIndex().catch(console.error);