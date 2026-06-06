import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../../utils/supabaseActions.js';
import { isSupabaseConfigured } from '../../utils/supabaseServer.js';

const toClean = (v: any) => String(v ?? '').trim();
const normalizeDigits = (v: any) => String(v || '').replace(/\D/g, '');
const normalizeText = (v: any) =>
  toClean(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function send(res: NextApiResponse, status: number, body: any) {
  return res.status(status).json(body);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return send(res, 405, { success: false, error: 'Metodo nao permitido.' });

  const [enc, mem, pre] = await Promise.all([
    handleSupabaseAction('GET_ENCONTREIROS', {}),
    handleSupabaseAction('GET_MEMBERS', {}),
    handleSupabaseAction('GET_PRESENCE', {}),
  ]);

  if (!enc.ok || !mem.ok) {
    return send(res, isSupabaseConfigured() ? 502 : 500, {
      success: false,
      error: enc.error || mem.error || 'Falha ao carregar dados de presenca.',
    });
  }

  const encontreiros = Array.isArray((enc.data as any)?.encontreiros) ? (enc.data as any).encontreiros : [];
  const encontristas = Array.isArray((mem.data as any)?.members) ? (mem.data as any).members : [];

  const map = new Map<string, any>();
  const upsert = (row: any, origem: 'ENCONTREIRO' | 'ENCONTRISTA') => {
    const nome = toClean(row?.nomeCompleto || row?.nome || row?.nome_completo || row?.name);
    if (!nome) return;
    const telefone = toClean(row?.celularWhatsapp || row?.telefone || row?.whatsapp || row?.celular || row?.phone);
    const telKey = normalizeDigits(telefone);
    const key = telKey ? `tel:${telKey}` : `nome:${normalizeText(nome)}`;
    const prev = map.get(key);
    map.set(key, {
      key,
      nome,
      telefone: telefone || prev?.telefone || '',
      circulo: toClean(
        row?.circulo ||
          row?.grupoSugerido ||
          row?.grupo_sugerido ||
          row?.circuloInformado ||
          row?.circulo_informado ||
          prev?.circulo ||
          ''
      ),
      origem: prev && prev.origem !== origem ? 'AMBOS' : (prev?.origem || origem),
    });
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
      const telKey = normalizeDigits(telefone);
      const key = telKey ? `tel:${telKey}` : `nome:${normalizeText(nome)}`;
      if (map.has(key)) return;
      map.set(key, {
        key,
        nome,
        telefone,
        circulo: toClean(row?.circulo || row?.circulo_informado),
        origem: 'ENCONTREIRO',
      });
    });
  }

  const finalCandidates = Array.from(map.values()).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return send(res, 200, {
    success: true,
    candidates: finalCandidates,
    debug: {
      encontreirosCount: encontreiros.length,
      encontristasCount: encontristas.length,
      presenceCount: pre.ok ? (Array.isArray((pre.data as any)?.presence) ? (pre.data as any).presence.length : 0) : 0,
    },
  });
}
