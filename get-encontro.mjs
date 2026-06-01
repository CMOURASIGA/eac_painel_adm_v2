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

async function getEncontro() {
  const { data, error } = await supabase
    .from("encontros")
    .select("id, nome, numero, data_inicio, data_fim, status")
    .in("status", ["ATIVO", "PLANEJADO"])
    .order("data_inicio", { ascending: false })
    .limit(1);

  console.log({ data, error });
  if (data && data.length > 0) {
    console.log("ID_ENCONTRO:", data[0].id);
  }
}

getEncontro();