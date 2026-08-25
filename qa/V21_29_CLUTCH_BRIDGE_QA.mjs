import assert from 'node:assert/strict';
import {
  publishTransmissionRuntimeState,
  readTransmissionRuntimeState,
  resetTransmissionRuntimeState
} from '../src/transmission-runtime-bridge.js';

resetTransmissionRuntimeState();
publishTransmissionRuntimeState({
  bodyLongitudinalSpeed:-5.5,
  clutchHeld:true,
  engineThrottle:1
});

const bridged=readTransmissionRuntimeState();
assert.equal(bridged.clutchHeld,true,'LB/Shift clutch state must survive the legacy transmission facade');
assert.equal(bridged.engineThrottle,1,'engine throttle must remain full while clutch is held');
assert.equal(bridged.bodyLongitudinalSpeed,-5.5,'body-relative speed must survive the legacy transmission facade');

console.table({
  clutchHeld:bridged.clutchHeld,
  engineThrottle:bridged.engineThrottle,
  bodyLongitudinalSpeed:bridged.bodyLongitudinalSpeed,
  sequence:bridged.sequence
});
console.log('V21.29 CLUTCH BRIDGE QA: PASS');
