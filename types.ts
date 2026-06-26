// types.ts

// ========================
// NavegaÃ§Ã£o / Views
// ========================
export type View =
  | 'dashboard'
  | 'members'
  | 'inscricoes_prioritarias'
  | 'inscricoes_prioritarias_circulos'
  | 'visitacao'
  | 'inscricoes_review'
  | 'encontreiros'
  | 'presence'
  | 'dispatches'
  | 'calendar'
  | 'comunicados'
  | 'logs'
  | 'users'
  | 'settings'
  | 'help';

// ========================
// UsuÃ¡rios
// ========================
export type UserRole = 'ADMIN' | 'VIEWER';

export interface User {
  id?: string;
  email: string;
  name?: string;
  role: UserRole;

  // Campos usados no painel
  status?: 'Ativo' | 'Inativo' | string;
  permissions?: {
    canCreate: boolean;
    canEdit: boolean;
    canView: boolean;
    canDelete: boolean;
    allowedModules: View[];
    modulePermissions?: {
      [K in View]?: {
        canCreate: boolean;
        canEdit: boolean;
        canView: boolean;
        canDelete: boolean;
        canViewSensitive?: boolean;
      };
    };
  };
}

// ========================
// Dispatch / Disparos
// ========================
export interface Dispatch {
  id: string;
  name: string;
  type:
    | 'agradecimento_inscricao'
    | 'confirmacao_interesse_espera'
    | 'waitlist_non_enrolled'
    | 'comunicado_99_cadastro'
    | 'aniversariantes_dia'
    | 'eventos'
    | string;
  endpoint: string;
  method: 'GET' | 'POST' | string;
  shortDescription: string;
  detailedDescription: string;
  rules: string;
  parameters: string[];
  status: 'active' | 'inactive' | string;
  tags?: string[];
  emailPreview?: string;
}

// ========================
// Comunicados
// ========================
export interface Comunicado {
  id: string;
  titulo: string;
  assunto: string;
  corpo: string;
  status?: string;
  dataCriacao?: string;
  dataAgendada?: string;
  dataEventos?: string;
}

// ========================
// Sistema / Ajustes
// ========================
export interface SystemSettings {
  googleWebAppUrl: string;
  botUrl: string;
  chaveMestra: string;
}

// ========================
// Eventos (CalendÃ¡rio)
// ========================
export interface CalendarEvent {
  id?: string;
  atividade: string;
  tipo: string;
  inicio: string;
  termino: string;
  local: string;
  proprietario?: string;
  status?: string;
  encontroId?: string;
  origem_dado?: string;
  origemDado?: string;
  criado_via_sistema?: boolean;
  criadoViaSistema?: boolean;
  id_origem_planilha?: string;
  idOrigemPlanilha?: string;
  data_importacao?: string;
  dataImportacao?: string;
  ultima_sincronizacao?: string;
  ultimaSincronizacao?: string;
}

