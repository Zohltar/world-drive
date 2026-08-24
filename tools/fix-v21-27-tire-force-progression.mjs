import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const tirePath=path.join(root,'src','physics','tire-model.js');

function fail(message){
  console.error(`V21.27 TIRE FORCE PROGRESSION: ABORTED\n${message}`);
  process.exit(1);
}

function readEditable(filePath){
  const raw=fs.readFileSync(filePath,'utf8');
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  return {raw,eol,lf:raw.replace(/\r\n/g,'\n')};
}

function restoreEol(lf,eol){
  return eol==='\r\n'?lf.replace(/\n/g,'\r\n'):lf;
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)fail(`Missing ${label} anchor.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    fail(`Ambiguous ${label} anchor.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

function syntaxCheck(filePath){
  const result=spawnSync(process.execPath,['--check',filePath],{encoding:'utf8'});
  if(result.status!==0){
    throw new Error(result.stderr||result.stdout||`Syntax check failed: ${filePath}`);
  }
}

const file=readEditable(tirePath);
let source=file.lf;

const marker='V21.27.4 PROGRESSIVE TIRE FORCE';
if(source.includes(marker)){
  console.log('V21.27 TIRE FORCE PROGRESSION: ALREADY APPLIED');
  process.exit(0);
}

source=replaceOnce(
  source,
  `function smoothstep01(value){\n  const t=clamp(finite(value,0),0,1);\n  return t*t*(3-2*t);\n}\n`,
  `function smoothstep01(value){\n  const t=clamp(finite(value,0),0,1);\n  return t*t*(3-2*t);\n}\n\n// V21.27.4 PROGRESSIVE TIRE FORCE\n// Cornering/longitudinal stiffness grows with vertical load instead of staying\n// identical for a lightly loaded and heavily loaded tire. Using the same load\n// exponent as the friction model keeps the normalized breakaway region nearly\n// constant across axle loads; a lighter rear tire no longer reaches its cap\n// several degrees before a front tire solely because Fz is lower.\nfunction loadScaledStiffness(base,normalLoadN,referenceLoadN,exponent=.90){\n  const fz=Math.max(1,finite(normalLoadN,0));\n  const ref=Math.max(1,finite(referenceLoadN,4000));\n  const exp=clamp(finite(exponent,.90),.65,1.05);\n  const scale=Math.pow(fz/ref,exp);\n  return Math.max(1,finite(base,1)*clamp(scale,.12,4.0));\n}\n`,
  'stiffness helper'
);

const oldForceBlock=`  const fxDemand=profile.longitudinalStiffnessN*slip.slipRatio;\n  const fyDemand=-profile.corneringStiffnessNPerRad*slip.slipAngle;\n\n  const slipSeverity=Math.hypot(\n    slip.slipRatio/Math.max(.02,profile.peakSlipRatio),\n    slip.slipAngle/Math.max(1*DEG,profile.peakSlipAngleRad)\n  );\n  const slideBlend=smoothstep01((slipSeverity-1)/1.25);\n  const mu=friction.peak+(friction.slide-friction.peak)*slideBlend;\n  const capacity=Math.max(1,mu*fz);\n  const demandMagnitude=Math.hypot(fxDemand,fyDemand);\n  const scale=demandMagnitude>capacity?capacity/demandMagnitude:1;\n  const fxWheel=fxDemand*scale;\n  const fyWheel=fyDemand*scale;`;

const newForceBlock=`  const longitudinalStiffness=loadScaledStiffness(\n    profile.longitudinalStiffnessN,\n    fz,\n    profile.referenceLoadN,\n    profile.loadSensitivityExponent\n  );\n  const corneringStiffness=loadScaledStiffness(\n    profile.corneringStiffnessNPerRad,\n    fz,\n    profile.referenceLoadN,\n    profile.loadSensitivityExponent\n  );\n\n  const fxLinear=longitudinalStiffness*slip.slipRatio;\n  const fyLinear=-corneringStiffness*slip.slipAngle;\n  const linearDemandMagnitude=Math.hypot(fxLinear,fyLinear);\n  const peakCapacity=Math.max(1,friction.peak*fz);\n\n  // Brush-inspired progressive buildup. tanh preserves the requested small-slip\n  // stiffness around zero, then bends smoothly toward peak friction instead of\n  // abruptly clipping at mu*Fz. This is critical for predictable breakaway.\n  const progressiveMagnitude=\n    peakCapacity*Math.tanh(linearDemandMagnitude/peakCapacity);\n  const progressiveScale=\n    linearDemandMagnitude>1e-9\n      ?progressiveMagnitude/linearDemandMagnitude\n      :0;\n  const fxDemand=fxLinear*progressiveScale;\n  const fyDemand=fyLinear*progressiveScale;\n\n  const slipSeverity=Math.hypot(\n    slip.slipRatio/Math.max(.02,profile.peakSlipRatio),\n    slip.slipAngle/Math.max(1*DEG,profile.peakSlipAngleRad)\n  );\n  const slideBlend=smoothstep01((slipSeverity-1)/1.25);\n  const mu=friction.peak+(friction.slide-friction.peak)*slideBlend;\n  const capacity=Math.max(1,mu*fz);\n  const demandMagnitude=Math.hypot(fxDemand,fyDemand);\n  const scale=demandMagnitude>capacity?capacity/demandMagnitude:1;\n  const fxWheel=fxDemand*scale;\n  const fyWheel=fyDemand*scale;`;

source=replaceOnce(source,oldForceBlock,newForceBlock,'tire force block');

source=replaceOnce(
  source,
  `    utilization:demandMagnitude/capacity,\n    saturated:demandMagnitude>capacity,`,
  `    utilization:demandMagnitude/capacity,\n    saturated:demandMagnitude>=capacity*.999,`,
  'saturation diagnostics'
);

const backup=file.raw;
try{
  fs.writeFileSync(tirePath,restoreEol(source,file.eol),'utf8');
  syntaxCheck(tirePath);
}catch(error){
  fs.writeFileSync(tirePath,backup,'utf8');
  fail(`Generated source failed syntax check and was restored.\n${error?.message||error}`);
}

console.log('V21.27 TIRE FORCE PROGRESSION: APPLIED');
console.log('Load-scaled tire stiffness + progressive brush saturation enabled.');
console.log('Normal corner breakaway should now be gradual; full lock still reaches sliding friction.');