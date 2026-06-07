import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../../utils/supabaseActions.js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
  }

  try {
    const body = req.body ?? {};
    const nomeCompleto = String(body?.nomeCompleto || '').trim();
    const celularWhatsapp = String(body?.celularWhatsapp || '').trim();
    const bairro = String(body?.bairro || '').trim();
    const aceiteTermos = Boolean(body?.aceite_termos);

    const fieldErrors: Record<string, string> = {};
    if (!nomeCompleto) fieldErrors.nomeCompleto = 'Nome completo é obrigatório.';
    if (!celularWhatsapp) fieldErrors.celularWhatsapp = 'Celular / WhatsApp é obrigatório.';
    if (!bairro) fieldErrors.bairro = 'Bairro é obrigatório.';
    if (!aceiteTermos) fieldErrors.aceite_termos = 'Aceite dos termos é obrigatório.';

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Dados obrigatórios não informados.',
        fields: fieldErrors,
      });
    }

    const result = await handleSupabaseAction('SAVE_ENCONTREIRO', body);
    if (!result.ok) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: result.error || 'Erro ao salvar cadastro.',
      });
    }

    if (!result.data?.success) {
      return res.status(400).json({
        success: false,
        error: 'SAVE_FAILED',
        message: String(result.data?.error || 'Não foi possível salvar cadastro.'),
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cadastro recebido com sucesso! Em breve a coordenação entrará em contato.',
      data: result.data?.data || null,
      email_confirmacao: result.data?.email_confirmacao || null,
    });
  } catch (e: any) {
    console.error('[api/encontreiros/create] falha:', e);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Erro interno.' });
  }
}
