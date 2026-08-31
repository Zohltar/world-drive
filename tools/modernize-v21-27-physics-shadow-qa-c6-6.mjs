import fs from 'node:fs';
const path='qa/V21_27_PHYSICS_SHADOW_QA.mjs';
let s=fs.readFileSync(path,'utf8');
const replace=(from,to,label)=>{
  if(!s.includes(from))throw new Error(`Missing ${label}`);
  s=s.replace(from,to);
};
replace(
  "const runtimePath=path.join(root,'src','driving-runtime.js');\n",
  "const runtimePath=path.join(root,'src','driving-runtime.js');\nconst runtimeBasePath=path.join(root,'src','driving-runtime-base.js');\n",
  'runtime path anchor'
);
replace(
  "const runtime=fs.readFileSync(runtimePath,'utf8');\nconst main=fs.readFileSync(mainPath,'utf8');\n",
  "const runtime=fs.readFileSync(runtimePath,'utf8');\nconst runtimeBase=fs.readFileSync(runtimeBasePath,'utf8');\nconst main=fs.readFileSync(mainPath,'utf8');\n",
  'runtime read anchor'
);
replace(
  "assert.match(runtime,/createPerWheelShadowSolver/,'driving runtime does not import/create shadow solver');\nassert.match(runtime,/physicsShadow\\.advance\\(dt,\\{/,'driving runtime does not advance shadow solver');\nassert.match(runtime,/physicsShadowDiagnostics:\\(\\)=>physicsShadow\\.diagnostics\\(\\)/,'shadow diagnostics are not exposed by driving runtime');\n",
  "assert.match(runtime,/from '.\\/driving-runtime-base\\.js'/,'canonical driving runtime no longer delegates to base runtime');\nassert.match(runtimeBase,/createPerWheelShadowSolver/,'driving runtime base does not import/create shadow solver');\nassert.match(runtimeBase,/physicsShadow\\.advance\\(dt,\\{/,'driving runtime base does not advance shadow solver');\nassert.match(runtimeBase,/physicsShadowDiagnostics:\\(\\)=>physicsShadow\\.diagnostics\\(\\)/,'shadow diagnostics are not exposed by driving runtime base');\n",
  'shadow integration assertions'
);
replace(
  "assert.doesNotMatch(runtime,/predictedAccelX\\s*[+\\-*/]?=/,'shadow predictedAccelX is being written into runtime state');\nassert.doesNotMatch(runtime,/predictedAccelZ\\s*[+\\-*/]?=/,'shadow predictedAccelZ is being written into runtime state');\nassert.doesNotMatch(runtime,/predictedYawAccel\\s*[+\\-*/]?=/,'shadow predictedYawAccel is being written into runtime state');\n",
  "assert.doesNotMatch(runtimeBase,/predictedAccelX\\s*[+\\-*/]?=/,'shadow predictedAccelX is being written into runtime state');\nassert.doesNotMatch(runtimeBase,/predictedAccelZ\\s*[+\\-*/]?=/,'shadow predictedAccelZ is being written into runtime state');\nassert.doesNotMatch(runtimeBase,/predictedYawAccel\\s*[+\\-*/]?=/,'shadow predictedYawAccel is being written into runtime state');\n",
  'non-authoritative guards'
);
fs.writeFileSync(path,s);
console.log('V21.27 physics-shadow QA modernized to current runtime ownership');
