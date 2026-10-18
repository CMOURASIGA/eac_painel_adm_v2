#!/usr/bin/env node
/**
 * EAC API action inventory - static/read-only audit.
 *
 * Reads repository source and prints JSON. No network, credentials or database access.
 * This identifies action coverage, NOT effective authorization or exploitability.
 * Usage: node scripts/audit-api-actions.mjs
 */
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const router = read('api/comunicados.ts');
const service = read('utils/supabaseActions.ts');

const routeMatch = router.match(/const supabasePreferredActions = new Set\(\[([\s\S]*?)\]\)/);
if (!routeMatch) {
  console.error('Could not locate supabasePreferredActions. Audit requires review.');
  process.exitCode = 2;
} else {
  const preferred = [...new Set([...routeMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]))].sort();
  const implemented = [...new Set([...service.matchAll(/ctx\.action\s*===\s*['"]([^'"]+)['"]/g)].map(m => m[1]))].sort();
  const routingOnly = preferred.filter(x => !implemented.includes(x));
  const serviceOnly = implemented.filter(x => !preferred.includes(x));
  const potentiallyMutating = /^(SAVE|DELETE|MARK|MOVE|SET|UPDATE|EXECUTE|IMPORT|START|RETRY|NORMALIZE|PRIORITIZE|ATUALIZAR|LOG|BUILD)_/;
  const classified = preferred.map(action => ({
    action,
    class: action === 'USER_LOGIN' ? 'AUTH' :
      potentiallyMutating.test(action) ? 'POTENTIAL_WRITE_OR_SIDE_EFFECT' :
      /^(GET|SEARCH)_/.test(action) ? 'READ' : 'REVIEW',
    review_required: true,
  }));
  const output = {
    source: 'static-source-only',
    risk_note: 'Actions are not proof of effective access control. Review all other endpoints, internal calls and fallbacks separately.',
    route_actions: preferred.length,
    service_actions: implemented.length,
    route_without_exact_service_case: routingOnly,
    service_case_not_in_route_set: serviceOnly,
    actions: classified,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}
