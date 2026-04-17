import React from 'react';
import type { Adolescente } from '../types.ts';
import { getMemberAgeInfo } from './memberAge.ts';
import PersonCard from './PersonCard.tsx';

interface MemberCardProps {
  member: Adolescente;
  onView: (member: Adolescente) => void;
  onEdit: (member: Adolescente) => void;
  onDelete: (member: Adolescente) => void;
  isDeleting?: boolean;
  toCleanString: (value: any) => string;
  getWhatsAppLink: (phone: string) => string | null;
}

const MemberCard: React.FC<MemberCardProps> = ({ member, onView, onEdit, onDelete, isDeleting = false, toCleanString, getWhatsAppLink }) => {
  const nome = toCleanString((member as any)?.nome);
  const bairro = toCleanString((member as any)?.bairro);
  const email = toCleanString((member as any)?.email);
  const phoneRaw = toCleanString((member as any)?.whatsapp || (member as any)?.telefone);
  const nascimento = toCleanString((member as any)?.nascimento);
  const dataCadastroRaw = (member as any)?.timestamp;
  const ageInfo = getMemberAgeInfo(nascimento);
  const whatsappLink = getWhatsAppLink(phoneRaw);
  const canDelete = Boolean(email);
  const parseCadastroDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

    const raw = String(value).trim();
    if (!raw) return null;

    // dd/MM/yyyy [HH:mm[:ss]]
    let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const y = Number(m[3]);
      const h = Number(m[4] || 0);
      const mi = Number(m[5] || 0);
      const s = Number(m[6] || 0);
      const parsedBr = new Date(y, mo, d, h, mi, s, 0);
      return isNaN(parsedBr.getTime()) ? null : parsedBr;
    }

    // yyyy-MM-dd [HH:mm[:ss]] ou yyyy-MM-ddTHH:mm[:ss]
    m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);
      const h = Number(m[4] || 0);
      const mi = Number(m[5] || 0);
      const s = Number(m[6] || 0);
      const parsedIso = new Date(y, mo, d, h, mi, s, 0);
      return isNaN(parsedIso.getTime()) ? null : parsedIso;
    }

    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const cadastroDate = parseCadastroDate(dataCadastroRaw);
  const dataCadastro = cadastroDate
    ? cadastroDate.toLocaleDateString('pt-BR')
    : (dataCadastroRaw ? String(dataCadastroRaw) : '-');
  const isNovo = cadastroDate ? (Date.now() - cadastroDate.getTime()) <= (48 * 60 * 60 * 1000) : false;
  const ageBadgeLabel = ageInfo.age === null ? 'Idade n/d' : `${ageInfo.age} anos`;

  return (
    <PersonCard
      ageLabel={ageBadgeLabel}
      ageClassName={ageInfo.range.badgeClassName}
      statusLabel={isNovo ? 'Novo' : undefined}
      statusTextClassName={isNovo ? 'text-emerald-700' : undefined}
      statusDotClassName={isNovo ? 'bg-emerald-500' : undefined}
      nome={nome || 'Sem nome'}
      bairro={bairro || 'Sem bairro'}
      cadastroText={`Cadastro: ${dataCadastro}`}
      actions={[
        {
          key: 'view',
          title: 'Visualizar',
          variant: 'view',
          onClick: () => onView(member),
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.25 12s3.75-7.5 9.75-7.5 9.75 7.5 9.75 7.5-3.75 7.5-9.75 7.5S2.25 12 2.25 12z" />
              <circle cx="12" cy="12" r="3" strokeWidth="2" />
            </svg>
          )
        },
        {
          key: 'edit',
          title: 'Editar',
          variant: 'edit',
          onClick: () => onEdit(member),
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16.862 3.487a2.1 2.1 0 113 2.97L8.25 18.07 4.5 19.5l1.43-3.75 10.932-12.263z" />
            </svg>
          )
        },
        {
          key: 'whatsapp',
          title: 'WhatsApp',
          variant: 'whatsapp',
          href: whatsappLink || undefined,
          disabled: !whatsappLink,
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5A8.5 8.5 0 0 1 8.4 19l-4.2 1 1.1-4A8.5 8.5 0 1 1 21 11.5Z" />
            </svg>
          )
        },
        {
          key: 'delete',
          title: isDeleting ? 'Excluindo...' : 'Excluir',
          variant: 'delete',
          onClick: () => onDelete(member),
          disabled: !canDelete || isDeleting,
          icon: isDeleting
            ? <span className="w-4 h-4 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" aria-hidden="true" />
            : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0l1 12h6l1-12M10 11v6M14 11v6" />
              </svg>
            )
        }
      ]}
    />
  );
};

export default MemberCard;
