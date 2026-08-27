import {createMultiplayerClient as createMaintainedMultiplayerClient} from './multiplayer-client-m3.js';
import {readLocalAuthoredPresentationState} from './deferred-glb-system.js';

// Multiplayer M4.7 public entrypoint.
//
// Local authored passenger controllers already receive the final presentation
// state (brake/reverse/night) that produces the visible local car. M4.7 copies
// that exact state into the network snapshot instead of reconstructing reverse
// from a second transmission bridge. Remote and local authored controllers thus
// consume the same reverse request.

function hasExplicitGear(state){
  return !!state&&
    state.gear!==null&&
    state.gear!==undefined&&
    state.gear!==''&&
    Number.isFinite(Number(state.gear));
}

export function mergeLocalAuthoredMultiplayerState(base,presentation=readLocalAuthoredPresentationState()){
  if(!base||!presentation?.source||!(Number(presentation.sequence)>0))return base;

  const reversing=!!presentation.reversing;
  const merged={
    ...base,
    braking:!!presentation.braking,
    reversing
  };

  const night=Number(presentation.nightLevel);
  if(presentation.nightLevel!==null&&presentation.nightLevel!==undefined&&Number.isFinite(night)){
    merged.nightLevel=Math.max(0,Math.min(1,night));
  }

  // Reverse presentation state is authoritative because it is the exact flag
  // that already lights the local authored car. A true request must survive any
  // stale selector/gear bridge and become explicit R on the wire.
  if(reversing){
    merged.gear=-1;
  }else if(Number(merged.gear)<0){
    // Never let a stale explicit R override the local authored controller saying
    // reverse is off. With no explicit gear, the maintained client can use its
    // normal forward/neutral transmission fallback.
    delete merged.gear;
  }

  return merged;
}

// Compatibility for a relay process that predates explicit `gear`. It still
// forwards the already-authoritative reversing boolean, so synthesize R only
// when that boolean is true. Current packets carrying gear are never modified.
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

export function createMultiplayerClient(options={}){
  installLegacyGearWebSocketCompatibility();
  const baseGetLocalState=options.getLocalState;
  if(typeof baseGetLocalState!=='function')return createMaintainedMultiplayerClient(options);

  return createMaintainedMultiplayerClient({
    ...options,
    getLocalState:()=>mergeLocalAuthoredMultiplayerState(
      baseGetLocalState(),
      readLocalAuthoredPresentationState()
    )
  });
}
