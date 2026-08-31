import fs from 'node:fs';

const mainPath='src/main.js';
const qaPath='qa/V21_27_PHYSICS_SHADOW_QA.mjs';
let main=fs.readFileSync(mainPath,'utf8');
let qa=fs.readFileSync(qaPath,'utf8');

const replaceMain=(from,to,label)=>{
  if(!main.includes(from))throw new Error(`Missing main anchor: ${label}`);
  main=main.replace(from,to);
};
const replaceQa=(from,to,label)=>{
  if(!qa.includes(from))throw new Error(`Missing QA anchor: ${label}`);
  qa=qa.replace(from,to);
};

replaceMain(
`// V21.27.2 diagnostics only. Safe to inspect from DevTools; values do not
// feed back into the authoritative V21.26 vehicle integrator.
window.WorldDrivePhysicsShadow=()=>
  drivingRuntime?.physicsShadowDiagnostics?.()||null;
`,
`// V21.27.2 diagnostics only. Safe to inspect from DevTools; values do not
// feed back into the authoritative V21.26 vehicle integrator. C6.6 makes the
// canonical diagnostics root authoritative while preserving the DevTools name.
worldDriveDiagnostics.physics.shadow=()=>
  drivingRuntime?.physicsShadowDiagnostics?.()||null;
installDiagnosticAlias(
  'WorldDrivePhysicsShadow',
  ()=>worldDriveDiagnostics.physics.shadow,
  window
);
`,
'legacy physics-shadow DevTools hook'
);

replaceQa(
  "const runtimePath=path.join(root,'src','driving-runtime.js');\n",
  "const runtimePath=path.join(root,'src','driving-runtime.js');\nconst runtimeBasePath=path.join(root,'src','driving-runtime-base.js');\n",
  'runtime path anchor'
);
replaceQa(
  "const runtime=fs.readFileSync(runtimePath,'utf8');\nconst main=fs.readFileSync(mainPath,'utf8');\n",
  "const runtime=fs.readFileSync(runtimePath,'utf8');\nconst runtimeBase=fs.readFileSync(runtimeBasePath,'utf8');\nconst main=fs.readFileSync(mainPath,'utf8');\n",
  'runtime read anchor'
);
replaceQa(
  "assert.match(runtime,/createPerWheelShadowSolver/,'driving runtime does not import/create shadow solver');\nassert.match(runtime,/physicsShadow\\.advance\\(dt,\\{/,'driving runtime does not advance shadow solver');\nassert.match(runtime,/physicsShadowDiagnostics:\\(\\)=>physicsShadow\\.diagnostics\\(\\)/,'shadow diagnostics are not exposed by driving runtime');\n",
  "assert.match(runtime,/from '.\\/driving-runtime-base\\.js'/,'canonical driving runtime no longer delegates to base runtime');\nassert.match(runtimeBase,/createPerWheelShadowSolver/,'driving runtime base does not import/create shadow solver');\nassert.match(runtimeBase,/physicsShadow\\.advance\\(dt,\\{/,'driving runtime base does not advance shadow solver');\nassert.match(runtimeBase,/physicsShadowDiagnostics:\\(\\)=>physicsShadow\\.diagnostics\\(\\)/,'shadow diagnostics are not exposed by driving runtime base');\n",
  'shadow runtime ownership assertions'
);
replaceQa(
  "assert.match(main,/window\\.WorldDrivePhysicsShadow=/,'DevTools shadow diagnostics hook is missing');\n",
  "assert.match(main,/worldDriveDiagnostics\\.physics\\.shadow=\\(\\)=>/,'canonical physics-shadow diagnostics hook is missing');\nassert.match(main,/installDiagnosticAlias\\(\\s*'WorldDrivePhysicsShadow'/s,'DevTools physics-shadow compatibility delegate is missing');\n",
  'main DevTools hook assertion'
);
replaceQa(
  "assert.doesNotMatch(runtime,/predictedAccelX\\s*[+\\-*/]?=/,'shadow predictedAccelX is being written into runtime state');\nassert.doesNotMatch(runtime,/predictedAccelZ\\s*[+\\-*/]?=/,'shadow predictedAccelZ is being written into runtime state');\nassert.doesNotMatch(runtime,/predictedYawAccel\\s*[+\\-*/]?=/,'shadow predictedYawAccel is being written into runtime state');\n",
  "assert.doesNotMatch(runtimeBase,/predictedAccelX\\s*[+\\-*/]?=/,'shadow predictedAccelX is being written into runtime state');\nassert.doesNotMatch(runtimeBase,/predictedAccelZ\\s*[+\\-*/]?=/,'shadow predictedAccelZ is being written into runtime state');\nassert.doesNotMatch(runtimeBase,/predictedYawAccel\\s*[+\\-*/]?=/,'shadow predictedYawAccel is being written into runtime state');\n",
  'non-authoritative guards'
);

fs.writeFileSync(mainPath,main);
fs.writeFileSync(qaPath,qa);
console.log('C6.6 canonical physics-shadow diagnostics materialized');
