import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function ok(v,msg){if(!v)throw new Error(msg)}
function has(s,msg){ok(main.includes(s),msg)}
function no(s,msg){ok(!main.includes(s),msg)}

has('const TERRAIN_PRELOAD_BUFFER={','2D preload policy missing');
has('aheadDistance:10500','forward buffer too short');
has('lateralOffsets:[0,-1500,1500,-3000,3000]','lateral terrain buffer missing');
has('bootstrapAheadDistance:7200','initial preload buffer missing');
has('bootstrapLateralOffsets:[0,-2800,2800]','initial lateral preload missing');
has('function routeBufferProbe(cum,lateralOffset=0)','route-normal buffer probe missing');
has('function refillTerrainPreloadBuffer()','continuous buffer refill missing');
has('function drainTerrainPreloadBuffer','time-sliced preload drain missing');
has('async function primeInitialTerrainPreloadBuffer()','bootstrap preload missing');
has("loadingText.textContent='Préchargement du terrain en avance…'",'route boot does not wait for terrain buffer');
has('const initialElevationReady=await loadElevationAround(absX,absZ)','current DEM must load before route ready');
has('await primeInitialTerrainPreloadBuffer()','initial route corridor not awaited');
has("toast('Trajet prêt · terrain préchargé')",'terrain-preloaded ready state missing');
has('nextAheadStreamingAt=now+420','continuous buffer cadence missing');

// V21.22.3 hitch-free guarantees must remain.
has('perfConsoleLogging:false','periodic perf logging re-enabled');
has('CACHE-ONLY','cache-only preload policy marker missing');
no("scheduleVisualJob('ahead-dem-refresh'",'ahead preload may rebuild geometry');
has('shiftRenderedWorldForOrigin(shiftX,shiftZ)','soft origin shift missing');
has('Math.abs(speed)>HITCH_FREE_STREAMING.calmSpeed','driving imagery suppression missing');

// V21.22.2 visual quality scope unchanged.
has('const NEAR_TERRAIN_SIZE=5600;','near-quality medium footprint changed');
has('const NEAR_TERRAIN_SEGMENTS=448;','near-quality medium density changed');

console.log('PASS V21.22.4 terrain preload buffer');
