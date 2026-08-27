// World Drive multiplayer M2.5 — authored GLB lighting for remote peers.
// Dynamic lamp resources are cloned per peer; cached GLB templates stay immutable.

const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));

function semanticPath(obj,root){
  const out=[];
  let p=obj;
  while(p&&p!==root?.parent){
    if(p.name)out.push(String(p.name).toLowerCase());
    const mats=Array.isArray(p.material)?p.material:[p.material];
    for(const mat of mats)if(mat?.name)out.push(String(mat.name).toLowerCase());
    p=p.parent;
  }
  return out.join(' ');
}

function localCenter(THREE,root,obj){
  root.updateMatrixWorld?.(true);
  const box=new THREE.Box3().setFromObject(obj);
  const c=new THREE.Vector3();
  box.getCenter(c);
  return root.worldToLocal(c);
}

function makeLampMaterial(THREE,source,name,color){
  const mat=source.clone();
  mat.name=name;
  if(!mat.emissive)mat.emissive=new THREE.Color(color);
  else mat.emissive.setHex(color);
  if('emissiveIntensity' in mat)mat.emissiveIntensity=.01;
  mat.toneMapped=false;
  mat.dithering=true;
  if(mat.transparent)mat.depthWrite=false;
  mat.needsUpdate=true;
  return mat;
}

function replaceMaterials(THREE,mesh,target,color,prefix){
  const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const copies=source.map((mat,i)=>{
    const copy=makeLampMaterial(THREE,mat,`${prefix}-${i}`,color);
    target.push(copy);
    return copy;
  });
  mesh.material=Array.isArray(mesh.material)?copies:copies[0];
}

function splitTriangles(THREE,mesh,categories,ownedGeometries){
  if(!mesh?.geometry||!mesh?.material)return false;
  const geometry=mesh.geometry.clone();
  const pos=geometry.getAttribute?.('position');
  if(!pos||pos.count<3){geometry.dispose?.();return false;}
  const source=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
  if(!source){geometry.dispose?.();return false;}
  const index=geometry.index?Array.from(geometry.index.array):Array.from({length:pos.count},(_,i)=>i);
  const buckets=[[]];
  for(let i=0;i<categories.length;i++)buckets.push([]);
  for(let i=0;i+2<index.length;i+=3){
    const a=index[i],b=index[i+1],c=index[i+2];
    const x=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
    const y=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
    const z=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
    let bucket=0;
    for(let j=0;j<categories.length;j++){
      if(categories[j].match(x,y,z)){bucket=j+1;break;}
    }
    buckets[bucket].push(a,b,c);
  }
  if(!buckets.slice(1).some(b=>b.length)){geometry.dispose?.();return false;}
  const materials=[source];
  for(const category of categories){
    const mat=makeLampMaterial(THREE,source,category.name,category.color);
    category.target.push(mat);
    materials.push(mat);
  }
  const combined=[];
  geometry.clearGroups();
  let offset=0;
  for(let i=0;i<buckets.length;i++){
    if(!buckets[i].length)continue;
    combined.push(...buckets[i]);
    geometry.addGroup(offset,buckets[i].length,i);
    offset+=buckets[i].length;
  }
  geometry.setIndex(combined);
  mesh.geometry=geometry;
  mesh.material=materials;
  ownedGeometries.add(geometry);
  return true;
}

function setEmission(list,color,intensity){
  for(const mat of list){
    mat.emissive?.setHex?.(color);
    if('emissiveIntensity' in mat)mat.emissiveIntensity=intensity;
    mat.needsUpdate=true;
  }
}

function makeProjectors(THREE,parent,p,ownedObjects){
  const beams=[];
  if(!p)return beams;
  for(const side of [-1,1]){
    const target=new THREE.Object3D();
    target.position.set(side*(p.targetX??.35),p.targetY??.15,p.targetZ??32);
    parent.add(target);
    const light=new THREE.SpotLight(0xf8fbff,0,p.distance??78,p.angle??.37,p.penumbra??.65,p.decay??1.05);
    light.name=`remote-authored-headlight-${side<0?'l':'r'}`;
    light.position.set(side*p.x,p.y,p.z);
    light.target=target;
    light.castShadow=false;
    light.visible=false;
    parent.add(light);
    beams.push(light);
    ownedObjects.push(light,target);
  }
  return beams;
}

