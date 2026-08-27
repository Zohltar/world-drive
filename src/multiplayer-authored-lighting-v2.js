import {getMultiplayerVehicleSpec} from './multiplayer-vehicle-registry.js';

// Multiplayer M3 authored lighting.
// Every dynamic light is bound to geometry already present in the peer's GLB.
// No rectangular/procedural lamp is created after the HD model is ready.

const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));

export function computeRemoteLightLevels(input={}){
  const night=clamp01(input.nightLevel);
  const nightOn=night>.035;
  const braking=!!input.braking;
  const reversing=!!input.reversing;
  const blink=!!input.signalBlink;
  return Object.freeze({
    night,
    nightOn,
    brake:braking?5.4:.01,
    running:nightOn?(.35+night*2.5):.01,
    reverse:reversing?5.4:.01,
    headlight:nightOn?(.80+night*5.8):.01,
    leftSignal:input.signalLeft&&blink?5.5:.01,
    rightSignal:input.signalRight&&blink?5.5:.01,
    braking,
    reversing,
    leftOn:!!input.signalLeft&&blink,
    rightOn:!!input.signalRight&&blink
  });
}

function materialsOf(obj){return Array.isArray(obj?.material)?obj.material:[obj?.material].filter(Boolean);}
function semanticPath(obj,root){
  const out=[];let p=obj;
  while(p&&p!==root?.parent){
    if(p.name)out.push(String(p.name).toLowerCase());
    for(const mat of materialsOf(p))if(mat?.name)out.push(String(mat.name).toLowerCase());
    p=p.parent;
  }
  return out.join(' ');
}
function allMeshes(root){
  const out=[];root?.traverse?.(obj=>{if(obj?.isMesh||obj?.isSkinnedMesh)out.push(obj);});return out;
}
function findMeshes(root,selectors=[]){
  const terms=selectors.map(v=>String(v).toLowerCase());
  return allMeshes(root).filter(obj=>{
    const text=semanticPath(obj,root);
    return terms.some(term=>text.includes(term));
  });
}
function namedMesh(root,name){
  const obj=root?.getObjectByName?.(name);
  return obj&&(obj.isMesh||obj.isSkinnedMesh)?obj:null;
}

function dynamicMaterial(THREE,source,{name,color,intensity=.01}={}){
  if(!source?.clone)return null;
  const mat=source.clone();
  mat.name=name||`${source.name||'lamp'}-remote-dynamic`;
  if(!mat.emissive)mat.emissive=new THREE.Color(color);
  else mat.emissive.setHex(color);
  if('emissiveIntensity' in mat)mat.emissiveIntensity=intensity;
  mat.toneMapped=false;mat.dithering=true;
  if(mat.transparent)mat.depthWrite=false;
  mat.needsUpdate=true;
  return mat;
}

function replaceMaterials(THREE,mesh,target,color,prefix,ownedMaterials){
  const source=materialsOf(mesh);if(!source.length)return 0;
  const copies=source.map((mat,i)=>dynamicMaterial(THREE,mat,{name:`${prefix}-${i}`,color})).filter(Boolean);
  if(!copies.length)return 0;
  for(const mat of copies){target.push(mat);ownedMaterials.add(mat);}
  mesh.material=Array.isArray(mesh.material)?copies:copies[0];
  return copies.length;
}

function splitTriangles(THREE,mesh,categories,ownedGeometries,ownedMaterials){
  if(!mesh?.geometry||!mesh?.material)return 0;
  const geometry=mesh.geometry.clone();
  const pos=geometry.getAttribute?.('position');
  if(!pos||pos.count<3){geometry.dispose?.();return 0;}
  const source=materialsOf(mesh)[0];
  if(!source){geometry.dispose?.();return 0;}
  const index=geometry.index?Array.from(geometry.index.array):Array.from({length:pos.count},(_,i)=>i);
  const buckets=[[]];for(let i=0;i<categories.length;i++)buckets.push([]);
  for(let i=0;i+2<index.length;i+=3){
    const a=index[i],b=index[i+1],c=index[i+2];
    const x=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
    const y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
    const z=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
    let bucket=0;
    for(let j=0;j<categories.length;j++)if(categories[j].match(x,y,z)){bucket=j+1;break;}
    buckets[bucket].push(a,b,c);
  }
  if(!buckets.slice(1).some(bucket=>bucket.length)){geometry.dispose?.();return 0;}
  const mats=[source];let dynamicCount=0;
  for(const category of categories){
    const mat=dynamicMaterial(THREE,source,{name:category.name,color:category.color});
    mats.push(mat);category.target.push(mat);ownedMaterials.add(mat);dynamicCount++;
  }
  const combined=[];geometry.clearGroups();let offset=0;
  for(let i=0;i<buckets.length;i++){
    const bucket=buckets[i];if(!bucket.length)continue;
    combined.push(...bucket);geometry.addGroup(offset,bucket.length,i);offset+=bucket.length;
  }
  geometry.setIndex(combined);mesh.geometry=geometry;mesh.material=mats;ownedGeometries.add(geometry);
  return dynamicCount;
}

