// World Drive V21.24.63 — Ferrari F1 GLB + corrected normalized rear warning lamp.
//
// Visual-only integration: the proven F1 physics/aero/steering profile remains
// owned by vehicle-system.js / vehicle-dynamics.js.  This module replaces only
// the procedural F1 body and visible wheel meshes when the authored GLB loads.

export function createF1GlbSystem({
  THREE,
  bodyGroup,
  existingWheels,
  vehicleSystem
}){
  const vehicleId='f1_2010';
  const host=new THREE.Group();
  host.name='f1-2010-ferrari-glb-host';
  host.visible=false;
  bodyGroup.add(host);

  const hiddenBodyState=new Map();
  const hiddenWheelState=new Map();

  let requestedActive=false;
  let swapped=false;
  let ready=false;
  let loadError=null;
  let root=null;
  let wheelSpin=0;
  let rearBlinkTimer=0;
  let rearLampMesh=null;

  const wheelControllers=[];
  const spinAxis=new THREE.Vector3(1,0,0);
  const steerAxis=new THREE.Vector3(0,1,0);
  const spinQuaternion=new THREE.Quaternion();
  const steerQuaternion=new THREE.Quaternion();

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
    // Supplied asset is already authored Y-up with +Z toward the nose.
    model.rotation.set(0,0,0);
    model.updateMatrixWorld(true);

    const initialBox=new THREE.Box3().setFromObject(model);
    const initialSize=new THREE.Vector3();
    initialBox.getSize(initialSize);

    // Keep the visual aligned with the existing 2010 F1 physical envelope.
    const targetLength=5.00;
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

  function findNamed(name){
    let found=null;
    root?.traverse(obj=>{
      if(found)return;
      if(String(obj?.name||'').toLowerCase()===name.toLowerCase())found=obj;
    });
    return found;
  }

  function localCenterOfObject(obj){
    root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(obj);
    const center=new THREE.Vector3();
    box.getCenter(center);
    return root.worldToLocal(center);
  }

  function hostCenterOfObject(obj){
    // The Ferrari source scene is authored at ~1/100 scale and root is
    // enlarged ~97x during normalization. Lamp overlays must therefore live
    // under the unscaled host, not under root, or a 10 cm square becomes
    // almost 10 m. Convert the authored lamp world centre into host-local
    // normalized vehicle coordinates instead.
    root.updateMatrixWorld(true);
    host.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(obj);
    const center=new THREE.Vector3();
    box.getCenter(center);
    return host.worldToLocal(center);
  }

  function prepareRearBrakeReverseLamp(){
    // The supplied Ferrari asset already contains a small rear lamp / LED
    // assembly. Reuse its exact authored location instead of inventing a new
    // position. A tiny square overlay makes the state unmistakable while
    // preserving the model's own lamp housing underneath.
    const authoredLamp=
      findNamed('REARLEDs_011_001_RearLight_0')||
      findNamed('light_rear_light_4_0')||
      findNamed('REARLEDs_011_001')||
      findNamed('light');

    const center=authoredLamp
      ?hostCenterOfObject(authoredLamp)
      :new THREE.Vector3(0,.08,-2.27);

    const material=new THREE.MeshBasicMaterial({
      color:0xff1018,
      transparent:true,
      opacity:1,
      side:THREE.FrontSide,
      depthWrite:false,
      depthTest:true,
      toneMapped:false
    });
    // IMPORTANT: this mesh lives under `host`, whose local units are normalized
    // World Drive metres. 0.10 therefore really is a 10 cm square.
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.10,.10),material);
    mesh.name='f1-rear-brake-reverse-light';
    mesh.position.copy(center);
    mesh.position.z-=.012;
    mesh.rotation.y=Math.PI;
    mesh.renderOrder=8;
    mesh.visible=false;
    host.add(mesh);
    rearLampMesh=mesh;
  }

  function updateRearBrakeReverseLamp(dt,{braking=false,reversing=false}={}){
    if(!rearLampMesh)return;
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    if(reversing){
      rearBlinkTimer+=safeDt;
      if(rearBlinkTimer>120)rearBlinkTimer%=.90;
      // Reverse warning: clear, deliberately slow red flash.
      rearLampMesh.visible=(rearBlinkTimer%.90)<.45;
    }else{
      rearBlinkTimer=0;
      // Brake light: steady red while braking.
      rearLampMesh.visible=!!braking;
    }
  }

  function makeWheelController({corner,wheelNodeName,front=false,side=0,centerOverride=null,flattenRigid=false}){
    const wheelRoot=findNamed(wheelNodeName);
    if(!wheelRoot||!wheelRoot.parent)return null;

    const center=centerOverride?.isVector3
      ?centerOverride.clone()
      :localCenterOfObject(wheelRoot);

    const steerPivot=new THREE.Group();
    steerPivot.name=`f1-${corner}-steer-pivot`;
    steerPivot.position.copy(center);
    root.add(steerPivot);

    const spinPivot=new THREE.Group();
    spinPivot.name=`f1-${corner}-spin-pivot`;
    steerPivot.add(spinPivot);

    if(flattenRigid){
      // V21.24.60: the LF hierarchy has an authored origin/transform quirk that
      // survives normal Object3D.attach() reparenting.  Bake every visible tire
      // and rim mesh directly into root-local coordinates, then rebase all of
      // them around ONE measured tire centre.  Only this clean rigid assembly
      // is animated, so no child origin can make the wheel orbit/eccentric.
      root.updateMatrixWorld(true);
      const rootWorldInv=new THREE.Matrix4().copy(root.matrixWorld).invert();
      const localMatrix=new THREE.Matrix4();
      const bakedMeshes=[];
      wheelRoot.traverse(obj=>{
        if(!obj?.isMesh||!obj.geometry)return;
        localMatrix.multiplyMatrices(rootWorldInv,obj.matrixWorld);
        const geometry=obj.geometry.clone();
        geometry.applyMatrix4(localMatrix);
        geometry.translate(-center.x,-center.y,-center.z);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const mesh=new THREE.Mesh(geometry,obj.material);
        mesh.name=`${obj.name||corner}-rigid-baked`;
        mesh.castShadow=obj.castShadow!==false;
        mesh.receiveShadow=obj.receiveShadow!==false;
        spinPivot.add(mesh);
        bakedMeshes.push(mesh);
      });
      wheelRoot.visible=false;
      if(!bakedMeshes.length){
        // Safety fallback if an unexpected asset revision removes mesh children.
        wheelRoot.visible=true;
        root.updateMatrixWorld(true);
        steerPivot.updateMatrixWorld(true);
        spinPivot.attach(wheelRoot);
      }
    }else{
      // Other wheels keep the already validated authored hierarchy.
      root.updateMatrixWorld(true);
      steerPivot.updateMatrixWorld(true);
      spinPivot.attach(wheelRoot);
    }

    // The brake disc is a separate authored hierarchy; spin it with the wheel.
    const disc=findNamed(`disc_${corner}`);
    if(disc?.parent){
      root.updateMatrixWorld(true);
      spinPivot.updateMatrixWorld(true);
      spinPivot.attach(disc);
    }

    // The caliper stays fixed relative to the upright. Front calipers steer,
    // but deliberately do not spin with the tire/disc.
    const caliper=findNamed(`hub_caliper_${corner}`);
    if(caliper?.parent){
      root.updateMatrixWorld(true);
      steerPivot.updateMatrixWorld(true);
      steerPivot.attach(caliper);
    }

    return {corner,front,side,steerPivot,spinPivot,center};
  }

  function prepareWheelAnimation(){
    wheelControllers.length=0;

    // V21.24.61 — important source-coordinate quirk:
    // With World Drive using +Z as forward, the GLB node labelled WHEEL_RF is
    // physically on the visual LEFT side of the car (negative X), while
    // WHEEL_LF is on the visual RIGHT side (positive X). Previous fixes were
    // therefore applied to the wrong visible wheel.
    //
    // Flatten BOTH authored front wheel hierarchies into rigid assemblies and
    // rotate each around the exact centre of its own tire. This removes any
    // exporter-origin eccentricity regardless of the source's LF/RF labels.
    const sourceLfTire=findNamed('x0_tyre_fl')||findNamed('WHEEL_LF');
    const sourceRfTire=findNamed('x0_tyre_fr')||findNamed('WHEEL_RF');
    const sourceLfCenter=sourceLfTire?localCenterOfObject(sourceLfTire):null;
    const sourceRfCenter=sourceRfTire?localCenterOfObject(sourceRfTire):null;

    const specs=[
      {corner:'fl',wheelNodeName:'WHEEL_LF',front:true,side:1,centerOverride:sourceLfCenter,flattenRigid:true},
      {corner:'fr',wheelNodeName:'WHEEL_RF',front:true,side:-1,centerOverride:sourceRfCenter,flattenRigid:true},
      {corner:'bl',wheelNodeName:'WHEEL_LR',front:false,side:1},
      {corner:'br',wheelNodeName:'WHEEL_RR',front:false,side:-1}
    ];
    for(const spec of specs){
      const controller=makeWheelController(spec);
      if(controller)wheelControllers.push(controller);
    }
  }

  function animateWheels(dt,speed,steerAngle){
    if(!wheelControllers.length)return;
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const wheelRadius=.33;

    // +Z is forward; positive rotation around the authored +X axle gives the
    // same rolling convention used by the other high-detail World Drive cars.
    wheelSpin+=Number(speed||0)*safeDt/wheelRadius;
    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;

    spinQuaternion.setFromAxisAngle(spinAxis,wheelSpin);
    steerQuaternion.setFromAxisAngle(steerAxis,Number(steerAngle)||0);

    for(const wheel of wheelControllers){
      wheel.spinPivot.quaternion.copy(spinQuaternion);
      if(wheel.front)wheel.steerPivot.quaternion.copy(steerQuaternion);
      else wheel.steerPivot.quaternion.identity();
    }
  }

  async function load(){
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const loader=new GLTFLoader();
      const url=new URL('./assets/f1_2010_ferrari.glb',import.meta.url).href;
      const gltf=await loader.loadAsync(url);
      root=gltf.scene||gltf.scenes?.[0];
      if(!root)throw new Error('F1 Ferrari GLB sans scène');

      root.name='f1_2010_ferrari_root';
      root.traverse(obj=>{
        if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
        obj.castShadow=true;
        obj.receiveShadow=true;
        const materials=Array.isArray(obj.material)?obj.material:[obj.material];
        for(const mat of materials){
          if(!mat)continue;
          mat.dithering=true;
          if(mat.transparent)mat.depthWrite=false;
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.15,Number(mat.envMapIntensity)||1.15);
          mat.needsUpdate=true;
        }
      });

      normalizeModel(root);
      host.add(root);
      prepareWheelAnimation();
      prepareRearBrakeReverseLamp();

      ready=true;
      loadError=null;
      applyVisibility();
    }catch(error){
      loadError=error;
      ready=false;
      console.warn('Detailed 2010 Ferrari F1 GLB unavailable; procedural F1 fallback kept.',error);
      applyVisibility();
    }
  }

  function setActive(value){
    requestedActive=!!value;
    if(!requestedActive){
      wheelSpin=0;
      rearBlinkTimer=0;
      if(rearLampMesh)rearLampMesh.visible=false;
    }
    applyVisibility();
  }

  function update(dt,{speed=0,steerAngle=0,braking=false,reversing=false}={}){
    if(!requestedActive||!ready||vehicleSystem?.activeId!==vehicleId)return;
    applyVisibility();
    animateWheels(dt,speed,steerAngle);
    updateRearBrakeReverseLamp(dt,{braking,reversing});
  }

  load();

  return {
    setActive,
    update,
    get ready(){return ready;},
    get loadError(){return loadError;},
    get active(){return requestedActive&&ready;},
    get wheelControllerCount(){return wheelControllers.length;},
    host
  };
}
