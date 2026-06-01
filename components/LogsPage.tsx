
import React, { useState } from 'react';
import { Log, LogStatus } from '../types';
import Badge from './Badge';
import { toCleanString } from '../utils/textEncoding.ts';

interface LogsPageProps {
  logs: Log[];
}

const LogsPage: React.FC<LogsPageProps> = ({ logs }) => {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | LogStatus>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [dispatchIdFilter, setDispatchIdFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const filteredLogs = logs.filter(log => {
    const logDispatch = toCleanString(log.dispatchName).toLowerCase();
    const logOperator = toCleanString(log.operator).toLowerCase();
    const query = toCleanString(filter).toLowerCase();
    const matchesText = logDispatch.includes(query) || logOperator.includes(query);
    const matchesStatus = statusFilter === 'ALL' || log.status === statusFilter;
    const logModule = toCleanString((log as any).modulo || 'geral').toLowerCase();
    const matchesModule = moduleFilter === 'ALL' || logModule === moduleFilter.toLowerCase();
    const matchesDispatchId = !dispatchIdFilter || toCleanString(log.dispatchId) === toCleanString(dispatchIdFilter);
    const ts = new Date(log.timestamp);
    const isoDay = !Number.isNaN(ts.getTime()) ? ts.toISOString().slice(0, 10) : '';
    const matchesFrom = !fromDate || (isoDay && isoDay >= fromDate);
    const matchesTo = !toDate || (isoDay && isoDay <= toDate);
    return matchesText && matchesStatus && matchesModule && matchesDispatchId && matchesFrom && matchesTo;
  });

  const handleExport = () => {
    const headers = 'ID,Disparo,Operador,Data,Status,Duracao,Resumo\n';
    const csv = filteredLogs
      .map((l) => `${toCleanString(l.id)},${toCleanString(l.dispatchName)},${toCleanString(l.operator)},${toCleanString(l.timestamp)},${toCleanString(l.status)},${l.duration}ms,"${toCleanString(l.responseSummary).replace(/"/g, '""')}"`)
      .join('\n');
    const blob = new Blob([headers + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `logs_eac_${new Date().toISOString()}.csv`;
    link.click();
  };

  const getStatusLabel = (status: LogStatus) => {
    if (status === LogStatus.SUCCESS) return 'SUCESSO';
    if (status === LogStatus.NO_DATA) return 'SEM REGISTROS';
    if (status === LogStatus.FAILURE) return 'FALHA SISTEMA';
    return status;
  };

  const getBadgeType = (status: LogStatus) => {
    if (status === LogStatus.SUCCESS) return 'success';
    if (status === LogStatus.NO_DATA) return 'warning';
    if (status === LogStatus.FAILURE) return 'danger';
    return 'gray';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Auditoria de Logs</h2>
          <p className="text-slate-500 mt-1">Histórico detalhado de todas as execuções do painel.</p>
        </div>
        <button 
          onClick={handleExport}
          className="bg-white border-2 border-slate-200 text-slate-700 px-6 py-3 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-colors flex items-center"
        >
          <svg className="w-5 h-5 mr-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          EXPORTAR CSV
        </button>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b bg-slate-50/50 flex flex-wrap gap-4">
          <div className="relative flex-grow max-w-md">
            <input 
              type="text" 
              placeholder="Buscar por disparo ou operador..." 
              className="pl-12 pr-4 py-3 border-2 border-slate-200 rounded-2xl w-full focus:border-blue-600 outline-none bg-white text-sm text-slate-900 font-bold transition-all shadow-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <svg className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <select 
            className="border-2 border-slate-200 rounded-2xl px-6 py-3 bg-white text-sm text-slate-900 font-bold focus:border-blue-600 outline-none transition-all shadow-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">TODOS OS STATUS</option>
            <option value={LogStatus.SUCCESS}>SUCESSO</option>
            <option value={LogStatus.NO_DATA}>SEM REGISTROS</option>
            <option value={LogStatus.FAILURE}>FALHA SISTEMA</option>
          </select>
          <select
            className="border-2 border-slate-200 rounded-2xl px-6 py-3 bg-white text-sm text-slate-900 font-bold focus:border-blue-600 outline-none transition-all shadow-sm"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="ALL">TODOS MÓDULOS</option>
            <option value="dispatches">DISPAROS</option>
            <option value="calendar">CALENDÁRIO</option>
            <option value="comunicados">COMUNICADOS</option>
            <option value="logs">LOGS</option>
            <option value="users">USUÁRIOS</option>
            <option value="members">CADASTRO</option>
            <option value="presence">PRESENÇA</option>
            <option value="geral">GERAL</option>
          </select>
          <input
            type="text"
            placeholder="dispatchId"
            className="border-2 border-slate-200 rounded-2xl px-4 py-3 bg-white text-sm text-slate-900 font-bold focus:border-blue-600 outline-none transition-all shadow-sm w-40"
            value={dispatchIdFilter}
            onChange={(e) => setDispatchIdFilter(e.target.value)}
          />
          <input
            type="date"
            className="border-2 border-slate-200 rounded-2xl px-4 py-3 bg-white text-sm text-slate-900 font-bold focus:border-blue-600 outline-none transition-all shadow-sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <input
            type="date"
            className="border-2 border-slate-200 rounded-2xl px-4 py-3 bg-white text-sm text-slate-900 font-bold focus:border-blue-600 outline-none transition-all shadow-sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-8 py-5">Data e Hora</th>
                <th className="px-8 py-5">Disparo</th>
                <th className="px-8 py-5">Operador</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-6 whitespace-nowrap text-slate-400 font-mono text-xs">
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-8 py-6 font-bold text-slate-900">
                    {toCleanString(log.dispatchName)}
                  </td>
                  <td className="px-8 py-6 text-slate-600">
                    {toCleanString(log.operator)}
                  </td>
                  <td className="px-8 py-6">
                    <Badge type={getBadgeType(log.status)}>
                      {getStatusLabel(log.status)}
                    </Badge>
                  </td>
                  <td className="px-8 py-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setSelectedLog(log)}
                      className="text-blue-600 hover:text-blue-800 font-black uppercase text-[10px] tracking-widest border border-blue-100 px-3 py-1.5 rounded-lg bg-blue-50/50 shadow-sm"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
            <div className="p-8 border-b flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-900">Detalhes da Execução</h3>
                <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest mt-1">ID do Log: {selectedLog.id}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-3 hover:bg-slate-200/50 rounded-2xl text-slate-400 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Status</p>
                  <Badge type={getBadgeType(selectedLog.status)}>
                  {getStatusLabel(selectedLog.status)}
                  </Badge>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Duração</p>
                  <p className="font-black text-slate-900 font-mono text-lg">{selectedLog.duration}ms</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 col-span-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Data Execução</p>
                  <p className="font-bold text-slate-900">{new Date(selectedLog.timestamp).toLocaleString('pt-BR')}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Resumo do Retorno</p>
                <div className="bg-slate-900 text-blue-300 p-6 rounded-2xl font-mono text-xs overflow-x-auto shadow-inner border border-slate-800 leading-relaxed">
                  {toCleanString(selectedLog.responseSummary)}
                </div>
              </div>
            </div>
            <div className="p-8 bg-slate-50 border-t flex justify-end">
              <button 
                onClick={() => setSelectedLog(null)}
                className="blue-gradient text-white px-10 py-3 rounded-xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-all"
              >
                FECHAR DETALHES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogsPage;

