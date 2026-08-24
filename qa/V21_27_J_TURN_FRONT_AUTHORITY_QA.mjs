import assert from 'node:assert/strict';
import { postSpinSteeringAuthority, travelAxisSideslip } from '../src/driving-runtime.js';

const deg=d=>d*Math.PI/180;

// Clean reverse-axis travel after a 180 is NOT lateral sideslip.
assert.ok(travelAxisSideslip({heading:0,velocityHeading:Math.PI})<1e-9);
assert.ok(travelAxisSideslip({heading:0,velocityHeading:0})<1e-9);
assert.ok(Math.abs(travelAxisSideslip({heading:0,velocityHeading:Math.PI/2})-Math.PI/2)<1e-9);

// Even with stale/high rear-slip memory, a car aligned on the reverse axis must
// get full steering authority for a J-turn. The old P6.4 logic incorrectly saw
// the PI heading delta as maximum sideslip and capped authority near 28%.
for(const rearSlipAmount of [0,.3,.6,.9,1]){
  const authority=postSpinSteeringAuthority({
    rearSlipAmount,
    heading:0,
    velocityHeading:Math.PI,
    handbrake:false
  });
  assert.ok(Math.abs(authority-1)<1e-9,`reverse-axis authority ${authority}`);
}

// Truly sideways travel should still suppress the bicycle-model contribution.
const side90=postSpinSteeringAuthority({rearSlipAmount:.9,heading:0,velocityHeading:deg(90),handbrake:false});
assert.ok(side90<.40,`90deg sideways authority too high: ${side90}`);

// Approaching reverse alignment should recover smoothly and monotonically.
const samples=[90,110,130,150,170,180].map(angle=>({
  angle,
  authority:postSpinSteeringAuthority({rearSlipAmount:.9,heading:0,velocityHeading:deg(angle),handbrake:false})
}));
for(let i=1;i<samples.length;i++){
  assert.ok(samples[i].authority>=samples[i-1].authority-1e-9,JSON.stringify(samples));
}
assert.ok(samples.at(-1).authority>.99,JSON.stringify(samples));

console.log('V21.27 J-turn front authority QA passed',samples);
