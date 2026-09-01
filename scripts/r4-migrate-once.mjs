import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const abs=p=>path.join(ROOT,p);
const exists=p=>fs.existsSync(abs(p));
const read=p=>fs.readFileSync(abs(p),'utf8');
const write=(p,text)=>fs.writeFileSync(abs(p),text);

const MOVES=[
  ['src/vehicle-system.js','src/vehicles/vehicle-system.js'],
  ['src/vehicle-visuals.js','src/vehicles/vehicle-visuals.js'],
  ['src/vehicle-presentation.js','src/vehicles/vehicle-presentation.js'],
  ['src/vehicle-presentation-v21.29.js','src/vehicles/vehicle-presentation-v21.29.js'],
  ['src/vehicle-authored-registry.js','src/vehicles/vehicle-authored-registry.js'],
  ['src/vehicle-render-contract.js','src/vehicles/vehicle-render-contract.js'],
  ['src/vehicle-glb-entries.js','src/vehicles/vehicle-glb-entries.js'],
  ['src/deferred-glb-system.js','src/vehicles/deferred-glb-system.js'],
  ['src/vehicle-placement-controller.js','src/vehicles/vehicle-placement-controller.js'],
  ['src/civic-glb.js','src/vehicles/models/civic-glb.js'],
  ['src/countach-glb.js','src/vehicles/models/countach-glb.js'],
  ['src/f1-glb.js','src/vehicles/models/f1-glb.js'],
  ['src/i3-glb.js','src/vehicles/models/i3-glb.js'],
  ['src/id4-glb.js','src/vehicles/models/id4-glb.js'],
  ['src/sonata-glb.js','src/vehicles/models/sonata-glb.js'],
  ['src/wrx-glb.js','src/vehicles/models/wrx-glb.js'],
  ['src/truck-trailer.js','src/vehicles/truck/truck-trailer.js']
];

for(const [from,to] of MOVES){
  if(!exists(from))throw new Error(`R4 source missing before move: ${from}`);
  if(exists(to))throw new Error(`R4 destination already exists: ${to}`);
  fs.mkdirSync(path.dirname(abs(to)),{recursive:true});
  fs.renameSync(abs(from),abs(to));
}

function replaceRequired(file,from,to){
  const text=read(file);
  if(!text.includes(from))throw new Error(`R4 expected text missing in ${file}: ${from}`);
  write(file,text.replaceAll(from,to));
}

// Production composition/import boundaries.
const sourceReplacements={
  'src/main.js':[
    ["from './vehicle-placement-controller.js'","from './vehicles/vehicle-placement-controller.js'"],
    ["from './vehicle-system.js'","from './vehicles/vehicle-system.js'"],
    ["from './vehicle-visuals.js'","from './vehicles/vehicle-visuals.js'"],
    ["from './truck-trailer.js'","from './vehicles/truck/truck-trailer.js'"],
    ["from './vehicle-glb-entries.js'","from './vehicles/vehicle-glb-entries.js'"],
    ["from './vehicle-presentation.js'","from './vehicles/vehicle-presentation.js'"]
  ],
  'src/multiplayer.js':[
    ["from './deferred-glb-system.js'","from './vehicles/deferred-glb-system.js'"]
  ],
  'src/skidmarks.js':[
    ["from './vehicle-render-contract.js'","from './vehicles/vehicle-render-contract.js'"]
  ],
  'src/multiplayer/multiplayer-vehicle-adapter.js':[
    ["from '../vehicle-system.js'","from '../vehicles/vehicle-system.js'"],
    ["from '../vehicle-authored-registry.js'","from '../vehicles/vehicle-authored-registry.js'"]
  ],
  'src/multiplayer/multiplayer-vehicle-registry.js':[
    ["from '../vehicle-system.js'","from '../vehicles/vehicle-system.js'"],
    ["from '../vehicle-authored-registry.js'","from '../vehicles/vehicle-authored-registry.js'"]
  ],
  'src/multiplayer/multiplayer-visuals-m3.js':[
    ["from '../vehicle-render-contract.js'","from '../vehicles/vehicle-render-contract.js'"]
  ],
  'src/vehicles/vehicle-presentation.js':[
    ["from './vehicle-dynamics.js'","from '../vehicle-dynamics.js'"]
  ],
  'src/vehicles/vehicle-presentation-v21.29.js':[
    ["from './vehicle-dynamics.js'","from '../vehicle-dynamics.js'"],
    ["from './physics/steering-geometry.js'","from '../physics/steering-geometry.js'"],
    ["from './physics/airborne-dynamics.js'","from '../physics/airborne-dynamics.js'"]
  ],
  'src/vehicles/deferred-glb-system.js':[
    ["from './diagnostics.js'","from '../diagnostics.js'"]
  ],
  'src/vehicles/models/wrx-glb.js':[
    ["from './physics/steering-geometry.js'","from '../../physics/steering-geometry.js'"]
  ]
};
for(const [file,replacements] of Object.entries(sourceReplacements)){
  for(const [from,to] of replacements)replaceRequired(file,from,to);
}

