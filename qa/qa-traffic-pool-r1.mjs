import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {
  CIVIL_TRAFFIC_VEHICLE_POOL,
  GENERIC_PASSENGER_PACK_URL,
  GENERIC_PASSENGER_PACK_FALLBACK_URL,
  buildGenericPassengerTemplates,
  civilTrafficCanonicalNodeName,
  civilTrafficChooseVehicleId,
  genericPassengerPackIds
} from '../src/traffic/civil-traffic-pool.js';

const ids=CIVIL_TRAFFIC_VEHICLE_POOL.map(entry=>entry.id);
const expected=['sonata','compact','coupe','hatchback','minivan','offroad','pickup','sedan','sport','suv','wagon'];
assert.deepEqual(ids,expected,'traffic variety pool must contain Sonata plus all ten supplied pack silhouettes');
assert.equal(new Set(ids).size,ids.length,'traffic pool ids must be unique');
assert.equal(genericPassengerPackIds().length,10,'generic passenger pack must expose ten civilian variants');
const coupeForwardYaw=CIVIL_TRAFFIC_VEHICLE_POOL.find(entry=>entry.id==='coupe')?.forwardYaw;
assert.ok(Math.abs(coupeForwardYaw-(-107.6678296368*Math.PI/180))<1e-12,'diagonal authored coupe must declare its measured forward-axis correction');
assert.ok(CIVIL_TRAFFIC_VEHICLE_POOL.filter(entry=>entry.id!=='coupe').every(entry=>entry.forwardYaw===undefined),'correctly aligned traffic variants must not receive a yaw correction');
assert.ok(CIVIL_TRAFFIC_VEHICLE_POOL.every(entry=>entry.weight>0),'every traffic pool entry needs positive spawn weight');
assert.ok(CIVIL_TRAFFIC_VEHICLE_POOL.every(entry=>entry.targetLength>=4&&entry.targetLength<=5.6),'traffic vehicle dimensions must stay plausible');
assert.equal(civilTrafficChooseVehicleId(['sedan'],.5),'sedan','single available vehicle must be deterministic');
assert.notEqual(civilTrafficChooseVehicleId(['sedan','suv'],.2,'sedan'),'sedan','pool should avoid immediate duplicate when another variant is available');
assert.equal(GENERIC_PASSENGER_PACK_URL,'./assets/traffic/generic_passenger_car_pack_traffic.glb');
assert.equal(GENERIC_PASSENGER_PACK_FALLBACK_URL,'./assets/traffic/generic_passenger_car_pack.glb');

function readGlbJson(filePath){
  const bytes=fs.readFileSync(filePath);
  assert.equal(bytes.toString('ascii',0,4),'glTF','traffic pack must remain a binary glTF');
  let offset=12;
  while(offset<bytes.length){
    const length=bytes.readUInt32LE(offset);
    const type=bytes.toString('ascii',offset+4,offset+8);
    if(type==='JSON')return JSON.parse(bytes.toString('utf8',offset+8,offset+8+length).replace(/\0+$/,''));
    offset+=8+length;
  }
  throw new Error('traffic pack GLB JSON chunk missing');
}

function authoredBodyDimensions(glbJson,bodyName){
  const root=glbJson.nodes.find(node=>node.name==='RootNode');
  const bodyIndex=root.children.find(index=>glbJson.nodes[index]?.name===bodyName);
  const body=glbJson.nodes[bodyIndex];
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const childIndex of body.children||[]){
    const mesh=glbJson.meshes[glbJson.nodes[childIndex]?.mesh];
    for(const primitive of mesh?.primitives||[]){
      const accessor=glbJson.accessors[primitive.attributes?.POSITION];
      if(!accessor?.min||!accessor?.max)continue;
      for(let axis=0;axis<3;axis++){
        bounds.min[axis]=Math.min(bounds.min[axis],accessor.min[axis]);
        bounds.max[axis]=Math.max(bounds.max[axis],accessor.max[axis]);
      }
    }
  }
  return bounds.max.map((value,axis)=>value-bounds.min[axis]);
}

const packJson=readGlbJson(new URL('../assets/traffic/generic_passenger_car_pack_traffic.glb',import.meta.url));
for(const entry of CIVIL_TRAFFIC_VEHICLE_POOL.filter(item=>item.source==='generic-pack')){
  const [widthOrLength,lengthOrWidth]=authoredBodyDimensions(packJson,entry.bodyName);
  if(entry.id==='coupe')assert.ok(widthOrLength>lengthOrWidth,'authored coupe must retain its exceptional X-longitudinal evidence');
  else assert.ok(lengthOrWidth>widthOrLength,`${entry.id} must retain the normal pack Y-longitudinal contract`);
}

assert.equal(civilTrafficCanonicalNodeName('Compact Body'),'compactbody');
assert.equal(civilTrafficCanonicalNodeName('Compact_Body'),'compactbody');
assert.equal(civilTrafficCanonicalNodeName('minivan body'),'minivanbody');
assert.equal(civilTrafficCanonicalNodeName('minivan_body'),'minivanbody');

