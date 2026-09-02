import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const roots=['src'];
const skipDirs=new Set(['node_modules','dist','.git']);
const files=[];
function walk(target){
  const stat=fs.statSync(target);
  if(stat.isDirectory()){
    for(const entry of fs.readdirSync(target)){
      if(skipDirs.has(entry))continue;
      walk(path.join(target,entry));
    }
    return;
  }
  if(/\.(?:js|mjs|cjs)$/i.test(target))files.push(target.replaceAll('\\','/'));
}
for(const root of roots)walk(root);

const rows=[];
const add=(file,name,kind,index)=>{
  if(!name)return;
  const line=fs.readFileSync(file,'utf8').slice(0,index).split('\n').length;
  rows.push({name,kind,file,line});
};

for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  const direct=/(?:globalThis|window)\.([_$A-Za-z][\w$]*)\s*=/g;
  const bracket=/(?:globalThis|window)\[['"]([^'"]+)['"]\]\s*=/g;
  const alias=/installDiagnosticAlias\(\s*['"]([^'"]+)['"]/g;
  let match;
  while((match=direct.exec(text)))add(file,match[1],'direct-write',match.index);
  while((match=bracket.exec(text)))add(file,match[1],'direct-write',match.index);
  while((match=alias.exec(text)))add(file,match[1],'diagnostic-alias',match.index);
}

rows.sort((a,b)=>a.name.localeCompare(b.name)||a.file.localeCompare(b.file)||a.line-b.line);
const byName={};
for(const row of rows)(byName[row.name]??=[]).push({kind:row.kind,file:row.file,line:row.line});

const expected=new Map([
  ['__WORLD_DRIVE_P923_LOCAL_WORLD__',[
    'direct-write:src/local-world-builder-p925.js',
    'direct-write:src/local-world/local-world-builder-p926.js',
    'direct-write:src/local-world-builder.js'
  ]],
  ['__WORLD_DRIVE_P928_RECORD_HITCH__',['diagnostic-alias:src/forest-chunk-streamer.js']],
  ['__WORLD_DRIVE_P929_FOREST__',['diagnostic-alias:src/forest-chunk-streamer.js']],
  ['__WORLD_DRIVE_P931_FOREST__',['diagnostic-alias:src/forest-chunk-streamer.js']],
  ['__WORLD_DRIVE_P933_FOREST_READY__',['diagnostic-alias:src/scenery/scenery-renderer-p933.js']],
  ['__WORLD_DRIVE_P933_FOREST_STATUS__',['diagnostic-alias:src/scenery/scenery-renderer-p933.js']],
  ['__WORLD_DRIVE_P934_FOREST__',['diagnostic-alias:src/forest-chunk-streamer.js']],
  ['__WORLD_DRIVE_P934_FOREST_READY__',['diagnostic-alias:src/scenery/scenery-renderer-p933.js']],
  ['__WORLD_DRIVE_P934_FOREST_STATUS__',['diagnostic-alias:src/scenery/scenery-renderer-p933.js']],
  ['__WORLD_DRIVE_P935_FOREST_READY__',['diagnostic-alias:src/scenery/scenery-renderer-p933.js']],
  ['__WORLD_DRIVE_P935_FOREST_STATUS__',['diagnostic-alias:src/scenery/scenery-renderer-p933.js']],
  ['__WORLD_DRIVE_P936_FOREST__',['diagnostic-alias:src/forest-chunk-streamer.js']],
  ['__WORLD_DRIVE_P940_FOREST__',['diagnostic-alias:src/forest-chunk-streamer.js']],
  ['__WORLD_DRIVE_P941_FOREST__',['diagnostic-alias:src/forest-chunk-streamer.js']],
  ['requestAnimationFrame',['direct-write:src/frame-runtime-profiler.js']],
  ['requestIdleCallback',[
    'direct-write:src/forest-chunk-streamer-core.js',
    'direct-write:src/imagery/imagery-p913.js',
    'direct-write:src/road/road-furniture-p930.js',
    'direct-write:src/road/road-furniture-p937.js',
    'direct-write:src/streaming/streaming-coordinator-p913.js'
  ]],
  ['setTimeout',[
    'direct-write:src/local-world-builder-p925.js',
    'direct-write:src/local-world-builder.js',
    'direct-write:src/terrain-p926.js',
    'direct-write:src/terrain.js'
  ]],
  ['worldDriveBuild',['direct-write:src/app/version.js']],
  ['WorldDriveFramePacing',['diagnostic-alias:src/main.js']],
  ['WorldDriveOverpass',['diagnostic-alias:src/services/overpass.js']],
  ['WorldDrivePhysicsShadow',['diagnostic-alias:src/main.js']],
  ['WorldDriveTraffic',[
    'direct-write:src/traffic/civil-traffic-local.js',
    'diagnostic-alias:src/traffic/civil-traffic.js'
  ]],
  ['WorldDriveTrafficPool',[
    'direct-write:src/traffic/civil-traffic-local.js',
    'diagnostic-alias:src/traffic/civil-traffic.js'
  ]],
  ['WorldDriveTrafficSpawn',[
    'direct-write:src/traffic/civil-traffic-local.js',
    'direct-write:src/traffic/civil-traffic.js'
  ]]
]);

const actualNames=Object.keys(byName).sort();
const expectedNames=[...expected.keys()].sort();
assert.deepEqual(actualNames,expectedNames,
  `C6 global boundary changed. Added/removed surface detected.\n${JSON.stringify(byName,null,2)}`);
for(const [name,signatures] of expected){
  const actual=(byName[name]||[]).map(row=>`${row.kind}:${row.file}`).sort();
  assert.deepEqual(actual,[...signatures].sort(),
    `C6 ownership changed for ${name}: ${JSON.stringify(byName[name]||[])}`);
}

const runtimeContracts=new Set(['__WORLD_DRIVE_P923_LOCAL_WORLD__']);
const buildMetadata=new Set(['worldDriveBuild']);
const compatibilityBootstrap=new Set(['WorldDriveTraffic','WorldDriveTrafficPool']);
const functionalControls=new Set(['WorldDriveTrafficSpawn']);
const platformPolyfills=new Set(['requestAnimationFrame','requestIdleCallback','setTimeout']);
const allowedDirect=new Set([
  ...runtimeContracts,
  ...buildMetadata,
  ...compatibilityBootstrap,
  ...functionalControls,
  ...platformPolyfills
]);
for(const row of rows){
  if(row.kind==='direct-write')assert.ok(allowedDirect.has(row.name),
    `unclassified direct global write: ${row.name} at ${row.file}:${row.line}`);
}

console.log('C6 FINAL GLOBAL BOUNDARY QA: PASS',{
  names:actualNames.length,
  occurrences:rows.length,
  runtimeContracts:[...runtimeContracts],
  buildMetadata:[...buildMetadata],
  compatibilityBootstrap:[...compatibilityBootstrap],
  functionalControls:[...functionalControls],
  platformPolyfills:[...platformPolyfills],
  remainingDiagnosticSurfaces:'aliases-only'
});
