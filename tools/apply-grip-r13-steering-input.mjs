import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const path='src/vehicle-dynamics-base.js';
let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
if(source.includes('Grip R13 — high-speed fine steering')){
  console.log('Grip R13 already applied');
  process.exit(0);
}

const needle=`    const vehicleExponent=Math.max(.75,safeNumber(vehicle?.steeringInputExponent,1.65));\n    const highSpeedT=clampDynamics((v-8.3)/26.4,0,1);\n    const highSpeedSmooth=highSpeedT*highSpeedT*(3-2*highSpeedT);\n    target=Math.sign(target)*Math.pow(Math.abs(target),vehicleExponent+1.15*highSpeedSmooth);\n`;
const replacement=`    const vehicleExponent=Math.max(.75,safeNumber(vehicle?.steeringInputExponent,1.65));\n    const highSpeedT=clampDynamics((v-8.3)/26.4,0,1);\n    const highSpeedSmooth=highSpeedT*highSpeedT*(3-2*highSpeedT);\n    // Grip R13 — high-speed fine steering. Preserve the full-lock endpoint, but\n    // make the centre/mid-stick region substantially softer as road speed rises.\n    // The extra exponent only appears with speed, so parking/hairpins keep their\n    // existing direct feel while highway corrections gain much finer resolution.\n    const highSpeedInputExponentBoost=2.20*highSpeedSmooth;\n    target=Math.sign(target)*Math.pow(Math.abs(target),vehicleExponent+highSpeedInputExponentBoost);\n`;
const at=source.indexOf(needle);
if(at<0)throw new Error('Grip R13 steering input anchor missing');
if(source.indexOf(needle,at+needle.length)>=0)throw new Error('Grip R13 steering input anchor ambiguous');
source=source.slice(0,at)+replacement+source.slice(at+needle.length);
fs.writeFileSync(path,source,'utf8');
const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
if(check.status!==0)throw new Error(check.stderr||check.stdout||'syntax check failed');
console.log('Grip R13 progressive high-speed steering input applied');
