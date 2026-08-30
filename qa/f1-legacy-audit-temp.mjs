import fs from 'node:fs';
import path from 'node:path';

const roots=['src','qa'];
const patterns=[
  /f1_2010/ig,
  /\bF1\b/g,
  /racecar/ig,
  /legacy/ig,
  /V21\.21\.(?:2[0-9]|1[0-9])/g,
  /steeringInputExponent/ig,
  /yawResponseMultiplier/ig,
  /steeringGripEnvelopeFraction/ig,
  /aeroDownforce/ig,
  /absEnabled/ig,
  /powerOversteer/ig,
];

function walk(dir,out=[]){
  for(const name of fs.readdirSync(dir)){
    const full=path.join(dir,name);
    const st=fs.statSync(full);
    if(st.isDirectory())walk(full,out);
    else if(/\.(?:js|mjs|cjs)$/.test(name))out.push(full.replaceAll('\\','/'));
  }
  return out;
}

for(const root of roots){
  const files=walk(root);
  console.log(`\n=== ${root.toUpperCase()} (${files.length} files) ===`);
  for(const file of files){
    const text=fs.readFileSync(file,'utf8');
    const lines=text.split(/\r?\n/);
    const hits=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(patterns.some(re=>{re.lastIndex=0;return re.test(line)}))hits.push(`${i+1}: ${line.trim()}`);
    }
    if(hits.length){
      console.log(`\n--- ${file} ---`);
      for(const hit of hits)console.log(hit);
    }
  }
}
