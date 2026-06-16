import { randomUUID } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';

const ALLOWED_STATUS = new Set(['PLANEJADO']);
const WRITE_ALLOWED_STATUS = new Set(['PLANEJADO', 'CANCELADO']);

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

function toNullable(value: any) {
  const cleaned = toCleanString(value);
  return cleaned || null;
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAdminScope(req: NextApiRequest) {
  return toCleanString(req.query?.scope).toLowerCase() === 'admin';
}

function readTableName() {
  return toCleanString(process.env.EAC_SUPABASE_TABLE_ENCONTROS) || 'encontros';
}

function sendError(res: NextApiResponse, status: number, error: string, message?: string) {
  return res.status(status).json({ success: false, error, message: message || error });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return sendError(res, 500, 'SUPABASE_NOT_CONFIGURED', 'Supabase nao configurado.');
    }

    const table = readTableName();
    const adminScope = isAdminScope(req);

    if (req.method === 'GET') {
      const query = adminScope
        ? supabase
          .from(table)
          .select('id,numero,nome,data_inicio,data_fim,local,status,observacoes,criado_em,atualizado_em')
          .order('data_inicio', { ascending: false })
          .limit(200)
        : supabase
          .from(table)
          .select('id,nome,numero,data_inicio,data_fim,status')
          .in('status', Array.from(ALLOWED_STATUS))
          .order('data_inicio', { ascending: false })
          .limit(50);

      const { data, error } = await query;
      if (error) {
        console.error('[api/encontros/abertos][GET] erro supabase:', error);
        return sendError(
          res,
          502,
          'ERRO_LISTAR_ENCONTROS',
          adminScope ? 'Nao foi possivel carregar os encontros.' : 'Nao foi possivel carregar os encontros disponiveis.',
        );
      }

      const encontros = Array.isArray(data) ? data : [];
      res.setHeader('X-EAC-Source', 'supabase');
      return res.status(200).json({ success: true, message: 'Encontros carregados com sucesso.', data: encontros, encontros });
    }

    if (req.method === 'POST') {
      if (!adminScope) {
        return sendError(res, 403, 'FORBIDDEN', 'Escopo administrativo obrigatorio.');
      }

      const body = req.body ?? {};
      const nome = toCleanString(body?.nome);
      const status = toCleanString(body?.status).toUpperCase() || 'PLANEJADO';

      if (!nome) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Nome do encontro e obrigatorio.');
      }

      if (!WRITE_ALLOWED_STATUS.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Status do encontro invalido. Use PLANEJADO ou CANCELADO.');
      }

      const nowIso = new Date().toISOString();
      const payload = {
        id: randomUUID(),
        numero: toNullable(body?.numero),
        nome,
        data_inicio: toNullable(body?.data_inicio),
        data_fim: toNullable(body?.data_fim),
        local: toNullable(body?.local),
        status,
        observacoes: toNullable(body?.observacoes),
        criado_em: nowIso,
        atualizado_em: nowIso,
      };

      const { data, error } = await supabase.from(table).insert(payload).select('*').single();
      if (error) {
        console.error('[api/encontros/abertos][POST] erro supabase:', error);
        if (String(error.code || '') === '23514') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'A tabela encontros atualmente aceita apenas os status PLANEJADO e CANCELADO.');
        }
        return sendError(res, 502, 'ERRO_CRIAR_ENCONTRO', 'Nao foi possivel criar o encontro.');
      }

      return res.status(200).json({ success: true, message: 'Encontro criado com sucesso.', data });
    }

    if (req.method === 'PATCH') {
      if (!adminScope) {
        return sendError(res, 403, 'FORBIDDEN', 'Escopo administrativo obrigatorio.');
      }

      const body = req.body ?? {};
      const id = toCleanString(body?.id);
      const nome = toCleanString(body?.nome);
      const status = toCleanString(body?.status).toUpperCase();

      if (!id || !isValidUuid(id)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'ID do encontro invalido.');
      }
      if (!nome) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Nome do encontro e obrigatorio.');
      }
      if (!WRITE_ALLOWED_STATUS.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Status do encontro invalido. Use PLANEJADO ou CANCELADO.');
      }

      const payload = {
        numero: toNullable(body?.numero),
        nome,
        data_inicio: toNullable(body?.data_inicio),
        data_fim: toNullable(body?.data_fim),
        local: toNullable(body?.local),
        status,
        observacoes: toNullable(body?.observacoes),
        atualizado_em: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('[api/encontros/abertos][PATCH] erro supabase:', error);
        if (String(error.code || '') === '23514') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'A tabela encontros atualmente aceita apenas os status PLANEJADO e CANCELADO.');
        }
        return sendError(res, 502, 'ERRO_ATUALIZAR_ENCONTRO', 'Nao foi possivel atualizar o encontro.');
      }

      return res.status(200).json({ success: true, message: 'Encontro atualizado com sucesso.', data });
    }

    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido.');
  } catch (e: any) {
    console.error('[api/encontros/abertos] falha:', e);
    return sendError(res, 500, 'INTERNAL_ERROR', 'Erro interno.');
  }
}
