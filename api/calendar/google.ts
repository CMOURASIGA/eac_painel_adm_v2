import type { NextApiRequest, NextApiResponse } from 'next';
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(503).json({success:false,error:'Integração em homologação; autenticação ainda não habilitada.'});
}