function makeLensOverlayMaterial(THREE,source,{color=0xffffff,filter='none',side=0,uvMin=[0,0],uvMax=[1,1]}={}){
  const mode=filter==='red'?1:(filter==='white'?2:(filter==='amber'?3:0));
  return new THREE.ShaderMaterial({
    uniforms:{
      uMap:{value:source?.map||null},uHasMap:{value:source?.map?1:0},uOpacity:{value:0},uTint:{value:new THREE.Color(color)},
      uMode:{value:mode},uSide:{value:side},uUvMin:{value:new THREE.Vector2(...uvMin)},uUvMax:{value:new THREE.Vector2(...uvMax)}
    },
    transparent:true,depthWrite:false,depthTest:true,toneMapped:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    vertexShader:`varying vec2 vUv;varying vec3 vP;void main(){vUv=uv;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D uMap;uniform float uHasMap;uniform float uOpacity;uniform vec3 uTint;uniform float uMode;uniform float uSide;uniform vec2 uUvMin;uniform vec2 uUvMax;varying vec2 vUv;varying vec3 vP;void main(){vec3 t=uHasMap>.5?texture2D(uMap,vUv).rgb:vec3(1.0);float lum=dot(t,vec3(.2126,.7152,.0722));float mx=max(t.r,max(t.g,t.b));float mn=min(t.r,min(t.g,t.b));float red=smoothstep(.26,.43,t.r)*smoothstep(.08,.22,t.r-max(t.g,t.b));float white=smoothstep(.24,.50,lum)*(1.0-smoothstep(.30,.58,mx-mn));float amber=smoothstep(.30,.54,t.r)*smoothstep(.08,.30,t.g)*(1.0-smoothstep(.42,.68,t.b/max(t.g,.001)));float mask=1.0;if(uMode>.5&&uMode<1.5)mask=red;else if(uMode>1.5&&uMode<2.5)mask=white;else if(uMode>2.5)mask=amber;float sideMask=1.0;if(uSide<-.5)sideMask=1.0-smoothstep(-.05,.12,vP.x);else if(uSide>.5)sideMask=smoothstep(-.12,.05,vP.x);float uvMask=step(uUvMin.x,vUv.x)*step(vUv.x,uUvMax.x)*step(uUvMin.y,vUv.y)*step(vUv.y,uUvMax.y);float a=uOpacity*mask*sideMask*uvMask;if(a<.008)discard;gl_FragColor=vec4(mix(t,uTint,.84)*max(mask,.25),a);}`
  });
}

function addLensOverlay(THREE,sourceMesh,target,{color,filter='none',side=0,uvMin=[0,0],uvMax=[1,1],role='lamp'}={},ownedObjects,ownedMaterials){
  if(!sourceMesh?.geometry)return null;
  const source=materialsOf(sourceMesh).find(mat=>mat?.map)||materialsOf(sourceMesh)[0];
  if(!source)return null;
  const mat=makeLensOverlayMaterial(THREE,source,{color,filter,side,uvMin,uvMax});
  const mesh=new THREE.Mesh(sourceMesh.geometry,mat);
  mesh.name=`remote-authored-${role}`;
  // Child-of-source is deliberate: it inherits the exact authored node chain.
  // This fixes Sonata/other imported assets whose parent transforms are complex.
  mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);
  mesh.visible=false;mesh.renderOrder=(sourceMesh.renderOrder||0)+4;mesh.castShadow=false;mesh.receiveShadow=false;
  sourceMesh.add(mesh);
  const entry={mesh,mat,role};target.push(entry);ownedObjects.push(mesh);ownedMaterials.add(mat);return entry;
}

