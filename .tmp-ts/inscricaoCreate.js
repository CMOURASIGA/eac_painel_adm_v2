const ENCONTRO_ALLOWED_STATUS = new Set(['ATIVO', 'PLANEJADO']);
const REQUIRED_MESSAGES = {
    id_encontro: 'Selecione um encontro válido para realizar a inscrição.',
    nome_adolescente: 'Informe o nome completo do adolescente.',
    data_nascimento: 'Informe uma data de nascimento válida.',
    telefone_adolescente: 'Informe um telefone válido do adolescente.',
    nome_responsavel: 'Informe o nome do responsável.',
    telefone_responsavel: 'Informe um telefone válido do responsável.',
    aceite_termos: 'É necessário aceitar os termos para enviar a inscrição.',
};
export function normalizarTexto(valor) {
    return String(valor ?? '').trim().replace(/\s+/g, ' ');
}
export function normalizarNome(valor) {
    return normalizarTexto(valor);
}
function somenteDigitos(value) {
    return String(value ?? '').replace(/\D/g, '');
}
export function normalizarTelefoneBR(value) {
    let digits = somenteDigitos(value);
    if (digits.startsWith('55') && digits.length >= 12) {
        return digits;
    }
    if (digits.length === 10 || digits.length === 11) {
        return `55${digits}`;
    }
    return digits;
}
function temSomenteZeros(digits) {
    return !!digits && /^0+$/.test(digits);
}
export function validarTelefoneBR(valor) {
    const normalized = normalizarTelefoneBR(valor);
    if (!/^\d+$/.test(normalized))
        return false;
    if (temSomenteZeros(normalized))
        return false;
    if (normalized.startsWith('55')) {
        const national = normalized.slice(2);
        return national.length === 10 || national.length === 11;
    }
    return false;
}
function parseDateOnly(value) {
    const raw = normalizarTexto(value);
    if (!raw)
        return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m)
        return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo, d, 12, 0, 0, 0));
    if (isNaN(dt.getTime()))
        return null;
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d)
        return null;
    return dt;
}
export function validarDataNascimento(valor) {
    const dt = parseDateOnly(valor);
    if (!dt)
        return false;
    const now = new Date();
    return dt.getTime() <= now.getTime();
}
export function validarUuid(valor) {
    const raw = normalizarTexto(valor);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}