const syntheticScene=new THREE.Group();
const syntheticRoot=new THREE.Group();
syntheticRoot.name='RootNode';
syntheticScene.add(syntheticRoot);
const bodyMaterial=new THREE.MeshBasicMaterial();
const wheelMaterial=new THREE.MeshBasicMaterial();
let baseX=0;
for(const entry of CIVIL_TRAFFIC_VEHICLE_POOL.filter(item=>item.source==='generic-pack')){
  const body=new THREE.Group();
  body.name=entry.bodyName.replaceAll(' ','_');
  body.position.set(baseX,0,0);
  // Mirror the real pack's axis exception: the coupe is authored lengthwise on
  // +X, while every other supplied body is lengthwise on Y.
  const bodyGeometry=entry.id==='coupe'?new THREE.BoxGeometry(4.6,2,1.5):new THREE.BoxGeometry(2,4,1.5);
  if(entry.id==='coupe')bodyGeometry.rotateZ(17.6678296368*Math.PI/180);
  body.add(new THREE.Mesh(bodyGeometry,bodyMaterial));
  syntheticRoot.add(body);
  const wheelOffsets=[[-.82,-1.45],[.82,-1.45],[-.82,1.45],[.82,1.45]];
  wheelOffsets.forEach(([dx,dz],index)=>{
    const wheel=new THREE.Group();
    wheel.name=`Wheel_${entry.id}_${index}`;
    wheel.position.set(baseX+dx,.35,dz);
    wheel.add(new THREE.Mesh(new THREE.BoxGeometry(.45,.7,.7),wheelMaterial));
    syntheticRoot.add(wheel);
  });
  baseX+=20;
}
syntheticRoot.updateMatrixWorld(true);
const syntheticTemplates=buildGenericPassengerTemplates(syntheticScene);
assert.equal(syntheticTemplates.size,10,'all sanitized pack body names must produce traffic templates');
for(const id of genericPassengerPackIds()){
  const template=syntheticTemplates.get(id);
  assert.ok(template,`sanitized pack extraction missing ${id}`);
  const size=new THREE.Vector3();
  new THREE.Box3().setFromObject(template).getSize(size);
  assert.ok(size.z>size.x,`${id} template must present its longitudinal axis on World Drive +Z`);
}

const poolSource=fs.readFileSync(new URL('../src/traffic/civil-traffic-pool.js',import.meta.url),'utf8');
for(const name of ['Compact Body','Coupe Body','Hatchback Body','minivan body','Offroad Body','Pickup Body','Sedan Body','Sport body','SUV Body','Wagon Body']){
  assert.ok(poolSource.includes(`bodyName:'${name}'`),`missing supplied pack body ${name}`);
}
assert.ok(!poolSource.includes('node.name===entry.bodyName'),'pack extraction must not depend on unsanitized exact node names');
assert.ok(poolSource.includes('assembly.rotation.x=-Math.PI/2'),'pack extraction must convert source -Y forward / Z-up into World Drive +Z forward / Y-up');
assert.ok(poolSource.includes('assembly.rotation.y=Number(entry.forwardYaw)||0'),'pack extraction must apply explicit per-model forward-axis metadata');
assert.ok(poolSource.includes('.slice(0,4)'),'each pack body must bind its four nearest authored wheels');

const facadeSource=fs.readFileSync(new URL('../src/traffic/civil-traffic.js',import.meta.url),'utf8');
const localSource=fs.readFileSync(new URL('../src/traffic/civil-traffic-local.js',import.meta.url),'utf8');
const trafficSource=`${facadeSource}\n${localSource}`;
assert.ok(localSource.includes("mode:'traffic-r7-variety-pool'"),'local diagnostics must retain variety-pool mode');
assert.ok(localSource.includes('buildGenericPassengerTemplates'),'local traffic engine must build templates from the supplied pack');
assert.ok(localSource.includes('civilTrafficChooseVehicleId'),'local traffic spawns must select from the vehicle pool');
assert.ok(localSource.includes('WorldDriveTrafficPool'),'runtime must expose pool diagnostics for visual testing');
assert.ok(trafficSource.includes('WorldDriveTrafficSpawn=(kind,vehicleId)'),'forced test spawn must accept an explicit vehicle id');
assert.ok(localSource.includes('spawnedByVehicle'),'diagnostics must count spawned vehicles by variant');
assert.ok(facadeSource.includes("mode:'traffic-mp1-shared-variety'"),'facade must identify synchronized multiplayer traffic');

console.log('PASS Traffic MP1 civilian vehicle variety pool');
console.log('  - Sonata + 10 supplied generic passenger-car silhouettes');
console.log('  - GLTFLoader-sanitized body names resolve to authored pool entries');
console.log('  - weighted selection and explicit vehicle spawning remain in local authority engine');
console.log('  - MP facade preserves the same visual pool for follower clients');
