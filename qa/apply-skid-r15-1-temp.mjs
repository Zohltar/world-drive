import fs from 'node:fs';

const path='src/skidmarks.js';
let source=fs.readFileSync(path,'utf8');

const scaleBlock=`const AUTHORED_SKID_MODEL_SCALE=Object.freeze({
  id4:1,
  wrx:1.20,
  civic:1,
  sonata:1,
  f1_2010:1,
  countach_80:1.15,
  i3_2017:1
});`;

const tunedBlock=`const AUTHORED_SKID_MODEL_SCALE=Object.freeze({
  id4:1,
  wrx:1.20,
  civic:1,
  sonata:1,
  f1_2010:1,
  countach_80:1.15,
  i3_2017:1
});

// Skid R15.1 — after matching the GLB footprint, the authored wheel centres
// still sit a few centimetres forward of the legacy suspension probes. Keep
// this as a body-fixed geometric correction (not a speed/travel-direction
// compensation) so forward and reverse leave rubber under the same tire.
const AUTHORED_SKID_LONGITUDINAL_OFFSET_M=Object.freeze({
  id4:.12,
  wrx:.11,
  civic:.10,
  sonata:.11,
  f1_2010:.10,
  countach_80:.11,
  i3_2017:.10
});

export function skidVisualLongitudinalOffset(vehicle={}){
  const id=String(vehicle?.vehicleId||'');
  const offset=AUTHORED_SKID_LONGITUDINAL_OFFSET_M[id];
  return Number.isFinite(offset)?offset:0;
}`;

if(!source.includes(scaleBlock))throw new Error('Missing Skid R15 scale block');
source=source.replace(scaleBlock,tunedBlock);

const oldAlign=`  const scale=skidVisualFootprintScale(vehicle);
  if(Math.abs(scale-1)<1e-9)return contacts;
  const frame=inferVehicleFrameFromContacts(contacts);`;
const newAlign=`  const scale=skidVisualFootprintScale(vehicle);
  const longitudinalOffset=skidVisualLongitudinalOffset(vehicle);
  if(Math.abs(scale-1)<1e-9&&Math.abs(longitudinalOffset)<1e-9)return contacts;
  const frame=inferVehicleFrameFromContacts(contacts);`;
if(!source.includes(oldAlign))throw new Error('Missing Skid R15 align header');
source=source.replace(oldAlign,newAlign);

const oldVisual=`    const visualX=localX*scale,visualZ=localZ*scale;
    const absX=frame.centerX+visualX*frame.c+visualZ*frame.s;
    const absZ=frame.centerZ-visualX*frame.s+visualZ*frame.c;`;
const newVisual=`    const visualX=localX*scale;
    const visualZ=localZ*scale+longitudinalOffset;
    const absX=frame.centerX+visualX*frame.c+visualZ*frame.s;
    const absZ=frame.centerZ-visualX*frame.s+visualZ*frame.c;`;
if(!source.includes(oldVisual))throw new Error('Missing Skid R15 visual anchor block');
source=source.replace(oldVisual,newVisual);

const oldMeta=`      skidSourceIndex:index,
      skidVisualScale:scale`;
const newMeta=`      skidSourceIndex:index,
      skidVisualScale:scale,
      skidVisualLongitudinalOffset:longitudinalOffset`;
if(!source.includes(oldMeta))throw new Error('Missing Skid R15 metadata block');
source=source.replace(oldMeta,newMeta);

fs.writeFileSync(path,source);
console.log('Applied Skid R15.1 longitudinal wheel-center alignment');
