import dotenv from 'dotenv';
import { getSupabaseServerClient } from '../utils/supabaseServer.ts';
import { executeInscricoesAdminList } from '../utils/inscricoesAdmin.ts';

dotenv.config({ path: '.env.local' });
const supabase = getSupabaseServerClient();
if (!supabase) throw new Error('Supabase não configurado');

async function run() {
  console.log('=== US022 Admin API Smoke Test ===\n');

  const tests = [
    { name: 'Sem filtros', query: {} },
    { name: 'Filtrar por status INSCRITO', query: { status: 'INSCRITO' } },
    { name: 'Filtrar por busca nome', query: { busca: 'Teste' } },
    { name: 'Filtrar por busca telefone sem máscara', query: { busca: '219' } },
    { name: 'Filtrar por bairro parcial', query: { bairro: 'Bairro' } },
    { name: 'Filtrar por datas', query: { data_inicio: '2024-01-01', data_fim: '2026-12-31' } },
    { name: 'Filtrar por idade', query: { idade_min: '10', idade_max: '20' } },
  ];

  for (const test of tests) {
    const result = await executeInscricoesAdminList({ supabase, query: test.query });
    console.log('---', test.name, '---');
    console.log('status=', result.status);
    if (!result.body.success) {
      console.log('error=', result.body.error, 'message=', result.body.message);
    }
    if (result.body.success) {
      console.log('total=', result.body.summary?.total, 'returned=', Array.isArray(result.body.data) ? result.body.data.length : 0);
      const first = Array.isArray(result.body.data) && result.body.data.length ? result.body.data[0] : null;
      console.log('first item sample=', first ? { inscricao_id: first.inscricao_id, nome_adolescente: first.nome_adolescente, status_inscricao: first.status_inscricao, bairro: first.bairro, telefone_adolescente: first.telefone_adolescente, data_inscricao: first.data_inscricao } : null);
    }
    console.log('');
  }
}

run().catch((err) => { console.error(err); process.exit(1); });