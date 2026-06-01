import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { issuePublicInterestToken, validatePublicInterestToken, consumePublicInterestToken } from '../utils/publicInterestToken.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const email = `validacao.us094.${Date.now()}@exemplo.com`;

const issued = await issuePublicInterestToken({
  email,
  payload: { origem: 'validacao-script' },
  createdBy: 'codex-validate-us094',
});
console.log('[US094] ISSUE:', issued.success ? 'OK' : 'FAIL', issued.success ? '' : issued.error);
if (!issued.success) process.exit(1);

const token = issued.token;

const validated = await validatePublicInterestToken(token);
console.log('[US094] VALIDATE:', validated.success ? 'OK' : 'FAIL', validated.success ? '' : validated.error);
if (!validated.success) process.exit(1);

const consumed = await consumePublicInterestToken(token, { payload: { teste: true, via: 'script' } });
console.log('[US094] CONSUME-1:', consumed.success ? 'OK' : 'FAIL', consumed.success ? '' : consumed.error);
if (!consumed.success) process.exit(1);

const consumedAgain = await consumePublicInterestToken(token, { payload: { teste: true, via: 'script-again' } });
console.log('[US094] CONSUME-2 (expected fail):', consumedAgain.success ? 'UNEXPECTED_OK' : 'EXPECTED_FAIL', consumedAgain.success ? '' : consumedAgain.error);

if (consumedAgain.success) process.exit(1);
console.log('[US094] RESULT: PASS');
