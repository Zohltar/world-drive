import fs from 'node:fs';
import {ensureWorldDriveDiagnostics} from './src/diagnostics.js';

function expect(value,message){if(!value)throw new Error(message);}
function positions(source,needle){
  const out=[];let i=0;
  while((i=source.indexOf(needle,i))!==-1){out.push(i);i+=needle.length;}
  return out;
}

const rootBefore=ensureWorldDriveDiagnostics();
const wheelspinBefore=rootBefore.wheelspin;
delete wheelspinBefore.runtime;
await import(`./src/driving-runtime.js?c6_3=${Date.now()}`);
const rootAfter=ensureWorldDriveDiagnostics();
expect(rootAfter===rootBefore,'C6.3 must preserve stable diagnostics-root identity');
expect(rootAfter.wheelspin===wheelspinBefore,'C6.3 must preserve stable wheelspin-category identity');
expect(!Object.prototype.hasOwnProperty.call(rootAfter.wheelspin,'runtime'),
  'importing driving runtime must not eagerly publish a wheelspin payload');
expect(!Object.prototype.hasOwnProperty.call(globalThis,'WorldDriveRuntimeWheelspin'),
  'legacy wheelspin diagnostic global should no longer be installed');

const source=fs.readFileSync(new URL('./src/driving-runtime.js',import.meta.url),'utf8');
expect(source.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';"),
  'driving runtime must import canonical diagnostics root');
expect(source.includes('const wheelspinDiagnostics=ensureWorldDriveDiagnostics().wheelspin;'),
  'driving runtime must bind the stable canonical wheelspin category');
expect(!source.includes('WorldDriveRuntimeWheelspin'),
  'legacy wheelspin diagnostic global writer remains');
expect(positions(source,'wheelspinDiagnostics.runtime={').length===1,
  'canonical wheelspin runtime payload must have one writer');

const driveGuard=source.indexOf("if(String(tractionArgs?.mode||'')!=='drive')return result;");
const advance=source.indexOf('const wheelspin=wheelspinState.advance({');
const gripApply=source.indexOf('if(wheelspin.level>.01&&result&&Number.isFinite(Number(result.acceleration))){');
const publish=source.indexOf('wheelspinDiagnostics.runtime={');
const returnResult=source.indexOf('return result;',publish);
expect(driveGuard>=0&&advance>driveGuard,'canonical publication changed drive-only wheelspin timing');
expect(gripApply>advance,'B6 wheelspin/grip ordering changed');
expect(publish>gripApply,'canonical diagnostic must remain a post-calculation observer');
expect(returnResult>publish,'canonical diagnostic must remain immediately before drive traction return');

const payload=source.slice(publish,returnResult);
for(const marker of [
  'level:wheelspin.level',
  'holdSec:wheelspin.holdSec',
  'drivetrain,',
  'wheels:wheelspin.wheels'
])expect(payload.includes(marker),`canonical wheelspin payload marker missing: ${marker}`);
expect(!payload.includes('gripFactor:'),'C6.3 changed legacy wheelspin diagnostic payload with gripFactor');
expect(!payload.includes('vehicleClass:'),'C6.3 changed legacy wheelspin diagnostic payload with vehicleClass');

const resets=positions(source,'wheelspinState.reset();');
expect(resets.length>=2&&resets.every(i=>i<publish),
  'wheelspin resets must remain before drive-only diagnostic publication');
expect(!source.includes('wheelspinDiagnostics.runtime=null')&&!source.includes('delete wheelspinDiagnostics.runtime'),
  'C6.3 must not eagerly clear diagnostics on reset/non-drive paths');

console.log('CLEANUP C6.3 WHEELSPIN DIAGNOSTICS QA: PASS',{
  stableRoot:true,
  stableCategory:true,
  noEagerPublication:true,
  legacyGlobalRemoved:true,
  driveOnlyPublication:true,
  payload:['level','holdSec','drivetrain','wheels'],
  resetCadencePreserved:true
});
