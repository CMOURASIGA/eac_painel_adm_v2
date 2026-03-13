const MOJIBAKE_SEQUENCE_REGEX = /(Ã[^A-Za-z0-9\s]|Â[^A-Za-z0-9\s]|â[^A-Za-z0-9\s]|ï¿½)/g;
const REPLACEMENT_CHAR_REGEX = /\uFFFD/g;
const WINDOWS_1252_REVERSE_MAP: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
};

const hasLikelyMojibakeSequence = (value: string) => {
  MOJIBAKE_SEQUENCE_REGEX.lastIndex = 0;
  return MOJIBAKE_SEQUENCE_REGEX.test(value);
};

const countMatches = (value: string, regex: RegExp) => {
  regex.lastIndex = 0;
  const matches = value.match(regex);
  return matches ? matches.length : 0;
};

export const getMojibakeScore = (value: string) => {
  if (!value) return 0;
  const replacementCount = countMatches(value, REPLACEMENT_CHAR_REGEX);
  const sequenceCount = countMatches(value, MOJIBAKE_SEQUENCE_REGEX);
  return (replacementCount * 6) + (sequenceCount * 3);
};

const decodeLatin1AsUtf8 = (value: string) => {
  if (!value) return value;
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const mapped = WINDOWS_1252_REVERSE_MAP[ch];
    bytes[i] = mapped !== undefined ? mapped : (value.charCodeAt(i) & 0xff);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
};

export const fixMojibake = (value: string) => {
  if (!value) return value;

  let current = value;
  for (let i = 0; i < 2; i += 1) {
    if (!hasLikelyMojibakeSequence(current)) break;

    const decoded = decodeLatin1AsUtf8(current);
    if (!decoded || decoded === current) break;

    const currentScore = getMojibakeScore(current);
    const decodedScore = getMojibakeScore(decoded);
    if (decodedScore > currentScore) break;

    current = decoded;
  }

  return current;
};

export const toCleanString = (value: any) => {
  const base = String(value ?? '').trim();
  return fixMojibake(base);
};

export const sanitizeTextDeep = <T>(value: T): T => {
  if (typeof value === 'string') {
    return fixMojibake(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTextDeep(item)) as T;
  }

  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const sanitized: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).forEach((key) => {
      sanitized[key] = sanitizeTextDeep((value as Record<string, unknown>)[key]);
    });
    return sanitized as T;
  }

  return value;
};
