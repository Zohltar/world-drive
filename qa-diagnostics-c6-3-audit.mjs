import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const runtimePath='src/driving-runtime.js';
const runtime=fs.readFileSync(runtimePath,'utf8');
const globalName='WorldDriveRuntimeWheelspin';

function expect(value,message){if(!value)throw new Error(message);}
function positions(source,needle){
  const out=[];let i=0;
  while((i=source.indexOf(needle,i))!==-1){out.push(i);i+=needle.length;}
  return out;
}

const srcFiles=[];
function walk(dir){
  if(!fs.existsSync(dir))return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const rel=path.join(dir,entry.name);
    if(entry.isDirectory())walk(rel);
    else if(/\.(?:js|mjs|cjs)$/.test(entry.name))srcFiles.push(rel);
  }
}
walk('src');
const qaFiles=[
  ...fs.readdirSync(root).filter(name=>/^qa-.*\.mjs$/.test(name)),
  ...fs.readdirSync('qa').filter(name=>/\.mjs$/.test(name)).map(name=>path.join('qa',name))
];

const sourceMentions=[];
for(const file of srcFiles){
  const source=fs.readFileSync(file,'utf8');
  if(source.includes(globalName))sourceMentions.push(file);
}
const qaMentions=[];
for(const file of qaFiles){
  const source=fs.readFileSync(file,'utf8');
  if(source.includes(globalName))qaMentions.push(file);
}

expect(sourceMentions.length===1&&sourceMentions[0]===runtimePath,
  `wheelspin diagnostic must have one source owner; found ${sourceMentions.join(', ')}`);
expect(qaMentions.length===0,
  `wheelspin diagnostic unexpectedly has QA consumers: ${qaMentions.join(', ')}`);
expect(positions(runtime,globalName).length===1,'wheelspin diagnostic global must appear exactly once in runtime');

const driveGuard=runtime.indexOf("if(String(tractionArgs?.mode||'')!=='drive')return result;");
const advance=runtime.indexOf('const wheelspin=wheelspinState.advance({');
const gripApply=runtime.indexOf('if(wheelspin.level>.01&&result&&Number.isFinite(Number(result.acceleration))){');
const publish=runtime.indexOf(`globalThis.${globalName}={`);
const returnResult=runtime.indexOf('return result;',publish);
expect(driveGuard>=0&&advance>driveGuard,'wheelspin advance must remain after drive-mode early return');
expect(gripApply>advance,'wheelspin grip application must remain after authoritative B6 advance');
expect(publish>gripApply,'diagnostic publication must remain after wheelspin grip/result mutation');
expect(returnResult>publish,'diagnostic publication must remain immediately before traction result return');

const publishSlice=runtime.slice(publish,returnResult);
for(const marker of [
  'level:wheelspin.level',
  'holdSec:wheelspin.holdSec',
  'drivetrain,',
  'wheels:wheelspin.wheels'
])expect(publishSlice.includes(marker),`wheelspin diagnostic payload marker missing: ${marker}`);
expect(!publishSlice.includes('gripFactor:'),'legacy wheelspin diagnostic unexpectedly publishes gripFactor');
expect(!publishSlice.includes('vehicleClass:'),'legacy wheelspin diagnostic unexpectedly publishes vehicleClass');

// Important timing semantics: resets can happen during transmission handling, but the
// diagnostic is only refreshed on the next drive-mode longitudinal traction call.
const resetPositions=positions(runtime,'wheelspinState.reset();');
expect(resetPositions.length>=2,'expected combustion/EV wheelspin reset points missing');
expect(resetPositions.every(i=>i<publish),'wheelspin reset point moved after diagnostic publication');

console.log('CLEANUP C6.3 WHEELSPIN DIAGNOSTICS READ-ONLY AUDIT: PASS',{
  sourceOwner:sourceMentions[0],
  qaConsumers:qaMentions.length,
  sourceOccurrences:positions(runtime,globalName).length,
  publicationOrder:{driveGuard,advance,gripApply,publish,returnResult},
  payload:['level','holdSec','drivetrain','wheels'],
  resetPoints:resetPositions.length,
  semanticNote:'publish only on drive-mode traction call; reset does not eagerly publish'
});
