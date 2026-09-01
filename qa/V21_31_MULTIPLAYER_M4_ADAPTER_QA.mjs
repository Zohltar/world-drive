import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createVehicleSystem} from '../src/vehicles/vehicle-system.js';
import {getMultiplayerVehicleSpec} from '../src/multiplayer/multiplayer-vehicle-registry.js';
import {VEHICLE_RENDER_ROOT_SCALE} from '../src/vehicles/vehicle-render-contract.js';
import {
  listAuthoredVehicleDescriptors,
  listAuthoredVehicleIds,
  loadAuthoredVehicleFactory
} from '../src/vehicles/vehicle-authored-registry.js';
import {normalizeMultiplayerVehicleState} from '../src/multiplayer/multiplayer-vehicle-adapter.js';

const liveVehicleSystem=createVehicleSystem({initialId:'wrx'});
const fleet=liveVehicleSystem.list().map(entry=>entry.id).sort();
const authoredIds=listAuthoredVehicleIds().sort();
const descriptors=listAuthoredVehicleDescriptors();

assert.equal(VEHICLE_RENDER_ROOT_SCALE,.80,'shared authored-vehicle render scale drift');
assert.deepEqual(authoredIds,fleet,'every selectable vehicle must have exactly one authored M4 descriptor');
assert.equal(descriptors.length,8,'M4 must cover the complete 8-vehicle fleet');
assert.equal(descriptors.filter(d=>d.kind==='passenger').length,7,'M4 passenger controller count drift');
assert.equal(descriptors.filter(d=>d.kind==='articulated-truck').length,1,'M4 truck controller count drift');

const reports=[];
for(const descriptor of descriptors){
  assert(fs.existsSync(descriptor.modulePath),`${descriptor.id}: authored controller source missing`);
  const source=fs.readFileSync(descriptor.modulePath,'utf8');
  const factory=await loadAuthoredVehicleFactory(descriptor.id);
  assert.equal(typeof factory,'function',`${descriptor.id}: authored controller factory must load`);
  assert(source.includes(`export function ${descriptor.exportName}`),`${descriptor.id}: registry export does not match source`);

  const vehicleSystem=createVehicleSystem({initialId:descriptor.id});
  const scene=new THREE.Scene();
  const car=new THREE.Group();
  const bodyGroup=new THREE.Group();
  car.add(bodyGroup);scene.add(car);
  const options=descriptor.kind==='articulated-truck'
    ?{THREE,scene,car,bodyGroup,existingWheels:[],vehicleSystem,groundHeightForWheel:()=>0,getWorldOffset:()=>({x:0,z:0})}
    :{THREE,bodyGroup,existingWheels:[],vehicleSystem};
  const controller=factory(options);
  assert(controller,`${descriptor.id}: factory returned no controller`);
  assert.equal(typeof controller.setActive,'function',`${descriptor.id}: controller lacks setActive()`);
  assert.equal(typeof controller.update,'function',`${descriptor.id}: controller lacks update()`);

  const caps=new Set(descriptor.capabilities||[]);
  const sourceHasNight=source.includes('nightLevel');
  const sourceHasFunctionalSignals=/signalState\s*=|turnLeft\s*:|turnRight\s*:|truckLightState\.turnLeft|truckLightState\.turnRight/.test(source);
  const sourceHasTrailer=source.includes('stepTrailerArticulation');
  const sourceHasSteeringWheel=source.includes('steeringWheelBone');
  assert.equal(caps.has('night'),sourceHasNight,`${descriptor.id}: night capability must exactly match local controller source`);
  assert.equal(caps.has('turn-signals'),sourceHasFunctionalSignals,`${descriptor.id}: turn-signal capability must exactly match local controller source`);
  assert.equal(caps.has('trailer'),sourceHasTrailer,`${descriptor.id}: trailer capability must exactly match local controller source`);
  assert.equal(caps.has('steering-wheel'),sourceHasSteeringWheel,`${descriptor.id}: steering-wheel capability must exactly match local controller source`);

  if(caps.has('wheels'))assert(/animateWheels|animateAssetWheels|wheelSpin|wheelAnimators|wheelControllers|Tire|tire/i.test(source),`${descriptor.id}: wheel capability has no authored wheel implementation`);
  if(caps.has('steering'))assert(/steerAngle|steerPivot|steerQuaternion|steerQuat|steering/i.test(source),`${descriptor.id}: steering capability has no controller path`);
  if(caps.has('brake'))assert(source.includes('braking'),`${descriptor.id}: brake capability must consume braking state`);
  if(caps.has('reverse'))assert(source.includes('reversing'),`${descriptor.id}: reverse capability must consume reversing state`);
  if(caps.has('night'))assert(source.includes('nightLevel'),`${descriptor.id}: night capability must consume nightLevel`);
  if(caps.has('trailer'))assert(source.includes('stepTrailerArticulation'),`${descriptor.id}: trailer capability must use real articulation model`);
  if(caps.has('steering-wheel'))assert(source.includes('steeringWheelBone'),`${descriptor.id}: steering-wheel capability must use authored steering wheel`);

  const spec=getMultiplayerVehicleSpec(descriptor.id);
  const normalized=normalizeMultiplayerVehicleState({
    absX:'123.5',absZ:'-88.25',renderX:'12.5',renderZ:'-7.5',heading:'1.2',speed:'-4.5',steerAngle:'9',
    gear:-1,braking:1,reversing:false,nightLevel:4,signalLeft:true,signalRight:false,signalBlink:true,distance:'55'
  },vehicleSystem.active);
  assert.equal(normalized.absX,123.5,`${descriptor.id}: absX normalization failed`);
  assert.equal(normalized.absZ,-88.25,`${descriptor.id}: absZ normalization failed`);
  assert(Number.isFinite(normalized.steerAngle),`${descriptor.id}: steer angle must normalize finite`);
  assert(normalized.steerInput>=-1&&normalized.steerInput<=1,`${descriptor.id}: steerInput must clamp to normalized contract`);
  assert.equal(normalized.nightLevel,1,`${descriptor.id}: night level must clamp`);
  assert.equal(normalized.gear,-1,`${descriptor.id}: reverse gear must survive conversion`);
  assert.equal(normalized.reversing,true,`${descriptor.id}: gear R must force reverse lights even if legacy bool is false`);

  const forward=normalizeMultiplayerVehicleState({gear:1,reversing:true},vehicleSystem.active);
  assert.equal(forward.gear,1,`${descriptor.id}: forward gear normalization failed`);
  assert.equal(forward.reversing,false,`${descriptor.id}: forward gear must override stale legacy reversing=true`);

  const missingGear=normalizeMultiplayerVehicleState({gear:null,reversing:true},vehicleSystem.active);
  assert.equal(missingGear.gear,null,`${descriptor.id}: missing gear must remain null, never become Neutral`);
  assert.equal(missingGear.reversing,true,`${descriptor.id}: legacy reverse bool must survive when gear is missing`);

  controller.setActive(false);
  scene.traverse(obj=>{obj.geometry?.dispose?.();for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material]))mat?.dispose?.();});
  scene.clear();
  reports.push({id:descriptor.id,kind:descriptor.kind,capabilities:[...caps],wheelbase:spec.physics.wheelbase,supportContacts:spec.visual.supportContacts.length});
}

