import React, { useState, useCallback } from 'react';
import Toast from './Toast';
import { sanitizeTextDeep, toCleanString } from '../utils/textEncoding.ts';

interface PublicInterestFormProps {
  email: string;
  nome?: string;
  token?: string;
  googleWebAppUrl: string;
  onSuccess: () => void;
}

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;

const PublicInterestForm: React.FC<PublicInterestFormProps> = ({
  email,
  nome,
  token,
  googleWebAppUrl,
  onSuccess
}) => {
  const [answers, setAnswers] = useState({
    q1: '', // interesse
    q2: '', // contato mudou?
    q3: '', // já fez EAC em outra paróquia?
    q4: '', // recado
    q5: '', // tem amigo para fazer junto?
    q6: ''  // nome do amigo
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [tokenValidated, setTokenValidated] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const callApiProxy = useCallback(
    async (action: string, payload: any) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/comunicados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, data: payload, googleWebAppUrl })
        });

        const result = sanitizeTextDeep(await response.json());

        if (!result.success) {
          throw new Error(result.error || 'Ocorreu um erro desconhecido.');
        }

        return result;
      } catch (err: any) {
        setError(err.message);
        showToast(err.message, 'error');
        return { success: false, error: err.message };
      } finally {
        setIsLoading(false);
      }
    },
    [googleWebAppUrl]
  );

  const validateToken = useCallback(async () => {
    if (!token) {
      setError('Token de acesso ausente.');
      return false;
    }
    try {
      const res = await fetch('/api/public-interest/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'VALIDATE_TOKEN', token }),
      });
      const out = sanitizeTextDeep(await res.json());
      if (!out.success) {
        setError(out.error || 'Token invalido.');
        return false;
      }
      setTokenValidated(true);
      return true;
    } catch (e: any) {
      setError(e?.message || 'Falha ao validar token.');
      return false;
    }
  }, [token]);

  React.useEffect(() => {
    validateToken();
  }, [validateToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // obrigatórias: 1, 2, 3
    if (!answers.q1 || !answers.q2 || !answers.q3) {
      const msg = 'Por favor, responda as perguntas obrigatórias (1, 2 e 3).';
      setError(msg);
      showToast(msg, 'info');
      return;
    }

    // se tem amigo, precisa informar o nome
    if (answers.q5 === 'Sim' && !answers.q6.trim()) {
      const msg = 'Por favor, informe o nome do amigo para fazer junto.';
      setError(msg);
      showToast(msg, 'info');
      return;
    }

    const payload = {
      email,
      nome: toCleanString(nome || ''),
      answers
    };

    if (!tokenValidated) {
      const ok = await validateToken();
      if (!ok) return;
    }

    const consumeRes = await fetch('/api/public-interest/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CONSUME_TOKEN',
        token,
        payload: { email, answeredAt: new Date().toISOString() },
      }),
    });
    const consumeOut = sanitizeTextDeep(await consumeRes.json());
    if (!consumeOut.success) {
      const msg = consumeOut.error || 'Token invalido ou expirado.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    const result = await callApiProxy('SUBMIT_INTEREST_ANSWERS', payload);

    if (result.success) {
      setSubmitted(true);
      showToast('Obrigado por confirmar seu interesse!', 'success');
      onSuccess();
    }
  };

  if (!tokenValidated && !submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Acesso inválido</h1>
          <p className="text-slate-700 text-base">{error || 'Token inválido ou expirado.'}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-3xl font-bold text-emerald-600 mb-4">Sucesso!</h1>
          <p className="text-slate-700 text-lg">
            Obrigado por confirmar seu interesse! Em breve, você será redirecionado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white shadow-lg rounded-xl p-8">
          <h1 className="text-2xl font-bold text-slate-800 text-center mb-2">
            Confirmação de Interesse
          </h1>
          <p className="text-center text-slate-600 mb-6">
            Olá, {toCleanString(nome || 'jovem')}! Por favor, responda as perguntas abaixo.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Q1 */}
            <div>
              <label htmlFor="q1" className="block text-sm font-medium text-slate-700 mb-1">
                1. Você ainda tem interesse em participar do EAC?
              </label>
              <select
                id="q1"
                value={answers.q1}
                onChange={(e) => setAnswers({ ...answers, q1: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Selecione...</option>
                <option value="Sim">Sim</option>
                <option value="Não">Não</option>
              </select>
            </div>

            {/* Q2 */}
            <div>
              <label htmlFor="q2" className="block text-sm font-medium text-slate-700 mb-1">
                2. Seus dados de contato (telefone, e-mail) mudaram?
              </label>
              <select
                id="q2"
                value={answers.q2}
                onChange={(e) => setAnswers({ ...answers, q2: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Selecione...</option>
                <option value="Sim">Sim</option>
                <option value="Não">Não</option>
              </select>
            </div>

            {/* Q3 */}
            <div>
              <label htmlFor="q3" className="block text-sm font-medium text-slate-700 mb-1">
                3. Já fez o EAC em outra paróquia?
              </label>
              <select
                id="q3"
                value={answers.q3}
                onChange={(e) => setAnswers({ ...answers, q3: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Selecione...</option>
                <option value="Sim">Sim</option>
                <option value="Não">Não</option>
              </select>
            </div>

            {/* Q4 */}
            <div>
              <label htmlFor="q4" className="block text-sm font-medium text-slate-700 mb-1">
                4. Deixe um recado ou uma pergunta para a equipe.
              </label>
              <textarea
                id="q4"
                value={answers.q4}
                onChange={(e) => setAnswers({ ...answers, q4: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Opcional"
              />
            </div>

            {/* Q5 */}
            <div>
              <label htmlFor="q5" className="block text-sm font-medium text-slate-700 mb-1">
                5. Voce tem algum amigo inscrito que gostaria de fazer junto o próximo encontro?
              </label>
              <select
                id="q5"
                value={answers.q5}
                onChange={(e) => {
                  const v = e.target.value;
                  setAnswers((prev) => ({
                    ...prev,
                    q5: v,
                    q6: v === 'Sim' ? prev.q6 : '' // limpa nome se não
                  }));
                }}
                className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Selecione...</option>
                <option value="Sim">Sim</option>
                <option value="Não">Não</option>
              </select>
            </div>

            {/* Q6 (condicional) */}
            {answers.q5 === 'Sim' && (
              <div>
                <label htmlFor="q6" className="block text-sm font-medium text-slate-700 mb-1">
                  6. Qual o nome do seu amigo?
                </label>
                <input
                  id="q6"
                  type="text"
                  value={answers.q6}
                  onChange={(e) => setAnswers({ ...answers, q6: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Digite o nome"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-md hover:bg-blue-700 disabled:bg-slate-400 transition-colors duration-300"
            >
              {isLoading ? 'Enviando...' : 'Confirmar Interesse'}
            </button>

            {error ? (
              <p className="text-sm text-red-600 text-center">{error}</p>
            ) : null}
          </form>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default PublicInterestForm;

