export * from './civil-traffic-local.js';

import * as THREE from 'three';
import {createCivilTrafficSystem as createLocalCivilTrafficSystem} from './civil-traffic-local.js';
import {
  publishLocalCivilTrafficSnapshot,
  readCivilTrafficMultiplayerBridge
} from './civil-traffic-network-bridge.js';

// Traffic MP1 facade.
// Offline and authoritative multiplayer clients run the exact validated R7 local
// traffic engine. Non-authoritative clients stop making random traffic decisions
// and render the compact route snapshot published by the elected authority.

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const BODY_CLEARANCE_M=.035;

function sonataWheelSign(name){
  const value=String(name||'');
  if(value.includes('wheel.029_56')||value.includes('wheel.031_62'))return -1;
  return 1;
}

function collectFollowerWheelControllers(root){
  const controllers=[];
  root?.traverse?.(node=>{
    const name=String(node?.name||'');
    if(name.startsWith('traffic_spin_')){
      controllers.push({node,bind:node.quaternion.clone(),sign:sonataWheelSign(name)});
    }else if(name.startsWith('traffic-pack-wheel-')){
      controllers.push({node,bind:node.quaternion.clone(),sign:1});
    }
  });
  return controllers;
}

function setFollowerLighting(root,nightLevel){
  const night=clamp(Number(nightLevel)||0,0,1);
  const nightOn=night>.06;
  const frontOpacity=nightOn?(.45+night*.28):0;
  const rearOpacity=nightOn?(.16+night*.18):0;

  root?.traverse?.(obj=>{
    if(obj?.isSpotLight){
      obj.visible=nightOn;
      obj.intensity=nightOn?night*95:0;
      obj.distance=65+night*15;
      return;
    }
    if(!obj?.isMesh||!String(obj.name||'').startsWith('traffic-authored-'))return;
    const opacity=String(obj.name).endsWith('-red')?rearOpacity:frontOpacity;
    const uniforms=obj.material?.uniforms;
    if(uniforms?.uOpacity)uniforms.uOpacity.value=opacity;
    obj.visible=opacity>.001;
  });
}

function setFollowerPose(agent,frame,worldOffset){
  if(!frame)return false;
  const lateral=Number(agent.laneOffset)||0;
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
  return true;
}

function updateFollowerWheelSpin(agent,dt){
  if(!agent.wheels.length)return;
  agent.wheelSpin+=Math.abs(agent.speed)*Math.max(.001,Math.min(.05,dt))/.35;
  if(agent.wheelSpin>Math.PI*2048)agent.wheelSpin%=Math.PI*2;
  for(const wheel of agent.wheels){
    agent.spinQuat.setFromAxisAngle(agent.spinAxis,agent.wheelSpin*wheel.sign*agent.direction);
    wheel.node.quaternion.copy(wheel.bind).multiply(agent.spinQuat);
  }
}

function snapshotSignature(snapshot){
  return (snapshot?.agents||[])
    .map(agent=>`${agent.id}:${agent.vehicleId}:${agent.direction}`)
    .join('|');
}

