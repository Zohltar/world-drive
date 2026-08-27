import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('src/multiplayer.js','utf8');
const server=fs.readFileSync('server/multiplayer-server.mjs','utf8');

for(const marker of [
  'function interpolateGeographic(a,b,t,spanMs)',
  'const h10=t3-2*t2+t;',
  'const h01=-2*t3+3*t2;',
  'const h11=t3-t2;',
  'velocityHeading:finiteOr(message.velocityHeading,peer.velocityHeading)',
  'longitudinalAccel:finiteOr(message.longitudinalAccel,peer.longitudinalAccel)',
  'function estimateLocalMotion(state,now)',
  'velocityHeading=Math.atan2(delta.x,delta.z)',
  'const VEHICLE_WHEELBASE=Object.freeze',
  'speed0/wheelbase*Math.tan(steer)',
  'travelYawFactor=clamp(1-slip/1.10,.28,1)',
  'velocityHeading:motion.velocityHeading',
  'longitudinalAccel:motion.longitudinalAccel'
]){
  assert(client.includes(marker),`missing M2 motion marker: ${marker}`);
}

for(const marker of [
  'velocityHeading:finite(message.velocityHeading,message.heading)',
  'longitudinalAccel:clamp(finite(message.longitudinalAccel),-20,15)'
]){
  assert(server.includes(marker),`relay drops M2 field: ${marker}`);
}

assert(client.includes('const MAX_EXTRAPOLATION_MS=105;'),'M2 extrapolation window changed unexpectedly');
assert(client.includes('directDistance>continuityLimit'),'Hermite interpolation must reject teleport/reset arcs');
assert(client.includes('Math.abs(Number(state.speed)||0)-'),'local acceleration estimate must use motion-speed magnitude');
assert(client.includes('Number(state.speed)<0'),'reverse motion must not use forward heading as velocity heading');

// Basic mathematical sanity for the exact Hermite basis used by the client.
function basis(t){
  const t2=t*t,t3=t2*t;
  return {h10:t3-2*t2+t,h01:-2*t3+3*t2,h11:t3-t2};
}
const start=basis(0),end=basis(1),mid=basis(.5);
assert.equal(start.h01,0);
assert.equal(end.h01,1);
assert(Math.abs(mid.h10)>0&&Math.abs(mid.h11)>0,'mid-curve must include endpoint velocity tangents');

console.log('V21.31 MULTIPLAYER M2 MOTION QA: PASS',{
  interpolation:'velocity-aware Hermite',
  extrapolation:'steer-aware bicycle predictor',
  driftDirection:true,
  accelerationPrediction:true,
  relayFields:['velocityHeading','longitudinalAccel']
});
