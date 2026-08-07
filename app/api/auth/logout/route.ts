import { NextResponse } from 'next/server';
import { buildClearSessionCookieHeader } from '../../../../utils/authSession';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true }, { status: 200 });
  response.headers.append('Set-Cookie', buildClearSessionCookieHeader());
  return response;
}
