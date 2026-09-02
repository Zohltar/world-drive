import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const main=read('src/main.js');
const streaming=read('src/streaming/streaming-coordinator-p913.js');
const worldScene=read('src/world-scene.js');
const worldMaterials=read('src/world-materials.js');
const terrain=read('src/terrain.js');
const distantTerrain=read('src/terrain-p926.js');

function ok(value,message){if(!value)throw new Error(message);}
function has(source,fragment,message){ok(source.includes(fragment),message);}
function no(source,fragment,message){ok(!source.includes(fragment),message);}

// Current hitch-free streaming policy lives in the streaming coordinator, not main.js.
has(streaming,'perfConsoleLogging:false','periodic perf logging must remain disabled by default');
has(streaming,'softRecenterDistance:520','cheap floating-origin threshold changed');
has(streaming,'hardWorldRefreshDistance:1450','coalesced world refresh distance changed');
has(streaming,'urgentWorldRefreshDistance:2350','current urgent world-refresh safety threshold changed');
has(streaming,'emergencyWorldRefreshDistance:2680','emergency world-refresh safety threshold changed');
has(streaming,'aheadDistance:10500','route-ahead DEM preload coverage changed');
has(streaming,'bootstrapAheadDistance:7200','startup DEM preload buffer changed');

// Async arrivals still mark/prepare world state instead of restoring old eager rebuild loops.
has(main,"markStreamWorldRefresh('dem')",'DEM completion should mark dirty, not rebuild immediately');
has(main,"markStreamWorldRefresh('hydro')",'hydro completion should mark dirty, not rebuild immediately');
no(main,"scheduleVisualJob('ahead-dem-refresh'",'ahead DEM completion still schedules obsolete geometry rebuild');
no(main,'lastAheadTerrainRefreshAt>2400','obsolete periodic ahead DEM rebuild throttle returned');

// C6.1 diagnostics are now canonical while the historical callable remains compatible.
has(main,'const worldDriveDiagnostics=ensureWorldDriveDiagnostics();','canonical diagnostics root missing');
has(main,'worldDriveDiagnostics.framePacing.snapshot=()=>({','canonical quiet hitch diagnostics missing');
has(main,"'WorldDriveFramePacing'",'frame-pacing compatibility alias missing');

// Preserve the accepted visual scope now owned by responsibility-based modules.
has(worldScene,'export const NEAR_TERRAIN_SIZE=5600;','near-terrain footprint changed');
has(worldScene,'export const NEAR_TERRAIN_SEGMENTS=448;','near-terrain density changed');
has(worldMaterials,'const size=512;','road texture resolution changed');
has(distantTerrain,'function runNormalizeAndColors()','incremental distant-terrain colour pass missing');
has(distantTerrain,'nearHalf+4260','far horizon reach changed');
has(distantTerrain,"mesh.name='distant-terrain-seamless-square-lod'",'current distant-terrain LOD owner missing');
has(terrain,'function shiftRoadBedOrigin(shiftX,shiftZ)','terrain road-bed soft-origin support missing');

console.log('PASS V21.22.3 hitch-free policy — modern ownership');
console.log('  - streaming thresholds protected in streaming/streaming-coordinator-p913');
console.log('  - eager DEM rebuild regressions remain forbidden');
console.log('  - C6.1 canonical frame diagnostics + compatibility alias protected');
console.log('  - accepted terrain/material visual scope protected at current owners');
