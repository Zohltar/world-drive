// World Drive V21.24.9 — Countach steering wheel aligned to the real steering-column axis.
// Keeps the proven procedural wheel pivots as invisible physics/suspension probes,
// while rendering the complete authored GLB including its own tires and rims.

export function createCountachGlbSystem({
  THREE,
  bodyGroup,
  existingWheels,
  vehicleSystem
}){
  const vehicleId='countach_80';
  const host=new THREE.Group();
  host.name='countach-real-glb-host';
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

  let leftFrontBone=null;
  let rightFrontBone=null;
  let rearTiresBone=null;
  let steeringWheelBone=null;
  let wheelSpin=0;

  // 1989/25th Anniversary Countach: approximately 3.15 steering-wheel turns
  // lock-to-lock. The visible steering wheel follows the *actual simulated rack*
  // angle, so steering slew, return-to-centre and speed-dependent road-wheel
  // command are represented exactly instead of following raw controller input.
  const STEERING_WHEEL_LOCK_TO_LOCK_TURNS=3.15;
  const STEERING_WHEEL_HALF_RANGE_RAD=
    STEERING_WHEEL_LOCK_TO_LOCK_TURNS*Math.PI;

  // V21.24.5 — authored-model cockpit camera + authored rear lamp state.
  let headYaw=0;
  let headPitch=0;
  let pendingMouseYaw=0;
  let pendingMousePitch=0;
  let driverCameraActive=false;
  let savedCameraNear=null;
  let brakeLampMaterial=null;
  let reverseLampMaterial=null;
  const cameraEyeLocal=new THREE.Vector3(.35,1.08,.14);
  const cameraWorldEye=new THREE.Vector3();
  const cameraLocalDirection=new THREE.Vector3();
  const cameraWorldDirection=new THREE.Vector3();
  const cameraWorldUp=new THREE.Vector3();
  const cameraWorldQuaternion=new THREE.Quaternion();

  // Bind rotations are preserved so imported skeleton orientation remains valid.
  const bindEuler=new Map();
  const bindQuaternion=new Map();
  // Authored Countach steering-column axis, derived from the actual steering
  // wheel mesh plane in the supplied GLB. The wheel plane normal is the
  // physical rotation axis of the steering column.
  const steeringColumnAxis=new THREE.Vector3(0,-0.48936,0.87208).normalize();
  const steeringWheelDeltaQuaternion=new THREE.Quaternion();

  function saveBindRotation(obj){
    if(!obj)return;
    bindQuaternion.set(obj,obj.quaternion.clone());
    bindEuler.set(obj,{
      x:obj.rotation.x,
      y:obj.rotation.y,
      z:obj.rotation.z,
      order:obj.rotation.order||'XYZ'
    });
    obj.rotation.order='YXZ';
  }

  function clamp(value,min,max){
    return Math.max(min,Math.min(max,value));
  }

  function isDriverCameraMode(modeLabel=''){
    const label=String(modeLabel||'').toLowerCase();
    return label.includes('capot')||
      label.includes('cockpit')||
      label.includes('first')||
      label.includes('1st')||
      label.includes('1re')||
      label.includes('1ère')||
      label.includes('premiere')||
      label.includes('première')||
      label.includes('driver')||
      label.includes('conducteur');
  }

  // Split the authored lamp geometry into rear and non-rear material groups.
  // This keeps the original GLB lenses/shape exactly as modeled by the author:
  // SignalLights = red brake lamps, Lights = white reverse lamps.
  function bindAuthoredRearLampMaterial(mesh,kind){
    if(!mesh?.geometry||!mesh?.material)return null;
    const geometry=mesh.geometry;
    const pos=geometry.getAttribute?.('position');
    if(!pos||pos.count<3)return null;

    geometry.computeBoundingBox?.();
    const box=geometry.boundingBox;
    if(!box)return null;

    // In the supplied Countach asset the nose is +Z and the rear fascia is
    // clustered very close to the minimum local Z. Keep only that authored rear
    // cluster; front head/signal lamps remain on the original material.
    const span=Math.max(.001,box.max.z-box.min.z);
    const rearCut=box.min.z+span*.20;
    const sourceIndex=geometry.index;
    const indices=sourceIndex
      ?Array.from(sourceIndex.array)
      :Array.from({length:pos.count},(_,i)=>i);
    const rear=[];
    const other=[];

    for(let i=0;i+2<indices.length;i+=3){
      const a=indices[i],b=indices[i+1],c=indices[i+2];
      const avgZ=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
      const bucket=avgZ<=rearCut?rear:other;
      bucket.push(a,b,c);
    }
    if(!rear.length)return null;

    const baseMaterial=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    const rearMaterial=baseMaterial.clone();
    rearMaterial.name=`${baseMaterial.name||kind}-rear-dynamic`;
    rearMaterial.emissive=rearMaterial.emissive||new THREE.Color(0x000000);
    rearMaterial.emissiveIntensity=.02;

    // Put rear triangles first so two material groups can share the exact same
    // authored BufferGeometry without adding any extra lamp meshes.
    geometry.setIndex([...rear,...other]);
    geometry.clearGroups();
    geometry.addGroup(0,rear.length,0);
    if(other.length)geometry.addGroup(rear.length,other.length,1);
    mesh.material=[rearMaterial,baseMaterial];

    return rearMaterial;
  }

  function bindAuthoredRearLights(){
    brakeLampMaterial=null;
    reverseLampMaterial=null;

    root?.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const name=String(obj.name||'').toLowerCase();
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      const materialNames=materials.map(mat=>String(mat?.name||'').toLowerCase()).join(' ');

      if(!brakeLampMaterial&&(name.includes('signallights')||materialNames.includes('signallights'))){
        brakeLampMaterial=bindAuthoredRearLampMaterial(obj,'brake');
      }
      if(!reverseLampMaterial&&(name.includes('shape_lights')||materialNames.split(/\s+/).includes('lights'))){
        reverseLampMaterial=bindAuthoredRearLampMaterial(obj,'reverse');
      }
    });
  }

  function setRearLights(braking=false,reversing=false){
    if(brakeLampMaterial){
      brakeLampMaterial.color?.setHex(braking?0xff2028:0x890000);
      brakeLampMaterial.emissive?.setHex(0xff0b10);
      brakeLampMaterial.emissiveIntensity=braking?4.2:.02;
      brakeLampMaterial.needsUpdate=true;
    }
    if(reverseLampMaterial){
      reverseLampMaterial.color?.setHex(reversing?0xffffff:0xe1e1e1);
      reverseLampMaterial.emissive?.setHex(0xffffff);
      reverseLampMaterial.emissiveIntensity=reversing?4.0:.02;
      reverseLampMaterial.needsUpdate=true;
    }
  }

  function addHeadLookDelta(deltaX=0,deltaY=0){
    if(!requestedActive)return;
    pendingMouseYaw+=-Number(deltaX||0)*.0032;
    pendingMousePitch+=-Number(deltaY||0)*.0030;
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
      // Still used by vehicle-presentation for road/terrain contact sampling.
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
    // The supplied model is authored at a sensible real-world scale but includes
    // mirrors/body overhang beyond the nominal Countach dimensions. Normalize by
    // wheelbase/overall length while preserving all proportions.
    model.updateMatrixWorld(true);
    const initialBox=new THREE.Box3().setFromObject(model);
    const initialSize=new THREE.Vector3();
    initialBox.getSize(initialSize);

    const visualUpscale=1.15;
    const targetLength=4.14*visualUpscale;
    const targetWidthWithMirrors=2.08*visualUpscale;
    const scale=Math.min(
      targetLength/Math.max(.001,initialSize.z),
      targetWidthWithMirrors/Math.max(.001,initialSize.x)
    );
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);

    const box=new THREE.Box3().setFromObject(model);
    const center=new THREE.Vector3();
    box.getCenter(center);

    // +Z in the supplied asset is the nose, matching World Drive's local front.
    model.position.x-=center.x;
    model.position.z-=center.z;
    model.position.y-=box.min.y;
    model.updateMatrixWorld(true);
  }

  async function load(){
    if(loadStarted)return;
    loadStarted=true;
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const loader=new GLTFLoader();
      const url=new URL('../../assets/countach_80.glb',import.meta.url).href;
      const gltf=await loader.loadAsync(url);
      root=gltf.scene||gltf.scenes?.[0];
      if(!root)throw new Error('Countach GLB sans scène');

      root.name='countach_1989_real_glb_root';
      root.traverse(obj=>{
        if(obj?.isMesh||obj?.isSkinnedMesh){
          obj.castShadow=true;
          obj.receiveShadow=true;
          const materials=Array.isArray(obj.material)?obj.material:[obj.material];
          for(const mat of materials){
            if(!mat)continue;
            mat.dithering=true;
            const matName=String(mat.name||'').toLowerCase();
            // V21.24.7: the authored windshield was far too dark from the
            // driver's seat. Make the Countach glazing substantially more
            // transparent while preserving the GLB's own window geometry.
            if(matName.includes('windows')){
              mat.transparent=true;
              mat.opacity=.18;
              mat.depthWrite=false;
              mat.side=THREE.DoubleSide;
              if(mat.color)mat.color.setHex(0x2b3642);
            }else if(mat.transparent){
              // Other authored transparent materials (e.g. headlight glass)
              // keep their own look; only improve sorting consistency.
              mat.depthWrite=false;
            }
            mat.needsUpdate=true;
          }
        }
      });

      normalizeModel(root);
      host.add(root);
      bindAuthoredRearLights();
      setRearLights(false,false);

      // The Sketchfab source exposes wheel joints in its skin. Animate those
      // joints directly so the authored tires/rims are the visible wheels.
      leftFrontBone=root.getObjectByName('lFrontTire_05');
      rightFrontBone=root.getObjectByName('rFrontTire_08');
      rearTiresBone=root.getObjectByName('RearTires_07');
      steeringWheelBone=root.getObjectByName('Wheel_09');
      saveBindRotation(leftFrontBone);
      saveBindRotation(rightFrontBone);
      saveBindRotation(rearTiresBone);
      saveBindRotation(steeringWheelBone);

      ready=true;
      loadError=null;
      applyVisibility();
    }catch(error){
      loadError=error;
      ready=false;
      console.warn('Countach GLB unavailable; procedural Countach fallback kept.',error);
      applyVisibility();
    }
  }

  function setActive(value){
    requestedActive=!!value;if(requestedActive&&!ready&&!loadStarted)load();
    if(!requestedActive){
      wheelSpin=0;
      headYaw=0;
      headPitch=0;
      pendingMouseYaw=0;
      pendingMousePitch=0;
      setRearLights(false,false);
    }
    applyVisibility();
  }

  function update(dt,{speed=0,steerAngle=0,braking=false,reversing=false}={}){
    if(!requestedActive||!ready||vehicleSystem?.activeId!==vehicleId)return;
    // Reassert ownership in case the generic procedural visual system touched
    // visibility after a menu/profile refresh.
    applyVisibility();
    setRearLights(!!braking,!!reversing);

    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const tireRadius=.33;
    wheelSpin-=Number(speed||0)*safeDt/tireRadius;
    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;

    const steer=Number(steerAngle)||0;
    const animateFront=bone=>{
      if(!bone)return;
      const bind=bindEuler.get(bone)||{x:0,y:0,z:0};
      bone.rotation.order='YXZ';
      bone.rotation.x=bind.x+wheelSpin;
      bone.rotation.y=bind.y+steer;
      bone.rotation.z=bind.z;
    };
    animateFront(leftFrontBone);
    animateFront(rightFrontBone);

    if(rearTiresBone){
      const bind=bindEuler.get(rearTiresBone)||{x:0,y:0,z:0};
      rearTiresBone.rotation.order='YXZ';
      rearTiresBone.rotation.x=bind.x+wheelSpin;
      rearTiresBone.rotation.y=bind.y;
      rearTiresBone.rotation.z=bind.z;
    }

    if(steeringWheelBone){
      const bind=bindEuler.get(steeringWheelBone)||{x:0,y:0,z:0};
      const fullRoadWheelLock=Math.max(
        .10,
        Math.abs(Number(vehicleSystem?.active?.physics?.maxSteerLow)||.43)
      );
      const normalizedRack=clamp(steer/fullRoadWheelLock,-1,1);
      const steeringWheelAngle=normalizedRack*STEERING_WHEEL_HALF_RANGE_RAD;

      // V21.24.9: rotate around the *actual inclined steering-column axis*.
      // The previous Z-only Euler rotation made the wheel tumble/orbit because
      // the authored steering wheel plane is tilted relative to vehicle Z.
      const bindQ=bindQuaternion.get(steeringWheelBone);
      if(bindQ){
        steeringWheelDeltaQuaternion.setFromAxisAngle(
          steeringColumnAxis,
          -steeringWheelAngle
        );
        steeringWheelBone.quaternion
          .copy(bindQ)
          .multiply(steeringWheelDeltaQuaternion);
      }else{
        // Defensive fallback if the asset hierarchy ever changes.
        steeringWheelBone.rotation.order='YXZ';
        steeringWheelBone.rotation.x=bind.x;
        steeringWheelBone.rotation.y=bind.y;
        steeringWheelBone.rotation.z=bind.z;
      }
    }
  }

  function adjustCamera(camera,camTarget,dt,{modeLabel='',lookX=0,lookY=0}={}){
    const shouldUse=requestedActive&&ready&&vehicleSystem?.activeId===vehicleId&&isDriverCameraMode(modeLabel);

    if(!shouldUse){
      if(driverCameraActive&&camera&&savedCameraNear!==null){
        camera.near=savedCameraNear;
        camera.updateProjectionMatrix?.();
      }
      driverCameraActive=false;
      savedCameraNear=null;
      headYaw=0;
      headPitch=0;
      pendingMouseYaw=0;
      pendingMousePitch=0;
      return false;
    }

    if(!camera||!host)return false;
    if(!driverCameraActive){
      driverCameraActive=true;
      savedCameraNear=Number(camera.near)||.1;
      camera.near=Math.min(savedCameraNear,.035);
      camera.updateProjectionMatrix?.();
    }

    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const stickX=Math.abs(Number(lookX)||0)>.08?Number(lookX)||0:0;
    const stickY=Math.abs(Number(lookY)||0)>.08?Number(lookY)||0:0;

    // Head rotation is accumulated, not spring-centred: release the stick and
    // the driver keeps looking in that direction until they turn back.
    headYaw=clamp(
      headYaw+stickX*safeDt*1.65+pendingMouseYaw,
      -2.10,
      2.10
    );
    headPitch=clamp(
      headPitch-stickY*safeDt*1.05+pendingMousePitch,
      -.55,
      .58
    );
    pendingMouseYaw=0;
    pendingMousePitch=0;

    cameraWorldEye.copy(cameraEyeLocal);
    host.localToWorld(cameraWorldEye);

    const cp=Math.cos(headPitch);
    cameraLocalDirection.set(
      Math.sin(headYaw)*cp,
      Math.sin(headPitch),
      Math.cos(headYaw)*cp
    );

    host.getWorldQuaternion(cameraWorldQuaternion);
    cameraWorldDirection.copy(cameraLocalDirection).applyQuaternion(cameraWorldQuaternion).normalize();
    cameraWorldUp.set(0,1,0).applyQuaternion(cameraWorldQuaternion).normalize();

    camera.position.copy(cameraWorldEye);
    camera.up.copy(cameraWorldUp);
    if(camTarget){
      camTarget.copy(cameraWorldEye).addScaledVector(cameraWorldDirection,12);
      camera.lookAt(camTarget);
    }else{
      camera.lookAt(cameraWorldEye.clone().addScaledVector(cameraWorldDirection,12));
    }
    return true;
  }
  return {
    setActive,
    update,
    adjustCamera,
    addHeadLookDelta,
    isDriverCameraMode,
    get ready(){return ready;},
    get loadError(){return loadError;},
    get active(){return requestedActive&&ready;},
    host
  };
}
