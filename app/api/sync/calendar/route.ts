import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';

export const dynamic = 'force-dynamic';

function readBearerToken(req: Request) {
  const auth = String(req.headers.get('authorization') || '').trim();
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function POST(req: Request) {
  try {
    const expectedToken = String(process.env.EAC_CRON_SYNC_TOKEN || '').trim();
    if (!expectedToken) {
      return NextResponse.json(
        { success: false, error: 'EAC_CRON_SYNC_TOKEN não configurado.' },
        { status: 500 }
      );
    }

    const receivedToken = readBearerToken(req);
    if (!receivedToken || receivedToken !== expectedToken) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado.' },
        { status: 401 }
      );
    }

    const result = await handleSupabaseAction('IMPORT_CALENDAR_2026_EXTERNOS', {});
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error || 'Falha ao sincronizar calendário.' },
        { status: 502 }
      );
    }

    const response = NextResponse.json({
      ...result.data,
      triggeredBy: 'supabase-cron',
    });
    response.headers.set('X-EAC-Backend', 'supabase');
    response.headers.set('X-EAC-Action', 'IMPORT_CALENDAR_2026_EXTERNOS');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Falha inesperada no sincronismo do calendário.') },
      { status: 500 }
    );
  }
}
