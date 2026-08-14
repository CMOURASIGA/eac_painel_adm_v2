import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '../types.ts';
import PersonCard from './PersonCard.tsx';
import { toCleanString } from '../utils/textEncoding.ts';
import { encontreirosService } from '../services/encontreirosService.ts';

interface EncontristasAuditoriaPageProps {
  user: User;
  googleWebAppUrl: string;
}

type AuditStatus = 'OK' | 'DIVERGENTE' | 'FALTANDO';

interface AuditRow {
  pessoaId: string;
  encontristaId: string;
  nome: string;
  email: string;
  telefone: string;
  bairro: string;
  dataNascimento: string;
  idade: string;
  status: AuditStatus;
  matchType: 'PESSOA_ID' | 'TELEFONE' | 'EMAIL' | 'NOME' | null;
  encontreiroId: string | null;
  encontreiroPessoaId: string | null;
  camposDivergentes: string[];
  encontreiro: Record<string, any> | null;
}

interface AuditResumo {
  totalEncontristas: number;
  totalEncontreiros: number;
  vinculados: number;
  divergentes: number;
  faltando: number;
}

interface EncontreiroFormData {
  id?: string;
  timestamp: string;
  nomeCompleto: string;
  dataNascimento: string;
  idade: string;
  email: string;
  celularWhatsapp: string;
  enderecoCompleto: string;
  responsavelContato: string;
  bairro: string;
  frequentaMissas: string;
  ondeMissas: string;
  participaMovimento: string;
  movimentoParoquia: string;
  paroquiaFezEac: string;
  jaTrabalhouEac: string;
  jaCoordenouEquipe: string;
  paisFizeramEncontro: string;
  possuiAlergia: string;
  tomaRemedio: string;
  alimentacaoEspecial: string;
  sugestaoUltimoEncontro: string;
  dicaPosEncontro: string;
  classificacao: string;
}

const EMPTY_FORM: EncontreiroFormData = {
  timestamp: '',
  nomeCompleto: '',
  dataNascimento: '',
  idade: '',
  email: '',
  celularWhatsapp: '',
  enderecoCompleto: '',
  responsavelContato: '',
  bairro: '',
  frequentaMissas: '',
  ondeMissas: '',
  participaMovimento: '',
  movimentoParoquia: '',
  paroquiaFezEac: '',
  jaTrabalhouEac: '',
  jaCoordenouEquipe: '',
  paisFizeramEncontro: '',
  possuiAlergia: '',
  tomaRemedio: '',
  alimentacaoEspecial: '',
  sugestaoUltimoEncontro: '',
  dicaPosEncontro: '',
  classificacao: '',
};

const FIELD_DEFS: Array<{ key: keyof EncontreiroFormData; label: string; multiline?: boolean }> = [
  { key: 'nomeCompleto', label: 'Nome completo' },
  { key: 'dataNascimento', label: 'Data de nascimento' },
  { key: 'idade', label: 'Idade' },
  { key: 'email', label: 'E-mail' },
  { key: 'celularWhatsapp', label: 'Celular / WhatsApp' },
  { key: 'enderecoCompleto', label: 'Endereco completo', multiline: true },
  { key: 'responsavelContato', label: 'Responsavel / Parentesco / Contato', multiline: true },
  { key: 'bairro', label: 'Bairro onde mora' },
  { key: 'frequentaMissas', label: 'Frequenta missas?' },
  { key: 'ondeMissas', label: 'Se sim, onde?' },
  { key: 'participaMovimento', label: 'Participa de movimento da igreja?' },
  { key: 'movimentoParoquia', label: 'Se sim, qual e em qual paroquia?', multiline: true },
  { key: 'paroquiaFezEac', label: 'Paroquia onde fez o EAC' },
  { key: 'jaTrabalhouEac', label: 'Ja trabalhou em algum EAC?' },
  { key: 'jaCoordenouEquipe', label: 'Ja coordenou alguma equipe?' },
  { key: 'paisFizeramEncontro', label: 'Seus pais ja fizeram algum encontro?' },
  { key: 'possuiAlergia', label: 'Possui alergia? Se sim, qual?', multiline: true },
  { key: 'tomaRemedio', label: 'Toma remedio? Se sim, qual?', multiline: true },
  { key: 'alimentacaoEspecial', label: 'Possui alimentacao especial?', multiline: true },
  { key: 'sugestaoUltimoEncontro', label: 'Sugestao para melhorarmos', multiline: true },
  { key: 'dicaPosEncontro', label: 'Dica para pos-encontro', multiline: true },
  { key: 'classificacao', label: 'Classificacao' },
];
const REQUIRED_FIELDS = new Set<keyof EncontreiroFormData>(['nomeCompleto', 'celularWhatsapp', 'bairro']);
const SENSITIVE_FIELDS = new Set<keyof EncontreiroFormData>([
  'possuiAlergia',
  'tomaRemedio',
  'alimentacaoEspecial',
]);