const entries=fs.readFileSync('src/vehicles/vehicle-glb-entries.js','utf8');
const adapter=fs.readFileSync('src/multiplayer/multiplayer-vehicle-adapter.js','utf8');
const visuals=fs.readFileSync('src/multiplayer/multiplayer-visuals-m3.js','utf8');
const client=fs.readFileSync('src/multiplayer/multiplayer-client-m3.js','utf8');
const localVisuals=fs.readFileSync('src/vehicles/vehicle-visuals.js','utf8');
const wrx=fs.readFileSync('src/vehicles/models/wrx-glb.js','utf8');
const sonata=fs.readFileSync('src/vehicles/models/sonata-glb.js','utf8');
const id4=fs.readFileSync('src/vehicles/models/id4-glb.js','utf8');

assert(entries.includes("from './vehicle-authored-registry.js'"),'local GLB entrypoint must use canonical authored registry');
for(const legacy of ['./wrx-glb.js','./sonata-glb.js','./civic-glb.js','./id4-glb.js'])assert(!entries.includes(`import '${legacy}'`),`local entrypoint must not bypass registry: ${legacy}`);
assert(adapter.includes("from '../vehicles/vehicle-authored-registry.js'"),'remote adapter must resolve exact local authored controller registry');
assert(adapter.includes('loadAuthoredVehicleFactory(vehicleId)'),'remote adapter must instantiate the canonical local controller');
assert(adapter.includes('createVehicleSystem({initialId:vehicleId})'),'every peer must own an isolated vehicleSystem');
assert(adapter.includes("descriptor?.kind==='articulated-truck'"),'adapter must convert articulated truck through the same contract');
assert(adapter.includes('absX-state.renderX')&&adapter.includes('absZ-state.renderZ'),'truck adapter must infer floating world origin from normalized coordinates');
assert(adapter.includes("if(value===null||value===undefined||value==='')return null"),'adapter must preserve missing gear as null');
assert(adapter.includes('reversing:gear!==null?gear<0:!!input.reversing'),'adapter must make explicit gear authoritative for reverse');
assert(adapter.includes('reverseRequested:optionalBoolean(system?.reverseRequested)'),'adapter diagnostics must expose authored reverse command receipt when controller supports it');
assert(adapter.includes('reverseMaterialCount:optionalCount(system?.reverseMaterialCount)'),'adapter diagnostics must expose authored reverse binding count when controller supports it');
assert(adapter.includes('reverseGlowOpacity:optionalCount(system?.reverseGlowOpacity)'),'adapter diagnostics must expose authored shader output when available');
assert(visuals.includes("from './multiplayer-vehicle-adapter.js'"),'multiplayer visuals must route through M4 adapter');
assert(visuals.includes("from '../vehicles/vehicle-render-contract.js'"),'remote visuals must consume shared local render transform contract');
assert(visuals.includes('support.root.scale.set(VEHICLE_RENDER_ROOT_SCALE'),'remote authored root must use exact local car scale');
assert(localVisuals.includes("from './vehicle-render-contract.js'"),'local visuals must consume shared render transform contract');
assert(localVisuals.includes('car.scale.set(VEHICLE_RENDER_ROOT_SCALE'),'local car root must use shared render scale');
assert(!visuals.includes('multiplayer-hd-vehicles-m3')&&!visuals.includes('multiplayer-hd-vehicles-m31'),'M4 runtime must not use the retired multiplayer-only GLB cache');
assert(!visuals.includes('multiplayer-authored-lighting'),'M4 runtime must not use a second multiplayer-only lighting implementation');
assert(visuals.includes('same-local-authored-controller'),'M4 visual source must be explicit');
assert(client.includes('peer.visual.updateRemoteVehicle?.(dt,remoteState)'),'client must feed normalized peer state into M4 adapter each frame');
assert(client.includes('peer.visual.setRemoteVisible?.(true,remoteState)'),'client must keep external trailer/controller visibility aligned');
assert(client.includes('gear:peer.gear'),'client must forward network gear into normalized remote state');

