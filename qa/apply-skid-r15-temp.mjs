import fs from 'node:fs';

function patch(path,from,to){
  const source=fs.readFileSync(path,'utf8');
  if(!source.includes(from))throw new Error(`Missing patch anchor in ${path}`);
  const next=source.replace(from,to);
  if(next===source)throw new Error(`Patch produced no change in ${path}`);
  fs.writeFileSync(path,next);
}

patch(
  'src/vehicle-system.js',
`function normalizedProfile(profile){
  const copy=clone(profile);
  copy.physics=normalizePhysics(copy.physics);
  return copy;
}`,
`function normalizedProfile(profile){
  const copy=clone(profile);
  copy.physics=normalizePhysics(copy.physics);
  // Skid R15 — keep a stable profile identifier on the shared mutable physics
  // object. Rendering systems can then apply authored-model presentation
  // transforms without guessing the active vehicle from dimensions.
  copy.physics.vehicleId=copy.id;
  return copy;
}`
);

patch(
  'src/skidmarks.js',
`// World Drive V21.29 — pooled skid-mark renderer + shared tire-audio slip cue.
// Local rubber is driven by independent per-wheel adhesion loss; multiplayer
// keeps the compact front/rear aggregate state. V21.29 adds low-speed rubber
// for genuine longitudinal wheelspin so clutch dumps can leave driven-wheel marks.
export function createSkidMarkSystem({THREE,scene,getWorldOffset,getRoadSurface,maxSegments=7200}){`,
`// World Drive V21.29 — pooled skid-mark renderer + shared tire-audio slip cue.
// Local rubber is driven by independent per-wheel adhesion loss; multiplayer
// keeps the compact front/rear aggregate state. V21.29 adds low-speed rubber
// for genuine longitudinal wheelspin so clutch dumps can leave driven-wheel marks.
import {VEHICLE_RENDER_ROOT_SCALE} from './vehicle-render-contract.js';

const AUTHORED_SKID_MODEL_SCALE=Object.freeze({
  id4:1,
  wrx:1.20,
  civic:1,
  sonata:1,
  f1_2010:1,
  countach_80:1.15,
  i3_2017:1
});

export function skidVisualFootprintScale(vehicle={}){
  const id=String(vehicle?.vehicleId||'');
  const authoredScale=AUTHORED_SKID_MODEL_SCALE[id];
  return Number.isFinite(authoredScale)
    ?VEHICLE_RENDER_ROOT_SCALE*authoredScale
    :1;
}

function inferVehicleFrameFromContacts(contacts){
  let bestA=null,bestB=null,bestDistance2=0;
  for(let i=0;i<contacts.length;i++)for(let j=i+1;j<contacts.length;j++){
    const a=contacts[i],b=contacts[j];
    if(!Number.isFinite(a?.localX)||!Number.isFinite(a?.localZ)||!Number.isFinite(a?.absX)||!Number.isFinite(a?.absZ))continue;
    if(!Number.isFinite(b?.localX)||!Number.isFinite(b?.localZ)||!Number.isFinite(b?.absX)||!Number.isFinite(b?.absZ))continue;
    const dlx=b.localX-a.localX,dlz=b.localZ-a.localZ;
    const d2=dlx*dlx+dlz*dlz;
    if(d2>bestDistance2){bestDistance2=d2;bestA=a;bestB=b;}
  }
  if(!bestA||!bestB||bestDistance2<1e-8)return null;
  const localAngle=Math.atan2(bestB.localX-bestA.localX,bestB.localZ-bestA.localZ);
  const worldAngle=Math.atan2(bestB.absX-bestA.absX,bestB.absZ-bestA.absZ);
  const heading=worldAngle-localAngle;
  const c=Math.cos(heading),s=Math.sin(heading);
  let centerX=0,centerZ=0,count=0;
  for(const contact of contacts){
    if(!Number.isFinite(contact?.localX)||!Number.isFinite(contact?.localZ)||!Number.isFinite(contact?.absX)||!Number.isFinite(contact?.absZ))continue;
    centerX+=contact.absX-(contact.localX*c+contact.localZ*s);
    centerZ+=contact.absZ-(-contact.localX*s+contact.localZ*c);
    count++;
  }
  if(!count)return null;
  return {heading,c,s,centerX:centerX/count,centerZ:centerZ/count};
}

export function alignSkidContactsToVisuals(contacts,vehicle={},getRoadSurface=null){
  if(!Array.isArray(contacts)||contacts.length!==4)return contacts;
  const scale=skidVisualFootprintScale(vehicle);
  if(Math.abs(scale-1)<1e-9)return contacts;
  const frame=inferVehicleFrameFromContacts(contacts);
  if(!frame)return contacts;
  return contacts.map((contact,index)=>{
    const localX=Number(contact?.localX),localZ=Number(contact?.localZ);
    if(!Number.isFinite(localX)||!Number.isFinite(localZ))return contact;
    const visualX=localX*scale,visualZ=localZ*scale;
    const absX=frame.centerX+visualX*frame.c+visualZ*frame.s;
    const absZ=frame.centerZ-visualX*frame.s+visualZ*frame.c;
    const surface=typeof getRoadSurface==='function'?getRoadSurface(absX,absZ):null;
    const surfaceY=Number(surface?.y);
    return {
      ...contact,
      absX,
      absZ,
      ground:Number.isFinite(surfaceY)?surfaceY:Number(contact?.ground),
      skidSourceIndex:index,
      skidVisualScale:scale
    };
  });
}

export function createSkidMarkSystem({THREE,scene,getWorldOffset,getRoadSurface,maxSegments=7200}){`
);

patch(
  'src/skidmarks.js',
`  function updateLocal(args){localState=computeSlip(args);updateSource('local',args.contacts,localState);return localState;}`,
`  function updateLocal(args){
    localState=computeSlip(args);
    const visualContacts=alignSkidContactsToVisuals(args.contacts,args.vehicle,getRoadSurface);
    updateSource('local',visualContacts,localState);
    return localState;
  }`
);

console.log('Skid R15 patch applied');
