import fs from 'node:fs';
import path from 'node:path';

const terms=[
  'velocityHeading',
  'bodyRelativeLongitudinalSpeed',
  'bodyRelativeLateralSpeed',
  'shouldCanonicalizeMomentumHeading',
  'resolveOpposingDriveMomentumCrossing',
  'jTurnTransientSteeringSpeed',
  'bodyRelativeSteeringSpeed'
];
function walk(dir,out=[]){for(const n of fs.readdirSync(dir)){const f=path.join(dir,n);const st=fs.statSync(f);if(st.isDirectory())walk(f,out);else if(/\.(?:js|mjs|cjs)$/.test(n))out.push(f.replaceAll('\\','/'));}return out;}
for(const root of ['src','qa']){
  console.log(`\n=== ${root.toUpperCase()} ===`);
  for(const file of walk(root)){
    const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
    const hits=[];
    for(let i=0;i<lines.length;i++){
      if(terms.some(t=>lines[i].includes(t))){
        const write=/\bvelocityHeading\s*(?:=|\+=|-=|\+\+|--)/.test(lines[i]);
        hits.push(`${i+1}${write?' [WRITE]':''}: ${lines[i].trim()}`);
      }
    }
    if(hits.length){
      console.log(`\n--- ${file} ---`);
      hits.forEach(h=>console.log(h));
    }
  }
}
