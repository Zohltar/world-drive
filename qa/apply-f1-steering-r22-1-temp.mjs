import fs from 'node:fs';

const dynamicsPath='src/vehicle-dynamics-v21.29.js';
let d=fs.readFileSync(dynamicsPath,'utf8');
const oldDynamics=`  const ultraHighSpeedMaxBoost=Math.max(0,safeNumber(\n    vehicle?.steeringUltraHighExponentBoost,\n    vehicle?.vehicleClass==='racecar'?3.0:0\n  ));\n`;
const newDynamics=`  const ultraHighSpeedMaxBoost=Math.max(0,safeNumber(\n    vehicle?.steeringUltraHighExponentBoost,\n    0\n  ));\n`;
if(!d.includes(oldDynamics))throw new Error('R22.1 dynamics anchor missing');
d=d.replace(oldDynamics,newDynamics);
d=d.replace('  // Grip R22 — high-downforce race cars remain extremely sensitive once R13\n','  // Grip R22/R22.1 — explicitly opted-in high-downforce cars remain extremely sensitive once R13\n');
d=d.replace('  // through roughly 145 km/h, then progressively add a second analog exponent\n  // stage toward ~324 km/h. This changes stick sensitivity only: full input is\n','  // through 150 km/h, then progressively add a second analog exponent stage.\n  // Vehicle profiles own the exact start/full speeds and boost. This changes stick sensitivity only: full input is\n');
fs.writeFileSync(dynamicsPath,d);

const vehiclePath='src/vehicle-system.js';
let v=fs.readFileSync(vehiclePath,'utf8');
const anchor=`      steeringInputExponent:1.72,\n      steeringResponseLow:2.55,\n`;
const replacement=`      steeringInputExponent:1.72,\n\n      // Grip R22.1 — human-tuned F1 gamepad curve. Keep R13 unchanged through\n      // 150 km/h, then strongly compress mid-stick travel as aerodynamic grip\n      // makes tiny road-wheel angles increasingly powerful. Full stick remains\n      // full mechanical lock.\n      steeringUltraHighStartMps:41.666667,  // 150 km/h\n      steeringUltraHighFullMps:72.222222,   // 260 km/h\n      steeringUltraHighExponentBoost:5.00,\n\n      steeringResponseLow:2.55,\n`;
if(!v.includes(anchor))throw new Error('R22.1 F1 profile anchor missing');
v=v.replace(anchor,replacement);
fs.writeFileSync(vehiclePath,v);

console.log('GRIP R22.1 F1 STEERING TUNING PATCH: PASS');