function bindWrx(THREE,root,s){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const path=semanticPath(obj,root);
    const names=(Array.isArray(obj.material)?obj.material:[obj.material]).map(m=>String(m?.name||'').toLowerCase());
    const c=localCenter(THREE,root,obj);
    if(path.includes('fh_light_glass_red_material')){
      const g=obj.geometry?.clone();
      const pos=g?.getAttribute?.('position');
      if(g&&pos&&pos.count>=3){
        let minY=Infinity,maxY=-Infinity;
        for(let i=0;i<pos.count;i++){minY=Math.min(minY,pos.getY(i));maxY=Math.max(maxY,pos.getY(i));}
        const cut=minY+(maxY-minY)*.5;
        const idx=g.index?Array.from(g.index.array):Array.from({length:pos.count},(_,i)=>i);
        const lower=[],upper=[];
        for(let i=0;i+2<idx.length;i+=3){
          const a=idx[i],b=idx[i+1],d=idx[i+2];
          (((pos.getY(a)+pos.getY(b)+pos.getY(d))/3)>=cut?upper:lower).push(a,b,d);
        }
        if(lower.length&&upper.length){
          const base=Array.isArray(obj.material)?obj.material[0]:obj.material;
          const brake=makeLampMaterial(THREE,base,'remote-wrx-brake',0xff1018);
          const running=makeLampMaterial(THREE,base,'remote-wrx-running',0xff2028);
          g.setIndex([...lower,...upper]);g.clearGroups();g.addGroup(0,lower.length,0);g.addGroup(lower.length,upper.length,1);
          obj.geometry=g;obj.material=[brake,running];s.brake.push(brake);s.running.push(running);s.ownedGeometries.add(g);return;
        }
        g.dispose?.();
      }
    }
    if(path.includes('fh_taillight_new_material')||path.includes('fh_chmsl_new_material')){
      replaceMaterials(THREE,obj,s.brake,0xff1018,'remote-wrx-brake');return;
    }
    if(c.z<-1.7&&c.y>.55&&names.some(n=>n.includes('fh_light_glass'))){
      replaceMaterials(THREE,obj,s.reverse,0xffffff,'remote-wrx-reverse');
    }
    if(c.z>1.45&&c.y>.4&&(path.includes('fh_lowhighbeam_material')||path.includes('fh_headlight_part4_material')||names.some(n=>n.includes('fh_lowhighbeam')||n.includes('fh_headlight_part4')||n==='fh_light_glass'))){
      replaceMaterials(THREE,obj,s.headlight,0xf8fbff,'remote-wrx-headlight');
    }
  });
  s.beams.push(...makeProjectors(THREE,root,{x:.98,y:.68,z:2.12,targetX:.50,targetY:.10,targetZ:36,distance:82},s.ownedObjects));
}

function bindCivic(THREE,root,s){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const names=(Array.isArray(obj.material)?obj.material:[obj.material]).map(m=>String(m?.name||'').toLowerCase());
    const blob=`${String(obj.name||'').toLowerCase()} ${names.join(' ')}`;
    if(blob.includes('red_glass')){
      splitTriangles(THREE,obj,[{name:'remote-civic-tail',color:0xff1820,target:s.running,match:(x,y,z)=>z<-1.48&&Math.abs(x)>.32&&y>.50&&y<1.02}],s.ownedGeometries);return;
    }
    if(blob.includes('glasslights_high')||names.some(n=>n==='glass')){
      splitTriangles(THREE,obj,[
        {name:'remote-civic-reverse',color:0xffffff,target:s.reverse,match:(x,y,z)=>z<-1.55&&Math.abs(x)>.30&&y>.50&&y<.90},
        {name:'remote-civic-headlight',color:0xf8fbff,target:s.headlight,match:(x,y,z)=>z>1.48&&Math.abs(x)>.30&&y>.58&&y<.98}
      ],s.ownedGeometries);return;
    }
    if(blob.includes('lightrefracted_high')||blob.includes('light_r')||blob.includes('lightcluster_high')||names.some(n=>n==='lights')){
      splitTriangles(THREE,obj,[{name:'remote-civic-headlight-inner',color:0xf8fbff,target:s.headlight,match:(x,y,z)=>z>1.42&&Math.abs(x)>.30&&y>.58&&y<.96}],s.ownedGeometries);
    }
  });
  s.beams.push(...makeProjectors(THREE,root.getObjectByName('RootNode')||root,{x:.68,y:.69,z:2.02,targetX:.60,targetY:.12,targetZ:28,distance:70},s.ownedObjects));
}

