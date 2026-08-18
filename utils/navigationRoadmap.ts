import type { View } from '../types';

export type NavigationItem = {
  label: string;
  view: View;
  enabled: boolean;
  description?: string;
};

export type NavigationGroup = {
  id: string;
  label: string;
  hubView: View;
  description: string;
  items: NavigationItem[];
};

// Itens que ficam soltos no menu, fora de qualquer macro-rotina.
export const STANDALONE_ITEMS: NavigationItem[] = [
  { label: 'Início', view: 'dashboard', enabled: true },
];

// Menu agrupado em macro-rotinas: cada grupo tem uma tela de entrada
// (hubView) com os cards das rotinas que pertencem a ele.
//
// "Distribuição de Círculos" (inscricoes_prioritarias_circulos) foi
// deixada de fora de propósito: ela já abre de dentro de "Inscrições
// Prioritárias" (botão onOpenCirculos em App.tsx) e não precisa ser um
// item de menu à parte.
export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: 'pessoas',
    label: 'Pessoas',
    hubView: 'pessoas_hub',
    description: 'Do preenchimento da inscrição até virar encontrista: triagem, priorização e acompanhamento.',
    items: [
      { label: 'Triagem de Inscrições', view: 'inscricoes_review', enabled: true, description: 'Primeira análise de quem se inscreveu.' },
      { label: 'Inscrições Prioritárias', view: 'inscricoes_prioritarias', enabled: true, description: 'Fila priorizada rumo à confirmação. A Distribuição de Círculos abre a partir daqui.' },
      { label: 'Visitação', view: 'visitacao', enabled: true, description: 'Acompanhamento de quem está na fila priorizada.' },
      { label: 'Cadastro de Encontrista', view: 'members', enabled: true, description: 'Quem já foi confirmado — visualizar, editar, excluir.' },
    ],
  },
  {
    id: 'encontros',
    label: 'Encontros',
    hubView: 'encontros_hub',
    description: 'Cada edição do EAC: datas, equipe de encontreiros e presença.',
    items: [
      { label: 'Encontros', view: 'encontros', enabled: true, description: 'Cadastro das edições — datas, local, status.' },
      { label: 'Equipes', view: 'equipes', enabled: true, description: 'Monta as equipes de encontreiros por edição.' },
      { label: 'Cadastro de Encontreiro', view: 'encontreiros', enabled: true, description: 'Base de voluntários da equipe.' },
      { label: 'Presença', view: 'presence', enabled: true, description: 'Controle de presença por círculo e encontro.' },
    ],
  },
  {
    id: 'comunicacao',
    label: 'Comunicação',
    hubView: 'comunicacao_hub',
    description: 'O que sai do painel pra fora: disparos, comunicados e agenda.',
    items: [
      { label: 'Comunicados', view: 'comunicados', enabled: true, description: 'Mensagens e avisos publicados.' },
      { label: 'Disparos', view: 'dispatches', enabled: true, description: 'Execução de envios em massa.' },
      { label: 'Calendário', view: 'calendar', enabled: true, description: 'Agenda pública de eventos.' },
    ],
  },
  {
    id: 'gestao',
    label: 'Gestão',
    hubView: 'gestao_hub',
    description: 'Administração do próprio sistema: acesso, histórico e ajustes.',
    items: [
      { label: 'Usuários', view: 'users', enabled: true, description: 'Quem acessa o painel e com quais permissões.' },
      { label: 'Logs', view: 'logs', enabled: true, description: 'Histórico de operações do sistema.' },
      { label: 'Ajustes', view: 'settings', enabled: true, description: 'Configuração de integrações e cadastro de encontros.' },
      { label: 'Ajuda', view: 'help', enabled: true, description: 'Manual do operador.' },
    ],
  },
];

// Lista plana, mantida por compatibilidade: isViewEnabledInRoadmap,
// handleNavigate (App.tsx) e a validação do parâmetro ?view= todos esperam
// um array simples de { view, enabled }. Inclui os itens soltos, as telas de
// entrada dos grupos (hubs) e os itens de dentro de cada grupo.
export const NAVIGATION_ROADMAP: NavigationItem[] = [
  ...STANDALONE_ITEMS,
  ...NAVIGATION_GROUPS.map((group) => ({ label: group.label, view: group.hubView, enabled: true, description: group.description })),
  ...NAVIGATION_GROUPS.flatMap((group) => group.items),
];

export const isViewEnabledInRoadmap = (view: View) =>
  NAVIGATION_ROADMAP.some((item) => item.view === view && item.enabled);

// Regra de permissão por módulo — fonte única usada tanto pelo menu (Header)
// quanto pelos guards de rota (App.tsx), pra não duplicar a lógica em dois
// lugares e correr o risco de um ficar desatualizado em relação ao outro.
export function canAccessView(view: View, isAdmin: boolean, allowedModules: string[]): boolean {
  if (isAdmin) return true;
  const allowed = allowedModules || [];
  switch (view) {
    case 'dashboard': return true;
    case 'members': return allowed.includes('members');
    case 'inscricoes_prioritarias': return allowed.includes('inscricoes_prioritarias');
    case 'inscricoes_prioritarias_circulos': return allowed.includes('inscricoes_prioritarias_circulos');
    case 'visitacao': return allowed.includes('visitacao');
    case 'inscricoes_review': return allowed.includes('inscricoes_review');
    case 'encontreiros': return allowed.includes('encontreiros');
    case 'encontros': return allowed.includes('encontros') || allowed.includes('settings');
    case 'equipes': return allowed.includes('equipes') || allowed.includes('encontreiros');
    case 'presence': return allowed.includes('presence');
    case 'dispatches': return allowed.includes('dispatches');
    case 'calendar': return allowed.includes('calendar');
    case 'comunicados': return allowed.includes('comunicados');
    case 'logs': return allowed.includes('logs');
    case 'users': return allowed.includes('users');
    case 'settings': return allowed.includes('settings');
    case 'help': return allowed.includes('help');
    default: return false;
  }
}

export function groupHasAccess(group: NavigationGroup, isAdmin: boolean, allowedModules: string[]): boolean {
  return group.items.some((item) => canAccessView(item.view, isAdmin, allowedModules));
}

export function visibleGroupItems(group: NavigationGroup, isAdmin: boolean, allowedModules: string[]): NavigationItem[] {
  return group.items.filter((item) => item.enabled && canAccessView(item.view, isAdmin, allowedModules));
}