export function createCivilTrafficSystem(args={}){
  let replicaVisualFactory=false;
  const local=createLocalCivilTrafficSystem({
    ...args,
    // The follower uses R7 forceSpawn only to instantiate the validated vehicle
    // visual. During that tiny synchronous call, route position is deliberately
    // detached from the follower player's current location; the root is moved to
    // the authoritative cum immediately afterward.
    nearestRouteForVehicle:(x,z)=>{
      if(replicaVisualFactory)return {cum:0};
      return args.nearestRouteForVehicle?.(x,z);
    }
  });
  const networkIds=new WeakMap();
  const followers=new Map();
  let networkSerial=0;
  let mode='offline';
  let followerSignature='';
  let routeMismatch=false;

  // P1 already has the expensive parse/template work underway at startup. Calling
  // ensureTemplate here only attaches this local engine to the preloaded cache.
  void local.ensureTemplate?.();

  function clearFollowers(){
    local.clear();
    followers.clear();
    followerSignature='';
  }

  function authoritySnapshot(){
    const diagnostics=local.diagnostics();
    const roots=Array.from(local.group?.children||[]);
    const agents=[];
    for(let i=0;i<diagnostics.agents.length;i++){
      const state=diagnostics.agents[i];
      const root=roots[i];
      if(!state||!root)continue;
      let id=networkIds.get(root);
      if(!id){
        id=`traffic-${++networkSerial}`;
        networkIds.set(root,id);
      }
      agents.push({
        id,
        vehicleId:state.vehicleId,
        kind:state.kind,
        direction:state.direction,
        cum:state.cum,
        speed:(Number(state.speedKmh)||0)/3.6,
        cruiseSpeed:(Number(state.speedKmh)||0)/3.6,
        laneOffset:state.laneOffset
      });
    }
    return publishLocalCivilTrafficSnapshot({
      routeLength:Number(args.getRouteLength?.())||0,
      agents
    });
  }

  function buildFollowerAgents(snapshot){
    const incoming=Array.isArray(snapshot?.agents)?snapshot.agents.slice(0,2):[];
    clearFollowers();
    if(!incoming.length){
      followerSignature=snapshotSignature(snapshot);
      return true;
    }

    for(const remote of incoming){
      const before=local.group?.children?.length||0;
      let spawned=false;
      replicaVisualFactory=true;
      try{
        spawned=local.forceSpawn(remote.kind,remote.vehicleId);
      }finally{
        replicaVisualFactory=false;
      }
      if(!spawned){
        clearFollowers();
        return false;
      }
      const root=local.group?.children?.[before]||local.group?.children?.[local.group.children.length-1];
      if(!root){
        clearFollowers();
        return false;
      }
      followers.set(remote.id,{
        id:remote.id,
        vehicleId:remote.vehicleId,
        root,
        direction:remote.direction<0?-1:1,
        laneOffset:Number(remote.laneOffset)||0,
        speed:Math.max(0,Number(remote.speed)||0),
        targetCum:Number(remote.cum)||0,
        renderedCum:Number(remote.cum)||0,
        wheels:collectFollowerWheelControllers(root),
        wheelSpin:0,
        spinAxis:new THREE.Vector3(1,0,0),
        spinQuat:new THREE.Quaternion(),
        forward:new THREE.Vector3(),
        left:new THREE.Vector3(),
        right:new THREE.Vector3(),
        up:new THREE.Vector3(),
        basis:new THREE.Matrix4()
      });
    }
    followerSignature=snapshotSignature(snapshot);
    return true;
  }

  function reconcileFollowerSnapshot(snapshot){
    if(!snapshot)return false;
    const localLength=Math.max(0,Number(args.getRouteLength?.())||0);
    const remoteLength=Math.max(0,Number(snapshot.routeLength)||0);
    routeMismatch=localLength>0&&remoteLength>0&&Math.abs(localLength-remoteLength)>Math.max(150,localLength*.03);
    if(routeMismatch){
      if(followers.size)clearFollowers();
      return false;
    }

    const signature=snapshotSignature(snapshot);
    if(signature!==followerSignature||followers.size!==(snapshot.agents?.length||0)){
      if(!buildFollowerAgents(snapshot))return false;
    }
    for(const remote of snapshot.agents||[]){
      const agent=followers.get(remote.id);
      if(!agent)continue;
      agent.direction=remote.direction<0?-1:1;
      agent.laneOffset=Number(remote.laneOffset)||0;
      agent.speed=Math.max(0,Number(remote.speed)||0);
      agent.targetCum=Number(remote.cum)||0;
    }
    return true;
  }

  function updateFollowers(dt,snapshot){
    if(!reconcileFollowerSnapshot(snapshot))return;
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||1/60));
    const worldOffset=args.getWorldOffset?.()||{x:0,z:0};
    const night=Number(args.getHeadlightLevel?.())||0;
    for(const agent of followers.values()){
      agent.renderedCum+=agent.direction*agent.speed*safeDt;
      const error=agent.targetCum-agent.renderedCum;
      if(Math.abs(error)>12)agent.renderedCum=agent.targetCum;
      else agent.renderedCum+=error*(1-Math.exp(-safeDt*12));
      const frame=args.roadProfileFrameAtCum?.(agent.renderedCum);
      if(!frame){agent.root.visible=false;continue;}
      setFollowerPose(agent,frame,worldOffset);
      updateFollowerWheelSpin(agent,safeDt);
      setFollowerLighting(agent.root,night);
    }
  }

  function desiredMode(network){
    if(!network.connected)return'offline';
    return network.isAuthority?'authority':'follower';
  }

  function update(dt){
    const network=readCivilTrafficMultiplayerBridge();
    const nextMode=desiredMode(network);
    if(nextMode!==mode){
      if(mode==='follower'||nextMode==='follower')clearFollowers();
      mode=nextMode;
    }

    if(mode==='follower'){
      updateFollowers(dt,network.remoteSnapshot);
      return;
    }

    local.update(dt);
    if(mode==='authority')authoritySnapshot();
  }

  function forceSpawn(kind='oncoming',vehicleId=null){
    const network=readCivilTrafficMultiplayerBridge();
    if(network.connected&&!network.isAuthority)return false;
    return local.forceSpawn(kind,vehicleId);
  }

  function clear(){
    clearFollowers();
    if(mode!=='follower')local.clear();
    if(mode==='authority')authoritySnapshot();
  }

  function diagnostics(){
    const base=local.diagnostics();
    const network=readCivilTrafficMultiplayerBridge();
    const followerAgents=[...followers.values()].map(agent=>({
      vehicleId:agent.vehicleId,
      direction:agent.direction,
      cum:Number(agent.renderedCum.toFixed(1)),
      speedKmh:Number((agent.speed*3.6).toFixed(1)),
      laneOffset:Number(agent.laneOffset.toFixed(2)),
      networkId:agent.id,
      visible:agent.root.visible
    }));
    return {
      ...base,
      mode:'traffic-mp1-shared-variety',
      active:mode==='follower'?followerAgents.length:base.active,
      agents:mode==='follower'?followerAgents:base.agents,
      multiplayerTraffic:{
        synchronized:true,
        mode,
        connected:network.connected,
        ownId:network.ownId,
        authorityId:network.authorityId,
        isAuthority:network.isAuthority,
        routeMismatch,
        remoteAgents:network.remoteSnapshot?.agents?.length||0
      }
    };
  }

  if(typeof globalThis!=='undefined'){
    globalThis.WorldDriveTraffic=diagnostics;
    globalThis.WorldDriveTrafficSpawn=(kind,vehicleId)=>forceSpawn(kind,vehicleId);
  }

  return Object.freeze({
    update,
    clear,
    ensureTemplate:local.ensureTemplate,
    forceSpawn,
    diagnostics,
    group:local.group
  });
}
