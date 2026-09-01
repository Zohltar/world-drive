// World Drive V21.24.94 — BMW i3 unified wheel steering pivots.
// Source: Sketchfab model by tonielpro520, CC-BY 4.0.

export function createI3GlbSystem({
  THREE,
  bodyGroup,
  existingWheels,
  vehicleSystem
}){
  const vehicleId='i3_2017';
  const host=new THREE.Group();
  host.name='bmw-i3-2017-glb-host';
  host.visible=false;
  bodyGroup.add(host);

  const hiddenBodyState=new Map();
  const hiddenWheelState=new Map();
  let requestedActive=false;
  let swapped=false;
  let ready=false;
  let loadError=null;
  let loadStarted=false;
  let root=null;
  let wheelSpin=0;

  const wheelAnimators=[];
  const headlightMaterials=[];
  const tailMaterials=[];
  const reverseMaterials=[];
  const headlightBeams=[];

  const spinAxis=new THREE.Vector3(1,0,0);
  // GLB local axes: X = axle, Y = longitudinal (-Y is front), Z = vertical.
  const steerAxis=new THREE.Vector3(0,0,1);
  const spinQuat=new THREE.Quaternion();
  const steerQuat=new THREE.Quaternion();
  const combinedQuat=new THREE.Quaternion();
  const tmpVec=new THREE.Vector3();
  const tmpNormal=new THREE.Vector3();

  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

  function hideProceduralVisuals(){
    if(swapped)return;
    hiddenBodyState.clear();
    for(const child of bodyGroup.children){
      if(child===host)continue;
      hiddenBodyState.set(child,child.visible);
      child.visible=false;
    }
    hiddenWheelState.clear();
    for(const wheel of existingWheels||[]){
      const pivot=wheel?.pivot;
      if(!pivot)continue;
      hiddenWheelState.set(pivot,pivot.visible);
      pivot.visible=false;
    }
    swapped=true;
  }

  function restoreProceduralVisuals(){
    if(!swapped)return;
    for(const [obj,visible] of hiddenBodyState)obj.visible=visible;
    for(const [obj,visible] of hiddenWheelState)obj.visible=visible;
    hiddenBodyState.clear();
    hiddenWheelState.clear();
    swapped=false;
  }

  function applyVisibility(){
    const shouldShow=requestedActive&&ready&&vehicleSystem?.activeId===vehicleId;
    if(shouldShow){hideProceduralVisuals();host.visible=true;}
    else{host.visible=false;restoreProceduralVisuals();}
  }

  function normalizeModel(model){
    // Asset is authored in meters, +Z forward, +Y up.
    model.rotation.y=0;
    model.updateMatrixWorld(true);
    const initialBox=new THREE.Box3().setFromObject(model);
    const initialSize=new THREE.Vector3();
    initialBox.getSize(initialSize);
    // User-requested +20% visual scale over the authored ~4.01 m baseline.
    const targetLength=4.01*1.20;
    const scale=targetLength/Math.max(.001,initialSize.z);
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(model);
    const center=new THREE.Vector3();
    box.getCenter(center);
    model.position.x-=center.x;
    model.position.z-=center.z;
    model.position.y-=box.min.y;
    model.updateMatrixWorld(true);
  }

  function tuneMaterials(sceneRoot){
    const tuned=new WeakSet();
    sceneRoot.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      obj.castShadow=true;
      obj.receiveShadow=true;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const mat of mats){
        if(!mat||tuned.has(mat))continue;
        tuned.add(mat);
        const name=String(mat.name||'').toLowerCase();
        mat.dithering=true;
        if(mat.transparent)mat.depthWrite=false;

        if(name.includes('pintura')){
          if('roughness' in mat)mat.roughness=.27;
          if('metalness' in mat)mat.metalness=.10;
          if('envMapIntensity' in mat)mat.envMapIntensity=1.65;
        }else if(name.includes('metal_preto')||name.includes('plastico')){
          if('roughness' in mat)mat.roughness=Math.max(.28,Number(mat.roughness)||.34);
          if('envMapIntensity' in mat)mat.envMapIntensity=1.25;
        }else if(name.includes('cromado')||name.includes('roda')){
          if('metalness' in mat)mat.metalness=Math.max(.45,Number(mat.metalness)||0);
          if('roughness' in mat)mat.roughness=.25;
          if('envMapIntensity' in mat)mat.envMapIntensity=1.85;
        }else if(name.includes('vidros')&&!name.includes('vermelhos')){
          // Keep the authored i3 glass character but make it physically readable.
          mat.transparent=true;
          mat.depthWrite=false;
          if(mat.color)mat.color.multiplyScalar(.72);
          mat.opacity=Math.max(.55,Math.min(.82,Number(mat.opacity)||.65));
          if('roughness' in mat)mat.roughness=.10;
          if('metalness' in mat)mat.metalness=.05;
          if('envMapIntensity' in mat)mat.envMapIntensity=1.65;
        }else{
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.15,Number(mat.envMapIntensity)||1.15);
        }
        mat.needsUpdate=true;
      }
    });
  }

  function makeQuadrantAnimator(mesh,{spin=true,steer=true}={}){
    const geometry=mesh?.geometry;
    const position=geometry?.getAttribute?.('position');
    if(!geometry||!position)return null;
    const normal=geometry.getAttribute?.('normal')||null;
    const bindPosition=new Float32Array(position.array);
    const bindNormal=normal?new Float32Array(normal.array):null;
    position.setUsage?.(THREE.DynamicDrawUsage);
    normal?.setUsage?.(THREE.DynamicDrawUsage);
    // The imported i3 mesh is rotated at the node level: local Y maps to
    // world -Z. Therefore the front axle is local Y < 0, not local Z > 0.
    // Split the combined tire/brake meshes by X (left/right) and Y (axle).
    const specs=[
      {front:true, side:-1, match:(x,y,z)=>y<0&&x<0},
      {front:true, side: 1, match:(x,y,z)=>y<0&&x>=0},
      {front:false,side:-1, match:(x,y,z)=>y>=0&&x<0},
      {front:false,side: 1, match:(x,y,z)=>y>=0&&x>=0}
    ];
    const groups=[];
    for(const spec of specs){
      const verts=[];
      let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
      for(let i=0;i<position.count;i++){
        const o=i*3,x=bindPosition[o],y=bindPosition[o+1],z=bindPosition[o+2];
        if(!spec.match(x,y,z))continue;
        verts.push(i);
        minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);
        maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);
      }
      if(!verts.length)continue;
      groups.push({...spec,verts,center:new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2)});
    }
    return groups.length===4?{mesh,position,normal,bindPosition,bindNormal,groups,spin,steer}:null;
  }

  function makeSingleWheelAnimator(mesh,{front=false}={}){
    const geometry=mesh?.geometry;
    const position=geometry?.getAttribute?.('position');
    if(!geometry||!position)return null;
    const normal=geometry.getAttribute?.('normal')||null;
    const bindPosition=new Float32Array(position.array);
    const bindNormal=normal?new Float32Array(normal.array):null;
    position.setUsage?.(THREE.DynamicDrawUsage);
    normal?.setUsage?.(THREE.DynamicDrawUsage);
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    const verts=[];
    for(let i=0;i<position.count;i++){
      const o=i*3,x=bindPosition[o],y=bindPosition[o+1],z=bindPosition[o+2];
      verts.push(i);
      minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);
      maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);
    }
    return {
      mesh,position,normal,bindPosition,bindNormal,spin:true,steer:true,
      groups:[{front,verts,center:new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2)}]
    };
  }


  function makeWheelVolumeAnimator(mesh,wheelCenters,{radius=.30,xHalfWidth=.32}={}){
    const geometry=mesh?.geometry;
    const position=geometry?.getAttribute?.('position');
    if(!geometry||!position||!wheelCenters?.length)return null;
    const normal=geometry.getAttribute?.('normal')||null;
    const bindPosition=new Float32Array(position.array);
    const bindNormal=normal?new Float32Array(normal.array):null;
    position.setUsage?.(THREE.DynamicDrawUsage);
    normal?.setUsage?.(THREE.DynamicDrawUsage);
    const groups=[];
    const r2=radius*radius;
    for(const c of wheelCenters){
      const verts=[];
      for(let i=0;i<position.count;i++){
        const o=i*3;
        const x=bindPosition[o],y=bindPosition[o+1],z=bindPosition[o+2];
        if(Math.abs(x-c.x)>xHalfWidth)continue;
        const dy=y-c.y,dz=z-c.z;
        if(dy*dy+dz*dz>r2)continue;
        verts.push(i);
      }
      if(!verts.length)continue;
      groups.push({front:c.y<0,verts,center:c.clone()});
    }
    return groups.length?{mesh,position,normal,bindPosition,bindNormal,spin:true,steer:true,groups}:null;
  }

  function prepareWheelAnimation(sceneRoot){
    wheelAnimators.length=0;
    const rimMeshes=[];
    const tireMeshes=[];
    const discMeshes=[];
    const wheelAuxMeshes=[];

    sceneRoot.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      const names=mats.map(m=>String(m?.name||'').toLowerCase());
      if(names.some(n=>n==='carro_roda'))rimMeshes.push(obj);
      if(names.some(n=>n==='carro_pneu'))tireMeshes.push(obj);
      if(names.some(n=>n==='carro_freio_disco'))discMeshes.push(obj);
      if(names.some(n=>n==='carro_metal_preto'||n==='carro_metal_preto_1'||n==='carro_logo')){
        wheelAuxMeshes.push(obj);
      }
    });

    // The tire geometry represents the physical wheel envelope most reliably.
    // Use its four quadrant centers as the ONE canonical pivot set for every
    // wheel component. In V21.24.93 the rim bbox center sat ~5.6 cm farther
    // outward on X than the tire center, which made tire and mag appear to take
    // different steering angles even though the numeric steerAngle was equal.
    let canonicalCenters=[];
    const tireAnimators=[];
    for(const mesh of tireMeshes){
      const animator=makeQuadrantAnimator(mesh,{spin:true,steer:true});
      if(!animator)continue;
      tireAnimators.push(animator);
      if(!canonicalCenters.length){
        canonicalCenters=animator.groups.map(g=>({
          front:!!g.front,
          side:g.side,
          center:g.center.clone()
        }));
      }
    }

    const canonicalFor=(front,side)=>{
      const exact=canonicalCenters.find(c=>c.front===!!front&&c.side===side);
      return exact?.center||null;
    };

    for(const animator of tireAnimators)wheelAnimators.push(animator);

    // Brake-disc geometry follows the exact same tire pivots.
    for(const mesh of discMeshes){
      const animator=makeQuadrantAnimator(mesh,{spin:true,steer:true});
      if(!animator)continue;
      for(const group of animator.groups){
        const c=canonicalFor(group.front,group.side);
        if(c)group.center.copy(c);
      }
      wheelAnimators.push(animator);
    }

    const wheelCenters=[];
    for(const mesh of rimMeshes){
      const pos=mesh.geometry?.getAttribute?.('position');
      if(!pos)continue;
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let i=0;i<pos.count;i++){
        minX=Math.min(minX,pos.getX(i));maxX=Math.max(maxX,pos.getX(i));
        minY=Math.min(minY,pos.getY(i));maxY=Math.max(maxY,pos.getY(i));
      }
      const cx=(minX+maxX)/2;
      const cy=(minY+maxY)/2;
      const front=cy<0;
      const side=cx<0?-1:1;
      const animator=makeSingleWheelAnimator(mesh,{front});
      if(!animator)continue;
      const canonical=canonicalFor(front,side);
      if(canonical)animator.groups[0].center.copy(canonical);
      wheelAnimators.push(animator);
      wheelCenters.push((canonical||animator.groups[0].center).clone());
    }

    // The authored mag is fragmented across many generic black-metal meshes.
    // These pieces now use the same canonical tire centers too, so the entire
    // wheel shares one steering axis and one rolling axis.
    let auxiliaryAnimators=0;
    for(const mesh of wheelAuxMeshes){
      const animator=makeWheelVolumeAnimator(mesh,wheelCenters,{radius:.30,xHalfWidth:.32});
      if(animator){wheelAnimators.push(animator);auxiliaryAnimators++;}
    }

    console.info(`BMW i3 authored wheel animators: ${wheelAnimators.length} (unified tire pivots; 4 rims + ${auxiliaryAnimators} auxiliary meshes)`);
  }

  function animateAnimator(animator,steerAngle){
    const {position,normal,bindPosition,bindNormal,groups,spin,steer}=animator;
    spinQuat.setFromAxisAngle(spinAxis,wheelSpin);
    for(const group of groups){
      const steering=group.front&&steer ? Number(steerAngle)||0 : 0;
      steerQuat.setFromAxisAngle(steerAxis,steering);
      if(spin)combinedQuat.copy(steerQuat).multiply(spinQuat);
      else combinedQuat.copy(steerQuat);
      const c=group.center;
      for(const vi of group.verts){
        const o=vi*3;
        tmpVec.set(bindPosition[o]-c.x,bindPosition[o+1]-c.y,bindPosition[o+2]-c.z)
          .applyQuaternion(combinedQuat).add(c);
        position.setXYZ(vi,tmpVec.x,tmpVec.y,tmpVec.z);
        if(normal&&bindNormal){
          tmpNormal.set(bindNormal[o],bindNormal[o+1],bindNormal[o+2]).applyQuaternion(combinedQuat);
          normal.setXYZ(vi,tmpNormal.x,tmpNormal.y,tmpNormal.z);
        }
      }
    }
    position.needsUpdate=true;
    if(normal)normal.needsUpdate=true;
  }

  function animateWheels(dt,speed,steerAngle){
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const radius=.357*1.20;
    wheelSpin+=Number(speed||0)*safeDt/radius;
    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;
    for(const animator of wheelAnimators)animateAnimator(animator,steerAngle);
  }

  function cloneDynamicMaterial(source,{name,color,opacity=null}={}){
    const mat=source.clone();
    mat.name=name;
    if(!mat.emissive)mat.emissive=new THREE.Color(color);
    else mat.emissive.setHex(color);
    mat.emissiveIntensity=.01;
    mat.toneMapped=false;
    if(opacity!==null){mat.transparent=true;mat.opacity=opacity;mat.depthWrite=false;}
    mat.needsUpdate=true;
    return mat;
  }

  function bindLights(sceneRoot){
    headlightMaterials.length=0;tailMaterials.length=0;reverseMaterials.length=0;
    sceneRoot.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      const name=String(mats[0]?.name||'').toLowerCase();
      if(name==='carro_refletor_farol'||name==='carro_refletor_farol_1'){
        const mat=cloneDynamicMaterial(mats[0],{name:'i3-headlight-dynamic',color:0xf8fbff});
        if(mat.map)mat.emissiveMap=mat.map;
        obj.material=mat;headlightMaterials.push(mat);
      }else if(name==='carro_vidros_vermelhos'||name==='carro_vidros_vermelhos_1'){
        const mat=cloneDynamicMaterial(mats[0],{name:'i3-tail-red-dynamic',color:0xff1420,opacity:mats[0].opacity});
        obj.material=mat;tailMaterials.push(mat);
      }else if(name==='carro_refletor_lanterna'){
        const mat=cloneDynamicMaterial(mats[0],{name:'i3-reverse-dynamic',color:0xffffff});
        if(mat.map)mat.emissiveMap=mat.map;
        obj.material=mat;reverseMaterials.push(mat);
      }
    });
  }

  function createHeadlightBeams(){
    for(const side of [-1,1]){
      const target=new THREE.Object3D();
      target.position.set(side*.62,.15,30);
      host.add(target);
      const light=new THREE.SpotLight(0xf8fbff,0,72,.36,.68,1.0);
      light.position.set(side*.60,.78,1.93);
      light.target=target;light.castShadow=false;light.visible=false;
      host.add(light);headlightBeams.push({light,target});
    }
  }

  function updateLights({braking=false,reversing=false,nightLevel=0}={}){
    const night=clamp(Number(nightLevel)||0,0,1);
    const nightOn=night>.06;
    for(const mat of headlightMaterials){
      mat.emissive?.setHex(0xf8fbff);
      mat.emissiveIntensity=nightOn?(.8+night*4.8):.01;
      mat.needsUpdate=true;
    }
    const tailIntensity=braking?5.2:(nightOn?.18+night*.95:.01);
    for(const mat of tailMaterials){
      mat.emissive?.setHex(0xff1420);mat.emissiveIntensity=tailIntensity;mat.needsUpdate=true;
    }
    for(const mat of reverseMaterials){
      mat.emissive?.setHex(0xffffff);mat.emissiveIntensity=reversing?4.8:.01;mat.needsUpdate=true;
    }
    for(const beam of headlightBeams){
      beam.light.visible=nightOn;
      beam.light.intensity=nightOn?night*100:0;
      beam.light.distance=65+night*15;
    }
  }

  async function load(){
    if(loadStarted)return;
    loadStarted=true;
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const loader=new GLTFLoader();
      const url=new URL('../../assets/2017_bmw_i3.glb',import.meta.url).href;
      const gltf=await loader.loadAsync(url);
      root=gltf.scene||gltf.scenes?.[0];
      if(!root)throw new Error('BMW i3 GLB sans scène');
      root.name='bmw_i3_2017_root';
      normalizeModel(root);
      host.add(root);
      tuneMaterials(root);
      prepareWheelAnimation(root);
      bindLights(root);
      createHeadlightBeams();
      updateLights({});
      ready=true;loadError=null;applyVisibility();
    }catch(error){
      loadError=error;ready=false;
      console.warn('Detailed BMW i3 GLB unavailable; procedural i3 fallback kept.',error);
      applyVisibility();
    }
  }

  function setActive(value){requestedActive=!!value;if(requestedActive&&!ready&&!loadStarted)load();if(!requestedActive)wheelSpin=0;applyVisibility();}
  function update(dt,{speed=0,steerAngle=0,braking=false,reversing=false,nightLevel=0}={}){
    if(!requestedActive||!ready||vehicleSystem?.activeId!==vehicleId)return;
    applyVisibility();animateWheels(dt,speed,steerAngle);updateLights({braking,reversing,nightLevel});
  }
  return {setActive,update,get ready(){return ready;},get loadError(){return loadError;},get active(){return requestedActive&&ready;},host};
}