function setEmission(list,color,intensity){
  for(const mat of list){mat.emissive?.setHex?.(color);if('emissiveIntensity' in mat)mat.emissiveIntensity=intensity;mat.needsUpdate=true;}
}
function setOverlays(list,opacity){
  const value=clamp01(opacity);for(const entry of list){entry.mat.uniforms.uOpacity.value=value;entry.mesh.visible=value>.006;}
}
function makeProjectors(THREE,parent,p,ownedObjects){
  const out=[];if(!p)return out;
  for(const side of [-1,1]){
    const target=new THREE.Object3D();target.position.set(side*(p.targetX??.35),p.targetY??.15,p.targetZ??32);parent.add(target);
    const light=new THREE.SpotLight(0xf8fbff,0,p.distance??78,p.angle??.37,p.penumbra??.65,p.decay??1.05);
    light.name=`remote-authored-projector-${side<0?'l':'r'}`;light.position.set(side*p.x,p.y,p.z);light.target=target;light.visible=false;light.castShadow=false;parent.add(light);
    out.push(light);ownedObjects.push(light,target);
  }
  return out;
}

function firstMesh(root,selectors){return findMeshes(root,selectors)[0]||null;}

function bindWrx(THREE,root,s){
  for(const mesh of findMeshes(root,['fh_light_glass_red_material'])){
    const g=mesh.geometry?.clone(),pos=g?.getAttribute?.('position');
    if(!g||!pos||pos.count<3){g?.dispose?.();continue;}
    let minY=Infinity,maxY=-Infinity;for(let i=0;i<pos.count;i++){minY=Math.min(minY,pos.getY(i));maxY=Math.max(maxY,pos.getY(i));}
    const cut=minY+(maxY-minY)*.50;
    const idx=g.index?Array.from(g.index.array):Array.from({length:pos.count},(_,i)=>i),lower=[],upper=[];
    for(let i=0;i+2<idx.length;i+=3){const a=idx[i],b=idx[i+1],c=idx[i+2];(((pos.getY(a)+pos.getY(b)+pos.getY(c))/3)>=cut?upper:lower).push(a,b,c);}
    if(!lower.length||!upper.length){g.dispose?.();continue;}
    const base=materialsOf(mesh)[0],brake=dynamicMaterial(THREE,base,{name:'remote-wrx-brake',color:0xff1018}),running=dynamicMaterial(THREE,base,{name:'remote-wrx-running',color:0xff2028});
    g.setIndex([...lower,...upper]);g.clearGroups();g.addGroup(0,lower.length,0);g.addGroup(lower.length,upper.length,1);mesh.geometry=g;mesh.material=[brake,running];
    s.brake.push(brake);s.running.push(running);s.ownedMaterials.add(brake);s.ownedMaterials.add(running);s.ownedGeometries.add(g);
  }
  for(const mesh of findMeshes(root,['fh_taillight_new_material','fh_chmsl_new_material']))replaceMaterials(THREE,mesh,s.brake,0xff1018,'remote-wrx-brake',s.ownedMaterials);
  // Asset audit proved this node is the real authored reverse lamp even though
  // its material is generically named "Eblems".
  for(const mesh of findMeshes(root,['fh_reverse_material']))replaceMaterials(THREE,mesh,s.reverse,0xffffff,'remote-wrx-reverse',s.ownedMaterials);
  for(const mesh of findMeshes(root,['fh_lowhighbeam_material']))replaceMaterials(THREE,mesh,s.headlight,0xf8fbff,'remote-wrx-headlight',s.ownedMaterials);
  for(const mesh of findMeshes(root,['fh_front_indicator_orange_l_material','fh_signal_l_material']))replaceMaterials(THREE,mesh,s.signalLeft,0xffb21c,'remote-wrx-left-signal',s.ownedMaterials);
  for(const mesh of findMeshes(root,['fh_front_indicator_orange_r_material','fh_signal_r_material']))replaceMaterials(THREE,mesh,s.signalRight,0xffb21c,'remote-wrx-right-signal',s.ownedMaterials);
  s.beams.push(...makeProjectors(THREE,root,{x:.98,y:.68,z:2.12,targetX:.50,targetY:.10,targetZ:36,distance:82},s.ownedObjects));
}

