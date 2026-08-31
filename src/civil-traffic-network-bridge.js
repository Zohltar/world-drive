import {ensureWorldDriveDiagnostics} from './diagnostics.js';

// World Drive Traffic MP1 — tiny multiplayer bridge for shared civil traffic.
// No rendering or physics lives here. The bridge only tracks multiplayer peer
// identity/authority and transports a compact snapshot of the at-most-two agents.

const peerIds=new Set();
let connected=false;
let ownId=null;
let latestAuthoritySnapshot=null;
let localSnapshot=null;
let authorityId=null;
let incomingSequence=0;
let outgoingSequence=0;

function peerOrdinal(id){
  const match=String(id||'').match(/^(?:p)?(\d+)$/i);
  return match?Number(match[1]):Number.MAX_SAFE_INTEGER;
}

function recomputeAuthority(){
  const ids=[];
  if(ownId)ids.push(ownId);
  for(const id of peerIds)if(id)ids.push(id);
  ids.sort((a,b)=>peerOrdinal(a)-peerOrdinal(b)||String(a).localeCompare(String(b)));
  authorityId=ids[0]||null;
  return authorityId;
}

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function sanitizeAgent(agent){
  if(!agent||typeof agent!=='object')return null;
  const direction=finite(agent.direction,1)<0?-1:1;
  const id=String(agent.id||agent.networkId||'').slice(0,48);
  const vehicleId=String(agent.vehicleId||'sonata').slice(0,32);
  if(!id||!vehicleId)return null;
  return {
    id,
    vehicleId,
    kind:direction>0?'ahead':'oncoming',
    direction,
    cum:Math.max(0,finite(agent.cum,0)),
    speed:Math.max(0,Math.min(60,finite(agent.speed,0))),
    cruiseSpeed:Math.max(0,Math.min(60,finite(agent.cruiseSpeed,finite(agent.speed,0)))),
    laneOffset:Math.max(-4,Math.min(4,finite(agent.laneOffset,0)))
  };
}

export function sanitizeCivilTrafficNetworkSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=='object')return null;
  const agents=Array.isArray(snapshot.agents)
    ?snapshot.agents.slice(0,2).map(sanitizeAgent).filter(Boolean)
    :[];
  return {
    protocol:'traffic-mp1',
    sequence:Math.max(0,Math.floor(finite(snapshot.sequence,0))),
    routeLength:Math.max(0,finite(snapshot.routeLength,0)),
    agents
  };
}

export function publishLocalCivilTrafficSnapshot(snapshot){
  const clean=sanitizeCivilTrafficNetworkSnapshot({
    ...snapshot,
    sequence:++outgoingSequence
  });
  if(clean)localSnapshot=clean;
  return clean;
}

export function mergeCivilTrafficIntoOutgoingState(base){
  if(!base||typeof base!=='object'||!connected||!ownId||authorityId!==ownId||!localSnapshot)return base;
  return {...base,trafficState:localSnapshot};
}

function consumeStateMessage(message){
  if(!message?.id)return;
  const id=String(message.id);
  if(id!==ownId)peerIds.add(id);
  recomputeAuthority();
  if(id!==authorityId)return;
  const clean=sanitizeCivilTrafficNetworkSnapshot(message.trafficState);
  if(!clean)return;
  if(clean.sequence&&incomingSequence&&clean.sequence<incomingSequence)return;
  incomingSequence=Math.max(incomingSequence,clean.sequence||0);
  latestAuthoritySnapshot=clean;
}

export function consumeCivilTrafficMultiplayerPayload(raw){
  if(typeof raw!=='string')return raw;
  let message;
  try{message=JSON.parse(raw);}catch{return raw;}

  if(message?.type==='welcome'){
    connected=true;
    ownId=String(message.id||'')||null;
    recomputeAuthority();
  }else if(message?.type==='state'){
    consumeStateMessage(message);
  }else if(message?.type==='snapshot'&&Array.isArray(message.states)){
    for(const state of message.states){
      if(state?.id&&String(state.id)!==ownId)peerIds.add(String(state.id));
    }
    recomputeAuthority();
    const authorityState=message.states.find(state=>String(state?.id||'')===authorityId);
    if(authorityState)consumeStateMessage(authorityState);
  }else if(message?.type==='leave'){
    peerIds.delete(String(message.id||''));
    recomputeAuthority();
  }
  return raw;
}

export function resetCivilTrafficMultiplayerBridge(){
  connected=false;
  ownId=null;
  peerIds.clear();
  authorityId=null;
  latestAuthoritySnapshot=null;
  localSnapshot=null;
  incomingSequence=0;
  outgoingSequence=0;
}

export function readCivilTrafficMultiplayerBridge(){
  return {
    connected,
    ownId,
    authorityId,
    isAuthority:!!connected&&!!ownId&&authorityId===ownId,
    peerIds:Array.from(peerIds),
    remoteSnapshot:latestAuthoritySnapshot,
    localSnapshot
  };
}

try{
  const trafficDiagnostics=ensureWorldDriveDiagnostics().traffic;
  trafficDiagnostics.network=()=>{
    const state=readCivilTrafficMultiplayerBridge();
    return {
      connected:state.connected,
      ownId:state.ownId,
      authorityId:state.authorityId,
      isAuthority:state.isAuthority,
      peers:state.peerIds,
      remoteAgents:state.remoteSnapshot?.agents?.length||0,
      localAgents:state.localSnapshot?.agents?.length||0
    };
  };
}catch{}
