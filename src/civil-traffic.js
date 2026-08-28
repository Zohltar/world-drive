import * as THREE from 'three';

// World Drive Traffic R4 — deliberately sparse, presentation-only civil traffic.
//
// The player physics remain authoritative and untouched. At most two lightweight
// traffic agents follow the engineered active road profile. R4 keeps the corrected
// right-hand lane convention and authored textured Sonata lamp glows, but removes
// all traffic scene lights so civilian lamps no longer paint white/red pools on road.

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

// R2+: verified against the rendered road in-game. Positive lateral offset is
// the player's right-hand lane; negative is the player's left-hand/oncoming lane.
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
  const material=new THREE.MeshBasicMaterial({
    color:0x000000,
    transparent:true,
    opacity:.20,
    depthWrite:false,
    depthTest:true,
    toneMapped:false
  });
  const mesh=new THREE.Mesh(new THREE.CircleGeometry(1.55,20),material);
  mesh.name='civil-traffic-contact-shadow';
  mesh.rotation.x=-Math.PI/2;
  mesh.scale.set(1.05,1.62,1);
  mesh.position.y=.028;
  mesh.renderOrder=2;
  return mesh;
}

// Same texture-driven idea as the authored Sonata lighting system. The traffic
// version only needs white headlamps and red running lamps for now. The overlay
// reuses the exact authored lens geometry/UVs; no generic visible lamp primitives.
function makeTrafficLensGlowMaterial({sourceMaterial,filter='white',tint=0xffffff,tintMix=.8,uvRegion=null}){
  if(!sourceMaterial?.map)return null;
  const uvMin=uvRegion?.min||[0,0];
  const uvMax=uvRegion?.max||[1,1];
  const uvFeather=uvRegion?.feather||[.004,.004];
  return new THREE.ShaderMaterial({
    uniforms:{
      uMap:{value:sourceMaterial.map},
      uOpacity:{value:0},
      uTint:{value:new THREE.Color(tint)},
      uFilterRed:{value:filter==='red'?1:0},
      uTintMix:{value:clamp(Number(tintMix)||0,0,1)},
      uUseUvRegion:{value:uvRegion?1:0},
      uUvMin:{value:new THREE.Vector2(uvMin[0],uvMin[1])},
      uUvMax:{value:new THREE.Vector2(uvMax[0],uvMax[1])},
      uUvFeather:{value:new THREE.Vector2(uvFeather[0],uvFeather[1])}
    },
    transparent:true,
    depthWrite:false,
    depthTest:true,
    toneMapped:false,
    side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,
    polygonOffset:true,
    polygonOffsetFactor:-2,
    polygonOffsetUnits:-2,
    vertexShader:`
      varying vec2 vUv;
      void main(){
        vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform vec3 uTint;
      uniform float uFilterRed;
      uniform float uTintMix;
      uniform float uUseUvRegion;
      uniform vec2 uUvMin;
      uniform vec2 uUvMax;
      uniform vec2 uUvFeather;
      varying vec2 vUv;

      void main(){
        vec3 rawTex=texture2D(uMap,vUv).rgb;
        float lum=dot(rawTex,vec3(0.2126,0.7152,0.0722));
        float maxc=max(rawTex.r,max(rawTex.g,rawTex.b));
        float minc=min(rawTex.r,min(rawTex.g,rawTex.b));
        float spread=maxc-minc;

        float redRatioG=rawTex.g/max(rawTex.r,0.001);
        float redRatioB=rawTex.b/max(rawTex.r,0.001);
        float redDominance=rawTex.r-max(rawTex.g,rawTex.b);
        float redMask=smoothstep(0.30,0.44,rawTex.r)
          *(1.0-smoothstep(0.24,0.32,redRatioG))
          *(1.0-smoothstep(0.27,0.36,redRatioB))
          *smoothstep(0.14,0.24,redDominance);

        float whiteMask=smoothstep(0.12,0.32,lum)
          *(1.0-smoothstep(0.38,0.70,spread));
        float filterMask=mix(whiteMask,redMask,uFilterRed);

        float uvMask=1.0;
        if(uUseUvRegion>0.5){
          float uEnter=smoothstep(uUvMin.x-uUvFeather.x,uUvMin.x+uUvFeather.x,vUv.x);
          float uExit=1.0-smoothstep(uUvMax.x-uUvFeather.x,uUvMax.x+uUvFeather.x,vUv.x);
          float vEnter=smoothstep(uUvMin.y-uUvFeather.y,uUvMin.y+uUvFeather.y,vUv.y);
          float vExit=1.0-smoothstep(uUvMax.y-uUvFeather.y,uUvMax.y+uUvFeather.y,vUv.y);
          uvMask=uEnter*uExit*vEnter*vExit;
        }

        float alpha=uOpacity*filterMask*uvMask;
        if(alpha<0.01)discard;
        vec3 litColor=mix(rawTex,uTint,clamp(uTintMix,0.0,1.0));
        gl_FragColor=vec4(litColor*filterMask,alpha);
      }
    `
  });
}

