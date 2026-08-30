import fs from 'node:fs';
const path='.github/workflows/qa-dev-integration.yml';
let s=fs.readFileSync(path,'utf8');
const anchor='      - name: Cleanup A6 version/build branding QA\n        run: node qa-version-branding-a6.mjs\n';
if(!s.includes(anchor))throw new Error('A6 CI anchor missing');
if(!s.includes('Cleanup A7 repository hygiene QA')){
  s=s.replace(anchor,anchor+'      - name: Cleanup A7 repository hygiene QA\n        run: node qa-repo-hygiene-a7.mjs\n');
}
fs.writeFileSync(path,s);
console.log('A7 CI PATCH: PASS');