function bindI3(THREE,root,s){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const mats=Array.isArray(obj.material)?obj.material:[obj.material];
    const name=String(mats[0]?.name||'').toLowerCase();
    if(name==='carro_refletor_farol'||name==='carro_refletor_farol_1')replaceMaterials(THREE,obj,s.headlight,0xf8fbff,'remote-i3-headlight');
    else if(name==='carro_vidros_vermelhos'||name==='carro_vidros_vermelhos_1')replaceMaterials(THREE,obj,s.running,0xff1420,'remote-i3-tail');
    else if(name==='carro_refletor_lanterna')replaceMaterials(THREE,obj,s.reverse,0xffffff,'remote-i3-reverse');
  });
  s.beams.push(...makeProjectors(THREE,root,{x:.60,y:.78,z:1.93,targetX:.62,targetY:.15,targetZ:30,distance:72},s.ownedObjects));
}

function bindCountach(THREE,root,s){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    const mats=Array.isArray(obj.material)?obj.material:[obj.material];
    const blob=`${String(obj.name||'').toLowerCase()} ${mats.map(m=>String(m?.name||'').toLowerCase()).join(' ')}`;
    const pos=obj.geometry?.getAttribute?.('position');
    if(!pos)return;
    obj.geometry.computeBoundingBox?.();
    const box=obj.geometry.boundingBox;
    if(!box)return;
    const span=Math.max(.001,box.max.z-box.min.z),rear=box.min.z+span*.20,front=box.max.z-span*.20;
    if(blob.includes('signallights')){
      splitTriangles(THREE,obj,[
        {name:'remote-countach-brake',color:0xff1018,target:s.brake,match:(x,y,z)=>z<=rear},
        {name:'remote-countach-signal-left',color:0xffb21c,target:s.signalLeft,match:(x,y,z)=>z>=front&&x<0},
        {name:'remote-countach-signal-right',color:0xffb21c,target:s.signalRight,match:(x,y,z)=>z>=front&&x>=0}
      ],s.ownedGeometries);
    }else if(blob.includes('shape_lights')||mats.some(m=>String(m?.name||'').toLowerCase()==='lights')){
      splitTriangles(THREE,obj,[
        {name:'remote-countach-reverse',color:0xffffff,target:s.reverse,match:(x,y,z)=>z<=rear},
        {name:'remote-countach-headlight',color:0xf8fbff,target:s.headlight,match:(x,y,z)=>z>=front}
      ],s.ownedGeometries);
    }
  });
  s.beams.push(...makeProjectors(THREE,root,{x:.56,y:.59,z:2.04,targetX:.30,targetY:.16,targetZ:32,distance:76},s.ownedObjects));
}

