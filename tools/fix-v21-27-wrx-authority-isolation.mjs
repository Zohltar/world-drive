import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const runtimePath=path.join(root,'src','driving-runtime.js');
const solverPath=path.join(root,'src','physics','per-wheel-shadow-solver.js');

function fail(message){
  console.error(`V21.27 WRX AUTHORITY ISOLATION: ABORTED\n${message}`);
  process.exit(1);
}
function readEditable(filePath){
  const raw=fs.readFileSync(filePath,'utf8');
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  return {raw,eol,lf:raw.replace(/\r\n/g,'\n')};
}
function restoreEol(lf,eol){return eol==='\r\n'?lf.replace(/\n/g,'\r\n'):lf;}
function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)fail(`Missing ${label} anchor.`);
  if(source.indexOf(needle,first+needle.length)>=0)fail(`Ambiguous ${label} anchor.`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}
function syntaxCheck(filePath){
  const result=spawnSync(process.execPath,['--check',filePath],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||result.stdout||`Syntax check failed: ${filePath}`);
}

const runtimeFile=readEditable(runtimePath);
const solverFile=readEditable(solverPath);
let runtime=runtimeFile.lf;
let solver=solverFile.lf;

const marker='V21.27.5 WRX AUTHORITY ISOLATION';
if(runtime.includes(marker)){
  console.log('V21.27 WRX AUTHORITY ISOLATION: ALREADY APPLIED');
  process.exit(0);
}
if(!runtime.includes('wrxAuthority.apply({')||!runtime.includes('wrxPhysicsAuthorityEnabled')){
  fail('WRX authority integration is required first.');
}

// Expose the real tire breakaway state so runtime telemetry no longer needs the
// legacy drift solver while the WRX authority bridge is active.
solver=replaceOnce(
  solver,
  `    locked:!!wheel.locked,\n    slipRatio:wheel.slipRatio,`,
  `    locked:!!wheel.locked,\n    slideBlend:Number(wheel.slideBlend)||0,\n    peakSlipAngleRad:Number(wheel.peakSlipAngleRad)||0,\n    peakSlipRatio:Number(wheel.peakSlipRatio)||0,\n    slipRatio:wheel.slipRatio,`,
  'shadow wheel slip diagnostics'
);
solver=replaceOnce(
  solver,
  `        wheelOmega:state.omega,\n        locked:integrated.locked,\n        ...force`,
  `        wheelOmega:state.omega,\n        locked:integrated.locked,\n        peakSlipAngleRad:tire.peakSlipAngleRad,\n        peakSlipRatio:tire.peakSlipRatio,\n        ...force`,
  'shadow wheel tire metadata'
);

// Decide authority before lane-assist/legacy lateral code. This lets the WRX
// experimental path avoid any steering correction driven by legacy slip state.
runtime=replaceOnce(
  runtime,
  `    const speedAbs=Math.abs(speed);\n   \n    // V21.21.19 — physical lane-keep assist.`,
  `    const speedAbs=Math.abs(speed);\n\n    // ${marker}\n    // Determine the experimental WRX path before any legacy lateral helper can\n    // influence steering or speed. Autopilot/airborne/parking-speed states keep\n    // the proven V21.26 fallback exactly as before.\n    const authorityVehicleId=getVehicleId?.()||'unknown';\n    const wrxAuthorityCandidate=\n      wrxPhysicsAuthorityEnabled&&\n      authorityVehicleId==='wrx'&&\n      !airborneNow&&\n      !autopilot&&\n      speedAbs>=2;\n   \n    // V21.21.19 — physical lane-keep assist.`,
  'early WRX authority gate'
);

runtime=replaceOnce(
  runtime,
  `      assist&&\n      !autopilot&&\n      !airborneNow&&`,
  `      assist&&\n      !autopilot&&\n      !wrxAuthorityCandidate&&\n      !airborneNow&&`,
  'legacy lane-assist isolation'
);

runtime=replaceOnce(
  runtime,
  `    const authorityVehicleId=getVehicleId?.()||'unknown';\n    const authorityStart={\n      heading,\n      velocityHeading,\n      dynamicYawRate\n    };\n    const wrxAuthorityCandidate=\n      wrxPhysicsAuthorityEnabled&&\n      authorityVehicleId==='wrx'&&\n      !airborneNow&&\n      !autopilot&&\n      speedAbs>=2;`,
  `    const authorityStart={\n      heading,\n      velocityHeading,\n      dynamicYawRate\n    };`,
  'late duplicate WRX authority gate'
);