assert(wrx.includes('const isRearCluster=localCenter.z<-1.7 && localCenter.y>.65'),'WRX reverse must classify the physical rear cluster in root-local space');
assert(wrx.includes("materialNames.some(name=>name.includes('fh_light_glass'))"),'WRX reverse must bind the proven authored fh_light_glass rear lens');
assert(wrx.includes("console.warn('WRX authored reverse-lamp binding found no rear white lens.')"),'WRX missing proven reverse lens must be diagnosable');
assert(!wrx.includes("if(path.includes('fh_reverse_material'))"),'WRX reverse must not regress to misleading fh_reverse_material/Eblems branch');

assert(sonata.includes("const rearInnerLens=root.getObjectByName('Object_46')"),'Sonata reverse must originate from audited Object_46 authored lens');
for(const uniform of ['uTintMix','uUseUvRegion','uUvMin','uUvMax','uUvFeather']){
  assert(sonata.includes(`${uniform}:{value:`),`Sonata shader missing initialized ${uniform}`);
}
assert(sonata.includes("filter:'white',side:0,tint:0xf8fbff"),'Sonata Object_46 must own an authored white reverse glow layer');
assert(sonata.includes('get reverseGlowOpacity(){return lastReverseGlowOpacity;}'),'Sonata must expose applied authored reverse glow opacity');
assert(sonata.includes("get reverseMaterialCount(){return authoredRearGlowLayers.filter(layer=>layer.filter==='white').length;}"),'Sonata must expose authored reverse layer count');

assert(id4.includes('for(const [obj,visible] of hiddenWheelState)obj.visible=visible'),'ID.4 local controller wheel visibility restoration regression');
assert(!id4.includes('hiddenWheelState)pivot.visible=visible'),'ID.4 invalid pivot visibility reference must not return');

console.log('V21.31 MULTIPLAYER M4.12 ADAPTER QA: PASS',{
  vehicles:reports,
  renderRootScale:VEHICLE_RENDER_ROOT_SCALE,
  sameControllerForLocalAndRemote:true,
  isolatedPeerVehicleSystems:true,
  capabilitiesDerivedFromLocalSource:true,
  normalizedContract:['pose','motion','steering','gear','brake','reverse','night','signals','distance'],
  missingGearPreserved:true,
  gearAuthoritativeReverse:true,
  wrxReverseBinding:'rear fh_light_glass authored lens',
  sonataReverseBinding:'Object_46 authored white shader',
  articulatedTruckConverted:true,
  duplicateRemoteGlbLightingRuntime:false
});