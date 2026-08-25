import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';
import {
  MANIC2,MANIC5,R169_START,R169_END,R132_START,R132_END,
  YUNGAS_START,YUNGAS_END,YUNGAS_WAYPOINTS
} from '../src/route-presets.js';
import {
  steeringCommand,
  antiRollAxleGripScales,
  lowSpeedYawAuthority
} from '../src/vehicle-dynamics.js';

const ROOT=new URL('../',import.meta.url);
const qaDir=new URL('./',import.meta.url);

function finite(n){return Number.isFinite(Number(n));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function geoDist(a,b){
  const R=6371000;
  const p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180;
  const dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lon-a.lon)*Math.PI/180;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function rng(seed){
  let s=seed>>>0;
  return ()=>{
    s=(1664525*s+1013904223)>>>0;
    return s/4294967296;
  };
}

const profileValidation=validateVehicleProfiles();
assert.equal(profileValidation.ok,true,profileValidation.errors.join('\n'));

const presets=[
  {id:'manic',start:MANIC2,end:MANIC5,waypoints:[]},
  {id:'r169',start:R169_START,end:R169_END,waypoints:[]},
  {id:'r132',start:R132_START,end:R132_END,waypoints:[]},
  {id:'yungas',start:YUNGAS_START,end:YUNGAS_END,waypoints:YUNGAS_WAYPOINTS}
];
for(const preset of presets){
  for(const p of [preset.start,...preset.waypoints,preset.end]){
    assert.ok(finite(p.lat)&&finite(p.lon),`${preset.id}: non-finite coordinates`);
    assert.ok(Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180,`${preset.id}: invalid lat/lon`);
  }
  assert.ok(geoDist(preset.start,preset.end)>1000,`${preset.id}: route endpoints suspiciously close`);
}

const vehicles=createVehicleSystem({initialId:'wrx'});
const fleet=vehicles.list();
assert.ok(fleet.length>=6,'fleet unexpectedly small');

const matrix=[];
for(const info of fleet){
  if(vehicles.activeId!==info.id)vehicles.select(info.id);
  const v=vehicles.physics;
  for(const key of ['massKg','wheelbase','trackWidth','cgHeight','topSpeedKmh','accel','brake','lateralAccelLimit']){
    assert.ok(finite(v[key])&&Number(v[key])>0,`${info.id}: invalid ${key}`);
  }
  const axleLoad=v.axles.reduce((s,a)=>s+(Number(a.staticLoadFraction)||0),0);
  const driveShare=v.axles.reduce((s,a)=>s+(Number(a.driveShare)||0),0);
  const brakeShare=v.axles.reduce((s,a)=>s+(Number(a.brakeShare)||0),0);
  assert.ok(Math.abs(axleLoad-1)<1e-6,`${info.id}: axle load normalization`);
  assert.ok(Math.abs(driveShare-1)<1e-6,`${info.id}: drive share normalization`);
  assert.ok(Math.abs(brakeShare-1)<1e-6,`${info.id}: brake share normalization`);

  const low=steeringCommand({vehicle:v,speedAbs:2,input:1});
  const mid=steeringCommand({vehicle:v,speedAbs:22,input:1});
  const high=steeringCommand({vehicle:v,speedAbs:55,input:1});
  for(const cmd of [low,mid,high]){
    assert.ok(finite(cmd.maxRoadWheelAngle)&&finite(cmd.target)&&finite(cmd.inputRate),`${info.id}: steering NaN`);
  }
  assert.ok(low.maxRoadWheelAngle>=mid.maxRoadWheelAngle-1e-9,`${info.id}: steering authority rises with speed`);
  assert.ok(mid.maxRoadWheelAngle>=high.maxRoadWheelAngle-1e-9,`${info.id}: high-speed steering authority rises`);
  assert.equal(lowSpeedYawAuthority(0),0,'stationary yaw authority must be zero');

  for(const preset of presets){
    const random=rng((info.id.length*2654435761+preset.id.length*1013904223)>>>0);
    let peakBankPenalty=0;
    let minSteer=Infinity,maxSteer=0;
    for(let i=0;i<2500;i++){
      const speed=(random()*1.05)*Math.max(10,Number(v.topSpeedKmh)/3.6);
      const input=random()*2-1;
      const cmd=steeringCommand({vehicle:v,speedAbs:speed,input});
      assert.ok(finite(cmd.maxRoadWheelAngle)&&finite(cmd.target),`${preset.id}/${info.id}: steering non-finite at ${i}`);
      minSteer=Math.min(minSteer,cmd.maxRoadWheelAngle);
      maxSteer=Math.max(maxSteer,cmd.maxRoadWheelAngle);

      const lat=(random()*2-1)*Number(v.lateralAccelLimit)*1.15;
      const roll=antiRollAxleGripScales({vehicle:v,signedLatAccel:lat});
      assert.ok(finite(roll.front)&&finite(roll.rear),`${preset.id}/${info.id}: anti-roll non-finite at ${i}`);
      assert.ok(roll.front>=.94&&roll.front<=1.025,`${preset.id}/${info.id}: front anti-roll out of bounds`);
      assert.ok(roll.rear>=.94&&roll.rear<=1.025,`${preset.id}/${info.id}: rear anti-roll out of bounds`);
      peakBankPenalty=Math.max(peakBankPenalty,1-Math.min(roll.front,roll.rear));
    }
    matrix.push({preset:preset.id,vehicle:info.id,minSteer,maxSteer,peakBankPenalty});
  }
}

const qaFiles=readdirSync(qaDir,{withFileTypes:true})
  .filter(e=>e.isFile()&&/^V21_(28|29|30|31).*_QA\.mjs$/.test(e.name))
  .map(e=>e.name)
  .sort();

const failures=[];
for(const file of qaFiles){
  const result=spawnSync(process.execPath,[new URL(file,qaDir)],{
    cwd:ROOT,
    encoding:'utf8',
    timeout:30000
  });
  if(result.status!==0){
    failures.push({file,status:result.status,stdout:result.stdout,stderr:result.stderr});
  }else{
    process.stdout.write(`PASS ${file}\n`);
  }
}

if(failures.length){
  for(const f of failures){
    console.error(`FAIL ${f.file}\n${f.stdout||''}\n${f.stderr||''}`);
  }
  throw new Error(`${failures.length}/${qaFiles.length} regression QA scripts failed`);
}

console.log('STRESS V21.31 OK',{
  qaScripts:qaFiles.length,
  presets:presets.map(p=>p.id),
  vehicles:fleet.map(v=>v.id),
  matrixCases:matrix.length,
  randomizedSamples:matrix.length*2500
});
