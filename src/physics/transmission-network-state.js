// Multiplayer-facing transmission state.
//
// This is intentionally separate from the broader runtime bridge. The local
// transmission controller publishes the exact gear it has just written to the
// authoritative transmission state, so multiplayer sees the same value as the
// instrument cluster. Missing data is represented by null, never by 0.

let gear=1;
let sequence=0;

function normalizeGear(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n))return null;
  return n<0?-1:n===0?0:Math.max(1,Math.floor(n));
}

export function publishTransmissionNetworkGear(value){
  const next=normalizeGear(value);
  if(next===null)return gear;
  gear=next;
  sequence++;
  return gear;
}

export function readTransmissionNetworkGear(){
  return gear;
}

export function readTransmissionNetworkState(){
  return {gear,sequence};
}

export function resetTransmissionNetworkGear(){
  gear=1;
  sequence++;
  return gear;
}

export {normalizeGear as normalizeTransmissionNetworkGear};
