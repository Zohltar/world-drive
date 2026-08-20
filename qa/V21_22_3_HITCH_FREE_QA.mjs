import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function ok(v,msg){if(!v)throw new Error(msg)}
function has(s,msg){ok(main.includes(s),msg)}
function no(s,msg){ok(!main.includes(s),msg)}

has("perfConsoleLogging:false",'periodic perf logging must be disabled by default');
has("softRecenterDistance:520",'cheap floating-origin threshold changed');
has("hardWorldRefreshDistance:1450",'coalesced world refresh distance missing');
has("urgentWorldRefreshDistance:2200",'world coverage safety threshold missing');
has("shiftRenderedWorldForOrigin(shiftX,shiftZ)",'soft recenter render-space shift missing');
has("markStreamWorldRefresh('dem')",'DEM completion should mark dirty, not rebuild');
has("markStreamWorldRefresh('hydro')",'hydro completion should mark dirty, not rebuild');
has('WARM CACHE ONLY','ahead DEM must be cache-only');
no("lastAheadTerrainRefreshAt>2400",'old periodic ahead DEM rebuild throttle still present');
no("scheduleVisualJob('ahead-dem-refresh'",'ahead DEM completion still schedules geometry rebuild');
has("Math.abs(speed)>HITCH_FREE_STREAMING.calmSpeed",'active-driving imagery suppression missing');
has("static shadow maps are refreshed only when streamed world",'timer shadow refresh removal missing');
has('window.WorldDriveFramePacing=()=>({','quiet hitch diagnostics missing');
has('terrainService.shiftRoadBedOrigin?.(shiftX,shiftZ)','road-bed transition must follow soft recenter');
has('resetStaticGroupOrigin(signGroup)','sign rebuild must reset soft-origin compensation');
has("markStreamWorldRefresh('scenery')",'OSM scenery completion must not rebuild mid-drive');
no("scheduleVisualJob(\n    'scenery',\n    rebuildLocalScenery",'scenery network completion still rebuilds immediately');


// Preserve V21.22.2 visual scope and V21.21.27 physics.
has('const NEAR_TERRAIN_SIZE=5600;','V21.22.2 terrain footprint changed');
has('const NEAR_TERRAIN_SEGMENTS=448;','V21.22.2 terrain density changed');
has('const lookaheads=[700,1500,2600,3800,5000]','route-ahead warm-cache ladder changed');
has('Math.ceil(sampledLen/3)','road ribbon density changed');
has('const size=512;','road texture resolution changed');
const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
ok(terrain.includes('function applyDistantTerrainColors(geometry,{offset,nearHalf,farHalf})'),'distant terrain colour pass missing');
ok(terrain.includes('nearHalf+4260'),'far horizon reach changed');
ok(terrain.includes('shiftRoadBedOrigin'),'terrain road-bed soft-origin support missing');

console.log('PASS V21.22.3 hitch-free streaming policy');
