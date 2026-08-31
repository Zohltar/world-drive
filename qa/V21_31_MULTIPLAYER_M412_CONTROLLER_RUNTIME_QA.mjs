import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {createMultiplayerVisualSystem} from '../src/multiplayer/multiplayer-visuals-m3.js';

// M4.12 runs the actual authored GLB controllers without a WebGL renderer.
// We still load the real GLB, build real Three.js meshes/materials and drive the
// exact remote adapter state machine. Only image decoding is replaced by a tiny
// placeholder because this test validates binding/visibility/material state,
// while the Sonata pixel QA separately validates the real embedded texture.

const originalFetch=globalThis.fetch;
globalThis.self=globalThis;
globalThis.fetch=async(input,init)=>{
  const value=typeof input==='string'?input:input?.url;
  if(typeof value==='string'&&value.startsWith('file:')){
    const data=await fs.readFile(fileURLToPath(value));
    return new Response(data,{status:200,headers:{'content-type':'application/octet-stream'}});
  }
  return originalFetch(input,init);
};

if(typeof globalThis.ProgressEvent!=='function'){
  globalThis.ProgressEvent=class ProgressEvent{
    constructor(type,init={}){this.type=type;Object.assign(this,init);}
  };
}

globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});

const fakeContext=()=>({
  clearRect(){},beginPath(){},roundRect(){return this;},fill(){},stroke(){},fillText(){},
  measureText(text){return{width:String(text||'').length*28};},
  font:'',textAlign:'center',textBaseline:'middle',fillStyle:'',strokeStyle:'',lineWidth:1
});
globalThis.document={
  createElement(type){
    if(type!=='canvas')return{};
    const ctx=fakeContext();
    return{width:1,height:1,getContext:()=>ctx};
  }
};

function waitFor(predicate,{timeoutMs=8000,label='condition'}={}){
  const started=Date.now();
  return new Promise((resolve,reject)=>{
    const tick=()=>{
      let value;
      try{value=predicate();}catch(error){reject(error);return;}
      if(value){resolve(value);return;}
      if(Date.now()-started>timeoutMs){reject(new Error(`Timeout waiting for ${label}`));return;}
      setTimeout(tick,20);
    };
    tick();
  });
}

function whiteVisualState(host){
  const hot=[];
  const shader=[];
  host?.traverse?.(obj=>{
    for(const mat of (Array.isArray(obj?.material)?obj.material:[obj?.material])){
      if(!mat)continue;
      const e=mat.emissive;
      const intensity=Number(mat.emissiveIntensity)||0;
      if(e&&intensity>.5&&e.r>.7&&e.g>.7&&e.b>.7){
        hot.push({object:obj.name||'',material:mat.name||'',intensity});
      }
      const opacity=Number(mat.uniforms?.uOpacity?.value)||0;
      const tint=mat.uniforms?.uTint?.value;
      if(opacity>.04&&tint&&tint.r>.7&&tint.g>.7&&tint.b>.7){
        shader.push({object:obj.name||'',material:mat.name||'',opacity,visible:obj.visible!==false});
      }
    }
  });
  return{hot,shader};
}

function reverseVisualState(vehicleId,host){
  const white=whiteVisualState(host);
  if(vehicleId==='sonata'){
    return{
      all:white,
      active:white.shader.filter(entry=>entry.object.includes('Object_46-white-0')&&entry.visible)
    };
  }
  if(vehicleId==='wrx'){
    return{
      all:white,
      active:white.hot.filter(entry=>entry.object==='Object_27')
    };
  }
  return{all:white,active:[]};
}

function state({gear=1,braking=false,nightLevel=0}={}){
  return{
    absX:100,absZ:200,renderX:10,renderZ:20,heading:.4,speed:0,steerAngle:0,
    gear,braking,reversing:gear===-1,nightLevel,
    signalLeft:false,signalRight:false,signalBlink:false,distance:12
  };
}

