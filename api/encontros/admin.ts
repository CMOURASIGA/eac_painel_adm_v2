import { randomUUID } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServerClient } from '../../utils/supabaseServer.js';

const WRITE_ALLOWED_STATUS = new Set(['PLANEJADO', 'ATIVO', 'ENCERRADO', 'CANCELADO']);

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

function readTableName() {
  return toCleanString(process.env.EAC_SUPABASE_TABLE_ENCONTROS) || 'encontros';
}

function sendError(res: NextApiResponse, status: number, error: string, message?: string) {
  return res.status(status).json({ success: false, error, message: message || error });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return sendError(res, 500, 'SUPABASE_NOT_CONFIGURED', 'Supabase nao configurado.');
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from(readTableName())
        .select('id,numero,nome,data_inicio,data_fim,local,status,observacoes,criado_em,atualizado_em')
        .order('data_inicio', { ascending: false })
        .limit(200);

      if (error) {
        console.error('[api/encontros/admin][GET] erro supabase:', error);
        return sendError(res, 502, 'ERRO_LISTAR_ENCONTROS', 'Nao foi possivel carregar os encontros.');
      }

      return res.status(200).json({
        success: true,
        message: 'Encontros carregados com sucesso.',
        data: Array.isArray(data) ? data : [],
      });
    } catch (e: any) {
      console.error('[api/encontros/admin][GET] falha:', e);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao carregar encontros.');
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body ?? {};
      const nome = toCleanString(body?.nome);
      const status = toCleanString(body?.status).toUpperCase() || 'PLANEJADO';

      if (!nome) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Nome do encontro e obrigatorio.');
      }

      if (!WRITE_ALLOWED_STATUS.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Status do encontro invalido.');
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

      const { data, error } = await supabase.from(readTableName()).insert(payload).select('*').single();
      if (error) {
        console.error('[api/encontros/admin][POST] erro supabase:', error);
        return sendError(res, 502, 'ERRO_CRIAR_ENCONTRO', 'Nao foi possivel criar o encontro.');
      }

      return res.status(200).json({ success: true, message: 'Encontro criado com sucesso.', data });
    } catch (e: any) {
      console.error('[api/encontros/admin][POST] falha:', e);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao criar encontro.');
    }
  }

  if (req.method === 'PATCH') {
    try {
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
        return sendError(res, 400, 'VALIDATION_ERROR', 'Status do encontro invalido.');
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
        .from(readTableName())
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('[api/encontros/admin][PATCH] erro supabase:', error);
        return sendError(res, 502, 'ERRO_ATUALIZAR_ENCONTRO', 'Nao foi possivel atualizar o encontro.');
      }

      return res.status(200).json({ success: true, message: 'Encontro atualizado com sucesso.', data });
    } catch (e: any) {
      console.error('[api/encontros/admin][PATCH] falha:', e);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao atualizar encontro.');
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido.');
}
