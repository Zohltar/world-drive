import {createMultiplayerClient as createMaintainedMultiplayerClient} from './multiplayer-client-m3.js';

// Multiplayer M4.4 public entrypoint.
//
// M4.1 introduced explicit transmission gear. A relay process that was already
// running before that release legitimately forwards the older `reversing`
// boolean but drops the unknown `gear` field. The maintained client used to
// interpret the resulting missing value through Number(null) === 0, silently
// turning "unknown gear" into Neutral and suppressing reverse lamps.
//
// Keep the wire protocol backward compatible at the boundary: before the
// maintained client sees an incoming state, synthesize an explicit D/R gear
// only when an older packet did not carry one. New packets are never modified.

function hasExplicitGear(state){
  return !!state&&
    state.gear!==null&&
    state.gear!==undefined&&
    state.gear!==''&&
    Number.isFinite(Number(state.gear));
}

export function upgradeLegacyMultiplayerState(state){
  if(!state||typeof state!=='object'||hasExplicitGear(state))return state;

  // Legacy M2.4 relays always transport `reversing`. We only need D/R here;
  // exact forward gear numbers remain the responsibility of M4.1+ packets.
  state.gear=state.reversing===true?-1:1;
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
  return createMaintainedMultiplayerClient(options);
}
