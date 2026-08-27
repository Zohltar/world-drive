import {createMultiplayerClient as createMaintainedMultiplayerClient} from './multiplayer-client-m3.js';
import {readLocalAuthoredPresentationState} from './deferred-glb-system.js';
import {readTransmissionNetworkGear} from './transmission-network-state.js';

// Multiplayer M4.8 public entrypoint.
//
// Wire gear is now one canonical numeric value:
//   -1 = reverse, 0 = neutral, 1..N = forward gears.
// The transmission controller already publishes the exact transmissionGear used
// by the local instrument cluster into transmission-network-state.js. M4.8 reads
// that value directly here, before the maintained client builds its packet.
// No D/N/R selector bridge or speed inference owns network gear anymore.

function hasExplicitGear(state){
  return !!state&&
    state.gear!==null&&
    state.gear!==undefined&&
    state.gear!==''&&
    Number.isFinite(Number(state.gear));
}

function normalizeWireGear(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n))return null;
  return n<0?-1:n===0?0:Math.max(1,Math.floor(n));
}

export function mergeExactTransmissionGear(base,gear=readTransmissionNetworkGear()){
  if(!base)return base;
  const exactGear=normalizeWireGear(gear);
  if(exactGear===null)return base;
  return {
    ...base,
    gear:exactGear,
    reversing:exactGear===-1
  };
}

export function mergeLocalAuthoredMultiplayerState(base,presentation=readLocalAuthoredPresentationState()){
  if(!base||!presentation?.source||!(Number(presentation.sequence)>0))return base;

  const merged={
    ...base,
    braking:!!presentation.braking
  };

  const night=Number(presentation.nightLevel);
  if(presentation.nightLevel!==null&&presentation.nightLevel!==undefined&&Number.isFinite(night)){
    merged.nightLevel=Math.max(0,Math.min(1,night));
  }

  // M4.8 deliberately does NOT let the authored presentation bridge invent or
  // override gear. Numeric transmission gear is owned solely by
  // transmission-network-state.js. The presentation bridge remains useful for
  // brake/night parity only.
  return merged;
}

// Compatibility for a relay process that predates explicit `gear`. It still
// forwards the authoritative reversing boolean, so synthesize R only when that
// boolean is true. Current packets carrying numeric gear are never modified.
export function upgradeLegacyMultiplayerState(state){
  if(!state||typeof state!=='object'||hasExplicitGear(state))return state;
  if(state.reversing===true)state.gear=-1;
  return state;
}

export function upgradeLegacyMultiplayerPayload(raw){
  if(typeof raw!=='string')return raw;
  let message;
  try{message=JSON.parse(raw);}catch{return raw;}

  if(message?.type==='state'){
    upgradeLegacyMultiplayerState(message);
  }else if(message?.type==='snapshot'&&Array.isArray(message.states)){
    for(const state of message.states)upgradeLegacyMultiplayerState(state);
  }else{
    return raw;
  }

  try{return JSON.stringify(message);}catch{return raw;}
}

let websocketCompatInstalled=false;
function installLegacyGearWebSocketCompatibility(){
  if(websocketCompatInstalled||typeof globalThis==='undefined')return;
  const NativeWebSocket=globalThis.WebSocket;
  if(typeof NativeWebSocket!=='function')return;

  class WorldDriveCompatWebSocket extends NativeWebSocket{
    addEventListener(type,listener,options){
      if(type!=='message'||!listener)return super.addEventListener(type,listener,options);

      const wrapped=event=>{
        const originalData=event?.data;
        const data=upgradeLegacyMultiplayerPayload(originalData);
        if(data===originalData){
          if(typeof listener==='function')return listener.call(this,event);
          return listener.handleEvent?.(event);
        }

        const patchedEvent=new MessageEvent('message',{
          data,
          origin:event?.origin||'',
          lastEventId:event?.lastEventId||'',
          source:event?.source||null,
          ports:event?.ports||[]
        });
        if(typeof listener==='function')return listener.call(this,patchedEvent);
        return listener.handleEvent?.(patchedEvent);
      };
      return super.addEventListener(type,wrapped,options);
    }
  }

  globalThis.WebSocket=WorldDriveCompatWebSocket;
  websocketCompatInstalled=true;
}

try{
  globalThis.__WORLD_DRIVE_MULTIPLAYER_LOCAL_GEAR__=()=>({
    gear:normalizeWireGear(readTransmissionNetworkGear()),
    reversing:normalizeWireGear(readTransmissionNetworkGear())===-1
  });
}catch{}

export function createMultiplayerClient(options={}){
  installLegacyGearWebSocketCompatibility();
  const baseGetLocalState=options.getLocalState;
  if(typeof baseGetLocalState!=='function')return createMaintainedMultiplayerClient(options);

  return createMaintainedMultiplayerClient({
    ...options,
    getLocalState:()=>mergeExactTransmissionGear(
      mergeLocalAuthoredMultiplayerState(
        baseGetLocalState(),
        readLocalAuthoredPresentationState()
      ),
      readTransmissionNetworkGear()
    )
  });
}