function registerTrafficLensGlow({sourceMesh,filter,tint,tintMix=.8,uvRegion=null}){
  if(!sourceMesh?.isMesh||!sourceMesh.material?.map)return null;
  const material=makeTrafficLensGlowMaterial({sourceMaterial:sourceMesh.material,filter,tint,tintMix,uvRegion});
  if(!material)return null;
  const mesh=new THREE.Mesh(sourceMesh.geometry,material);
  mesh.name=`traffic-authored-${sourceMesh.name}-${filter}`;
  mesh.position.copy(sourceMesh.position);
  mesh.quaternion.copy(sourceMesh.quaternion);
  mesh.scale.copy(sourceMesh.scale);
  mesh.renderOrder=(sourceMesh.renderOrder||0)+2;
  mesh.visible=false;
  mesh.frustumCulled=sourceMesh.frustumCulled;
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  sourceMesh.parent?.add(mesh);
  return {mesh,material,filter};
}

function buildAuthoredTrafficLensGlows(model){
  const front=[];
  const rear=[];
  const frontLens=model.getObjectByName('Object_7');
  const rearInner=model.getObjectByName('Object_46');
  const rearOuter=model.getObjectByName('Object_33');

  const frontWhite=registerTrafficLensGlow({
    sourceMesh:frontLens,
    filter:'white',
    tint:0xf8fbff,
    tintMix:.82
  });
  if(frontWhite)front.push(frontWhite);

  const rearInnerRed=registerTrafficLensGlow({
    sourceMesh:rearInner,
    filter:'red',
    tint:0xff2a2e,
    tintMix:.42
  });
  if(rearInnerRed)rear.push(rearInnerRed);

  const rearOuterRed=registerTrafficLensGlow({
    sourceMesh:rearOuter,
    filter:'red',
    tint:0xff2a2e,
    tintMix:.42
  });
  if(rearOuterRed)rear.push(rearOuterRed);

  return {front,rear};
}

function setTexturedGlow(layers,opacity){
  const visible=opacity>.001;
  for(const layer of layers){
    layer.material.uniforms.uOpacity.value=visible?clamp(opacity,0,1):0;
    layer.mesh.visible=visible;
  }
}

function updateTrafficLights(agent){
  const level=clamp(Number(agent.getHeadlightLevel?.())||0,0,1);
  const night=level>.08;

  // R4: lamps are visible only through authored textured lens overlays. Civil
  // traffic intentionally contributes no PointLight/SpotLight road spill.
  setTexturedGlow(agent.lensGlows.front,night?.42+level*.30:0);
  setTexturedGlow(agent.lensGlows.rear,night?.13+level*.20:0);
}

