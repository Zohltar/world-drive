import {
  longitudinalTractionLimit,
  estimateWheelGripUsage
} from '../src/physics/vehicle-dynamics.js';

const civic={
  drivetrain:'FWD',
  massKg:1345,
  cgHeight:.50,
  trackWidth:1.55,
  frontWeightBias:.61,
  brakeBiasFront:.64,
  driveBiasFront:1,
  wheelbase:2.70,
  longitudinalAccelLimit:8.67,
  lateralAccelLimit:8.53,
  roadGripMultiplier:1.06
};

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];

const requestedDriveAccel=10.8; // representative high-RPM Civic clutch dump
const drive=longitudinalTractionLimit({
  vehicle:civic,
  requestedAccel:requestedDriveAccel,
  surfaceMu:.94,
  mode:'drive',
  airborne:false,
  speedAbs:0
},{});

const grip=estimateWheelGripUsage({
  requestedLatAccel:0,
  signedLatAccel:0,
  latLimit:civic.lateralAccelLimit,
  longitudinalAccel:drive.acceleration,
  requestedPropulsionAccel:requestedDriveAccel,
  appliedPropulsionAccel:drive.acceleration,
  propulsionAccel:drive.acceleration,
  serviceBrakeAccel:0,
  surfaceMu:.94,
  throttle:2.25,
  handbrake:false,
  airborne:false,
  vehicle:civic,
  speedAbs:.2,
  dt:1/60,
  contacts,
  previousUsage:[0,0,0,0]
},{});

const frontSlip=Math.min(grip.slip[1],grip.slip[3]);
const rearSlip=Math.max(grip.slip[0],grip.slip[2]);

console.log({
  requestedDriveAccel,
  appliedDriveAccel:drive.acceleration,
  saturationRatio:grip.propulsionSaturationRatio,
  frontSlip,
  rearSlip,
  slip:grip.slip,
  longitudinalUsage:grip.longitudinalUsage
});

if(!(drive.limited))throw new Error('Civic clutch dump must be traction-limited');
if(frontSlip<.35)throw new Error(`Expected clear Civic front-wheel slip, got ${frontSlip.toFixed(3)}`);
if(rearSlip>.08)throw new Error(`Civic rear wheels must remain essentially non-driven, got ${rearSlip.toFixed(3)}`);
if(!(grip.longitudinalUsage[1]>1&&grip.longitudinalUsage[3]>1))throw new Error('Driven front wheels must exceed 100% longitudinal utilization');

console.log('V21.29 Civic clutch-dump front-slip QA passed');
