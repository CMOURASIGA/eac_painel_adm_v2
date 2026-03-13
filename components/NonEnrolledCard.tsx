import React from 'react';
import PersonCard from './PersonCard.tsx';

type NonEnrolledCardProps = {
  idade: number | null;
  idadeText: string;
  statusUltimoChamado: string;
  statusPriorizacao?: string;
  nome: string;
  bairro: string;
  dataCadastro: string;
  interesse: string;
  whatsappHref?: string | null;
  isEditingRecado?: boolean;
  isPrioritizing?: boolean;
  onEditar: () => void;
  onEnviarEmail: () => void;
  onPriorizar: () => void;
  onVerDetalhes: () => void;
  onExcluir: () => void;
  onConverter: () => void;
};

const normalizeStatus = (value: string) => String(value || '').trim().toUpperCase();

const getStatusUi = (statusRaw: string) => {
  const status = normalizeStatus(statusRaw);
  if (!status) return { label: 'Sem envio', dot: 'bg-slate-400', text: 'text-slate-600' };
  if (status === 'RESPONDIDO') return { label: 'Respondido', dot: 'bg-emerald-500', text: 'text-emerald-700' };
  if (status === 'ENVIADO' || status === 'AGUARDANDO') {
    return { label: 'Aguardando', dot: 'bg-amber-500', text: 'text-amber-700' };
  }
  if (status === 'SEM RETORNO' || status === 'ERRO' || status === 'ENCERRADO') {
    return { label: 'Sem retorno', dot: 'bg-rose-500', text: 'text-rose-700' };
  }
  return { label: 'Aguardando', dot: 'bg-amber-500', text: 'text-amber-700' };
};

const getYesNoUi = (value: string) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'sim') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (raw === 'não' || raw === 'nao') return 'bg-slate-100 text-slate-700 border border-slate-200';
  return 'bg-slate-50 text-slate-500 border border-slate-200';
};

const getAgeBadgeClass = (age: number | null) => {
  if (age === null || Number.isNaN(age)) {
    return 'bg-slate-100 border-slate-200 text-slate-700';
  }
  if (age <= 11) {
    return 'bg-amber-100 border-amber-300 text-amber-800';
  }
  if (age <= 16) {
    return 'bg-blue-100 border-blue-300 text-blue-800';
  }
  return 'bg-purple-100 border-purple-300 text-purple-800';
};

const isPrioritizedValue = (value?: string) => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'sim' || raw === 's' || raw === 'yes' || raw === 'y' || raw === '1' || raw === 'true';
};

const NonEnrolledCard: React.FC<NonEnrolledCardProps> = ({
  idade,
  idadeText,
  statusUltimoChamado,
  statusPriorizacao,
  nome,
  bairro,
  dataCadastro,
  interesse,
  whatsappHref,
  isEditingRecado,
  isPrioritizing,
  onEditar,
  onEnviarEmail,
  onPriorizar,
  onVerDetalhes,
  onExcluir,
  onConverter,
}) => {
  const statusUi = getStatusUi(statusUltimoChamado);
  const ageBadgeClass = getAgeBadgeClass(idade);
  const isPrioritized = isPrioritizedValue(statusPriorizacao);

  return (
    <PersonCard
      ageLabel={idadeText}
      ageClassName={ageBadgeClass}
      statusLabel={statusUi.label}
      statusTextClassName={statusUi.text}
      statusDotClassName={statusUi.dot}
      nome={nome || '-'}
      bairro={bairro || 'Bairro não informado'}
      cadastroText={`Cadastro: ${dataCadastro || '-'}`}
      badges={[
        {
          label: `Interesse: ${interesse || '-'}`,
          className: getYesNoUi(interesse)
        },
        ...(isPrioritized ? [{
          label: 'Priorizado',
          className: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }] : [])
      ]}
      actions={[
        {
          key: 'view',
          title: 'Ver detalhes',
          variant: 'view',
          onClick: onVerDetalhes,
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )
        },
        {
          key: 'edit',
          title: 'Editar cadastro',
          variant: 'edit',
          onClick: onEditar,
          disabled: isEditingRecado,
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          )
        },
        {
          key: 'whatsapp',
          title: 'WhatsApp',
          variant: 'whatsapp',
          href: whatsappHref || undefined,
          disabled: !whatsappHref,
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5A8.5 8.5 0 0 1 8.4 19l-4.2 1 1.1-4A8.5 8.5 0 1 1 21 11.5Z" />
            </svg>
          )
        },
        {
          key: 'email',
          title: 'Enviar e-mail',
          variant: 'email',
          onClick: onEnviarEmail,
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          )
        },
        {
          key: 'priorizar',
          title: isPrioritized ? 'Retirar priorização' : 'Priorizar',
          variant: isPrioritized ? 'confirm' : 'neutral',
          onClick: onPriorizar,
          disabled: isPrioritizing,
          icon: isPrioritized ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m5 13 4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.5l2.87 5.82 6.43.94-4.65 4.53 1.1 6.41L12 17.2l-5.75 3.02 1.1-6.41-4.65-4.53 6.43-.94L12 2.5z" />
            </svg>
          )
        },
        {
          key: 'delete',
          title: 'Excluir',
          variant: 'delete',
          onClick: onExcluir,
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 7h12" />
              <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              <path d="m8 7 1 12h6l1-12" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          )
        }
      ]}
      primaryAction={{
        label: 'Converter',
        onClick: onConverter,
      }}
    />
  );
};

export default NonEnrolledCard;