function bindCivic(THREE,root,s){
  for(const mesh of allMeshes(root)){
    const names=materialsOf(mesh).map(mat=>String(mat?.name||'').toLowerCase());const blob=`${String(mesh.name||'').toLowerCase()} ${names.join(' ')}`;
    if(blob.includes('red_glass')){
      splitTriangles(THREE,mesh,[{name:'remote-civic-tail',color:0xff1820,target:s.tail,match:(x,y,z)=>z<-1.48&&Math.abs(x)>.32&&y>.50&&y<1.02}],s.ownedGeometries,s.ownedMaterials);
    }else if(blob.includes('glasslights_high')||names.some(n=>n==='glass')){
      splitTriangles(THREE,mesh,[
        {name:'remote-civic-reverse',color:0xffffff,target:s.reverse,match:(x,y,z)=>z<-1.55&&Math.abs(x)>.30&&y>.50&&y<.90},
        {name:'remote-civic-headlight',color:0xf8fbff,target:s.headlight,match:(x,y,z)=>z>1.48&&Math.abs(x)>.30&&y>.58&&y<.98}
      ],s.ownedGeometries,s.ownedMaterials);
    }
    if(names.some(n=>n==='ambas_glass')){
      addLensOverlay(THREE,mesh,s.signalLeftOverlays,{color:0xffb21c,side:-1,role:'civic-left-signal'},s.ownedObjects,s.ownedMaterials);
      addLensOverlay(THREE,mesh,s.signalRightOverlays,{color:0xffb21c,side:1,role:'civic-right-signal'},s.ownedObjects,s.ownedMaterials);
    }
  }
  s.beams.push(...makeProjectors(THREE,root.getObjectByName('RootNode')||root,{x:.68,y:.69,z:2.02,targetX:.60,targetY:.12,targetZ:28,distance:70},s.ownedObjects));
}

function bindSonata(THREE,root,s){
  const inner=namedMesh(root,'Object_46'),outer=namedMesh(root,'Object_33'),front=namedMesh(root,'Object_7');
  if(inner){
    addLensOverlay(THREE,inner,s.runningOverlays,{color:0xff2a2e,filter:'red',uvMin:[.04,.842],uvMax:[.54,1],role:'sonata-rear-inner-red'},s.ownedObjects,s.ownedMaterials);
    addLensOverlay(THREE,inner,s.reverseOverlays,{color:0xf8fbff,filter:'white',role:'sonata-reverse'},s.ownedObjects,s.ownedMaterials);
  }
  if(outer){
    addLensOverlay(THREE,outer,s.runningOverlays,{color:0xff2a2e,filter:'red',uvMin:[.44,.842],uvMax:[.96,1],role:'sonata-rear-outer-red'},s.ownedObjects,s.ownedMaterials);
    addLensOverlay(THREE,outer,s.signalLeftOverlays,{color:0xffb21c,filter:'amber',side:-1,role:'sonata-left-rear-signal'},s.ownedObjects,s.ownedMaterials);
    addLensOverlay(THREE,outer,s.signalRightOverlays,{color:0xffb21c,filter:'amber',side:1,role:'sonata-right-rear-signal'},s.ownedObjects,s.ownedMaterials);
  }
  if(front){
    addLensOverlay(THREE,front,s.headlightOverlays,{color:0xf8fbff,filter:'white',role:'sonata-headlight'},s.ownedObjects,s.ownedMaterials);
    addLensOverlay(THREE,front,s.signalLeftOverlays,{color:0xffb21c,filter:'amber',side:-1,role:'sonata-left-front-signal'},s.ownedObjects,s.ownedMaterials);
    addLensOverlay(THREE,front,s.signalRightOverlays,{color:0xffb21c,filter:'amber',side:1,role:'sonata-right-front-signal'},s.ownedObjects,s.ownedMaterials);
  }
  s.beams.push(...makeProjectors(THREE,root,{x:.68,y:.66,z:2.25,targetX:.45,targetY:.15,targetZ:30,distance:72},s.ownedObjects));
}

