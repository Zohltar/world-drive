import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicle-system.js';
import {longitudinalTractionLimit, GRAVITY} from '../src/vehicle-dynamics.js';

const IDS=['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017'];
const surfaces=[.45,.70,1.0,1.15];
const speeds=[0,20/3.6,80/3.6,150/3.6,250/3.6];
let cases=0;
const rows=[];

for(const id of IDS){
  const v=createVehicleSystem({initialId:id}).physics;
  let maxDrive=0,maxBrake=0;
  for(const mu of surfaces){
    for(const speedAbs of speeds){
      let previous=0;
      for(let step=0;step<=120;step++){
        const requested=(v.accel||0)*(step/120);
        const r=longitudinalTractionLimit({vehicle:v,requestedAccel:requested,surfaceMu:mu,mode:'drive',airborne:false,speedAbs});
        assert.ok(Number.isFinite(r.acceleration)&&Number.isFinite(r.limit),`${id}: non-finite drive result`);
        assert.ok(r.acceleration>=previous-1e-5,`${id}: more throttle reduced actual acceleration at mu=${mu}, speed=${speedAbs*3.6}`);
        assert.ok(r.acceleration<=requested+1e-7,`${id}: drive exceeded request`);
        assert.ok(r.axleLoads.every(Number.isFinite),`${id}: invalid axle loads`);
        const loadSum=r.axleLoads.reduce((a,b)=>a+b,0);
        assert.ok(Math.abs(loadSum-1)<1e-9,`${id}: axle loads no longer sum to 1 (${loadSum})`);
        previous=r.acceleration; maxDrive=Math.max(maxDrive,r.acceleration); cases++;
      }

      previous=0;
      for(let step=0;step<=120;step++){
        const requested=-(v.brake||0)*(step/120);
        const r=longitudinalTractionLimit({vehicle:v,requestedAccel:requested,surfaceMu:mu,mode:'brake',airborne:false,speedAbs});
        const magnitude=Math.abs(r.acceleration);
        assert.ok(Number.isFinite(r.acceleration)&&Number.isFinite(r.limit),`${id}: non-finite brake result`);
        assert.ok(magnitude>=previous-1e-5,`${id}: more brake reduced actual deceleration at mu=${mu}, speed=${speedAbs*3.6}`);
        assert.ok(magnitude<=Math.abs(requested)+1e-7,`${id}: brake exceeded request`);
        previous=magnitude; maxBrake=Math.max(maxBrake,magnitude); cases++;
      }

      // Fixed-point check: feeding the delivered acceleration back into the
      // solver must not materially change it. This catches requested-force
      // load-transfer feedback regressions.
      for(const mode of ['drive','brake']){
        const requested=mode==='drive'?(v.accel||0):-(v.brake||0);
        const a=longitudinalTractionLimit({vehicle:v,requestedAccel:requested,surfaceMu:mu,mode,airborne:false,speedAbs}).acceleration;
        const b=longitudinalTractionLimit({vehicle:v,requestedAccel:a,surfaceMu:mu,mode,airborne:false,speedAbs}).acceleration;
        assert.ok(Math.abs(a-b)<.035,`${id}: traction solver not self-consistent (${mode}, ${a} -> ${b})`);
        cases++;
      }
    }
  }
  rows.push({vehicle:id,maxDriveG:maxDrive/GRAVITY,maxBrakeG:maxBrake/GRAVITY});
}

console.log('V21.21.26 TRACTION CONSISTENCY QA: PASS');
console.table(rows.map(r=>({vehicle:r.vehicle,'max drive g':r.maxDriveG.toFixed(2),'max brake g':r.maxBrakeG.toFixed(2)})));
console.log(`Monotonic/fixed-point cases: ${cases.toLocaleString('en-US')}`);
