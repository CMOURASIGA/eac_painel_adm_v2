// types.ts

// ========================
// NavegaÃ§Ã£o / Views
// ========================
export type View =
  | 'dashboard'
  | 'members'
  | 'inscricoes_prioritarias'
  | 'inscricoes_prioritarias_circulos'
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
}

export interface Adolescente {
  id?: string;
  nome: string;
  email: string;
  telefone: string;
  bairro: string;
  nascimento?: string;
  endereco?: string;
  sexo?: string;
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

