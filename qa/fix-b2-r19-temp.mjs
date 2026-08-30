import fs from 'node:fs';
const path='qa-grip-jturn-legacy-r19.mjs';
let s=fs.readFileSync(path,'utf8');
s=s.replaceAll('advanceJTurnTransientYawState({','advanceJTurnLatchedState({');
const live=s.split(/\r?\n/).filter(line=>line.includes('advanceJTurnTransientYawState')&&!line.includes("source.includes('advanceJTurnTransientYawState')"));
if(live.length)throw new Error(`old R19 helper call remains: ${live.join(' | ')}`);
fs.writeFileSync(path,s);
console.log('B2 R19 REFERENCE FIX: PASS');
