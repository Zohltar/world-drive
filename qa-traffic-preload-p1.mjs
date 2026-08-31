import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildGenericPassengerTemplates} from './src/civil-traffic-pool.js';

const preloadSource=fs.readFileSync(new URL('./src/civil-traffic-preload.js',import.meta.url),'utf8');
const poolSource=fs.readFileSync(new URL('./src/civil-traffic-pool.js',import.meta.url),'utf8');

assert.ok(preloadSource.includes('GLTFLoader.prototype.loadAsync=function'),'traffic preload must reuse parsed GLTFs through the shared GLTFLoader module');
assert.ok(preloadSource.includes("fetch(url,{cache:'force-cache'})"),'traffic assets must be fetched once through browser cache');
assert.ok(preloadSource.includes('loader.parseAsync(buffer'),'heavy GLB parsing must happen in the startup preloader');
assert.ok(preloadSource.includes('buildGenericPassengerTemplates(parsed.gltf.scene'),'generic templates must be prebuilt during startup');
assert.ok(preloadSource.includes('state.pack.promise=state.sonata.promise'),'Sonata and generic pack parsing must be sequential, not simultaneous');
assert.ok(preloadSource.includes('ensureWorldDriveDiagnostics().traffic.preload=civilTrafficPreloadDiagnostics'),'startup preload timings must be exposed through canonical runtime diagnostics');
assert.ok(!preloadSource.includes('WorldDriveTrafficPreload'),'legacy traffic-preload diagnostics global must remain retired');
assert.ok(poolSource.includes('const GENERIC_TEMPLATE_CACHE=new WeakMap()'),'generic template extraction must be cached per parsed pack scene');
assert.ok(poolSource.includes("import('./civil-traffic-preload.js')"),'browser runtime must start traffic preload from module startup');
assert.ok(poolSource.includes("typeof window!=='undefined'"),'Node QA must not trigger browser asset preloading');

// Lock actual WeakMap reuse semantics with one complete synthetic sanitized pack.
const scene=new THREE.Scene();
const root=new THREE.Group();root.name='RootNode';scene.add(root);
const bodyNames=['Compact_Body','Coupe_Body','Hatchback_Body','minivan_body','Offroad_Body','Pickup_Body','Sedan_Body','Sport_body','SUV_Body','Wagon_Body'];
bodyNames.forEach((name,index)=>{
  const body=new THREE.Group();body.name=name;body.position.set(index*20,0,0);root.add(body);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,2,8),new THREE.MeshStandardMaterial());mesh.name=`${name}_Body_0`;body.add(mesh);
  for(let wheelIndex=0;wheelIndex<4;wheelIndex++){
    const wheel=new THREE.Group();
    wheel.name=`Wheel_${index}_${wheelIndex}`;
    wheel.position.set(index*20+(wheelIndex%2?2:-2),0,wheelIndex<2?-3:3);
    const wheelMesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
    wheel.add(wheelMesh);root.add(wheel);
  }
});
scene.updateMatrixWorld(true);
const first=buildGenericPassengerTemplates(scene);
const second=buildGenericPassengerTemplates(scene);
assert.equal(first.size,10,'synthetic generic pack must build all ten templates');
assert.equal(second,first,'second build call must return the exact cached template Map');

console.log('PASS Traffic P1 startup preload and template cache');
console.log('  - GLB fetch/parse is moved to application startup');
console.log('  - Sonata then generic pack parse sequentially');
console.log('  - all ten generic templates are prebuilt and WeakMap-cached');
console.log('  - later traffic startup reuses parsed GLTF and extracted templates');
