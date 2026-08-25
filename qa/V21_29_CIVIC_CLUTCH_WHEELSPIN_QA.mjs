import fs from 'node:fs';
import {
  longitudinalTractionLimit,
  estimateWheelGripUsage
} from '../src/vehicle-dynamics.js';

function fail(message){throw new Error(message);}

const civic={
  drivetrain:'FWD',
  vehicleClass:'passenger',
  massKg:1345,
  cgHeight:.50,
  trackWidth:1.55,
  wheelbase:2.70,
  frontWeightBias:.61,
  driveBiasFront:1,
  brakeBiasFront:.64,
  accel:4.44,
  brake:9.54,
  longitudinalAccelLimit:8.67,
  roadGripMultiplier:1.06,
  lateralAccelLimit:8.53
};

const drive={};
const requested=10.8; // representative high-RPM clutch dump demand
const limited=longitudinalTractionLimit({
  vehicle:civic,
  requestedAccel:requested,
  surfaceMu:8.67/9.80665,
  mode:'drive',
  airborne:false,
  speedAbs:1.5
},drive);

if(!limited.limited)fail('Civic clutch dump must exceed static front-axle traction');
if(!(limited.slidingGripFactor<1))fail('Civic clutch wheelspin must transition below static friction');
if(!(limited.acceleration<limited.staticTractionAcceleration))fail('Sliding tires must transmit less force than static traction');

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];

const grip=estimateWheelGripUsage({
  requestedLatAccel:0,
  signedLatAccel:0,
  latLimit:8.53,
  longitudinalAccel:limited.acceleration,
  propulsionAccel:limited.acceleration,
  serviceBrakeAccel:0,
  surfaceMu:8.67/9.80665,
  throttle:requested/civic.accel,
  handbrake:false,
  airborne:false,
  vehicle:civic,
  speedAbs:1.5,
  dt:1/60,
  contacts,
  previousUsage:[0,0,0,0]
},{});

const rearMax=Math.max(grip.slip[0]||0,grip.slip[2]||0);
const frontMin=Math.min(grip.slip[1]||0,grip.slip[3]||0);
if(frontMin<.35)fail(`Civic front wheels must enter visible clutch slip, got ${frontMin.toFixed(3)}`);
if(rearMax>.10)fail(`Civic non-driven rear wheels must stay planted, got ${rearMax.toFixed(3)}`);
if(Math.min(grip.longitudinalUsage[1]||0,grip.longitudinalUsage[3]||0)<=1)
  fail('Civic front longitudinal tire demand must exceed 100% during clutch dump');

const telemetry=globalThis.WorldDriveWheelSpinTelemetry;
if(!telemetry||telemetry.levels?.length!==4)fail('Driven-wheel spin telemetry must be published');
if(Math.min(telemetry.levels[1]||0,telemetry.levels[3]||0)<.35)fail('Telemetry must expose front-wheel spin');

const skidSource=fs.readFileSync(new URL('../src/skidmarks.js',import.meta.url),'utf8');
for(const marker of ['wheelspinSpeedGate','intenseDrive','driveRaw']){
  if(!skidSource.includes(marker))fail(`Skidmark longitudinal wheelspin path missing: ${marker}`);
}
if(skidSource.includes("if(!onRoad||Math.abs(speed)<3.4)"))
  fail('Legacy low-speed blanket skid suppression must not block clutch wheelspin');

console.log('V21.29 Civic clutch wheelspin QA passed',{
  requestedAccel:requested.toFixed(2),
  staticAccel:limited.staticTractionAcceleration.toFixed(2),
  slidingAccel:limited.acceleration.toFixed(2),
  slidingGripFactor:limited.slidingGripFactor.toFixed(2),
  frontSlip:frontMin.toFixed(2),
  rearSlip:rearMax.toFixed(2)
});
