import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSupabaseAction } from '../utils/supabaseActions.js';
import { isSupabaseConfigured } from '../utils/supabaseServer.js';

/**
 * Endpoint dedicado (nao passa pelo dispatcher generico de utils/supabaseActions.ts)
 * que cruza a base de encontristas (acao GET_MEMBERS, ja lida sempre do Supabase/main)
 * com a base de encontreiros (acao GET_ENCONTREIROS) para apontar quem ainda nao tem
 * registro correspondente em `encontreiros` e quem tem registro com dados divergentes
 * do cadastro de origem.
 */

type AuditStatus = 'OK' | 'DIVERGENTE' | 'FALTANDO';

const cleanText = (value: any) => String(value ?? '').trim();
const normalizeDigits = (value: any) => String(value ?? '').replace(/\D/g, '');
const normalizeNameKey = (value: any) =>
  cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const pickFirst = (row: any, keys: string[]) => {
  for (const key of keys) {
    if (!row) continue;
    const val = row[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') return val;
  }
  return '';
};

function sendError(res: NextApiResponse, status: number, error: string, message?: string) {
  return res.status(status).json({ success: false, error, message: message || error });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendError(res, 405, 'Metodo nao permitido.');
  }

  try {
    const [membersRes, encontreirosRes] = await Promise.all([
      handleSupabaseAction('GET_MEMBERS', {}),
      handleSupabaseAction('GET_ENCONTREIROS', { includeSensitive: false }),
    ]);

    if (!membersRes.ok || !encontreirosRes.ok) {
      const firstError = (!membersRes.ok && membersRes.error) || (!encontreirosRes.ok && encontreirosRes.error) || 'Falha ao carregar dados para auditoria.';
      return sendError(res, isSupabaseConfigured() ? 502 : 500, String(firstError));
    }

    const encontristas = Array.isArray((membersRes.data as any)?.members) ? (membersRes.data as any).members : [];
    const encontreiros = Array.isArray((encontreirosRes.data as any)?.encontreiros) ? (encontreirosRes.data as any).encontreiros : [];

    const byPessoaId = new Map<string, any>();
    const byPhone = new Map<string, any>();
    const byEmail = new Map<string, any>();
    const byName = new Map<string, any>();

    encontreiros.forEach((enc: any) => {
      const pessoaId = cleanText(enc.pessoaId);
      if (pessoaId && !byPessoaId.has(pessoaId)) byPessoaId.set(pessoaId, enc);
      const phoneDigits = normalizeDigits(enc.celularWhatsapp);
      if (phoneDigits && !byPhone.has(phoneDigits)) byPhone.set(phoneDigits, enc);
      const emailKey = cleanText(enc.email).toLowerCase();
      if (emailKey && !byEmail.has(emailKey)) byEmail.set(emailKey, enc);
      const nameKey = normalizeNameKey(enc.nomeCompleto);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, enc);
    });

    const rows = encontristas
      .map((m: any) => {
        const nome = cleanText(pickFirst(m, ['nome', 'nome_completo', 'nomeCompleto']));
        if (!nome) return null;

        const pessoaId = cleanText(pickFirst(m, ['pessoa_id', 'pessoaId']));
        const telefone = cleanText(pickFirst(m, ['telefone', 'whatsapp', 'celularWhatsapp', 'celular_whatsapp']));
        const email = cleanText(pickFirst(m, ['email']));
        const bairro = cleanText(pickFirst(m, ['bairro']));
        const dataNascimento = cleanText(pickFirst(m, ['nascimento', 'dataNascimento', 'data_nascimento']));
        const idade = cleanText(pickFirst(m, ['idade']));

        let match: any = null;
        let matchType: 'PESSOA_ID' | 'TELEFONE' | 'EMAIL' | 'NOME' | null = null;

        if (pessoaId && byPessoaId.has(pessoaId)) {
          match = byPessoaId.get(pessoaId);
          matchType = 'PESSOA_ID';
        }
        if (!match) {
          const phoneDigits = normalizeDigits(telefone);
          if (phoneDigits && byPhone.has(phoneDigits)) {
            match = byPhone.get(phoneDigits);
            matchType = 'TELEFONE';
          }
        }
        if (!match) {
          const emailKey = email.toLowerCase();
          if (emailKey && byEmail.has(emailKey)) {
            match = byEmail.get(emailKey);
            matchType = 'EMAIL';
          }
        }
        if (!match) {
          const nameKey = normalizeNameKey(nome);
          if (nameKey && byName.has(nameKey)) {
            match = byName.get(nameKey);
            matchType = 'NOME';
          }
        }

        const camposDivergentes: string[] = [];
        if (match) {
          const matchPessoaId = cleanText(match.pessoaId);
          if (pessoaId && matchPessoaId && pessoaId !== matchPessoaId) camposDivergentes.push('pessoa_id');
          if (pessoaId && !matchPessoaId) camposDivergentes.push('pessoa_id_ausente_no_encontreiro');
          if (email && cleanText(match.email) && email.toLowerCase() !== cleanText(match.email).toLowerCase()) {
            camposDivergentes.push('email');
          }
          if (telefone && normalizeDigits(match.celularWhatsapp) && normalizeDigits(telefone) !== normalizeDigits(match.celularWhatsapp)) {
            camposDivergentes.push('celularWhatsapp');
          }
          if (bairro && cleanText(match.bairro) && normalizeNameKey(bairro) !== normalizeNameKey(match.bairro)) {
            camposDivergentes.push('bairro');
          }
          if (dataNascimento && cleanText(match.dataNascimento) && dataNascimento !== cleanText(match.dataNascimento)) {
            camposDivergentes.push('dataNascimento');
          }
        }

        const status: AuditStatus = !match
          ? 'FALTANDO'
          : (matchType !== 'PESSOA_ID' || camposDivergentes.length > 0)
            ? 'DIVERGENTE'
            : 'OK';

        return {
          pessoaId,
          encontristaId: cleanText(pickFirst(m, ['cadastro_oficial_id', 'id'])),
          nome,
          email,
          telefone,
          bairro,
          dataNascimento,
          idade,
          status,
          matchType,
          encontreiroId: match ? cleanText(match.id) : null,
          encontreiroPessoaId: match ? cleanText(match.pessoaId) : null,
          camposDivergentes,
          encontreiro: match || null,
        };
      })
      .filter(Boolean) as any[];

    rows.sort((a, b) => {
      const rank = (s: string) => (s === 'FALTANDO' ? 0 : s === 'DIVERGENTE' ? 1 : 2);
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      return cleanText(a.nome).localeCompare(cleanText(b.nome), 'pt-BR');
    });

    const resumo = {
      totalEncontristas: rows.length,
      totalEncontreiros: encontreiros.length,
      vinculados: rows.filter((r) => r.status === 'OK').length,
      divergentes: rows.filter((r) => r.status === 'DIVERGENTE').length,
      faltando: rows.filter((r) => r.status === 'FALTANDO').length,
    };

    res.setHeader('X-EAC-Backend', 'supabase');
    res.setHeader('X-EAC-Endpoint', 'encontristas-encontreiros-auditoria');
    return res.status(200).json({
      success: true,
      source: 'supabase',
      message: 'Auditoria de encontristas x encontreiros carregada com sucesso.',
      rows,
      resumo,
    });
  } catch (error: any) {
    console.error('[api/encontristas-encontreiros-auditoria] falha:', error);
    return sendError(res, 500, error?.message || 'Erro interno.');
  }
}