export interface Adolescente {
  id?: string;
  pessoa_id?: string;
  adolescente_id?: string;
  responsavel_id?: string;
  cadastro_oficial_id?: string;
  nome: string;
  email: string;
  telefone: string;
  bairro: string;
  nascimento?: string;
  endereco?: string;
  sexo?: string;
  responsavelNome?: string;
  responsavelTel?: string;
  responsavelEmail?: string;
  tempoParoquia?: string;
  participaGrupo?: string;
  motivacao?: string;
  expectativas?: string;
  autorizaImagem?: string;
  concordaNormas?: string;
  pertencePorciuncula?: string;
  whatsapp?: string;
  responsavel_nome?: string;
  responsavel_telefone?: string;
  responsavel_email?: string;
  eac_ja_fez?: string;
  eac_ja_fez_qual?: string;
  termos?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BairroStat {
  bairro: string;
  count: number;
}

export interface EncontreiroRecord {
  id: string;
  pessoaId?: string;
  rowNumber: number;
  timestamp?: any;
  nomeCompleto: string;
  dataNascimento?: string;
  idade?: string | number;
  email?: string;
  celularWhatsapp?: string;
  enderecoCompleto?: string;
  responsavelContato?: string;
  bairro?: string;
  frequentaMissas?: string;
  ondeMissas?: string;
  participaMovimento?: string;
  movimentoParoquia?: string;
  paroquiaFezEac?: string;
  jaTrabalhouEac?: string;
  jaCoordenouEquipe?: string;
  paisFizeramEncontro?: string;
  possuiAlergia?: string;
  tomaRemedio?: string;
  alimentacaoEspecial?: string;
  sugestaoUltimoEncontro?: string;
  dicaPosEncontro?: string;
  classificacao?: string;
  whatsappNormalizado?: string;
  whatsappLink?: string;
}

export interface PresenceRecord {
  id: string;
  rowNumber: number;
  nome: string;
  telefone: string;
  circulo?: string;
  encontroId?: string;
  encontroNome?: string;
  timestamp?: any;
  mes?: string;
  telCadastrado?: string;
  presente?: boolean;
}

export type VisitacaoStatus =
  | 'NENHUMA_ACAO'
  | 'CONTATO_INICIAL_FEITO'
  | 'VISITACAO_REALIZADA'
  | 'NAO_CONSEGUIU_CONTATO'
  | 'AGUARDANDO_RETORNO'
  | 'NAO_DESEJA_VISITA';

export type VisitacaoRespostaOpcao = 'SIM' | 'NAO' | 'NAO_INFORMADO';

export interface VisitacaoQuestionarioResposta {
  ja_participou_encontro: VisitacaoRespostaOpcao;
  batizado: VisitacaoRespostaOpcao;
  crismado: VisitacaoRespostaOpcao;
}

export interface VisitacaoPriorizado {
  inscricao_id: string;
  encontro_id?: string | null;
  encontro_nome?: string | null;
  encontro_numero?: string | number | null;
  adolescente_id?: string | null;
  pessoa_adolescente_id?: string | null;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  telefone_normalizado?: string | null;
  bairro?: string | null;
  data_nascimento?: string | null;
  idade?: number | null;
  sexo?: string | null;
  responsavel_nome?: string | null;
  responsavel_telefone?: string | null;
  responsavel_email?: string | null;
  data_cadastro?: string | null;
  status_inscricao?: string | null;
  origem_inscricao?: string | null;
  visitacao_id?: string | null;
  status_visitacao: VisitacaoStatus;
  contato_inicial_realizado: boolean;
  data_contato_inicial?: string | null;
  visitacao_realizada: boolean;
  data_visitacao?: string | null;
  responsavel_acao?: string | null;
  observacao?: string | null;
  respostas_questionario?: VisitacaoQuestionarioResposta | null;
  origem_registro?: string | null;
  atualizado_em?: string | null;
}

export interface VisitacaoIndicadores {
  total: number;
  nenhumaAcao: number;
  contatoInicialFeito: number;
  visitacaoRealizada: number;
  pendentesVisitacao: number;
  naoConseguiuContato: number;
  aguardandoRetorno: number;
  naoDesejaVisita: number;
}

export interface VisitacaoHistoricoItem {
  id: string;
  visitacao_id?: string | null;
  inscricao_id: string;
  tipo_acao: string;
  status_anterior?: string | null;
  status_novo?: string | null;
  descricao?: string | null;
  responsavel_acao?: string | null;
  respostas_questionario?: VisitacaoQuestionarioResposta | null;
  origem_registro?: string | null;
  criado_em: string;
}

export interface NonEnrolledMember {
  linhaOrigem: number;
  nome: string;
  email: string;
  telefone: string;
  bairro: string;
  dataCadastro?: string;

  // respostas do formulÃ¡rio (colunas I a O na aba "nÃ£o inscritos")
  interesseConfirmado?: string; // I
  jaFezEac?: string;           // J
  contatoMudou?: string;        // K
  recado?: string;              // L
  dataResposta?: string;        // M
  amigoParaFazer?: string;      // N
  nomeDoAmigo?: string;         // O
  statusPreConfirmacao?: string; // P
}

/**
 * IMPORTANTE:
 * LogStatus precisa existir no runtime (nÃ£o pode ser sÃ³ "type"),
 * porque tem arquivo importando como valor.
 */
export enum LogStatus {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
  NO_DATA = "NO_DATA",
  WARNING = "WARNING",
  ERROR = "ERROR"
}

export interface Log {
  id: string;
  dispatchId: string;
  dispatchName: string;
  operator: string;
  timestamp: string;
  duration: number;
  status: LogStatus;
  responseSummary: string;
  modulo?: string;
  tipo?: string;
}

export interface LogEntry {
  timestamp: string; // ISO
  status: LogStatus;
  message: string;
  context?: any;
}

