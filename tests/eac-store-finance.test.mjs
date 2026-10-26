import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../utils/eacStorePix.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {generatePixCopyPaste}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

function crc16(payload){
 let crc=0xffff;
 for(const c of payload){crc^=c.charCodeAt(0)<<8;for(let i=0;i<8;i++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}
 return crc.toString(16).toUpperCase().padStart(4,'0');
}
test('PIX BR Code inclui valor exato e CRC válido',()=>{
 const pix=generatePixCopyPaste({key:'teste@example.org',receiverName:'EAC Porciuncula',receiverCity:'Niteroi',amount:80,txid:'REC202600001'});
 assert.match(pix,/BR.GOV.BCB.PIX/);
 assert.match(pix,/540580.00/);
 assert.equal(pix.slice(-4),crc16(pix.slice(0,-4)));
 assert.ok(!pix.includes('undefined'));
});
test('segredos de loja não são embarcados no frontend de compra',()=>{
 const ui=readFileSync(new URL('../components/StorePreRequest.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/SERVICE_ROLE_KEY|SUPABASE_SERVICE/);
 assert.match(ui,/uploadToSignedUrl/);
 assert.match(ui,/Criar pré-solicitação sem pagamento/);
});
test('checkout financeiro desabilitado por padrão até ativação deliberada',()=>{
 const api=readFileSync(new URL('../utils/eacStoreFinance.ts',import.meta.url),'utf8');
 const publicStore=readFileSync(new URL('../components/PublicEacStore.tsx',import.meta.url),'utf8');
 assert.match(api,/STORE_FINANCE_ENABLED/);
 assert.match(api,/FINANCE_NOT_ENABLED/);
 assert.match(publicStore,/VITE_STORE_FINANCE_ENABLED==='true'/);
 assert.match(api,/eac_auth_token/);
 assert.match(api,/eac_store_financeiro_confirmar/);
 assert.match(api,/createSignedUploadUrl/);
 assert.match(api,/eac_camisa_confirmar_pagamento/);
});
test('migrations usam apenas alterações aditivas e funções atômicas protegidas',()=>{
 const sql=readFileSync(new URL('../docs/migrations/20261026_eac_store_pre_solicitacoes_financeiro_QA.sql',import.meta.url),'utf8');
 assert.match(sql,/for update/);
 assert.match(sql,/already_confirmed/);
 assert.match(sql,/revoke all on function public.eac_camisa_confirmar_pagamento/);
 assert.match(sql,/current_user <> 'service_role'/);
 assert.doesNotMatch(sql,/drop table public.camisa_/i);
 assert.equal((sql.match(/as \$\$/g)||[]).length,3);
 assert.equal((sql.match(/end \$\$;/g)||[]).length,3);
});
