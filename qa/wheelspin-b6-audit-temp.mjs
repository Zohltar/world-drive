import fs from 'node:fs';
import path from 'node:path';

const roots=['src','qa'];
const rootQa=fs.readdirSync('.').filter(n=>/^qa.*\.mjs$/i.test(n));
const files=[];
function walk(dir){
  if(!fs.existsSync(dir))return;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory())walk(p);
    else if(/\.(?:js|mjs|cjs)$/.test(e.name))files.push(p.replaceAll('\\','/'));
  }
}
for(const r of roots)walk(r);
for(const f of rootQa)files.push(f);

const tokens=[
  'latestRawDriveDemandAccel','latestAppliedDriveAccel',
  'WorldDriveWheelSpinTelemetry','WorldDriveRuntimeWheelspin',
  'wheelspinLevel','wheelspinHoldSec','runtimeWheelspinLevel','runtimeSlidingGripFactor',
  'propulsionSaturationRatio','requestedPropulsionAccel','appliedPropulsionAccel',
  'activeReleaseMultiplier','clutchBreakaway','clutchShockMultiplier','clutchShockDuration',
  'drivenWheelSlipLevels','wheelspinDynamicGripFactor','longitudinalTractionLimit','estimateWheelGripUsage'
];

const hits=[];
for(const file of [...new Set(files)].sort()){
  const text=fs.readFileSync(file,'utf8');
  const lines=text.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    const found=tokens.filter(t=>lines[i].includes(t));
    if(found.length)hits.push({file,line:i+1,tokens:found,text:lines[i].trim()});
  }
}

const grouped=new Map();
for(const h of hits){
  if(!grouped.has(h.file))grouped.set(h.file,[]);
  grouped.get(h.file).push(h);
}
console.log('=== CLEANUP B6 WHEELSPIN OWNERSHIP AUDIT ===');
for(const [file,list] of grouped){
  console.log(`\n--- ${file} ---`);
  for(const h of list)console.log(`${h.line}: ${h.text}`);
}

const dynamics=fs.readFileSync('src/vehicle-dynamics-v21.29.js','utf8');
const runtime=fs.readFileSync('src/driving-runtime.js','utf8');
const base=fs.readFileSync('src/driving-runtime-base.js','utf8');
const qaNames=[...grouped.keys()].filter(f=>f.endsWith('.mjs'));

const findings={
  moduleGlobalDemandHandoff:/let latestRawDriveDemandAccel=0;/.test(dynamics)&&/let latestAppliedDriveAccel=0;/.test(dynamics),
  demandResetAfterGrip:/latestRawDriveDemandAccel=0;[\s\S]*latestAppliedDriveAccel=0;/.test(dynamics),
  runtimePersistentWheelspin:/let wheelspinLevel=0,wheelspinHoldSec=0;/.test(runtime),
  runtimeSecondGripFactor:/wheelspinDynamicGripFactor\(/.test(runtime),
  runtimeSyntheticSkidObserver:/skidMarksWithWheelspin/.test(runtime),
  baseCallsTractionAndGrip:/longitudinalTractionLimit\(/.test(base)&&/estimateWheelGripUsage\(/.test(base),
  qaFiles:qaNames.sort()
};
console.log('\nSUMMARY',JSON.stringify(findings,null,2));
if(!findings.moduleGlobalDemandHandoff)throw new Error('B6 audit expected hidden V21.29 demand handoff but did not find it');
if(!findings.runtimePersistentWheelspin)throw new Error('B6 audit expected runtime persistent wheelspin state but did not find it');
if(!findings.baseCallsTractionAndGrip)throw new Error('B6 audit could not confirm traction→grip frame path');