function bindI3(THREE,root,s){
  for(const mesh of allMeshes(root)){
    const names=materialsOf(mesh).map(mat=>String(mat?.name||'').toLowerCase());
    if(names.some(n=>n==='carro_refletor_farol'||n==='carro_refletor_farol_1'))replaceMaterials(THREE,mesh,s.headlight,0xf8fbff,'remote-i3-headlight',s.ownedMaterials);
    if(names.some(n=>n==='carro_vidros_vermelhos'||n==='carro_vidros_vermelhos_1'))replaceMaterials(THREE,mesh,s.tail,0xff1420,'remote-i3-tail',s.ownedMaterials);
    if(names.some(n=>n==='carro_refletor_lanterna'))replaceMaterials(THREE,mesh,s.reverse,0xffffff,'remote-i3-reverse',s.ownedMaterials);
    if(names.some(n=>n==='carro_refletor_lanterna_2')){
      addLensOverlay(THREE,mesh,s.signalLeftOverlays,{color:0xffb21c,side:-1,role:'i3-left-signal'},s.ownedObjects,s.ownedMaterials);
      addLensOverlay(THREE,mesh,s.signalRightOverlays,{color:0xffb21c,side:1,role:'i3-right-signal'},s.ownedObjects,s.ownedMaterials);
    }
  }
  s.beams.push(...makeProjectors(THREE,root,{x:.60,y:.78,z:1.93,targetX:.62,targetY:.15,targetZ:30,distance:72},s.ownedObjects));
}

function bindCountach(THREE,root,s){
  for(const mesh of allMeshes(root)){
    const names=materialsOf(mesh).map(mat=>String(mat?.name||'').toLowerCase());
    const pos=mesh.geometry?.getAttribute?.('position');if(!pos)continue;mesh.geometry.computeBoundingBox?.();const box=mesh.geometry.boundingBox;if(!box)continue;
    const span=Math.max(.001,box.max.z-box.min.z),rear=box.min.z+span*.20,front=box.max.z-span*.20;
    if(names.includes('signallights')){
      splitTriangles(THREE,mesh,[
        {name:'remote-countach-brake',color:0xff1018,target:s.brake,match:(x,y,z)=>z<=rear},
        {name:'remote-countach-left-signal',color:0xffb21c,target:s.signalLeft,match:(x,y,z)=>z>=front&&x<0},
        {name:'remote-countach-right-signal',color:0xffb21c,target:s.signalRight,match:(x,y,z)=>z>=front&&x>=0}
      ],s.ownedGeometries,s.ownedMaterials);
    }
    if(names.includes('lights')){
      splitTriangles(THREE,mesh,[
        {name:'remote-countach-reverse',color:0xffffff,target:s.reverse,match:(x,y,z)=>z<=rear},
        {name:'remote-countach-headlight',color:0xf8fbff,target:s.headlight,match:(x,y,z)=>z>=front}
      ],s.ownedGeometries,s.ownedMaterials);
    }
  }
  s.beams.push(...makeProjectors(THREE,root,{x:.56,y:.59,z:2.04,targetX:.30,targetY:.16,targetZ:32,distance:76},s.ownedObjects));
}

function bindId4(THREE,root,s){
  for(const name of ['13_headlight_glass_glass_0','16_headlight_white_plastic_white_P_0']){
    const mesh=namedMesh(root,name);if(mesh)replaceMaterials(THREE,mesh,s.headlight,0xf8fbff,'remote-id4-headlight',s.ownedMaterials);
  }
  // Use real rear GLB lens geometry instead of the previous remote rectangles.
  for(const mesh of allMeshes(root)){
    const names=materialsOf(mesh).map(mat=>String(mat?.name||'').toLowerCase());
    if(names.includes('inner_red'))replaceMaterials(THREE,mesh,s.tail,0xff2028,'remote-id4-tail',s.ownedMaterials);
  }
  const rearClear=namedMesh(root,'13_headlight_glass_1_glass_0')||namedMesh(root,'52_trunk_tilllight_glass_glass_0');
  if(rearClear){
    addLensOverlay(THREE,rearClear,s.reverseOverlays,{color:0xffffff,filter:'white',role:'id4-reverse'},s.ownedObjects,s.ownedMaterials);
    addLensOverlay(THREE,rearClear,s.signalLeftOverlays,{color:0xffb21c,side:-1,role:'id4-left-rear-signal'},s.ownedObjects,s.ownedMaterials);
    addLensOverlay(THREE,rearClear,s.signalRightOverlays,{color:0xffb21c,side:1,role:'id4-right-rear-signal'},s.ownedObjects,s.ownedMaterials);
  }
  const front=namedMesh(root,'13_headlight_glass_glass_0');
  if(front){
    addLensOverlay(THREE,front,s.signalLeftOverlays,{color:0xffb21c,side:-1,role:'id4-left-front-signal'},s.ownedObjects,s.ownedMaterials);
    addLensOverlay(THREE,front,s.signalRightOverlays,{color:0xffb21c,side:1,role:'id4-right-front-signal'},s.ownedObjects,s.ownedMaterials);
  }
  s.beams.push(...makeProjectors(THREE,root,{x:.64,y:1.02,z:2.18,targetX:.30,targetY:.30,targetZ:36,distance:82},s.ownedObjects));
}

