import React, { useEffect, useMemo, useState } from 'react';
import type { EncontreiroRecord } from '../types.ts';
import { encontreirosService } from '../services/encontreirosService.ts';
import { toCleanString } from '../utils/textEncoding.ts';

type Member = {
  encontreiroId: string;
  funcao: string;
  observacao: string;
};

type Props = {
  records: EncontreiroRecord[];
  googleWebAppUrl: string;
  canEdit: boolean;
};

const clean = (value: any) => toCleanString(value);

export default function EquipesPorEncontroPanel({ records, googleWebAppUrl, canEdit }: Props) {
  const [encontros, setEncontros] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [encontroId, setEncontroId] = useState('');
  const [composicao, setComposicao] = useState<any[]>([]);
  const [equipeId, setEquipeId] = useState('');
  const [membros, setMembros] = useState<Member[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [encontrosRes, equipesRes] = await Promise.all([
        encontreirosService.listarEncontros({ googleWebAppUrl }),
        encontreirosService.listarEquipes({ googleWebAppUrl }),
      ]);
      if (!encontrosRes.success || !equipesRes.success) {
        setMessage(encontrosRes.error || equipesRes.error || 'Não foi possível carregar encontros e equipes.');
      } else {
        const listaEncontros = Array.isArray(encontrosRes.data?.encontros) ? encontrosRes.data.encontros : [];
        setEncontros(listaEncontros);
        setEquipes(Array.isArray(equipesRes.data?.equipes) ? equipesRes.data.equipes : []);
        if (listaEncontros.length) setEncontroId(clean(listaEncontros[0]?.id));
      }
      setLoading(false);
    })();
  }, [googleWebAppUrl]);

  const carregarComposicao = async (id = encontroId) => {
    if (!id) return;
    setLoading(true);
    const res = await encontreirosService.listarComposicaoEquipe({ encontroId: id }, { googleWebAppUrl });
    if (!res.success) {
      setMessage(res.error || 'Não foi possível carregar a divisão de equipes.');
    } else {
      setComposicao(Array.isArray(res.data?.equipes) ? res.data.equipes : []);
      setMessage('');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (encontroId) {
      setEquipeId('');
      setMembros([]);
      void carregarComposicao(encontroId);
    }
  }, [encontroId]);

  const equipeAtual = useMemo(
    () => composicao.find((item) => clean(item.equipeId || item.id) === equipeId),
    [composicao, equipeId]
  );

  const abrirEquipe = (id: string) => {
    const equipe = composicao.find((item) => clean(item.equipeId || item.id) === id);
    const existentes = Array.isArray(equipe?.membros) ? equipe.membros : [];
    setEquipeId(id);
    setMembros(
      existentes.map((m: any) => ({
        encontreiroId: clean(m.encontreiroId || m.encontreiro_id || m.pessoaId || m.pessoa_id),
        funcao: clean(m.funcao) || 'Membro',
        observacao: clean(m.observacao),
      })).filter((m: Member) => m.encontreiroId)
    );
    setBusca('');
    setMessage('');
  };

  const selectedIds = new Set(membros.map((m) => m.encontreiroId));
  const encontrados = records.filter((r) => {
    const text = `${clean(r.nomeCompleto)} ${clean(r.bairro)}`.toLowerCase();
    return !busca || text.includes(busca.toLowerCase());
  });

  const alterarMembro = (id: string, checked: boolean) => {
    setMembros((prev) => checked
      ? [...prev, { encontreiroId: id, funcao: 'Membro', observacao: '' }]
      : prev.filter((m) => m.encontreiroId !== id)
    );
  };

  const atualizarMembro = (id: string, field: 'funcao' | 'observacao', value: string) => {
    setMembros((prev) => prev.map((m) => m.encontreiroId === id ? { ...m, [field]: value } : m));
  };

  const salvar = async () => {
    if (!encontroId || !equipeId) return;
    setSaving(true);
    setMessage('');
    const result = await encontreirosService.salvarMembrosDaEquipe(
      { encontroId, equipeId, membros },
      { googleWebAppUrl }
    );
    setSaving(false);
    if (!result.success) {
      setMessage(result.error || 'Não foi possível salvar a equipe.');
      return;
    }
    setMessage('Equipe atualizada com sucesso.');
    await carregarComposicao();
  };

  const exportarCsv = () => {
    const encontro = encontros.find((item) => clean(item.id) === encontroId);
    const lines = ['Encontro;Equipe;Nome;Bairro;Função;Observação'];
    composicao.forEach((equipe: any) => {
      (Array.isArray(equipe.membros) ? equipe.membros : []).forEach((m: any) => {
        lines.push([
          clean(encontro?.nome || encontro?.titulo),
          clean(equipe.nome),
          clean(m.nome),
          clean(m.bairro),
          clean(m.funcao),
          clean(m.observacao),
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
      });
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `equipes-${clean(encontro?.nome || 'encontro').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-5">
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Organização operacional</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">Equipes por encontro</h3>
            <p className="text-sm font-medium text-slate-500 mt-2">Monte a equipe por encontro e mantenha o histórico de cada encontreiro.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void carregarComposicao()} className="px-4 py-3 rounded-2xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600">Recarregar</button>
            <button type="button" onClick={exportarCsv} disabled={!encontroId} className="px-4 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Exportar divisão</button>
          </div>
        </div>
        <div className="mt-6 max-w-lg">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Encontro</label>
          <select value={encontroId} onChange={(e) => setEncontroId(e.target.value)} className="w-full mt-1 px-4 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold text-slate-800 outline-none focus:border-blue-500">
            <option value="">Selecione o encontro</option>
            {encontros.map((encontro) => <option key={clean(encontro.id)} value={clean(encontro.id)}>{clean(encontro.nome || encontro.titulo || encontro.descricao)}</option>)}
          </select>
        </div>
        {message && <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{message}</p>}
      </div>

      {loading ? <div className="p-8 text-center text-sm font-bold text-slate-500">Carregando equipes...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {equipes.map((equipe) => {
            const id = clean(equipe.id);
            const atual = composicao.find((item) => clean(item.equipeId || item.id) === id);
            const total = Array.isArray(atual?.membros) ? atual.membros.length : 0;
            return <button key={id} type="button" onClick={() => abrirEquipe(id)} className={`text-left p-5 rounded-[1.8rem] border transition-all ${equipeId === id ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-200 hover:shadow-md'}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest ${equipeId === id ? 'text-blue-100' : 'text-slate-400'}`}>Equipe</p>
              <p className="text-xl font-black mt-2">{clean(equipe.nome || equipe.descricao)}</p>
              <p className={`text-sm font-bold mt-3 ${equipeId === id ? 'text-blue-100' : 'text-slate-500'}`}>{total} integrante{total === 1 ? '' : 's'}</p>
            </button>;
          })}
        </div>
      )}

      {equipeId && (
        <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 md:p-8 border-b bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Composição</p><h4 className="text-xl font-black text-slate-900 mt-1">{clean(equipeAtual?.nome) || 'Equipe selecionada'}</h4></div>
            {canEdit && <button type="button" disabled={saving} onClick={() => void salvar()} className="px-6 py-3 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar equipe'}</button>}
          </div>
          <div className="p-6 md:p-8 grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-8">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar encontreiro</label>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou bairro" className="w-full mt-1 px-4 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-blue-500" />
              <div className="mt-3 max-h-[30rem] overflow-y-auto space-y-2 pr-1">
                {encontrados.map((pessoa) => {
                  const id = clean(pessoa.id);
                  const checked = selectedIds.has(id);
                  return <label key={id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50">
                    <input type="checkbox" disabled={!canEdit} checked={checked} onChange={(e) => alterarMembro(id, e.target.checked)} />
                    <span><span className="block text-sm font-bold text-slate-800">{clean(pessoa.nomeCompleto)}</span><span className="block text-xs font-medium text-slate-500">{clean(pessoa.bairro) || 'Bairro não informado'}</span></span>
                  </label>;
                })}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Integrantes selecionados ({membros.length})</p>
              <div className="mt-3 space-y-3">
                {membros.length === 0 ? <p className="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">Selecione os encontreiros que compõem esta equipe.</p> : membros.map((membro) => {
                  const pessoa = records.find((r) => clean(r.id) === membro.encontreiroId);
                  return <div key={membro.encontreiroId} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-black text-slate-800">{clean(pessoa?.nomeCompleto) || 'Encontreiro'}</p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input disabled={!canEdit} value={membro.funcao} onChange={(e) => atualizarMembro(membro.encontreiroId, 'funcao', e.target.value)} placeholder="Função, ex.: Coordenação" className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold" />
                      <input disabled={!canEdit} value={membro.observacao} onChange={(e) => atualizarMembro(membro.encontreiroId, 'observacao', e.target.value)} placeholder="Observação opcional" className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold" />
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
