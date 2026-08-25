import {
  drivenWheelSlipLevels,
  wheelspinDynamicGripFactor
} from '../src/driving-runtime.js';

function fail(message){throw new Error(message);}

const civic=drivenWheelSlipLevels('FWD',1);
if(civic.length!==4)fail('Expected four wheel slip channels');
if(civic[0]!==0||civic[2]!==0)fail('Civic rear wheels must remain non-driven');
if(civic[1]<.99||civic[3]<.99)fail('Civic front wheels must receive full runtime wheelspin');

const civicGrip=wheelspinDynamicGripFactor('FWD',1,'passenger');
const wrxGrip=wheelspinDynamicGripFactor('AWD',1,'passenger');
const countachGrip=wheelspinDynamicGripFactor('RWD',1,'passenger');
if(!(civicGrip<wrxGrip))fail('FWD clutch wheelspin must lose more launch traction than AWD');
if(!(countachGrip<wrxGrip))fail('RWD clutch wheelspin must lose more launch traction than AWD');
if(Math.abs(civicGrip-.78)>.001)fail(`Expected Civic dynamic grip factor .78, got ${civicGrip}`);

// Runtime persistence is intentionally longer than the clutch shock itself.
// This guards the architecture: a ~0.11 s clutch bite can seed wheel angular
// velocity that persists long enough to be felt and to lay rubber as the car moves.
const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('../src/driving-runtime.js',import.meta.url),'utf8'));
for(const marker of ['wheelspinHoldSec','drivetrain===\'FWD\'?.62','skidMarksWithWheelspin','runtimeWheelspinLevel']){
  if(!source.includes(marker))fail(`Persistent runtime wheelspin path missing: ${marker}`);
}

console.log('V21.29 persistent runtime wheelspin QA passed',{
  civicGrip,
  wrxGrip,
  countachGrip,
  civicWheels:civic
});
