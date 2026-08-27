// World Drive multiplayer M2.5 — authored GLB lighting for remote peers.
//
// Dynamic lighting is bound to each peer's cloned authored vehicle. Shared
// template materials/geometries remain immutable: any material or geometry that
// changes at runtime is cloned first. The old geometric fallback light rig is
// therefore needed only while the GLB is still loading.

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));

function semanticPath(object,root){
  const names=[];
  let cursor=object;
  while(cursor&&cursor!==root?.parent){
    if(cursor.name)names.push(String(cursor.name).toLowerCase());
    const mats=Array.isArray(cursor?.material)?cursor.material:[cursor?.material];
    for(const mat of mats){
      if(mat?.name)names.push(String(mat.name).toLowerCase());
    }
    cursor=cursor.parent;
  }
  return names.join(' ');
}

function objectCenterLocal(THREE,root,obj){
  root.updateMatrixWorld?.(true);
  const box=new THREE.Box3().setFromObject(obj);
  const center=new THREE.Vector3();
  box.getCenter(center);
  return root.worldToLocal(center);
}

function lampMaterial(THREE,source,{name='remote-authored-lamp',color=0xffffff,intensity=.01}={}){
  const mat=source.clone();
  mat.name=name;
  if(!mat.emissive)mat.emissive=new THREE.Color(color);
  else mat.emissive.setHex(color);
  if('emissiveIntensity' in mat)mat.emissiveIntensity=intensity;
  mat.toneMapped=false;
  mat.dithering=true;
  if(mat.transparent)mat.depthWrite=false;
  mat.needsUpdate=true;
  return mat;
}

function replaceMeshMaterials(THREE,mesh,target,color,namePrefix='remote-authored-lamp'){
  const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const replacements=source.map((mat,index)=>{
    const copy=lampMaterial(THREE,mat,{
      name:`${namePrefix}-${index}`,
      color
    });
    target.push(copy);
    return copy;
  });
  mesh.material=Array.isArray(mesh.material)?replacements:replacements[0];
  return replacements;
}

function splitMeshTriangles(THREE,mesh,categories,ownedGeometries){
  if(!mesh?.geometry||!mesh?.material||!categories?.length)return false;
  const geometry=mesh.geometry.clone();
  ownedGeometries.add(geometry);
  const pos=geometry.getAttribute?.('position');
  if(!pos||pos.count<3)return false;
  const sourceMaterial=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
  if(!sourceMaterial)return false;
  const sourceIndex=geometry.index
    ?Array.from(geometry.index.array)
    :Array.from({length:pos.count},(_,i)=>i);

  const buckets=[[]];
  for(let i=0;i<categories.length;i++)buckets.push([]);

  for(let i=0;i+2<sourceIndex.length;i+=3){
    const a=sourceIndex[i],b=sourceIndex[i+1],c=sourceIndex[i+2];
    const x=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
    const y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
    const z=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
    let bucket=0;
    for(let j=0;j<categories.length;j++){
      if(categories[j].match(x,y,z)){bucket=j+1;break;}
    }
    buckets[bucket].push(a,b,c);
  }

  if(!buckets.slice(1).some(bucket=>bucket.length))return false;

  const materials=[sourceMaterial];
  for(const category of categories){
    const dynamic=lampMaterial(THREE,sourceMaterial,{
      name:category.name,
      color:category.color,
      intensity:.01
    });
    category.target.push(dynamic);
    materials.push(dynamic);
  }

  const combined=[];
  geometry.clearGroups();
  let offset=0;
  for(let i=0;i<buckets.length;i++){
    const bucket=buckets[i];
    if(!bucket.length)continue;
    combined.push(...bucket);
    geometry.addGroup(offset,bucket.length,i);
    offset+=bucket.length;
  }
  geometry.setIndex(combined);
  mesh.geometry=geometry;
  mesh.material=materials;
  return true;
}

function setEmissive(materials,color,intensity){
  for(const mat of materials){
    mat.emissive?.setHex?.(color);
    if('emissiveIntensity' in mat)mat.emissiveIntensity=intensity;
    mat.needsUpdate=true;
  }
}

