import fs from 'node:fs';
const path='.github/workflows/qa-dev-integration.yml';
let s=fs.readFileSync(path,'utf8');
const anchor=`      - name: Grip R20 handbrake locked-tire rotation QA\n        run: |\n          node qa-grip-handbrake-lateral-r20.mjs\n          node qa-grip-full-runtime-180-probe-r20.mjs\n`;
if(!s.includes(anchor))throw new Error('R20 CI anchor missing');
const block=`${anchor}      - name: Grip R21 F1 high-speed front-slip counter-yaw QA\n        run: node qa-grip-f1-front-slip-r21.mjs\n`;
s=s.replace(anchor,block);
fs.writeFileSync(path,s);
console.log('R21 CI GATE PATCH: PASS');
