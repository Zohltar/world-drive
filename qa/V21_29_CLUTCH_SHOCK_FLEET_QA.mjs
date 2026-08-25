import {
  clutchShockMultiplierFromMismatch,
  clutchShockCalibration
} from '../src/transmission-controller.js';

const cars=[
  {id:'wrx',drive:'AWD',accel:6.36,limit:9.47,grip:1.10,front:0.58,profile:'boxer-turbo',idle:850,redline:6700},
  {id:'civic',drive:'FWD',accel:4.44,limit:8.67,grip:1.06,front:0.61,profile:'civic',idle:750,redline:6800},
  {id:'sonata',drive:'FWD',accel:5.01,limit:8.82,grip:1.05,front:0.61,profile:'sonata-sport',idle:750,redline:6500},
  {id:'countach_80',drive:'RWD',accel:6.77,limit:9.50,grip:1.16,front:0.44,profile:'countach-v12',idle:950,redline:7500},
  {id:'f1_2010',drive:'RWD',accel:12.3,limit:20.5,grip:1.00,front:0.46,profile:'f1-v8',idle:3200,redline:12000},
  {id:'semi_6x4',drive:'RWD',accel:2.05,limit:5.6,grip:.94,front:.35,profile:'sonata-sport',idle:600,redline:2200}
];

function drivenStaticShare(car){
  if(car.drive==='AWD')return 1;
  if(car.drive==='FWD')return car.front;
  return 1-car.front;
}

function fail(msg){throw new Error(msg);}

for(const car of cars){
  const calibration=clutchShockCalibration({profile:car.profile},car.id);
  const freeRpm=car.id==='semi_6x4'?2050:car.redline*.90;
  const coupledRpm=car.id==='f1_2010'?5000:(car.id==='semi_6x4'?900:2200);
  const shock=clutchShockMultiplierFromMismatch({
    freeRpm,
    coupledRpm,
    idleRpm:car.idle,
    redlineRpm:car.redline,
    throttle:1,
    opposingTravel:false,
    gain:calibration.gain,
    travelBonus:calibration.travelBonus,
    maxMultiplier:calibration.max
  });
  const demand=car.accel*shock;
  const capacity=car.limit*car.grip*drivenStaticShare(car);
  const ratio=demand/Math.max(.01,capacity);
  console.log(`${car.id.padEnd(12)} shock=${shock.toFixed(2)} demand=${demand.toFixed(2)} cap~=${capacity.toFixed(2)} saturation=${ratio.toFixed(2)}x`);

  if(car.id==='civic'&&ratio<1.25)fail('Civic clutch dump must exceed front-axle traction capacity');
  if(car.id==='sonata'&&ratio<1.25)fail('Sonata clutch dump must exceed front-axle traction capacity');
  if(car.id==='countach_80'&&ratio<1.5)fail('Countach clutch dump should strongly saturate rear tires');
  if(car.id==='wrx'&&ratio<1.05)fail('WRX hard clutch dump should at least reach AWD traction envelope');
  if(car.id==='semi_6x4'&&ratio>1.45)fail('Truck dry-asphalt clutch dump should remain comparatively traction-friendly');
}

console.log('V21.29 clutch shock fleet QA passed');
