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
const sha=path=>crypto.createHash('sha256').update(fs.readFileSync(new URL(path,root))).digest('hex');

if(pkg.version!=='21.22.6')fail(`package version must be 21.22.6, got ${pkg.version}`);
has(main,"version:'21.22.6-candidate'",'runtime version not updated');

// Preserve the validated high-detail terrain and hitch-free streaming architecture.
has(main,'const NEAR_TERRAIN_SIZE=5600;','5.6 km high-detail terrain lost');
has(main,'const NEAR_TERRAIN_SEGMENTS=448;','448-segment DEM grid lost');
has(main,'perfConsoleLogging:false','periodic perf logging re-enabled');
has(main,'shiftRenderedWorldForOrigin(shiftX,shiftZ)','soft recenter path missing');
has(main,'const TERRAIN_PRELOAD_BUFFER={','terrain preload buffer lost');
has(main,'aheadDistance:10500','forward preload buffer shortened');

// Satellite must render first and own stencil ref 2.
has(imagery,"chunkGroup.renderOrder=-10",'satellite group must render before terrain');
has(imagery,'mesh.renderOrder=-10','satellite meshes must render before terrain');
has(imagery,'stencilRef:2','satellite stencil ownership missing');
has(imagery,'stencilFunc:THREE.AlwaysStencilFunc','satellite stencil must always claim visible pixels');
has(imagery,'stencilZPass:THREE.ReplaceStencilOp','satellite stencil must replace on depth pass');

// Every procedural terrain layer must reject pixels already owned by satellite.
has(main,'stencilRef:2','near DEM stencil reject missing');
has(main,'stencilFunc:THREE.NotEqualStencilFunc','near DEM must reject satellite pixels');
has(main,'ground.renderOrder=-5','near DEM must render after satellite chunks');
has(terrain,'Procedural horizon pixels under a','distant terrain stencil policy missing');
has(terrain,'stencilFunc:THREE.NotEqualStencilFunc','distant terrain must reject satellite pixels');

// Cloned road-bed terrain inherits the ground material stencil policy. Satellite
// geometry is also denser to match the 12.5 m DEM grid more closely.
has(main,'chunkSegments:96','satellite chunk density not upgraded');
has(terrain,'const material=ground.material.clone();','road-bed must inherit ground stencil mask');

// The monolithic map path must remain disabled.
has(imagery,'groundMaterial.map=null;','procedural ground map disable path missing');

// Physics remains exactly the V21.21.27 baseline.
const expected={
  'src/vehicle-system.js':'c74d7d0ad8b10cef33312e282ae6b5a6fbcc0c301079b7eb8b2ab94a2aa5b89b',
  'src/vehicle-dynamics.js':'b8898f7f99061e35563862362e3f1afa02171a788d6a94a2fe7ffb1ab835ddb4',
  'src/vehicle-presentation.js':'60cedf69ce50716155ea11da313a8d1949a2019ae2bc9a7394e8b7c2d4133f08'
};
for(const [path,hash] of Object.entries(expected)){
  if(sha(path)!==hash)fail(`${path} changed from V21.21.27 stable physics baseline`);
}

console.log('PASS V21.22.6 satellite/procedural terrain ownership');
console.log('satellite: stencil ref 2, early render, 96-segment chunk mesh');
console.log('procedural terrain: near/road-bed/horizon reject satellite-owned pixels');
console.log('streaming: hitch-free + preload buffer preserved');
console.log('physics: byte-for-byte V21.21.27 baseline');
