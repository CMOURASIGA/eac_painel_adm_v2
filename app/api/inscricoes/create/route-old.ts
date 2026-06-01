import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../utils/supabaseServer';

export const dynamic = 'force-dynamic';

const ENCONTRO_ALLOWED_STATUS = new Set(['ATIVO', 'PLANEJADO']);

function toCleanString(value: any) {
  return String(value ?? '').trim();
}

function normalizeDigits(value: any) {
  return String(value ?? '').replace(/\D/g, '');
}

function parseDateOnly(value: any): Date | null {
  const raw = toCleanString(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo, d, 12, 0, 0, 0));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt;
}

function calcAgeOnDate(birth: Date, on: Date) {
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const m = on.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function isTruthyBoolean(value: any) {
  if (value === true) return true;
  const s = toCleanString(value).toLowerCase();
  return ['1', 'true', 'sim', 's', 'yes', 'y', 'on'].includes(s);
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase não configurado.' }, { status: 500 });
    }

    const raw = await req.text();
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ success: false, error: 'Payload inválido: JSON malformado.' }, { status: 400 });
    }

    const id_encontro = toCleanString(body.id_encontro);
    const nome_adolescente = toCleanString(body.nome_adolescente);
    const data_nascimento_raw = toCleanString(body.data_nascimento);
    const telefone_adolescente = toCleanString(body.telefone_adolescente);
    const nome_responsavel = toCleanString(body.nome_responsavel);
    const telefone_responsavel = toCleanString(body.telefone_responsavel);
    const aceite_termos = isTruthyBoolean(body.aceite_termos);

    if (!id_encontro) return NextResponse.json({ success: false, error: 'Encontro obrigatório.' }, { status: 400 });
    if (!nome_adolescente) return NextResponse.json({ success: false, error: 'Nome do adolescente obrigatório.' }, { status: 400 });
    if (!data_nascimento_raw) return NextResponse.json({ success: false, error: 'Data de nascimento obrigatória.' }, { status: 400 });
    if (!telefone_adolescente) return NextResponse.json({ success: false, error: 'Telefone do adolescente obrigatório.' }, { status: 400 });
    if (!nome_responsavel) return NextResponse.json({ success: false, error: 'Nome do responsável obrigatório.' }, { status: 400 });
    if (!telefone_responsavel) return NextResponse.json({ success: false, error: 'Telefone do responsável obrigatório.' }, { status: 400 });
    if (!aceite_termos) return NextResponse.json({ success: false, error: 'É necessário aceitar os termos.' }, { status: 400 });

    const data_nascimento = parseDateOnly(data_nascimento_raw);
    if (!data_nascimento) return NextResponse.json({ success: false, error: 'Data de nascimento inválida.' }, { status: 400 });

    const encontrosTable = toCleanString(process.env.EAC_SUPABASE_TABLE_ENCONTROS) || 'encontros';
    const inscricoesTable = toCleanString(process.env.EAC_SUPABASE_TABLE_INSCRICOES) || 'inscricoes';

    const { data: encontro, error: encontroError } = await supabase
      .from(encontrosTable)
      .select('id,data_inicio,status')
      .eq('id', id_encontro)
      .maybeSingle();

    if (encontroError) {
      console.error('[app/api/inscricoes/create] erro encontro:', encontroError);
      return NextResponse.json({ success: false, error: 'Falha ao validar o encontro.' }, { status: 502 });
    }
    if (!encontro) return NextResponse.json({ success: false, error: 'Encontro não encontrado.' }, { status: 400 });

    const encontroStatus = toCleanString((encontro as any)?.status).toUpperCase();
    if (!ENCONTRO_ALLOWED_STATUS.has(encontroStatus)) {
      return NextResponse.json({ success: false, error: 'Encontro indisponível para inscrição.' }, { status: 400 });
    }

    const dataInicio = parseDateOnly((encontro as any)?.data_inicio) || new Date();
    const idade = calcAgeOnDate(data_nascimento, dataInicio);

    const telDigits = normalizeDigits(telefone_adolescente);
    const { data: existing } = await supabase
      .from(inscricoesTable)
      .select('id,id_encontro,nome_adolescente,data_nascimento,telefone_adolescente,status_inscricao,created_at')
      .eq('id_encontro', id_encontro)
      .or(
        [
          telDigits ? `telefone_adolescente.eq.${telefone_adolescente}` : null,
          telDigits ? `telefone_adolescente.ilike.%${telDigits}%` : null,
          `and(nome_adolescente.ilike.%${nome_adolescente}%,data_nascimento.eq.${data_nascimento_raw})`,
        ].filter(Boolean).join(',')
      )
      .limit(1);

    const firstExisting = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
    if (firstExisting) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        data: firstExisting,
        message: 'Inscrição já registrada. Em caso de dúvidas, aguarde o contato da equipe.',
      }, { status: 200 });
    }

    const payload = {
      id_encontro,
      nome_adolescente,
      data_nascimento: data_nascimento_raw,
      idade,
      telefone_adolescente,
      nome_responsavel,
      telefone_responsavel,
      bairro: toCleanString(body.bairro) || null,
      paroquia: toCleanString(body.paroquia) || null,
      participou_antes: isTruthyBoolean(body.participou_antes),
      observacoes: toCleanString(body.observacoes) || null,
      aceite_termos: true,
      status_inscricao: 'INSCRITO',
      origem_dado: 'SISTEMA',
      criado_via_sistema: true,
      data_inscricao: new Date().toISOString(),
    };

    const { data: created, error: createErr } = await supabase
      .from(inscricoesTable)
      .insert(payload)
      .select('*')
      .single();

    if (createErr) {
      console.error('[app/api/inscricoes/create] erro insert:', createErr);
      return NextResponse.json({ success: false, error: 'Não foi possível enviar sua inscrição agora.' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      data: created,
      message:
        'Inscrição recebida com sucesso! A equipe responsável irá revisar as informações e, se necessário, entrará em contato pelos telefones informados.',
    }, { status: 201 });
  } catch (e: any) {
    console.error('[app/api/inscricoes/create] falha:', e);
    return NextResponse.json({ success: false, error: 'Erro interno.' }, { status: 500 });
  }
}