async function exercise(vehicleId){
  const scene=new THREE.Scene();
  const system=createMultiplayerVisualSystem({
    THREE,scene,
    llToXZ:()=>({x:0,z:0}),
    groundHeightForWheel:()=>0
  });
  const visual=system.createRemoteVehicleVisual(vehicleId,`QA-${vehicleId}`);
  assert(visual?.root,`${vehicleId}: remote visual not created`);
  scene.add(visual.root);

  const adapter=visual.vehicleAdapter;
  assert(adapter,`${vehicleId}: M4 adapter missing`);
  await adapter.ensureLoaded();
  await waitFor(()=>adapter.ready,{label:`${vehicleId} authored controller`});
  assert.equal(adapter.loadError,null,`${vehicleId}: authored GLB load failed: ${adapter.loadError||''}`);
  assert.equal(adapter.ready,true,`${vehicleId}: authored controller never became ready`);

  const drive=state({gear:1});
  visual.setRemoteVisible?.(true,drive);
  visual.setLighting?.(drive);
  visual.updateRemoteVehicle?.(1/60,drive);
  let diag=adapter.diagnostics();
  let reverseVisual=reverseVisualState(vehicleId,visual.bodyGroup);
  assert.equal(diag.gear,1,`${vehicleId}: initial forward gear lost`);
  assert.equal(diag.reversing,false,`${vehicleId}: forward state starts in reverse`);
  assert.equal(reverseVisual.active.length,0,`${vehicleId}: authored reverse output visible in Drive`);

  const reverse=state({gear:-1});
  visual.setRemoteVisible?.(true,reverse);
  visual.setLighting?.(reverse);
  visual.updateRemoteVehicle?.(1/60,reverse);
  diag=adapter.diagnostics();
  reverseVisual=reverseVisualState(vehicleId,visual.bodyGroup);
  assert.equal(diag.gear,-1,`${vehicleId}: adapter lost explicit -1`);
  assert.equal(diag.reversing,true,`${vehicleId}: adapter did not derive reversing=true`);
  assert((diag.reverseMaterialCount??0)>0,`${vehicleId}: authored controller bound zero reverse materials/layers`);
  assert(reverseVisual.active.length>0,`${vehicleId}: real authored controller produced no active reverse output`);

  if(vehicleId==='sonata'){
    assert.equal(diag.reverseRequested,true,'Sonata: authored controller did not receive reversing=true');
    assert((diag.reverseGlowOpacity??0)>.9,'Sonata: authored reverse shader opacity did not activate');
    assert(reverseVisual.active.some(entry=>entry.object.includes('Object_46-white-0')),'Sonata: Object_46 authored white overlay is not the active reverse output');
  }
  if(vehicleId==='wrx'){
    assert(reverseVisual.active.some(entry=>entry.object==='Object_27'),'WRX: proven rear fh_light_glass Object_27 is not the active white reverse output');
    assert(!reverseVisual.all.hot.some(entry=>entry.object==='Object_37'),'WRX: misleading fh_reverse_material/Object_37 must not be the active reverse output');
  }

  for(let i=0;i<120;i++){
    const gear=i%4===0?-1:(i%4===1?1:(i%4===2?0:-1));
    const frame=state({gear,braking:i%3===0,nightLevel:i%5===0?1:0});
    visual.setRemoteVisible?.(true,frame);
    visual.setLighting?.(frame);
    visual.updateRemoteVehicle?.(1/60,frame);
    const d=adapter.diagnostics();
    const rv=reverseVisualState(vehicleId,visual.bodyGroup);
    assert.equal(d.gear,gear,`${vehicleId}: gear drift at stress frame ${i}`);
    assert.equal(d.reversing,gear===-1,`${vehicleId}: reverse boolean drift at stress frame ${i}`);
    if(gear===-1){
      assert(rv.active.length>0,`${vehicleId}: reverse output dropped at stress frame ${i}`);
    }else{
      assert.equal(rv.active.length,0,`${vehicleId}: reverse output stuck on at stress frame ${i}`);
    }
  }

  visual.setRemoteVisible?.(false,reverse);
  visual.setLighting?.({...reverse,reversing:false,gear:null,distance:Infinity});
  visual.setRemoteVisible?.(true,reverse);
  visual.setLighting?.(reverse);
  visual.updateRemoteVehicle?.(1/60,reverse);
  diag=adapter.diagnostics();
  reverseVisual=reverseVisualState(vehicleId,visual.bodyGroup);
  assert.equal(diag.gear,-1,`${vehicleId}: visibility round-trip lost reverse gear`);
  assert.equal(diag.reversing,true,`${vehicleId}: visibility round-trip lost reverse state`);
  assert(reverseVisual.active.length>0,`${vehicleId}: reverse output did not recover after visibility round-trip`);

  visual.dispose?.();
  scene.clear();
  return{
    vehicleId,
    reverseMaterialCount:diag.reverseMaterialCount,
    reverseRequested:diag.reverseRequested,
    reverseGlowOpacity:diag.reverseGlowOpacity,
    reverseEvidence:diag.reverseVisualEvidence,
    stressFrames:120,
    brakeNightCrossTalkChecked:true,
    visibilityRoundTrip:true
  };
}

const reports=[];
for(const id of ['sonata','wrx'])reports.push(await exercise(id));

console.log('V21.31 MULTIPLAYER M4.12 AUTHORED CONTROLLER RUNTIME QA: PASS',reports);
