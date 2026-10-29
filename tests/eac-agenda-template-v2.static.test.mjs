import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../components/PublicAgendaArt.tsx',import.meta.url),'utf8');

test('Feed agenda continues to derive dates and weekdays from events',()=>{
  assert.match(src,/dayOf\(e\.inicio\)/);
  assert.match(src,/weekDay\(e\.inicio\)/);
  assert.match(src,/clock\(e\.inicio\)/);
});
test('QR is generated from the actual calendar URL',()=>{
  assert.match(src,/qr\.addData\(calendarUrl\)/);
  assert.match(src,/src=\{qrData\}/);
});
test('Illustration blends out the white photo rectangle in the monthly feed',()=>{
  assert.match(src,/mixBlendMode:'multiply'/);
});
test('Monthly feed has a dedicated non-overlapping date layout',()=>{
  assert.match(src,/flexDirection:'column',gap:5,padding:'8px 0'/);
});
test('Render of month uses dynamic month and year',()=>{
  assert.match(src,/month\.toUpperCase\(\)/);
  assert.match(src,/\{year\}/);
});