// Registry owns both machine-visible modulePath strings and lazy dynamic imports.
const registryFile='src/vehicles/vehicle-authored-registry.js';
for(const id of ['id4','wrx','civic','sonata','f1','countach','i3']){
  replaceRequired(registryFile,`modulePath:'src/${id}-glb.js'`,`modulePath:'src/vehicles/models/${id}-glb.js'`);
  replaceRequired(registryFile,`import('./${id}-glb.js')`,`import('./models/${id}-glb.js')`);
}
replaceRequired(registryFile,"modulePath:'src/truck-trailer.js'","modulePath:'src/vehicles/truck/truck-trailer.js'");
replaceRequired(registryFile,"import('./truck-trailer.js')","import('./truck/truck-trailer.js')");

// Moving controllers two levels deeper changes import.meta.url asset depth only.
for(const file of [
  'src/vehicles/models/civic-glb.js',
  'src/vehicles/models/countach-glb.js',
  'src/vehicles/models/f1-glb.js',
  'src/vehicles/models/i3-glb.js',
  'src/vehicles/models/id4-glb.js',
  'src/vehicles/models/sonata-glb.js',
  'src/vehicles/models/wrx-glb.js'
])replaceRequired(file,"new URL('./assets/","new URL('../../assets/");
replaceRequired('src/vehicles/truck/truck-trailer.js',"new URL('./assets/","new URL('../../assets/");

function walk(dir,out=[]){
  if(!exists(dir))return out;
  for(const entry of fs.readdirSync(abs(dir),{withFileTypes:true})){
    const child=path.posix.join(dir,entry.name);
    if(entry.isDirectory())walk(child,out);
    else out.push(child);
  }
  return out;
}

// Retarget exact QA/CI path contracts. This deliberately avoids docs/archive so
// historical records remain historical.
const contractFiles=[
  ...fs.readdirSync(ROOT).filter(f=>/^qa-.*\.mjs$/.test(f)),
  ...walk('qa').filter(f=>/\.(?:js|mjs|cjs|html)$/.test(f)),
  ...walk('.github/workflows').filter(f=>/\.ya?ml$/.test(f))
];
for(const file of contractFiles){
  let text=read(file);
  for(const [from,to] of MOVES)text=text.replaceAll(from,to);
  write(file,text);
}

// Lazy-GLB semantics stay identical, but the truck controller now sits two
// directories below src/, so its source-level import.meta.url asset contract
// must expect ../../assets/ rather than ./assets/.
replaceRequired(
  'qa/V21_31_LAZY_GLB_QA.mjs',
  "truck.indexOf(\"const modelUrl=new URL('./assets/saia_ltl_freight_truck_half_trailer.glb'\")",
  "truck.indexOf(\"const modelUrl=new URL('../../assets/saia_ltl_freight_truck_half_trailer.glb'\")"
);

