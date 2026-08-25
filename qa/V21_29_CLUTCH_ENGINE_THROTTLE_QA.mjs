import assert from 'node:assert/strict';

function freeRevStep({rpm,idle=850,redline=6700,throttle=1,dt=1/60}={}){
  const pedal=Math.max(0,Math.min(1,throttle));
  const target=idle+(redline-idle)*Math.pow(pedal,.72)*.97;
  const response=target>rpm?11.5:6.0;
  return rpm+(target-rpm)*(1-Math.exp(-dt*response));
}

let rpm=850;
for(let i=0;i<30;i++)rpm=freeRevStep({rpm,throttle:1});
assert(rpm>6000,'full throttle with clutch open must rapidly free-rev the WRX engine');

let idleRpm=850;
for(let i=0;i<30;i++)idleRpm=freeRevStep({rpm:idleRpm,throttle:0});
assert(idleRpm<900,'zero throttle with clutch open must stay near idle');

console.table({
  full_throttle_after_05s:{rpm:Math.round(rpm)},
  zero_throttle_after_05s:{rpm:Math.round(idleRpm)}
});
console.log('V21.29 CLUTCH ENGINE THROTTLE QA: PASS');
