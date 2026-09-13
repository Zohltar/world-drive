import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  clamp01,
  clampSigned,
  applyDeadzone,
  normalizeTiltSteering,
  landscapeTiltAngle,
  mobileInputCapability
} from '../src/input/mobile-controls.js';

assert.equal(clamp01(-1),0);
assert.equal(clamp01(.4),.4);
assert.equal(clamp01(2),1);
assert.equal(clampSigned(-2),-1);
assert.equal(clampSigned(.25),.25);
assert.equal(clampSigned(2),1);

assert.equal(applyDeadzone(.05,.08),0,'small positive steering tremor must stay centered');
assert.equal(applyDeadzone(-.05,.08),0,'small negative steering tremor must stay centered');
assert.ok(applyDeadzone(.5,.08)>0);
assert.ok(applyDeadzone(-.5,.08)<0);

const left=normalizeTiltSteering({angleDeg:-14,neutralDeg:0,maxTiltDeg:28,deadzone:.08,sensitivity:1});
const right=normalizeTiltSteering({angleDeg:14,neutralDeg:0,maxTiltDeg:28,deadzone:.08,sensitivity:1});
assert.ok(left<0&&right>0,'equal left/right tilt must preserve sign');
assert.ok(Math.abs(Math.abs(left)-Math.abs(right))<1e-12,'equal tilt must map symmetrically');
assert.equal(normalizeTiltSteering({angleDeg:0,neutralDeg:0}),0,'neutral angle must map to zero');
assert.equal(normalizeTiltSteering({angleDeg:100,neutralDeg:0,maxTiltDeg:28}),1,'steering must clamp high');
assert.equal(normalizeTiltSteering({angleDeg:-100,neutralDeg:0,maxTiltDeg:28}),-1,'steering must clamp low');

assert.equal(landscapeTiltAngle({beta:12,gamma:3},90),12,'landscape-right must use beta');
assert.equal(landscapeTiltAngle({beta:12,gamma:3},270),-12,'landscape-left must invert beta');
assert.equal(landscapeTiltAngle({beta:12,gamma:3},0),3,'portrait/default must use gamma');

const touchEnv={navigator:{maxTouchPoints:5},DeviceOrientationEvent:function(){}};
assert.deepEqual(mobileInputCapability(touchEnv),{
  hasTouch:true,
  hasOrientation:true,
  needsPermission:false,
  touchPoints:5
});

function PermissionOrientation(){}
PermissionOrientation.requestPermission=async()=> 'granted';
const permissionEnv={navigator:{maxTouchPoints:1},DeviceOrientationEvent:PermissionOrientation};
assert.equal(mobileInputCapability(permissionEnv).needsPermission,true,'iOS-style orientation permission must be detected');

const desktopEnv={navigator:{maxTouchPoints:0}};
assert.deepEqual(mobileInputCapability(desktopEnv),{
  hasTouch:false,
  hasOrientation:false,
  needsPermission:false,
  touchPoints:0
});

const keyboardSource=await readFile(new URL('../src/input/keyboard-controls.js',import.meta.url),'utf8');
const gamepadSource=await readFile(new URL('../src/input/gamepad.js',import.meta.url),'utf8');
const drivingSource=await readFile(new URL('../src/driving-runtime-base.js',import.meta.url),'utf8');
assert.match(keyboardSource,/createMobileControls\(\{getRuntimeState,onManualTakeover\}\)/,'keyboard owner must create the mobile controller with runtime visibility/takeover context');
assert.match(keyboardSource,/globalThis\.__worldDriveMobileControls=mobileControls/,'mobile controller must be exposed only as the normalized-input bridge');
assert.match(gamepadSource,/function applyMobileState\(\)/,'gamepad facade must own the virtual mobile bridge');
assert.match(gamepadSource,/state\.id='World Drive Mobile'/,'mobile bridge must identify itself without changing vehicle runtime semantics');
assert.match(gamepadSource,/state\.steer=Math\.max\(-1,Math\.min\(1,Number\(mobile\.steer\)\|\|0\)\)/,'mobile steering must remain normalized');
assert.match(gamepadSource,/state\.throttle=Math\.max\(0,Math\.min\(1,Number\(mobile\.throttle\)\|\|0\)\)/,'mobile throttle must remain normalized');
assert.match(gamepadSource,/state\.brake=Math\.max\(0,Math\.min\(1,Number\(mobile\.brake\)\|\|0\)\)/,'mobile brake must remain normalized');
assert.match(drivingSource,/if\(gamepadState\.connected&&!menuOpen\)/,'mobile bridge must reuse the already-certified normalized gamepad path');
assert.ok(!drivingSource.includes('World Drive Mobile'),'physics/runtime must not contain a mobile-specific driving branch');

console.log('BLOCK 10 MOBILE INPUT CONTRACT QA: PASS');
