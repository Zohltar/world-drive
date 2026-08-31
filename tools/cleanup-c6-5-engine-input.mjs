import fs from 'node:fs';

const path='src/transmission-controller.js';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';")){
  const marker="import {publishTransmissionNetworkGear} from './transmission-network-state.js';\n";
  if(!source.includes(marker))throw new Error('transmission network import marker missing');
  source=source.replace(marker,marker+"import {ensureWorldDriveDiagnostics} from './diagnostics.js';\n");
}

const oldHelper=`function publishEngineInput({throttle=0,clutchHeld=false}={}){\n  if(typeof window==='undefined')return;\n  window.WorldDriveEngineInput={throttle:clamp01(Math.max(0,Number(throttle)||0)),clutchHeld:!!clutchHeld};\n}`;
const newHelper=`function publishEngineInput(diagnostics,{throttle=0,clutchHeld=false}={}){\n  if(!diagnostics)return;\n  diagnostics.engineInput={throttle:clamp01(Math.max(0,Number(throttle)||0)),clutchHeld:!!clutchHeld};\n}`;
if(source.includes(oldHelper))source=source.replace(oldHelper,newHelper);
else if(!source.includes(newHelper))throw new Error('engine-input publisher helper marker missing');

if(!source.includes("const engineInputDiagnostics=typeof window==='undefined'?null:ensureWorldDriveDiagnostics().physics;")){
  const marker="  const rawGetSpeed=typeof args.getSpeed==='function'?args.getSpeed:()=>0;\n";
  if(!source.includes(marker))throw new Error('controller raw speed marker missing');
  source=source.replace(marker,marker+"  const engineInputDiagnostics=typeof window==='undefined'?null:ensureWorldDriveDiagnostics().physics;\n");
}

source=source.replaceAll('publishEngineInput({','publishEngineInput(engineInputDiagnostics,{');

if(source.includes('WorldDriveEngineInput'))throw new Error('legacy engine-input global remains');
const calls=(source.match(/publishEngineInput\(engineInputDiagnostics,\{/g)||[]).length;
if(calls!==2)throw new Error(`expected two canonical engine-input publications, found ${calls}`);

fs.writeFileSync(path,source);
console.log('C6.5 canonical engine-input diagnostics materialized');
