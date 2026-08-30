import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const path='src/vehicle-dynamics-v21.29.js';
let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
if(source.includes('Grip R13 — progressive highway steering')){
  console.log('Grip R13 already applied');
  process.exit(0);
}

const needle=`  const steeringCurveMaxExponent=Math.max(\n    1.4,\n    safeNumber(vehicle?.steeringInputExponentHigh,3.2)\n  );\n`;
const replacement=`  // Grip R13 — progressive highway steering. V21.29 owns the active steering\n  // curve, so tune it here rather than in the frozen base implementation. Keep\n  // low-speed steering unchanged and preserve 100% input = 100% mechanical lock.\n  // At full speed: 25% stick ~= 0.39% rack, 50% ~= 6.25%, 85% ~= 52%.\n  const steeringCurveMaxExponent=Math.max(\n    4.0,\n    safeNumber(vehicle?.steeringInputExponentHigh,4.0)\n  );\n`;
const at=source.indexOf(needle);
if(at<0)throw new Error('Grip R13 active V21.29 steering curve anchor missing');
if(source.indexOf(needle,at+needle.length)>=0)throw new Error('Grip R13 active V21.29 steering curve anchor ambiguous');
source=source.slice(0,at)+replacement+source.slice(at+needle.length);
fs.writeFileSync(path,source,'utf8');
const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
if(check.status!==0)throw new Error(check.stderr||check.stdout||'syntax check failed');
console.log('Grip R13 progressive high-speed steering input applied to active V21.29 curve');
