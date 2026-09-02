import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const root=process.cwd();
const diagnosticsPath=path.join(root,'src','diagnostics.js');
assert.equal(fs.existsSync(diagnosticsPath),true,'canonical diagnostics module missing');
const diagnosticsModule=await import(`${pathToFileURL(diagnosticsPath).href}?qa=${Date.now()}`);
const {ensureWorldDriveDiagnostics,installDiagnosticAlias,readWorldDriveDiagnostics}=diagnosticsModule;

const fake={};
const first=ensureWorldDriveDiagnostics(fake);
const second=ensureWorldDriveDiagnostics(fake);
assert.strictEqual(first,second,'diagnostics root identity changed');
assert.strictEqual(fake.WorldDriveDiagnostics,first,'diagnostics root not published');
for(const category of ['framePacing','forest','physics','traffic','multiplayer','wheelspin','streaming','roadSigns','presentation']){
  assert.equal(typeof first[category],'object',`diagnostics category missing: ${category}`);
}
const forestRef=first.forest;
ensureWorldDriveDiagnostics(fake);
assert.strictEqual(first.forest,forestRef,'diagnostics category identity changed');
assert.strictEqual(readWorldDriveDiagnostics(fake),first,'diagnostics read helper changed root');

first.forest.snapshot=()=>({generation:1});
const alias=installDiagnosticAlias('__TEST_FOREST__',()=>first.forest.snapshot,fake);
assert.deepEqual(alias(),{generation:1},'diagnostic alias did not delegate');
first.forest.snapshot=()=>({generation:2});
assert.deepEqual(fake.__TEST_FOREST__(),{generation:2},'diagnostic alias captured stale implementation');
assert.equal(alias.__worldDriveDiagnosticAlias,'__TEST_FOREST__','diagnostic alias metadata missing');

const main=fs.readFileSync('src/main.js','utf8');
const forest=fs.readFileSync('src/forest-chunk-streamer.js','utf8');
const scenery=fs.readFileSync('src/scenery/scenery-renderer-p933.js','utf8');
const startup=fs.readFileSync('src/startup-ui.js','utf8');
const streaming=fs.readFileSync('src/streaming-coordinator.js','utf8');

assert.match(main,/from ['"]\.\/diagnostics\.js['"]/,'main missing canonical diagnostics import');
assert.match(main,/const worldDriveDiagnostics=ensureWorldDriveDiagnostics\(\);/,'main missing stable diagnostics root');
assert.match(main,/worldDriveDiagnostics\.framePacing\.snapshot=\(\)=>\(\{/,'main frame pacing is not canonical');
assert.match(main,/installDiagnosticAlias\([\s\S]*?'WorldDriveFramePacing'[\s\S]*?worldDriveDiagnostics\.framePacing\.snapshot/,'historical frame-pacing alias no longer delegates');
assert.doesNotMatch(main,/window\.WorldDriveFramePacing=\(\)=>\(\{/,'main still owns independent frame-pacing global');

assert.match(forest,/diagnostics\.forest\.recordHitch=recordHitch;/,'canonical forest hitch recorder missing');
assert.match(forest,/diagnostics\.forest\.snapshot=snapshot;/,'canonical forest snapshot missing');
assert.match(forest,/const current=diagnostics\.framePacing\.snapshot;/,'forest wrapper does not read canonical frame pacing');
assert.match(forest,/diagnostics\.framePacing\.snapshot=wrapped;/,'forest wrapper does not publish canonical frame pacing');
assert.doesNotMatch(forest,/globalThis\.WorldDriveFramePacing=wrapped;/,'forest still replaces compatibility alias directly');
for(const aliasName of [
  '__WORLD_DRIVE_P928_RECORD_HITCH__','__WORLD_DRIVE_P929_FOREST__','__WORLD_DRIVE_P931_FOREST__',
  '__WORLD_DRIVE_P934_FOREST__','__WORLD_DRIVE_P936_FOREST__','__WORLD_DRIVE_P940_FOREST__','__WORLD_DRIVE_P941_FOREST__'
]){
  assert.ok(forest.includes(`installDiagnosticAlias('${aliasName}'`),`forest compatibility alias not delegated: ${aliasName}`);
}

assert.match(scenery,/diagnostics\.forest\.whenInitialReady=whenInitialForestReady;/,'canonical forest readiness missing');
assert.match(scenery,/diagnostics\.forest\.startupStatus=startupForestStatus;/,'canonical forest startup status missing');
for(const aliasName of ['__WORLD_DRIVE_P933_FOREST_READY__','__WORLD_DRIVE_P934_FOREST_READY__','__WORLD_DRIVE_P935_FOREST_READY__']){
  assert.ok(scenery.includes(`installDiagnosticAlias('${aliasName}'`),`startup compatibility alias not delegated: ${aliasName}`);
}
assert.match(startup,/globalThis\.WorldDriveDiagnostics\?\.forest\?\.whenInitialReady\|\|[\s\S]*?__WORLD_DRIVE_P935_FOREST_READY__/,'startup does not prefer canonical forest readiness');
assert.match(streaming,/globalThis\.WorldDriveDiagnostics\?\.forest\?\.recordHitch\|\|[\s\S]*?__WORLD_DRIVE_P928_RECORD_HITCH__/,'streaming does not prefer canonical hitch recorder');

console.log('CLEANUP C6.1 DIAGNOSTICS ROOT QA: PASS',{
  stableRoot:true,
  stableCategories:true,
  liveCompatibilityDelegates:true,
  canonicalFramePacing:true,
  canonicalForest:true,
  startupCanonicalFirst:true,
  hitchCanonicalFirst:true
});