function makeMaskMaterial(THREE,source,{filter='red',side=0,tint=0xffffff,uvRegion=null}={}){
  const mode=filter==='red'?0:(filter==='amber'?1:2);
  return new THREE.ShaderMaterial({
    uniforms:{uMap:{value:source?.map||null},uOpacity:{value:0},uTint:{value:new THREE.Color(tint)},uMode:{value:mode},uSide:{value:side},uUseUv:{value:uvRegion?1:0},uMin:{value:new THREE.Vector2(...(uvRegion?.min||[0,0]))},uMax:{value:new THREE.Vector2(...(uvRegion?.max||[1,1]))}},
    transparent:true,depthWrite:false,depthTest:true,toneMapped:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    vertexShader:`varying vec2 vUv;varying vec3 vP;void main(){vUv=uv;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D uMap;uniform float uOpacity;uniform vec3 uTint;uniform float uMode;uniform float uSide;uniform float uUseUv;uniform vec2 uMin;uniform vec2 uMax;varying vec2 vUv;varying vec3 vP;void main(){vec3 t=texture2D(uMap,vUv).rgb;float lum=dot(t,vec3(.2126,.7152,.0722));float mx=max(t.r,max(t.g,t.b));float mn=min(t.r,min(t.g,t.b));float red=smoothstep(.28,.44,t.r)*smoothstep(.10,.23,t.r-max(t.g,t.b));float amber=smoothstep(.34,.55,t.r)*smoothstep(.10,.30,t.g)*(1.0-smoothstep(.38,.62,t.b/max(t.g,.001)));float white=smoothstep(.28,.50,lum)*(1.0-smoothstep(.28,.52,mx-mn));float m=red;if(uMode>.5&&uMode<1.5)m=amber;else if(uMode>=1.5)m=white;float side=1.0;if(uSide<-.5)side=1.0-smoothstep(-.08,.18,vP.x);else if(uSide>.5)side=smoothstep(-.18,.08,vP.x);float uvM=1.0;if(uUseUv>.5)uvM=step(uMin.x,vUv.x)*step(vUv.x,uMax.x)*step(uMin.y,vUv.y)*step(vUv.y,uMax.y);float a=uOpacity*m*side*uvM;if(a<.01)discard;gl_FragColor=vec4(mix(t,uTint,.82)*m,a);}`
  });
}

function addMaskLayer(THREE,sourceMesh,s,spec){
  if(!sourceMesh?.isMesh&&!sourceMesh?.isSkinnedMesh)return;
  const mats=Array.isArray(sourceMesh.material)?sourceMesh.material:[sourceMesh.material];
  const source=mats.find(m=>m?.map)||mats[0];
  if(!source)return;
  const mat=makeMaskMaterial(THREE,source,spec);
  const mesh=new THREE.Mesh(sourceMesh.geometry,mat);
  mesh.name=`remote-authored-${sourceMesh.name}-${spec.filter}-${spec.side||0}`;
  mesh.position.copy(sourceMesh.position);mesh.quaternion.copy(sourceMesh.quaternion);mesh.scale.copy(sourceMesh.scale);mesh.renderOrder=(sourceMesh.renderOrder||0)+3;mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false;
  sourceMesh.parent?.add(mesh);s.maskLayers.push({mesh,mat,filter:spec.filter,side:spec.side||0,front:!!spec.front});s.ownedObjects.push(mesh);s.ownedMaterials.add(mat);
}

function bindSonata(THREE,root,s){
  const inner=root.getObjectByName('Object_46'),outer=root.getObjectByName('Object_33'),front=root.getObjectByName('Object_7');
  if(inner){addMaskLayer(THREE,inner,s,{filter:'red',side:0,tint:0xff2a2e,uvRegion:{min:[.04,.842],max:[.54,1]}});addMaskLayer(THREE,inner,s,{filter:'white',side:0,tint:0xf8fbff});}
  if(outer){addMaskLayer(THREE,outer,s,{filter:'red',side:0,tint:0xff2a2e,uvRegion:{min:[.44,.842],max:[.96,1]}});addMaskLayer(THREE,outer,s,{filter:'amber',side:-1,tint:0xffb21c});addMaskLayer(THREE,outer,s,{filter:'amber',side:1,tint:0xffb21c});}
  if(front){addMaskLayer(THREE,front,s,{filter:'white',side:0,tint:0xf8fbff,front:true});addMaskLayer(THREE,front,s,{filter:'amber',side:-1,tint:0xffb21c,front:true});addMaskLayer(THREE,front,s,{filter:'amber',side:1,tint:0xffb21c,front:true});}
  s.beams.push(...makeProjectors(THREE,root,{x:.68,y:.66,z:2.25,targetX:.45,targetY:.15,targetZ:30,distance:72},s.ownedObjects));
}

