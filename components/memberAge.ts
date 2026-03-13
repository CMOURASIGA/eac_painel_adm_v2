export type AgeRangeId = 'sem_idade' | 'crianca' | 'adolescente' | 'jovem' | 'adulto';

export interface AgeRangeMeta {
  id: AgeRangeId;
  label: string;
  badgeClassName: string;
  panelClassName: string;
}

export interface MemberAgeInfo {
  age: number | null;
  ageText: string;
  range: AgeRangeMeta;
}

const AGE_RANGE_META: Record<AgeRangeId, AgeRangeMeta> = {
  sem_idade: {
    id: 'sem_idade',
    label: 'Sem faixa',
    badgeClassName: 'bg-slate-100 text-slate-600 border border-slate-200',
    panelClassName: 'bg-slate-50 border-slate-200 text-slate-700',
  },
  crianca: {
    id: 'crianca',
    label: '0-11',
    badgeClassName: 'bg-amber-100 text-amber-800 border border-amber-300',
    panelClassName: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  adolescente: {
    id: 'adolescente',
    label: '12-16',
    badgeClassName: 'bg-blue-100 text-blue-800 border border-blue-300',
    panelClassName: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  jovem: {
    id: 'jovem',
    label: '17+',
    badgeClassName: 'bg-purple-100 text-purple-800 border border-purple-300',
    panelClassName: 'bg-purple-50 border-purple-200 text-purple-800',
  },
  adulto: {
    id: 'adulto',
    label: '17+',
    badgeClassName: 'bg-purple-100 text-purple-800 border border-purple-300',
    panelClassName: 'bg-purple-50 border-purple-200 text-purple-800',
  },
};

const toClean = (value: any) => toCleanString(value);

const parseDateFlexible = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = toClean(value);
  if (!raw) return null;

  const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]) - 1;
    const year = Number(brMatch[3]);
    const hour = Number(brMatch[4] || 0);
    const minute = Number(brMatch[5] || 0);
    const second = Number(brMatch[6] || 0);
    const parsed = new Date(year, month, day, hour, minute, second, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const hour = Number(isoMatch[4] || 0);
    const minute = Number(isoMatch[5] || 0);
    const second = Number(isoMatch[6] || 0);
    const parsed = new Date(year, month, day, hour, minute, second, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const native = new Date(raw);
  return Number.isNaN(native.getTime()) ? null : native;
};

export const calculateAgeFromBirthDate = (birthDate: any): number | null => {
  const birth = parseDateFlexible(birthDate);
  if (!birth) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  if (age < 0 || age > 120) return null;
  return age;
};

export const classifyAgeRange = (age: number | null): AgeRangeMeta => {
  if (age === null) return AGE_RANGE_META.sem_idade;
  if (age <= 11) return AGE_RANGE_META.crianca;
  if (age <= 16) return AGE_RANGE_META.adolescente;
  return AGE_RANGE_META.jovem;
};

export const getMemberAgeInfo = (birthDate: any): MemberAgeInfo => {
  const age = calculateAgeFromBirthDate(birthDate);
  const range = classifyAgeRange(age);
  return {
    age,
    ageText: age === null ? 'Idade nao informada' : `${age} anos`,
    range,
  };
};
import { toCleanString } from '../utils/textEncoding.ts';
