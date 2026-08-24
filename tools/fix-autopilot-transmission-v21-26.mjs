import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mainPath=path.join(root,'src','main.js');
const transmissionPath=path.join(root,'src','transmission-controller.js');

const rawMain=fs.readFileSync(mainPath,'utf8');
const rawTransmission=fs.readFileSync(transmissionPath,'utf8');
const mainEol=rawMain.includes('\r\n')?'\r\n':'\n';
const transmissionEol=rawTransmission.includes('\r\n')?'\r\n':'\n';
let main=rawMain.replace(/\r\n/g,'\n');
let transmission=rawTransmission.replace(/\r\n/g,'\n');

const oldFacade='function updateTransmission(...args){return transmissionController.updateTransmission(...args);}';
const newFacade='function updateTransmission(dt,requestedThrottle,onPavement=true){return transmissionController.updateTransmission(dt,requestedThrottle,onPavement,autopilot);}';
const oldSignature='function updateTransmission(dt,requestedThrottle,onPavement=true){';
const newSignature='function updateTransmission(dt,requestedThrottle,onPavement=true,automaticOverride=false){';

const alreadyApplied=
  main.includes(newFacade)&&
  transmission.includes(newSignature)&&
  transmission.includes("const automaticShiftMode=\n      automaticOverride||\n      state.transmissionMode==='automatic';");

if(alreadyApplied){
  console.log('V21.26 AUTOPILOT TRANSMISSION FIX: already applied');
  process.exit(0);
}

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`V21.26 autopilot transmission fix: ${label} not found. No files changed.`);
  if(source.indexOf(needle,first+needle.length)>=0){
    throw new Error(`V21.26 autopilot transmission fix: ${label} is ambiguous. No files changed.`);
  }
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

main=replaceOnce(main,oldFacade,newFacade,'transmission facade');
transmission=replaceOnce(transmission,oldSignature,newSignature,'updateTransmission signature');

const kmhAnchor='    const kmh=Math.abs(getSpeed())*3.6;';
transmission=replaceOnce(
  transmission,
  kmhAnchor,
  `${kmhAnchor}\n\n    const automaticShiftMode=\n      automaticOverride||\n      state.transmissionMode==='automatic';`,
  'automatic shift mode anchor'
);

transmission=replaceOnce(
  transmission,
  "    if(state.transmissionMode==='automatic'){",
  '    if(automaticShiftMode){',
  'automatic gear-selection branch'
);

const desiredAnchor='    let desiredGear=\n      state.transmissionGear;';
transmission=replaceOnce(
  transmission,
  desiredAnchor,
  `    if(automaticOverride){\n      // Autopilot owns the drivetrain while active. Ignore any queued manual\n      // request without changing the player's selected transmission mode.\n      state.manualShiftRequest=null;\n    }\n\n${desiredAnchor}`,
  'manual request cleanup anchor'
);

const oldLimiter=`    const limiterAllowed=\n      state.transmissionMode==='manual'\n        ?state.transmissionGear>=1\n        :topGear;`;
const newLimiter=`    const limiterAllowed=\n      automaticShiftMode\n        ?topGear\n        :state.transmissionGear>=1;`;
transmission=replaceOnce(transmission,oldLimiter,newLimiter,'rev limiter mode');

for(const required of [
  newFacade,
  newSignature,
  'const automaticShiftMode=',
  'if(automaticShiftMode){',
  'if(automaticOverride){',
  'automaticShiftMode\n        ?topGear'
]){
  const source=required===newFacade?main:transmission;
  if(!source.includes(required)){
    throw new Error(`V21.26 autopilot transmission fix: generated source missing ${required}. No files changed.`);
  }
}

const tempMain=path.join(root,'tools','__v21_26_autopilot_transmission_main_check__.mjs');
const tempTransmission=path.join(root,'tools','__v21_26_autopilot_transmission_controller_check__.mjs');
function syntaxCheck(file){
  const result=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
  if(result.status!==0){
    throw new Error(`Syntax check failed for ${path.basename(file)}:\n${result.stderr||result.stdout}`);
  }
}

try{
  fs.writeFileSync(tempMain,main,'utf8');
  fs.writeFileSync(tempTransmission,transmission,'utf8');
  syntaxCheck(tempMain);
  syntaxCheck(tempTransmission);
}finally{
  fs.rmSync(tempMain,{force:true});
  fs.rmSync(tempTransmission,{force:true});
}

fs.writeFileSync(mainPath,mainEol==='\n'?main:main.replace(/\n/g,mainEol),'utf8');
fs.writeFileSync(transmissionPath,transmissionEol==='\n'?transmission:transmission.replace(/\n/g,transmissionEol),'utf8');

console.log('V21.26 AUTOPILOT TRANSMISSION FIX: APPLIED');
console.log('Autopilot now forces automatic gear selection while active without changing the saved/manual transmission mode.');
