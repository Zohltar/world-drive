import fs from 'node:fs';

const path='src/driving-runtime.js';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';")){
  const marker="export {drivenWheelSlipLevels,wheelspinDynamicGripFactor};\n";
  if(!source.includes(marker))throw new Error('wheelspin export marker not found');
  source=source.replace(marker,marker+"import {ensureWorldDriveDiagnostics} from './diagnostics.js';\n");
}

if(!source.includes('const wheelspinDiagnostics=ensureWorldDriveDiagnostics().wheelspin;')){
  const marker='  const wheelspinState=createWheelspinState();\n';
  if(!source.includes(marker))throw new Error('wheelspin state marker not found');
  source=source.replace(marker,marker+'  const wheelspinDiagnostics=ensureWorldDriveDiagnostics().wheelspin;\n');
}

const oldBlock=`    if(typeof globalThis!=='undefined')globalThis.WorldDriveRuntimeWheelspin={\n      level:wheelspin.level,\n      holdSec:wheelspin.holdSec,\n      drivetrain,\n      wheels:wheelspin.wheels\n    };`;
const newBlock=`    wheelspinDiagnostics.runtime={\n      level:wheelspin.level,\n      holdSec:wheelspin.holdSec,\n      drivetrain,\n      wheels:wheelspin.wheels\n    };`;
if(source.includes(oldBlock))source=source.replace(oldBlock,newBlock);
else if(!source.includes(newBlock))throw new Error('legacy wheelspin diagnostic publication block not found');

if(source.includes('WorldDriveRuntimeWheelspin'))throw new Error('legacy wheelspin diagnostic global remains');

fs.writeFileSync(path,source);
console.log('C6.3 canonical wheelspin diagnostic publication materialized');
