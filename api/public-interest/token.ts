import type { NextApiRequest, NextApiResponse } from 'next';
import { consumePublicInterestToken, issuePublicInterestToken, validatePublicInterestToken } from '../../utils/publicInterestToken';

function send(res: NextApiResponse, status: number, body: any) {
  return res.status(status).json(body);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Metodo nao permitido.' });

  const action = String(req.body?.action || '').trim();

  if (action === 'ISSUE_TOKEN') {
    const out = await issuePublicInterestToken({
      email: req.body?.email,
      pessoaId: req.body?.pessoaId,
      inscricaoId: req.body?.inscricaoId,
      payload: req.body?.payload,
      createdBy: req.body?.createdBy,
    });
    return send(res, out.success ? 200 : 400, out);
  }

  if (action === 'VALIDATE_TOKEN') {
    const out = await validatePublicInterestToken(String(req.body?.token || ''));
    return send(res, out.success ? 200 : 400, out);
  }

  if (action === 'CONSUME_TOKEN') {
    const out = await consumePublicInterestToken(String(req.body?.token || ''), {
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      payload: req.body?.payload || {},
    });
    return send(res, out.success ? 200 : 400, out);
  }

  return send(res, 400, { success: false, error: 'Acao invalida.' });
}