function createProjectors(THREE,root,profile,ownedObjects){
  if(!profile)return [];
  const beams=[];
  for(const side of [-1,1]){
    const target=new THREE.Object3D();
    target.position.set(side*(profile.targetX??.35),profile.targetY??.18,profile.targetZ??34);
    root.add(target);
    const light=new THREE.SpotLight(
      0xf8fbff,
      0,
      profile.distance??78,
      profile.angle??.37,
      profile.penumbra??.65,
      profile.decay??1.05
    );
    light.name=`remote-authored-projector-${side<0?'l':'r'}`;
    light.position.set(side*profile.x,profile.y,profile.z);
    light.target=target;
    light.castShadow=false;
    light.visible=false;
    root.add(light);
    beams.push(light);
    ownedObjects.push(light,target);
  }
  return beams;
}

function createTextureMaskMaterial(THREE,sourceMaterial,{filter='red',side=0,tint=0xffffff,uvRegion=null,tintMix=.85}={}){
  const filterMode=filter==='red'?0:(filter==='amber'?1:2);
  const uniforms={
    uMap:{value:sourceMaterial?.map||null},
    uOpacity:{value:0},
    uTint:{value:new THREE.Color(tint)},
    uFilterMode:{value:filterMode},
    uSideMode:{value:side},
    uTintMix:{value:tintMix},
    uUseUvRegion:{value:uvRegion?1:0},
    uUvMin:{value:new THREE.Vector2(...(uvRegion?.min||[0,0]))},
    uUvMax:{value:new THREE.Vector2(...(uvRegion?.max||[1,1]))},
    uUvFeather:{value:new THREE.Vector2(...(uvRegion?.feather||[.004,.004]))}
  };
  return new THREE.ShaderMaterial({
    uniforms,
    transparent:true,
    depthWrite:false,
    depthTest:true,
    toneMapped:false,
    side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,
    polygonOffset:true,
    polygonOffsetFactor:-2,
    polygonOffsetUnits:-2,
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
      uniform float uTintMix;
      uniform float uUseUvRegion;
      uniform vec2 uUvMin;
      uniform vec2 uUvMax;
      uniform vec2 uUvFeather;
      varying vec2 vUv;
      varying vec3 vLocalPos;
      void main(){
        vec3 rawTex=texture2D(uMap,vUv).rgb;
        float lum=dot(rawTex,vec3(0.2126,0.7152,0.0722));
        float maxc=max(rawTex.r,max(rawTex.g,rawTex.b));
        float minc=min(rawTex.r,min(rawTex.g,rawTex.b));
        float spread=maxc-minc;
        float redDom=rawTex.r-max(rawTex.g,rawTex.b);
        float redMask=smoothstep(.28,.44,rawTex.r)*smoothstep(.10,.23,redDom);
        float amberMask=smoothstep(.34,.55,rawTex.r)*smoothstep(.10,.30,rawTex.g)*(1.0-smoothstep(.38,.62,rawTex.b/max(rawTex.g,.001)));
        float whiteMask=smoothstep(.28,.50,lum)*(1.0-smoothstep(.28,.52,spread));
        float mask=redMask;
        if(uFilterMode>.5&&uFilterMode<1.5)mask=amberMask;
        else if(uFilterMode>=1.5)mask=whiteMask;
        float sideMask=1.0;
        if(uSideMode<-.5)sideMask=1.0-smoothstep(-.08,.18,vLocalPos.x);
        else if(uSideMode>.5)sideMask=smoothstep(-.18,.08,vLocalPos.x);
        float uvMask=1.0;
        if(uUseUvRegion>.5){
          float a=smoothstep(uUvMin.x-uUvFeather.x,uUvMin.x+uUvFeather.x,vUv.x);
          float b=1.0-smoothstep(uUvMax.x-uUvFeather.x,uUvMax.x+uUvFeather.x,vUv.x);
          float c=smoothstep(uUvMin.y-uUvFeather.y,uUvMin.y+uUvFeather.y,vUv.y);
          float d=1.0-smoothstep(uUvMax.y-uUvFeather.y,uUvMax.y+uUvFeather.y,vUv.y);
          uvMask=a*b*c*d;
        }
        float alpha=uOpacity*mask*sideMask*uvMask;
        if(alpha<.01)discard;
        vec3 lit=mix(rawTex,uTint,clamp(uTintMix,0.0,1.0));
        gl_FragColor=vec4(lit*mask,alpha);
      }
    `
  });
}

function addTextureMaskLayer(THREE,sourceMesh,target,ownedObjects,ownedMaterials,spec){
  if(!sourceMesh?.isMesh&&!sourceMesh?.isSkinnedMesh)return null;
  const sourceMaterials=Array.isArray(sourceMesh.material)?sourceMesh.material:[sourceMesh.material];
  const sourceMaterial=sourceMaterials.find(mat=>mat?.map)||sourceMaterials[0];
  if(!sourceMaterial)return null;
  const material=createTextureMaskMaterial(THREE,sourceMaterial,spec);
  ownedMaterials.add(material);
  const mesh=new THREE.Mesh(sourceMesh.geometry,material);
  mesh.name=`remote-authored-${sourceMesh.name||'lens'}-${spec.filter||'light'}-${spec.side||0}`;
  mesh.position.copy(sourceMesh.position);
  mesh.quaternion.copy(sourceMesh.quaternion);
  mesh.scale.copy(sourceMesh.scale);
  mesh.renderOrder=(sourceMesh.renderOrder||0)+3;
  mesh.visible=false;
  mesh.frustumCulled=sourceMesh.frustumCulled;
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  sourceMesh.parent?.add(mesh);
  ownedObjects.push(mesh);
  const entry={mesh,material,filter:spec.filter||'red',side:spec.side||0};
  target.push(entry);
  return entry;
}

function setMaskLayers(layers,filter,side,opacity){
  const value=clamp01(opacity);
  for(const layer of layers){
    if(layer.filter!==filter)continue;
    if(side!==undefined&&layer.side!==side)continue;
    layer.material.uniforms.uOpacity.value=value;
    layer.mesh.visible=value>.006;
  }
}

function bindWrx(THREE,root,state){
  const {brake,running,reverse,headlight,signalLeft,signalRight,ownedGeometries}=state;
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const path=semanticPath(obj,root);
    const names=(Array.isArray(obj.material)?obj.material:[obj.material]).map(mat=>String(mat?.name||'').toLowerCase());
    const center=objectCenterLocal(THREE,root,obj);
    const rear=center.z<-1.7&&center.y>.55;
    const front=center.z>1.45&&center.y>.40;

    if(path.includes('fh_light_glass_red_material')){
      const geometry=obj.geometry?.clone();
      const pos=geometry?.getAttribute?.('position');
      if(geometry&&pos&&pos.count>=3){
        ownedGeometries.add(geometry);
        let minY=Infinity,maxY=-Infinity;
        for(let i=0;i<pos.count;i++){minY=Math.min(minY,pos.getY(i));maxY=Math.max(maxY,pos.getY(i));}
        const cut=minY+(maxY-minY)*.50;
        const indices=geometry.index?Array.from(geometry.index.array):Array.from({length:pos.count},(_,i)=>i);
        const lower=[],upper=[];
        for(let i=0;i+2<indices.length;i+=3){
          const a=indices[i],b=indices[i+1],c=indices[i+2];
          const avg=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
          (avg>=cut?upper:lower).push(a,b,c);
        }
        if(lower.length&&upper.length){
          const source=Array.isArray(obj.material)?obj.material[0]:obj.material;
          const bmat=lampMaterial(THREE,source,{name:'remote-wrx-brake',color:0xff1018});
          const rmat=lampMaterial(THREE,source,{name:'remote-wrx-running',color:0xff2028});
          geometry.setIndex([...lower,...upper]);
          geometry.clearGroups();
          geometry.addGroup(0,lower.length,0);
          geometry.addGroup(lower.length,upper.length,1);
          obj.geometry=geometry;obj.material=[bmat,rmat];brake.push(bmat);running.push(rmat);
          return;
        }
      }
    }
    if(path.includes('fh_taillight_new_material')||path.includes('fh_chmsl_new_material')){
      replaceMeshMaterials(THREE,obj,brake,0xff1018,'remote-wrx-brake');return;
    }
    if(rear&&names.some(name=>name.includes('fh_light_glass'))){
      replaceMeshMaterials(THREE,obj,reverse,0xffffff,'remote-wrx-reverse');
    }
    if(front&&(path.includes('fh_lowhighbeam_material')||path.includes('fh_headlight_part4_material')||names.some(name=>name.includes('fh_lowhighbeam')||name.includes('fh_headlight_part4')||name==='fh_light_glass'))){
      replaceMeshMaterials(THREE,obj,headlight,0xf8fbff,'remote-wrx-headlight');
    }
    if(/signal|indicator|turn|amber|orange/.test(path)){
      const target=center.x<0?signalLeft:signalRight;
      replaceMeshMaterials(THREE,obj,target,0xffb21c,'remote-wrx-signal');
    }
  });
  state.beams.push(...createProjectors(THREE,root,{x:.98,y:.68,z:2.12,targetX:.50,targetY:.10,targetZ:36,distance:82},state.ownedObjects));
}

function bindCivic(THREE,root,state){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const mats=Array.isArray(obj.material)?obj.material:[obj.material];
    const names=mats.map(mat=>String(mat?.name||'').toLowerCase());
    const blob=`${String(obj.name||'').toLowerCase()} ${names.join(' ')}`;
    if(blob.includes('red_glass')){
      splitMeshTriangles(THREE,obj,[{name:'remote-civic-tail',color:0xff1820,target:state.running,match:(x,y,z)=>z<-1.48&&Math.abs(x)>.32&&y>.50&&y<1.02}],state.ownedGeometries);
      return;
    }
    if(blob.includes('glasslights_high')||names.some(name=>name==='glass')){
      splitMeshTriangles(THREE,obj,[
        {name:'remote-civic-reverse',color:0xffffff,target:state.reverse,match:(x,y,z)=>z<-1.55&&Math.abs(x)>.30&&y>.50&&y<.90},
        {name:'remote-civic-headlight',color:0xf8fbff,target:state.headlight,match:(x,y,z)=>z>1.48&&Math.abs(x)>.30&&y>.58&&y<.98}
      ],state.ownedGeometries);
      return;
    }
    if(blob.includes('lightrefracted_high')||blob.includes('light_r')||blob.includes('lightcluster_high')||names.some(name=>name==='lights')){
      splitMeshTriangles(THREE,obj,[{name:'remote-civic-headlight-inner',color:0xf8fbff,target:state.headlight,match:(x,y,z)=>z>1.42&&Math.abs(x)>.30&&y>.58&&y<.96}],state.ownedGeometries);
    }
    if(/signal|indicator|turn|amber|orange/.test(blob)){
      splitMeshTriangles(THREE,obj,[
        {name:'remote-civic-signal-left',color:0xffb21c,target:state.signalLeft,match:(x)=>x<0},
        {name:'remote-civic-signal-right',color:0xffb21c,target:state.signalRight,match:(x)=>x>=0}
      ],state.ownedGeometries);
    }
  });
  const parent=root.getObjectByName('RootNode')||root;
  state.beams.push(...createProjectors(THREE,parent,{x:.68,y:.69,z:2.02,targetX:.60,targetY:.12,targetZ:28,distance:70},state.ownedObjects));
}

function bindI3(THREE,root,state){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const mats=Array.isArray(obj.material)?obj.material:[obj.material];
    const name=String(mats[0]?.name||'').toLowerCase();
    if(name==='carro_refletor_farol'||name==='carro_refletor_farol_1'){
      replaceMeshMaterials(THREE,obj,state.headlight,0xf8fbff,'remote-i3-headlight');
    }else if(name==='carro_vidros_vermelhos'||name==='carro_vidros_vermelhos_1'){
      replaceMeshMaterials(THREE,obj,state.running,0xff1420,'remote-i3-tail');
    }else if(name==='carro_refletor_lanterna'){
      replaceMeshMaterials(THREE,obj,state.reverse,0xffffff,'remote-i3-reverse');
    }else if(/signal|indicator|turn|pisca|amber|orange/.test(name)){
      const center=objectCenterLocal(THREE,root,obj);
      replaceMeshMaterials(THREE,obj,center.x<0?state.signalLeft:state.signalRight,0xffb21c,'remote-i3-signal');
    }
  });
  state.beams.push(...createProjectors(THREE,root,{x:.60,y:.78,z:1.93,targetX:.62,targetY:.15,targetZ:30,distance:72},state.ownedObjects));
}

function bindCountach(THREE,root,state){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const mats=Array.isArray(obj.material)?obj.material:[obj.material];
    const blob=`${String(obj.name||'').toLowerCase()} ${mats.map(mat=>String(mat?.name||'').toLowerCase()).join(' ')}`;
    const pos=obj.geometry?.getAttribute?.('position');
    if(!pos)return;
    obj.geometry.computeBoundingBox?.();
    const box=obj.geometry.boundingBox;
    if(!box)return;
    const span=Math.max(.001,box.max.z-box.min.z);
    const rearCut=box.min.z+span*.20;
    const frontCut=box.max.z-span*.20;
    if(blob.includes('signallights')){
      splitMeshTriangles(THREE,obj,[
        {name:'remote-countach-brake',color:0xff1018,target:state.brake,match:(x,y,z)=>z<=rearCut},
        {name:'remote-countach-signal-left',color:0xffb21c,target:state.signalLeft,match:(x,y,z)=>z>=frontCut&&x<0},
        {name:'remote-countach-signal-right',color:0xffb21c,target:state.signalRight,match:(x,y,z)=>z>=frontCut&&x>=0}
      ],state.ownedGeometries);
    }else if(blob.includes('shape_lights')||mats.some(mat=>String(mat?.name||'').toLowerCase()==='lights')){
      splitMeshTriangles(THREE,obj,[
        {name:'remote-countach-reverse',color:0xffffff,target:state.reverse,match:(x,y,z)=>z<=rearCut},
        {name:'remote-countach-headlight',color:0xf8fbff,target:state.headlight,match:(x,y,z)=>z>=frontCut}
      ],state.ownedGeometries);
    }
  });
  state.beams.push(...createProjectors(THREE,root,{x:.56,y:.59,z:2.04,targetX:.30,targetY:.16,targetZ:32,distance:76},state.ownedObjects));
}

function bindId4(THREE,root,state){
  const byName={};
  root.traverse(obj=>{if(obj?.isMesh||obj?.isSkinnedMesh)byName[obj.name]=obj;});
  for(const name of ['13_headlight_glass_glass_0','16_headlight_white_plastic_white_P_0']){
    if(byName[name])replaceMeshMaterials(THREE,byName[name],state.headlight,0xffffff,'remote-id4-headlight');
  }

  // The local detailed ID.4 uses these authored-parent LED overlays because the
  // source GLB combines several rear LED zones in one atlas. Recreate that exact
  // GLB-local treatment rather than the old World Drive procedural car lamps.
  const parent=root.getObjectByName('group1')||root;
  const addStrip=({x,y,z,dx,dy,dz,color,target,name})=>{
    const geometry=new THREE.BoxGeometry(dx*1.1,dy*1.18,dz*1.06);
    const material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.01,metalness:0,roughness:.18,toneMapped:false,transparent:true,opacity:0,depthWrite:false});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=name;mesh.position.set(x,y,z);mesh.visible=false;mesh.renderOrder=12;
    parent.add(mesh);state.ownedObjects.push(mesh);state.ownedGeometries.add(geometry);state.ownedMaterials.add(material);target.push(material);
  };
  addStrip({x:228.9,y:117.6,z:0,dx:.9,dy:1.8,dz:103,color:0xff2028,target:state.brake,name:'remote-id4-center-brake'});
  for(const side of [-1,1]){
    const s=side<0?-1:1;
    for(const spec of [
      [228.9,121.2,s*53.5,.9,1.8,17],
      [228.9,112.8,s*60.4,.9,16.5,1.8],
      [228.9,104.4,s*53,.9,1.8,19],
      [228.9,110.4,s*46,.9,1.6,7.5]
    ])addStrip({x:spec[0],y:spec[1],z:spec[2],dx:spec[3],dy:spec[4],dz:spec[5],color:0xff2028,target:state.brake,name:`remote-id4-brake-${side}`});
    for(const spec of [[229.2,112.6,s*39.8,.9,1.6,8.5],[229.2,107.8,s*38.8,.9,1.6,7]])addStrip({x:spec[0],y:spec[1],z:spec[2],dx:spec[3],dy:spec[4],dz:spec[5],color:0xffffff,target:state.reverse,name:`remote-id4-reverse-${side}`});
  }
  state.beams.push(...createProjectors(THREE,root,{x:.64,y:1.02,z:2.18,targetX:.30,targetY:.30,targetZ:36,distance:82},state.ownedObjects));
}

function bindSonata(THREE,root,state){
  const rearInner=root.getObjectByName('Object_46');
  const rearOuter=root.getObjectByName('Object_33');
  const frontLens=root.getObjectByName('Object_7');
  if(rearInner){
    addTextureMaskLayer(THREE,rearInner,state.maskLayers,state.ownedObjects,state.ownedMaterials,{filter:'red',side:0,tint:0xff2a2e,tintMix:.42,uvRegion:{min:[.04,.842],max:[.54,1],feather:[.004,.004]}});
    addTextureMaskLayer(THREE,rearInner,state.maskLayers,state.ownedObjects,state.ownedMaterials,{filter:'white',side:0,tint:0xf8fbff,tintMix:.78});
  }
  if(rearOuter){
    addTextureMaskLayer(THREE,rearOuter,state.maskLayers,state.ownedObjects,state.ownedMaterials,{filter:'red',side:0,tint:0xff2a2e,tintMix:.42,uvRegion:{min:[.44,.842],max:[.96,1],feather:[.004,.004]}});
    addTextureMaskLayer(THREE,rearOuter,state.maskLayers,state.ownedObjects,state.ownedMaterials,{filter:'amber',side:-1,tint:0xffb21c,tintMix:.88});
    addTextureMaskLayer(THREE,rearOuter,state.maskLayers,state.ownedObjects,state.ownedMaterials,{filter:'amber',side:1,tint:0xffb21c,tintMix:.88});
  }
  if(frontLens){
    addTextureMaskLayer(THREE,frontLens,state.maskLayers,state.ownedObjects,state.ownedMaterials,{filter:'white',side:0,tint:0xf8fbff,tintMix:.82});
    addTextureMaskLayer(THREE,frontLens,state.maskLayers,state.ownedObjects,state.ownedMaterials,{filter:'amber',side:-1,tint:0xffb21c,tintMix:.88});
    addTextureMaskLayer(THREE,frontLens,state.maskLayers,state.ownedObjects,state.ownedMaterials,{filter:'amber',side:1,tint:0xffb21c,tintMix:.88});
  }
  state.beams.push(...createProjectors(THREE,root,{x:.68,y:.66,z:2.25,targetX:.45,targetY:.15,targetZ:30,distance:72},state.ownedObjects));
}

function bindF1(THREE,root,state){
  let lamp=null;
  for(const name of ['REARLEDs_011_001_RearLight_0','light_rear_light_4_0','REARLEDs_011_001','light']){
    lamp=root.getObjectByName(name);
    if(lamp)break;
  }
  if(lamp?.isMesh||lamp?.isSkinnedMesh){
    replaceMeshMaterials(THREE,lamp,state.brake,0xff1018,'remote-f1-rear-lamp');
    // Same authored rear lamp is used by the local F1 for the reverse warning;
    // keep a reference so state switching can turn it white without extra mesh.
    state.f1RearMaterials.push(...state.brake);
  }
}

function bindGenericSignals(THREE,root,state){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const path=semanticPath(obj,root);
    if(!/signal|indicator|turn|amber|orange|blinker|flasher/.test(path))return;
    if(state.signalBoundMeshes.has(obj))return;
    const pos=obj.geometry?.getAttribute?.('position');
    if(pos&&pos.count>=3){
      if(splitMeshTriangles(THREE,obj,[
        {name:'remote-generic-signal-left',color:0xffb21c,target:state.signalLeft,match:(x)=>x<0},
        {name:'remote-generic-signal-right',color:0xffb21c,target:state.signalRight,match:(x)=>x>=0}
      ],state.ownedGeometries)){
        state.signalBoundMeshes.add(obj);
      }
    }
  });
}

export function createRemoteAuthoredLighting(THREE,vehicleId,root){
  if(!THREE||!root)return null;
  const state={
    brake:[],running:[],reverse:[],headlight:[],signalLeft:[],signalRight:[],
    f1RearMaterials:[],maskLayers:[],beams:[],ownedObjects:[],ownedGeometries:new Set(),ownedMaterials:new Set(),signalBoundMeshes:new Set()
  };

  switch(vehicleId){
    case 'wrx':bindWrx(THREE,root,state);break;
    case 'civic':bindCivic(THREE,root,state);break;
    case 'sonata':bindSonata(THREE,root,state);break;
    case 'i3_2017':bindI3(THREE,root,state);break;
    case 'countach_80':bindCountach(THREE,root,state);break;
    case 'id4':bindId4(THREE,root,state);break;
    case 'f1_2010':bindF1(THREE,root,state);break;
  }
  bindGenericSignals(THREE,root,state);

  let disposed=false;
  let updates=0;
  let last={braking:false,reversing:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false,distance:0};

  function setState(next={}){
    if(disposed)return;
    last={...last,...next};
    const night=clamp01(last.nightLevel);
    const nightOn=night>.035;
    const braking=!!last.braking;
    const reversing=!!last.reversing;
    const blink=!!last.signalBlink;
    const left=!!last.signalLeft&&blink;
    const right=!!last.signalRight&&blink;
    const distance=Math.max(0,Number(last.distance)||0);
    const beamFade=1-clamp01((distance-180)/180);

    setEmissive(state.running,0xff2028,nightOn?(.35+night*2.5):.01);
    setEmissive(state.brake,0xff1018,braking?5.2:(nightOn?.45+night*.70:.01));
    setEmissive(state.reverse,0xffffff,reversing?5.2:.01);
    setEmissive(state.headlight,0xf8fbff,nightOn?(.75+night*5.8):.01);
    setEmissive(state.signalLeft,0xffb21c,left?5.5:.01);
    setEmissive(state.signalRight,0xffb21c,right?5.5:.01);

    // ID.4 rear LED strips are authored-parent overlay meshes whose material
    // visibility follows opacity rather than only emissive intensity.
    for(const material of [...state.brake,...state.reverse]){
      const mesh=state.ownedObjects.find(obj=>obj?.material===material);
      if(!mesh)continue;
      if(state.brake.includes(material)){
        const level=braking?.36:(nightOn?.10+night*.08:0);
        material.opacity=level;mesh.visible=level>.005;
      }else if(state.reverse.includes(material)){
        const level=reversing?.30:0;
        material.opacity=level;mesh.visible=level>.005;
      }
    }

    if(vehicleId==='sonata'){
      const runningRed=nightOn?(.16+night*.18):0;
      const brakingRed=braking?.52:0;
      const headlightWhite=nightOn?(.45+night*.28):0;
      setMaskLayers(state.maskLayers,'red',0,Math.max(runningRed,brakingRed));
      setMaskLayers(state.maskLayers,'white',0,reversing?.98:headlightWhite);
      setMaskLayers(state.maskLayers,'amber',-1,left?.98:0);
      setMaskLayers(state.maskLayers,'amber',1,right?.98:0);
      // White masks live on both front and rear source meshes; the rear reverse
      // remains governed by reversing while the front headlamp mask follows night.
      for(const layer of state.maskLayers){
        if(layer.filter!=='white')continue;
        const front=semanticPath(layer.mesh.parent,root).includes('object_7')||String(layer.mesh.name).includes('Object_7');
        const level=front?headlightWhite:(reversing?.98:0);
        layer.material.uniforms.uOpacity.value=level;
        layer.mesh.visible=level>.006;
      }
    }

    if(vehicleId==='f1_2010'&&state.f1RearMaterials.length){
      for(const mat of state.f1RearMaterials){
        const white=reversing;
        mat.color?.setHex?.(white?0xffffff:(braking?0xff1018:0x8a1018));
        mat.emissive?.setHex?.(white?0xffffff:0xff1018);
        mat.emissiveIntensity=white?4.8:(braking?4.4:(nightOn?.65:.01));
        mat.needsUpdate=true;
      }
    }

    for(const beam of state.beams){
      beam.visible=nightOn&&beamFade>.02;
      beam.intensity=night*95*beamFade;
    }
    updates++;
  }

  setState({});

  function dispose(){
    if(disposed)return;
    disposed=true;
    for(const obj of state.ownedObjects)obj.removeFromParent?.();
    for(const geometry of state.ownedGeometries)geometry.dispose?.();
    for(const material of state.ownedMaterials)material.dispose?.();
    // Dynamic materials assigned directly to cloned GLB meshes are peer-owned.
    for(const material of new Set([...state.brake,...state.running,...state.reverse,...state.headlight,...state.signalLeft,...state.signalRight])){
      material.dispose?.();
    }
  }

  return {
    mode:'authored-glb-lamps-v1',
    setState,
    dispose,
    get updates(){return updates;},
    diagnostics(){
      return {
        vehicleId,
        mode:'authored-glb-lamps-v1',
        brake:state.brake.length,
        running:state.running.length,
        reverse:state.reverse.length,
        headlight:state.headlight.length,
        signalLeft:state.signalLeft.length,
        signalRight:state.signalRight.length,
        maskedLayers:state.maskLayers.length,
        projectors:state.beams.length
      };
    }
  };
}
