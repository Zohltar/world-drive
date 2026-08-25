import {
  clutchShockMultiplierFromMismatch,
  clutchShockProfile
} from '../src/transmission-controller.js';

const cars=[
  {id:'wrx',drive:'AWD',accel:6.36,limit:9.47,grip:1.10,front:0.58,profile:'boxer-turbo'},
  {id:'civic',drive:'FWD',accel:4.44,limit:8.67,grip:1.06,front:0.61,profile:'civic'},
  {id:'sonata',drive:'FWD',accel:5.01,limit:8.82,grip:1.05,front:0.61,profile:'sonata-sport'},
  {id:'countach_80',drive:'RWD',accel:6.77,limit:9.50,grip:1.16,front:0.44,profile:'countach-v12'},
  {id:'f1_2010',drive:'RWD',accel:12.3,limit:20.5,grip:1.00,front:0.46,profile:'f1-v8'},
  {id:'semi_6x4',drive:'RWD',accel:2.05,limit:5.6,grip:.94,front:.35,profile:'truck-diesel'}
];

function drivenStaticShare(car){
  if(car.drive==='AWD')return 1;
  if(car.drive==='FWD')return car.front;
  return 1-car.front;
}

function fail(msg){throw new Error(msg);}

for(const car of cars){
  const cfg=clutchShockProfile({profile:car.profile});
  const shock=clutchShockMultiplierFromMismatch({
    freeRpm:6000,
    coupledRpm:2200,
    idleRpm:car.profile==='f1-v8'?3200:(car.profile==='truck-diesel'?600:800),
    redlineRpm:car.profile==='f1-v8'?12000:(car.profile==='truck-diesel'?2200:6800),
    throttle:1,
    opposingTravel:false,
    profile:{profile:car.profile}
  });
  const demand=car.accel*shock;
  const capacity=car.limit*car.grip*drivenStaticShare(car);
  const ratio=demand/Math.max(.01,capacity);
  console.log(`${car.id.padEnd(12)} shock=${shock.toFixed(2)} demand=${demand.toFixed(2)} cap~=${capacity.toFixed(2)} saturation=${ratio.toFixed(2)}x duration=${cfg.durationSec.toFixed(3)}s`);

  if(car.id==='civic'&&ratio<1.25)fail('Civic clutch dump must exceed front-axle traction capacity');
  if(car.id==='sonata'&&ratio<1.25)fail('Sonata clutch dump must exceed front-axle traction capacity');
  if(car.id==='countach_80'&&ratio<1.5)fail('Countach clutch dump should strongly saturate rear tires');
  if(car.id==='wrx'&&ratio<1.05)fail('WRX hard clutch dump should at least reach AWD traction envelope');
  if(car.id==='semi_6x4'&&cfg.durationSec<.14)fail('Truck clutch engagement must stay slower than passenger cars');
}

console.log('V21.29 clutch shock fleet QA passed');
