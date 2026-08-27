import {createRemoteAuthoredLighting as createBaseRemoteAuthoredLighting} from './multiplayer-authored-lighting.js';

// M2.5.1 — WRX reverse-lamp binding hardening.
//
// M2.5 already routes replicated lighting into peer-local GLB materials. On the
// WRX, some loader/material variants do not satisfy the original exact reverse
// material predicate even though the authored clear rear lens is present. When
// (and only when) the base WRX controller reports zero reverse bindings, locate
// that real rear clear-lens geometry and give the peer clone its own emissive
// material. No procedural rectangle/plane is created.

function semanticPath(object,root){
  const names=[];
  let cursor=object;
  while(cursor&&cursor!==root?.parent){
    if(cursor.name)names.push(String(cursor.name).toLowerCase());
    const materials=Array.isArray(cursor?.material)?cursor.material:[cursor?.material];
    for(const material of materials){
      if(material?.name)names.push(String(material.name).toLowerCase());
    }
    cursor=cursor.parent;
  }
  return names.join(' ');
}

function localCenter(THREE,root,object){
  root.updateMatrixWorld?.(true);
  const box=new THREE.Box3().setFromObject(object);
  const center=new THREE.Vector3();
  box.getCenter(center);
  return root.worldToLocal(center);
}

function wrxReverseCandidateScore(THREE,root,object){
  if(!object?.isMesh&&!object?.isSkinnedMesh)return -Infinity;
  if(!object.material)return -Infinity;

  const path=semanticPath(object,root);
  const center=localCenter(THREE,root,object);

  // Rear lamp cluster only. The WRX is normalized with +Z = nose.
  if(center.z>-1.25||center.y<.40)return -Infinity;

  // Never repurpose authored red/amber/brake pieces as reverse lamps.
  if(/red|taillight_new|chmsl|brake|signal|indicator|amber|orange/.test(path)){
    return -Infinity;
  }

  let score=0;
  if(path.includes('reverse')||path.includes('backup')||path.includes('back_up'))score+=240;
  if(path.includes('fh_light_glass'))score+=150;
  if(path.includes('light_glass'))score+=90;
  if(path.includes('glass'))score+=45;
  if(path.includes('light')||path.includes('lamp'))score+=25;
  if(score<=0)return -Infinity;

  // Prefer the furthest-rear authored clear element while keeping both
  // symmetric sides when they score similarly.
  score+=Math.min(35,Math.max(0,-center.z*8));
  return score;
}

function makeReverseMaterial(THREE,source,index){
  const material=source.clone();
  material.name=`remote-wrx-reverse-authored-m251-${index}`;
  if(!material.emissive)material.emissive=new THREE.Color(0xffffff);
  else material.emissive.setHex(0xffffff);
  if('emissiveIntensity' in material)material.emissiveIntensity=.01;
  material.toneMapped=false;
  material.dithering=true;
  if(material.transparent)material.depthWrite=false;
  material.needsUpdate=true;
  return material;
}

function bindWrxReverseFallback(THREE,root){
  const candidates=[];
  root.traverse(object=>{
    const score=wrxReverseCandidateScore(THREE,root,object);
    if(Number.isFinite(score))candidates.push({object,score});
  });

  if(!candidates.length)return null;
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0].score;

  // Keep every near-equivalent authored lens so left/right clusters both bind,
  // but reject lower-confidence unrelated rear glass.
  const selected=candidates
    .filter(entry=>entry.score>=best-12)
    .slice(0,4);

  const materials=[];
  const meshes=[];
  for(const {object} of selected){
    const source=Array.isArray(object.material)?object.material:[object.material];
    const copies=source.map((material,index)=>{
      const copy=makeReverseMaterial(THREE,material,materials.length+index);
      materials.push(copy);
      return copy;
    });
    object.material=Array.isArray(object.material)?copies:copies[0];
    meshes.push(object);
  }

  let reversing=false;
  let updates=0;
  function setState(state={}){
    reversing=!!state.reversing;
    for(const material of materials){
      material.emissive?.setHex?.(0xffffff);
      if('emissiveIntensity' in material){
        material.emissiveIntensity=reversing?5.6:.01;
      }
      material.needsUpdate=true;
    }
    updates++;
  }
  setState({reversing:false});

  return {
    setState,
    dispose(){
      for(const material of new Set(materials))material.dispose?.();
    },
    diagnostics(){
      return {
        mode:'wrx-authored-reverse-fallback-m251',
        meshes:meshes.map(mesh=>mesh.name||'(unnamed)'),
        materials:materials.length,
        reversing,
        updates
      };
    }
  };
}

export function createRemoteAuthoredLighting(THREE,vehicleId,root){
  const base=createBaseRemoteAuthoredLighting(THREE,vehicleId,root);
  if(!base)return base;

  const baseDiagnostics=base.diagnostics?.()||{};
  const needsWrxFallback=
    vehicleId==='wrx'&&
    !(Number(baseDiagnostics.reverse)>0);
  const wrxReverseFallback=needsWrxFallback
    ?bindWrxReverseFallback(THREE,root)
    :null;

  if(!wrxReverseFallback)return base;

  return {
    ...base,
    // Keep the ownership mode stable so multiplayer-visuals continues to switch
    // off every procedural/fallback lamp as soon as the HD GLB is ready.
    mode:'authored-glb-lamps-v1',
    setState(state={}){
      base.setState?.(state);
      wrxReverseFallback.setState(state);
    },
    diagnostics(){
      const current=base.diagnostics?.()||{};
      const fallback=wrxReverseFallback.diagnostics();
      return {
        ...current,
        reverse:Math.max(Number(current.reverse)||0,fallback.materials),
        reverseBinding:'wrx-authored-fallback-m251',
        reverseFallback:fallback
      };
    },
    dispose(){
      wrxReverseFallback.dispose();
      base.dispose?.();
    }
  };
}
