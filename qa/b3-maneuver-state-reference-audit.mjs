import fs from 'node:fs';
import path from 'node:path';

const symbols=[
  'jTurnEntryEligible',
  'jTurnExitEligible',
  'advanceJTurnLatchedState',
  'jTurnTransientSteeringSpeed',
  'handbrakeLateralEffectForSpeed',
  'advanceHandbrakeRearSlipState',
  'rearHandbrakeSlipState',
  'jTurnLatchedActive'
];

const roots=['src','qa','.'];
const files=[];
const seen=new Set();
function walk(p){
  const st=fs.statSync(p);
  if(st.isDirectory()){
    for(const name of fs.readdirSync(p)){
      if(['node_modules','.git','dist','out'].includes(name))continue;
      walk(path.join(p,name));
    }
    return;
  }
  if(!/\.(?:js|mjs|cjs)$/.test(p))return;
  const normalized=p.replaceAll('\\','/');
  if(seen.has(normalized))return;
  seen.add(normalized);
  files.push(normalized);
}
for(const root of roots)if(fs.existsSync(root))walk(root);

const report={};
for(const symbol of symbols){
  report[symbol]=[];
  for(const file of files){
    const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
    lines.forEach((line,i)=>{
      if(line.includes(symbol))report[symbol].push({file,line:i+1,text:line.trim()});
    });
  }
}
console.log('B3 MANEUVER STATE REFERENCE AUDIT',JSON.stringify(report,null,2));
for(const symbol of symbols){
  if(report[symbol].length===0)throw new Error(`expected active/reference symbol missing: ${symbol}`);
}
console.log('B3 MANEUVER STATE REFERENCE AUDIT: PASS');