function bindF1(THREE,root,s){
  const mesh=namedMesh(root,'REARLEDs_011_001_RearLight_0')||namedMesh(root,'light_rear_light_4_0');
  if(mesh){replaceMaterials(THREE,mesh,s.f1Rear,0xff1018,'remote-f1-rear',s.ownedMaterials);}
}

function createGeometryFallbacks(THREE,root,s,spec){
  // Only actual GLB lens geometry is eligible. This is a safety net for an
  // authored contract change, not a return to procedural rectangles.
  const lensCandidates=allMeshes(root).filter(mesh=>/(light|lamp|lens|glass|reflect|signal|farol|lanterna|led)/i.test(semanticPath(mesh,root)));
  const rear=lensCandidates.find(mesh=>/(rear|tail|trunk|lanterna|reverse|taillight)/i.test(semanticPath(mesh,root)))||lensCandidates[0]||null;
  const front=lensCandidates.find(mesh=>/(front|head|farol|lowhighbeam)/i.test(semanticPath(mesh,root)))||lensCandidates[0]||null;

  const countFamily=familyCount=>familyCount();
  if(countFamily(()=>s.brake.length+s.tail.length+s.runningOverlays.length)===0&&rear){
    addLensOverlay(THREE,rear,s.brakeOverlays,{color:0xff1018,role:'contract-brake-fallback'},s.ownedObjects,s.ownedMaterials);s.geometryFallbackFamilies.add('brake');
  }
  if(countFamily(()=>s.reverse.length+s.reverseOverlays.length)===0&&rear){
    addLensOverlay(THREE,rear,s.reverseOverlays,{color:0xffffff,filter:'white',role:'contract-reverse-fallback'},s.ownedObjects,s.ownedMaterials);s.geometryFallbackFamilies.add('reverse');
  }
  if(countFamily(()=>s.headlight.length+s.headlightOverlays.length)===0&&front){
    addLensOverlay(THREE,front,s.headlightOverlays,{color:0xf8fbff,role:'contract-headlight-fallback'},s.ownedObjects,s.ownedMaterials);s.geometryFallbackFamilies.add('night');
  }
  if(countFamily(()=>s.signalLeft.length+s.signalLeftOverlays.length)===0&&front){
    addLensOverlay(THREE,front,s.signalLeftOverlays,{color:0xffb21c,side:-1,role:'contract-left-signal-fallback'},s.ownedObjects,s.ownedMaterials);s.geometryFallbackFamilies.add('signal-left');
  }
  if(countFamily(()=>s.signalRight.length+s.signalRightOverlays.length)===0&&front){
    addLensOverlay(THREE,front,s.signalRightOverlays,{color:0xffb21c,side:1,role:'contract-right-signal-fallback'},s.ownedObjects,s.ownedMaterials);s.geometryFallbackFamilies.add('signal-right');
  }
}

function familyCounts(s){
  return {
    brake:s.brake.length+s.tail.length+s.brakeOverlays.length+s.runningOverlays.length+(s.f1Rear.length?1:0),
    reverse:s.reverse.length+s.reverseOverlays.length+(s.f1Rear.length?1:0),
    night:s.headlight.length+s.headlightOverlays.length+s.tail.length+s.running.length+s.runningOverlays.length,
    'signal-left':s.signalLeft.length+s.signalLeftOverlays.length,
    'signal-right':s.signalRight.length+s.signalRightOverlays.length
  };
}

