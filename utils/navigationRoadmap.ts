import type { View } from '../types';

export type NavigationItem = {
  label: string;
  view: View;
  enabled: boolean;
};

// Roadmap de menu: manter código no projeto e liberar no menu conforme evolução das US.
export const NAVIGATION_ROADMAP: NavigationItem[] = [
  { label: 'Início', view: 'dashboard', enabled: true },
  { label: 'Cadastro de Encontrista', view: 'members', enabled: true },
  { label: 'Inscrições Prioritárias', view: 'inscricoes_prioritarias', enabled: true },
  { label: 'Triagem de Inscrições', view: 'inscricoes_review', enabled: true },
  { label: 'Cadastro de Encontreiro', view: 'encontreiros', enabled: true },
  { label: 'Presença', view: 'presence', enabled: true },
  { label: 'Disparos', view: 'dispatches', enabled: true },
  { label: 'Calendário', view: 'calendar', enabled: true },
  { label: 'Comunicados', view: 'comunicados', enabled: true },
  { label: 'Logs', view: 'logs', enabled: true },
  { label: 'Usuários', view: 'users', enabled: true },
  { label: 'Ajustes', view: 'settings', enabled: true },
  { label: 'Ajuda', view: 'help', enabled: true },
];

export const isViewEnabledInRoadmap = (view: View) =>
  NAVIGATION_ROADMAP.some((item) => item.view === view && item.enabled);


