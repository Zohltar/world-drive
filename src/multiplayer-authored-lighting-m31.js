// Multiplayer M3.1 local-parity lighting overrides.
//
// The generic M3 authored-light system remains the default for the fleet. This
// module only owns two paths that have already been proven by their local GLB
// implementations:
//   - WRX reverse lamps: physical rear-cluster + fh_light_glass material test.
//   - Sonata all lamps: the exact Object_46/Object_33/Object_7 textured-lens
//     shader used by the local Sonata instead of the generic remote mask.

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));

function materialsOf(object){
  return Array.isArray(object?.material)?object.material:[object?.material].filter(Boolean);
}

function semanticPath(object,root){
  const names=[];
  let cursor=object;
  while(cursor&&cursor!==root?.parent){
    if(cursor.name)names.push(String(cursor.name).toLowerCase());
    for(const material of materialsOf(cursor)){
      if(material?.name)names.push(String(material.name).toLowerCase());
    }
    cursor=cursor.parent;
  }
  return names.join(' ');
}

function allMeshes(root){
  const out=[];
  root?.traverse?.(object=>{
    if(object?.isMesh||object?.isSkinnedMesh)out.push(object);
  });
  return out;
}

function cloneDynamicMaterials(THREE,mesh,target,color,prefix){
  const source=materialsOf(mesh);
  if(!source.length)return 0;
  const copies=[];
  for(let index=0;index<source.length;index++){
    const material=source[index];
    if(!material?.clone)continue;
    const copy=material.clone();
    copy.name=`${prefix}-${index}`;
    if(!copy.emissive)copy.emissive=new THREE.Color(color);
    else copy.emissive.setHex(color);
    if('emissiveIntensity' in copy)copy.emissiveIntensity=.01;
    copy.toneMapped=false;
    copy.dithering=true;
    if(copy.transparent)copy.depthWrite=false;
    copy.needsUpdate=true;
    copies.push(copy);
    target.push(copy);
  }
  if(!copies.length)return 0;
  mesh.material=Array.isArray(mesh.material)?copies:copies[0];
  return copies.length;
}

function setEmission(materials,color,intensity){
  for(const material of materials){
    material.emissive?.setHex?.(color);
    if('emissiveIntensity' in material)material.emissiveIntensity=intensity;
    material.needsUpdate=true;
  }
}

function bindWrxReverseLikeLocal(THREE,root){
  const reverseMaterials=[];
  root?.updateMatrixWorld?.(true);
  for(const mesh of allMeshes(root)){
    const path=semanticPath(mesh,root);
    // Match the local WRX ordering: red/brake pieces are consumed before the
    // clear-lens reverse test and therefore must never qualify as reverse.
    if(
      path.includes('fh_light_glass_red_material')||
      path.includes('fh_taillight_new_material')||
      path.includes('fh_chmsl_new_material')
    )continue;

    const box=new THREE.Box3().setFromObject(mesh);
    const center=new THREE.Vector3();
    box.getCenter(center);
    root.worldToLocal(center);
    const isRearCluster=center.z<-1.7&&center.y>.65;
    if(!isRearCluster)continue;

    const materialNames=materialsOf(mesh).map(material=>String(material?.name||'').toLowerCase());
    if(!materialNames.some(name=>name.includes('fh_light_glass')))continue;
    cloneDynamicMaterials(THREE,mesh,reverseMaterials,0xffffff,'remote-wrx-reverse-m31');
  }
  return reverseMaterials;
}

