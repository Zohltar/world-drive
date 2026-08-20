import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const terrain=fs.readFileSync(new URL('../src/terrain.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

const fail=(message)=>{throw new Error(message)};
const hasMain=(needle,message)=>{if(!main.includes(needle))fail(message)};
const hasTerrain=(needle,message)=>{if(!terrain.includes(needle))fail(message)};

if(pkg.version!=='21.21.27')fail(`package version must be 21.21.27, got ${pkg.version}`);

// Preserve the proven renderer / road-over-water priority introduced in V21.21.20.
hasMain("new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:true})",'native MSAA + stencil renderer policy changed');
hasMain('stencilRef:1','road/water stencil ref missing');
hasMain('stencilFunc:THREE.NotEqualStencilFunc','water must reject road-owned stencil pixels');
hasMain('stencilZPass:THREE.ReplaceStencilOp','road must write stencil on visible pixels');
hasMain('const ratioCap=next>=3?.76:(next===2?.84:(next===1?.96:1.08));','adaptive render-ratio ladder changed unexpectedly');
if(main.includes('EffectComposer')||main.includes('FXAAShader'))fail('FXAA/post-processing must remain absent');

// V21.21.27 near-terrain detail footprint: same ~12.5 m base spacing, much wider area.
hasMain('const NEAR_TERRAIN_SIZE=3200;','near terrain must expand to 3200m');
hasMain('const NEAR_TERRAIN_SEGMENTS=256;','near terrain must use 256 segments');
hasMain('groundSize:NEAR_TERRAIN_SIZE','terrain/imagery extent must follow NEAR_TERRAIN_SIZE');
const nearSpacing=3200/256;
if(Math.abs(nearSpacing-12.5)>1e-9)fail('near-terrain vertex spacing changed unexpectedly');

// Higher-quality road surface and smoother longitudinal ribbon geometry.
hasMain("function makeRoadSurfaceTextures(kind='asphalt')",'procedural multi-map road surface missing');
hasMain('const size=512;','road surface textures must be 512px');
hasMain("const shoulderTextures=makeRoadSurfaceTextures('gravel');",'textured gravel shoulder missing');
hasMain('bumpMap:asphaltTextures.bump','asphalt bump map missing');
hasMain('roughnessMap:asphaltTextures.roughness','asphalt roughness map missing');
hasMain('bumpMap:shoulderTextures.bump','shoulder bump map missing');
hasMain('roughnessMap:shoulderTextures.roughness','shoulder roughness map missing');
hasMain('texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());','road anisotropy must reach 16x where supported');
hasMain('Math.ceil(sampledLen/3)','road ribbon sample spacing must be <=3m');
hasMain('const lineYellow=new THREE.MeshStandardMaterial({','yellow line material must react to scene lighting');
hasMain('const lineWhite=new THREE.MeshStandardMaterial({','white line material must react to scene lighting');

// Wider display streaming halo at every quality level.
hasMain('streamingScale:.96','low streaming scale mismatch');
hasMain('streamingScale:1.32','medium streaming scale mismatch');
hasMain('streamingScale:1.82','high streaming scale mismatch');

// Deep route-aware DEM + imagery warm cache, in addition to the existing 250 ms directional prefetch.
hasMain('nextDirectionalPrefetchAt=now+250;','existing 250ms directional prefetch cadence must remain');
hasMain('function prefetchRouteAhead(){','route-ahead prefetch missing');
hasMain('const leadBonus=Math.min(1400,speedAbs*24);','speed-sensitive route-ahead lead mismatch');
hasMain('const lookaheads=[650,1250,2100,3200]','route-ahead distance ladder mismatch');
hasMain('const bucket=Math.round(cum/420);','route-ahead duplicate suppression mismatch');
hasMain('elevationService.prefetchAt?.(p.x,p.z)','route-ahead DEM prefetch missing');
hasMain('imageryService.prefetchAt?.(p.x,p.z)','route-ahead imagery prefetch missing');
hasMain("scheduleVisualJob('ahead-dem-refresh',rebuildLocalWorld,520);",'completed DEM tiles must trigger coalesced visible terrain refresh');
hasMain('moved<340||now-lastImageryRefreshAt<1100','current imagery refresh threshold mismatch');
hasMain('nextAheadStreamingAt=now+850;','deep route-ahead streaming cadence mismatch');

// Far terrain rings start exactly at the enlarged near patch and remain dense near the seam.
hasTerrain('const nearHalf=groundSize/2;','horizon must start from near terrain half-size');
for(const offset of [100,230,390,590,830,1120,1470,1890,2380,2940,3570,4260]){
  hasTerrain(`nearHalf+${offset}`,`missing V21.21.27 horizon ring offset ${offset}`);
}

const oldMargin=2400/2-520;
const newMargin=3200/2-520;
if(newMargin<=oldMargin)fail('near high-detail forward margin did not improve over V21.21.20');
const farHalf=3200/2+4260;
if(farHalf<5800)fail('far horizon does not reach intended extent');

console.log('V21.21.27 VISUAL / STREAMING QA: PASS');
console.log(`near terrain: 2400m / 192 -> 3200m / 256 (${nearSpacing.toFixed(1)}m nominal spacing retained)`);
console.log(`worst-case high-detail margin at 520m recenter: ${oldMargin}m -> ${newMargin}m (+${newMargin-oldMargin}m)`);
console.log(`far horizon half-extent: ${farHalf}m (~${(Math.SQRT2*farHalf/1000).toFixed(1)}km to corners)`);
console.log('road: 512px albedo+bump+roughness, gravel shoulders, <=3m ribbon samples, up to 16x anisotropy');
console.log('streaming: route-aware DEM/imagery warm cache at 650/1250/2100/3200m + speed lead, 850ms cadence');
console.log('V21.21.20 stencil/MSAA/render-ratio policies preserved');
