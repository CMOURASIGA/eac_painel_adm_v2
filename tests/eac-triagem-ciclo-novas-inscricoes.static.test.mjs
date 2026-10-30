import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../utils/inscricoesAdmin.ts', import.meta.url), 'utf8');

test('New registrations only accept last and next EAC links', () => {
  assert.match(source, /encontro_ids_elegiveis: \[ultimo\.id, proximo\?\.id\]/);
  assert.match(source, /if \(!encontroId \|\| !elegiveis\.includes\(encontroId\)\) return false;/);
});

test('Cycle date window remains required in addition to encounter eligibility', () => {
  const start = source.indexOf('function isInscricaoNoCiclo(');
  const end = source.indexOf('\nfunction uniq(', start);
  const predicate = source.slice(start, end);
  assert.match(predicate, /if \(time < inicio\) return false;/);
  assert.match(predicate, /if \(time >= fim\) return false;/);
});

test('List and counter share the same cycle-filtered new rows', () => {
  assert.match(source, /const novasRows = consolidarInscricoesPorAdolescente\([\s\S]*?isInscricaoNoCiclo\(row, cicloNovasInscricoes\)/);
  assert.match(source, /novasInscricoesOnly \? novasRows : consolidatedRows/);
  assert.match(source, /novas_inscricoes: novasRows\.length/);
});
