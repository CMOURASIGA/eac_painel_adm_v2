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

async function finalValidation() {
  console.log("=== VALIDAÇÃO FINAL PARA HOMOLOGAÇÃO DA US-019 ===\n");

  // 1. Check duplicates by phone
  console.log("1. Verificando duplicidades por telefone...");
  const { data: duplicatesByPhone } = await supabase
    .from('inscricoes')
    .select('encontro_id, adolescentes(pessoas(telefone_normalizado))')
    .eq('encontro_id', '6781a087-6a98-43fb-b7cb-6f5a13aee21e')
    .order('criado_em', { ascending: false })
    .limit(10);

  const phoneMap = {};
  (duplicatesByPhone ?? []).forEach((row) => {
    if (row.adolescentes && row.adolescentes.pessoas && row.adolescentes.pessoas[0]) {
      const phone = row.adolescentes.pessoas[0].telefone_normalizado;
      if (!phoneMap[phone]) phoneMap[phone] = [];
      phoneMap[phone].push(row);
    }
  });

  let hasDuplicatesByPhone = false;
  Object.entries(phoneMap).forEach(([phone, records]) => {
    if (records.length > 1) {
      console.log(`  ❌ Múltiplas inscrições para telefone ${phone}: ${records.length}`);
      hasDuplicatesByPhone = true;
    }
  });

  if (!hasDuplicatesByPhone) {
    console.log("  ✅ Nenhuma duplicidade por telefone");
  }

  // 2. Check duplicates by adolescente_id + encontro_id
  console.log("\n2. Verificando duplicidades por adolescente_id + encontro_id...");
  const { data: allInscricoes } = await supabase
    .from('inscricoes')
    .select('id, adolescente_id, encontro_id')
    .limit(10000);

  const grouped = {};
  (allInscricoes ?? []).forEach((row) => {
    const key = `${row.adolescente_id}|${row.encontro_id}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });

  let hasDuplicates = false;
  Object.entries(grouped).forEach(([key, records]) => {
    if (records.length > 1) {
      console.log(`  ❌ Múltiplas inscrições para ${key}: ${records.length}`);
      hasDuplicates = true;
    }
  });

  if (!hasDuplicates) {
    console.log("  ✅ Nenhuma duplicidade por adolescente/encontro");
  }

  // 3. Validate latest inscription data
  console.log("\n3. Validando dados da última inscrição...");
  const { data: latestInscricao } = await supabase
    .from('inscricoes')
    .select(`
      id,
      status,
      origem_dado,
      criado_via_sistema,
      adolescentes(
        id,
        aceite_normas,
        ja_fez_eac,
        pessoas(
          id,
          nome_completo,
          data_nascimento,
          idade_calculada,
          telefone,
          telefone_normalizado,
          bairro
        )
      ),
      adolescente_responsaveis(
        id,
        principal,
        origem_dado,
        criado_via_sistema,
        responsaveis(
          id,
          nome,
          telefone,
          telefone_normalizado
        )
      )
    `)
    .eq('origem_dado', 'SISTEMA')
    .order('criado_em', { ascending: false })
    .limit(1);

  if (latestInscricao && latestInscricao.length > 0) {
    const ins = latestInscricao[0];
    console.log("  ✅ Inscrição encontrada");
    console.log(`     - status: ${ins.status} ${ins.status === 'INSCRITO' ? '✅' : '❌'}`);
    console.log(`     - origem_dado: ${ins.origem_dado} ${ins.origem_dado === 'SISTEMA' ? '✅' : '❌'}`);
    console.log(`     - criado_via_sistema: ${ins.criado_via_sistema} ${ins.criado_via_sistema ? '✅' : '❌'}`);
    
    if (ins.adolescentes && ins.adolescentes.pessoas && ins.adolescentes.pessoas[0]) {
      const pessoa = ins.adolescentes.pessoas[0];
      console.log(`     - Pessoa: ${pessoa.nome_completo} ✅`);
      console.log(`     - Telefone: ${pessoa.telefone_normalizado} ✅`);
    }
    
    if (ins.adolescente_responsaveis && ins.adolescente_responsaveis[0]) {
      const vinculo = ins.adolescente_responsaveis[0];
      const responsavel = vinculo.responsaveis;
      console.log(`     - Vínculo: ${vinculo.id.substring(0, 8)}... ✅`);
      console.log(`     - Vínculo origem: ${vinculo.origem_dado} ${vinculo.origem_dado === 'SISTEMA' ? '✅' : '❌'}`);
      console.log(`     - Responsável: ${responsavel.nome} ✅`);
      console.log(`     - Telefone responsável: ${responsavel.telefone_normalizado} ✅`);
    }
  }

  console.log("\n=== FIM DA VALIDAÇÃO ===");
}

finalValidation();