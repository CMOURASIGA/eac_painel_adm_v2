import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../utils/supabaseActions';
import { isSupabaseConfigured } from '../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supa = await handleSupabaseAction('GET_NON_ENROLLED', {});
  if (!supa.ok) {
    return NextResponse.json(
      { success: false, error: supa.error || 'Falha ao consultar não inscritos.' },
      { status: isSupabaseConfigured() ? 502 : 500 }
    );
  }

  const response = NextResponse.json(supa.data, { status: 200 });
  response.headers.set('X-EAC-Backend', 'supabase');
  response.headers.set('X-EAC-Endpoint', 'nao-inscritos');
  return response;
}

