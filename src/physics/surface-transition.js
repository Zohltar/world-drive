import {surfaceFrictionProfile} from './surface-friction.js';

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

export function clamp01(value){
  return Math.max(0,Math.min(1,finite(value,0)));
}

export function smoothstep01(value){
  const t=clamp01(value);
  return t*t*(3-2*t);
}

// Fraction of a tire footprint still supported by the road. The contact patch
// crosses the pavement edge progressively instead of changing material when the
// wheel centre crosses one magic line.
export function tireRoadFractionFromLateral({roadLateral=Infinity,roadHalfWidth=8.5,tireWidth=.25}={}){
  const lateral=Math.abs(finite(roadLateral,Infinity));
  if(!Number.isFinite(lateral))return 0;
  const halfWidth=Math.max(.25,finite(roadHalfWidth,8.5));
  const footprintHalf=Math.max(.035,Math.abs(finite(tireWidth,.25))*.5);
  const inner=Math.max(0,halfWidth-footprintHalf);
  const outer=halfWidth+footprintHalf;
  if(lateral<=inner)return 1;
  if(lateral>=outer)return 0;
  return 1-smoothstep01((lateral-inner)/Math.max(.001,outer-inner));
}

export function weightedRoadFraction(contacts=[],fallback=1){
  let weighted=0,total=0;
  for(const contact of Array.isArray(contacts)?contacts:[]){
    if(contact?.contact===false)continue;
    let road=Number(contact?.roadFraction);
    if(!Number.isFinite(road)){
      if(contact?.surfaceId==='asphalt-dry')road=1;
      else if(contact?.surfaceId==='dirt')road=0;
      else continue;
    }
    const support=clamp01(Number.isFinite(Number(contact?.contactFactor))?contact.contactFactor:1);
    if(support<=0)continue;
    weighted+=clamp01(road)*support;
    total+=support;
  }
  return total>1e-6?clamp01(weighted/total):clamp01(fallback);
}

export function blendRoadDirt(roadValue,dirtValue,roadFraction){
  const t=clamp01(roadFraction);
  return finite(dirtValue,0)+(finite(roadValue,0)-finite(dirtValue,0))*t;
}

export function blendedSurfaceProfile(roadFraction,roadId='asphalt-dry',dirtId='dirt'){
  const t=clamp01(roadFraction);
  if(t>=.9999)return surfaceFrictionProfile(roadId);
  if(t<=.0001)return surfaceFrictionProfile(dirtId);
  const road=surfaceFrictionProfile(roadId);
  const dirt=surfaceFrictionProfile(dirtId);
  return {
    id:`${dirt.id}-${road.id}-mix`,
    label:`${dirt.label} / ${road.label}`,
    peakScale:blendRoadDirt(road.peakScale,dirt.peakScale,t),
    slideScale:blendRoadDirt(road.slideScale,dirt.slideScale,t),
    rollingResistanceScale:blendRoadDirt(road.rollingResistanceScale,dirt.rollingResistanceScale,t),
    roadFraction:t
  };
}
