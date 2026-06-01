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

async function checkAndCleanDuplicates() {
  console.log("1. Procurando duplicidades (adolescente_id, encontro_id)...");
  
  const { data: duplicates, error: dupError } = await supabase
    .from('inscricoes')
    .select('adolescente_id, encontro_id')
    .limit(10000);

  if (dupError) {
    console.log("Erro ao buscar inscricoes:", dupError);
    return;
  }

  // Group by adolescente_id + encontro_id
  const grouped = {};
  (duplicates ?? []).forEach((row) => {
    const key = `${row.adolescente_id}|${row.encontro_id}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(row);
  });

  const hasDuplicates = Object.values(grouped).some((arr) => arr.length > 1);

  if (!hasDuplicates) {
    console.log("✅ Nenhuma duplicidade encontrada!");
    return;
  }

  console.log("⚠️ Duplicidades encontradas:");
  Object.entries(grouped).forEach(([key, rows]) => {
    if (rows.length > 1) {
      console.log(`  ${key}: ${rows.length} inscrições`);
    }
  });

  // Limpar duplicidades mantendo a inscrição mais antiga
  console.log("\n2. Limpando duplicidades...");
  
  for (const [key, rows] of Object.entries(grouped)) {
    if (rows.length > 1) {
      // Fetch full records to get timestamps
      const [adolescente_id, encontro_id] = key.split('|');
      
      const { data: inscricoes } = await supabase
        .from('inscricoes')
        .select('id, criado_em')
        .eq('adolescente_id', adolescente_id)
        .eq('encontro_id', encontro_id)
        .order('criado_em', { ascending: true });

      if (inscricoes && inscricoes.length > 1) {
        // Keep first, delete rest
        const toKeep = inscricoes[0].id;
        const toDelete = inscricoes.slice(1).map(i => i.id);

        console.log(`  Mantendo ${toKeep}, deletando ${toDelete.length} duplicatas...`);

        for (const id of toDelete) {
          const { error } = await supabase
            .from('inscricoes')
            .delete()
            .eq('id', id);

          if (error) {
            console.log(`    Erro ao deletar ${id}:`, error);
          }
        }
      }
    }
  }

  console.log("✅ Limpeza concluída!");
}

checkAndCleanDuplicates();