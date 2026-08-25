import assert from 'node:assert/strict';
import { truckLowSpeedTorqueScale } from '../src/driving-runtime.js';

const near=(a,b,e=.015)=>Math.abs(a-b)<=e;
assert(truckLowSpeedTorqueScale(0)>1.30,'crawler/launch envelope should restore >30% low-speed tractive authority');
assert(truckLowSpeedTorqueScale(4)>1.30,'steep-grade crawl should retain low-speed torque multiplication');
assert(truckLowSpeedTorqueScale(8)>1.05&&truckLowSpeedTorqueScale(8)<1.30,'torque boost should taper progressively with road speed');
assert(near(truckLowSpeedTorqueScale(12),1,.001),'boost must be gone by 12 m/s so wheel-power/highway calibration is unchanged');
assert(near(truckLowSpeedTorqueScale(25),1,.001),'highway propulsion must remain unchanged');

// Loaded combination sanity check: current 27.1 t rig, 2.05 m/s² base low-gear
// tractive calibration. At crawler speed the restored envelope gives ~2.75 m/s²
// before tire limiting, enough to sustain a ~25% grade after rolling resistance.
const lowGearAccel=2.05*truckLowSpeedTorqueScale(3);
const grade25=9.80665*Math.sin(Math.atan(.25));
const rolling=.080+.035*(18500/(8600+18500));
assert(lowGearAccel>grade25+rolling,'loaded truck should retain positive force on a representative 25% grade at crawler speed');
console.log('V21.30 truck hill torque QA OK', {lowGearAccel,grade25,rolling});
