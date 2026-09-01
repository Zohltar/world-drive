import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const norm=p=>p.replaceAll('\\','/');
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const moved=[
  'src/physics/vehicle-dynamics.js',
  'src/physics/vehicle-dynamics-core.js',
  'src/physics/vehicle-dynamics-traction-steering.js'
];
const old=[
  ['src','vehicle-dynamics.js'].join('/'),
  ['src','vehicle-dynamics-core.js'].join('/'),
  ['src','vehicle-dynamics-traction-steering.js'].join('/')
];

for(const file of moved)assert.ok(fs.existsSync(file),`R5a moved module missing: ${file}`);
for(const file of old)assert.equal(fs.existsSync(file),false,`R5a legacy root path returned: ${file}`);

const main=read('src/main.js');
const presentation=read('src/vehicles/vehicle-presentation.js');
const presentationLegacy=read('src/vehicles/vehicle-presentation-v21.29.js');
const facade=read('src/physics/vehicle-dynamics.js');
const core=read('src/physics/vehicle-dynamics-core.js');
const steering=read('src/physics/vehicle-dynamics-traction-steering.js');

assert.match(main,/from '\.\/physics\/vehicle-dynamics\.js'/,'main must import the R5a dynamics facade from src/physics');
assert.match(presentation,/\.\.\/physics\/vehicle-dynamics\.js/,'vehicle presentation must import dynamics from src/physics');
assert.match(presentationLegacy,/\.\.\/physics\/vehicle-dynamics\.js/,'legacy-named vehicle presentation must import dynamics from src/physics');
assert.match(facade,/\.\/vehicle-dynamics-traction-steering\.js/,'R5a facade must retain sibling traction/steering layering');
assert.match(steering,/\.\/vehicle-dynamics-core\.js/,'R5a traction/steering layer must retain sibling core dependency');
assert.match(core,/\.\/momentum-direction\.js/,'R5a core must consume nested momentum-direction as sibling');
assert.doesNotMatch(core,/\.\/physics\/momentum-direction\.js/,'R5a core must not retain pre-move nested physics prefix');

function walk(dir){
  if(!fs.existsSync(dir))return [];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(p));
    else out.push(norm(p));
  }
  return out;
}

const allowedOldPathFiles=new Set([
  'qa-vehicle-dynamics-c1.mjs',
  'qa-source-tree-r5a-vehicle-dynamics.mjs'
]);
const stale=[];
const scanFiles=[
  ...walk('qa').filter(p=>/\.(?:js|mjs|cjs)$/.test(p)),
  ...walk('.github/workflows').filter(p=>/\.(?:yml|yaml)$/.test(p)),
  ...fs.readdirSync('.').filter(n=>/^qa-.*\.mjs$/.test(n))
];
for(const file of [...new Set(scanFiles)].sort()){
  if(allowedOldPathFiles.has(file))continue;
  const text=read(file);
  for(const legacy of old){
    if(text.includes(legacy))stale.push({file,legacy});
  }
}
assert.deepEqual(stale,[],'R5a stale current-path contracts remain in QA/CI');

const dynamics=await import('./src/physics/vehicle-dynamics.js');
for(const name of [
  'vehicleLayout','aerodynamicLoad','longitudinalTractionLimit','steeringCommand',
  'advanceSteeringRack','lateralDynamicsEnvelope','estimateWheelGripUsage',
  'antiRollCalibration','antiRollAxleGripScales','lowSpeedYawAuthority'
])assert.equal(typeof dynamics[name],'function',`R5a canonical export missing: ${name}`);

console.log('SOURCE TREE R5a VEHICLE DYNAMICS BOUNDARY QA: PASS',{
  moved,
  staleContracts:stale.length,
  publicBoundary:'src/physics/vehicle-dynamics.js'
});