function makeSonataLensGlowMaterial(THREE,{sourceMaterial,filterMode=0,sideMode=0,tint=0xffffff,whiteWarmth=0,uvRegion=null,tintMix=1}={}){
  const region=uvRegion||{};
  const uvMin=region.min||[0,0];
  const uvMax=region.max||[1,1];
  const uvFeather=region.feather||[0,0];
  return new THREE.ShaderMaterial({
    uniforms:{
      uMap:{value:sourceMaterial.map},
      uOpacity:{value:0},
      uTint:{value:new THREE.Color(tint)},
      uFilterMode:{value:filterMode},
      uSideMode:{value:sideMode},
      uWhiteWarmth:{value:whiteWarmth},
      uTintMix:{value:tintMix},
      uUseUvRegion:{value:uvRegion?1:0},
      uUvMin:{value:new THREE.Vector2(...uvMin)},
      uUvMax:{value:new THREE.Vector2(...uvMax)},
      uUvFeather:{value:new THREE.Vector2(...uvFeather)}
    },
    transparent:true,
    depthWrite:false,
    depthTest:true,
    toneMapped:false,
    side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,
    polygonOffset:true,
    polygonOffsetFactor:-2,
    polygonOffsetUnits:-2,
    vertexColors:true,
    vertexShader:`
      varying vec2 vUv;
      varying vec3 vLocalPos;
      void main(){
        vUv=uv;
        vLocalPos=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform vec3 uTint;
      uniform float uFilterMode;
      uniform float uSideMode;
      uniform float uWhiteWarmth;
      uniform float uTintMix;
      uniform float uUseUvRegion;
      uniform vec2 uUvMin;
      uniform vec2 uUvMax;
      uniform vec2 uUvFeather;
      varying vec2 vUv;
      varying vec3 vLocalPos;

      void main(){
        vec3 rawTex=texture2D(uMap,vUv).rgb;
        vec3 tex=rawTex;
        float lum=dot(tex,vec3(0.2126,0.7152,0.0722));
        float maxc=max(tex.r,max(tex.g,tex.b));
        float minc=min(tex.r,min(tex.g,tex.b));
        float colorSpread=maxc-minc;

        float redRatioG=tex.g/max(tex.r,0.001);
        float redRatioB=tex.b/max(tex.r,0.001);
        float redDominance=tex.r-max(tex.g,tex.b);
        float redMask=smoothstep(0.30,0.44,tex.r)
          *(1.0-smoothstep(0.24,0.32,redRatioG))
          *(1.0-smoothstep(0.27,0.36,redRatioB))
          *smoothstep(0.14,0.24,redDominance);

        float amberRatioG=tex.g/max(tex.r,0.001);
        float amberRatioB=tex.b/max(tex.r,0.001);
        float amberMaskA=smoothstep(0.34,0.52,tex.r)
          *smoothstep(0.10,0.22,tex.g)
          *(1.0-smoothstep(0.85,1.06,amberRatioG))
          *(1.0-smoothstep(0.38,0.62,amberRatioB));
        float amberMaskB=smoothstep(0.42,0.60,tex.r)
          *smoothstep(0.18,0.34,tex.g)
          *(1.0-smoothstep(0.78,1.00,amberRatioG))
          *(1.0-smoothstep(0.26,0.46,tex.b/max(tex.g,0.001)));
        float amberMask=max(amberMaskA,amberMaskB);
        float whiteMask=smoothstep(0.28,0.48,lum)
          *(1.0-smoothstep(0.28,0.50,colorSpread));

        float filterMask=redMask;
        if(uFilterMode>0.5&&uFilterMode<1.5)filterMask=amberMask;
        else if(uFilterMode>=1.5)filterMask=whiteMask;

        float sideMask=1.0;
        if(uSideMode<-.5)sideMask=1.0-smoothstep(-0.08,0.18,vLocalPos.x);
        else if(uSideMode>.5)sideMask=smoothstep(-0.18,0.08,vLocalPos.x);

        float uvMask=1.0;
        if(uUseUvRegion>.5){
          float uEnter=smoothstep(uUvMin.x-uUvFeather.x,uUvMin.x+uUvFeather.x,vUv.x);
          float uExit=1.0-smoothstep(uUvMax.x-uUvFeather.x,uUvMax.x+uUvFeather.x,vUv.x);
          float vEnter=smoothstep(uUvMin.y-uUvFeather.y,uUvMin.y+uUvFeather.y,vUv.y);
          float vExit=1.0-smoothstep(uUvMax.y-uUvFeather.y,uUvMax.y+uUvFeather.y,vUv.y);
          uvMask=uEnter*uExit*vEnter*vExit;
        }

        float alpha=uOpacity*filterMask*sideMask*uvMask;
        if(alpha<0.01)discard;
        vec3 tint=uTint;
        if(uFilterMode>=1.5)tint=mix(tint,vec3(1.0,0.96,0.90),uWhiteWarmth);
        vec3 litColor=mix(rawTex,tint,clamp(uTintMix,0.0,1.0));
        gl_FragColor=vec4(litColor*filterMask,alpha);
      }
    `
  });
}

