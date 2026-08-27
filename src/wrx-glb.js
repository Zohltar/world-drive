import { ackermannSteeringAngles, ackermannAngleForSide } from './physics/steering-geometry.js';

// World Drive V21.24.40 — WRX stronger visible rear night-running lights on outer red taillamps.
// Night: only the outer left/right rear red lamps glow, now more visibly.
// Braking: lower/main red lamp + CHMSL add strong illumination.

export function createWrxGlbSystem({
  THREE,
  bodyGroup,
  existingWheels,
  vehicleSystem
}){
  const vehicleId='wrx';
  const host=new THREE.Group();
  host.name='wrx-vb-glb-host';
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
  let lastReverseRequested=false;

  const wheelControllers=[];
  const brakeMaterials=[];
  const runningTailMaterials=[];
  const reverseMaterials=[];
  const headlightMaterials=[];
  const headlightBeams=[];
  const spinAxis=new THREE.Vector3(1,0,0);
  const steerAxis=new THREE.Vector3(0,1,0);
  const spinQuaternion=new THREE.Quaternion();
  const steerQuaternion=new THREE.Quaternion();
  const tmpWorld=new THREE.Vector3();
  const tmpLocal=new THREE.Vector3();

  function clamp(value,min,max){
    return Math.max(min,Math.min(max,value));
  }

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
    if(shouldShow){
      hideProceduralVisuals();
      host.visible=true;
    }else{
      host.visible=false;
      restoreProceduralVisuals();
    }
  }

  function normalizeModel(model){
    // Native asset orientation is already correct for World Drive: +Z = nose.
    model.rotation.y=0;
    model.updateMatrixWorld(true);

    const initialBox=new THREE.Box3().setFromObject(model);
    const initialSize=new THREE.Vector3();
    initialBox.getSize(initialSize);
    const targetLength=4.60*1.20;
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

  function brightenBaseMaterials(){
    const tuned=new WeakSet();
    root?.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const mat of materials){
        if(!mat||tuned.has(mat))continue;
        tuned.add(mat);
        const name=String(mat.name||'').toLowerCase();

        if(name.includes('fh_paint')){
          if(mat.color)mat.color.multiplyScalar(1.08);
          if(!mat.emissive)mat.emissive=new THREE.Color(0x4a7dff);
          else mat.emissive.setHex(0x4a7dff);
          if(mat.map)mat.emissiveMap=mat.map;
          mat.emissiveIntensity=.26;
          if('roughness' in mat)mat.roughness=Math.max(.20,Math.min(.45,Number(mat.roughness)||.34));
          if('metalness' in mat)mat.metalness=Math.max(.12,Number(mat.metalness)||.18);
          if('envMapIntensity' in mat)mat.envMapIntensity=1.9;
        }else if(name.includes('fh_blacktrim')){
          if(mat.color)mat.color.multiplyScalar(1.12);
          if(!mat.emissive)mat.emissive=new THREE.Color(0x15191f);
          else mat.emissive.setHex(0x15191f);
          mat.emissiveIntensity=.18;
          if('envMapIntensity' in mat)mat.envMapIntensity=1.55;
        }else if(name.includes('fh_rim')){
          if(mat.color)mat.color.multiplyScalar(1.10);
          if(!mat.emissive)mat.emissive=new THREE.Color(0x22262c);
          else mat.emissive.setHex(0x22262c);
          mat.emissiveIntensity=.16;
          if('envMapIntensity' in mat)mat.envMapIntensity=1.8;
        }else if(name.includes('fh_glass')){
          if('envMapIntensity' in mat)mat.envMapIntensity=1.35;
          if('opacity' in mat&&mat.opacity<1)mat.opacity=Math.min(1,mat.opacity*1.08);
          mat.transparent=mat.opacity<.999;
        }else{
          if(mat.color)mat.color.multiplyScalar(1.06);
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.15,Number(mat.envMapIntensity)||1.15);
        }

        mat.needsUpdate=true;
      }
    });
  }

  function semanticPath(obj){
    const names=[];
    let cursor=obj;
    while(cursor&&cursor!==root?.parent){
      if(cursor.name)names.push(String(cursor.name).toLowerCase());
      cursor=cursor.parent;
    }
    return names.join(' ');
  }

  // M4.2: classify authored parts in root-local space without ever taking a
  // world-axis-aligned Box3. Used only for front-light classification now;
  // M4.6 reverse uses the asset's explicit fh_reverse_material node.
  function rootLocalGeometryCenter(obj,out=new THREE.Vector3()){
    const geometry=obj?.geometry;
    if(geometry){
      geometry.computeBoundingBox?.();
      if(geometry.boundingBox){
        geometry.boundingBox.getCenter(out);
        obj.localToWorld(out);
        root?.worldToLocal(out);
        return out;
      }
    }
    obj?.getWorldPosition?.(out);
    root?.worldToLocal(out);
    return out;
  }

  function cloneDynamicMaterials(mesh,target,color){
    const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const copies=source.map((mat,index)=>{
      const copy=mat.clone();
      copy.name=`${mat.name||mesh.name||'wrx-lamp'}-dynamic-${index}`;
      if(!copy.emissive)copy.emissive=new THREE.Color(0x000000);
      copy.emissive.setHex(color);
      copy.emissiveIntensity=.015;
      copy.toneMapped=false;
      if(copy.transparent)copy.depthWrite=false;
      copy.needsUpdate=true;
      target.push(copy);
      return copy;
    });
    mesh.material=Array.isArray(mesh.material)?copies:copies[0];
  }

  function splitRearRedLens(mesh){
    if(!mesh?.geometry||!mesh?.material)return false;
    const geometry=mesh.geometry.clone();
    const pos=geometry.getAttribute?.('position');
    if(!pos||pos.count<3)return false;

    let minY=Infinity,maxY=-Infinity;
    for(let i=0;i<pos.count;i++){
      const y=pos.getY(i);
      if(y<minY)minY=y;
      if(y>maxY)maxY=y;
    }
    const cut=minY+(maxY-minY)*.50;
    const sourceIndex=geometry.index
      ?Array.from(geometry.index.array)
      :Array.from({length:pos.count},(_,i)=>i);
    const lower=[];
    const upper=[];
    for(let i=0;i+2<sourceIndex.length;i+=3){
      const a=sourceIndex[i],b=sourceIndex[i+1],c=sourceIndex[i+2];
      const avgY=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
      (avgY>=cut?upper:lower).push(a,b,c);
    }
    if(!lower.length||!upper.length)return false;

    const source=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    const brake=source.clone();
    brake.name=`${source.name||'wrx-red'}-lower-brake`;
    if(!brake.emissive)brake.emissive=new THREE.Color(0xff1018);
    brake.emissive.setHex(0xff1018);
    brake.emissiveIntensity=.015;
    brake.toneMapped=false;

    const running=source.clone();
    running.name=`${source.name||'wrx-red'}-upper-running`;
    if(!running.emissive)running.emissive=new THREE.Color(0xff1820);
    running.emissive.setHex(0xff1820);
    running.emissiveIntensity=.01;
    running.toneMapped=false;

    geometry.setIndex([...lower,...upper]);
    geometry.clearGroups();
    geometry.addGroup(0,lower.length,0);
    geometry.addGroup(lower.length,upper.length,1);
    mesh.geometry=geometry;
    mesh.material=[brake,running];
    brakeMaterials.push(brake);
    runningTailMaterials.push(running);
    return true;
  }

  function bindAuthoredRearLights(){
    brakeMaterials.length=0;
    runningTailMaterials.length=0;
    reverseMaterials.length=0;
    root?.updateMatrixWorld(true);
    root?.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const path=semanticPath(obj);

      if(path.includes('fh_light_glass_red_material')){
        if(splitRearRedLens(obj))return;
      }

      if(path.includes('fh_taillight_new_material')){
        cloneDynamicMaterials(obj,brakeMaterials,0xff1018);
        return;
      }

      if(path.includes('fh_chmsl_new_material')){
        cloneDynamicMaterials(obj,brakeMaterials,0xff1018);
        return;
      }

      // M4.6: the GLB audit identifies this exact authored branch as the WRX
      // reverse lamp: fh_reverse_material_15/Object_37. Its source material is
      // misleadingly named "Eblems", so material-name heuristics are invalid.
      // Bind by semantic node path and nothing else.
      if(path.includes('fh_reverse_material')){
        cloneDynamicMaterials(obj,reverseMaterials,0xffffff);
        return;
      }
    });
    if(!reverseMaterials.length){
      console.warn('WRX authored reverse-lamp binding found no fh_reverse_material mesh.');
    }
  }

  function bindAuthoredHeadlights(){
    headlightMaterials.length=0;
    root?.updateMatrixWorld(true);
    root?.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const path=semanticPath(obj);
      const names=(Array.isArray(obj.material)?obj.material:[obj.material])
        .map(mat=>String(mat?.name||'').toLowerCase());
      const localCenter=rootLocalGeometryCenter(obj);
      const isFrontCluster=localCenter.z>1.45 && localCenter.y>.45;
      if(
        isFrontCluster &&
        (
          path.includes('fh_lowhighbeam_material')||
          path.includes('fh_headlight_part4_material')||
          path.includes('fh_headlight_part4_material.001')||
          path.includes('fh_light_glass_material')||
          path.includes('fh_light_glass_material.001')||
          path.includes('fh_light_glass_material.002')||
          names.some(name=>
            name.includes('fh_lowhighbeam')||
            name.includes('fh_headlight_part4')||
            name==='fh_light_glass'
          )
        )
      ){
        cloneDynamicMaterials(obj,headlightMaterials,0xf8fbff);
      }
    });
  }

  function createHeadlightProjectors(){
    for(const beam of headlightBeams){
      if(beam.light?.parent)beam.light.parent.remove(beam.light);
      if(beam.target?.parent)beam.target.parent.remove(beam.target);
    }
    headlightBeams.length=0;

    const placements=[-0.72,0.72];
    for(const side of placements){
      const target=new THREE.Object3D();
      target.position.set(side*.70,0.10,36.0);
      root.add(target);

      const light=new THREE.SpotLight(0xf8fbff,0,82,0.40,0.62,1.1);
      light.name=`wrx-headlight-${side<0?'l':'r'}`;
      light.position.set(side*0.98,0.68,2.12);
      light.target=target;
      light.castShadow=false;
      light.visible=false;
      root.add(light);

      headlightBeams.push({light,target});
    }
  }

  function setHeadlights(nightLevel=0){
    const level=clamp(Number(nightLevel)||0,0,1);
    const glow=.015+level*8.5;
    for(const mat of headlightMaterials){
      mat.emissive?.setHex(0xf8fbff);
      mat.emissiveIntensity=glow;
      mat.needsUpdate=true;
    }
    const beamVisible=level>.06;
    const beamIntensity=level*65.0;
    for(const beam of headlightBeams){
      if(!beam?.light)continue;
      beam.light.visible=beamVisible;
      beam.light.intensity=beamIntensity;
      beam.light.distance=60+level*20;
      beam.light.angle=0.36;
      beam.light.penumbra=0.65;
      beam.light.decay=1.05;
    }
  }

  function setRearLights(braking=false,reversing=false,nightLevel=0){
    const night=clamp(Number(nightLevel)||0,0,1);
    lastReverseRequested=!!reversing;
    const runningIntensity=night>.06 ? (.55+night*3.25) : .02;
    for(const mat of runningTailMaterials){
      mat.emissive?.setHex(0xff2028);
      mat.emissiveIntensity=runningIntensity;
      mat.needsUpdate=true;
    }

    for(const mat of brakeMaterials){
      mat.emissive?.setHex(0xff1018);
      mat.emissiveIntensity=braking?5.0:.015;
      mat.needsUpdate=true;
    }

    for(const mat of reverseMaterials){
      mat.emissive?.setHex(0xffffff);
      mat.emissiveIntensity=reversing?8.0:.01;
      mat.needsUpdate=true;
    }
  }

  function findWheelCarrier(wheelRoot){
    let candidate=null;
    wheelRoot.traverse(obj=>{
      if(candidate||obj===wheelRoot)return;
      if(obj.children?.some(child=>child?.isMesh||child?.isSkinnedMesh))candidate=obj;
    });
    return candidate;
  }

  function isAuthoredCaliper(obj){
    if(!obj?.isMesh&&!obj?.isSkinnedMesh)return false;
    const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    const names=materials.map(mat=>String(mat?.name||'').toLowerCase());
    return names.some(name=>
      name==='material'||
      name==='n.001'||
      name==='n.004'||
      name==='n.005'
    );
  }

  function buildWheelController(wheelRoot){
    const carrier=findWheelCarrier(wheelRoot);
    if(!carrier||!carrier.parent)return null;

    const calipers=[];
    carrier.traverse(obj=>{
      if(isAuthoredCaliper(obj))calipers.push(obj);
    });

    root.updateMatrixWorld(true);
    carrier.getWorldPosition(tmpWorld);
    tmpLocal.copy(tmpWorld);
    root.worldToLocal(tmpLocal);

    const front=tmpLocal.z>0;
    const side=tmpLocal.x<0?-1:1;
    const parent=carrier.parent;
    const originalPosition=carrier.position.clone();
    const originalQuaternion=carrier.quaternion.clone();
    const originalScale=carrier.scale.clone();

    parent.remove(carrier);

    const steerPivot=new THREE.Group();
    steerPivot.name=`${wheelRoot.name||'wrx-wheel'}-hub-steer`;
    steerPivot.position.copy(originalPosition);
    parent.add(steerPivot);

    const spinPivot=new THREE.Group();
    spinPivot.name=`${wheelRoot.name||'wrx-wheel'}-hub-spin`;
    steerPivot.add(spinPivot);

    carrier.position.set(0,0,0);
    carrier.quaternion.copy(originalQuaternion);
    carrier.scale.copy(originalScale);
    spinPivot.add(carrier);

    root.updateMatrixWorld(true);
    for(const caliper of calipers){
      if(!caliper?.parent)continue;
      steerPivot.attach(caliper);
    }

    return {front,side,steerPivot,spinPivot,caliperCount:calipers.length};
  }

  function prepareWheelAnimation(){
    wheelControllers.length=0;
    const wheelRoots=[];

    root.traverse(obj=>{
      const name=String(obj?.name||'').toLowerCase();
      if(name.includes('fh6_wrx_wheel'))wheelRoots.push(obj);
    });

    const unique=[];
    for(const wheelRoot of wheelRoots){
      if(unique.some(existing=>wheelRoot.parent===existing||existing.parent===wheelRoot))continue;
      unique.push(wheelRoot);
    }

    for(const wheelRoot of unique){
      const controller=buildWheelController(wheelRoot);
      if(controller)wheelControllers.push(controller);
    }

    wheelControllers.sort((a,b)=>Number(b.front)-Number(a.front)||a.side-b.side);
    if(wheelControllers.length>4)wheelControllers.length=4;
  }

  function animateWheels(dt,speed,steerAngle){
    if(!wheelControllers.length)return;
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const wheelRadius=.317;
    const physics=vehicleSystem?.active?.physics||{};
    const geometry=ackermannSteeringAngles({
      wheelbase:physics.wheelbase||2.65,
      trackWidth:physics.trackWidth||1.56,
      centerAngle:Number(steerAngle)||0
    });

    wheelSpin+=Number(speed||0)*safeDt/wheelRadius;
    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;

    spinQuaternion.setFromAxisAngle(spinAxis,wheelSpin);

    for(const wheel of wheelControllers){
      wheel.spinPivot.quaternion.copy(spinQuaternion);
      if(wheel.front){
        const side=wheel.side<0?'left':'right';
        const wheelSteer=ackermannAngleForSide(geometry,side);
        steerQuaternion.setFromAxisAngle(steerAxis,wheelSteer);
        wheel.steerPivot.quaternion.copy(steerQuaternion);
      }else{
        wheel.steerPivot.quaternion.identity();
      }
    }
  }

  async function load(){
    if(loadStarted)return;
    loadStarted=true;
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const loader=new GLTFLoader();
      const url=new URL('./assets/subaru_wrx_vb.glb',import.meta.url).href;
      const gltf=await loader.loadAsync(url);
      root=gltf.scene||gltf.scenes?.[0];
      if(!root)throw new Error('WRX GLB sans scène');

      root.name='subaru_wrx_vb_root';
      root.traverse(obj=>{
        if(obj?.isMesh||obj?.isSkinnedMesh){
          obj.castShadow=true;
          obj.receiveShadow=true;
          const mats=Array.isArray(obj.material)?obj.material:[obj.material];
          for(const mat of mats){
            if(!mat)continue;
            mat.dithering=true;
            if(mat.transparent)mat.depthWrite=false;
          }
        }
      });

      normalizeModel(root);
      host.add(root);
      brightenBaseMaterials();
      prepareWheelAnimation();
      bindAuthoredRearLights();
      bindAuthoredHeadlights();
      createHeadlightProjectors();
      setRearLights(false,false,0);
      setHeadlights(0);

      ready=true;
      loadError=null;
      applyVisibility();
    }catch(error){
      loadError=error;
      ready=false;
      console.warn('Detailed WRX GLB unavailable; procedural WRX fallback kept.',error);
      applyVisibility();
    }
  }

  function setActive(value){
    requestedActive=!!value;if(requestedActive&&!ready&&!loadStarted)load();
    if(!requestedActive){
      wheelSpin=0;
      setRearLights(false,false,0);
      setHeadlights(0);
    }
    applyVisibility();
  }

  function update(dt,{speed=0,steerAngle=0,braking=false,reversing=false,nightLevel=0}={}){
    if(!requestedActive||!ready||vehicleSystem?.activeId!==vehicleId)return;
    applyVisibility();
    animateWheels(dt,speed,steerAngle);
    setRearLights(braking,reversing,nightLevel);
    setHeadlights(nightLevel);
  }
  return {
    setActive,
    update,
    get ready(){return ready;},
    get loadError(){return loadError;},
    get active(){return requestedActive&&ready;},
    get wheelControllerCount(){return wheelControllers.length;},
    get reverseMaterialCount(){return reverseMaterials.length;},
    get reverseRequested(){return lastReverseRequested;},
    host
  };
}
