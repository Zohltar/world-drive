import fs from 'node:fs';

{
  const path='src/physics/braking-tire-control.js';
  let s=fs.readFileSync(path,'utf8');
  const old=`export function lockedTireGroundForce({\n  bodyX=0,\n  bodyZ=0,\n  normalLoadN=0,\n  slideMu=.75,\n  steerAngle=0,\n  localX=0,\n  localZ=0\n}={}){\n  const vx=finite(bodyX,0);\n  const vz=finite(bodyZ,0);\n  const speed=Math.hypot(vx,vz);\n  const fz=Math.max(0,finite(normalLoadN,0));\n  if(speed<.20||fz<=1){\n    return {forceX:0,forceZ:0,fxWheel:0,fyWheel:0,yawMomentNm:0,mu:0};\n  }\n\n  const mu=clamp(Math.abs(finite(slideMu,.75)),.05,2.5);\n  const magnitude=mu*fz;\n  const forceX=-magnitude*vx/speed;\n  const forceZ=-magnitude*vz/speed;\n\n  // Convert the physical body-frame force back to wheel coordinates only for\n  // diagnostics. The body-frame vector above is the authoritative direction.\n  const delta=finite(steerAngle,0);\n  const s=Math.sin(delta),c=Math.cos(delta);\n  const fxWheel=forceX*s+forceZ*c;\n  const fyWheel=forceX*c-forceZ*s;\n  const yawMomentNm=finite(localZ,0)*forceX-finite(localX,0)*forceZ;\n\n  return {forceX,forceZ,fxWheel,fyWheel,yawMomentNm,mu};\n}`;
  const next=`export function lockedTireGroundForce({\n  bodyX=0,\n  bodyZ=0,\n  normalLoadN=0,\n  slideMu=.75,\n  lateralScale=1,\n  steerAngle=0,\n  localX=0,\n  localZ=0\n}={}){\n  const vx=finite(bodyX,0);\n  const vz=finite(bodyZ,0);\n  const speed=Math.hypot(vx,vz);\n  const fz=Math.max(0,finite(normalLoadN,0));\n  if(speed<.20||fz<=1){\n    return {forceX:0,forceZ:0,fxWheel:0,fyWheel:0,yawMomentNm:0,mu:0,lateralScale:1};\n  }\n\n  const mu=clamp(Math.abs(finite(slideMu,.75)),.05,2.5);\n  const crossScale=clamp(Math.abs(finite(lateralScale,1)),.05,1);\n  const magnitude=mu*fz;\n  const delta=finite(steerAngle,0);\n  const sinD=Math.sin(delta),cosD=Math.cos(delta);\n\n  // Grip R20 — a fully locked tire still has directional tread/carcass friction.\n  // Preserve full kinetic braking along the tire's rolling axis, while allowing\n  // a handbrake-locked rear tire to have lower cross-tread sliding authority.\n  // lateralScale=1 reproduces the previous isotropic R8 force exactly.\n  const vLong=vx*sinD+vz*cosD;\n  const vLat=vx*cosD-vz*sinD;\n  const fxWheel=-magnitude*(vLong/speed);\n  const fyWheel=-magnitude*crossScale*(vLat/speed);\n  const forceX=fxWheel*sinD+fyWheel*cosD;\n  const forceZ=fxWheel*cosD-fyWheel*sinD;\n  const yawMomentNm=finite(localZ,0)*forceX-finite(localX,0)*forceZ;\n\n  return {forceX,forceZ,fxWheel,fyWheel,yawMomentNm,mu,lateralScale:crossScale};\n}`;
  if(!s.includes(old))throw new Error('R20 braking anchor not found');
  s=s.replace(old,next);
  fs.writeFileSync(path,s);
}

{
  const path='src/physics/per-wheel-shadow-solver.js';
  let s=fs.readFileSync(path,'utf8');
  const old=`        const groundSlide=lockedTireGroundForce({\n          bodyX:patch.bodyX,\n          bodyZ:patch.bodyZ,\n          normalLoadN,\n          slideMu:force?.slideMu,\n          steerAngle,\n          localX,\n          localZ\n        });`;
  const next=`        const handbrakeLockedLateralScale=\n          handbrake&&rear\n            ?clamp(finite(vehicle?.handbrakeLockedLateralScale,.46),.25,1)\n            :1;\n        const groundSlide=lockedTireGroundForce({\n          bodyX:patch.bodyX,\n          bodyZ:patch.bodyZ,\n          normalLoadN,\n          slideMu:force?.slideMu,\n          lateralScale:handbrakeLockedLateralScale,\n          steerAngle,\n          localX,\n          localZ\n        });`;
  if(!s.includes(old))throw new Error('R20 solver anchor not found');
  s=s.replace(old,next);
  fs.writeFileSync(path,s);
}

{
  const path='qa-grip-full-runtime-180-probe-r20.mjs';
  let s=fs.readFileSync(path,'utf8');
  if(!s.includes("handbrake:t=>t>=.18&&t<1.8"))throw new Error('R20 probe duration anchor not found');
  s=s.replace("handbrake:t=>t>=.18&&t<1.8","handbrake:t=>t>=.18&&t<3.0");
  const anchor=`  const rows=ids.map(id=>run(id,scenario));\n  console.table(rows.map(r=>({id:r.id,maxHeading:r.maxHeading,maxSlip:r.maxSlip,finalSpeedKmh:r.finalSpeedKmh,finalYawDegS:r.finalYawDegS,reversalCount:r.reversalCount})));`;
  const repl=`  const rows=ids.map(id=>run(id,scenario));\n  if(scenario.name==='HB_HELD_60KPH'){\n    for(const targetId of ['id4','i3_2017']){\n      const row=rows.find(r=>r.id===targetId);\n      const cross=row?.milestones?.[120];\n      if(!cross||cross.t>=3.0)throw new Error(\`${'${targetId}'} failed to cross 120deg while handbrake remained applied: ${'${JSON.stringify(row)}'}\`);\n    }\n  }\n  console.table(rows.map(r=>({id:r.id,maxHeading:r.maxHeading,maxSlip:r.maxSlip,finalSpeedKmh:r.finalSpeedKmh,finalYawDegS:r.finalYawDegS,reversalCount:r.reversalCount})));`;
  if(!s.includes(anchor))throw new Error('R20 probe assertion anchor not found');
  s=s.replace(anchor,repl);
  fs.writeFileSync(path,s);
}

console.log('Applied Grip R20 handbrake locked-tire lateral friction patch');
