// World Drive V21.24.18 — Volkswagen ID.4 detailed GLB with correctly anchored rear LEDs.
// Uses the newly supplied, higher-detail ID.4 model. The procedural physics
// and hidden suspension probes remain unchanged; this module only swaps the
// visual model and animates its authored lamps / wheels / rims.

export function createId4GlbSystem({
  THREE,
  bodyGroup,
  existingWheels,
  vehicleSystem
}){
  const vehicleId='id4';
  const host=new THREE.Group();
  host.name='id4-detailed-glb-host';
  host.visible=false;
  bodyGroup.add(host);

  const hiddenBodyState=new Map();
  const hiddenWheelState=new Map();

  let requestedActive=false;
  let swapped=false;
  let ready=false;
  let loadError=null;
  let root=null;

  const brakeLamps=[];
  const reverseLamps=[];
  const headlightMaterials=[];
  const wheelAnimators=[];
  let wheelSpin=0;

  const tmpVec=new THREE.Vector3();
  const tmpNormal=new THREE.Vector3();
  const tmpQuat=new THREE.Quaternion();
  const spinQuat=new THREE.Quaternion();
  const steerQuat=new THREE.Quaternion();
  const spinAxis=new THREE.Vector3(0,0,1); // model wheels use Z as axle axis
  const steerAxis=new THREE.Vector3(0,1,0);

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
    // V21.24.14: the detailed ID.4 GLB already resolves to +Z longitudinal
    // through its authored scene hierarchy. V21.24.13 added an unnecessary
    // extra +90° root yaw, which made the vehicle sit sideways on the road.
    // Keep the authored orientation intact.
    model.updateMatrixWorld(true);

    const initialBox=new THREE.Box3().setFromObject(model);
    const initialSize=new THREE.Vector3();
    initialBox.getSize(initialSize);

    // V21.28: user-requested visual-only +15% scale. Physics dimensions and
    // suspension/contact probes remain calibrated to the underlying profile.
    const targetLength=4.58*1.15;
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

  function materialWithEmission(base,name,color){
    const mat=base.clone();
    mat.name=name;
    mat.dithering=true;
    if('emissive' in mat&&mat.emissive)mat.emissive.setHex(color);
    if('emissiveIntensity' in mat)mat.emissiveIntensity=.01;
    if(mat.transparent)mat.depthWrite=false;
    mat.needsUpdate=true;
    return mat;
  }

  function registerMeshMaterials(obj,targetArray,color){
    const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    const replacements=materials.map((mat,idx)=>{
      const repl=materialWithEmission(mat,`${obj.name||'mesh'}-dynamic-${idx}`,color);
      targetArray.push(repl);
      return repl;
    });
    obj.material=Array.isArray(obj.material)?replacements:replacements[0];
  }

  function createLedStrip({x=0,y=0,z=0,dx=.8,dy=2,dz=10,color=0xff2028,name='id4-led'}={}){
    const group=new THREE.Group();
    group.name=name;
    group.position.set(x,y,z);

    const geometry=new THREE.BoxGeometry(dx*1.1,dy*1.18,dz*1.06);
    const material=new THREE.MeshStandardMaterial({
      color,
      emissive:color,
      emissiveIntensity:0.0,
      metalness:0.0,
      roughness:0.18,
      toneMapped:false
    });
    const core=new THREE.Mesh(geometry,material);
    core.castShadow=false;
    core.receiveShadow=false;
    group.add(core);

    const glowGeometry=new THREE.PlaneGeometry(Math.max(dz*1.65,dz+4),Math.max(dy*3.8,dy+5));
    const glowMaterial=new THREE.MeshBasicMaterial({
      color,
      transparent:true,
      opacity:0.0,
      blending:THREE.AdditiveBlending,
      depthWrite:false,
      side:THREE.DoubleSide,
      toneMapped:false
    });
    const glow=new THREE.Mesh(glowGeometry,glowMaterial);
    glow.rotation.y=Math.PI/2;
    glow.position.x=dx*.95;
    glow.renderOrder=10;
    group.add(glow);

    group.userData.coreMesh=core;
    group.userData.coreMaterial=material;
    group.userData.glowMaterial=glowMaterial;
    return group;
  }

  function createRearLedOverlays(sceneRoot){
    const authoredParent=sceneRoot.getObjectByName('group1')||sceneRoot;
    const group=new THREE.Group();
    group.name='id4-authored-style-rear-leds';
    const centerBrake=createLedStrip({x:228.9,y:117.6,z:0,dx:0.9,dy:1.8,dz:103,color:0xff2028,name:'id4-brake-center'});
    if(centerBrake.userData?.coreMesh)centerBrake.userData.coreMesh.visible=false;
    group.add(centerBrake);
    brakeLamps.push(centerBrake);

    function addSide(side){
      const s=side<0?-1:1;
      const top=createLedStrip({x:228.9,y:121.2,z:s*53.5,dx:0.9,dy:1.8,dz:17,color:0xff2028,name:`id4-brake-top-${side<0?'l':'r'}`});
      const outer=createLedStrip({x:228.9,y:112.8,z:s*60.4,dx:0.9,dy:16.5,dz:1.8,color:0xff2028,name:`id4-brake-outer-${side<0?'l':'r'}`});
      const lower=createLedStrip({x:228.9,y:104.4,z:s*53.0,dx:0.9,dy:1.8,dz:19,color:0xff2028,name:`id4-brake-lower-${side<0?'l':'r'}`});
      const innerBridge=createLedStrip({x:228.9,y:110.4,z:s*46.0,dx:0.9,dy:1.6,dz:7.5,color:0xff2028,name:`id4-brake-inner-${side<0?'l':'r'}`});
      for(const m of [top,outer,lower,innerBridge]){
        if(m.userData?.coreMesh)m.userData.coreMesh.visible=false;
        group.add(m);
        brakeLamps.push(m);
      }
      const revTop=createLedStrip({x:229.2,y:112.6,z:s*39.8,dx:0.9,dy:1.6,dz:8.5,color:0xffffff,name:`id4-reverse-top-${side<0?'l':'r'}`});
      const revBottom=createLedStrip({x:229.2,y:107.8,z:s*38.8,dx:0.9,dy:1.6,dz:7.0,color:0xffffff,name:`id4-reverse-bottom-${side<0?'l':'r'}`});
      for(const m of [revTop,revBottom]){ group.add(m); reverseLamps.push(m); }
    }

    addSide(-1);
    addSide(1);
    authoredParent.add(group);
  }

  function createMeshAnimator(mesh,specs){
    const geometry=mesh?.geometry;
    const position=geometry?.getAttribute?.('position');
    if(!geometry||!position||!specs?.length)return null;
    const normal=geometry.getAttribute?.('normal')||null;
    const bindPosition=new Float32Array(position.array);
    const bindNormal=normal?new Float32Array(normal.array):null;
    position.setUsage?.(THREE.DynamicDrawUsage);
    normal?.setUsage?.(THREE.DynamicDrawUsage);

    const groups=[];
    for(const spec of specs){
      const verts=[];
      let minX=Infinity,minY=Infinity,minZ=Infinity;
      let maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
      for(let i=0;i<position.count;i++){
        const o=i*3;
        const x=bindPosition[o];
        const y=bindPosition[o+1];
        const z=bindPosition[o+2];
        if(!spec.match(x,y,z))continue;
        verts.push(i);
        if(x<minX)minX=x;if(y<minY)minY=y;if(z<minZ)minZ=z;
        if(x>maxX)maxX=x;if(y>maxY)maxY=y;if(z>maxZ)maxZ=z;
      }
      if(!verts.length)continue;
      groups.push({
        front:!!spec.front,
        verts,
        center:new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2)
      });
    }
    if(!groups.length)return null;
    return {mesh,position,normal,bindPosition,bindNormal,groups};
  }

  function prepareWheelAnimation(sceneRoot){
    wheelAnimators.length=0;
    const named={};
    sceneRoot.traverse(obj=>{ if(obj?.isMesh||obj?.isSkinnedMesh)named[obj.name]=obj; });
    const tyreSideSpecs=[
      {front:true, match:(x,y,z)=>z<0},
      {front:true, match:(x,y,z)=>z>=0}
    ];
    const rearTyreSideSpecs=[
      {front:false, match:(x,y,z)=>z<0},
      {front:false, match:(x,y,z)=>z>=0}
    ];
    const hubQuadSpecs=[
      {front:true, match:(x,y,z)=>x<0&&z<0},
      {front:true, match:(x,y,z)=>x<0&&z>=0},
      {front:false, match:(x,y,z)=>x>=0&&z<0},
      {front:false, match:(x,y,z)=>x>=0&&z>=0}
    ];

    const animTargets=[
      [named['20_tire_map_c_tyre_0'], tyreSideSpecs],
      [named['20_tire_map_c_1_tyre_0'], rearTyreSideSpecs],
      [named['65_hub_black_metal_black_metal_0'], hubQuadSpecs],
      [named['65_hub_metal_chrome_0'], hubQuadSpecs],
      [named['22_brake_disc_map_c_disk_0'], tyreSideSpecs],
      [named['22_brake_disc_map_c_2_disk_0'], rearTyreSideSpecs]
    ];

    for(const [mesh,specs] of animTargets){
      if(!mesh)continue;
      const animator=createMeshAnimator(mesh,specs);
      if(animator)wheelAnimators.push(animator);
    }
  }

  function animateWheels(dt,speed,steerAngle){
    if(!wheelAnimators.length)return;
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const radius=.37*1.15;
    wheelSpin+=Number(speed||0)*safeDt/radius;
    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;
    spinQuat.setFromAxisAngle(spinAxis,wheelSpin);
    const steer=Number(steerAngle)||0;

    for(const anim of wheelAnimators){
      const {position,normal,bindPosition,bindNormal,groups}=anim;
      for(const group of groups){
        if(group.front){
          steerQuat.setFromAxisAngle(steerAxis,steer);
          tmpQuat.copy(steerQuat).multiply(spinQuat);
        }else tmpQuat.copy(spinQuat);
        const c=group.center;
        for(const vi of group.verts){
          const o=vi*3;
          tmpVec.set(
            bindPosition[o]-c.x,
            bindPosition[o+1]-c.y,
            bindPosition[o+2]-c.z
          ).applyQuaternion(tmpQuat).add(c);
          position.setXYZ(vi,tmpVec.x,tmpVec.y,tmpVec.z);
          if(normal&&bindNormal){
            tmpNormal.set(bindNormal[o],bindNormal[o+1],bindNormal[o+2]).applyQuaternion(tmpQuat);
            normal.setXYZ(vi,tmpNormal.x,tmpNormal.y,tmpNormal.z);
          }
        }
      }
      position.needsUpdate=true;
      if(normal)normal.needsUpdate=true;
    }
  }

  function setLampState({braking=false,reversing=false,nightLevel=0}={}){
    for(const lamp of brakeLamps){
      const coreMesh=lamp.userData?.coreMesh;
      const core=lamp.userData?.coreMaterial;
      const glow=lamp.userData?.glowMaterial;
      if(coreMesh)coreMesh.visible=false;
      if(core){
        core.emissive?.setHex(0xff2028);
        core.emissiveIntensity=0.0;
        core.opacity=0.0;
        core.transparent=true;
        core.needsUpdate=true;
      }
      if(glow){
        glow.color?.setHex(0xff4050);
        glow.opacity=braking?0.32:0.0;
        glow.needsUpdate=true;
      }
    }
    for(const lamp of reverseLamps){
      const core=lamp.userData?.coreMaterial;
      const glow=lamp.userData?.glowMaterial;
      if(core){
        core.emissive?.setHex(0xffffff);
        core.emissiveIntensity=reversing?6.0:0.0;
        core.needsUpdate=true;
      }
      if(glow){
        glow.color?.setHex(0xf8fbff);
        glow.opacity=reversing?.22:0.0;
        glow.needsUpdate=true;
      }
    }
    const headlightGlow=.01+clamp(Number(nightLevel)||0,0,1)*5.4;
    for(const mat of headlightMaterials){
      mat.emissive?.setHex(0xffffff);
      mat.emissiveIntensity=headlightGlow;
      mat.needsUpdate=true;
    }
  }

  async function load(){
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const loader=new GLTFLoader();
      const url=new URL('./assets/id4_2021_detailed.glb',import.meta.url).href;
      const gltf=await loader.loadAsync(url);
      root=gltf.scene||gltf.scenes?.[0];
      if(!root)throw new Error('ID.4 detailed GLB sans scène');

      root.name='volkswagen_id4_2021_detailed_root';
      root.traverse(obj=>{
        if(obj?.isMesh||obj?.isSkinnedMesh){
          obj.castShadow=true;
          obj.receiveShadow=true;
          const materials=Array.isArray(obj.material)?obj.material:[obj.material];
          for(const mat of materials){
            if(!mat)continue;
            mat.dithering=true;
            if(mat.transparent)mat.depthWrite=false;
          }
        }
      });

      normalizeModel(root);
      host.add(root);

      const byName={};
      root.traverse(obj=>{ if(obj?.isMesh||obj?.isSkinnedMesh)byName[obj.name]=obj; });
      createRearLedOverlays(root);
      for(const name of [
        '13_headlight_glass_glass_0',
        '16_headlight_white_plastic_white_P_0'
      ]){
        if(byName[name])registerMeshMaterials(byName[name],headlightMaterials,0xffffff);
      }

      prepareWheelAnimation(root);
      setLampState({});
      ready=true;
      loadError=null;
      applyVisibility();
    }catch(error){
      loadError=error;
      ready=false;
      console.warn('Detailed ID.4 GLB unavailable; procedural ID.4 fallback kept.',error);
      applyVisibility();
    }
  }

  function setActive(value){
    requestedActive=!!value;
    if(!requestedActive){
      wheelSpin=0;
      setLampState({});
    }
    applyVisibility();
  }

  function update(dt,{speed=0,steerAngle=0,braking=false,reversing=false,nightLevel=0}={}){
    if(!requestedActive||!ready||vehicleSystem?.activeId!==vehicleId)return;
    applyVisibility();
    animateWheels(dt,speed,steerAngle);
    setLampState({braking,reversing,nightLevel});
  }

  load();

  return {
    setActive,
    update,
    get ready(){return ready;},
    get loadError(){return loadError;},
    get active(){return requestedActive&&ready;},
    host
  };
}
