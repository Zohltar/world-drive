import fs from 'node:fs';
import path from 'node:path';

const terms=[
  'dynamicYawRate','yawRate','driftKinematicCoupling','legacyGripYawAcceleration',
  'driftTireForceAuthority','driftPhysicalAuthority','yawGripResponseScale',
  'authoritativeYawAccel','frictionYawAccel','predictedYawAccel','yawResponseRate',
  'powerOversteerYaw','frontDominance','fourWheelSlide','legacyDriftAssist'
];

function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(p));
    else if(/\.(js|mjs)$/.test(entry.name))out.push(p);
  }
  return out;
}

for(const root of ['src','qa']){
  console.log(`\n=== ${root.toUpperCase()} ===`);
  for(const file of walk(root)){
    const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
    const hits=[];
    for(let i=0;i<lines.length;i++){
      if(terms.some(term=>lines[i].includes(term)))hits.push(`${i+1}: ${lines[i].trim()}`);
    }
    if(hits.length){
      console.log(`\n--- ${file} ---`);
      console.log(hits.join('\n'));
    }
  }
}
