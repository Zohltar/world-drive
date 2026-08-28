import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir='dist/assets';
const files=fs.readdirSync(dir);
const js=files.filter(name=>name.endsWith('.js')).map(name=>({
  name,
  bytes:fs.statSync(path.join(dir,name)).size
})).sort((a,b)=>b.bytes-a.bytes);

const vehiclePrefixes=['countach-glb','id4-glb','wrx-glb','civic-glb','sonata-glb','f1-glb','i3-glb'];
const vehicleChunks=vehiclePrefixes.map(prefix=>{
  const match=js.find(file=>file.name.startsWith(prefix+'-'));
  assert(match,`missing deferred production chunk for ${prefix}`);
  return match;
});

const main=js.find(file=>file.name.startsWith('index-'));
assert(main,'missing production application index chunk');
const threeVendor=js.find(file=>file.name.startsWith('vendor-three-'));
assert(threeVendor,'missing stable Three.js core vendor chunk');
const gltfLoader=js.find(file=>file.name.startsWith('GLTFLoader-'));
assert(gltfLoader,'GLTFLoader must remain a separate lazy vehicle dependency');
const multiplayerClient=js.find(file=>file.name.startsWith('multiplayer-client-m3-'));
const multiplayerVisuals=js.find(file=>file.name.startsWith('multiplayer-visuals-m3-'));
assert(multiplayerClient&&multiplayerVisuals,'multiplayer runtime must remain code-split from startup application chunk');

// The application-owned startup chunk should stay comfortably below the old
// monolithic ~1.1 MiB guard. Three core is isolated because it changes rarely
// and therefore benefits strongly from browser cache reuse between builds.
assert(main.bytes<900000,`application JS bundle too large after vendor split: ${(main.bytes/1024).toFixed(2)} KiB`);
assert(threeVendor.bytes>250000,'Three.js vendor chunk unexpectedly small; manual split may have drifted');
assert(gltfLoader.bytes<120000,'GLTFLoader unexpectedly merged with an eager/heavy dependency');
assert(vehicleChunks.every(chunk=>chunk.bytes>500),'unexpectedly empty vehicle chunk');
assert(multiplayerClient.bytes>1000&&multiplayerVisuals.bytes>1000,'unexpectedly empty multiplayer lazy chunks');

console.table(js.map(file=>({file:file.name,kib:+(file.bytes/1024).toFixed(2)})));
console.log('V21.31 PRODUCTION CODE SPLIT QA: PASS',{
  js_chunks:js.length,
  application_kib:+(main.bytes/1024).toFixed(2),
  three_vendor_kib:+(threeVendor.bytes/1024).toFixed(2),
  gltf_loader_kib:+(gltfLoader.bytes/1024).toFixed(2),
  lazy_multiplayer_kib:+((multiplayerClient.bytes+multiplayerVisuals.bytes)/1024).toFixed(2),
  deferred_vehicle_kib:+(vehicleChunks.reduce((sum,file)=>sum+file.bytes,0)/1024).toFixed(2)
});
