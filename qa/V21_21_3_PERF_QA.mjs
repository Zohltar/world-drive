import { performance } from 'node:perf_hooks';
import * as dyn from '../src/vehicle-dynamics.js';

const CELL=48;
function buildProfile(){
  const p=[];let cum=0,x=0,z=0;
  for(let i=0;i<1600;i++){
    const t=i*.045,nx=220*Math.sin(t)+34*Math.sin(t*5.7),nz=i*2.4+65*Math.sin(t*.72);
    if(i)cum+=Math.hypot(nx-x,nz-z);x=nx;z=nz;
    p.push({x,z,y:90+28*Math.sin(t*.31)+8*Math.sin(t*2.2),roll:.07*Math.sin(t*1.3),cum});
  }return p;
}
const profile=buildProfile();
const stringIndex=new Map(),nestedIndex=new Map();
for(let i=0;i<profile.length-1;i++){
  const a=profile[i],b=profile[i+1],minCx=Math.floor(Math.min(a.x,b.x)/CELL),maxCx=Math.floor(Math.max(a.x,b.x)/CELL),minCz=Math.floor(Math.min(a.z,b.z)/CELL),maxCz=Math.floor(Math.max(a.z,b.z)/CELL);
  for(let cx=minCx;cx<=maxCx;cx++)for(let cz=minCz;cz<=maxCz;cz++){
    const sk=`${cx}:${cz}`;let sl=stringIndex.get(sk);if(!sl){sl=[];stringIndex.set(sk,sl)}sl.push(i);
    let col=nestedIndex.get(cx);if(!col){col=new Map();nestedIndex.set(cx,col)}let nl=col.get(cz);if(!nl){nl=[];col.set(cz,nl)}nl.push(i);
  }
}
function evalSeg(i,x,z,st){const a=profile[i],b=profile[i+1],vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z,vv=vx*vx+vz*vz||1,t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)),px=a.x+t*vx,pz=a.z+t*vz,d2=(x-px)**2+(z-pz)**2;if(d2<st.bd){st.bd=d2;st.i=i;st.t=t}}
const marksA=new Uint32Array(profile.length-1),marksB=new Uint32Array(profile.length-1);let stampA=1,stampB=1;
function stringFast(x,z){const st={bd:Infinity,i:-1},cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);stampA=(stampA+1)>>>0;if(!stampA){marksA.fill(0);stampA=1}for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const list=stringIndex.get(`${cx+dx}:${cz+dz}`);if(!list)continue;for(const i of list){if(marksA[i]===stampA)continue;marksA[i]=stampA;evalSeg(i,x,z,st)}}return st}
const nestedState={bd:Infinity,i:-1,t:0};
function nestedFast(x,z){const st=nestedState;st.bd=Infinity;st.i=-1;const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);stampB=(stampB+1)>>>0;if(!stampB){marksB.fill(0);stampB=1}for(let dx=-1;dx<=1;dx++){const col=nestedIndex.get(cx+dx);if(!col)continue;for(let dz=-1;dz<=1;dz++){const list=col.get(cz+dz);if(!list)continue;for(let k=0;k<list.length;k++){const i=list[k];if(marksB[i]===stampB)continue;marksB[i]=stampB;evalSeg(i,x,z,st)}}}return st}
let seed=0x21212103;function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/2**32}
const queries=[];for(let n=0;n<40000;n++){const j=Math.floor(rand()*(profile.length-1)),a=profile[j];queries.push([a.x+(rand()-.5)*50,a.z+(rand()-.5)*50])}
let mismatch=0;for(const q of queries){const a=stringFast(...q).bd,b=nestedFast(...q).bd;if(Math.abs(a-b)>1e-9)mismatch++}
function bench(fn){const t=performance.now();let sum=0;for(let pass=0;pass<5;pass++)for(const q of queries)sum+=fn(...q).bd;return {ms:performance.now()-t,sum}}
const bs=bench(stringFast),bn=bench(nestedFast);
console.log(`road nested-map equivalence mismatches=${mismatch}`);
console.log(`string-key indexed: ${bs.ms.toFixed(1)} ms`);
console.log(`nested-map indexed: ${bn.ms.toFixed(1)} ms`);
console.log(`nested speedup: ${(bs.ms/bn.ms).toFixed(2)}x`);

const vehicle={wheelbase:2.65,trackWidth:1.56,frontWeightBias:.58,massKg:1560,cgHeight:.5,yawInertiaScale:.96,drivetrain:'AWD',driveBiasFront:.5,brakeBiasFront:.62,accel:6.7,brake:10.5,maxSteerLow:.46,maxSteerHigh:.16,steeringInputExponent:1,steeringResponseHigh:3.8,roadGripMultiplier:1,offroadGrip:.65,lateralAccelLimit:8.2};
const contacts=[{front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},{front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},{front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},{front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}];
const scratch={drive:{axleLoads:[]},brake:{axleLoads:[]},steer:{},lat:{},grip:{axleLoads:[],_lateralTransfer:[],raw:[],smoothed:[0,0,0,0],slip:[],lateralSlip:[],lateralUsage:[],longitudinalUsage:[]}};
function dynFrame(){
  const drive=dyn.longitudinalTractionLimit({vehicle,requestedAccel:5.4,surfaceMu:.9,mode:'drive',airborne:false},scratch.drive);
  const brake=dyn.longitudinalTractionLimit({vehicle,requestedAccel:0,surfaceMu:.9,mode:'brake',airborne:false},scratch.brake);
  const steer=dyn.steeringCommand({vehicle,speedAbs:25,input:.45},scratch.steer);
  const lat=dyn.lateralDynamicsEnvelope({vehicle,speed:25,steerAngle:steer.maxRoadWheelAngle*.4,steerInput:.4,driveThrottle:.7,onPavement:true,surfaceGrip:.95,awdOffroadGripBonus:1,rearSlipAmount:.1,airborne:false},scratch.lat);
  dyn.estimateWheelGripUsage({requestedLatAccel:lat.requestedLatAccel,signedLatAccel:lat.signedLatAccel,latLimit:lat.latLimit,longitudinalAccel:drive.acceleration,propulsionAccel:drive.acceleration,serviceBrakeAccel:brake.acceleration,throttle:.7,handbrake:false,airborne:false,vehicle,dt:.016,contacts,previousUsage:scratch.grip.smoothed},scratch.grip);
  return lat.yawRate;
}
const N=1000000;let t0=performance.now(),sum=0;for(let i=0;i<N;i++)sum+=dynFrame();const ms=performance.now()-t0;
console.log(`allocation-light dynamics: ${ms.toFixed(1)} ms / ${N} frames = ${(ms*1000/N).toFixed(3)} us/frame`);
if(mismatch)process.exit(2);
