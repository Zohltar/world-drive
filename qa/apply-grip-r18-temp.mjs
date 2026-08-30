import fs from 'node:fs';

{
  const path='src/physics/per-wheel-shadow-solver.js';
  let s=fs.readFileSync(path,'utf8');
  const old=`      const axleContactCount=Math.max(1,counts[axleIndex]?.total||1);\n      const driveTorqueNm=driveForceN*wheelShare(axle,'driveShare',axleContactCount)*tire.rollingRadiusM;\n\n      // P2 refinement — with ABS active, left/right service-brake torque follows`;
  const neu=`      const axleContactCount=Math.max(1,counts[axleIndex]?.total||1);\n      const rear=axle.positionM<0||contact.front===false;\n      const rawDriveTorqueNm=driveForceN*wheelShare(axle,'driveShare',axleContactCount)*tire.rollingRadiusM;\n      // Grip R18 — a mechanical handbrake owns the rear wheel while applied.\n      // Motor/engine torque cannot simultaneously keep that same wheel driven\n      // and prevent it from entering the locked/sliding state. FWD front drive\n      // remains available; AWD keeps only its front-axle share.\n      const driveTorqueNm=handbrake&&rear?0:rawDriveTorqueNm;\n\n      // P2 refinement — with ABS active, left/right service-brake torque follows`;
  if(!s.includes(old))throw new Error('R18 drive torque anchor missing');
  s=s.replace(old,neu);
  const oldRear=`\n      const rear=axle.positionM<0||contact.front===false;\n      let handbrakeTorqueNm=0;`;
  if(!s.includes(oldRear))throw new Error('R18 rear anchor missing');
  s=s.replace(oldRear,`\n      let handbrakeTorqueNm=0;`);
  fs.writeFileSync(path,s);
}