function registerSonataGlow(THREE,sourceMesh,target,{filter='red',side=0,tint=0xffffff,whiteWarmth=0,uvRegion=null,tintMix=1,role='lamp'}={},ownedObjects,ownedMaterials){
  if(!sourceMesh?.isMesh&&!sourceMesh?.isSkinnedMesh)return null;
  if(!sourceMesh?.geometry||!sourceMesh?.parent)return null;
  const sourceMaterial=materialsOf(sourceMesh).find(material=>material?.map);
  if(!sourceMaterial)return null;
  const filterMode=filter==='red'?0:(filter==='amber'?1:2);
  const material=makeSonataLensGlowMaterial(THREE,{sourceMaterial,filterMode,sideMode:side,tint,whiteWarmth,uvRegion,tintMix});
  const mesh=new THREE.Mesh(sourceMesh.geometry,material);
  mesh.name=`remote-sonata-m31-${role}`;
  // Match the proven local Sonata exactly: sibling overlay with the source
  // mesh's local transform, not a generic child-mask abstraction.
  mesh.position.copy(sourceMesh.position);
  mesh.quaternion.copy(sourceMesh.quaternion);
  mesh.scale.copy(sourceMesh.scale);
  mesh.renderOrder=(sourceMesh.renderOrder||0)+2;
  mesh.visible=false;
  mesh.frustumCulled=sourceMesh.frustumCulled;
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  sourceMesh.parent.add(mesh);
  const entry={mesh,material,filter,side,role};
  target.push(entry);
  ownedObjects.push(mesh);
  ownedMaterials.add(material);
  return entry;
}

function setGlow(entries,opacity){
  const value=clamp01(opacity);
  for(const entry of entries){
    entry.material.uniforms.uOpacity.value=value;
    entry.material.needsUpdate=true;
    entry.mesh.visible=value>.006;
  }
}

function makeProjectors(THREE,parent,ownedObjects){
  const beams=[];
  for(const side of [-1,1]){
    const target=new THREE.Object3D();
    target.position.set(side*.45,.15,30);
    parent.add(target);
    const light=new THREE.SpotLight(0xf8fbff,0,72,.36,.68,1.0);
    light.name=`remote-sonata-m31-headlight-${side<0?'l':'r'}`;
    light.position.set(side*.68,.66,2.25);
    light.target=target;
    light.castShadow=false;
    light.visible=false;
    parent.add(light);
    beams.push(light);
    ownedObjects.push(light,target);
  }
  return beams;
}

