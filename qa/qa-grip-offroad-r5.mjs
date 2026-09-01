import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {lateralDynamicsEnvelope} from '../src/physics/vehicle-dynamics.js';
import {
  offroadTireFriction,
  offroadSideslipFriction
} from '../src/driving-runtime.js';

const DEG=Math.PI/180;
const wrx=createVehicleSystem({initialId:'wrx'}).physics;
const dirt=offroadTireFriction({vehicleId:'wrx',vehicle:wrx});

assert(dirt.peak>.45&&dirt.peak<.62,`WRX dirt peak mu unexpected: ${dirt.peak}`);
assert(dirt.slide>.40&&dirt.slide<.58,`WRX dirt slide mu unexpected: ${dirt.slide}`);

function force(angleDeg,speed=20){
  return offroadSideslipFriction({
    speed,
    heading:angleDeg*DEG,
    velocityHeading:0,
    slideMu:dirt.slide,
    airborne:false
  });
}

const straight=force(0);
const f15=force(15);
const f30=force(30);
const f45=force(45);
const f60=force(60);
const f90=force(90);
const f120=force(120);

assert(Math.abs(straight.speedDecel)<1e-10,'straight off-road travel must not get lateral scrub');
assert(f30.speedDecel>f15.speedDecel,'off-road scrub must rise with sideslip');
assert(f45.speedDecel>f30.speedDecel,'45deg scrub must exceed 30deg');
assert(f60.speedDecel>f45.speedDecel,'60deg scrub must exceed 45deg');
assert(f90.speedDecel>f60.speedDecel,'90deg scrub must be strongest');
assert(f90.speedDecel>4.0,`90deg dirt slide must dissipate substantial energy: ${f90.speedDecel}`);
assert(Math.abs(f90.momentumYawRate)<1e-8,'exactly sideways friction should slow, not create an artificial yaw wall');
assert(f45.momentumYawRate>0,'45deg sample must bend momentum toward body-forward axis');
assert(f120.momentumYawRate<0,'120deg sample must bend momentum toward body-reverse axis');

const airborne=offroadSideslipFriction({speed:20,heading:90*DEG,velocityHeading:0,slideMu:dirt.slide,airborne:true});
assert.equal(airborne.speedDecel,0,'airborne vehicle must have no terrain scrub');
assert.equal(airborne.momentumYawRate,0,'airborne vehicle must have no terrain lateral force');

function env(speed,awdBonus=1.18,peak=dirt.peak){
  return lateralDynamicsEnvelope({
    vehicle:wrx,
    speed,
    steerAngle:.30,
    steerInput:1,
    driveThrottle:0,
    onPavement:false,
    surfaceGrip:1,
    awdOffroadGripBonus:awdBonus,
    offroadPeakMu:peak,
    rearSlipAmount:0,
    airborne:false
  },{});
}

const below=env(9.9);
const above=env(10.1);
assert(Math.abs(below.offroadLatLimit-above.offroadLatLimit)<1e-12,'off-road lateral limit must not jump at 10 m/s');
assert(Math.abs(below.offroadLatLimit-dirt.peak*9.80665)<1e-9,'off-road lateral ceiling must come from tire/surface peak mu');
assert(Math.abs(env(20,1).offroadLatLimit-env(20,1.18).offroadLatLimit)<1e-12,'AWD must not increase passive lateral grip');
assert.equal(env(5).effectiveGrip,1,'loose terrain must not weaken steering geometry before friction saturation');

const roadA=lateralDynamicsEnvelope({vehicle:wrx,speed:20,steerAngle:.15,steerInput:.5,driveThrottle:0,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,offroadPeakMu:.2,rearSlipAmount:0,airborne:false},{});
const roadB=lateralDynamicsEnvelope({vehicle:wrx,speed:20,steerAngle:.15,steerInput:.5,driveThrottle:0,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,offroadPeakMu:.9,rearSlipAmount:0,airborne:false},{});
assert(Math.abs(roadA.yawRate-roadB.yawRate)<1e-12&&Math.abs(roadA.latLimit-roadB.latLimit)<1e-12,'Grip R5 must not alter pavement physics');

console.table({
  dirt:{peak_mu:+dirt.peak.toFixed(3),slide_mu:+dirt.slide.toFixed(3)},
  '45deg':{scrub_mps2:+f45.speedDecel.toFixed(2),momentum_yaw_deg_s:+(f45.momentumYawRate/DEG).toFixed(1)},
  '90deg':{scrub_mps2:+f90.speedDecel.toFixed(2),momentum_yaw_deg_s:+(f90.momentumYawRate/DEG).toFixed(1)},
  '120deg':{scrub_mps2:+f120.speedDecel.toFixed(2),momentum_yaw_deg_s:+(f120.momentumYawRate/DEG).toFixed(1)}
});
console.log('GRIP R5 OFF-ROAD LATERAL PHYSICS QA: PASS');
