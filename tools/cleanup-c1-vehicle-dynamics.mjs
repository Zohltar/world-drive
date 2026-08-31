import fs from 'node:fs';

const oldBase='src/vehicle-dynamics-base.js';
const core='src/vehicle-dynamics-core.js';
const oldV29='src/vehicle-dynamics-v21.29.js';
const control='src/vehicle-dynamics-traction-steering.js';
const canonical='src/vehicle-dynamics.js';

function mustExist(path){
  if(!fs.existsSync(path))throw new Error(`C1 expected file missing: ${path}`);
}
function mustNotExist(path){
  if(fs.existsSync(path))throw new Error(`C1 target already exists unexpectedly: ${path}`);
}
function replaceExact(path,from,to,expectedMin=1){
  const before=fs.readFileSync(path,'utf8');
  const count=before.split(from).length-1;
  if(count<expectedMin)throw new Error(`C1 expected ${expectedMin}+ occurrences of ${from} in ${path}, found ${count}`);
  const after=before.split(from).join(to);
  fs.writeFileSync(path,after);
  return count;
}

for(const p of [oldBase,oldV29,canonical])mustExist(p);
for(const p of [core,control])mustNotExist(p);

// Pure renames first: behavior stays byte-identical apart from import paths.
fs.renameSync(oldBase,core);
fs.renameSync(oldV29,control);

const edits=[];
edits.push([control,replaceExact(control,"./vehicle-dynamics-base.js","./vehicle-dynamics-core.js",2)]);
edits.push([canonical,replaceExact(canonical,"./vehicle-dynamics-v21.29.js","./vehicle-dynamics-traction-steering.js",2)]);

// Migrate the handful of direct ownership/source-location QA references found
// by the C1 audit. Runtime consumers continue to use only vehicle-dynamics.js.
const replacements=[
  ['qa-grip-steering-curve-r3.mjs',"./src/vehicle-dynamics-v21.29.js","./src/vehicle-dynamics.js"],
  ['qa-wheelspin-state-b6.mjs',"src/vehicle-dynamics-v21.29.js","src/vehicle-dynamics-traction-steering.js"],
  ['qa-grip-handbrake-r1.mjs','src/vehicle-dynamics-base.js','src/vehicle-dynamics-core.js'],
  ['qa-momentum-direction-b4.mjs','src/vehicle-dynamics-base.js','src/vehicle-dynamics-core.js'],
  ['qa/V21_27_PHYSICS_FOUNDATION_QA.mjs','src/vehicle-dynamics-base.js','src/vehicle-dynamics-core.js'],
  ['.github/workflows/qa-cleanup-b6.yml','src/vehicle-dynamics-v21.29.js','src/vehicle-dynamics-traction-steering.js'],
  ['.github/workflows/qa-grip-r22.yml','src/vehicle-dynamics-v21.29.js','src/vehicle-dynamics-traction-steering.js']
];
for(const [path,from,to] of replacements){
  mustExist(path);
  const text=fs.readFileSync(path,'utf8');
  if(text.includes(from))edits.push([path,replaceExact(path,from,to,1)]);
}

console.log('C1 deterministic vehicle-dynamics migration applied',{
  renamed:[`${oldBase} -> ${core}`,`${oldV29} -> ${control}`],
  edits
});