const toClean = (value: any) => toCleanString(value);

const calculateAge = (birthDate: string) => {
  const raw = toClean(birthDate);
  if (!raw) return '';
  const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let birth: Date | null = null;
  if (brMatch) birth = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
  else if (isoMatch) birth = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  else {
    const native = new Date(raw);
    birth = isNaN(native.getTime()) ? null : native;
  }
  if (!birth || isNaN(birth.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
};

const STATUS_META: Record<AuditStatus, { label: string; textClass: string; dotClass: string; badgeClass: string }> = {
  OK: {
    label: 'Vinculado',
    textClass: 'text-emerald-700',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  DIVERGENTE: {
    label: 'Divergente',
    textClass: 'text-amber-700',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  FALTANDO: {
    label: 'Faltando',
    textClass: 'text-rose-700',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
};

const CAMPO_DIVERGENTE_LABEL: Record<string, string> = {
  pessoa_id: 'Vinculo (pessoa) diferente',
  pessoa_id_ausente_no_encontreiro: 'Sem vinculo de pessoa no encontreiro',
  email: 'E-mail diferente',
  celularWhatsapp: 'Celular/WhatsApp diferente',
  bairro: 'Bairro diferente',
  dataNascimento: 'Data de nascimento diferente',
};

const STATUS_FILTERS: Array<{ key: 'TODOS' | AuditStatus; label: string }> = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'FALTANDO', label: 'Faltando no Encontreiro' },
  { key: 'DIVERGENTE', label: 'Dados divergentes' },
  { key: 'OK', label: 'Vinculados' },
];

const EncontristasAuditoriaPage: React.FC<EncontristasAuditoriaPageProps> = ({ user, googleWebAppUrl }) => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [resumo, setResumo] = useState<AuditResumo>({
    totalEncontristas: 0,
    totalEncontreiros: 0,
    vinculados: 0,
    divergentes: 0,
    faltando: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [statusFilter, setStatusFilter] = useState<'TODOS' | AuditStatus>('FALTANDO');
  const [searchTerm, setSearchTerm] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<EncontreiroFormData>(EMPTY_FORM);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [isSaving, setIsSaving] = useState(false);
  const [activeRow, setActiveRow] = useState<AuditRow | null>(null);

  const modulePerm = user.permissions?.modulePermissions?.encontreiros;
  const canCreate = user.role === 'ADMIN' || Boolean(modulePerm?.canCreate ?? user.permissions?.canCreate);
  const canEdit = user.role === 'ADMIN' || Boolean(modulePerm?.canEdit ?? user.permissions?.canEdit);
  const canViewSensitiveData = user.role === 'ADMIN' || Boolean((modulePerm as any)?.canViewSensitive);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const r = await encontreirosService.auditoriaEncontristas();
      if (!r.success) throw new Error(r.error || 'Falha ao carregar a auditoria de encontristas.');
      setRows(Array.isArray(r.data.rows) ? r.data.rows : []);
      setResumo({
        totalEncontristas: Number(r.data.resumo?.totalEncontristas) || 0,
        totalEncontreiros: Number(r.data.resumo?.totalEncontreiros) || 0,
        vinculados: Number(r.data.resumo?.vinculados) || 0,
        divergentes: Number(r.data.resumo?.divergentes) || 0,
        faltando: Number(r.data.resumo?.faltando) || 0,
      });
    } catch (err: any) {
      setLoadError(err?.message || 'Erro ao carregar a auditoria de encontristas.');
    } finally {
      setIsLoading(false);
    }
  }, [googleWebAppUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (statusFilter !== 'TODOS') {
      list = list.filter((r) => r.status === statusFilter);
    }
    const search = searchTerm.toLowerCase().trim();
    if (search) {
      list = list.filter((r) => {
        return (
          toClean(r.nome).toLowerCase().includes(search) ||
          toClean(r.email).toLowerCase().includes(search) ||
          toClean(r.telefone).toLowerCase().includes(search) ||
          toClean(r.bairro).toLowerCase().includes(search)
        );
      });
    }
    return list;
  }, [rows, statusFilter, searchTerm]);

  const openCreateFromEncontrista = (row: AuditRow) => {
    setActiveRow(row);
    setFormMode('create');
    setFormData({
      ...EMPTY_FORM,
      nomeCompleto: toClean(row.nome),
      dataNascimento: toClean(row.dataNascimento),
      idade: toClean(row.idade) || calculateAge(toClean(row.dataNascimento)),
      email: toClean(row.email),
      celularWhatsapp: toClean(row.telefone),
      bairro: toClean(row.bairro),
    });
    setShowForm(true);
  };

  const openEditFromEncontreiro = (row: AuditRow) => {
    if (!row.encontreiro) return;
    const enc = row.encontreiro;
    setActiveRow(row);
    setFormMode('edit');
    setFormData({
      id: toClean(enc.id),
      timestamp: toClean(enc.timestamp),
      nomeCompleto: toClean(enc.nomeCompleto),
      dataNascimento: toClean(enc.dataNascimento),
      idade: toClean(enc.idade),
      email: toClean(enc.email),
      celularWhatsapp: toClean(enc.celularWhatsapp),
      enderecoCompleto: toClean(enc.enderecoCompleto),
      responsavelContato: toClean(enc.responsavelContato),
      bairro: toClean(enc.bairro),
      frequentaMissas: toClean(enc.frequentaMissas),
      ondeMissas: toClean(enc.ondeMissas),
      participaMovimento: toClean(enc.participaMovimento),
      movimentoParoquia: toClean(enc.movimentoParoquia),
      paroquiaFezEac: toClean(enc.paroquiaFezEac),
      jaTrabalhouEac: toClean(enc.jaTrabalhouEac),
      jaCoordenouEquipe: toClean(enc.jaCoordenouEquipe),
      paisFizeramEncontro: toClean(enc.paisFizeramEncontro),
      possuiAlergia: toClean(enc.possuiAlergia),
      tomaRemedio: toClean(enc.tomaRemedio),
      alimentacaoEspecial: toClean(enc.alimentacaoEspecial),
      sugestaoUltimoEncontro: toClean(enc.sugestaoUltimoEncontro),
      dicaPosEncontro: toClean(enc.dicaPosEncontro),
      classificacao: toClean(enc.classificacao),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!toClean(formData.nomeCompleto)) {
      alert('Nome completo e obrigatorio.');
      return;
    }
    if (!toClean(formData.celularWhatsapp)) {
      alert('Celular / WhatsApp e obrigatorio.');
      return;
    }
    if (!toClean(formData.bairro)) {
      alert('Bairro e obrigatorio.');
      return;
    }

    const payload = {
      ...formData,
      idade: toClean(formData.idade) || calculateAge(formData.dataNascimento),
    };

    setIsSaving(true);
    try {
      const apiRes = await encontreirosService.salvar(payload, { googleWebAppUrl });
      if (!apiRes.success) throw new Error(apiRes.error || 'Nao foi possivel salvar.');
      setShowForm(false);
      setActiveRow(null);
      await fetchData();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar cadastro de encontreiro.');
    } finally {
      setIsSaving(false);
    }
  };

  const indicatorButtonClass = (active: boolean) => {
    return `p-5 rounded-[1.8rem] border transition-all text-left ${active ? 'bg-blue-600 border-blue-600 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-700 hover:shadow-md'}`;
  };

  return (
    <div className="p-4 md:p-8 max-w-[100rem] mx-auto animate-in fade-in duration-500 pb-24 space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 leading-none">Auditoria: Encontristas x Encontreiros</h2>
          <p className="text-slate-500 font-bold mt-2 text-sm">
            Confere se todo encontrista do Cadastro de Encontrista tem um registro correspondente na tabela de Encontreiros e permite corrigir os dados direto por aqui.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="px-6 py-4 bg-slate-100 border border-slate-200 rounded-2xl text-slate-600 font-black text-[10px] uppercase tracking-widest disabled:opacity-60 hover:bg-slate-200"
          >
            {isLoading ? 'Carregando...' : 'Recarregar'}
          </button>
        </div>
      </header>

      {loadError && (
        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-bold">
          {loadError}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button className={indicatorButtonClass(statusFilter === 'TODOS')} onClick={() => setStatusFilter('TODOS')}>
          <p className={`text-[10px] font-black uppercase tracking-widest ${statusFilter === 'TODOS' ? 'text-blue-100' : 'text-slate-400'}`}>Total de encontristas</p>
          <p className="text-3xl font-black mt-2">{resumo.totalEncontristas}</p>
        </button>
        <button className={indicatorButtonClass(statusFilter === 'FALTANDO')} onClick={() => setStatusFilter('FALTANDO')}>
          <p className={`text-[10px] font-black uppercase tracking-widest ${statusFilter === 'FALTANDO' ? 'text-blue-100' : 'text-rose-500'}`}>Faltando no Encontreiro</p>
          <p className="text-3xl font-black mt-2">{resumo.faltando}</p>
        </button>
        <button className={indicatorButtonClass(statusFilter === 'DIVERGENTE')} onClick={() => setStatusFilter('DIVERGENTE')}>
          <p className={`text-[10px] font-black uppercase tracking-widest ${statusFilter === 'DIVERGENTE' ? 'text-blue-100' : 'text-amber-500'}`}>Dados divergentes</p>
          <p className="text-3xl font-black mt-2">{resumo.divergentes}</p>
        </button>
        <button className={indicatorButtonClass(statusFilter === 'OK')} onClick={() => setStatusFilter('OK')}>
          <p className={`text-[10px] font-black uppercase tracking-widest ${statusFilter === 'OK' ? 'text-blue-100' : 'text-emerald-500'}`}>Vinculados</p>
          <p className="text-3xl font-black mt-2">{resumo.vinculados}</p>
        </button>
      </section>

      <section className="bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 md:items-end md:justify-between">
          <div className="flex-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Busca</label>
            <input
              className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
              placeholder="Buscar por nome, e-mail, telefone ou bairro"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-4 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest ${
                  statusFilter === f.key ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registros ({filteredRows.length})</h3>
        </div>

        <div className="p-4 md:p-6">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-400 font-bold text-sm">
              Carregando auditoria...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-400 font-bold text-sm">
              Nenhum registro encontrado com os filtros atuais.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
              {filteredRows.map((row) => {
                const meta = STATUS_META[row.status];
                const badges = [];
                if (row.status !== 'FALTANDO' && row.matchType && row.matchType !== 'PESSOA_ID') {
                  badges.push({ label: `Vinculo por ${row.matchType.toLowerCase()}`, className: 'bg-amber-50 text-amber-700 border border-amber-200' });
                }
                row.camposDivergentes.forEach((campo) => {
                  badges.push({
                    label: CAMPO_DIVERGENTE_LABEL[campo] || campo,
                    className: 'bg-amber-50 text-amber-700 border border-amber-200',
                  });
                });

                return (
                  <PersonCard
                    key={row.encontristaId || row.pessoaId || row.nome}
                    ageLabel={toClean(row.idade) ? `${toClean(row.idade)} anos` : '-'}
                    ageClassName="bg-slate-100 border-slate-200 text-slate-700"
                    statusLabel={meta.label}
                    statusTextClassName={meta.textClass}
                    statusDotClassName={meta.dotClass}
                    nome={row.nome || '-'}
                    bairro={row.bairro || 'Bairro nao informado'}
                    cadastroText={row.telefone || row.email || 'Sem contato informado'}
                    badges={badges}
                    primaryAction={
                      row.status === 'FALTANDO'
                        ? (canCreate ? { label: 'Criar cadastro em Encontreiro', onClick: () => openCreateFromEncontrista(row) } : undefined)
                        : (canEdit ? { label: 'Editar dados do Encontreiro', onClick: () => openEditFromEncontreiro(row) } : undefined)
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden">
            <div className="blue-gradient px-6 md:px-8 py-5 text-white flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100">Cadastro de Encontreiro</p>
                <h3 className="text-xl md:text-2xl font-black">
                  {formMode === 'create' ? 'Criar registro a partir do encontrista' : 'Corrigir registro de encontreiro'}
                </h3>
                {activeRow && (
                  <p className="text-blue-100 text-xs font-bold mt-1">
                    Encontrista de origem: {toClean(activeRow.nome)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); setActiveRow(null); }}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto max-h-[calc(92vh-170px)]">
              <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold">
                Campos obrigatorios marcados com <span className="text-rose-600">*</span>.
                {formMode === 'create' ? ' Os dados abaixo vieram do Cadastro de Encontrista; revise antes de salvar.' : ''}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {FIELD_DEFS.filter((field) => canViewSensitiveData || !SENSITIVE_FIELDS.has(field.key)).map((field) => (
                  <div key={String(field.key)} className={field.multiline ? 'md:col-span-2' : ''}>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      {field.label}
                      {REQUIRED_FIELDS.has(field.key) ? <span className="text-rose-600 ml-1">*</span> : null}
                    </label>
                    {field.multiline ? (
                      <textarea
                        rows={3}
                        className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500 resize-y"
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    ) : (
                      <input
                        className="w-full px-4 py-3 mt-1 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500"
                        value={formData[field.key] || ''}
                        placeholder={REQUIRED_FIELDS.has(field.key) ? 'Obrigatorio' : 'Opcional'}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 md:px-8 py-4 bg-slate-50 border-t flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowForm(false); setActiveRow(null); }}
                className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-8 py-3 rounded-2xl blue-gradient text-white font-black text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-60"
              >
                {isSaving ? 'Salvando...' : (formMode === 'create' ? 'Criar cadastro de encontreiro' : 'Salvar correcao')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EncontristasAuditoriaPage;
