import fs from 'node:fs';
const path='tools/apply-drift-stress-r1.mjs';
let s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const duplicated=`export function handbrakeLateralEffectForSpeed\`,
      'J-turn progressive surface authority');`;
const corrected=`\`,
      'J-turn progressive surface authority');`;
const count=s.split(duplicated).length-1;
if(count!==1)throw new Error(`expected one J-turn range tail, found ${count}`);
s=s.replace(duplicated,corrected);
fs.writeFileSync(path,s);
console.log('Drift stress J-turn range tail fixed');