export function createRemoteAuthoredLighting(THREE,vehicleId,root){
  if(!THREE||!root)return null;
  const spec=getMultiplayerVehicleSpec(vehicleId);
  const s={
    brake:[],running:[],tail:[],reverse:[],headlight:[],signalLeft:[],signalRight:[],f1Rear:[],
    brakeOverlays:[],runningOverlays:[],reverseOverlays:[],headlightOverlays:[],signalLeftOverlays:[],signalRightOverlays:[],
    beams:[],ownedObjects:[],ownedGeometries:new Set(),ownedMaterials:new Set(),geometryFallbackFamilies:new Set()
  };

  if(vehicleId==='wrx')bindWrx(THREE,root,s);
  else if(vehicleId==='civic')bindCivic(THREE,root,s);
  else if(vehicleId==='sonata')bindSonata(THREE,root,s);
  else if(vehicleId==='i3_2017')bindI3(THREE,root,s);
  else if(vehicleId==='countach_80')bindCountach(THREE,root,s);
  else if(vehicleId==='id4')bindId4(THREE,root,s);
  else if(vehicleId==='f1_2010')bindF1(THREE,root,s);

  createGeometryFallbacks(THREE,root,s,spec);
  const counts=familyCounts(s);
  const required=[...(spec.lighting.requiredFamilies||[])];
  const missing=required.filter(family=>(counts[family]||0)<=0);
  const ready=missing.length===0;
  let disposed=false,updates=0,lastState={};

  function setState(input={}){
    if(disposed)return;
    lastState={...lastState,...input};
    const level=computeRemoteLightLevels(lastState);
    setEmission(s.running,0xff2028,level.running);
    setEmission(s.tail,0xff2028,level.braking?5.4:level.running);
    setEmission(s.brake,0xff1018,level.brake);
    setEmission(s.reverse,0xffffff,level.reverse);
    setEmission(s.headlight,0xf8fbff,level.headlight);
    setEmission(s.signalLeft,0xffb21c,level.leftSignal);
    setEmission(s.signalRight,0xffb21c,level.rightSignal);
    setOverlays(s.runningOverlays,level.nightOn?(.18+level.night*.22):0);
    setOverlays(s.brakeOverlays,level.braking?.92:0);
    setOverlays(s.reverseOverlays,level.reversing?.96:0);
    setOverlays(s.headlightOverlays,level.nightOn?(.48+level.night*.35):0);
    setOverlays(s.signalLeftOverlays,level.leftOn?.96:0);
    setOverlays(s.signalRightOverlays,level.rightOn?.96:0);

    if(s.f1Rear.length){
      for(const mat of s.f1Rear){
        const white=level.reversing;
        mat.color?.setHex?.(white?0xffffff:(level.braking?0xff1018:0x8a1018));
        mat.emissive?.setHex?.(white?0xffffff:0xff1018);
        mat.emissiveIntensity=white?4.8:(level.braking?4.4:(level.nightOn?.55:.01));mat.needsUpdate=true;
      }
    }

    const distance=Math.max(0,Number(lastState.distance)||0),beamFade=1-clamp01((distance-180)/180);
    for(const beam of s.beams){beam.visible=level.nightOn&&beamFade>.02;beam.intensity=level.night*95*beamFade;}
    updates++;
  }
  setState({});

  return {
    mode:'authored-glb-lamps-v2',
    ready,
    missingFamilies:Object.freeze(missing),
    counts:Object.freeze({...counts}),
    setState,
    diagnostics:()=>({
      vehicleId,mode:'authored-glb-lamps-v2',ready,required,missingFamilies:[...missing],counts:{...counts},
      geometryFallbackFamilies:[...s.geometryFallbackFamilies],updates
    }),
    dispose(){
      if(disposed)return;disposed=true;
      for(const obj of s.ownedObjects)obj.removeFromParent?.();
      for(const geometry of s.ownedGeometries)geometry.dispose?.();
      for(const material of s.ownedMaterials)material.dispose?.();
    }
  };
}
