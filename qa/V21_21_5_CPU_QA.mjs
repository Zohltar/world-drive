import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  longitudinalTractionLimit,
  vehicleLayout,
  yawResponseRate,
  GRAVITY
} from '../src/physics/vehicle-dynamics.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const presentation=fs.readFileSync(path.join(root,'src/vehicles/vehicle-presentation.js'),'utf8');

function assert(ok,msg){if(!ok)throw new Error(msg);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function near(a,b,eps=1e-11){return Math.abs(a-b)<=eps*Math.max(1,Math.abs(a),Math.abs(b));}

const vehicle={
  wheelbase:2.65,trackWidth:1.56,frontWeightBias:.56,massKg:1560,cgHeight:.50,
  yawInertiaScale:.96,drivetrain:'AWD',driveBiasFront:.5,brakeBiasFront:.62,
  axles:[
    {id:'front',positionM:1.17,staticLoadFraction:.56,steerFactor:1,driveShare:.5,brakeShare:.62,trackWidth:1.56,wheelCount:2},
    {id:'rear',positionM:-1.48,staticLoadFraction:.44,steerFactor:0,driveShare:.5,brakeShare:.38,trackWidth:1.56,wheelCount:2}
  ]
};

function referenceLoads(requested){
  const l=vehicleLayout(vehicle);
  const transfer=clamp((requested*l.cgHeight)/(GRAVITY*l.wheelbase),-.32,.32);
  const f=clamp(l.axles[0].staticLoadFraction-transfer,.05,.95);
  return [f,1-f];
}
function referenceTraction(requested,mu,mode){
  const l=vehicleLayout(vehicle),loads=referenceLoads(requested);
  let limit=Infinity;
  if(mode==='brake'){
    limit=l.axles.some(a=>a.brakeShare>1e-6)?mu*GRAVITY:0;
  }else if(mode==='handbrake'){
    let rear=0;for(let i=0;i<2;i++)if(l.axles[i].positionM<0)rear+=loads[i];
    limit=mu*GRAVITY*Math.max(.05,rear);
  }else{
    let driven=false;
    for(let i=0;i<2;i++){
      const share=Math.max(0,l.axles[i].driveShare);if(share<=1e-6)continue;
      driven=true;limit=Math.min(limit,mu*GRAVITY*Math.max(.01,loads[i])/share);
    }
    if(!driven)limit=0;else if(!Number.isFinite(limit))limit=mu*GRAVITY;
  }
  const mag=Math.min(Math.abs(requested),Math.max(0,limit));
  return {acceleration:Math.sign(requested)*mag,limit};
}

let seed=0x212115;
function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
let mismatch=0;
for(let i=0;i<100000;i++){
  const request=-12+rnd()*24;
  const mu=.15+rnd()*1.25;
  const mode=['drive','brake','handbrake'][i%3];
  const ref=referenceTraction(request,mu,mode);
  const got=longitudinalTractionLimit({vehicle,requestedAccel:request,surfaceMu:mu,mode});
  if(!near(ref.acceleration,got.acceleration)||!near(ref.limit,got.limit))mismatch++;
}
assert(mismatch===0,`two-axle traction fast-path mismatch=${mismatch}`);

const layout=vehicleLayout(vehicle);
const referenceInertia=1560*(2.65*2.65+1.56*1.56)/12*.96;
const inertiaScale=clamp(Math.sqrt(referenceInertia/layout.yawInertiaKgM2),.52,1.45);
for(let i=0;i<10000;i++){
  const speed=rnd()*90;
  const t=clamp((speed-12)/42,0,1);
  const ref=(8.8-t*5.8)*inertiaScale;
  assert(near(ref,yawResponseRate({vehicle,speedAbs:speed})),'yaw response cache changed result');
}

// Synthetic local-plane support error. Current route meshes are piecewise planar;
// a chassis-sized local plane should remain sub-centimeter even on a tight curve.
function route(kind){
  const pts=[];
  const step=kind==='tight'?1.2:2.0;
  for(let i=0;i<=1000;i++){
    const z=i*step;
    const x=kind==='tight'?16*Math.sin(z/42):40*Math.sin(z/220);
    const y=kind==='tight'?12*Math.sin(z/90)+z*.05:5*Math.sin(z/300)+z*.015;
    const roll=kind==='tight'?.08*Math.sin(z/50):.04*Math.sin(z/180);
    pts.push({x,z,y,roll});
  }
  return pts;
}
function exactSurface(pts,x,z){
  let bd=Infinity,best=0;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1],vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z;
    const vv=vx*vx+vz*vz||1,t=clamp((wx*vx+wz*vz)/vv,0,1),px=a.x+vx*t,pz=a.z+vz*t;
    const d2=(x-px)**2+(z-pz)**2;if(d2>=bd)continue;bd=d2;
    const angle=Math.atan2(vx,vz),nx=-Math.cos(angle),nz=Math.sin(angle),lat=(x-px)*nx+(z-pz)*nz;
    const y=a.y+(b.y-a.y)*t,roll=a.roll+(b.roll-a.roll)*t;best=y+Math.tan(roll)*lat;
  }
  return best;
}
let maxSupportError=0;
for(const kind of ['normal','tight']){
  const pts=route(kind);
  for(let i=20;i<pts.length-20;i+=5){
    const a=pts[i],b=pts[i+1],cx=(a.x+b.x)/2,cz=(a.z+b.z)/2,cy=(a.y+b.y)/2;
    const dx=b.x-a.x,dz=b.z-a.z,angle=Math.atan2(dx,dz),pitch=Math.atan2(b.y-a.y,Math.hypot(dx,dz)),roll=(a.roll+b.roll)/2;
    const sn=Math.sin(angle),co=Math.cos(angle);
    for(const [lx,lz] of [[-.78,-1.35],[-.78,1.35],[.78,-1.35],[.78,1.35]]){
      const wx=cx+lx*co+lz*sn,wz=cz-lx*sn+lz*co;
      const ddx=wx-cx,ddz=wz-cz,along=ddx*sn+ddz*co,lateral=-ddx*co+ddz*sn;
      const fast=cy+Math.tan(pitch)*along+Math.tan(roll)*lateral;
      maxSupportError=Math.max(maxSupportError,Math.abs(fast-exactSurface(pts,wx,wz)));
    }
  }
}
assert(maxSupportError<.01,`local road-plane support error=${maxSupportError}`);

