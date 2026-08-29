import fs from 'node:fs';
const path='tools/apply-drift-stress-r1.mjs';
let s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const misplaced=`  const start="export function jTurnTransientYawActive({";
  const end="export function handbrakeLateralEffectForSpeed";
  s=replaceRange(s,start,end,
\`export function jTurnTransientYawBlend({
  bodyLongitudinalSpeed=0,
  speedAbs=0,
  steerAngle=0,
  handbrake=false,
  airborne=false,
  onPavement=true,
  surfaceRoadFraction=null
}={}){
  if(handbrake||airborne)return 0;
  const suppliedRoad=Number(surfaceRoadFraction);
  const road=Number.isFinite(suppliedRoad)?clampDynamics(suppliedRoad,0,1):(onPavement?1:0);
  const rearward=smoothstep01((-Number(bodyLongitudinalSpeed)-3.2)/3.0);
  const speedGate=smoothstep01((Math.abs(Number(speedAbs)||0)-7.0)/4.0);
  const steerGate=smoothstep01((Math.abs(Number(steerAngle)||0)-.075)/.09);
  return road*rearward*speedGate*steerGate;
}

export function jTurnTransientYawActive(args={}){
  return jTurnTransientYawBlend(args)>.5;
}

export function handbrakeLateralEffectForSpeed\`,
    'J-turn progressive surface authority');
`;
if(!s.includes(misplaced))throw new Error('misplaced J-turn patch block not found');
s=s.replace(misplaced,'');

const runtimeAnchor=`  const path='src/driving-runtime-base.js';
  let s=read(path);
`;
const runtimeInsert=`  const path='src/driving-runtime-base.js';
  let s=read(path);
  {
    const start="export function jTurnTransientYawActive({";
    const end="export function handbrakeLateralEffectForSpeed";
    s=replaceRange(s,start,end,
\`export function jTurnTransientYawBlend({
  bodyLongitudinalSpeed=0,
  speedAbs=0,
  steerAngle=0,
  handbrake=false,
  airborne=false,
  onPavement=true,
  surfaceRoadFraction=null
}={}){
  if(handbrake||airborne)return 0;
  const suppliedRoad=Number(surfaceRoadFraction);
  const road=Number.isFinite(suppliedRoad)?Math.max(0,Math.min(1,suppliedRoad)):(onPavement?1:0);
  const smooth=v=>{const t=Math.max(0,Math.min(1,Number(v)||0));return t*t*(3-2*t);};
  const rearward=smooth((-Number(bodyLongitudinalSpeed)-3.2)/3.0);
  const speedGate=smooth((Math.abs(Number(speedAbs)||0)-7.0)/4.0);
  const steerGate=smooth((Math.abs(Number(steerAngle)||0)-.075)/.09);
  return road*rearward*speedGate*steerGate;
}

export function jTurnTransientYawActive(args={}){
  return jTurnTransientYawBlend(args)>.5;
}

export function handbrakeLateralEffectForSpeed\`,
      'J-turn progressive surface authority');
  }
`;
if(!s.includes(runtimeAnchor))throw new Error('runtime insertion anchor missing');
s=s.replace(runtimeAnchor,runtimeInsert);
fs.writeFileSync(path,s);
console.log('Drift stress J-turn patch retargeted to runtime');
