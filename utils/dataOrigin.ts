type AnyRecord = Record<string, any> | null | undefined;

export type DataOrigin = 'PLANILHA' | 'SISTEMA' | string;

export type DataOriginMeta = {
  origem_dado?: DataOrigin;
  data_importacao?: string;
  id_origem_planilha?: string;
  ultima_sincronizacao?: string;
  criado_via_sistema?: boolean | string | number;
};

const toClean = (v: any) => String(v ?? '').trim();

const pickFirst = (obj: AnyRecord, keys: string[]) => {
  if (!obj) return '';
  for (const k of keys) {
    const val = (obj as any)[k];
    if (val !== undefined && val !== null && toClean(val) !== '') return val;
  }
  return '';
};

export function extractDataOriginMeta(record: AnyRecord): DataOriginMeta | null {
  if (!record) return null;

  const origem_dado = pickFirst(record, ['origem_dado', 'origemDado', 'data_origin', 'source_origin']);
  const data_importacao = pickFirst(record, ['data_importacao', 'dataImportacao', 'imported_at', 'importedAt']);
  const id_origem_planilha = pickFirst(record, ['id_origem_planilha', 'idOrigemPlanilha', 'sheet_row_id', 'sheetRowId']);
  const ultima_sincronizacao = pickFirst(record, ['ultima_sincronizacao', 'ultimaSincronizacao', 'synced_at', 'syncedAt', 'updated_at', 'updatedAt']);
  const criado_via_sistema = pickFirst(record, ['criado_via_sistema', 'criadoViaSistema', 'created_by_system', 'createdBySystem']);

  const hasAny =
    toClean(origem_dado) ||
    toClean(data_importacao) ||
    toClean(id_origem_planilha) ||
    toClean(ultima_sincronizacao) ||
    toClean(criado_via_sistema);

  if (!hasAny) return null;

  const parseBool = (v: any): boolean | undefined => {
    if (typeof v === 'boolean') return v;
    const s = toClean(v).toLowerCase();
    if (!s) return undefined;
    if (['true', '1', 'sim', 's', 'yes', 'y', 'x'].includes(s)) return true;
    if (['false', '0', 'nao', 'não', 'n', 'no'].includes(s)) return false;
    return undefined;
  };

  return {
    ...(origem_dado ? { origem_dado } : {}),
    ...(data_importacao ? { data_importacao: String(data_importacao) } : {}),
    ...(id_origem_planilha ? { id_origem_planilha: String(id_origem_planilha) } : {}),
    ...(ultima_sincronizacao ? { ultima_sincronizacao: String(ultima_sincronizacao) } : {}),
    ...(criado_via_sistema !== '' ? { criado_via_sistema: parseBool(criado_via_sistema) ?? String(criado_via_sistema) } : {}),
  };
}

export function formatOriginLabel(origin?: DataOrigin) {
  const raw = toClean(origin);
  if (!raw) return '-';
  const up = raw.toUpperCase();
  if (up === 'PLANILHA') return 'PLANILHA';
  if (up === 'SISTEMA') return 'SISTEMA';
  return raw;
}

export function formatAuditDateTime(value?: string) {
  const raw = toClean(value);
  if (!raw) return '-';
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  // tentativa BR dd/mm/yyyy
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return raw;

  return raw;
}


