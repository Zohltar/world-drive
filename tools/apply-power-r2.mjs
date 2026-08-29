import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const path='src/vehicle-system.js';
let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function replaceOnce(from,to,label){
  const first=source.indexOf(from);
  if(first<0)throw new Error(`Power R2 anchor missing: ${label}`);
  if(source.indexOf(from,first+1)>=0)throw new Error(`Power R2 anchor not unique: ${label}`);
  source=source.slice(0,first)+to+source.slice(first+from.length);
}

replaceOnce(
`      peakTorqueNm:350,
      torqueCurveNm:[
        [850,180],
        [1200,230],
        [1600,300],
        [2000,350],
        [5200,350],
        [5600,345],
        [6100,300]
      ],
      finalDriveRatio:4.111,
      driveWheelRadiusM:0.3265,
      drivetrainEfficiency:0.82,`,
`      // Power R2 — broaden the low/mid-rpm torque band for the requested WRX
      // punch while keeping the 4600-5600 rpm power plateau near ~202 kW
      // (~271 hp). This improves in-gear response without raising road top speed.
      peakTorqueNm:420,
      torqueCurveNm:[
        [850,200],
        [1200,280],
        [1600,370],
        [1800,420],
        [4600,420],
        [5200,372],
        [5600,345],
        [6100,300]
      ],
      finalDriveRatio:4.111,
      driveWheelRadiusM:0.3265,
      drivetrainEfficiency:0.86,`,
'WRX torque curve and drivetrain efficiency'
);

fs.writeFileSync(path,source);
const check=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
if(check.status!==0)process.exit(check.status||1);
console.log('Power R2 WRX midrange torque calibration applied');
