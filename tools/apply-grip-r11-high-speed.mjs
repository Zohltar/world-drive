import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

function patchFile(path,edits){
  let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
  for(const {needle,replacement,label} of edits){
    const at=source.indexOf(needle);
    if(at<0)throw new Error(`Grip R11 missing anchor in ${path}: ${label}`);
    if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Grip R11 ambiguous anchor in ${path}: ${label}`);
    source=source.slice(0,at)+replacement+source.slice(at+needle.length);
  }
  fs.writeFileSync(path,source,'utf8');
  const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(check.status!==0)throw new Error(`${path} syntax error\n${check.stderr||check.stdout}`);
}

const couplingPath='src/physics/drift-force-coupling.js';
const runtimePath='src/driving-runtime-base.js';
const couplingSource=fs.readFileSync(couplingPath,'utf8');
if(couplingSource.includes('Grip R11 — tire saturation alone is not a drift')){
  console.log('Grip R11 already applied');
  process.exit(0);
}

patchFile(couplingPath,[
  {
    label:'sideslip gate helper',
    needle:`export function driftTireForceAuthority({sideslipRad=0,forceCoupledSlide=0}={}){\n  const beta=Math.abs(finite(sideslipRad,0));\n\n`,
    replacement:`export function driftForceSideslipGate(sideslipRad=0){\n  const beta=Math.abs(finite(sideslipRad,0));\n  // Grip R11 — tire saturation alone is not a drift. A normal high-speed lane\n  // correction can momentarily consume most of the friction circle while the\n  // chassis is still aligned with its momentum. Do not promote the drift solver\n  // until body sideslip has clearly left the normal road-car region.\n  return smoothstep01((beta-.07)/.09);\n}\n\nexport function driftTireForceAuthority({sideslipRad=0,forceCoupledSlide=0}={}){\n  const beta=Math.abs(finite(sideslipRad,0));\n\n`
  },
  {
    label:'gate saturation authority',
    needle:`  const sideslipAuthority=smoothstep01((beta-.10)/.34);\n  const saturationAuthority=smoothstep01((finite(forceCoupledSlide,0)-.08)/.58)*.82;\n  return Math.max(sideslipAuthority,saturationAuthority);\n`,
    replacement:`  const sideslipAuthority=smoothstep01((beta-.10)/.34);\n  const saturationAuthority=\n    smoothstep01((finite(forceCoupledSlide,0)-.08)/.58)*\n    .82*\n    driftForceSideslipGate(beta);\n  return Math.max(sideslipAuthority,saturationAuthority);\n`
  }
]);

patchFile(runtimePath,[
  {
    label:'import sideslip gate',
    needle:`  driftTireForceAuthority,\n  tireForceTrajectoryYawRate,\n  blendDriftForce\n`,
    replacement:`  driftTireForceAuthority,\n  driftForceSideslipGate,\n  tireForceTrajectoryYawRate,\n  blendDriftForce\n`
  },
  {
    label:'gate kinematic drift coupling',
    needle:`  const sideT=smoothstep01((sideslip-.30)/.85);\n  const forceT=smoothstep01((slide-.12)/.68);\n  return 1-.94*Math.max(sideT,forceT);\n`,
    replacement:`  const sideT=smoothstep01((sideslip-.30)/.85);\n  const forceT=\n    smoothstep01((slide-.12)/.68)*\n    driftForceSideslipGate(sideslip);\n  return 1-.94*Math.max(sideT,forceT);\n`
  },
  {
    label:'remove saturation-only trajectory switch',
    needle:`        (driftPhysicalAuthority>.12||forceCoupledSlide>.10||driftKinematicScale<.88);\n`,
    replacement:`        (driftPhysicalAuthority>.12||driftKinematicScale<.88);\n`
  }
]);

console.log('Grip R11 high-speed trajectory fix applied');
