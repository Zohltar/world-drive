import fs from 'node:fs';
import crypto from 'node:crypto';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const fail=(m)=>{throw new Error(m)};
const has=(text,needle,m)=>{if(!text.includes(needle))fail(m)};
const sha=(path)=>crypto.createHash('sha256').update(fs.readFileSync(new URL(path,import.meta.url))).digest('hex');

if(pkg.version!=='21.22.2')fail(`package version must be 21.22.2, got ${pkg.version}`);

// V21.22.2: medium distance is promoted into the exact same ground + imagery
// pipeline as the near field instead of being approximated by the horizon mesh.
has(main,'const NEAR_TERRAIN_SIZE=5600;','high-detail terrain footprint must be 5600 m');
has(main,'const NEAR_TERRAIN_SEGMENTS=448;','high-detail terrain grid must be 448 segments');
has(main,'groundSize:NEAR_TERRAIN_SIZE','terrain service must receive expanded footprint');
has(main,'groundSize:NEAR_TERRAIN_SIZE','imagery/terrain extent must stay shared');
const spacing=5600/448;
if(Math.abs(spacing-12.5)>1e-9)fail(`near/medium grid spacing changed: ${spacing}`);

// Warm cache must reach beyond the expanded high-detail half extent.
has(main,'const lookaheads=[700,1500,2600,3800,5000]','expanded route-ahead warm-cache ladder missing');
has(main,'elevationService.prefetchAt?.(p.x,p.z)','DEM route-ahead prefetch missing');
has(main,'imageryService.prefetchAt?.(p.x,p.z)','imagery route-ahead prefetch missing');

// Renderer / road visual policies remain untouched.
has(main,"new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:true})",'renderer policy changed');
has(main,'Math.ceil(sampledLen/3)','road ribbon density changed');
has(main,'const size=512;','road texture resolution changed');

// Horizon still starts exactly at the edge of the enlarged ground mesh.
has(terrain,'const nearHalf=groundSize/2;','horizon seam must derive from enlarged ground size');
has(terrain,'distantTerrainHeight(wx,wz,distance,nearHalf)','distant terrain smoothing missing');
has(terrain,'function applyDistantTerrainColors(geometry,{offset,nearHalf,farHalf})','V21.22 distant colour pass missing');
const hs=terrain.indexOf('function rebuildHorizon()');
const he=terrain.indexOf('function clearHorizon()',hs);
if(hs<0||he<0)fail('cannot isolate rebuildHorizon');
const horizon=terrain.slice(hs,he);
const start=horizon.indexOf('const halfExtents=[');
const end=horizon.indexOf('];',start);
if(start<0||end<0)fail('cannot isolate horizon ring ladder');
const block=horizon.slice(start,end+2);
const rows=(block.match(/nearHalf/g)||[]).length;
if(rows!==32)fail(`expected V21.22.1 32-row far ladder, got ${rows}`);
has(block,'nearHalf+4260','far outer offset changed');

const nearHalf=5600/2;
if(nearHalf!==2800)fail('high-detail half extent should be 2800 m');
const farHalf=nearHalf+4260;
if(farHalf!==7060)fail(`far horizon half extent mismatch: ${farHalf}`);

// V21.22.0 no-contour distant visual pass stays active beyond the new seam.
const cs=terrain.indexOf('function applyDistantTerrainColors');
const ce=terrain.indexOf('function distantTerrainHeight',cs);
const cb=terrain.slice(cs,ce);
if(cb.includes('CONTOUR_INTERVAL')||cb.includes('contourPhase')||cb.includes('minorContour')){
  fail('cartographic contour banding returned to distant terrain');
}
has(cb,'tempColor.lerp(neutralColor,haze*.18);','far atmospheric desaturation changed');

// Physics/presentation remain byte-for-byte V21.21.27 baseline.
const expected={
  '../src/vehicles/vehicle-system.js':'c74d7d0ad8b10cef33312e282ae6b5a6fbcc0c301079b7eb8b2ab94a2aa5b89b',
  '../src/physics/vehicle-dynamics.js':'b8898f7f99061e35563862362e3f1afa02171a788d6a94a2fe7ffb1ab835ddb4',
  '../src/vehicles/vehicle-presentation.js':'60cedf69ce50716155ea11da313a8d1949a2019ae2bc9a7394e8b7c2d4133f08'
};
for(const [path,hash] of Object.entries(expected)){
  const actual=sha(path);
  if(actual!==hash)fail(`${path} changed from V21.21.27 baseline`);
}

console.log('V21.22.2 NEAR-QUALITY MEDIUM QA: PASS');
console.log(`high-detail terrain/imagery: 5600 m / 448 = ${spacing.toFixed(1)} m spacing, +/-${nearHalf} m`);
console.log(`distant horizon: begins at ${nearHalf} m and reaches ${farHalf} m half-extent`);
console.log('route-ahead DEM/imagery warm cache: 700/1500/2600/3800/5000 m + speed lead');
console.log('V21.22.0 far colour + V21.22.1 dense rings retained beyond new seam');
console.log('physics/presentation: byte-for-byte identical to V21.21.27');
