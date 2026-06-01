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

async function checkDuplicates() {
  const { data, error } = await supabase
    .rpc('check_inscricoes_duplicates');

  if (error) {
    // Try direct query
    const result = await supabase
      .from('inscricoes')
      .select('adolescente_id, encontro_id, count(*) as total', { count: 'exact' })
      .limit(1000);

    console.log('Raw duplicates check (sample):', result);
    return;
  }

  console.log('Duplicates:', data);
}

checkDuplicates();