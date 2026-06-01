import { NextResponse } from 'next/server';
import { consumePublicInterestToken, issuePublicInterestToken, validatePublicInterestToken } from '../../../../utils/publicInterestToken';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();

    if (action === 'ISSUE_TOKEN') {
      const out = await issuePublicInterestToken({
        email: body?.email,
        pessoaId: body?.pessoaId,
        inscricaoId: body?.inscricaoId,
        payload: body?.payload,
        createdBy: body?.createdBy,
      });
      return NextResponse.json(out, { status: out.success ? 200 : 400 });
    }

    if (action === 'VALIDATE_TOKEN') {
      const out = await validatePublicInterestToken(String(body?.token || ''));
      return NextResponse.json(out, { status: out.success ? 200 : 400 });
    }

    if (action === 'CONSUME_TOKEN') {
      const forwardedFor = req.headers.get('x-forwarded-for') || '';
      const userAgent = req.headers.get('user-agent') || '';
      const out = await consumePublicInterestToken(String(body?.token || ''), {
        ip: forwardedFor,
        userAgent,
        payload: body?.payload || {},
      });
      return NextResponse.json(out, { status: out.success ? 200 : 400 });
    }

    return NextResponse.json({ success: false, error: 'Acao invalida.' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Erro interno.' }, { status: 500 });
  }
}
