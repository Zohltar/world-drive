import * as THREE from 'three';
import {
  CIVIL_TRAFFIC_VEHICLE_POOL,
  GENERIC_PASSENGER_PACK_URL,
  GENERIC_PASSENGER_PACK_FALLBACK_URL,
  buildGenericPassengerTemplates,
  civilTrafficChooseVehicleId,
  civilTrafficPoolEntry
} from './civil-traffic-pool.js';

// World Drive Traffic R7 — sparse civil traffic with a reusable vehicle pool.
//
// Traffic density, road following and player physics remain unchanged. R7 keeps the
// validated Sonata behavior, then adds the supplied generic passenger-car pack as
// ten additional visual templates selected from a weighted civilian vehicle pool.

export const CIVIL_TRAFFIC_MAX_ACTIVE=2;
export const CIVIL_TRAFFIC_LANE_OFFSET_M=1.72;
export const CIVIL_TRAFFIC_FIRST_SPAWN_MIN_SEC=12;
export const CIVIL_TRAFFIC_FIRST_SPAWN_MAX_SEC=23;
export const CIVIL_TRAFFIC_COOLDOWN_MIN_SEC=32;
export const CIVIL_TRAFFIC_COOLDOWN_MAX_SEC=68;

const SPAWN_AHEAD_MIN_M=360;
const SPAWN_AHEAD_MAX_M=690;
const DESPAWN_BEHIND_M=260;
const DESPAWN_AHEAD_M=1150;
const ROUTE_END_MARGIN_M=45;
const TELEPORT_RESET_M=1000;
const MODEL_TARGET_LENGTH_M=4.85;
const BODY_CLEARANCE_M=.035;

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const lerp=(a,b,t)=>a+(b-a)*t;
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

export function civilTrafficLaneOffset(direction=1){
  return direction>=0?CIVIL_TRAFFIC_LANE_OFFSET_M:-CIVIL_TRAFFIC_LANE_OFFSET_M;
}

export function civilTrafficCooldownSec(randomValue=Math.random()){
  return lerp(CIVIL_TRAFFIC_COOLDOWN_MIN_SEC,CIVIL_TRAFFIC_COOLDOWN_MAX_SEC,clamp(Number(randomValue)||0,0,1));
}

export function civilTrafficFirstSpawnSec(randomValue=Math.random()){
  return lerp(CIVIL_TRAFFIC_FIRST_SPAWN_MIN_SEC,CIVIL_TRAFFIC_FIRST_SPAWN_MAX_SEC,clamp(Number(randomValue)||0,0,1));
}

export function civilTrafficSpawnPlan({
  playerCum=0,
  routeLength=0,
  kind='oncoming',
  distanceRandom=.5,
  speedRandom=.5
}={}){
  const direction=kind==='ahead'?1:-1;
  const distance=lerp(SPAWN_AHEAD_MIN_M,SPAWN_AHEAD_MAX_M,clamp(Number(distanceRandom)||0,0,1));
  const cum=Number(playerCum)+distance;
  const length=Math.max(0,Number(routeLength)||0);
  if(length<=0||cum>=length-ROUTE_END_MARGIN_M)return null;
  const speedKmh=direction>0
    ?lerp(54,76,clamp(Number(speedRandom)||0,0,1))
    :lerp(62,88,clamp(Number(speedRandom)||0,0,1));
  return {
    kind:direction>0?'ahead':'oncoming',
    direction,
    cum,
    laneOffset:civilTrafficLaneOffset(direction),
    cruiseSpeed:speedKmh/3.6
  };
}

export function civilTrafficCurveSpeed(cruiseSpeed,currentAngle,nextAngle){
  const cruise=Math.max(7,Number(cruiseSpeed)||16);
  const turn=Math.abs(angleDelta(Number(currentAngle)||0,Number(nextAngle)||0));
  const severity=clamp(turn/.72,0,1);
  return Math.max(8.3,cruise*(1-.57*severity*severity));
}

function normalizeModel(model){
  model.rotation.y=0;
  model.updateMatrixWorld(true);
  const box0=new THREE.Box3().setFromObject(model);
  const size=new THREE.Vector3();
  box0.getSize(size);
  const scale=MODEL_TARGET_LENGTH_M/Math.max(.001,size.z);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);
  const center=new THREE.Vector3();
  box.getCenter(center);
  model.position.x-=center.x;
  model.position.z-=center.z;
  model.position.y-=box.min.y;
  model.updateMatrixWorld(true);
}