function bindId4(THREE,root,s){
  const byName={};root.traverse(obj=>{if(obj?.isMesh||obj?.isSkinnedMesh)byName[obj.name]=obj;});
  for(const name of ['13_headlight_glass_glass_0','16_headlight_white_plastic_white_P_0'])if(byName[name])replaceMaterials(THREE,byName[name],s.headlight,0xffffff,'remote-id4-headlight');
  const parent=root.getObjectByName('group1')||root;
  const add=({x,y,z,dx,dy,dz,color,target,name})=>{
    const g=new THREE.BoxGeometry(dx*1.1,dy*1.18,dz*1.06),m=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
    const mesh=new THREE.Mesh(g,m);mesh.name=name;mesh.position.set(x,y,z);mesh.visible=false;mesh.renderOrder=12;parent.add(mesh);target.push(m);s.id4Meshes.set(m,mesh);s.ownedObjects.push(mesh);s.ownedGeometries.add(g);s.ownedMaterials.add(m);
  };
  add({x:228.9,y:117.6,z:0,dx:.9,dy:1.8,dz:103,color:0xff2028,target:s.brake,name:'remote-id4-center-brake'});
  for(const side of [-1,1]){
    const q=side<0?-1:1;
    for(const a of [[228.9,121.2,q*53.5,.9,1.8,17],[228.9,112.8,q*60.4,.9,16.5,1.8],[228.9,104.4,q*53,.9,1.8,19],[228.9,110.4,q*46,.9,1.6,7.5]])add({x:a[0],y:a[1],z:a[2],dx:a[3],dy:a[4],dz:a[5],color:0xff2028,target:s.brake,name:`remote-id4-brake-${side}`});
    for(const a of [[229.2,112.6,q*39.8,.9,1.6,8.5],[229.2,107.8,q*38.8,.9,1.6,7]])add({x:a[0],y:a[1],z:a[2],dx:a[3],dy:a[4],dz:a[5],color:0xffffff,target:s.reverse,name:`remote-id4-reverse-${side}`});
  }
  s.beams.push(...makeProjectors(THREE,root,{x:.64,y:1.02,z:2.18,targetX:.30,targetY:.30,targetZ:36,distance:82},s.ownedObjects));
}

function bindF1(THREE,root,s){
  for(const name of ['REARLEDs_011_001_RearLight_0','light_rear_light_4_0','REARLEDs_011_001','light']){
    const mesh=root.getObjectByName(name);
    if(mesh?.isMesh||mesh?.isSkinnedMesh){replaceMaterials(THREE,mesh,s.brake,0xff1018,'remote-f1-rear');s.f1Rear=[...s.brake];break;}
  }
}

function bindGenericSignals(THREE,root,s){
  root.traverse(obj=>{
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
    if(!/signal|indicator|turn|amber|orange|blinker|flasher/.test(semanticPath(obj,root)))return;
    const already=[...s.signalLeft,...s.signalRight].some(mat=>Array.isArray(obj.material)?obj.material.includes(mat):obj.material===mat);
    if(already)return;
    splitTriangles(THREE,obj,[
      {name:'remote-signal-left',color:0xffb21c,target:s.signalLeft,match:x=>x<0},
      {name:'remote-signal-right',color:0xffb21c,target:s.signalRight,match:x=>x>=0}
    ],s.ownedGeometries);
  });
}

