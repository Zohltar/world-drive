import fs from 'node:fs';
import crypto from 'node:crypto';

const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const fail=(m)=>{throw new Error(m)};
const has=(text,needle,m)=>{if(!text.includes(needle))fail(m)};
const sha=(path)=>crypto.createHash('sha256').update(fs.readFileSync(new URL(path,import.meta.url))).digest('hex');

if(pkg.version!=='21.22.1')fail(`package version must be 21.22.1, got ${pkg.version}`);

// V21.21.27 stable policies that must remain untouched.
has(main,'const NEAR_TERRAIN_SIZE=3200;','near terrain size changed');
has(main,'const NEAR_TERRAIN_SEGMENTS=256;','near terrain density changed');
has(main,'const lookaheads=[650,1250,2100,3200]','route-ahead streaming ladder changed');
has(main,"new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:true})",'renderer policy changed');

// Medium-distance refinement.
has(terrain,'if(distance<=nearHalf+120)return base;','medium smoothing seam guard mismatch');
has(terrain,'const t=Math.max(0,Math.min(1,(distance-(nearHalf+120))/3300));','medium smoothing ramp mismatch');
has(terrain,'const radius=8+t*34;','medium smoothing radius mismatch');
has(terrain,'const blend=.055+t*.235;','medium smoothing blend mismatch');
has(terrain,'if(sample&&sample.distance2<protect*protect)return base;','road corridor protection missing');

const hs=terrain.indexOf('function rebuildHorizon()');
const he=terrain.indexOf('function clearHorizon()',hs);
if(hs<0||he<0)fail('cannot isolate rebuildHorizon');
const horizon=terrain.slice(hs,he);
const start=horizon.indexOf('const halfExtents=[');
const end=horizon.indexOf('];',start);
if(start<0||end<0)fail('cannot isolate halfExtents');
const block=horizon.slice(start,end+2);
const rows=(block.match(/nearHalf/g)||[]).length;
if(rows!==32)fail(`expected 32 horizon rows, got ${rows}`);
has(block,'nearHalf+60','first medium ring spacing missing');
has(block,'nearHalf+1995','critical medium ring missing');
has(block,'nearHalf+3000','late-medium ring missing');
has(block,'nearHalf+4260','outer horizon reach changed');

const offsets=[...block.matchAll(/nearHalf\+(\d+)/g)].map(m=>Number(m[1]));
const ext=[0,...offsets];
if(ext.at(-1)!==4260)fail(`outer offset expected 4260, got ${ext.at(-1)}`);
const mediumSteps=[];
for(let i=1;i<ext.length;i++){
  if(ext[i-1]<2150)mediumSteps.push(ext[i]-ext[i-1]);
}
const maxMediumStep=Math.max(...mediumSteps);
if(maxMediumStep>160)fail(`medium radial step too large: ${maxMediumStep} m`);

// Keep V21.22.0 colour improvement intact.
has(terrain,'function applyDistantTerrainColors(geometry,{offset,nearHalf,farHalf})','distant colour pass missing');
const cs=terrain.indexOf('function applyDistantTerrainColors');
const ce=terrain.indexOf('function distantTerrainHeight',cs);
const cb=terrain.slice(cs,ce);
if(cb.includes('CONTOUR_INTERVAL')||cb.includes('contourPhase')||cb.includes('minorContour'))fail('contour banding returned to distant terrain');
has(cb,'tempColor.lerp(neutralColor,haze*.18);','far atmospheric desaturation changed');

// Physics/presentation must remain byte-for-byte V21.21.27.
const expected={
  '../src/vehicles/vehicle-system.js':'c74d7d0ad8b10cef33312e282ae6b5a6fbcc0c301079b7eb8b2ab94a2aa5b89b',
  '../src/physics/vehicle-dynamics.js':'b8898f7f99061e35563862362e3f1afa02171a788d6a94a2fe7ffb1ab835ddb4',
  '../src/vehicles/vehicle-presentation.js':'60cedf69ce50716155ea11da313a8d1949a2019ae2bc9a7394e8b7c2d4133f08'
};
for(const [path,hash] of Object.entries(expected)){
  const actual=sha(path);
  if(actual!==hash)fail(`${path} changed from V21.21.27 baseline`);
}

console.log('V21.22.1 MEDIUM TERRAIN QA: PASS');
console.log(`horizon: ${rows} rows, same 5860 m half-extent / 4260 m outer offset`);
console.log(`critical medium max radial step: ${maxMediumStep} m`);
console.log('medium DEM smoothing: gentle +120 m seam guard, progressive radius/blend');
console.log('V21.22.0 distant colour/haze retained; no contour bands');
console.log('physics/presentation: byte-for-byte identical to V21.21.27');
