import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from './supabaseServer.js';

export async function handleTermos(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
  try {
    const accessToken = String(req.cookies?.eac_auth_token || '');
    const supabaseUrl = String(process.env.SUPABASE_URL || '');
    const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
    if (!accessToken || !supabaseUrl || !anonKey) return res.status(401).json({ success: false, error: 'SESSION_REQUIRED' });
    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const identity = await client.auth.getUser(accessToken);
    const userId = identity.data.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'SESSION_EXPIRED' });
    const db = getSupabaseServerClient();
    if (!db) return res.status(503).json({ success: false, error: 'DB_NOT_CONFIGURED' });
    const profile = await db.from('app_user_profiles').select('role,status,allowed_modules').eq('auth_user_id',userId).maybeSingle();
    if (profile.error || !profile.data || String(profile.data.status).toUpperCase() !== 'ATIVO') {
      return res.status(403).json({ success: false, error: 'ACCESS_DENIED' });
    }
    const modules = Array.isArray(profile.data.allowed_modules) ? profile.data.allowed_modules : [];
    if (String(profile.data.role).toUpperCase() !== 'ADMIN' && !modules.includes('members')) {
      return res.status(403).json({ success: false, error: 'MODULE_FORBIDDEN' });
    }
    const name = String(req.query.nome || '').trim();
    if (name.length < 3 || name.length > 200) return res.status(400).json({ success: false, error: 'INVALID_NAME' });
    const personResult = await db.from('pessoas').select('id,nome_completo,data_nascimento').ilike('nome_completo', name).limit(10);
    if (personResult.error) throw personResult.error;
    const people = (personResult.data || []).filter((p: any) => String(p.nome_completo).trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
    if (people.length === 0) return res.status(200).json({ success: true, data: [], status: 'SEM_REGISTRO' });
    if (people.length > 1) return res.status(409).json({ success: false, error: 'HOMONIMOS', message: 'Mais de uma pessoa tem este nome. A consulta exige identificação adicional.' });
    const adolescentes = await db.from('adolescentes').select('id,pessoa_id,aceite_normas,autorizacao_imagem').eq('pessoa_id', people[0].id).limit(2);
    if (adolescentes.error) throw adolescentes.error;
    if ((adolescentes.data || []).length !== 1) return res.status(200).json({ success: true, data: [], status: 'SEM_REGISTRO_UNICO' });
    const adolescente = adolescentes.data![0];
    const rows = await db.from('inscricoes')
      .select('id,status,termos_snapshot,termos_respostas,termos_versao_snapshot,confirmacao_responsavel_confirmada_em')
      .eq('adolescente_id', adolescente.id)
      .order('confirmacao_responsavel_confirmada_em', { ascending: false, nullsFirst: false })
      .limit(20);
    if (rows.error) throw rows.error;
    return res.status(200).json({
      success: true,
      data: (rows.data || []).map((r: any) => ({
        inscricao_id: r.id,
        status: r.status,
        versao: r.termos_versao_snapshot,
        confirmado_em: r.confirmacao_responsavel_confirmada_em,
        termos: r.termos_snapshot || [],
        respostas: r.termos_respostas?.respostas || {},
        responsavel: r.termos_respostas?.responsavel_nome_snapshot || null,
      })),
      indicadores: { aceite_normas: adolescente.aceite_normas, autorizacao_imagem: adolescente.autorizacao_imagem },
    });
  } catch (error: any) {
    console.error('[inscricoes/termos] falha', error?.message || error);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}