// M4 source-text ownership checks follow the nested multiplayer modules' new
// relative imports into src/vehicles/. Runtime adapter/render behavior is unchanged.
replaceRequired(
  'qa/V21_31_MULTIPLAYER_M4_ADAPTER_QA.mjs',
  "adapter.includes(\"from '../vehicle-authored-registry.js'\")",
  "adapter.includes(\"from '../vehicles/vehicle-authored-registry.js'\")"
);
replaceRequired(
  'qa/V21_31_MULTIPLAYER_M4_ADAPTER_QA.mjs',
  "visuals.includes(\"from '../vehicle-render-contract.js'\")",
  "visuals.includes(\"from '../vehicles/vehicle-render-contract.js'\")"
);

// V21.26 placement QA has two path contracts assembled as code rather than as
// simple src/... literals, so retarget them explicitly without changing any
// placement/reset behavior assertions.
replaceRequired(
  'qa/V21_26_VEHICLE_PLACEMENT_REFACTOR_QA.mjs',
  "const modulePath=path.join(root,'src','vehicle-placement-controller.js');",
  "const modulePath=path.join(root,'src','vehicles','vehicle-placement-controller.js');"
);
replaceRequired(
  'qa/V21_26_VEHICLE_PLACEMENT_REFACTOR_QA.mjs',
  "/import \\{ createVehiclePlacementController \\} from '\\.\\/vehicle-placement-controller\\.js';/",
  "/import \\{ createVehiclePlacementController \\} from '\\.\\/vehicles\\/vehicle-placement-controller\\.js';/"
);

// Post-move R4 audit now validates the target folders instead of the old root.
const audit='qa-source-tree-r4-vehicles-audit.mjs';
replaceRequired(audit,"const expectedDynamic='./'+path.posix.basename(pair.modulePath);","const expectedDynamic='./'+path.posix.relative('src/vehicles',pair.modulePath);");
replaceRequired(audit,"deferred.includes(\"from './diagnostics.js'\")","deferred.includes(\"from '../diagnostics.js'\")");
replaceRequired(audit,"presentation.includes(\"from './vehicle-dynamics.js'\")","presentation.includes(\"from '../vehicle-dynamics.js'\")");
replaceRequired(audit,"for(const spec of ['./vehicle-dynamics.js','./physics/steering-geometry.js','./physics/airborne-dynamics.js'])","for(const spec of ['../vehicle-dynamics.js','../physics/steering-geometry.js','../physics/airborne-dynamics.js'])");
replaceRequired(audit,"note:'classification decision required by R4 audit'","note:'R4 scope locked: vehicle placement belongs under src/vehicles/'");

// Focused R4 gate follows both audit and candidate branches and adds the two
// placement checks plus visible presentation/lighting coverage required by plan.
const workflow='.github/workflows/qa-source-tree-r4-vehicles-audit.yml';
replaceRequired(workflow,"      - audit/source-tree-r4-vehicles\n","      - audit/source-tree-r4-vehicles\n      - cleanup/source-tree-r4-vehicles\n");
replaceRequired(workflow,"      - name: Truck trailer regression QA\n",`      - name: Vehicle placement refactor QA\n        run: node qa/V21_26_VEHICLE_PLACEMENT_REFACTOR_QA.mjs\n      - name: Route placement finite QA\n        run: node qa/V21_31_ROUTE_PLACEMENT_FINITE_QA.mjs\n      - name: WRX night-tail lighting QA\n        run: node qa-wrx-night-tail-r1.mjs\n      - name: Sonata night-body lighting QA\n        run: node qa-sonata-night-body-r1.mjs\n      - name: Anti-roll presentation QA\n        run: node qa/V21_30_ANTI_ROLL_VISUAL_QA.mjs\n      - name: Crest/jump presentation QA\n        run: node qa-grip-jump-r6.mjs\n      - name: Truck trailer regression QA\n`);

// Sanity: all old implementation paths are gone and all destinations exist.
for(const [from,to] of MOVES){
  if(exists(from))throw new Error(`R4 old implementation path still exists: ${from}`);
  if(!exists(to))throw new Error(`R4 moved implementation missing: ${to}`);
}

console.log('R4 ONE-SHOT SOURCE MIGRATION PREPARED',{
  moved:MOVES.length,
  common:9,
  models:7,
  truck:1
});