export function createRemoteAuthoredLighting(THREE,vehicleId,root){
  if(!THREE||!root)return null;
  const s={brake:[],running:[],reverse:[],headlight:[],signalLeft:[],signalRight:[],maskLayers:[],beams:[],f1Rear:[],ownedObjects:[],ownedGeometries:new Set(),ownedMaterials:new Set(),id4Meshes:new Map()};
  if(vehicleId==='wrx')bindWrx(THREE,root,s);
  else if(vehicleId==='civic')bindCivic(THREE,root,s);
  else if(vehicleId==='sonata')bindSonata(THREE,root,s);
  else if(vehicleId==='i3_2017')bindI3(THREE,root,s);
  else if(vehicleId==='countach_80')bindCountach(THREE,root,s);
  else if(vehicleId==='id4')bindId4(THREE,root,s);
  else if(vehicleId==='f1_2010')bindF1(THREE,root,s);
  bindGenericSignals(THREE,root,s);

  let disposed=false,updates=0;
  function setState(input={}){
    if(disposed)return;
    const night=clamp01(input.nightLevel),nightOn=night>.035,braking=!!input.braking,reversing=!!input.reversing,left=!!input.signalLeft&&!!input.signalBlink,right=!!input.signalRight&&!!input.signalBlink;
    const distance=Math.max(0,Number(input.distance)||0),beamFade=1-clamp01((distance-180)/180);
    setEmission(s.running,0xff2028,nightOn?(.35+night*2.5):.01);
    setEmission(s.brake,0xff1018,braking?5.2:(nightOn?(.45+night*.70):.01));
    setEmission(s.reverse,0xffffff,reversing?5.2:.01);
    setEmission(s.headlight,0xf8fbff,nightOn?(.75+night*5.8):.01);
    setEmission(s.signalLeft,0xffb21c,left?5.5:.01);
    setEmission(s.signalRight,0xffb21c,right?5.5:.01);

    for(const [mat,mesh] of s.id4Meshes){
      const brake=s.brake.includes(mat),reverse=s.reverse.includes(mat);
      const level=brake?(braking?.36:(nightOn?(.10+night*.08):0)):(reverse&&reversing?.30:0);
      mat.opacity=level;mat.emissiveIntensity=level>0?(brake?4.0:5.0):0;mesh.visible=level>.005;
    }

    if(vehicleId==='sonata'){
      const red=Math.max(nightOn?(.16+night*.18):0,braking?.52:0),frontWhite=nightOn?(.45+night*.28):0;
      for(const layer of s.maskLayers){
        let level=0;
        if(layer.filter==='red')level=red;
        else if(layer.filter==='amber')level=layer.side<0?(left?.98:0):(right?.98:0);
        else if(layer.filter==='white')level=layer.front?frontWhite:(reversing?.98:0);
        layer.mat.uniforms.uOpacity.value=level;layer.mesh.visible=level>.006;
      }
    }

    if(vehicleId==='f1_2010')for(const mat of s.f1Rear){
      const white=reversing;
      mat.color?.setHex?.(white?0xffffff:(braking?0xff1018:0x8a1018));
      mat.emissive?.setHex?.(white?0xffffff:0xff1018);
      mat.emissiveIntensity=white?4.8:(braking?4.4:(nightOn?.65:.01));
      mat.needsUpdate=true;
    }

    for(const beam of s.beams){beam.visible=nightOn&&beamFade>.02;beam.intensity=night*95*beamFade;}
    updates++;
  }
  setState({});

  return {
    mode:'authored-glb-lamps-v1',
    setState,
    diagnostics:()=>({vehicleId,mode:'authored-glb-lamps-v1',brake:s.brake.length,running:s.running.length,reverse:s.reverse.length,headlight:s.headlight.length,signalLeft:s.signalLeft.length,signalRight:s.signalRight.length,maskedLayers:s.maskLayers.length,projectors:s.beams.length}),
    dispose(){
      if(disposed)return;disposed=true;
      for(const obj of s.ownedObjects)obj.removeFromParent?.();
      for(const g of s.ownedGeometries)g.dispose?.();
      for(const m of s.ownedMaterials)m.dispose?.();
      for(const m of new Set([...s.brake,...s.running,...s.reverse,...s.headlight,...s.signalLeft,...s.signalRight]))m.dispose?.();
    }
  };
}
