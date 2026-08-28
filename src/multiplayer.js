import {readLocalAuthoredPresentationState} from './deferred-glb-system.js';
import {readTransmissionNetworkGear} from './transmission-network-state.js';

// Lightweight multiplayer public entrypoint.
// Wire/compatibility guards remain tiny and always available, while the full
// N-player client/interpolation runtime is imported only on first connection.
// Numeric gear contract: -1=R, 0=N, 1..N=forward.

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
  return {...base,gear:exactGear,reversing:exactGear===-1};
}

export function mergeLocalAuthoredMultiplayerState(base,presentation=readLocalAuthoredPresentationState()){
  if(!base||!presentation?.source||!(Number(presentation.sequence)>0))return base;
  const merged={...base,braking:!!presentation.braking};
  const night=Number(presentation.nightLevel);
  if(presentation.nightLevel!==null&&presentation.nightLevel!==undefined&&Number.isFinite(night)){
    merged.nightLevel=Math.max(0,Math.min(1,night));
  }
  return merged;
}

export function upgradeLegacyMultiplayerState(state){
  if(!state||typeof state!=='object'||hasExplicitGear(state))return state;
  if(state.reversing===true)state.gear=-1;
  return state;
}

export function upgradeLegacyMultiplayerPayload(raw){
  if(typeof raw!=='string')return raw;
  let message;
  try{message=JSON.parse(raw);}catch{return raw;}
  if(message?.type==='state')upgradeLegacyMultiplayerState(message);
  else if(message?.type==='snapshot'&&Array.isArray(message.states)){
    for(const state of message.states)upgradeLegacyMultiplayerState(state);
  }else return raw;
  try{return JSON.stringify(message);}catch{return raw;}
}

const wireDiagnostics={outgoingCount:0,incomingCount:0,outgoing:null,incoming:null};
function compactWireState(state){
  if(!state||typeof state!=='object')return null;
  return {
    type:state.type||null,id:state.id||null,
    seq:Number.isFinite(Number(state.seq))?Number(state.seq):null,
    vehicleId:state.vehicleId||null,
    gear:normalizeWireGear(state.gear),
    reversing:!!state.reversing,
    braking:!!state.braking
  };
}
function recordIncomingPayload(raw){
  if(typeof raw!=='string')return;
  let message;try{message=JSON.parse(raw);}catch{return;}
  wireDiagnostics.incomingCount++;
  if(message?.type==='state')wireDiagnostics.incoming={at:Date.now(),...compactWireState(message)};
  else if(message?.type==='snapshot'&&Array.isArray(message.states)){
    wireDiagnostics.incoming={at:Date.now(),type:'snapshot',states:message.states.map(compactWireState).filter(Boolean)};
  }
}

export function enforceExactGearOnOutgoingPayload(raw,gear=readTransmissionNetworkGear()){
  if(typeof raw!=='string')return raw;
  let message;try{message=JSON.parse(raw);}catch{return raw;}
  if(message?.type!=='state')return raw;
  const exactGear=normalizeWireGear(gear);
  if(exactGear!==null){message.gear=exactGear;message.reversing=exactGear===-1;}
  wireDiagnostics.outgoingCount++;
  wireDiagnostics.outgoing={at:Date.now(),...compactWireState(message)};
  try{return JSON.stringify(message);}catch{return raw;}
}

