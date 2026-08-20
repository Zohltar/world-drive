import fs from 'node:fs';
import crypto from 'node:crypto';

const root=new URL('../',import.meta.url);
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const fail=(message)=>{throw new Error(message)};
const has=(text,needle,message)=>{if(!text.includes(needle))fail(message)};
const sha=(path)=>crypto.createHash('sha256').update(fs.readFileSync(new URL(path,import.meta.url))).digest('hex');

if(pkg.version!=='21.22.0')fail(`package version must be 21.22.0, got ${pkg.version}`);

// Stable V21.21.27 near terrain / streaming policy stays intact.
has(main,'const NEAR_TERRAIN_SIZE=3200;','near terrain size changed');
has(main,'const NEAR_TERRAIN_SEGMENTS=256;','near terrain density changed');
has(main,'const lookaheads=[650,1250,2100,3200]','route-ahead streaming ladder changed');
has(main,'nextAheadStreamingAt=now+850;','route-ahead streaming cadence changed');
has(main,"new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:true})",'renderer policy changed');

// V21.22 distant terrain policy.
has(terrain,'function applyDistantTerrainColors(geometry,{offset,nearHalf,farHalf})','distant colour pass missing');
has(terrain,'function distantTerrainHeight(wx,wz,distance,nearHalf)','distant height smoothing missing');
has(terrain,'if(distance<=nearHalf+320)return base;','near/far seam protection missing');
has(terrain,'if(sample&&sample.distance2<protect*protect)return base;','road corridor smoothing protection missing');
has(terrain,'const radius=12+t*38;','distance-aware smoothing radius mismatch');
has(terrain,'const blend=.10+t*.24;','distant smoothing blend mismatch');
has(terrain,'const hazeStart=nearHalf+900;','distance colour fade start mismatch');
has(terrain,'tempColor.lerp(neutralColor,haze*.18);','distant desaturation pass missing');
has(terrain,'dithering:true','horizon dithering missing');
has(terrain,'fog:true','horizon fog participation missing');

const horizonStart=terrain.indexOf('function rebuildHorizon()');
const horizonEnd=terrain.indexOf('function clearHorizon()',horizonStart);
if(horizonStart<0||horizonEnd<0)fail('cannot isolate rebuildHorizon');
const horizon=terrain.slice(horizonStart,horizonEnd);

if(horizon.includes('applyHillshadeColors(geometry)')){
  fail('distant horizon still uses near-terrain contour/hillshade colouring');
}
has(horizon,'applyDistantTerrainColors(geometry,{','horizon does not use V21.22 colour pass');
has(horizon,'distantTerrainHeight(wx,wz,distance,nearHalf)','horizon does not use V21.22 smoothing');

const distantColorStart=terrain.indexOf('function applyDistantTerrainColors');
const distantColorEnd=terrain.indexOf('function distantTerrainHeight',distantColorStart);
const distantColorBlock=terrain.slice(distantColorStart,distantColorEnd);
if(distantColorBlock.includes('CONTOUR_INTERVAL')||distantColorBlock.includes('minorContour')||distantColorBlock.includes('contourPhase')){
  fail('cartographic contour banding leaked into distant colour pass');
}

for(const offset of [90,200,330,480,660,870,1120,1420,1770,2170,2620,3120,3670,4260]){
  has(horizon,`nearHalf+${offset}`,`missing V21.22 horizon ring offset ${offset}`);
}
const ringMatches=[...horizon.matchAll(/nearHalf(?:\+(\d+))?/g)];
const ringBlock=horizon.slice(horizon.indexOf('const halfExtents=['),horizon.indexOf('];',horizon.indexOf('const halfExtents=['))+2);
const ringCount=(ringBlock.match(/nearHalf/g)||[]).length;
if(ringCount!==15)fail(`expected 15 horizon rows, got ${ringCount}`);

// Physics/presentation must be byte-for-byte identical to V21.21.27 baseline.
const expected={
  '../src/vehicle-system.js':'c74d7d0ad8b10cef33312e282ae6b5a6fbcc0c301079b7eb8b2ab94a2aa5b89b',
  '../src/vehicle-dynamics.js':'b8898f7f99061e35563862362e3f1afa02171a788d6a94a2fe7ffb1ab835ddb4',
  '../src/vehicle-presentation.js':'60cedf69ce50716155ea11da313a8d1949a2019ae2bc9a7394e8b7c2d4133f08'
};
for(const [path,hash] of Object.entries(expected)){
  const actual=sha(path);
  if(actual!==hash)fail(`${path} changed from V21.21.27 baseline`);
}

console.log('V21.22.0 DISTANT TERRAIN QA: PASS');
console.log('horizon: 15 square-ring rows, same 5860m outer half-extent');
console.log('colour: no contour bands; altitude/slope palette + low-frequency variation + distance desaturation');
console.log('geometry: progressive far-only smoothing with exact seam and road-corridor protection');
console.log('physics/presentation: byte-for-byte identical to V21.21.27');
