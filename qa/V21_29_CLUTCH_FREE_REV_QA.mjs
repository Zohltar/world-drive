import assert from 'node:assert/strict';

function stepFreeRev({rpm,throttle,dt,idle=850,redline=7000}){
  const pedal=Math.max(0,Math.min(1,Number(throttle)||0));
  const target=idle+(redline-idle)*Math.pow(pedal,.72)*.985;
  const response=target>rpm?7.8:4.8;
  const step=1-Math.exp(-Math.max(0,dt)*response);
  const next=rpm+(target-rpm)*step;
  return Math.max(idle,Math.min(redline,next));
}

let rpm=4000;
const samples=[rpm];
for(let i=0;i<60;i++){
  rpm=stepFreeRev({rpm,throttle:1,dt:1/60});
  samples.push(rpm);
}

for(let i=1;i<samples.length;i++){
  assert(samples[i]>=samples[i-1]-1e-9,'clutch-open full-throttle RPM must rise monotonically');
}
assert(samples[10]>4500,'free-rev should pass the old +500 rpm oscillation ceiling quickly');
assert(samples.at(-1)>6500,'full-throttle clutch-open RPM should approach redline within about one second');

let releaseRpm=samples.at(-1);
for(let i=0;i<30;i++)releaseRpm=stepFreeRev({rpm:releaseRpm,throttle:0,dt:1/60});
assert(releaseRpm<samples.at(-1)-1000,'closing throttle with clutch open should let engine RPM fall freely');

console.table({
  start_rpm:samples[0],
  rpm_after_167ms:+samples[10].toFixed(0),
  rpm_after_1s:+samples.at(-1).toFixed(0),
  rpm_after_half_second_off_throttle:+releaseRpm.toFixed(0)
});
console.log('V21.29 CLUTCH FREE REV QA: PASS');
