import React, { useMemo, useState } from 'react';
import Toast from './Toast';
import { postComunicadosAction } from '../services/eacApiClient.ts';
import { toCleanString } from '../utils/textEncoding.ts';

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;
type FieldErrors = Record<string, string>;

function parseDateOnly(value: string): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 12, 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

function calcAgeNow(birth: Date) {
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

const SUCCESS_MESSAGE =
  'Cadastro recebido com sucesso! Em breve a coordenação entrará em contato pelos dados informados.';

const PublicEncontreiroForm: React.FC = () => {
  const [toast, setToast] = useState<ToastState>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [form, setForm] = useState({
    nomeCompleto: '',
    dataNascimento: '',
    idade: '',
    email: '',
    celularWhatsapp: '',
    bairro: '',
    enderecoCompleto: '',
    responsavelContato: '',
    paroquiaFezEac: '',
    observacoes: '',
    aceite_termos: false,
  });

  const computedAge = useMemo(() => {
    const birth = parseDateOnly(form.dataNascimento);
    if (!birth) return '';
    const age = calcAgeNow(birth);
    return Number.isFinite(age) && age >= 0 ? String(age) : '';
  }, [form.dataNascimento]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const nome = toCleanString(form.nomeCompleto).replace(/\s+/g, ' ');
    const tel = toCleanString(form.celularWhatsapp).replace(/\D/g, '');
    const bairro = toCleanString(form.bairro).replace(/\s+/g, ' ');
    const email = toCleanString(form.email).toLowerCase();

    if (nome.replace(/\s/g, '').length < 5) errors.nomeCompleto = 'Informe o nome completo.';
    const nascimento = parseDateOnly(form.dataNascimento);
    if (!nascimento || nascimento.getTime() > Date.now()) errors.dataNascimento = 'Informe uma data de nascimento válida.';
    if (tel.length < 10 || /^0+$/.test(tel)) errors.celularWhatsapp = 'Informe um telefone/WhatsApp válido.';
    if (bairro.replace(/\s/g, '').length < 2) errors.bairro = 'Informe o bairro.';
    if (email && (!email.includes('@') || !email.includes('.'))) errors.email = 'Informe um e-mail válido.';
    if (!form.aceite_termos) errors.aceite_termos = 'É necessário aceitar os termos para enviar.';

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const first = Object.values(errors)[0];
      setError(first);
      showToast(first, 'info');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        nomeCompleto: toCleanString(form.nomeCompleto),
        dataNascimento: toCleanString(form.dataNascimento),
        idade: toCleanString(form.idade) || computedAge,
        email: toCleanString(form.email),
        celularWhatsapp: toCleanString(form.celularWhatsapp),
        bairro: toCleanString(form.bairro),
        enderecoCompleto: toCleanString(form.enderecoCompleto),
        responsavelContato: toCleanString(form.responsavelContato),
        paroquiaFezEac: toCleanString(form.paroquiaFezEac),
        sugestaoUltimoEncontro: toCleanString(form.observacoes),
        aceite_termos: form.aceite_termos,
      };
      const r = await postComunicadosAction<any>('SAVE_ENCONTREIRO', payload);
      if (!r.success) throw new Error((r.raw as any)?.message || r.error || 'Não foi possível enviar o cadastro.');
      setIsSubmitted(true);
      showToast((r.data as any)?.message || SUCCESS_MESSAGE, 'success');
    } catch (e: any) {
      const msg = e?.message || 'Não foi possível enviar o cadastro agora.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full h-12 px-4 border rounded-xl bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 ${
      fieldErrors[field] ? 'border-red-500' : 'border-slate-300'
    }`;
  const labelClass = 'block text-sm font-extrabold text-slate-800 mb-1';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eef4ff] via-[#f8fafc] to-[#eef2f7] py-10 px-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_34px_-20px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="bg-[#044372] px-8 py-7 text-center">
            <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" className="h-16 mx-auto drop-shadow" />
          </div>
          <div className="p-7 md:p-8">
            <h1 className="text-3xl font-black text-slate-900 text-center mb-2">Cadastro de Encontreiro</h1>
            <p className="text-center text-slate-600 mb-7">Preencha seus dados para registrar o cadastro no sistema EAC.</p>

            {isSubmitted ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 font-semibold">{SUCCESS_MESSAGE}</div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Nome completo *</label>
                    <input value={form.nomeCompleto} onChange={(e) => setForm((p) => ({ ...p, nomeCompleto: e.target.value }))} className={inputClass('nomeCompleto')} />
                    {fieldErrors.nomeCompleto ? <p className="mt-1 text-xs text-red-600">{fieldErrors.nomeCompleto}</p> : null}
                  </div>
                  <div>
                    <label className={labelClass}>Data de nascimento *</label>
                    <input type="date" value={form.dataNascimento} onChange={(e) => setForm((p) => ({ ...p, dataNascimento: e.target.value }))} className={inputClass('dataNascimento')} />
                    {fieldErrors.dataNascimento ? <p className="mt-1 text-xs text-red-600">{fieldErrors.dataNascimento}</p> : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Telefone / WhatsApp *</label>
                    <input value={form.celularWhatsapp} onChange={(e) => setForm((p) => ({ ...p, celularWhatsapp: e.target.value }))} className={inputClass('celularWhatsapp')} placeholder="(DD) 9xxxx-xxxx" />
                    {fieldErrors.celularWhatsapp ? <p className="mt-1 text-xs text-red-600">{fieldErrors.celularWhatsapp}</p> : null}
                  </div>
                  <div>
                    <label className={labelClass}>Idade atual</label>
                    <input value={toCleanString(form.idade) || computedAge} readOnly className="w-full h-12 px-4 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 font-bold" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>E-mail</label>
                    <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className={inputClass('email')} placeholder="email@exemplo.com" />
                    {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
                  </div>
                  <div>
                    <label className={labelClass}>Bairro *</label>
                    <input value={form.bairro} onChange={(e) => setForm((p) => ({ ...p, bairro: e.target.value }))} className={inputClass('bairro')} />
                    {fieldErrors.bairro ? <p className="mt-1 text-xs text-red-600">{fieldErrors.bairro}</p> : null}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Endereço completo</label>
                  <input value={form.enderecoCompleto} onChange={(e) => setForm((p) => ({ ...p, enderecoCompleto: e.target.value }))} className={inputClass('enderecoCompleto')} />
                </div>
                <div>
                  <label className={labelClass}>Responsável / Contato</label>
                  <input value={form.responsavelContato} onChange={(e) => setForm((p) => ({ ...p, responsavelContato: e.target.value }))} className={inputClass('responsavelContato')} />
                </div>
                <div>
                  <label className={labelClass}>Paróquia onde fez EAC</label>
                  <input value={form.paroquiaFezEac} onChange={(e) => setForm((p) => ({ ...p, paroquiaFezEac: e.target.value }))} className={inputClass('paroquiaFezEac')} />
                </div>
                <div>
                  <label className={labelClass}>Observações</label>
                  <textarea rows={3} value={form.observacoes} onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500" />
                </div>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={form.aceite_termos} onChange={(e) => setForm((p) => ({ ...p, aceite_termos: e.target.checked }))} className="mt-1 w-5 h-5" />
                  <div>
                    <p className="text-sm text-slate-800 font-bold">Aceito os termos *</p>
                    <p className="text-xs text-slate-500">Confirmo que as informações são verdadeiras e autorizo contato da coordenação.</p>
                  </div>
                </div>
                {fieldErrors.aceite_termos ? <p className="text-xs text-red-600">{fieldErrors.aceite_termos}</p> : null}
                <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-[#0a4a86] to-[#1f64bb] text-white font-black py-3.5 px-4 rounded-xl hover:brightness-105 disabled:bg-slate-400 transition-colors duration-300 uppercase tracking-wide">
                  {isLoading ? 'Enviando cadastro...' : 'Enviar cadastro'}
                </button>
                {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}
              </form>
            )}
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default PublicEncontreiroForm;