function tuneTrafficMaterials(root){
  const tuned=new WeakSet();
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    obj.castShadow=false;
    obj.receiveShadow=true;
    const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    for(const material of materials){
      if(!material||tuned.has(material))continue;
      tuned.add(material);
      material.dithering=true;
      if('envMapIntensity' in material){
        material.envMapIntensity=Math.max(1.25,Number(material.envMapIntensity)||1.25);
      }
      material.needsUpdate=true;
    }
  });
}

function makeContactShadow(){
  const material=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.20,depthWrite:false,depthTest:true,toneMapped:false});
  const mesh=new THREE.Mesh(new THREE.CircleGeometry(1.55,20),material);
  mesh.name='civil-traffic-contact-shadow';mesh.rotation.x=-Math.PI/2;mesh.scale.set(1.05,1.62,1);mesh.position.y=.028;mesh.renderOrder=2;return mesh;
}

function makeTrafficLensGlowMaterial({sourceMaterial,filter='white',tint=0xffffff,tintMix=.8,uvRegion=null}){
  if(!sourceMaterial?.map)return null;
  const uvMin=uvRegion?.min||[0,0],uvMax=uvRegion?.max||[1,1],uvFeather=uvRegion?.feather||[.004,.004];
  return new THREE.ShaderMaterial({uniforms:{uMap:{value:sourceMaterial.map},uOpacity:{value:0},uTint:{value:new THREE.Color(tint)},uFilterRed:{value:filter==='red'?1:0},uTintMix:{value:clamp(Number(tintMix)||0,0,1)},uUseUvRegion:{value:uvRegion?1:0},uUvMin:{value:new THREE.Vector2(uvMin[0],uvMin[1])},uUvMax:{value:new THREE.Vector2(uvMax[0],uvMax[1])},uUvFeather:{value:new THREE.Vector2(uvFeather[0],uvFeather[1])}},transparent:true,depthWrite:false,depthTest:true,toneMapped:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform sampler2D uMap;uniform float uOpacity;uniform vec3 uTint;uniform float uFilterRed;uniform float uTintMix;uniform float uUseUvRegion;uniform vec2 uUvMin;uniform vec2 uUvMax;uniform vec2 uUvFeather;varying vec2 vUv;void main(){vec3 rawTex=texture2D(uMap,vUv).rgb;float lum=dot(rawTex,vec3(0.2126,0.7152,0.0722));float maxc=max(rawTex.r,max(rawTex.g,rawTex.b));float minc=min(rawTex.r,min(rawTex.g,rawTex.b));float spread=maxc-minc;float redRatioG=rawTex.g/max(rawTex.r,0.001);float redRatioB=rawTex.b/max(rawTex.r,0.001);float redDominance=rawTex.r-max(rawTex.g,rawTex.b);float redMask=smoothstep(0.30,0.44,rawTex.r)*(1.0-smoothstep(0.24,0.32,redRatioG))*(1.0-smoothstep(0.27,0.36,redRatioB))*smoothstep(0.14,0.24,redDominance);float whiteMask=smoothstep(0.12,0.32,lum)*(1.0-smoothstep(0.38,0.70,spread));float filterMask=mix(whiteMask,redMask,uFilterRed);float uvMask=1.0;if(uUseUvRegion>0.5){float uEnter=smoothstep(uUvMin.x-uUvFeather.x,uUvMin.x+uUvFeather.x,vUv.x);float uExit=1.0-smoothstep(uUvMax.x-uUvFeather.x,uUvMax.x+uUvFeather.x,vUv.x);float vEnter=smoothstep(uUvMin.y-uUvFeather.y,uUvMin.y+uUvFeather.y,vUv.y);float vExit=1.0-smoothstep(uUvMax.y-uUvFeather.y,uUvMax.y+uUvFeather.y,vUv.y);uvMask=uEnter*uExit*vEnter*vExit;}float alpha=uOpacity*filterMask*uvMask;if(alpha<0.01)discard;vec3 litColor=mix(rawTex,uTint,clamp(uTintMix,0.0,1.0));gl_FragColor=vec4(litColor*filterMask,alpha);}`});
}
function registerTrafficLensGlow({sourceMesh,filter,tint,tintMix=.8,uvRegion=null}){if(!sourceMesh?.isMesh||!sourceMesh.material?.map)return null;const material=makeTrafficLensGlowMaterial({sourceMaterial:sourceMesh.material,filter,tint,tintMix,uvRegion});if(!material)return null;const mesh=new THREE.Mesh(sourceMesh.geometry,material);mesh.name=`traffic-authored-${sourceMesh.name}-${filter}`;mesh.position.copy(sourceMesh.position);mesh.quaternion.copy(sourceMesh.quaternion);mesh.scale.copy(sourceMesh.scale);mesh.renderOrder=(sourceMesh.renderOrder||0)+2;mesh.visible=false;mesh.frustumCulled=sourceMesh.frustumCulled;mesh.castShadow=false;mesh.receiveShadow=false;sourceMesh.parent?.add(mesh);return{mesh,material,filter};}
function buildAuthoredTrafficLensGlows(model){const front=[],rear=[];const frontWhite=registerTrafficLensGlow({sourceMesh:model.getObjectByName('Object_7'),filter:'white',tint:0xf8fbff,tintMix:.82});if(frontWhite)front.push(frontWhite);const rearInnerRed=registerTrafficLensGlow({sourceMesh:model.getObjectByName('Object_46'),filter:'red',tint:0xff2a2e,tintMix:.42});if(rearInnerRed)rear.push(rearInnerRed);const rearOuterRed=registerTrafficLensGlow({sourceMesh:model.getObjectByName('Object_33'),filter:'red',tint:0xff2a2e,tintMix:.42});if(rearOuterRed)rear.push(rearOuterRed);return{front,rear};}
function buildGenericTrafficLensGlows(model){const front=[],rear=[],optics=[];model.traverse(obj=>{if(obj?.isMesh&&/optics/i.test(obj.name||'')&&!/^traffic-authored-/.test(obj.name||''))optics.push(obj);});for(const obj of optics){const f=registerTrafficLensGlow({sourceMesh:obj,filter:'white',tint:0xf8fbff,tintMix:.82});const r=registerTrafficLensGlow({sourceMesh:obj,filter:'red',tint:0xff2a2e,tintMix:.42});if(f)front.push(f);if(r)rear.push(r);}return{front,rear};}
function setTexturedGlow(layers,opacity){const visible=opacity>.001;for(const layer of layers){layer.material.uniforms.uOpacity.value=visible?clamp(opacity,0,1):0;layer.mesh.visible=visible;}}
function buildPlayerStyleTrafficHeadlights(root){const headlightBeams=[];for(const side of[-1,1]){const target=new THREE.Object3D();target.position.set(side*.45,.15,30);root.add(target);const beam=new THREE.SpotLight(0xf8fbff,0,72,.36,.68,1.0);beam.position.set(side*.68,.66,2.25);beam.target=target;beam.castShadow=false;beam.visible=false;root.add(beam);headlightBeams.push({light:beam,target});}return headlightBeams;}
function buildGenericTrafficHeadlights(root,model){model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=new THREE.Vector3();box.getSize(size);const frontZ=box.max.z-.08,lampY=box.min.y+size.y*.38,lampX=Math.min(.78,Math.max(.48,size.x*.30)),headlightBeams=[];for(const side of[-1,1]){const target=new THREE.Object3D();target.position.set(side*lampX*.66,Math.max(.12,lampY-.50),frontZ+30);root.add(target);const beam=new THREE.SpotLight(0xf8fbff,0,72,.36,.68,1.0);beam.position.set(side*lampX,lampY,frontZ);beam.target=target;beam.castShadow=false;beam.visible=false;root.add(beam);headlightBeams.push({light:beam,target});}return headlightBeams;}
function updateTrafficLights(agent){const night=clamp(Number(agent.getHeadlightLevel?.())||0,0,1),nightOn=night>.06;setTexturedGlow(agent.lensGlows.front,nightOn?(.45+night*.28):0);setTexturedGlow(agent.lensGlows.rear,nightOn?(.16+night*.18):0);for(const beam of agent.headlightBeams){beam.light.visible=nightOn;beam.light.intensity=nightOn?night*95:0;beam.light.distance=65+night*15;}}
function bindWheelSpin(root){const specs=[{name:'wheel.029_56',sign:-1},{name:'wheel.031_62',sign:-1},{name:'wheel.035_68',sign:1},{name:'wheel.039_74',sign:1}],controllers=[],box=new THREE.Box3(),centerWorld=new THREE.Vector3();for(const spec of specs){const node=root.getObjectByName(spec.name),parent=node?.parent;if(!node||!parent)continue;root.updateMatrixWorld(true);box.setFromObject(node);box.getCenter(centerWorld);parent.updateWorldMatrix(true,false);const centerLocal=centerWorld.clone();parent.worldToLocal(centerLocal);const pivot=new THREE.Object3D();pivot.name=`traffic_spin_${spec.name}`;pivot.position.copy(centerLocal);pivot.quaternion.copy(node.quaternion);parent.add(pivot);pivot.updateWorldMatrix(true,false);pivot.attach(node);controllers.push({pivot,bind:pivot.quaternion.clone(),sign:spec.sign});}return controllers;}
function bindGenericPackWheelSpin(root){const controllers=[];root.traverse(node=>{if(/^traffic-pack-wheel-/.test(node?.name||''))controllers.push({pivot:node,bind:node.quaternion.clone(),sign:1});});return controllers;}
function applyWheelSpin(agent,dt){if(!agent.wheels.length)return;agent.wheelSpin+=Math.abs(agent.speed)*Math.max(.001,Math.min(.05,dt))/.35;if(agent.wheelSpin>Math.PI*2048)agent.wheelSpin%=Math.PI*2;for(const wheel of agent.wheels){agent.spinQuat.setFromAxisAngle(agent.spinAxis,agent.wheelSpin*wheel.sign*agent.direction);wheel.pivot.quaternion.copy(wheel.bind).multiply(agent.spinQuat);}}
function setAgentPose(agent,frame,worldOffset){const lateral=agent.laneOffset,x=frame.px+frame.nx*lateral,z=frame.pz+frame.nz*lateral,y=frame.y+Math.tan(Number(frame.roll)||0)*lateral+BODY_CLEARANCE_M;agent.root.position.set(x-(Number(worldOffset?.x)||0),y,z-(Number(worldOffset?.z)||0));agent.forward.set(Math.sin(frame.angle),Math.tan(Number(frame.pitch)||0),Math.cos(frame.angle)).multiplyScalar(agent.direction).normalize();agent.left.set(Number(frame.nx)||0,Math.tan(Number(frame.roll)||0),Number(frame.nz)||0).normalize();agent.right.copy(agent.left).multiplyScalar(-agent.direction).normalize();agent.up.crossVectors(agent.forward,agent.right).normalize();agent.right.crossVectors(agent.up,agent.forward).normalize();agent.basis.makeBasis(agent.right,agent.up,agent.forward);agent.root.quaternion.setFromRotationMatrix(agent.basis);agent.root.visible=true;}

export function createCivilTrafficSystem({car,getState,getRouteLength,getWorldOffset,nearestRouteForVehicle,roadProfileFrameAtCum,getHeadlightLevel,random=Math.random}={}){
  const sceneRoot=car?.parent||null,trafficGroup=new THREE.Group();trafficGroup.name='civil-traffic-root';sceneRoot?.add?.(trafficGroup);
  let elapsed=0,nextSpawnAt=civilTrafficFirstSpawnSec(random());const templates=new Map();let poolLoadPromise=null,sonataLoadError=null,packLoadError=null,packReady=false,lastSpawnVehicleId=null,lastPlayerCum=null,lastRouteLength=0,spawnedTotal=0,spawnedOncoming=0,spawnedAhead=0;const spawnedByVehicle={},agents=[];
  async function loadSonataTemplate(loader){try{const url=new URL('./assets/2006_hyundai_sonata.glb',import.meta.url).href,gltf=await loader.loadAsync(url),root=gltf.scene||gltf.scenes?.[0];if(!root)throw new Error('Traffic Sonata GLB sans scène');root.name='civil-traffic-sonata-template';normalizeModel(root);tuneTrafficMaterials(root);root.userData.trafficVehicleId='sonata';templates.set('sonata',root);}catch(error){sonataLoadError=error;console.warn('Civil traffic Sonata unavailable',error);}}
  async function loadGenericPassengerPack(loader){let gltf=null,lastError=null;for(const url of[GENERIC_PASSENGER_PACK_URL,GENERIC_PASSENGER_PACK_FALLBACK_URL]){try{gltf=await loader.loadAsync(url);break;}catch(error){lastError=error;}}if(!gltf){packLoadError=lastError||new Error('Generic passenger-car pack unavailable');console.warn('Civil traffic variety pack unavailable; Sonata fallback kept.',packLoadError);return;}const built=buildGenericPassengerTemplates(gltf.scene||gltf.scenes?.[0]);for(const[id,template]of built){tuneTrafficMaterials(template);templates.set(id,template);}packReady=built.size===CIVIL_TRAFFIC_VEHICLE_POOL.filter(entry=>entry.source==='generic-pack').length;if(!packReady){packLoadError=new Error(`Generic passenger pack incomplete: ${built.size} templates`);console.warn(packLoadError);}}
  async function ensureTemplate(){if(poolLoadPromise)return poolLoadPromise;poolLoadPromise=(async()=>{const{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),loader=new GLTFLoader();await Promise.allSettled([loadSonataTemplate(loader),loadGenericPassengerPack(loader)]);return templates;})();return poolLoadPromise;}
  function removeAgent(agent){const index=agents.indexOf(agent);if(index>=0)agents.splice(index,1);trafficGroup.remove(agent.root);}
  function clear(){while(agents.length)removeAgent(agents[agents.length-1]);}
  function makeAgent(plan,requestedVehicleId=null){if(!templates.size||!plan)return null;const availableIds=Array.from(templates.keys()),vehicleId=requestedVehicleId&&templates.has(requestedVehicleId)?requestedVehicleId:civilTrafficChooseVehicleId(availableIds,random(),lastSpawnVehicleId),template=templates.get(vehicleId);if(!template)return null;const entry=civilTrafficPoolEntry(vehicleId),root=new THREE.Group();root.name=`civil-traffic-${vehicleId}-${plan.kind}-${spawnedTotal+1}`;const model=template.clone(true);model.name=`civil-traffic-${vehicleId}`;root.add(model);root.add(makeContactShadow());const generic=entry?.source==='generic-pack',lensGlows=generic?buildGenericTrafficLensGlows(model):buildAuthoredTrafficLensGlows(model),headlightBeams=generic?buildGenericTrafficHeadlights(root,model):buildPlayerStyleTrafficHeadlights(root),wheels=generic?bindGenericPackWheelSpin(model):bindWheelSpin(model);trafficGroup.add(root);const agent={root,model,lensGlows,headlightBeams,wheels,vehicleId,kind:plan.kind,direction:plan.direction,cum:plan.cum,laneOffset:plan.laneOffset,cruiseSpeed:plan.cruiseSpeed,speed:plan.cruiseSpeed*.82,wheelSpin:0,getHeadlightLevel,spinAxis:new THREE.Vector3(1,0,0),spinQuat:new THREE.Quaternion(),forward:new THREE.Vector3(),left:new THREE.Vector3(),right:new THREE.Vector3(),up:new THREE.Vector3(),basis:new THREE.Matrix4()};agents.push(agent);lastSpawnVehicleId=vehicleId;spawnedByVehicle[vehicleId]=(spawnedByVehicle[vehicleId]||0)+1;spawnedTotal++;if(plan.kind==='oncoming')spawnedOncoming++;else spawnedAhead++;return agent;}
  function planSpawn(kind,playerCum){return civilTrafficSpawnPlan({playerCum,routeLength:getRouteLength?.()||0,kind,distanceRandom:random(),speedRandom:random()});}
  function forceSpawn(kind='oncoming',vehicleId=null){const state=getState?.()||{},nr=nearestRouteForVehicle?.(Number(state.absX)||0,Number(state.absZ)||0);if(!nr||!templates.size||vehicleId&&!templates.has(vehicleId)||agents.length>=CIVIL_TRAFFIC_MAX_ACTIVE)return false;const plan=planSpawn(kind==='ahead'?'ahead':'oncoming',Number(nr.cum)||0);return plan?!!makeAgent(plan,vehicleId):false;}
  function maybeSpawn(playerCum){if(elapsed<nextSpawnAt||agents.length>=CIVIL_TRAFFIC_MAX_ACTIVE)return;if(!templates.size){ensureTemplate();nextSpawnAt=elapsed+2.5;return;}const kind=random()<.62?'oncoming':'ahead',plan=planSpawn(kind,playerCum);if(plan)makeAgent(plan);nextSpawnAt=elapsed+civilTrafficCooldownSec(random());}
  function updateAgent(agent,dt,playerCum,worldOffset){const frame=roadProfileFrameAtCum?.(agent.cum);if(!frame){agent.root.visible=false;return true;}const lookCum=clamp(agent.cum+agent.direction*36,0,Math.max(0,(getRouteLength?.()||0)-1)),look=roadProfileFrameAtCum?.(lookCum)||frame,lookAngle=(Number(look.angle)||0)+(agent.direction<0?Math.PI:0),currentAngle=(Number(frame.angle)||0)+(agent.direction<0?Math.PI:0);let targetSpeed=civilTrafficCurveSpeed(agent.cruiseSpeed,currentAngle,lookAngle);for(const other of agents){if(other===agent||other.direction!==agent.direction)continue;const gap=(other.cum-agent.cum)*agent.direction;if(gap>0&&gap<42)targetSpeed=Math.min(targetSpeed,Math.max(5,other.speed-(42-gap)*.18));}const accel=targetSpeed>agent.speed?1.25:3.0,maxDelta=accel*Math.max(.001,Math.min(.05,dt));agent.speed+=clamp(targetSpeed-agent.speed,-maxDelta,maxDelta);agent.cum+=agent.direction*agent.speed*dt;setAgentPose(agent,frame,worldOffset);applyWheelSpin(agent,dt);updateTrafficLights(agent);const relative=agent.cum-playerCum,routeLength=Math.max(0,getRouteLength?.()||0);if(agent.cum<=ROUTE_END_MARGIN_M||agent.cum>=routeLength-ROUTE_END_MARGIN_M)return false;if(relative<-DESPAWN_BEHIND_M||relative>DESPAWN_AHEAD_M)return false;return true;}
  function update(dt){try{const safeDt=Math.max(.001,Math.min(.05,Number(dt)||1/60));elapsed+=safeDt;const state=getState?.()||{},routeLength=Math.max(0,Number(getRouteLength?.())||0);if(routeLength<120)return;const nr=nearestRouteForVehicle?.(Number(state.absX)||0,Number(state.absZ)||0);if(!nr||!Number.isFinite(Number(nr.cum)))return;const playerCum=Number(nr.cum)||0;if(lastRouteLength&&Math.abs(routeLength-lastRouteLength)>1){clear();nextSpawnAt=elapsed+civilTrafficFirstSpawnSec(random());}if(lastPlayerCum!==null&&Math.abs(playerCum-lastPlayerCum)>TELEPORT_RESET_M){clear();nextSpawnAt=elapsed+civilTrafficFirstSpawnSec(random());}lastRouteLength=routeLength;lastPlayerCum=playerCum;if(elapsed>4&&!poolLoadPromise)ensureTemplate();maybeSpawn(playerCum);const offset=getWorldOffset?.()||{x:0,z:0};for(let i=agents.length-1;i>=0;i--)if(!updateAgent(agents[i],safeDt,playerCum,offset))removeAgent(agents[i]);}catch(error){console.warn('Civil traffic frame skipped',error);}}
  function diagnostics(){return{enabled:true,mode:'traffic-r7-variety-pool',templateReady:templates.has('sonata'),poolReady:templates.size>1,packReady,availableVehicles:Array.from(templates.keys()),configuredPool:CIVIL_TRAFFIC_VEHICLE_POOL.map(entry=>entry.id),sonataLoadError:sonataLoadError?String(sonataLoadError?.message||sonataLoadError):null,packLoadError:packLoadError?String(packLoadError?.message||packLoadError):null,active:agents.length,maxActive:CIVIL_TRAFFIC_MAX_ACTIVE,spawnedTotal,spawnedOncoming,spawnedAhead,spawnedByVehicle:{...spawnedByVehicle},nextSpawnInSec:Number(Math.max(0,nextSpawnAt-elapsed).toFixed(1)),rightHandTraffic:true,authoredTexturedLamps:true,playerStyleHeadlightBeams:true,varietyPool:true,pointLights:false,rearRoadLightSpill:false,roadLightSpill:'player-style-headlights-only',agents:agents.map(agent=>({vehicleId:agent.vehicleId,kind:agent.kind,direction:agent.direction,cum:Number(agent.cum.toFixed(1)),speedKmh:Number((agent.speed*3.6).toFixed(1)),laneOffset:Number(agent.laneOffset.toFixed(2)),texturedFrontLayers:agent.lensGlows.front.length,texturedRearLayers:agent.lensGlows.rear.length,visible:agent.root.visible}))};}
  if(typeof globalThis!=='undefined'){globalThis.WorldDriveTraffic=diagnostics;globalThis.WorldDriveTrafficPool=()=>({configured:CIVIL_TRAFFIC_VEHICLE_POOL.map(entry=>entry.id),available:Array.from(templates.keys()),packReady});globalThis.WorldDriveTrafficSpawn=(kind,vehicleId)=>forceSpawn(kind,vehicleId);}
  return Object.freeze({update,clear,ensureTemplate,forceSpawn,diagnostics,group:trafficGroup});
}
