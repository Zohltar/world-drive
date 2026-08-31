import fs from 'node:fs';

const file='.github/workflows/qa-dev-integration.yml';
let text=fs.readFileSync(file,'utf8');
const anchor=`      - name: Cleanup C3 road geometry ownership QA\n        run: node qa-road-geometry-c3.mjs\n`;
const insert=`${anchor}      - name: Cleanup C4 forest ownership QA\n        run: node qa-forest-c4.mjs\n`;
if(text.includes('Cleanup C4 forest ownership QA')){
  console.log('C4 already present in Dev Integration');
}else{
  if(!text.includes(anchor))throw new Error('C3 Dev Integration anchor missing');
  text=text.replace(anchor,insert);
  fs.writeFileSync(file,text.replace(/[ \t]+$/gm,'').trimEnd()+'\n');
  console.log('C4 added to Dev Integration');
}
