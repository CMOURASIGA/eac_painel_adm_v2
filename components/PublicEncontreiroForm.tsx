import React, { useMemo, useState } from 'react';
import Toast from './Toast';
import { postComunicadosAction } from '../services/eacApiClient.ts';
import { toCleanString } from '../utils/textEncoding.ts';

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;
type FieldErrors = Record<string, string>;

// Mascara de digitacao no formato brasileiro DD/MM/AAAA.
function maskDateBR(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  let out = dd;
  if (mm) out += `/${mm}`;
  if (yyyy) out += `/${yyyy}`;
  return out;
}

function isValidYMD(y: number, m: number, d: number) {
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
}

// Aceita tanto DD/MM/AAAA (o que a pessoa digita) quanto AAAA-MM-DD (formato
// que cadastros antigos podem ter salvo), sempre retornando um Date local ao
// meio-dia (evita problema de fuso horario na conversao).
function parseDateBRFlexible(value: string): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]) - 1;
    const y = Number(br[3]);
    if (!isValidYMD(y, m, d)) return null;
    return new Date(y, m, d, 12, 0, 0, 0);
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    if (!isValidYMD(y, m, d)) return null;
    return new Date(y, m, d, 12, 0, 0, 0);
  }

  return null;
}

function formatDateBR(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function toIsoDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// Recebe qualquer formato ja salvo (BR ou ISO) e devolve sempre DD/MM/AAAA
// para exibir/editar no campo de texto.
function toBRDateDisplay(value: any): string {
  const date = parseDateBRFlexible(toCleanString(value));
  return date ? formatDateBR(date) : '';
}

function calcAgeNow(birth: Date) {
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

const SUCCESS_MESSAGE_NOVO =
  'Cadastro recebido com sucesso! Em breve a coordenação entrará em contato pelos dados informados.';
const SUCCESS_MESSAGE_ATUALIZACAO = 'Cadastro atualizado com sucesso! Obrigado por manter seus dados em dia.';
const MSG_BEM_VINDO = 'Seja bem-vindo! Não encontramos um cadastro com esse telefone. Complete seus dados abaixo.';
const MSG_ENCONTRADO = 'Encontramos seu cadastro! Revise seus dados abaixo e atualize o que for necessário.';

const PublicEncontreiroForm: React.FC = () => {
  const [toast, setToast] = useState<ToastState>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [telefone, setTelefone] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [existingId, setExistingId] = useState('');
  const [existingRecord, setExistingRecord] = useState<Record<string, any> | null>(null);

  const [form, setForm] = useState({
    nomeCompleto: '',
    nomePreferencia: '',
    dataNascimento: '',
    idade: '',
    email: '',
    bairro: '',
    enderecoCompleto: '',
    responsavelContato: '',
    paroquiaFezEac: '',
    observacoes: '',
    aceite_termos: false,
  });

  const isUpdateMode = Boolean(existingId);

  const computedAge = useMemo(() => {
    const birth = parseDateBRFlexible(form.dataNascimento);
    if (!birth) return '';
    const age = calcAgeNow(birth);
    return Number.isFinite(age) && age >= 0 ? String(age) : '';
  }, [form.dataNascimento]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const resetSearch = () => {
    setHasSearched(false);
    setExistingId('');
    setExistingRecord(null);
  };

  const handleTelefoneChange = (value: string) => {
    setTelefone(value);
    if (hasSearched) resetSearch();
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const nome = toCleanString(form.nomeCompleto).replace(/\s+/g, ' ');
    const tel = toCleanString(telefone).replace(/\D/g, '');
    const bairro = toCleanString(form.bairro).replace(/\s+/g, ' ');
    const email = toCleanString(form.email).toLowerCase();

    if (nome.replace(/\s/g, '').length < 5) errors.nomeCompleto = 'Informe o nome completo.';
    const nascimento = parseDateBRFlexible(form.dataNascimento);
    if (!nascimento || nascimento.getTime() > Date.now()) errors.dataNascimento = 'Informe uma data de nascimento válida (DD/MM/AAAA).';
    if (tel.length < 10 || /^0+$/.test(tel)) errors.telefone = 'Informe um telefone/WhatsApp válido.';
    if (bairro.replace(/\s/g, '').length < 2) errors.bairro = 'Informe o bairro.';
    if (email && (!email.includes('@') || !email.includes('.'))) errors.email = 'Informe um e-mail válido.';
    if (!form.aceite_termos) errors.aceite_termos = 'É necessário aceitar os termos para enviar.';

    return errors;
  };

  const handleBuscarCadastro = async () => {
    if (isSearching) return;
    const tel = toCleanString(telefone).replace(/\D/g, '');
    if (tel.length < 10) {
      showToast('Informe um telefone/WhatsApp válido para buscar.', 'info');
      setFieldErrors((p) => ({ ...p, telefone: 'Informe um telefone/WhatsApp válido.' }));
      return;
    }
    setFieldErrors((p) => ({ ...p, telefone: '' }));

    setIsSearching(true);
    try {
      const r = await postComunicadosAction<any>('GET_ENCONTREIRO_PUBLIC_BY_TELEFONE', { telefone });
      if (!r.success) throw new Error(r.error || 'Não foi possível buscar seu cadastro agora.');

      const found = Boolean((r.data as any)?.found);
      const record = (r.data as any)?.encontreiro || null;

      if (found && record) {
        setExistingId(toCleanString(record.id));
        setExistingRecord(record);
        setForm((p) => ({
          ...p,
          nomeCompleto: toCleanString(record.nomeCompleto) || p.nomeCompleto,
          nomePreferencia: toCleanString(record.nomeSocial) || p.nomePreferencia,
          dataNascimento: toBRDateDisplay(record.dataNascimento) || p.dataNascimento,
          idade: toCleanString(record.idade) || p.idade,
          email: toCleanString(record.email) || p.email,
          bairro: toCleanString(record.bairro) || p.bairro,
          enderecoCompleto: toCleanString(record.enderecoCompleto) || p.enderecoCompleto,
          responsavelContato: toCleanString(record.responsavelContato) || p.responsavelContato,
          paroquiaFezEac: toCleanString(record.paroquiaFezEac) || p.paroquiaFezEac,
          observacoes: toCleanString(record.sugestaoUltimoEncontro) || p.observacoes,
        }));
        showToast(MSG_ENCONTRADO, 'success');
      } else {
        setExistingId('');
        setExistingRecord(null);
        showToast(MSG_BEM_VINDO, 'info');
      }
      setHasSearched(true);
    } catch (e: any) {
      const msg = e?.message || 'Não foi possível buscar seu cadastro agora.';
      showToast(msg, 'error');
    } finally {
      setIsSearching(false);
    }
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

    const nascimento = parseDateBRFlexible(form.dataNascimento);
    const visibleFields = {
      nomeCompleto: toCleanString(form.nomeCompleto),
      nomeSocial: toCleanString(form.nomePreferencia),
      dataNascimento: nascimento ? toIsoDate(nascimento) : '',
      idade: toCleanString(form.idade) || computedAge,
      email: toCleanString(form.email),
      celularWhatsapp: toCleanString(telefone),
      bairro: toCleanString(form.bairro),
      enderecoCompleto: toCleanString(form.enderecoCompleto),
      responsavelContato: toCleanString(form.responsavelContato),
      paroquiaFezEac: toCleanString(form.paroquiaFezEac),
      sugestaoUltimoEncontro: toCleanString(form.observacoes),
      aceite_termos: form.aceite_termos,
    };

    // Em modo de atualização, parte do registro já existente (que inclui campos
    // não editáveis neste formulário publico, como dados de saúde/participação)
    // e sobrescreve apenas os campos visíveis acima, evitando apagar informação
    // que a pessoa não teve chance de revisar aqui.
    const payload = isUpdateMode
      ? { ...(existingRecord || {}), ...visibleFields, id: existingId }
      : visibleFields;

    setIsLoading(true);
    try {
      const r = await postComunicadosAction<any>('SAVE_ENCONTREIRO', payload);
      if (!r.success) throw new Error((r.raw as any)?.message || r.error || 'Não foi possível enviar o cadastro.');
      setIsSubmitted(true);
      const fallbackMessage = isUpdateMode ? SUCCESS_MESSAGE_ATUALIZACAO : SUCCESS_MESSAGE_NOVO;
      showToast((r.data as any)?.message || fallbackMessage, 'success');
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
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_34px_-20px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="bg-[#044372] px-8 py-7 text-center">
            <img src="https://i.imgur.com/c5XQ7TW.png" alt="Logo EAC" className="h-16 mx-auto drop-shadow" />
          </div>
          <div className="p-7 md:p-8">
            <h1 className="text-3xl font-black text-slate-900 text-center mb-2">Cadastro de Encontreiro</h1>
            <p className="text-center text-slate-600 mb-7">
              Informe seu telefone/WhatsApp para localizarmos um cadastro já existente, ou para começar um novo cadastro.
            </p>

            {isSubmitted ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 font-semibold">
                {isUpdateMode ? SUCCESS_MESSAGE_ATUALIZACAO : SUCCESS_MESSAGE_NOVO}
              </div>
            ) : (
              <div className="space-y-2">
                <label className={labelClass}>Telefone / WhatsApp *</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={telefone}
                    onChange={(e) => handleTelefoneChange(e.target.value)}
                    className={`${inputClass('telefone')} sm:flex-1`}
                    placeholder="(DD) 9xxxx-xxxx"
                  />
                  <button
                    type="button"
                    onClick={handleBuscarCadastro}
                    disabled={isSearching}
                    className="h-12 px-6 rounded-xl bg-[#0a4a86] text-white font-black text-sm uppercase tracking-wide hover:brightness-105 disabled:bg-slate-400 whitespace-nowrap"
                  >
                    {isSearching ? 'Buscando...' : 'Já sou cadastrado?'}
                  </button>
                </div>
                {fieldErrors.telefone ? <p className="mt-1 text-xs text-red-600">{fieldErrors.telefone}</p> : null}
              </div>
            )}
          </div>
        </div>

        {!isSubmitted && hasSearched && (
          <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_34px_-20px_rgba(15,23,42,0.45)] overflow-hidden">
            <div className="p-7 md:p-8">
              <div className={`rounded-xl border p-4 mb-6 font-semibold text-sm ${isUpdateMode ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                {isUpdateMode ? MSG_ENCONTRADO : MSG_BEM_VINDO}
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Nome completo *</label>
                    <input value={form.nomeCompleto} onChange={(e) => setForm((p) => ({ ...p, nomeCompleto: e.target.value }))} className={inputClass('nomeCompleto')} />
                    {fieldErrors.nomeCompleto ? <p className="mt-1 text-xs text-red-600">{fieldErrors.nomeCompleto}</p> : null}
                  </div>
                  <div>
                    <label className={labelClass}>Nome de preferência</label>
                    <input
                      value={form.nomePreferencia}
                      onChange={(e) => setForm((p) => ({ ...p, nomePreferencia: e.target.value }))}
                      className={inputClass('nomePreferencia')}
                      placeholder="Como prefere ser chamado(a)"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Data de nascimento *</label>
                    <input
                      value={form.dataNascimento}
                      onChange={(e) => setForm((p) => ({ ...p, dataNascimento: maskDateBR(e.target.value) }))}
                      className={inputClass('dataNascimento')}
                      placeholder="DD/MM/AAAA"
                      inputMode="numeric"
                      maxLength={10}
                    />
                    {fieldErrors.dataNascimento ? <p className="mt-1 text-xs text-red-600">{fieldErrors.dataNascimento}</p> : null}
                  </div>
                  <div>
                    <label className={labelClass}>Idade atual</label>
                    <input value={toCleanString(form.idade) || computedAge} readOnly className="w-full h-12 px-4 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 font-bold" />
                  </div>
                  <div>
                    <label className={labelClass}>Bairro *</label>
                    <input value={form.bairro} onChange={(e) => setForm((p) => ({ ...p, bairro: e.target.value }))} className={inputClass('bairro')} />
                    {fieldErrors.bairro ? <p className="mt-1 text-xs text-red-600">{fieldErrors.bairro}</p> : null}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>E-mail</label>
                  <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className={inputClass('email')} placeholder="email@exemplo.com" />
                  {fieldErrors.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
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
                  {isLoading ? (isUpdateMode ? 'Atualizando cadastro...' : 'Enviando cadastro...') : (isUpdateMode ? 'Atualizar cadastro' : 'Enviar cadastro')}
                </button>
                {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}
              </form>
            </div>
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default PublicEncontreiroForm;
