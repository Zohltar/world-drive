import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const geometryPath=path.join(root,'src','physics','steering-geometry.js');
const presentationPath=path.join(root,'src','vehicle-presentation.js');
const wrxPath=path.join(root,'src','wrx-glb.js');
const shadowQa=path.join(root,'qa','V21_27_PHYSICS_SHADOW_QA.mjs');

const shadow=spawnSync(process.execPath,[shadowQa],{encoding:'utf8'});
assert.equal(
  shadow.status,
  0,
  `V21.27 shadow regression failed:\n${shadow.stdout}\n${shadow.stderr}`
);

const geometryModule=await import(
  `${pathToFileURL(geometryPath).href}?qa=${Date.now()}`
);
const {
  ackermannSteeringAngles,
  ackermannAngleForSide,
  turningRadiusFromSteer
}=geometryModule;

// WRX representative geometry.
const L=2.65;
const T=1.56;
const d20=20*Math.PI/180;
const right=ackermannSteeringAngles({wheelbase:L,trackWidth:T,centerAngle:d20});
assert.equal(right.turnSign,1,'positive steer no longer represents a right turn');
assert.ok(right.innerAngle>right.centerAngle,'inner wheel must steer more than center angle');
assert.ok(right.outerAngle<right.centerAngle,'outer wheel must steer less than center angle');
assert.ok(
  Math.abs(ackermannAngleForSide(right,'right')-right.innerAngle)<1e-12,
  'right wheel is not inside on a positive/right turn'
);
assert.ok(
  Math.abs(ackermannAngleForSide(right,'left')-right.outerAngle)<1e-12,
  'left wheel is not outside on a positive/right turn'
);
assert.ok(
  Math.abs(ackermannAngleForSide(right,1)-right.innerAngle)<1e-12,
  'numeric +1 side metadata must map to right/inside'
);
assert.ok(
  Math.abs(ackermannAngleForSide(right,-1)-right.outerAngle)<1e-12,
  'numeric -1 side metadata must map to left/outside'
);

const left=ackermannSteeringAngles({wheelbase:L,trackWidth:T,centerAngle:-d20});
assert.equal(left.turnSign,-1,'negative steer no longer represents a left turn');
assert.ok(
  Math.abs(ackermannAngleForSide(left,'left')-left.innerAngle)<1e-12,
  'left wheel is not inside on a negative/left turn'
);
assert.ok(
  Math.abs(ackermannAngleForSide(left,'right')-left.outerAngle)<1e-12,
  'right wheel is not outside on a negative/left turn'
);
assert.ok(
  Math.abs(Math.abs(left.innerAngle)-Math.abs(right.innerAngle))<1e-12&&
  Math.abs(Math.abs(left.outerAngle)-Math.abs(right.outerAngle))<1e-12,
  'Ackermann geometry lost left/right mirror symmetry'
);

// All three wheel angles must share one instantaneous center of rotation.
const centerRadius=turningRadiusFromSteer({wheelbase:L,centerAngle:d20});
const innerRadius=L/Math.tan(Math.abs(right.innerAngle));
const outerRadius=L/Math.tan(Math.abs(right.outerAngle));
assert.ok(Math.abs(innerRadius-(centerRadius-T/2))<1e-9,'inner wheel radius does not match common turn center');
assert.ok(Math.abs(outerRadius-(centerRadius+T/2))<1e-9,'outer wheel radius does not match common turn center');

// Zero steering remains exactly zero on both sides.
const zero=ackermannSteeringAngles({wheelbase:L,trackWidth:T,centerAngle:0});
assert.equal(ackermannAngleForSide(zero,'left'),0,'left wheel invented steering at center');
assert.equal(ackermannAngleForSide(zero,'right'),0,'right wheel invented steering at center');

const presentation=fs.readFileSync(presentationPath,'utf8').replace(/\r\n/g,'\n');
const wrx=fs.readFileSync(wrxPath,'utf8').replace(/\r\n/g,'\n');

assert.match(
  presentation,
  /import \{ ackermannSteeringAngles, ackermannAngleForSide \} from '\.\/physics\/steering-geometry\.js';/,
  'vehicle-presentation is not using shared Ackermann geometry'
);
assert.match(
  presentation,
  /w\.front\s*\n\s*\?ackermannAngleForSide\(geometry,side\)/,
  'generic physical front wheel pivots are not using per-side Ackermann angles'
);
assert.doesNotMatch(
  presentation,
  /w\.front\s*\n\s*\?visualSteer\s*\n\s*:0/,
  'generic front wheels still share one steering angle'
);

assert.match(
  wrx,
  /ackermannAngleForSide\(geometry,side\)/,
  'WRX visible front wheels are not using per-side Ackermann angles'
);
assert.doesNotMatch(
  wrx,
  /steerQuaternion\.setFromAxisAngle\(steerAxis,Number\(steerAngle\)\|\|0\);/,
  'WRX still applies one shared front-wheel steering quaternion'
);

// Guard the scope: this phase must not change the authoritative chassis steering
// equations. It only changes wheel orientation. Main/driving-runtime are covered
// by the shadow QA above and are deliberately not patched by the integration tool.

console.log('V21.27 ACKERMANN WHEEL QA: PASS');
console.log('shared turn center / mirrored left-right geometry / WRX visible + generic physical wheel angles verified');
