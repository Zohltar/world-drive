import assert from 'node:assert/strict';
import { advanceFreeRevRpm, freeRevRiseTimeSec } from '../src/transmission-controller.js';

const profiles=[
  {profile:'boxer-turbo',idleRpm:850,redlineRpm:6700,min:1.25,max:1.85},
  {profile:'civic',idleRpm:750,redlineRpm:6800,min:1.35,max:2.00},
  {profile:'sonata-sport',idleRpm:750,redlineRpm:6500,min:1.40,max:2.10},
  {profile:'countach-v12',idleRpm:950,redlineRpm:7500,min:.95,max:1.55},
  {profile:'f1-v8',idleRpm:3200,redlineRpm:12000,min:.55,max:1.00}
];

function timeToNearRedline(profile){
  const dt=1/120;
  let rpm=profile.idleRpm;
  let t=0;
  const target=profile.redlineRpm*.975;
  while(rpm<target&&t<5){
    rpm=advanceFreeRevRpm({
      currentRpm:rpm,
      idleRpm:profile.idleRpm,
      redlineRpm:profile.redlineRpm,
      throttle:1,
      dt,
      riseTimeSec:freeRevRiseTimeSec(profile)
    });
    t+=dt;
  }
  return {t,rpm};
}

for(const profile of profiles){
  const result=timeToNearRedline(profile);
  assert(result.t>=profile.min,`${profile.profile} free-rev should not be unrealistically instant (${result.t.toFixed(2)} s)`);
  assert(result.t<=profile.max,`${profile.profile} free-rev should still reach redline convincingly (${result.t.toFixed(2)} s)`);
  console.log(`${profile.profile}: ${result.t.toFixed(2)} s to 97.5% redline`);
}

// Partial throttle must settle far below redline rather than behaving like a binary switch.
let rpm=850;
for(let i=0;i<600;i++)rpm=advanceFreeRevRpm({currentRpm:rpm,idleRpm:850,redlineRpm:6700,throttle:.45,dt:1/120,riseTimeSec:1.48});
assert(rpm>2500&&rpm<5000,'WRX partial throttle free-rev should settle at an intermediate RPM');

console.log('V21.29 FREE REV INERTIA QA: PASS');
