import React, { useMemo, useState } from 'react';
import Toast from './Toast';
import { inscricoesService } from '../services/inscricoesService.ts';
import { toCleanString } from '../utils/textEncoding.ts';

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;
type FieldErrors = Record<string, string>;

function parseDateOnly(value: string): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d, 12, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt;
}

function calcAgeOnDate(birth: Date, on: Date) {
  let age = on.getFullYear() - birth.getFullYear();
  const m = on.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < birth.getDate())) age -= 1;
  return age;
}

const DEFAULT_SUCCESS_MESSAGE =
  'Inscrição recebida com sucesso! A equipe responsável irá revisar as informações e, se necessário, entrará em contato pelos telefones informados.';

const PublicInscricaoForm: React.FC = () => {
  const [toast, setToast] = useState<ToastState>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [form, setForm] = useState({
    nome_adolescente: '',
    nome_social: '',
    data_nascimento: '',
    sexo: '',
    telefone_adolescente: '',
    email_adolescente: '',
    nome_responsavel: '',
    telefone_responsavel: '',
    email_responsavel: '',
    bairro: '',
    paroquia: '',
    participou_antes: 'Nao',
    observacoes: '',
    aceite_termos: false,
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const computedAge = useMemo(() => {
    const birth = parseDateOnly(form.data_nascimento);
    if (!birth) return '';
    const age = calcAgeOnDate(birth, new Date());
    return Number.isFinite(age) && age >= 0 ? String(age) : '';
  }, [form.data_nascimento]);

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const nomeAdolescente = toCleanString(form.nome_adolescente).replace(/\s+/g, ' ');
    const nomeResponsavel = toCleanString(form.nome_responsavel).replace(/\s+/g, ' ');

    if (nomeAdolescente.replace(/\s/g, '').length < 5) errors.nome_adolescente = 'Informe o nome completo do adolescente.';

    const nascimento = parseDateOnly(form.data_nascimento);
    if (!nascimento || nascimento.getTime() > Date.now()) errors.data_nascimento = 'Informe uma data de nascimento válida.';
    if (!toCleanString(form.sexo)) errors.sexo = 'Informe o sexo do adolescente.';

    const telA = toCleanString(form.telefone_adolescente).replace(/\D/g, '');
    if (telA.length < 10 || /^0+$/.test(telA)) errors.telefone_adolescente = 'Informe um telefone válido do adolescente.';

    if (nomeResponsavel.replace(/\s/g, '').length < 5) errors.nome_responsavel = 'Informe o nome do responsável.';

    const telR = toCleanString(form.telefone_responsavel).replace(/\D/g, '');
    if (telR.length < 10 || /^0+$/.test(telR)) errors.telefone_responsavel = 'Informe um telefone válido do responsável.';

    if (!form.aceite_termos) errors.aceite_termos = 'É necessário aceitar os termos para enviar a inscrição.';

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
        nome_adolescente: toCleanString(form.nome_adolescente),
        nome_social: toCleanString(form.nome_social),
        data_nascimento: toCleanString(form.data_nascimento),
        sexo: toCleanString(form.sexo),
        idade: computedAge ? Number(computedAge) : undefined,
        telefone_adolescente: toCleanString(form.telefone_adolescente),
        email_adolescente: toCleanString(form.email_adolescente),
        nome_responsavel: toCleanString(form.nome_responsavel),
        telefone_responsavel: toCleanString(form.telefone_responsavel),
        email_responsavel: toCleanString(form.email_responsavel),
        bairro: toCleanString(form.bairro),
        paroquia: toCleanString(form.paroquia),
        participou_antes: form.participou_antes === 'Sim',
        observacoes: toCleanString(form.observacoes),
        aceite_termos: form.aceite_termos,
      };

      const r = await inscricoesService.createInscricao(payload);
      if (!r.success) {
        const backendFields = ((r as any)?.raw?.fields && typeof (r as any).raw.fields === 'object') ? (r as any).raw.fields : {};
        if (Object.keys(backendFields).length > 0) setFieldErrors(backendFields);
        throw new Error((r as any)?.raw?.message || r.error || 'Não foi possível enviar sua inscrição agora.');
      }

      setIsSubmitted(true);
      const msg = r.data.message || DEFAULT_SUCCESS_MESSAGE;
      showToast(msg, 'success');
    } catch (e: any) {
      console.error('[PublicInscricaoForm] falha submit:', e);
      const msg = e?.message || 'Não foi possível enviar sua inscrição agora. Confira os dados informados e tente novamente.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#eef4ff] via-[#f8fafc] to-[#eef2f7] py-10 px-4 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_34px_-20px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="bg-[#044372] px-8 py-7 text-center">
            <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" className="h-16 mx-auto drop-shadow" />
          </div>
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-black">✓</div>
            <h1 className="text-3xl font-black text-emerald-600 mb-4">Inscrição enviada!</h1>
            <p className="text-slate-700 text-lg">{DEFAULT_SUCCESS_MESSAGE}</p>
            <p className="mt-5 text-sm text-slate-500">Obrigado por confiar no EAC.</p>
          </div>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

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
            <h1 className="text-3xl font-black text-slate-900 text-center mb-2">Inscrição de Adolescente</h1>
            <p className="text-center text-slate-600 mb-7">Preencha os dados abaixo para registrar sua inscrição.</p>

            <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] text-blue-900">
              O encontro será definido pela coordenação durante a triagem.
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Nome do adolescente *</label>
                  <input
                    value={form.nome_adolescente}
                    onChange={(e) => setForm((prev) => ({ ...prev, nome_adolescente: e.target.value }))}
                    className={inputClass('nome_adolescente')}
                    placeholder="Nome completo"
                  />
                  {fieldErrors.nome_adolescente ? <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_adolescente}</p> : null}
                </div>

                <div>
                  <label className={labelClass}>Nome social</label>
                  <input
                    value={form.nome_social}
                    onChange={(e) => setForm((prev) => ({ ...prev, nome_social: e.target.value }))}
                    className={inputClass('nome_social')}
                    placeholder="Como prefere ser chamado(a)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Data de nascimento *</label>
                  <input
                    type="date"
                    value={form.data_nascimento}
                    onChange={(e) => setForm((prev) => ({ ...prev, data_nascimento: e.target.value }))}
                    className={inputClass('data_nascimento')}
                  />
                  {fieldErrors.data_nascimento ? <p className="mt-1 text-xs text-red-600">{fieldErrors.data_nascimento}</p> : null}
                </div>
                <div>
                  <label className={labelClass}>Sexo *</label>
                  <select
                    value={form.sexo}
                    onChange={(e) => setForm((prev) => ({ ...prev, sexo: e.target.value }))}
                    className={inputClass('sexo')}
                  >
                    <option value="">Selecione</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                  </select>
                  {fieldErrors.sexo ? <p className="mt-1 text-xs text-red-600">{fieldErrors.sexo}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className={labelClass}>Telefone do adolescente *</label>
                  <input
                    value={form.telefone_adolescente}
                    onChange={(e) => setForm((prev) => ({ ...prev, telefone_adolescente: e.target.value }))}
                    className={inputClass('telefone_adolescente')}
                    placeholder="(DD) 9xxxx-xxxx"
                  />
                  {fieldErrors.telefone_adolescente ? <p className="mt-1 text-xs text-red-600">{fieldErrors.telefone_adolescente}</p> : null}
                </div>

                <div>
                  <label className={labelClass}>Idade atual</label>
                  <input value={computedAge} readOnly className="w-full h-12 px-4 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 font-bold" placeholder="-" />
                  <p className="mt-1 text-[11px] text-slate-500">{computedAge ? `${computedAge} anos` : 'Informe a data de nascimento.'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>E-mail do adolescente</label>
                  <input
                    value={form.email_adolescente}
                    onChange={(e) => setForm((prev) => ({ ...prev, email_adolescente: e.target.value }))}
                    className={inputClass('email_adolescente')}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className={labelClass}>E-mail do responsável</label>
                  <input
                    value={form.email_responsavel}
                    onChange={(e) => setForm((prev) => ({ ...prev, email_responsavel: e.target.value }))}
                    className={inputClass('email_responsavel')}
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Nome do responsável *</label>
                  <input
                    value={form.nome_responsavel}
                    onChange={(e) => setForm((prev) => ({ ...prev, nome_responsavel: e.target.value }))}
                    className={inputClass('nome_responsavel')}
                    placeholder="Nome completo"
                  />
                  {fieldErrors.nome_responsavel ? <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_responsavel}</p> : null}
                </div>

                <div>
                  <label className={labelClass}>Telefone do responsável *</label>
                  <input
                    value={form.telefone_responsavel}
                    onChange={(e) => setForm((prev) => ({ ...prev, telefone_responsavel: e.target.value }))}
                    className={inputClass('telefone_responsavel')}
                    placeholder="(DD) 9xxxx-xxxx"
                  />
                  {fieldErrors.telefone_responsavel ? <p className="mt-1 text-xs text-red-600">{fieldErrors.telefone_responsavel}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Bairro</label>
                  <input
                    value={form.bairro}
                    onChange={(e) => setForm((prev) => ({ ...prev, bairro: e.target.value }))}
                    className={inputClass('bairro')}
                  />
                </div>

                <div>
                  <label className={labelClass}>Paróquia</label>
                  <input
                    value={form.paroquia}
                    onChange={(e) => setForm((prev) => ({ ...prev, paroquia: e.target.value }))}
                    className={inputClass('paroquia')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Já participou antes?</label>
                  <select
                    value={form.participou_antes}
                    onChange={(e) => setForm((prev) => ({ ...prev, participou_antes: e.target.value }))}
                    className={inputClass('participou_antes')}
                  >
                    <option value="Nao">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Observações</label>
                <textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white transition focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                  placeholder="Opcional"
                />
              </div>

              <div className="flex items-start gap-3">
                <input type="checkbox" checked={form.aceite_termos} onChange={(e) => setForm((prev) => ({ ...prev, aceite_termos: e.target.checked }))} className="mt-1 w-5 h-5" />
                <div>
                  <p className="text-sm text-slate-800 font-bold">Aceito os termos *</p>
                  <p className="text-xs text-slate-500">Confirmo que as informações acima são verdadeiras e autorizo o contato pelos telefones informados.</p>
                </div>
              </div>
              {fieldErrors.aceite_termos ? <p className="text-xs text-red-600">{fieldErrors.aceite_termos}</p> : null}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-[#0a4a86] to-[#1f64bb] text-white font-black py-3.5 px-4 rounded-xl hover:brightness-105 disabled:bg-slate-400 transition-colors duration-300 uppercase tracking-wide"
              >
                {isLoading ? 'Enviando inscrição...' : 'Enviar inscrição'}
              </button>

              {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}
            </form>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default PublicInscricaoForm;