function createSonataLighting(THREE,root){
  const rearRed=[];
  const reverse=[];
  const headlight=[];
  const signalLeft=[];
  const signalRight=[];
  const ownedObjects=[];
  const ownedMaterials=new Set();

  const inner=root?.getObjectByName?.('Object_46');
  const outer=root?.getObjectByName?.('Object_33');
  const front=root?.getObjectByName?.('Object_7');

  if(inner?.isMesh||inner?.isSkinnedMesh){
    registerSonataGlow(THREE,inner,rearRed,{filter:'red',side:0,tint:0xff2a2e,tintMix:.42,uvRegion:{min:[.04,.842],max:[.54,1],feather:[.004,.004]},role:'rear-inner-red'},ownedObjects,ownedMaterials);
    registerSonataGlow(THREE,inner,reverse,{filter:'white',side:0,tint:0xf8fbff,whiteWarmth:.15,tintMix:.78,role:'reverse'},ownedObjects,ownedMaterials);
  }
  if(outer?.isMesh||outer?.isSkinnedMesh){
    registerSonataGlow(THREE,outer,rearRed,{filter:'red',side:0,tint:0xff2a2e,tintMix:.42,uvRegion:{min:[.44,.842],max:[.96,1],feather:[.004,.004]},role:'rear-outer-red'},ownedObjects,ownedMaterials);
    registerSonataGlow(THREE,outer,signalLeft,{filter:'amber',side:-1,tint:0xffb21c,tintMix:.88,role:'left-rear-signal'},ownedObjects,ownedMaterials);
    registerSonataGlow(THREE,outer,signalRight,{filter:'amber',side:1,tint:0xffb21c,tintMix:.88,role:'right-rear-signal'},ownedObjects,ownedMaterials);
  }
  if(front?.isMesh||front?.isSkinnedMesh){
    registerSonataGlow(THREE,front,headlight,{filter:'white',side:0,tint:0xf8fbff,whiteWarmth:.05,tintMix:.82,role:'headlight'},ownedObjects,ownedMaterials);
    registerSonataGlow(THREE,front,signalLeft,{filter:'amber',side:-1,tint:0xffb21c,tintMix:.88,role:'left-front-signal'},ownedObjects,ownedMaterials);
    registerSonataGlow(THREE,front,signalRight,{filter:'amber',side:1,tint:0xffb21c,tintMix:.88,role:'right-front-signal'},ownedObjects,ownedMaterials);
  }

  const beams=makeProjectors(THREE,root,ownedObjects);
  const counts={brake:rearRed.length,reverse:reverse.length,night:headlight.length+rearRed.length,'signal-left':signalLeft.length,'signal-right':signalRight.length};
  const required=['brake','reverse','night','signal-left','signal-right'];
  const missingFamilies=required.filter(family=>(counts[family]||0)<=0);
  let disposed=false;
  let updates=0;
  let lastState={};

  function setState(input={}){
    if(disposed)return;
    lastState={...lastState,...input};
    const night=clamp01(lastState.nightLevel);
    const nightOn=night>.06;
    const braking=!!lastState.braking;
    const reversing=!!lastState.reversing;
    const left=!!lastState.signalLeft&&!!lastState.signalBlink;
    const right=!!lastState.signalRight&&!!lastState.signalBlink;

    // This is the exact local Sonata relationship: the same authored red lens
    // owns both running and brake glow. M3 previously counted that lens as a
    // brake capability but only drove it from the night-running state.
    const rearRedOpacity=Math.max(nightOn?(.16+night*.18):0,braking?.52:0);
    setGlow(rearRed,rearRedOpacity);
    setGlow(reverse,reversing?.98:0);
    setGlow(headlight,nightOn?(.45+night*.28):0);
    setGlow(signalLeft,left?.98:0);
    setGlow(signalRight,right?.98:0);

    const distance=Math.max(0,Number(lastState.distance)||0);
    const beamFade=1-clamp01((distance-180)/180);
    for(const beam of beams){
      beam.visible=nightOn&&beamFade>.02;
      beam.intensity=nightOn?night*95*beamFade:0;
      beam.distance=65+night*15;
    }
    updates++;
  }

  setState({});
  return {
    ready:missingFamilies.length===0,
    missingFamilies:Object.freeze(missingFamilies),
    setState,
    diagnostics:()=>({vehicleId:'sonata',implementation:'m3.1-local-sonata-lighting',ready:missingFamilies.length===0,missingFamilies:[...missingFamilies],counts:{...counts},updates}),
    dispose(){
      if(disposed)return;
      disposed=true;
      for(const object of ownedObjects)object.removeFromParent?.();
      for(const material of ownedMaterials)material.dispose?.();
    }
  };
}

function createWrxReverseLighting(THREE,root){
  const reverseMaterials=bindWrxReverseLikeLocal(THREE,root);
  let disposed=false;
  let updates=0;
  function setState(input={}){
    if(disposed)return;
    setEmission(reverseMaterials,0xffffff,input.reversing?5.2:.01);
    updates++;
  }
  setState({});
  return {
    ready:reverseMaterials.length>0,
    missingFamilies:Object.freeze(reverseMaterials.length?[]:['reverse']),
    setState,
    diagnostics:()=>({vehicleId:'wrx',implementation:'m3.1-local-wrx-reverse',ready:reverseMaterials.length>0,reverseMaterials:reverseMaterials.length,selector:'rear-cluster + fh_light_glass',updates}),
    dispose(){
      if(disposed)return;
      disposed=true;
      for(const material of reverseMaterials)material.dispose?.();
    }
  };
}

export function createLocalParityRemoteLighting(THREE,vehicleId,root){
  if(!THREE||!root)return null;
  if(vehicleId==='wrx')return createWrxReverseLighting(THREE,root);
  if(vehicleId==='sonata')return createSonataLighting(THREE,root);
  return null;
}
