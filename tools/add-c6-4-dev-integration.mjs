import fs from 'node:fs';
const path='.github/workflows/qa-dev-integration.yml';
let source=fs.readFileSync(path,'utf8');
const anchor="      - name: Cleanup C6.3 wheelspin diagnostics QA\n        run: node qa-diagnostics-c6-3.mjs\n";
const addition="      - name: Cleanup C6.4 road-sign diagnostics QA\n        run: node qa-diagnostics-c6-4.mjs\n";
if(!source.includes(addition)){
  if(!source.includes(anchor))throw new Error('C6.3 Dev Integration anchor missing');
  source=source.replace(anchor,anchor+addition);
}
fs.writeFileSync(path,source);
console.log('C6.4 added to Dev Integration');