let websocketCompatInstalled=false;
function installLegacyGearWebSocketCompatibility(){
  if(websocketCompatInstalled||typeof globalThis==='undefined')return;
  const NativeWebSocket=globalThis.WebSocket;
  if(typeof NativeWebSocket!=='function')return;
  class WorldDriveCompatWebSocket extends NativeWebSocket{
    send(data){return super.send(enforceExactGearOnOutgoingPayload(data,readTransmissionNetworkGear()));}
    addEventListener(type,listener,options){
      if(type!=='message'||!listener)return super.addEventListener(type,listener,options);
      const wrapped=event=>{
        const originalData=event?.data;
        const data=upgradeLegacyMultiplayerPayload(originalData);
        recordIncomingPayload(data);
        if(data===originalData){
          if(typeof listener==='function')return listener.call(this,event);
          return listener.handleEvent?.(event);
        }
        const patchedEvent=new MessageEvent('message',{
          data,origin:event?.origin||'',lastEventId:event?.lastEventId||'',source:event?.source||null,ports:event?.ports||[]
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
  globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__=()=>({
    exactLocalGear:normalizeWireGear(readTransmissionNetworkGear()),
    outgoingCount:wireDiagnostics.outgoingCount,
    incomingCount:wireDiagnostics.incomingCount,
    outgoing:wireDiagnostics.outgoing?{...wireDiagnostics.outgoing}:null,
    incoming:wireDiagnostics.incoming?JSON.parse(JSON.stringify(wireDiagnostics.incoming)):null
  });
}catch{}

export function createMultiplayerClient(options={}){
  installLegacyGearWebSocketCompatibility();
  const baseGetLocalState=options.getLocalState;
  const preparedOptions=typeof baseGetLocalState==='function'
    ?{
      ...options,
      getLocalState:()=>mergeExactTransmissionGear(
        mergeLocalAuthoredMultiplayerState(baseGetLocalState(),readLocalAuthoredPresentationState()),
        readTransmissionNetworkGear()
      )
    }
    :options;

  let implementation=null;
  let loadPromise=null;
  let wantsConnection=false;
  const toggleButton=options.toggleButton||null;
  const statusEl=options.statusEl||null;
  const serverEl=options.serverEl||null;

  const defaultUrl=()=>{
    if(typeof location==='undefined')return 'ws://localhost:8081';
    return `${location.protocol==='https:'?'wss':'ws'}://${location.hostname}:8081`;
  };
  function setBootstrapStatus(text,state='off'){
    if(statusEl){statusEl.textContent=text;statusEl.dataset.state=state;}
    if(serverEl)serverEl.textContent=defaultUrl();
  }

  async function ensureImplementation(){
    if(implementation)return implementation;
    if(loadPromise)return loadPromise;
    if(toggleButton){toggleButton.disabled=true;toggleButton.textContent='Chargement…';}
    setBootstrapStatus('Chargement…','connecting');
    loadPromise=(async()=>{
      // Visuals are synchronous once peers begin arriving. Preload their lazy
      // facade before the socket is opened so no first-peer frame can race it.
      const prepareVisuals=options.createRemoteVisual?.prepare;
      if(typeof prepareVisuals==='function')await prepareVisuals();
      const module=await import('./multiplayer-client-m3.js');
      if(toggleButton)toggleButton.removeEventListener('click',bootstrapToggle);
      implementation=module.createMultiplayerClient(preparedOptions);
      return implementation;
    })();
    try{return await loadPromise;}
    catch(error){
      loadPromise=null;
      console.warn('Multiplayer client runtime failed to load',error);
      if(toggleButton){
        toggleButton.disabled=false;toggleButton.textContent='Connecter';
        toggleButton.removeEventListener('click',bootstrapToggle);
        toggleButton.addEventListener('click',bootstrapToggle);
      }
      setBootstrapStatus('Indisponible','error');
      throw error;
    }
  }

  async function connect(){
    wantsConnection=true;
    const client=await ensureImplementation();
    if(wantsConnection)client?.connect?.();
    return client;
  }
  function disconnect(){
    wantsConnection=false;
    if(implementation)return implementation.disconnect?.();
    if(toggleButton){toggleButton.disabled=false;toggleButton.textContent='Connecter';}
    setBootstrapStatus('Déconnecté','off');
  }
  function toggle(){
    if(implementation)return implementation.toggle?.();
    return connect();
  }
  function bootstrapToggle(){void toggle()?.catch?.(()=>{});}

  if(options.nameInput&&typeof localStorage!=='undefined'){
    options.nameInput.value=localStorage.getItem('worlddrive_multiplayer_name')||options.nameInput.value||'Conducteur';
  }
  toggleButton?.addEventListener('click',bootstrapToggle);
  if(toggleButton){toggleButton.disabled=false;toggleButton.textContent='Connecter';}
  setBootstrapStatus('Déconnecté','off');

  return {
    connect,disconnect,toggle,
    update(dt){implementation?.update?.(dt);},
    getPeers(){return implementation?.getPeers?.()||[];},
    isConnected(){return implementation?.isConnected?.()||false;},
    get loaded(){return !!implementation;}
  };
}