function nomeValido(nome) {
    if (!nome)
        return false;
    const usefulLen = nome.replace(/\s/g, '').length;
    if (usefulLen < 5)
        return false;
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(nome))
        return false;
    if (/^[\d\s]+$/.test(nome))
        return false;
    if (/^[^A-Za-zÀ-ÖØ-öø-ÿ\d]+$/.test(nome))
        return false;
    return nome.split(' ').filter(Boolean).length >= 2 || usefulLen >= 5;
}
export function validarPayloadInscricao(payload) {
    const normalized = {
        id_encontro: normalizarTexto(payload.id_encontro),
        nome_adolescente: normalizarNome(payload.nome_adolescente),
        data_nascimento: normalizarTexto(payload.data_nascimento),
        telefone_adolescente: normalizarTelefoneBR(payload.telefone_adolescente),
        nome_responsavel: normalizarNome(payload.nome_responsavel),
        telefone_responsavel: normalizarTelefoneBR(payload.telefone_responsavel),
        aceite_termos: payload.aceite_termos === true,
        bairro: normalizarTexto(payload.bairro) || null,
        paroquia: normalizarTexto(payload.paroquia) || null,
        email_adolescente: normalizarTexto(payload.email_adolescente) || null,
        email_responsavel: normalizarTexto(payload.email_responsavel) || null,
        endereco: normalizarTexto(payload.endereco) || null,
        observacoes: normalizarTexto(payload.observacoes) || null,
        motivacao: normalizarTexto(payload.motivacao) || null,
        expectativas: normalizarTexto(payload.expectativas) || null,
        grau_parentesco: normalizarTexto(payload.grau_parentesco) || null,
        participou_antes: payload.participou_antes === true,
        autorizacao_imagem: payload.autorizacao_imagem === true,
    };
    const fields = {};
    if (!normalized.id_encontro || !validarUuid(normalized.id_encontro)) {
        fields.id_encontro = REQUIRED_MESSAGES.id_encontro;
    }
    if (!nomeValido(normalized.nome_adolescente)) {
        fields.nome_adolescente = REQUIRED_MESSAGES.nome_adolescente;
    }
    if (!validarDataNascimento(normalized.data_nascimento)) {
        fields.data_nascimento = REQUIRED_MESSAGES.data_nascimento;
    }
    if (!validarTelefoneBR(normalized.telefone_adolescente)) {
        fields.telefone_adolescente = REQUIRED_MESSAGES.telefone_adolescente;
    }
    if (!nomeValido(normalized.nome_responsavel)) {
        fields.nome_responsavel = REQUIRED_MESSAGES.nome_responsavel;
    }
    if (!validarTelefoneBR(normalized.telefone_responsavel)) {
        fields.telefone_responsavel = REQUIRED_MESSAGES.telefone_responsavel;
    }
    if (!normalized.aceite_termos) {
        fields.aceite_termos = REQUIRED_MESSAGES.aceite_termos;
    }
    return { normalized, fields };
}
function calcAgeOnDate(birth, on) {
    let age = on.getUTCFullYear() - birth.getUTCFullYear();
    const m = on.getUTCMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate()))
        age -= 1;
    return age;
}
async function findExistingInscricao(supabase, encontroId, adolescenteNome, dataNascimento, telefoneNormalizado) {
    const nomeNormalizado = normalizarNome(adolescenteNome);
    const { data: pessoasTelefone, error: erroTelefone } = await supabase
        .from('pessoas')
        .select('id')
        .eq('telefone_normalizado', telefoneNormalizado);
    if (erroTelefone)
        throw erroTelefone;
    const { data: pessoasNomeNasc, error: erroNomeNasc } = await supabase
        .from('pessoas')
        .select('id')
        .eq('nome_normalizado', nomeNormalizado)
        .eq('data_nascimento', dataNascimento);
    if (erroNomeNasc)
        throw erroNomeNasc;
    const pessoaIds = Array.from(new Set([...(pessoasTelefone ?? []).map((p) => p.id), ...(pessoasNomeNasc ?? []).map((p) => p.id)]));
    if (pessoaIds.length === 0)
        return null;
    const { data: adolescentes, error: erroAdolescentes } = await supabase
        .from('adolescentes')
        .select('id')
        .in('pessoa_id', pessoaIds);
    if (erroAdolescentes)
        throw erroAdolescentes;
    const adolescenteIds = (adolescentes ?? []).map((a) => a.id);
    if (adolescenteIds.length === 0)
        return null;
    const { data: inscricoes, error: erroInscricoes } = await supabase
        .from('inscricoes')
        .select('id, adolescente_id, encontro_id, status, origem_dado, criado_via_sistema, data_inscricao')
        .eq('encontro_id', encontroId)
        .in('adolescente_id', adolescenteIds)
        .limit(1);
    if (erroInscricoes)
        throw erroInscricoes;
    return Array.isArray(inscricoes) && inscricoes.length > 0 ? inscricoes[0] : null;
}
export async function executeInscricaoCreate(params) {
    const { supabase, body } = params;
    if (!supabase) {
        return { status: 500, body: { success: false, error: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase não configurado.' } };
    }
    const { normalized, fields } = validarPayloadInscricao(body ?? {});
    if (Object.keys(fields).length > 0) {
        return {
            status: 400,
            body: {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Existem campos obrigatórios pendentes.',
                fields,
            },
        };
    }
    const nascimento = parseDateOnly(normalized.data_nascimento);
    if (!nascimento) {
        return {
            status: 400,
            body: {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Existem campos obrigatórios pendentes.',
                fields: { data_nascimento: REQUIRED_MESSAGES.data_nascimento },
            },
        };
    }
    const { data: encontro, error: encontroError } = await supabase
        .from('encontros')
        .select('id, data_inicio, status')
        .eq('id', normalized.id_encontro)
        .maybeSingle();
    if (encontroError || !encontro) {
        return {
            status: 400,
            body: {
                success: false,
                error: 'ENCONTRO_INVALIDO',
                message: REQUIRED_MESSAGES.id_encontro,
            },
        };
    }
    const statusEncontro = normalizarTexto(encontro.status).toUpperCase();
    if (!ENCONTRO_ALLOWED_STATUS.has(statusEncontro)) {
        return {
            status: 400,
            body: {
                success: false,
                error: 'ENCONTRO_INVALIDO',
                message: REQUIRED_MESSAGES.id_encontro,
            },
        };
    }
    const dataInicio = parseDateOnly(encontro.data_inicio);
    if (!dataInicio) {
        return {
            status: 400,
            body: {
                success: false,
                error: 'ENCONTRO_SEM_DATA_INICIO',
                message: 'O encontro selecionado não possui data de início configurada.',
            },
        };
    }
    if (nascimento.getTime() > dataInicio.getTime()) {
        return {
            status: 400,
            body: {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Existem campos obrigatórios pendentes.',
                fields: {
                    data_nascimento: 'A data de nascimento não pode ser posterior à data do encontro.',
                },
            },
        };
    }
    const idade = calcAgeOnDate(nascimento, dataInicio);
    let duplicate = null;
    try {
        duplicate = await findExistingInscricao(supabase, normalized.id_encontro, normalized.nome_adolescente, normalized.data_nascimento, normalized.telefone_adolescente);
    }
    catch (e) {
        console.error('[inscricaoCreate] erro ao verificar duplicidade:', e);
        return { status: 502, body: { success: false, error: 'DUPLICATE_CHECK_FAILED', message: 'Não foi possível concluir a validação da inscrição.' } };
    }
    if (duplicate) {
        return {
            status: 200,
            body: {
                success: true,
                duplicate: true,
                data: duplicate,
                message: 'Inscrição já registrada. Em caso de dúvidas, aguarde o contato da equipe.',
            },
        };
    }
    const nowIso = new Date().toISOString();
    const { data: pessoaAdolescente, error: pessoaAdolescenteError } = await supabase
        .from('pessoas')
        .insert({
        nome_completo: normalized.nome_adolescente,
        nome_normalizado: normalizarNome(normalized.nome_adolescente),
        data_nascimento: normalized.data_nascimento,
        idade_calculada: idade,
        telefone: normalized.telefone_adolescente,
        telefone_normalizado: normalized.telefone_adolescente,
        bairro: normalized.bairro,
        origem_dado: 'SISTEMA',
        criado_via_sistema: true,
        data_importacao: nowIso,
    })
        .select('id')
        .single();
    if (pessoaAdolescenteError) {
        return { status: 502, body: { success: false, error: 'CREATE_PESSOA_ADOLESCENTE_FAILED', message: 'Não foi possível concluir a inscrição.' } };
    }
    const { data: adolescente, error: adolescenteError } = await supabase
        .from('adolescentes')
        .insert({
        pessoa_id: pessoaAdolescente.id,
        aceite_normas: true,
        ja_fez_eac: normalized.participou_antes,
        origem_dado: 'SISTEMA',
        criado_via_sistema: true,
        data_importacao: nowIso,
    })
        .select('id')
        .single();
    if (adolescenteError) {
        return { status: 502, body: { success: false, error: 'CREATE_ADOLESCENTE_FAILED', message: 'Não foi possível concluir a inscrição.' } };
    }
    const { data: pessoaResponsavel, error: pessoaResponsavelError } = await supabase
        .from('pessoas')
        .insert({
        nome_completo: normalized.nome_responsavel,
        nome_normalizado: normalizarNome(normalized.nome_responsavel),
        telefone: normalized.telefone_responsavel,
        telefone_normalizado: normalized.telefone_responsavel,
        origem_dado: 'SISTEMA',
        criado_via_sistema: true,
        data_importacao: nowIso,
    })
        .select('id')
        .single();
    if (pessoaResponsavelError) {
        return { status: 502, body: { success: false, error: 'CREATE_PESSOA_RESPONSAVEL_FAILED', message: 'Não foi possível concluir a inscrição.' } };
    }
    const { data: responsavel, error: responsavelError } = await supabase
        .from('responsaveis')
        .insert({
        pessoa_id: pessoaResponsavel.id,
        nome: normalized.nome_responsavel,
        telefone: normalized.telefone_responsavel,
        telefone_normalizado: normalized.telefone_responsavel,
        origem_dado: 'SISTEMA',
        criado_via_sistema: true,
        data_importacao: nowIso,
    })
        .select('id')
        .single();
    if (responsavelError) {
        return { status: 502, body: { success: false, error: 'CREATE_RESPONSAVEL_FAILED', message: 'Não foi possível concluir a inscrição.' } };
    }
    const { data: vinculo, error: vinculoError } = await supabase
        .from('adolescente_responsaveis')
        .insert({
        adolescente_id: adolescente.id,
        responsavel_id: responsavel.id,
        principal: true,
        grau_parentesco: normalized.grau_parentesco || 'Pai/Mãe',
        origem_dado: 'SISTEMA',
        criado_via_sistema: true,
        data_importacao: nowIso,
    })
        .select('id')
        .single();
    if (vinculoError) {
        return { status: 502, body: { success: false, error: 'CREATE_VINCULO_FAILED', message: 'Não foi possível concluir a inscrição.' } };
    }
    const { data: inscricao, error: inscricaoError } = await supabase
        .from('inscricoes')
        .insert({
        encontro_id: normalized.id_encontro,
        adolescente_id: adolescente.id,
        status: 'INSCRITO',
        origem_dado: 'SISTEMA',
        criado_via_sistema: true,
        data_inscricao: nowIso,
        criado_em: nowIso,
        atualizado_em: nowIso,
    })
        .select('*')
        .single();
    if (inscricaoError) {
        return { status: 502, body: { success: false, error: 'CREATE_INSCRICAO_FAILED', message: 'Não foi possível concluir a inscrição.' } };
    }
    return {
        status: 201,
        body: {
            success: true,
            data: {
                inscricao_id: inscricao.id,
                adolescente_id: adolescente.id,
                pessoa_adolescente_id: pessoaAdolescente.id,
                responsavel_id: responsavel.id,
                pessoa_responsavel_id: pessoaResponsavel.id,
                vinculo_id: vinculo.id,
            },
            message: 'Inscrição recebida com sucesso! A equipe responsável irá revisar as informações e, se necessário, entrará em contato pelos telefones informados.',
        },
    };
}