// Legacy four-wheel-slide scrub modifies scalar speed after the new tire solver
// has already sampled the frame. That creates a mixed old/new state and can feed
// instability back into the next contact-patch solve. Keep it only on fallback.
runtime=replaceOnce(
  runtime,
  `      !airborneNow&&\n      fourWheelSlide>.01&&\n      speedAbs>6`,
  `      !airborneNow&&\n      !wrxAuthorityCandidate&&\n      fourWheelSlide>.01&&\n      speedAbs>6`,
  'legacy four-wheel speed scrub isolation'
);

const oldAuthorityApply=`    if(authorityResult.applied){\n      heading=authorityResult.heading;\n      velocityHeading=authorityResult.velocityHeading;\n      dynamicYawRate=authorityResult.dynamicYawRate;\n      wrxAuthorityLateralAccel=authorityResult.lateralAccel;\n    }else{\n      wrxAuthorityLateralAccel=0;\n    }`;

const newAuthorityApply=`    if(authorityResult.applied){\n      heading=authorityResult.heading;\n      velocityHeading=authorityResult.velocityHeading;\n      dynamicYawRate=authorityResult.dynamicYawRate;\n      wrxAuthorityLateralAccel=authorityResult.lateralAccel;\n\n      // V21.27.5 — replace ALL persistent legacy slip telemetry with the actual\n      // contact-patch state. The old solver may still execute above for A/B\n      // comparison, but none of its drift state survives into the next frame.\n      const authorityWheels=Array.isArray(physicsStep?.wheels)?physicsStep.wheels:[];\n      if(authorityWheels.length){\n        wheelGripUsage=authorityWheels.map(w=>\n          physicsClamp(Number(w.utilization)||0,0,1.35)\n        );\n        wheelLateralUsage=authorityWheels.map(w=>{\n          const peak=Math.max(.01,Number(w.peakSlipAngleRad)||7*Math.PI/180);\n          return physicsClamp(Math.abs(Number(w.slipAngle)||0)/peak,0,1.5);\n        });\n        wheelLongitudinalUsage=authorityWheels.map(w=>{\n          const peak=Math.max(.02,Number(w.peakSlipRatio)||.11);\n          return physicsClamp(Math.abs(Number(w.slipRatio)||0)/peak,0,1.5);\n        });\n        wheelSlipLevels=authorityWheels.map((w,i)=>\n          physicsClamp(\n            Math.max(\n              Number(w.slideBlend)||0,\n              (wheelLateralUsage[i]||0)-1,\n              (wheelLongitudinalUsage[i]||0)-1\n            ),\n            0,\n            1\n          )\n        );\n\n        const frontAuthority=authorityWheels.filter(w=>w.front);\n        const rearAuthority=authorityWheels.filter(w=>!w.front);\n        const axleBreakaway=wheels=>\n          wheels.length\n            ?Math.max(...wheels.map(w=>physicsClamp(Number(w.slideBlend)||0,0,1)))\n            :0;\n        frontSlipAmount=axleBreakaway(frontAuthority);\n        rearSlipAmount=axleBreakaway(rearAuthority);\n        lateralGripUsage=authorityWheels.length\n          ?Math.max(...wheelLateralUsage.map(v=>physicsClamp(v,0,1.35)))\n          :0;\n      }\n    }else{\n      wrxAuthorityLateralAccel=0;\n    }`;

runtime=replaceOnce(runtime,oldAuthorityApply,newAuthorityApply,'WRX shadow telemetry ownership');

const backups=[[runtimePath,runtimeFile.raw],[solverPath,solverFile.raw]];
try{
  fs.writeFileSync(runtimePath,restoreEol(runtime,runtimeFile.eol),'utf8');
  fs.writeFileSync(solverPath,restoreEol(solver,solverFile.eol),'utf8');
  syntaxCheck(runtimePath);
  syntaxCheck(solverPath);
}catch(error){
  for(const [filePath,raw] of backups)fs.writeFileSync(filePath,raw,'utf8');
  fail(`Generated source failed syntax check and was restored.\n${error?.message||error}`);
}

console.log('V21.27 WRX AUTHORITY ISOLATION: APPLIED');
console.log('Legacy drift no longer controls WRX lane assist, speed scrub or persistent slip telemetry while tire-force authority is active.');
console.log('WRX authority remains experimental; WorldDrivePhysicsAuthority(false) still restores full V21.26 fallback.');