{
  const path='src/driving-runtime-base.js';
  let s=fs.readFileSync(path,'utf8');
  const anchor=`export function handbrakeLateralEffectForSpeed(speedAbs=0){\n  return smoothstep01((Math.max(0,Number(speedAbs)||0)-2.5)/6.5);\n}\n`;
  const helpers=anchor+`\nexport function rearAxleStaticLoadFraction(vehicle={}){\n  const axles=Array.isArray(vehicle?.axles)?vehicle.axles:[];\n  if(axles.length>=2){\n    const rear=axles.filter(axle=>(Number(axle?.positionM)||0)<0).reduce((sum,axle)=>sum+Math.max(0,Number(axle?.staticLoadFraction)||0),0);\n    if(rear>0)return Math.max(.05,Math.min(.90,rear));\n  }\n  return Math.max(.05,Math.min(.90,1-(Number(vehicle?.frontWeightBias)||.55)));\n}\n\nexport function handbrakeDriveRetentionScale({vehicle={},handbrake=false}={}){\n  if(!handbrake)return 1;\n  const drivetrain=String(vehicle?.drivetrain||'AWD');\n  if(drivetrain==='FWD')return 1;\n  if(drivetrain==='RWD')return 0;\n  return Math.max(0,Math.min(1,Number(vehicle?.driveBiasFront)||.5));\n}\n\nexport function handbrakeLongitudinalDecelCapacity({vehicle={},longitudinalMu=1,slidingMuRatio=.72}={}){\n  const rearLoad=rearAxleStaticLoadFraction(vehicle);\n  const mu=Math.max(.05,Number(longitudinalMu)||1);\n  const slide=Math.max(.50,Math.min(.95,Number(slidingMuRatio)||.72));\n  return GRAVITY*rearLoad*mu*slide;\n}\n\nexport function shouldCanonicalizeMomentumHeading({speedAbs=0}={}){\n  // Momentum direction is still physically meaningful at walking speed during\n  // a spin/J-turn. Only collapse the heading once translation is essentially\n  // stopped; the old 1.2 m/s snap created a hard ~90-degree rotation wall.\n  return Math.max(0,Math.abs(Number(speedAbs)||0))<.12;\n}\n`;
  if(!s.includes(anchor))throw new Error('R18 helper anchor missing');
  s=s.replace(anchor,helpers);

  const oldForce=`    const driveForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBodyDriveAccel,surfaceMu:longitudinalMu,mode:'drive',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.drive);\n    const brakeForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBrakeAccel,surfaceMu:longitudinalMu,mode:'brake',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.brake);\n    const appliedBodyDriveAccel=driveForce.acceleration;\n    const driveMomentumAccel=appliedBodyDriveAccel*driveAxisProjection;`;
  const newForce=`    const driveForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBodyDriveAccel,surfaceMu:longitudinalMu,mode:'drive',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.drive);\n    const brakeForce=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:requestedBrakeAccel,surfaceMu:longitudinalMu,mode:'brake',airborne:airborneNow,speedAbs:longitudinalSpeedAbs},dynamicsScratch.brake);\n    const appliedBodyDriveAccelRaw=driveForce.acceleration;\n    const handbrakeDriveScale=handbrakeDriveRetentionScale({vehicle:VEHICLE,handbrake:hand});\n    const appliedBodyDriveAccel=appliedBodyDriveAccelRaw*handbrakeDriveScale;\n    const driveMomentumAccel=appliedBodyDriveAccel*driveAxisProjection;`;
  if(!s.includes(oldForce))throw new Error('R18 drive force anchor missing');
  s=s.replace(oldForce,newForce);

  const oldHand=`    if(hand&&!airborneNow){\n      const handRequest=-Math.sign(speed||gradeForce.acceleration||1)*8.5;\n      // A fully locked tire is on the kinetic/sliding plateau, below peak mu.\n      const handbrakeSlidingMuRatio=physicsClamp(Number(VEHICLE.handbrakeSlidingMuRatio??.72)||.72,.65,.90);\n      accel+=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:handRequest,surfaceMu:longitudinalMu*handbrakeSlidingMuRatio,mode:'handbrake',airborne:false,speedAbs:longitudinalSpeedAbs},dynamicsScratch.handbrake).acceleration;\n    }`;
  const newHand=`    if(hand&&!airborneNow){\n      // Grip R18 — the handbrake acts through the rear axle only. The previous\n      // whole-car 8.5 m/s² request double-counted rear lock and could stop a\n      // slower-rotating chassis before it crossed 90 degrees.\n      const handbrakeSlidingMuRatio=physicsClamp(Number(VEHICLE.handbrakeSlidingMuRatio??.72)||.72,.65,.90);\n      const handCapacity=handbrakeLongitudinalDecelCapacity({vehicle:VEHICLE,longitudinalMu,slidingMuRatio:handbrakeSlidingMuRatio});\n      const handRequest=-Math.sign(speed||gradeForce.acceleration||1)*handCapacity;\n      accel+=longitudinalTractionLimit({vehicle:VEHICLE,requestedAccel:handRequest,surfaceMu:longitudinalMu*handbrakeSlidingMuRatio,mode:'handbrake',airborne:false,speedAbs:longitudinalSpeedAbs},dynamicsScratch.handbrake).acceleration;\n    }`;
  if(!s.includes(oldHand))throw new Error('R18 handbrake scalar anchor missing');
  s=s.replace(oldHand,newHand);

  const oldSolver=`      requestedDriveAccel:appliedBodyDriveAccel,requestedBrakeAccel,handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'`;
  const newSolver=`      requestedDriveAccel:appliedBodyDriveAccelRaw,requestedBrakeAccel,\n      longitudinalLoadTransferAccel:appliedBodyDriveAccel+requestedBrakeAccel,\n      handbrake:hand,surfaceId:onPavement?'asphalt-dry':'dirt'`;
  if(!s.includes(oldSolver))throw new Error('R18 solver input anchor missing');
  s=s.replace(oldSolver,newSolver);

  const oldSnap=`    if(!Number.isFinite(velocityHeading)||Math.abs(speed)<1.2)velocityHeading=heading;`;
  const newSnap=`    if(!Number.isFinite(velocityHeading)||shouldCanonicalizeMomentumHeading({speedAbs}))velocityHeading=heading;`;
  if(!s.includes(oldSnap))throw new Error('R18 low-speed snap anchor missing');
  s=s.replace(oldSnap,newSnap);
  fs.writeFileSync(path,s);
}

console.log('Applied Grip R18 rear handbrake ownership and low-speed momentum fix');
