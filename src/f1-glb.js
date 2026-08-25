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
  let loadStarted=false;
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
    model.rotation.set(0,0,0);
    model.updateMatrixWorld(true);
    const initialBox=new THREE.Box3().setFromObject(model);
    const initialSize=new THREE.Vector3();
    initialBox.getSize(initialSize);
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
    root.updateMatrixWorld(true);
    host.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(obj);
    const center=new THREE.Vector3();
    box.getCenter(center);
    return host.worldToLocal(center);
  }

  function prepareRearBrakeReverseLamp(){
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
      rearLampMesh.visible=(rearBlinkTimer%.90)<.45;
    }else{
      rearBlinkTimer=0;
      rearLampMesh.visible=!!braking;
    }
  }

  function matrixIsFinite(matrix){
    return !!matrix?.elements?.every(Number.isFinite);
  }

  function geometryPositionsAreFinite(geometry){
    const position=geometry?.getAttribute?.('position');
    if(!position)return false;
    const a=position.array;
    for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i]))return false;
    return true;
  }

  function vectorIsFinite(v){
    return !!v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
  }

  function makeWheelController({corner,wheelNodeName,front=false,side=0,centerOverride=null,flattenRigid=false}){
    const wheelRoot=findNamed(wheelNodeName);
    if(!wheelRoot||!wheelRoot.parent)return null;

    const measuredCenter=centerOverride?.isVector3
      ?centerOverride.clone()
      :localCenterOfObject(wheelRoot);
    const center=vectorIsFinite(measuredCenter)?measuredCenter:new THREE.Vector3();

    const steerPivot=new THREE.Group();
    steerPivot.name=`f1-${corner}-steer-pivot`;
    steerPivot.position.copy(center);
    root.add(steerPivot);

    const spinPivot=new THREE.Group();
    spinPivot.name=`f1-${corner}-spin-pivot`;
    steerPivot.add(spinPivot);

    if(flattenRigid){
      root.updateMatrixWorld(true);
      const rootWorldInv=new THREE.Matrix4().copy(root.matrixWorld).invert();
      const localMatrix=new THREE.Matrix4();
      const bakedMeshes=[];
      wheelRoot.traverse(obj=>{
        if(!obj?.isMesh||!obj.geometry)return;
        localMatrix.multiplyMatrices(rootWorldInv,obj.matrixWorld);
        if(!matrixIsFinite(localMatrix)){
          console.warn('F1 wheel bake skipped non-finite transform',corner,obj.name);
          return;
        }
        const geometry=obj.geometry.clone();
        geometry.applyMatrix4(localMatrix);
        geometry.translate(-center.x,-center.y,-center.z);
        if(!geometryPositionsAreFinite(geometry)){
          console.warn('F1 wheel bake skipped non-finite geometry',corner,obj.name);
          geometry.dispose?.();
          return;
        }
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
        wheelRoot.visible=true;
        root.updateMatrixWorld(true);
        steerPivot.updateMatrixWorld(true);
        spinPivot.attach(wheelRoot);
      }
    }else{
      root.updateMatrixWorld(true);
      steerPivot.updateMatrixWorld(true);
      spinPivot.attach(wheelRoot);
    }

    const disc=findNamed(`disc_${corner}`);
    if(disc?.parent){
      root.updateMatrixWorld(true);
      spinPivot.updateMatrixWorld(true);
      spinPivot.attach(disc);
    }

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
    if(loadStarted)return;
    loadStarted=true;
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
    requestedActive=!!value;if(requestedActive&&!ready&&!loadStarted)load();
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
