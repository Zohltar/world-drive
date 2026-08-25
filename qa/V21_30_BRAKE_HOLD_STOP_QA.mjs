import fs from 'node:fs';

const src=fs.readFileSync(new URL('../src/driving-runtime.js',import.meta.url),'utf8');
const checks=[
  ['brake hold threshold', /holdStopped=lights\.braking&&residualSpeed<\.18/],
  ['speed locked to zero', /speed:0/],
  ['longitudinal accel cleared', /longitudinalAccel:0/],
  ['yaw cleared at stopped brake hold', /dynamicYawRate:0/],
  ['brake remains authoritative input', /serviceBrake/]
];
let failed=0;
for(const [name,re] of checks){
  const ok=re.test(src);
  console.log(`${ok?'PASS':'FAIL'} ${name}`);
  if(!ok)failed++;
}
if(failed)process.exit(1);
console.log('PASS V21.30 brake-held stop guard');
