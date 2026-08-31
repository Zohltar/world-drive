import fs from 'node:fs';

const basePath='src/road-geometry-base.js';
const canonicalPath='src/road-geometry.js';
const legacyQaPath='qa/V21_25_ROAD_GEOMETRY_REFACTOR_QA.mjs';

if(!fs.existsSync(basePath))throw new Error('C3 expected road-geometry-base.js');
let base=fs.readFileSync(basePath,'utf8');
let canonical=fs.readFileSync(canonicalPath,'utf8');

function replaceOnce(source,from,to,label){
  const count=source.split(from).length-1;
  if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(from,to);
}

base=replaceOnce(
  base,
  'export function createRoadGeometrySystem({',
  'function createRoadGeometryCore({',
  'rename historical public base factory to private core'
);
canonical=replaceOnce(
  canonical,
  "import { createRoadGeometrySystem as createBaseRoadGeometrySystem } from './road-geometry-base.js';\n\n",
  '',
  'remove base import'
);
canonical=replaceOnce(
  canonical,
  '  const base=createBaseRoadGeometrySystem(args);',
  '  const base=createRoadGeometryCore(args);',
  'wire canonical facade to private core'
);

const header=`// World Drive C3 — canonical road geometry ownership.\n// The former V21.25 base and V21.31 smoothing wrapper now live in one module;\n// equations and frame ordering are unchanged.\n\n`;
const combined=(header+base.trimEnd()+'\n\n'+canonical.trimStart()).replace(/[ \t]+$/gm,'');
fs.writeFileSync(canonicalPath,combined+'\n');
fs.unlinkSync(basePath);

// The historical V21.25 QA still contains valuable behavioral assertions, but
// its local-world source-location check predates the P9.25 implementation layer.
let qa=fs.readFileSync(legacyQaPath,'utf8');
const oldPath="const localWorldPath=path.join(src,'local-world-builder.js');";
const newPath="const localWorldPath=path.join(src,'local-world-builder.js');\nconst localWorldP925Path=path.join(src,'local-world-builder-p925.js');";
if(!qa.includes('localWorldP925Path'))qa=replaceOnce(qa,oldPath,newPath,'add current local-world implementation path');
const oldRead=`const localWorld=fs.existsSync(localWorldPath)\n  ?fs.readFileSync(localWorldPath,'utf8')\n  :'';`;
const newRead=`const localWorld=[localWorldPath,localWorldP925Path]\n  .filter(file=>fs.existsSync(file))\n  .map(file=>fs.readFileSync(file,'utf8'))\n  .join('\\n');`;
qa=replaceOnce(qa,oldRead,newRead,'read current local-world ownership layers');
qa=qa.replace(/[ \t]+$/gm,'');
fs.writeFileSync(legacyQaPath,qa+'\n');

console.log('C3 road geometry flattening materialized',{removed:basePath,canonical:canonicalPath,privateCore:'createRoadGeometryCore'});
