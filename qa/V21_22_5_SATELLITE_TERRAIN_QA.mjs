import fs from 'node:fs';
import crypto from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const main=read('src/main.js');
const terrain=read('src/terrain.js');
const imagery=read('src/imagery.js');
const pkg=JSON.parse(read('package.json'));
const fail=m=>{throw new Error(m)};
const has=(text,needle,msg)=>{if(!text.includes(needle))fail(msg)};
const no=(text,needle,msg)=>{if(text.includes(needle))fail(msg)};
const sha=path=>crypto.createHash('sha256').update(fs.readFileSync(new URL(path,root))).digest('hex');

if(pkg.version!=='21.22.5')fail(`package version must be 21.22.5, got ${pkg.version}`);
has(main,"version:'21.22.5-candidate'",'runtime version not updated');

// Keep V21.22.2 high-detail terrain scope.
has(main,'const NEAR_TERRAIN_SIZE=5600;','5.6 km high-detail terrain lost');
has(main,'const NEAR_TERRAIN_SEGMENTS=448;','12.5 m DEM grid lost');
has(main,'vertexColors:true,roughness:1','natural DEM underlay must use vertex colours');

// Satellite is now exact-bounds chunked imagery, never a clamped giant map.
has(imagery,"chunkGroup.name='satellite-terrain-chunks'",'chunked satellite group missing');
has(imagery,'const CHUNK_TILES=Math.max(1,Math.floor(chunkTiles));','chunk tile policy missing');
has(main,'chunkTiles:3','3x3 geographic chunk size missing');
has(main,'chunkSegments:72','near-quality chunk terrain density missing');
has(imagery,'const images=await Promise.all(tileJobs);','chunk must wait for complete real imagery');
has(imagery,'positions[pi++]=absX-spec.centerX;','chunk X must come from exact geographic bounds');
has(imagery,'positions[pi++]=absZ-spec.centerZ;','chunk Z must come from exact geographic bounds');
has(imagery,'uvs[ui++]=1-tz;','north/south imagery UV orientation missing');
has(imagery,'groundMaterial.map=null;','monolithic ground satellite map must be disabled');
no(imagery,'groundMaterial.map=imageryTexture','legacy giant ground mosaic returned');
no(imagery,'groundMaterial.map = imageryTexture','legacy giant ground mosaic returned');
no(imagery,'groundMaterial.map=satelliteTexture','legacy satellite texture mapping returned');
no(imagery,'groundMaterial.map = satelliteTexture','legacy satellite texture mapping returned');
no(imagery,'groundMaterial.repeat','ground texture repeat must not exist');
has(imagery,'requiredKeys=new Set(sorted.map(spec=>spec.key));','visible geographic coverage tracking missing');
has(imagery,'if(chunks.has(spec.key))return Promise.resolve(true);','chunk reuse/cache path missing');
has(imagery,'activeBuilds>=1','chunk composition must be serialized for frame pacing');
has(imagery,'await idleTurn();','chunk commit must yield to frame loop');

// Soft floating origin and later world rebuilds must keep chunks registered.
has(main,'imageryService.shiftOrigin?.(shiftX,shiftZ);','satellite chunks do not follow soft recenter');
has(main,'imageryService.realignToOrigin?.();','chunks are not realigned after full world refresh');
has(main,'imageryService.invalidateGeometry?.();','chunk heights not refreshed after DEM/world refresh');
has(main,'getGroundCenter:()=>({','imagery must follow actual old ground center during deferred rebuild');
has(main,'sampleTerrainHeight:(x,z)=>terrainService.renderHeightAt(x,z)','imagery must conform to visible terrain surface');
has(terrain,'renderHeightAt:renderedTerrainHeight','terrain visual-height API missing');

// Natural fallback: no cartographic contour stripes in the near/road-bed underlay.
no(terrain,'contourPhase','near DEM contour striping returned');
no(terrain,'minorContour','near DEM minor contour striping returned');

// Preserve V21.22.3 hitch-free semantics and V21.22.4 cache buffer.
has(main,'perfConsoleLogging:false','periodic perf logging re-enabled');
has(main,"markStreamWorldRefresh('dem')",'DEM completion should only mark dirty');
no(main,"scheduleVisualJob('ahead-dem-refresh'",'ahead DEM completion rebuild returned');
has(main,'shiftRenderedWorldForOrigin(shiftX,shiftZ)','soft recenter path missing');
has(main,'static shadow maps are refreshed only when streamed world','timer shadow refresh returned');
has(main,'const TERRAIN_PRELOAD_BUFFER={','2D preload buffer lost');
has(main,'aheadDistance:10500','forward preload buffer shortened');
has(main,'lateralOffsets:[0,-1500,1500,-3000,3000]','lateral preload buffer lost');

// Vehicle physics/presentation remain baseline-identical.
const expected={
  'src/vehicles/vehicle-system.js':'c74d7d0ad8b10cef33312e282ae6b5a6fbcc0c301079b7eb8b2ab94a2aa5b89b',
  'src/vehicle-dynamics.js':'b8898f7f99061e35563862362e3f1afa02171a788d6a94a2fe7ffb1ab835ddb4',
  'src/vehicles/vehicle-presentation.js':'60cedf69ce50716155ea11da313a8d1949a2019ae2bc9a7394e8b7c2d4133f08'
};
for(const [path,hash] of Object.entries(expected)){
  if(sha(path)!==hash)fail(`${path} changed from V21.21.27 stable physics baseline`);
}

console.log('PASS V21.22.5 satellite terrain pipeline rewrite');
console.log('satellite: exact-bounds 3x3-tile chunks, serialized idle commits, no monolithic edge clamp');
console.log('terrain: 5600 m / 448 DEM retained; natural vertex-colour fallback; no contour stripes');
console.log('frame pacing: V21.22.3 hitch-free + V21.22.4 preload buffer retained');
console.log('physics: byte-for-byte V21.21.27 baseline');
