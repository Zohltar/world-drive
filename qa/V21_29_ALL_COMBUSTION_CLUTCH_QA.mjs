import assert from 'node:assert/strict';
import {
  freeRevRiseTimeSec,
  clutchShockCalibration,
  clutchShockMultiplierFromMismatch
} from '../src/transmission-controller.js';
import { clutchShockDurationSec } from '../src/driving-runtime.js';

const cases=[
  {id:'wrx',profile:'boxer-turbo',idle:850,redline:6700},
  {id:'civic',profile:'civic',idle:750,redline:6800},
  {id:'sonata',profile:'sonata-sport',idle:750,redline:6500},
  {id:'countach_80',profile:'countach-v12',idle:950,redline:7500},
  {id:'f1_2010',profile:'f1-v8',idle:3200,redline:12000},
  {id:'semi_6x4',profile:'sonata-sport',idle:600,redline:2200}
];

for(const c of cases){
  const profile={type:'combustion',profile:c.profile,idleRpm:c.idle,redlineRpm:c.redline};
  const rise=freeRevRiseTimeSec(profile,c.id);
  const duration=clutchShockDurationSec(profile,c.id);
  const cal=clutchShockCalibration(profile,c.id);
  const shock=clutchShockMultiplierFromMismatch({
    freeRpm:c.idle+(c.redline-c.idle)*.88,
    coupledRpm:c.idle+(c.redline-c.idle)*.28,
    idleRpm:c.idle,
    redlineRpm:c.redline,
    throttle:1,
    opposingTravel:true,
    gain:cal.gain,
    travelBonus:cal.travelBonus,
    maxMultiplier:cal.max
  });
  assert(rise>.5&&rise<3,`${c.id}: realistic free-rev rise time`);
  assert(duration>=.05&&duration<=.20,`${c.id}: realistic clutch bite duration`);
  assert(shock>1.5&&shock<=cal.max+1e-9,`${c.id}: meaningful bounded clutch shock`);
}

const wrxCal=clutchShockCalibration({profile:'boxer-turbo'},'wrx');
const countachCal=clutchShockCalibration({profile:'countach-v12'},'countach_80');
const truckCal=clutchShockCalibration({profile:'sonata-sport'},'semi_6x4');
assert(countachCal.max>=wrxCal.max,'Countach can deliver a harder RWD clutch hit than WRX');
assert(truckCal.max<wrxCal.max,'truck clutch shock is softer than WRX');
assert(clutchShockDurationSec({profile:'sonata-sport'},'semi_6x4')>clutchShockDurationSec({profile:'boxer-turbo'},'wrx'),'truck clutch engagement is slower');

console.log('V21.29 all-combustion clutch QA passed');
