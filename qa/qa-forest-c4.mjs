import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const oldFiles=[
  'src/forest-chunk-streamer-p929-wrapper.js',
  'src/forest-chunk-streamer-p929.js',
  'src/forest-terrain-sampler-p912.js',
  'src/frame-runtime-profiler-p941.js'
];
const newFiles=[
  'src/forest-chunk-streamer.js',
  'src/forest-chunk-streamer-core.js',
  'src/forest-terrain-sampler.js',
  'src/frame-runtime-profiler.js'
];
for(const file of oldFiles)assert.equal(fs.existsSync(file),false,`historical C4 production file returned: ${file}`);
for(const file of newFiles)assert.equal(fs.existsSync(file),true,`canonical C4 production file missing: ${file}`);

const canonical=fs.readFileSync('src/forest-chunk-streamer.js','utf8');
const core=fs.readFileSync('src/forest-chunk-streamer-core.js','utf8');
const sampler=fs.readFileSync('src/forest-terrain-sampler.js','utf8');
const profiler=fs.readFileSync('src/frame-runtime-profiler.js','utf8');

assert.match(canonical,/from ['"]\.\/forest-chunk-streamer-core\.js['"]/,'canonical streamer does not compose forest core');
assert.match(canonical,/from ['"]\.\/frame-runtime-profiler\.js['"]/,'canonical streamer does not compose frame runtime profiler');
assert.match(canonical,/createForestChunkStreamerCore/,'canonical streamer missing responsibility-based core alias');
assert.match(core,/from ['"]\.\/forest-terrain-sampler\.js['"]/,'forest core does not compose canonical terrain sampler');
assert.match(core,/createForestTerrainSampler/,'forest core missing canonical terrain sampler API');
assert.match(sampler,/export function createForestTerrainSampler\s*\(/,'canonical terrain sampler export missing');
assert.match(profiler,/frameRuntimeSnapshot/,'frame runtime profiler contract missing');

for(const [label,ok] of Object.entries({
  coreFrameBudget:/sliceBudgetMs|candidateBatchSize|catchupSliceBudgetMs/.test(core),
  coreRollingPrefetch:/prefetchLeadM|prefetchRadiusM|rollingPrefetch/.test(core),
  coreMaintenance:/queueSorts|cacheTrimRuns/.test(core),
  wrapperHitchAttribution:/recordHitch|hitchesAttributedToForest|nearestActivity/.test(canonical),
  wrapperStartupDirection:/seedStartupRouteDirection|STARTUP_DIRECTION_SEED_M/.test(canonical),
  wrapperDiagnostics:/installDiagnostics|WorldDriveFramePacing/.test(canonical),
  profilerFrameRuntime:/frameRuntimeSnapshot/.test(profiler)
}))assert.equal(ok,true,`C4 responsibility signal lost: ${label}`);

const requiredLegacyDiagnosticAliases=[
  '__WORLD_DRIVE_P928_RECORD_HITCH__',
  '__WORLD_DRIVE_P929_FOREST__',
  '__WORLD_DRIVE_P931_FOREST__',
  '__WORLD_DRIVE_P934_FOREST__',
  '__WORLD_DRIVE_P936_FOREST__',
  '__WORLD_DRIVE_P940_FOREST__',
  '__WORLD_DRIVE_P941_FOREST__'
];
const requiredFramePacingAliases=[
  '__worldDriveP929Forest',
  '__worldDriveP931Forest',
  '__worldDriveP934Forest',
  '__worldDriveP936Forest',
  '__worldDriveP940Forest',
  '__worldDriveP941Forest'
];
const combined=canonical+'\n'+core+'\n'+profiler;
for(const alias of [...requiredLegacyDiagnosticAliases,...requiredFramePacingAliases]){
  assert.ok(combined.includes(alias),`C4 changed diagnostic compatibility alias reserved for C6: ${alias}`);
}

const oldNames=oldFiles.map(file=>path.basename(file));
const offenders=[];
const skipDirs=new Set(['.git','node_modules','dist']);
function scan(target){
  if(!fs.existsSync(target))return;
  const stat=fs.statSync(target);
  if(stat.isDirectory()){
    for(const entry of fs.readdirSync(target)){
      if(skipDirs.has(entry))continue;
      scan(path.join(target,entry));
    }
    return;
  }
  if(!/\.(?:js|mjs|cjs|yml|yaml)$/i.test(target))return;
  const rel=target.replaceAll('\\','/');
  if(rel==='qa/qa-forest-c4.mjs')return;
  const text=fs.readFileSync(target,'utf8');
  for(const oldName of oldNames){
    if(text.includes(oldName))offenders.push(`${rel}:${oldName}`);
  }
}
for(const root of ['src','qa','.github'])scan(root);
for(const entry of fs.readdirSync('.'))if(/^qa.*\.mjs$/i.test(entry))scan(entry);
assert.deepEqual(offenders,[],`historical C4 filename references remain: ${offenders.join(', ')}`);

console.log('CLEANUP C4 FOREST OWNERSHIP QA: PASS',{
  canonical:'src/forest-chunk-streamer.js',
  core:'src/forest-chunk-streamer-core.js',
  terrainSampler:'src/forest-terrain-sampler.js',
  runtimeProfiler:'src/frame-runtime-profiler.js',
  legacyDiagnosticAliasesPreserved:true
});
