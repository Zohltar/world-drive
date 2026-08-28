import * as THREE from 'three';
import {createMultiplayerVisualSystem} from '/src/multiplayer-visuals-m3.js';

const WIDTH=640;
const HEIGHT=360;

function waitFor(predicate,{timeoutMs=12000,label='condition'}={}){
  const started=performance.now();
  return new Promise((resolve,reject)=>{
    const tick=()=>{
      let value;
      try{value=predicate();}catch(error){reject(error);return;}
      if(value){resolve(value);return;}
      if(performance.now()-started>timeoutMs){reject(new Error(`Timeout waiting for ${label}`));return;}
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function makeState(gear){
  return{
    absX:0,absZ:0,renderX:0,renderZ:0,heading:0,speed:0,steerAngle:0,
    gear,braking:false,reversing:gear===-1,nightLevel:0,
    signalLeft:false,signalRight:false,signalBlink:false,distance:10
  };
}

function frameCamera(camera,object){
  object.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(object);
  const size=new THREE.Vector3();
  const center=new THREE.Vector3();
  box.getSize(size);box.getCenter(center);
  const distance=Math.max(4.5,size.z*1.15,size.x*1.8);
  camera.position.set(center.x,center.y+size.y*.05,box.min.z-distance);
  camera.lookAt(center.x,center.y,center.z);
  camera.near=.05;
  camera.far=100;
  camera.updateProjectionMatrix();
  return{box,size,center,distance};
}

function readPixels(renderer){
  const gl=renderer.getContext();
  const pixels=new Uint8Array(WIDTH*HEIGHT*4);
  gl.readPixels(0,0,WIDTH,HEIGHT,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  return pixels;
}

function comparePixels(base,lit){
  let changed=0,strong=0,positive=0,totalPositive=0,maxDelta=0;
  let minX=WIDTH,minY=HEIGHT,maxX=-1,maxY=-1;
  for(let i=0;i<WIDTH*HEIGHT;i++){
    const o=i*4;
    const b=.2126*base[o]+.7152*base[o+1]+.0722*base[o+2];
    const l=.2126*lit[o]+.7152*lit[o+1]+.0722*lit[o+2];
    const d=l-b;
    if(Math.abs(d)>2){
      changed++;
      const x=i%WIDTH,y=Math.floor(i/WIDTH);
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    if(d>2){positive++;totalPositive+=d;maxDelta=Math.max(maxDelta,d);}
    if(d>12)strong++;
  }
  return{
    changed,positive,strong,maxDelta,
    averagePositive:positive?totalPositive/positive:0,
    bbox:changed?{minX,minY,maxX,maxY,width:maxX-minX+1,height:maxY-minY+1}:null
  };
}

async function testVehicle(vehicleId){
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x030507);
  const camera=new THREE.PerspectiveCamera(42,WIDTH/HEIGHT,.05,100);
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH,HEIGHT,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  document.body.innerHTML='';
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff,0x223344,2.4));
  const key=new THREE.DirectionalLight(0xffffff,3.2);
  key.position.set(0,5,-6);scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,1.2);
  fill.position.set(3,2,4);scene.add(fill);

  const system=createMultiplayerVisualSystem({
    THREE,scene,
    llToXZ:()=>({x:0,z:0}),
    groundHeightForWheel:()=>0
  });
  const visual=system.createRemoteVehicleVisual(vehicleId,`GPU-${vehicleId}`);
  scene.add(visual.root);
  const adapter=visual.vehicleAdapter;
  await adapter.ensureLoaded();
  await waitFor(()=>adapter.ready,{label:`${vehicleId} adapter ready`});

  const drive=makeState(1);
  visual.setRemoteVisible?.(true,drive);
  visual.setLighting?.(drive);
  visual.updateRemoteVehicle?.(1/60,drive);
  visual.root.updateMatrixWorld(true);
  const framing=frameCamera(camera,visual.bodyGroup);
  key.position.copy(camera.position).add(new THREE.Vector3(0,3,0));
  key.target.position.copy(framing.center);scene.add(key.target);

  renderer.render(scene,camera);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  renderer.render(scene,camera);
  const drivePixels=readPixels(renderer);

  const reverse=makeState(-1);
  visual.setRemoteVisible?.(true,reverse);
  visual.setLighting?.(reverse);
  visual.updateRemoteVehicle?.(1/60,reverse);
  renderer.render(scene,camera);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  renderer.render(scene,camera);
  const reversePixels=readPixels(renderer);

  const neutral=makeState(0);
  visual.setRemoteVisible?.(true,neutral);
  visual.setLighting?.(neutral);
  visual.updateRemoteVehicle?.(1/60,neutral);
  renderer.render(scene,camera);
  await new Promise(resolve=>requestAnimationFrame(resolve));
  renderer.render(scene,camera);
  const neutralPixels=readPixels(renderer);

  const on=comparePixels(drivePixels,reversePixels);
  const off=comparePixels(neutralPixels,reversePixels);
  const diagnostics=adapter.diagnostics();

  const result={
    vehicleId,
    renderer:renderer.info.render,
    adapter:{
      ready:adapter.ready,
      gear:diagnostics.gear,
      reversing:diagnostics.reversing,
      reverseMaterialCount:diagnostics.reverseMaterialCount,
      reverseRequested:diagnostics.reverseRequested,
      reverseGlowOpacity:diagnostics.reverseGlowOpacity
    },
    driveToReverse:on,
    neutralToReverse:off,
    framing:{
      size:{x:framing.size.x,y:framing.size.y,z:framing.size.z},
      distance:framing.distance
    }
  };

  if((diagnostics.reverseMaterialCount??0)<1)throw new Error(`${vehicleId}: no authored reverse material bound`);
  if(on.positive<20||on.strong<4||on.maxDelta<12){
    throw new Error(`${vehicleId}: reverse state changed materials but produced insufficient rear-camera pixel evidence ${JSON.stringify(on)}`);
  }
  if(off.positive<20||off.strong<4||off.maxDelta<12){
    throw new Error(`${vehicleId}: reverse -> Neutral comparison lacks visible reverse pixel evidence ${JSON.stringify(off)}`);
  }

  visual.dispose?.();
  renderer.dispose();
  scene.clear();
  return result;
}

(async()=>{
  try{
    const reports=[];
    for(const id of ['sonata','wrx'])reports.push(await testVehicle(id));
    globalThis.__M414_RESULT__={ok:true,reports};
    console.log('M4.14 GPU QA PASS',reports);
  }catch(error){
    globalThis.__M414_RESULT__={ok:false,error:String(error?.stack||error)};
    console.error('M4.14 GPU QA FAIL',error);
  }
})();
