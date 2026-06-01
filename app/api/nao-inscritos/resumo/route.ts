import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';
import { isSupabaseConfigured } from '../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

const clean = (v: any) => String(v ?? '').trim().toLowerCase();
const isYes = (v: any) => {
  const s = clean(v);
  return s === 'sim' || s === 's' || s === 'yes' || s === 'y' || s === 'true' || s === '1';
};
const isNo = (v: any) => {
  const s = clean(v);
  return s === 'nao' || s === 'não' || s === 'n' || s === 'no' || s === 'false' || s === '0';
};
const pick = (row: any, keys: string[]) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

export async function GET() {
  const supa = await handleSupabaseAction('GET_NON_ENROLLED', {});
  if (!supa.ok) {
    return NextResponse.json(
      { success: false, error: supa.error || 'Falha ao consultar não inscritos.' },
      { status: isSupabaseConfigured() ? 502 : 500 }
    );
  }

  const data: any = supa.data || {};
  const list: any[] = Array.isArray(data?.nonEnrolled) ? data.nonEnrolled : [];

  const summary = list.reduce(
    (acc, row) => {
      const interesse = pick(row, ['interesseConfirmado', 'interesse_confirmado', 'interesse', 'Interesse Confirmado', 'I']);
      const contatoMudou = pick(row, ['contatoMudou', 'contato_mudou', 'Contato Mudou', 'K']);
      const jaFez = pick(row, ['jaFezEac', 'ja_fez_eac', 'J fez o EAC', 'J']);

      if (isYes(interesse)) acc.interesse_sim += 1;
      else if (isNo(interesse)) acc.interesse_nao += 1;
      else acc.interesse_em_branco += 1;

      if (isYes(contatoMudou)) acc.contato_mudou_sim += 1;
      if (isYes(jaFez)) acc.ja_fez_eac_sim += 1;
      return acc;
    },
    {
      total: list.length,
      interesse_sim: 0,
      interesse_nao: 0,
      interesse_em_branco: 0,
      contato_mudou_sim: 0,
      ja_fez_eac_sim: 0,
    }
  );

  const response = NextResponse.json(
    {
      success: true,
      source: 'supabase',
      summary,
    },
    { status: 200 }
  );
  response.headers.set('X-EAC-Backend', 'supabase');
  response.headers.set('X-EAC-Endpoint', 'nao-inscritos/resumo');
  return response;
}

