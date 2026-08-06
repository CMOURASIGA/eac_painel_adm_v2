import { NextResponse } from 'next/server';
import { authorizeRequest } from '../../../../utils/apiAuth';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, { module: 'inscricoes_prioritarias_circulos', action: 'edit' });
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  try {
    const body = await req.json();
    const result = await handleSupabaseAction('SAVE_CIRCULOS_DISTRIBUICAO_OFICIAL', body || {});
    if (!result.ok || !(result.data as any)?.success) {
      return NextResponse.json(
        { success: false, error: result.ok ? (result.data as any)?.error : result.error || 'Não foi possível salvar a distribuição.' },
        { status: 422 }
      );
    }
    return NextResponse.json(result.data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Erro ao salvar a distribuição.' }, { status: 500 });
  }
}
