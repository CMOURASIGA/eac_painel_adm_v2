import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUS = new Set(['ATIVO', 'PLANEJADO']);

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase não configurado.' }, { status: 500 });
    }

    const table = toCleanString(process.env.EAC_SUPABASE_TABLE_ENCONTROS) || 'encontros';
    const { data, error } = await supabase
      .from(table)
      .select('id,nome,numero,data_inicio,data_fim,status')
      .in('status', Array.from(ALLOWED_STATUS))
      .order('data_inicio', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[app/api/encontros/abertos] erro supabase:', error);
      return NextResponse.json(
        { success: false, error: 'ERRO_LISTAR_ENCONTROS', message: 'Não foi possível carregar os encontros disponíveis.' },
        { status: 502 }
      );
    }

    const encontros = Array.isArray(data) ? data : [];
    const res = NextResponse.json({ success: true, data: encontros, encontros }, { status: 200 });
    res.headers.set('X-EAC-Source', 'supabase');
    return res;
  } catch (e: any) {
    console.error('[app/api/encontros/abertos] falha:', e);
    return NextResponse.json({ success: false, error: 'Erro interno.' }, { status: 500 });
  }
}

