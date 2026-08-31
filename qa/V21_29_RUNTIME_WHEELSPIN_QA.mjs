import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createWheelspinState,
  drivenWheelSlipLevels,
  wheelspinDynamicGripFactor,
  wheelspinHoldDurationSec
} from '../src/physics/wheelspin-state.js';

const civic=drivenWheelSlipLevels('FWD',1);
assert.equal(civic.length,4);
assert.equal(civic[0],0);
assert.equal(civic[2],0);
assert.ok(civic[1]>=.99&&civic[3]>=.99,'Civic front wheels must receive full wheelspin');

const civicGrip=wheelspinDynamicGripFactor('FWD',1,'passenger');
const wrxGrip=wheelspinDynamicGripFactor('AWD',1,'passenger');
const countachGrip=wheelspinDynamicGripFactor('RWD',1,'passenger');
assert.ok(civicGrip<wrxGrip,'FWD clutch wheelspin must lose more launch traction than AWD');
assert.ok(countachGrip<wrxGrip,'RWD clutch wheelspin must lose more launch traction than AWD');
assert.ok(Math.abs(civicGrip-.78)<.001,`Expected Civic dynamic grip factor .78, got ${civicGrip}`);
assert.equal(wheelspinHoldDurationSec('FWD','passenger'),.62);
assert.equal(wheelspinHoldDurationSec('RWD','passenger'),.48);
assert.equal(wheelspinHoldDurationSec('AWD','passenger'),.24);
assert.equal(wheelspinHoldDurationSec('AWD','tractor'),.18);

const state=createWheelspinState();
const seeded=state.advance({
  dt:1/60,releaseMultiplier:2.2,engineThrottle:1,
  tractionResult:{requested:10.8,limit:6,limited:true},
  drivetrain:'FWD',vehicleClass:'passenger'
});
assert.ok(seeded.level>.42,'clutch breakaway must seed persistent wheelspin');
assert.equal(seeded.holdSec,.62);
const held=state.advance({
  dt:1/60,releaseMultiplier:1,engineThrottle:1,
  tractionResult:{requested:4,limit:8,limited:false},
  drivetrain:'FWD',vehicleClass:'passenger'
});
assert.ok(held.level>0&&held.holdSec<.62,'wheelspin must persist after clutch shock');

const runtime=fs.readFileSync(new URL('../src/driving-runtime.js',import.meta.url),'utf8');
assert.match(runtime,/createWheelspinState/,'runtime must consume explicit B6 wheelspin owner');
assert.match(runtime,/skidMarksWithWheelspin/,'skidmarks must remain an observer of authoritative wheelspin');
assert.doesNotMatch(runtime,/let wheelspinLevel=0,wheelspinHoldSec=0/,'parallel runtime wheelspin variables returned');

console.log('V21.29 persistent runtime wheelspin QA passed',{
  civicGrip,wrxGrip,countachGrip,civicWheels:civic,seededLevel:seeded.level
});
