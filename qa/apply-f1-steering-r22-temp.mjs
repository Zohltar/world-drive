import fs from 'node:fs';

// Touch marker: triggers the temporary R22 workflow after workflow creation.
const path='src/vehicle-dynamics-v21.29.js';
let s=fs.readFileSync(path,'utf8');
const old=`  const steeringCurveT=smoothstep01(v/steeringCurveFullSpeedMps);\n  const steeringInputExponent=\n    1+(steeringCurveMaxExponent-1)*steeringCurveT;\n`;
const replacement=`  const steeringCurveT=smoothstep01(v/steeringCurveFullSpeedMps);\n  const baseSteeringInputExponent=\n    1+(steeringCurveMaxExponent-1)*steeringCurveT;\n\n  // Grip R22 — high-downforce race cars remain extremely sensitive once R13\n  // has already reached its normal highway exponent. Keep the proven R13 curve\n  // through roughly 145 km/h, then progressively add a second analog exponent\n  // stage toward ~324 km/h. This changes stick sensitivity only: full input is\n  // still pow(1,p)=1 and therefore retains full mechanical steering authority.\n  const ultraHighSpeedStartMps=Math.max(20,safeNumber(\n    vehicle?.steeringUltraHighStartMps,40\n  ));\n  const ultraHighSpeedFullMps=Math.max(\n    ultraHighSpeedStartMps+5,\n    safeNumber(vehicle?.steeringUltraHighFullMps,90)\n  );\n  const ultraHighSpeedMaxBoost=Math.max(0,safeNumber(\n    vehicle?.steeringUltraHighExponentBoost,\n    vehicle?.vehicleClass==='racecar'?3.0:0\n  ));\n  const ultraHighSpeedT=ultraHighSpeedMaxBoost>0\n    ?smoothstep01((v-ultraHighSpeedStartMps)/(ultraHighSpeedFullMps-ultraHighSpeedStartMps))\n    :0;\n  const ultraHighSpeedExponentBoost=ultraHighSpeedMaxBoost*ultraHighSpeedT;\n  const steeringInputExponent=\n    baseSteeringInputExponent+ultraHighSpeedExponentBoost;\n`;
if(!s.includes(old))throw new Error('R22 steering exponent anchor not found');
s=s.replace(old,replacement);
const oldOut=`  result.highSpeedInputExponentBoost=steeringInputExponent-1;\n  result.steeringInputExponent=steeringInputExponent;\n  result.steeringCurveT=steeringCurveT;\n`;
const newOut=`  result.highSpeedInputExponentBoost=steeringInputExponent-1;\n  result.ultraHighSpeedExponentBoost=ultraHighSpeedExponentBoost;\n  result.ultraHighSpeedT=ultraHighSpeedT;\n  result.steeringInputExponent=steeringInputExponent;\n  result.steeringCurveT=steeringCurveT;\n`;
if(!s.includes(oldOut))throw new Error('R22 diagnostics anchor not found');
s=s.replace(oldOut,newOut);
fs.writeFileSync(path,s);
console.log('GRIP R22 F1 STEERING PATCH: PASS');
