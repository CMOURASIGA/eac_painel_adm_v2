import { NextResponse } from 'next/server';
import { handleSupabaseAction } from '../../../../utils/supabaseActions';
import { isSupabaseConfigured } from '../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

const toClean = (v: any) => String(v ?? '').trim();
const normalizeDigits = (v: any) => String(v || '').replace(/\D/g, '');
const normalizeText = (v: any) =>
  toClean(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export async function GET() {
  const [enc, mem, pre] = await Promise.all([
    handleSupabaseAction('GET_ENCONTREIROS', {}),
    handleSupabaseAction('GET_MEMBERS', {}),
    handleSupabaseAction('GET_PRESENCE', {}),
  ]);

  if (!enc.ok || !mem.ok) {
    return NextResponse.json(
      { success: false, error: enc.error || mem.error || 'Falha ao carregar dados de presença.' },
      { status: isSupabaseConfigured() ? 502 : 500 }
    );
  }

  const encontreiros = Array.isArray((enc.data as any)?.encontreiros) ? (enc.data as any).encontreiros : [];
  const encontristas = Array.isArray((mem.data as any)?.members) ? (mem.data as any).members : [];

  const map = new Map<string, any>();
  const identityToKey = new Map<string, string>();
  const upsert = (row: any, origem: 'ENCONTREIRO' | 'ENCONTRISTA') => {
    const nome = toClean(row?.nomeCompleto || row?.nome || row?.nome_completo || row?.name);
    if (!nome) return;
    const telefone = toClean(row?.celularWhatsapp || row?.telefone || row?.whatsapp || row?.celular || row?.phone);
    const email = toClean(row?.email || row?.email_adolescente || row?.email_responsavel);
    const pessoaId = toClean(row?.pessoaId || row?.pessoa_id);
    const identities = [
      pessoaId ? `pessoa:${pessoaId}` : '',
      normalizeDigits(telefone) ? `tel:${normalizeDigits(telefone)}` : '',
      email ? `email:${normalizeText(email)}` : '',
      `nome:${normalizeText(nome)}`,
    ].filter(Boolean);
    const key =
      identities.map((identity) => identityToKey.get(identity)).find(Boolean) ||
      identities[0] ||
      `nome:${normalizeText(nome)}`;
    const prev = map.get(key);
    map.set(key, {
      key,
      pessoaId: pessoaId || prev?.pessoaId || '',
      nome,
      telefone: telefone || prev?.telefone || '',
      email: email || prev?.email || '',
      hasPhone: Boolean(telefone || prev?.telefone),
      hasEmail: Boolean(email || prev?.email),
      circulo: toClean(row?.circulo || row?.grupoSugerido || row?.grupo_sugerido || row?.circuloInformado || row?.circulo_informado || prev?.circulo || ''),
      origem: prev?.origem === 'ENCONTRISTA' || origem === 'ENCONTRISTA' ? 'ENCONTRISTA' : 'ENCONTREIRO',
    });
    identities.forEach((identity) => identityToKey.set(identity, key));
  };

  encontreiros.forEach((r: any) => upsert(r, 'ENCONTREIRO'));
  encontristas.forEach((r: any) => upsert(r, 'ENCONTRISTA'));

  const candidates = Array.from(map.values()).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  if (candidates.length === 0 && pre.ok) {
    const presence = Array.isArray((pre.data as any)?.presence) ? (pre.data as any).presence : [];
    presence.forEach((row: any) => {
      const nome = toClean(row?.nome || row?.nome_digitado || row?.nome_completo);
      if (!nome) return;
      const telefone = toClean(row?.telefone || row?.telefone_digitado || row?.telefone_normalizado);
      const email = toClean(row?.email || row?.email_adolescente || row?.email_responsavel);
      const pessoaId = toClean(row?.pessoaId || row?.pessoa_id);
      const telKey = normalizeDigits(telefone);
      const key = pessoaId ? `pessoa:${pessoaId}` : (telKey ? `tel:${telKey}` : `nome:${normalizeText(nome)}`);
      if (map.has(key)) return;
      map.set(key, {
        key,
        pessoaId,
        nome,
        telefone,
        email,
        hasPhone: Boolean(telefone),
        hasEmail: Boolean(email),
        circulo: toClean(row?.circulo || row?.circulo_informado),
        origem: 'ENCONTREIRO',
      });
    });
  }

  const finalCandidates = Array.from(map.values()).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return NextResponse.json(
    {
      success: true,
      candidates: finalCandidates,
      debug: {
        encontreirosCount: encontreiros.length,
        encontristasCount: encontristas.length,
        presenceCount: pre.ok ? (Array.isArray((pre.data as any)?.presence) ? (pre.data as any).presence.length : 0) : 0,
      },
    },
    { status: 200 }
  );
}
