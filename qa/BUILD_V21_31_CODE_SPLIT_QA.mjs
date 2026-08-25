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

const main=js[0];
assert(main.bytes<1120000,`main JS bundle did not shrink enough: ${(main.bytes/1024).toFixed(2)} KiB`);
assert(vehicleChunks.every(chunk=>chunk.bytes>500), 'unexpectedly empty vehicle chunk');

console.table(js.map(file=>({file:file.name,kib:+(file.bytes/1024).toFixed(2)})));
console.log('V21.31 PRODUCTION CODE SPLIT QA: PASS',{
  js_chunks:js.length,
  main_kib:+(main.bytes/1024).toFixed(2),
  deferred_vehicle_kib:+(vehicleChunks.reduce((sum,file)=>sum+file.bytes,0)/1024).toFixed(2)
});
