import { performance } from 'node:perf_hooks';

const CELL=48;
function buildProfile(){
  const p=[];
  let cum=0;
  let x=0,z=0;
  for(let i=0;i<1600;i++){
    // Dense mountain/switchback profile with repeated close passes.
    const t=i*.045;
    const nx=220*Math.sin(t)+34*Math.sin(t*5.7);
    const nz=i*2.4+65*Math.sin(t*.72);
    if(i)cum+=Math.hypot(nx-x,nz-z);
    x=nx;z=nz;
    p.push({x,z,y:90+28*Math.sin(t*.31)+8*Math.sin(t*2.2),roll:.07*Math.sin(t*1.3),cum});
  }
  return p;
}
const profile=buildProfile();
const index=new Map();
for(let i=0;i<profile.length-1;i++){
  const a=profile[i],b=profile[i+1];
  const minCx=Math.floor(Math.min(a.x,b.x)/CELL),maxCx=Math.floor(Math.max(a.x,b.x)/CELL);
  const minCz=Math.floor(Math.min(a.z,b.z)/CELL),maxCz=Math.floor(Math.max(a.z,b.z)/CELL);
  for(let cx=minCx;cx<=maxCx;cx++)for(let cz=minCz;cz<=maxCz;cz++){
    const k=`${cx}:${cz}`;let list=index.get(k);if(!list){list=[];index.set(k,list)}list.push(i);
  }
}
const marks=new Uint32Array(profile.length-1);let stamp=1;
function evalSeg(i,x,z,state){
  const a=profile[i],b=profile[i+1]; const vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z;
  const vv=vx*vx+vz*vz||1,t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
  const px=a.x+t*vx,pz=a.z+t*vz,d2=(x-px)**2+(z-pz)**2;
  if(d2<state.bd){state.bd=d2;state.i=i;state.t=t;state.px=px;state.pz=pz}
}
function full(x,z){const st={bd:Infinity,i:-1};for(let i=0;i<profile.length-1;i++)evalSeg(i,x,z,st);return st}
function fast(x,z){
  const st={bd:Infinity,i:-1}; const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL); stamp=(stamp+1)>>>0;if(!stamp){marks.fill(0);stamp=1}
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    const list=index.get(`${cx+dx}:${cz+dz}`);if(!list)continue;
    for(const i of list){if(marks[i]===stamp)continue;marks[i]=stamp;evalSeg(i,x,z,st)}
  }
  if(st.i>=0&&st.bd<=CELL*CELL)return st;
  for(let i=0;i<profile.length-1;i++){if(marks[i]===stamp)continue;evalSeg(i,x,z,st)}
  return st;
}
let seed=0x12345678;function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/2**32}
const queries=[];
for(let n=0;n<30000;n++){
  const j=Math.floor(rand()*(profile.length-1));const a=profile[j];
  queries.push([a.x+(rand()-.5)*70,a.z+(rand()-.5)*70]);
}
let mismatches=0,maxD2=0;
for(const [x,z] of queries){const a=full(x,z),b=fast(x,z);const diff=Math.abs(a.bd-b.bd);maxD2=Math.max(maxD2,diff);if(diff>1e-9)mismatches++}
function bench(fn){const t0=performance.now();let sum=0;for(let pass=0;pass<4;pass++)for(const q of queries)sum+=fn(q[0],q[1]).bd;return {ms:performance.now()-t0,sum}}
const b1=bench(full),b2=bench(fast);
console.log(`road-index equivalence mismatches=${mismatches} maxD2=${maxD2}`);
console.log(`legacy full scan: ${b1.ms.toFixed(1)} ms`);
console.log(`indexed scan:     ${b2.ms.toFixed(1)} ms`);
console.log(`speedup:          ${(b1.ms/b2.ms).toFixed(2)}x`);
if(mismatches)process.exit(2);