function bindWheelSpin(root){
  const specs=[
    {name:'wheel.029_56',sign:-1},
    {name:'wheel.031_62',sign:-1},
    {name:'wheel.035_68',sign:1},
    {name:'wheel.039_74',sign:1}
  ];
  const controllers=[];
  const box=new THREE.Box3();
  const centerWorld=new THREE.Vector3();
  for(const spec of specs){
    const node=root.getObjectByName(spec.name);
    const parent=node?.parent;
    if(!node||!parent)continue;
    root.updateMatrixWorld(true);
    box.setFromObject(node);
    box.getCenter(centerWorld);
    parent.updateWorldMatrix(true,false);
    const centerLocal=centerWorld.clone();
    parent.worldToLocal(centerLocal);
    const pivot=new THREE.Object3D();
    pivot.name=`traffic_spin_${spec.name}`;
    pivot.position.copy(centerLocal);
    pivot.quaternion.copy(node.quaternion);
    parent.add(pivot);
    pivot.updateWorldMatrix(true,false);
    pivot.attach(node);
    controllers.push({pivot,bind:pivot.quaternion.clone(),sign:spec.sign});
  }
  return controllers;
}

function applyWheelSpin(agent,dt){
  if(!agent.wheels.length)return;
  agent.wheelSpin+=Math.abs(agent.speed)*Math.max(.001,Math.min(.05,dt))/.35;
  if(agent.wheelSpin>Math.PI*2048)agent.wheelSpin%=Math.PI*2;
  const axis=agent.spinAxis;
  for(const wheel of agent.wheels){
    agent.spinQuat.setFromAxisAngle(axis,agent.wheelSpin*wheel.sign*agent.direction);
    wheel.pivot.quaternion.copy(wheel.bind).multiply(agent.spinQuat);
  }
}

function setAgentPose(agent,frame,worldOffset){
  const lateral=agent.laneOffset;
  const x=frame.px+frame.nx*lateral;
  const z=frame.pz+frame.nz*lateral;
  const y=frame.y+Math.tan(Number(frame.roll)||0)*lateral+BODY_CLEARANCE_M;

  agent.root.position.set(
    x-(Number(worldOffset?.x)||0),
    y,
    z-(Number(worldOffset?.z)||0)
  );

  agent.forward.set(
    Math.sin(frame.angle),
    Math.tan(Number(frame.pitch)||0),
    Math.cos(frame.angle)
  ).multiplyScalar(agent.direction).normalize();

  agent.left.set(
    Number(frame.nx)||0,
    Math.tan(Number(frame.roll)||0),
    Number(frame.nz)||0
  ).normalize();

  agent.right.copy(agent.left).multiplyScalar(-agent.direction).normalize();
  agent.up.crossVectors(agent.forward,agent.right).normalize();
  agent.right.crossVectors(agent.up,agent.forward).normalize();
  agent.basis.makeBasis(agent.right,agent.up,agent.forward);
  agent.root.quaternion.setFromRotationMatrix(agent.basis);
  agent.root.visible=true;
}