assert(main.includes("new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,4500)"),'far plane changed');
assert(main.includes("new THREE.WebGLRenderer({antialias:true"),'antialias changed');
assert(main.includes("next>=3?.85"),'V21.21.4 pixel-ratio floor changed');
assert(main.includes("left:'12px'"),'FPS HUD is not left');
assert(main.includes('drawCompass();\n   drawSpeedometer();'),'instruments are not full-rate');
assert(main.includes('instrumentStaticCanvas'),'instrument static cache missing');
assert(main.includes('compassTapeCanvas'),'compass tape cache missing');
assert(presentation.includes('groundHeightForWheel(wx,wz,true)'),'fast wheel support not enabled');
assert(presentation.includes('groundHeightForWheel(centerX,centerZ)'),'precise crest probe unexpectedly replaced');



// Temporal nearest-route hint equivalence on a long synthetic driving trace.
const testSegments=[];
let testCum=0;
for(let i=0;i<3200;i++){
  const z0=i*4,z1=(i+1)*4;
  const x0=85*Math.sin(z0/310)+14*Math.sin(z0/67);
  const x1=85*Math.sin(z1/310)+14*Math.sin(z1/67);
  const len=Math.hypot(x1-x0,z1-z0);
  testSegments.push({ax:x0,az:z0,bx:x1,bz:z1,len,cum:testCum});
  testCum+=len;
}
function nearestInRange(x,z,first,last){
  let bd=Infinity,best=null;
  for(let i=first;i<=last;i++){
    const seg=testSegments[i],vx=seg.bx-seg.ax,vz=seg.bz-seg.az,wx=x-seg.ax,wz=z-seg.az;
    const vv=vx*vx+vz*vz||1,t=clamp((wx*vx+wz*vz)/vv,0,1),px=seg.ax+t*vx,pz=seg.az+t*vz;
    const d2=(x-px)**2+(z-pz)**2;
    if(d2<bd){bd=d2;best={i,t,d2,cum:seg.cum+t*seg.len};}
  }
  return best;
}
function fullNearest(x,z){return nearestInRange(x,z,0,testSegments.length-1);}
let hint=0,routeMismatch=0;
const trace=[];
for(let q=0;q<12000;q++){
  const i=Math.min(testSegments.length-1,Math.floor(q*.24));
  const seg=testSegments[i],t=(q*.173)%1;
  trace.push({x:seg.ax+(seg.bx-seg.ax)*t+Math.sin(q*.13)*1.5,z:seg.az+(seg.bz-seg.az)*t+Math.cos(q*.11)*1.0});
}
const tFull=performance.now();
const fullResults=trace.map(p=>fullNearest(p.x,p.z));
const fullMs=performance.now()-tFull;
const tHint=performance.now();
for(let q=0;q<trace.length;q++){
  const p=trace[q],local=nearestInRange(p.x,p.z,Math.max(0,hint-40),Math.min(testSegments.length-1,hint+40));
  const got=local.d2<=400?local:fullNearest(p.x,p.z);
  hint=got.i;
  const ref=fullResults[q];
  if(got.i!==ref.i||Math.abs(got.cum-ref.cum)>1e-7)routeMismatch++;
}
const hintMs=performance.now()-tHint;
assert(routeMismatch===0,`vehicle nearest-route hint mismatch=${routeMismatch}`);
console.log('PASS two-axle traction fast path: 100000 states, 0 mismatch');
console.log(`PASS vehicle nearest-route hint: 12000 samples, 0 mismatch, ${(fullMs/Math.max(.001,hintMs)).toFixed(2)}x synthetic speedup`);
console.log('PASS cached yaw response: exact formula equivalence');
console.log(`PASS local road support plane: max synthetic error ${(maxSupportError*1000).toFixed(2)} mm`);
console.log('PASS V21.21.4 renderer quality settings unchanged');
console.log('PASS full-rate instruments retained with static-layer caches');
console.log('PASS precise crest/jump probes retained');
