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

async function createUniqueIndex() {
  console.log("⚠️ Índice único precisa ser criado no SQL Editor do Supabase");
  console.log("");
  console.log("Execute este SQL no Supabase Dashboard → SQL Editor:");
  console.log("---");
  console.log("create unique index if not exists uq_inscricoes_adolescente_encontro");
  console.log("on public.inscricoes (adolescente_id, encontro_id);");
  console.log("---");
  console.log("");
  console.log("Ou se preferir via client API (usando service role), o endpoint");
  console.log("agora detectará automaticamente duplicidades.");
}

createUniqueIndex();

createUniqueIndex();