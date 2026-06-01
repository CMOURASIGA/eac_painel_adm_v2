import React from 'react';
import { extractDataOriginMeta, formatAuditDateTime, formatOriginLabel } from '../utils/dataOrigin.ts';
import { toCleanString } from '../utils/textEncoding.ts';

type Props = {
  record: any;
  className?: string;
  title?: string;
};

const Card = ({ label, value }: { label: string; value: string }) => (
  <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-2 text-sm font-bold text-slate-700 break-words">{value || '-'}</p>
  </div>
);

export default function DataOriginAudit({ record, className, title }: Props) {
  const meta = extractDataOriginMeta(record);
  if (!meta) return null;

  return (
    <div className={toCleanString(className) || ''}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          {title || 'Auditoria de origem'}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card label="Origem do dado" value={formatOriginLabel(meta.origem_dado)} />
        <Card label="Criado via sistema" value={meta.criado_via_sistema === undefined ? '-' : String(meta.criado_via_sistema)} />
        <Card label="Data de importação" value={formatAuditDateTime(meta.data_importacao)} />
        <Card label="Última sincronização" value={formatAuditDateTime(meta.ultima_sincronizacao)} />
        <div className="md:col-span-2">
          <Card label="ID origem planilha" value={toCleanString(meta.id_origem_planilha) || '-'} />
        </div>
      </div>
    </div>
  );
}


