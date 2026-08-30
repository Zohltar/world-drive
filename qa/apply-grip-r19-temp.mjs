import fs from 'node:fs';
const path='src/driving-runtime-base.js';
let source=fs.readFileSync(path,'utf8');

const oldHelper=`export function jTurnTransientYawActive({\n  bodyLongitudinalSpeed=0,\n  speedAbs=0,\n  steerAngle=0,\n  handbrake=false,\n  airborne=false,\n  onPavement=true\n}={}){\n  return !!(\n    !handbrake&&\n    !airborne&&\n    onPavement&&\n    Number(bodyLongitudinalSpeed)<-4.0&&\n    Math.abs(Number(speedAbs)||0)>=8.5&&\n    Math.abs(Number(steerAngle)||0)>=.12\n  );\n}\n`;
const newHelper=oldHelper+`\n// Grip R19 — V21.27 P6.1 originally existed because body-longitudinal speed\n// collapses to zero at 90 degrees even while translational momentum remains\n// large. Later drift cleanup correctly removed that full-speed shortcut from\n// ordinary driving, but the J-turn P10 exception remained an instantaneous\n// predicate and therefore switched itself off before the chassis reached 90°.\n// Latch only a genuine reverse-entry J-turn, carry it through the sideways\n// region, then release near the forward-aligned exit axis.\nexport function advanceJTurnTransientYawState({\n  active=false,\n  bodyLongitudinalSpeed=0,\n  speedAbs=0,\n  steerAngle=0,\n  handbrake=false,\n  airborne=false,\n  onPavement=true,\n  sideslipRad=0\n}={}){\n  const entry=jTurnTransientYawActive({\n    bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake,airborne,onPavement\n  });\n  if(!active)return entry;\n  if(handbrake||airborne||!onPavement)return false;\n  if(Math.abs(Number(speedAbs)||0)<2.5)return false;\n  if(Math.abs(Number(steerAngle)||0)<.05)return false;\n  const alignedExit=\n    Number(bodyLongitudinalSpeed)>2.0&&\n    Math.abs(Number(sideslipRad)||0)<.10;\n  return !alignedExit;\n}\n\nexport function jTurnTransientSteeringSpeed({speed=0,fallbackSpeed=0,active=false}={}){\n  if(!active)return Number(fallbackSpeed)||0;\n  // A latched J-turn entered in reverse. Preserve that steering travel sign\n  // through 90 degrees instead of letting cos(beta) drive it to zero and then\n  // reverse the bicycle yaw target while the chassis is still rotating.\n  return -Math.abs(Number(speed)||0);\n}\n`;
if(!source.includes(oldHelper))throw new Error('R19 J-turn helper anchor missing');
source=source.replace(oldHelper,newHelper);

const oldState=`  let wasAirborne=false;\n  let rearHandbrakeSlipState=0;`;
const newState=`  let wasAirborne=false;\n  let rearHandbrakeSlipState=0;\n  let jTurnTransientLatched=false;`;
if(!source.includes(oldState))throw new Error('R19 runtime state anchor missing');
source=source.replace(oldState,newState);

const oldRuntime=`    const bodyLongitudinalSpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});\n    const steeringTravelSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:hand});\n    const steeringAuthority=postSpinSteeringAuthority({rearSlipAmount,heading,velocityHeading,handbrake:hand});\n    const jTurnYawActive=jTurnTransientYawActive({bodyLongitudinalSpeed,speedAbs,steerAngle,handbrake:hand,airborne:airborneNow,onPavement});`;
const newRuntime=`    const bodyLongitudinalSpeed=bodyRelativeLongitudinalSpeed({speed,heading,velocityHeading});\n    jTurnTransientLatched=advanceJTurnTransientYawState({\n      active:jTurnTransientLatched,\n      bodyLongitudinalSpeed,\n      speedAbs,\n      steerAngle,\n      handbrake:hand,\n      airborne:airborneNow,\n      onPavement,\n      sideslipRad:currentSideslip\n    });\n    const baseSteeringTravelSpeed=bodyRelativeSteeringSpeed({speed,heading,velocityHeading,handbrake:hand});\n    const steeringTravelSpeed=jTurnTransientSteeringSpeed({\n      speed,\n      fallbackSpeed:baseSteeringTravelSpeed,\n      active:jTurnTransientLatched\n    });\n    const steeringAuthority=postSpinSteeringAuthority({rearSlipAmount,heading,velocityHeading,handbrake:hand});\n    const jTurnYawActive=jTurnTransientLatched;`;
if(!source.includes(oldRuntime))throw new Error('R19 runtime J-turn anchor missing');
source=source.replace(oldRuntime,newRuntime);

if(!source.includes('advanceJTurnTransientYawState({'))throw new Error('R19 latch helper missing after patch');
if(!source.includes('const jTurnYawActive=jTurnTransientLatched;'))throw new Error('R19 runtime still uses instantaneous gate');
fs.writeFileSync(path,source);
console.log('Applied Grip R19 legacy J-turn rotation-wall fix');
