import assert from 'node:assert/strict';
import {alignSkidContactsToVisuals,skidVisualFootprintScale} from './src/skidmarks.js';

function makeContacts({halfTrack=.86,halfWheelbase=1.25,heading=.63,centerX=120,centerZ=-45,ground=12}={}){
  const c=Math.cos(heading),s=Math.sin(heading);
  const locals=[
    {localX:-halfTrack,localZ:-halfWheelbase,front:false,side:'left',axleIndex:1},
    {localX:-halfTrack,localZ: halfWheelbase,front:true, side:'left',axleIndex:0},
    {localX: halfTrack,localZ:-halfWheelbase,front:false,side:'right',axleIndex:1},
    {localX: halfTrack,localZ: halfWheelbase,front:true, side:'right',axleIndex:0}
  ];
  return locals.map((p,index)=>({
    ...p,
    absX:centerX+p.localX*c+p.localZ*s,
    absZ:centerZ-p.localX*s+p.localZ*c,
    ground,
    width:.28,
    index
  }));
}

function span(contacts,axis){
  const values=contacts.map(c=>c[axis]);
  return Math.max(...values)-Math.min(...values);
}

const profiles=[
  {vehicleId:'id4',expected:.80},
  {vehicleId:'wrx',expected:.96},
  {vehicleId:'civic',expected:.80},
  {vehicleId:'sonata',expected:.80},
  {vehicleId:'f1_2010',expected:.80},
  {vehicleId:'countach_80',expected:.92},
  {vehicleId:'i3_2017',expected:.80}
];

const reports=[];
for(const profile of profiles){
  const original=makeContacts();
  const aligned=alignSkidContactsToVisuals(original,{vehicleId:profile.vehicleId},()=>({y:12.5}));
  assert.notEqual(aligned,original,`${profile.vehicleId}: alignment must return visual contacts`);
  const scale=skidVisualFootprintScale({vehicleId:profile.vehicleId});
  assert.ok(Math.abs(scale-profile.expected)<1e-9,`${profile.vehicleId}: scale ${scale}`);
  const localTrack=span(aligned,'localX');
  const localWheelbase=span(aligned,'localZ');
  // The physics-local metadata stays untouched; only world draw anchors move.
  assert.ok(Math.abs(localTrack-span(original,'localX'))<1e-12);
  assert.ok(Math.abs(localWheelbase-span(original,'localZ'))<1e-12);
  for(let i=0;i<4;i++){
    assert.equal(aligned[i].skidSourceIndex,i,`${profile.vehicleId}: wheel index mapping changed`);
    assert.equal(aligned[i].front,original[i].front);
    assert.equal(aligned[i].side,original[i].side);
    assert.equal(aligned[i].ground,12.5);
  }
  const worldTrack=Math.hypot(aligned[2].absX-aligned[0].absX,aligned[2].absZ-aligned[0].absZ);
  const worldWheelbase=Math.hypot(aligned[1].absX-aligned[0].absX,aligned[1].absZ-aligned[0].absZ);
  assert.ok(Math.abs(worldTrack-(1.72*scale))<1e-9,`${profile.vehicleId}: track mismatch ${worldTrack}`);
  assert.ok(Math.abs(worldWheelbase-(2.50*scale))<1e-9,`${profile.vehicleId}: wheelbase mismatch ${worldWheelbase}`);
  const centerX=aligned.reduce((sum,c)=>sum+c.absX,0)/4;
  const centerZ=aligned.reduce((sum,c)=>sum+c.absZ,0)/4;
  assert.ok(Math.abs(centerX-120)<1e-9,`${profile.vehicleId}: center X moved`);
  assert.ok(Math.abs(centerZ+45)<1e-9,`${profile.vehicleId}: center Z moved`);
  reports.push({id:profile.vehicleId,scale,worldTrack:Number(worldTrack.toFixed(3)),worldWheelbase:Number(worldWheelbase.toFixed(3))});
}

const untouched=makeContacts();
assert.equal(alignSkidContactsToVisuals(untouched,{vehicleId:'future_car'}),untouched,'unknown future vehicles must keep legacy anchors');
assert.equal(alignSkidContactsToVisuals(untouched.slice(0,3),{vehicleId:'wrx'}).length,3,'non-four-wheel contacts must remain untouched');

console.log('SKID R15 PER-VEHICLE CONTACT ALIGNMENT QA: PASS');
console.table(reports);
