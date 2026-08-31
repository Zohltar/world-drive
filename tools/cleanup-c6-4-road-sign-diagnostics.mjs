import fs from 'node:fs';

const p930Path='src/road-furniture-p930.js';
const p937Path='src/road-furniture-p937.js';
const p937QaPath='qa-p937-combined-frame-pacing.mjs';

let p930=fs.readFileSync(p930Path,'utf8');
let p937=fs.readFileSync(p937Path,'utf8');
let qa=fs.readFileSync(p937QaPath,'utf8');

const p930Writer=/\n\s*globalThis\.__WORLD_DRIVE_P930_ROAD_SIGNS__=diagnostics;\n/;
if(!p930Writer.test(p930))throw new Error('P9.30 legacy diagnostic writer not found');
p930=p930.replace(p930Writer,'\n');

const importAnchor="import {createRoadFurnitureSystem as createRoadFurnitureSystemP930} from './road-furniture-p930.js';\n";
if(!p937.includes(importAnchor))throw new Error('P9.37 import anchor not found');
if(!p937.includes("from './diagnostics.js'")){
  p937=p937.replace(importAnchor,importAnchor+"import {ensureWorldDriveDiagnostics} from './diagnostics.js';\n");
}
const p937Writer=/\n\s*try\{\n\s*globalThis\.__WORLD_DRIVE_P937_ROAD_SIGNS__=diagnostics;\n\s*\}catch\{\}\n/;
if(!p937Writer.test(p937))throw new Error('P9.37 legacy diagnostic writer not found');
p937=p937.replace(p937Writer,"\n  const roadSignDiagnostics=ensureWorldDriveDiagnostics().roadSigns;\n  roadSignDiagnostics.snapshot=diagnostics;\n");

if(!qa.includes("  '__WORLD_DRIVE_P937_ROAD_SIGNS__'\n"))throw new Error('P9.37 QA legacy marker not found');
qa=qa.replace(
  "  '__WORLD_DRIVE_P937_ROAD_SIGNS__'\n",
  "  'ensureWorldDriveDiagnostics',\n  'roadSignDiagnostics.snapshot=diagnostics'\n"
);

fs.writeFileSync(p930Path,p930);
fs.writeFileSync(p937Path,p937);
fs.writeFileSync(p937QaPath,qa);
console.log('C6.4 canonical road-sign diagnostics materialized');
