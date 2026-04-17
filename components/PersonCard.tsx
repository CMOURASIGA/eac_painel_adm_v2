import React from 'react';

export type PersonCardActionVariant = 'whatsapp' | 'view' | 'edit' | 'delete' | 'email' | 'confirm' | 'neutral';

export interface PersonCardBadge {
  label: string;
  className: string;
}

export interface PersonCardAction {
  key: string;
  title: string;
  icon: React.ReactNode;
  variant?: PersonCardActionVariant;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

export interface PersonCardPrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface PersonCardProps {
  ageLabel: string;
  ageClassName?: string;
  statusLabel?: string;
  statusTextClassName?: string;
  statusDotClassName?: string;
  nome: string;
  bairro: string;
  cadastroText: string;
  badges?: PersonCardBadge[];
  actions?: PersonCardAction[];
  primaryAction?: PersonCardPrimaryAction;
}

const iconButtonBase = 'h-10 w-10 rounded-xl border inline-flex items-center justify-center transition-all disabled:opacity-60 disabled:cursor-not-allowed';

function actionVariantClass(variant: PersonCardActionVariant) {
  switch (variant) {
    case 'whatsapp':
      return 'bg-green-50 text-green-700 border-green-200 hover:bg-green-600 hover:text-white';
    case 'view':
      return 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white';
    case 'edit':
      return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-600 hover:text-white';
    case 'delete':
      return 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-600 hover:text-white';
    case 'email':
      return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white';
    case 'confirm':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-600 hover:text-white';
    default:
      return 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100';
  }
}

const PersonCard: React.FC<PersonCardProps> = ({
  ageLabel,
  ageClassName = 'bg-slate-100 border-slate-200 text-slate-700',
  statusLabel,
  statusTextClassName = 'text-slate-600',
  statusDotClassName = 'bg-slate-400',
  nome,
  bairro,
  cadastroText,
  badges = [],
  actions = [],
  primaryAction,
}) => {
  return (
    <article className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-all flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-black ${ageClassName}`}>
          [{ageLabel}]
        </span>
        {statusLabel ? (
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-black ${statusTextClassName}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${statusDotClassName}`} />
            {statusLabel}
          </span>
        ) : (
          <span />
        )}
      </div>

      <div className="space-y-1">
        <h4 className="font-black text-slate-900 text-sm leading-tight">{nome || '-'}</h4>
        <p className="text-[12px] font-bold text-slate-500">{bairro || 'Bairro não informado'}</p>
        <p className="text-[11px] font-bold text-slate-500">{cadastroText || 'Cadastro: -'}</p>
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span key={badge.label} className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${badge.className}`}>
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="flex items-center gap-2 mt-1">
          {actions.map((action) => {
            const variantClass = actionVariantClass(action.variant || 'neutral');
            if (action.href) {
              const disabled = Boolean(action.disabled);
              return (
                <a
                  key={action.key}
                  href={disabled ? '#' : action.href}
                  target="_blank"
                  rel="noreferrer"
                  title={action.title}
                  aria-label={action.title}
                  onClick={(e) => {
                    if (disabled) e.preventDefault();
                  }}
                  className={`${iconButtonBase} ${variantClass} ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  {action.icon}
                </a>
              );
            }
            return (
              <button
                key={action.key}
                type="button"
                title={action.title}
                aria-label={action.title}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`${iconButtonBase} ${variantClass}`}
              >
                {action.icon}
              </button>
            );
          })}
        </div>
      )}

      {primaryAction ? (
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm disabled:opacity-60"
        >
          {primaryAction.label}
        </button>
      ) : null}
    </article>
  );
};

export default PersonCard;
