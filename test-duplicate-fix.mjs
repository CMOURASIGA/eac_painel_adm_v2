import fs from "fs";

const payload = {
  "nome_adolescente": "Teste US019 Final Duplicidade",
  "data_nascimento": "2011-05-10",
  "telefone_adolescente": "21999990020",
  "nome_responsavel": "Responsável US019 Final Duplicidade",
  "telefone_responsavel": "21988880020",
  "bairro": "Bairro Teste",
  "paroquia": "Paróquia Teste",
  "participou_antes": false,
  "aceite_termos": true,
  "id_encontro": "6781a087-6a98-43fb-b7cb-6f5a13aee21e"
};

console.log("=== TESTE DE DUPLICIDADE ===\n");
console.log("Payload:", JSON.stringify(payload, null, 2));

async function testDuplicate() {
  // First POST
  console.log("\n1. Executando PRIMEIRO POST...");
  let response = await fetch("http://localhost:3000/api/inscricoes/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  let data = await response.json();
  console.log(`Status: ${response.status}`);
  console.log("Resposta:", JSON.stringify(data, null, 2));

  if (response.status !== 201) {
    console.log("❌ Primeiro POST falhou!");
    return;
  }

  const inscricaoId1 = data.data.inscricao_id;
  console.log(`✅ Primeira inscrição criada: ${inscricaoId1}`);

  // Second POST
  console.log("\n2. Executando SEGUNDO POST (mesmo payload)...");
  response = await fetch("http://localhost:3000/api/inscricoes/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  data = await response.json();
  console.log(`Status: ${response.status}`);
  console.log("Resposta:", JSON.stringify(data, null, 2));

  if (response.status === 200 && data.duplicate === true) {
    console.log("✅ Duplicidade detectada corretamente!");
    console.log(`   ID da inscrição existente: ${data.data.inscricao_id}`);
    
    if (data.data.inscricao_id === inscricaoId1) {
      console.log("✅ ID da inscrição coincide com a primeira!");
    }
  } else {
    console.log("❌ Duplicidade NÃO foi detectada!");
  }
}

testDuplicate().catch(console.error);