export function createCivilTrafficSystem({
  car,
  getState,
  getRouteLength,
  getWorldOffset,
  nearestRouteForVehicle,
  roadProfileFrameAtCum,
  getHeadlightLevel,
  random=Math.random
}={}){
  const sceneRoot=car?.parent||null;
  const trafficGroup=new THREE.Group();
  trafficGroup.name='civil-traffic-root';
  sceneRoot?.add?.(trafficGroup);

  let elapsed=0;
  let nextSpawnAt=civilTrafficFirstSpawnSec(random());
  let template=null;
  let loadPromise=null;
  let loadError=null;
  let lastPlayerCum=null;
  let lastRouteLength=0;
  let spawnedTotal=0;
  let spawnedOncoming=0;
  let spawnedAhead=0;
  const agents=[];

  async function ensureTemplate(){
    if(template||loadError)return template;
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      try{
        const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
        const loader=new GLTFLoader();
        const url=new URL('./assets/2006_hyundai_sonata.glb',import.meta.url).href;
        const gltf=await loader.loadAsync(url);
        const root=gltf.scene||gltf.scenes?.[0];
        if(!root)throw new Error('Traffic Sonata GLB sans scène');
        root.name='civil-traffic-sonata-template';
        normalizeModel(root);
        tuneTrafficMaterials(root);
        template=root;
        return template;
      }catch(error){
        loadError=error;
        console.warn('Civil traffic Sonata unavailable',error);
        return null;
      }
    })();
    return loadPromise;
  }

  function removeAgent(agent){
    const index=agents.indexOf(agent);
    if(index>=0)agents.splice(index,1);
    trafficGroup.remove(agent.root);
  }

  function clear(){
    while(agents.length)removeAgent(agents[agents.length-1]);
  }

  function makeAgent(plan){
    if(!template||!plan)return null;
    const root=new THREE.Group();
    root.name=`civil-traffic-${plan.kind}-${spawnedTotal+1}`;
    const model=template.clone(true);
    model.name='civil-traffic-sonata';
    root.add(model);
    root.add(makeContactShadow());

    const lensGlows=buildAuthoredTrafficLensGlows(model);
    trafficGroup.add(root);

    const wheels=bindWheelSpin(model);
    const agent={
      root,
      model,
      lensGlows,
      wheels,
      kind:plan.kind,
      direction:plan.direction,
      cum:plan.cum,
      laneOffset:plan.laneOffset,
      cruiseSpeed:plan.cruiseSpeed,
      speed:plan.cruiseSpeed*.82,
      wheelSpin:0,
      getHeadlightLevel,
      spinAxis:new THREE.Vector3(1,0,0),
      spinQuat:new THREE.Quaternion(),
      forward:new THREE.Vector3(),
      left:new THREE.Vector3(),
      right:new THREE.Vector3(),
      up:new THREE.Vector3(),
      basis:new THREE.Matrix4()
    };
    agents.push(agent);
    spawnedTotal++;
    if(plan.kind==='oncoming')spawnedOncoming++;else spawnedAhead++;
    return agent;
  }

  function planSpawn(kind,playerCum){
    return civilTrafficSpawnPlan({
      playerCum,
      routeLength:getRouteLength?.()||0,
      kind,
      distanceRandom:random(),
      speedRandom:random()
    });
  }

  function forceSpawn(kind='oncoming'){
    const state=getState?.()||{};
    const nr=nearestRouteForVehicle?.(Number(state.absX)||0,Number(state.absZ)||0);
    if(!nr||!template)return false;
    if(agents.length>=CIVIL_TRAFFIC_MAX_ACTIVE)return false;
    const plan=planSpawn(kind==='ahead'?'ahead':'oncoming',Number(nr.cum)||0);
    if(!plan)return false;
    return !!makeAgent(plan);
  }

  function maybeSpawn(playerCum){
    if(elapsed<nextSpawnAt||agents.length>=CIVIL_TRAFFIC_MAX_ACTIVE)return;
    if(!template){
      ensureTemplate();
      nextSpawnAt=elapsed+2.5;
      return;
    }
    const kind=random()<.62?'oncoming':'ahead';
    const plan=planSpawn(kind,playerCum);
    if(plan)makeAgent(plan);
    nextSpawnAt=elapsed+civilTrafficCooldownSec(random());
  }

  function updateAgent(agent,dt,playerCum,worldOffset){
    const frame=roadProfileFrameAtCum?.(agent.cum);
    if(!frame){agent.root.visible=false;return true;}
    const lookCum=clamp(
      agent.cum+agent.direction*36,
      0,
      Math.max(0,(getRouteLength?.()||0)-1)
    );
    const look=roadProfileFrameAtCum?.(lookCum)||frame;
    const lookAngle=(Number(look.angle)||0)+(agent.direction<0?Math.PI:0);
    const currentAngle=(Number(frame.angle)||0)+(agent.direction<0?Math.PI:0);
    let targetSpeed=civilTrafficCurveSpeed(agent.cruiseSpeed,currentAngle,lookAngle);

    for(const other of agents){
      if(other===agent||other.direction!==agent.direction)continue;
      const gap=(other.cum-agent.cum)*agent.direction;
      if(gap>0&&gap<42){
        targetSpeed=Math.min(targetSpeed,Math.max(5,other.speed-(42-gap)*.18));
      }
    }

    const accel=targetSpeed>agent.speed?1.25:3.0;
    const maxDelta=accel*Math.max(.001,Math.min(.05,dt));
    agent.speed+=clamp(targetSpeed-agent.speed,-maxDelta,maxDelta);
    agent.cum+=agent.direction*agent.speed*dt;

    setAgentPose(agent,frame,worldOffset);
    applyWheelSpin(agent,dt);
    updateTrafficLights(agent);

    const relative=agent.cum-playerCum;
    const routeLength=Math.max(0,getRouteLength?.()||0);
    if(agent.cum<=ROUTE_END_MARGIN_M||agent.cum>=routeLength-ROUTE_END_MARGIN_M)return false;
    if(relative<-DESPAWN_BEHIND_M||relative>DESPAWN_AHEAD_M)return false;
    return true;
  }

  function update(dt){
    try{
      const safeDt=Math.max(.001,Math.min(.05,Number(dt)||1/60));
      elapsed+=safeDt;
      const state=getState?.()||{};
      const routeLength=Math.max(0,Number(getRouteLength?.())||0);
      if(routeLength<120)return;
      const nr=nearestRouteForVehicle?.(Number(state.absX)||0,Number(state.absZ)||0);
      if(!nr||!Number.isFinite(Number(nr.cum)))return;
      const playerCum=Number(nr.cum)||0;

      if(lastRouteLength&&Math.abs(routeLength-lastRouteLength)>1){
        clear();
        nextSpawnAt=elapsed+civilTrafficFirstSpawnSec(random());
      }
      if(lastPlayerCum!==null&&Math.abs(playerCum-lastPlayerCum)>TELEPORT_RESET_M){
        clear();
        nextSpawnAt=elapsed+civilTrafficFirstSpawnSec(random());
      }
      lastRouteLength=routeLength;
      lastPlayerCum=playerCum;

      if(elapsed>4&&!template&&!loadPromise&&!loadError)ensureTemplate();
      maybeSpawn(playerCum);
      const offset=getWorldOffset?.()||{x:0,z:0};
      for(let i=agents.length-1;i>=0;i--){
        if(!updateAgent(agents[i],safeDt,playerCum,offset))removeAgent(agents[i]);
      }
    }catch(error){
      console.warn('Civil traffic frame skipped',error);
    }
  }

  function diagnostics(){
    return {
      enabled:true,
      mode:'traffic-r4-authored-lamps-no-road-spill',
      templateReady:!!template,
      loadError:loadError?String(loadError?.message||loadError):null,
      active:agents.length,
      maxActive:CIVIL_TRAFFIC_MAX_ACTIVE,
      spawnedTotal,
      spawnedOncoming,
      spawnedAhead,
      nextSpawnInSec:Number(Math.max(0,nextSpawnAt-elapsed).toFixed(1)),
      rightHandTraffic:true,
      authoredTexturedLamps:true,
      realSceneLights:false,
      roadLightSpill:false,
      agents:agents.map(agent=>({
        kind:agent.kind,
        direction:agent.direction,
        cum:Number(agent.cum.toFixed(1)),
        speedKmh:Number((agent.speed*3.6).toFixed(1)),
        laneOffset:Number(agent.laneOffset.toFixed(2)),
        texturedFrontLayers:agent.lensGlows.front.length,
        texturedRearLayers:agent.lensGlows.rear.length,
        visible:agent.root.visible
      }))
    };
  }

  if(typeof globalThis!=='undefined'){
    globalThis.WorldDriveTraffic=diagnostics;
    globalThis.WorldDriveTrafficSpawn=kind=>forceSpawn(kind);
  }

  return Object.freeze({
    update,
    clear,
    ensureTemplate,
    forceSpawn,
    diagnostics,
    group:trafficGroup
  });
}
