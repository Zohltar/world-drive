// World Drive V21.24.82 — Hyundai Sonata 2006 sanitized authored wheel binding fix.
// Replaces only the procedural Sonata presentation. Existing vehicle physics,
// steering, suspension and audio calibration remain owned by the core systems.

export function createSonataGlbSystem({
  THREE,
  bodyGroup,
  existingWheels,
  vehicleSystem
}){
  const vehicleId='sonata';
  const host=new THREE.Group();
  host.name='hyundai-sonata-2006-glb-host';
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

  const wheelControllers=[];
  const headlightMaterials=[];
  const tailRunningMaterials=[];
  const brakeMaterials=[];
  const reverseMaterials=[];
  const headlightBeams=[];
  const authoredRearGlowLayers=[];
  const authoredFrontGlowLayers=[];

  const signalState={left:false,right:false,blinkTimer:0,peakSteer:.35};

  const spinAxis=new THREE.Vector3(1,0,0);
  const steerAxis=new THREE.Vector3(0,1,0);
  const spinQuat=new THREE.Quaternion();
  const steerQuat=new THREE.Quaternion();
  const combinedQuat=new THREE.Quaternion();

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
    // Source convention verified from the authored boot/wheel positions:
    // +Z = front, +Y = up, +X = lateral. No heading correction required.
    model.rotation.y=0;
    model.updateMatrixWorld(true);

    const initialBox=new THREE.Box3().setFromObject(model);
    const initialSize=new THREE.Vector3();
    initialBox.getSize(initialSize);
    const targetLength=4.85;
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

  function buildSemanticPath(obj){
    const names=[];
    let cursor=obj;
    while(cursor&&cursor!==root?.parent){
      if(cursor.name)names.push(String(cursor.name).toLowerCase());
      cursor=cursor.parent;
    }
    return names.join(' ');
  }

  function tuneMaterials(sceneRoot){
    const tuned=new WeakSet();
    sceneRoot.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      obj.castShadow=true;
      obj.receiveShadow=true;
      const semantic=buildSemanticPath(obj);
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const mat of materials){
        if(!mat||tuned.has(mat))continue;
        tuned.add(mat);

        const name=`${String(mat.name||'').toLowerCase()} ${semantic}`;
        mat.dithering=true;
        if(mat.transparent)mat.depthWrite=false;

        // V21.24.65: the Sonata comes in very dark at noon. Similar to the
        // WRX/Civic fixes, add a modest texture-preserving emissive daylight
        // fill so the GLB reads correctly without changing global exposure.
        if(name.includes('glass')||name.includes('window')||name.includes('windshield')){
          if(mat.color)mat.color.multiplyScalar(1.10);
          if(!mat.emissive)mat.emissive=new THREE.Color(0x101418);
          else mat.emissive.setHex(0x101418);
          mat.emissiveIntensity=.08;
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.45,Number(mat.envMapIntensity)||1.45);
          if('opacity' in mat&&mat.opacity<1)mat.opacity=Math.min(1,mat.opacity*1.08);
          mat.transparent=mat.opacity<.999;
        }else if(name.includes('wheel')||name.includes('tire')||name.includes('rim')||name.includes('disk')||name.includes('caliper')){
          if(mat.color)mat.color.multiplyScalar(1.10);
          if(mat.map)mat.emissiveMap=mat.map;
          if(!mat.emissive)mat.emissive=new THREE.Color(0x2b3138);
          else mat.emissive.setHex(0x2b3138);
          mat.emissiveIntensity=.10;
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.55,Number(mat.envMapIntensity)||1.55);
        }else if(name.includes('interior')||name.includes('seat')||name.includes('dashboard')||name.includes('steer')){
          if(mat.color)mat.color.multiplyScalar(1.08);
          if(mat.map)mat.emissiveMap=mat.map;
          if(!mat.emissive)mat.emissive=new THREE.Color(0x1a1d20);
          else mat.emissive.setHex(0x1a1d20);
          mat.emissiveIntensity=.09;
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.20,Number(mat.envMapIntensity)||1.20);
        }else{
          if(mat.color)mat.color.multiplyScalar(1.08);
          if(mat.map)mat.emissiveMap=mat.map;
          if(!mat.emissive)mat.emissive=new THREE.Color(0xf1ece2);
          else mat.emissive.setHex(0xf1ece2);
          mat.emissiveIntensity=.20;
          if('roughness' in mat)mat.roughness=Math.max(.18,Math.min(.52,Number(mat.roughness)||.34));
          if('metalness' in mat)mat.metalness=Math.max(.08,Number(mat.metalness)||.08);
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.75,Number(mat.envMapIntensity)||1.75);
        }

        mat.needsUpdate=true;
      }
    });
  }

  function installDarkGlassMeshes(){
    // These are the five actual glazing meshes in the authored Sonata GLB.
    // Replace their authored transmissive materials outright so hidden GLB
    // transmission/alpha settings cannot cancel the requested tint.
    const glassMeshNames=['Object_97','Object_94','Object_84','Object_72','Object_62'];
    for(const meshName of glassMeshNames){
      const mesh=root?.getObjectByName(meshName);
      if(!mesh?.isMesh)continue;
      const darkGlass=new THREE.MeshStandardMaterial({
        name:`${meshName}_dark_glass_80`,
        color:0x020608,
        transparent:true,
        opacity:.80,
        roughness:.18,
        metalness:.05,
        depthWrite:false,
        depthTest:true,
        side:THREE.DoubleSide,
        toneMapped:true
      });
      darkGlass.envMapIntensity=1.0;
      mesh.material=darkGlass;
      mesh.renderOrder=Math.max(4,Number(mesh.renderOrder)||0);
      mesh.castShadow=false;
      mesh.receiveShadow=true;
    }
  }

  function canonicalNodeName(name){
    // GLTFLoader sanitizes punctuation (notably dots) in authored node names.
    // Compare names without punctuation so Blender's `wheel.029_56` still
    // resolves if Three.js exposes it as `wheel029_56`, `wheel_029_56`, etc.
    return String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  }

  function findNodeByAuthoredName(authoredName){
    if(!root)return null;
    const wanted=canonicalNodeName(authoredName);
    let found=null;
    root.traverse(obj=>{
      if(found)return;
      if(canonicalNodeName(obj?.name)===wanted)found=obj;
    });
    return found;
  }

  function bindAuthoredWheels(){
    wheelControllers.length=0;
    const specs=[
      {spinName:'wheel.029_56',steerName:'wheel_rf_dummy.015_57',front:false,side: 1,spinSign:-1}, // right rear
      {spinName:'wheel.031_62',steerName:'wheel_rf_dummy.016_63',front:true, side: 1,spinSign:-1}, // right front
      {spinName:'wheel.035_68',steerName:'wheel_rf_dummy.017_69',front:false,side:-1,spinSign: 1}, // left rear
      {spinName:'wheel.039_74',steerName:'wheel_rf_dummy.018_75',front:true, side:-1,spinSign: 1}  // left front
    ];

    const box=new THREE.Box3();
    const centerWorld=new THREE.Vector3();
    const centerLocal=new THREE.Vector3();

    for(const spec of specs){
      const spinNode=findNodeByAuthoredName(spec.spinName);
      const steerNode=findNodeByAuthoredName(spec.steerName);
      if(!spinNode||!steerNode){
        console.warn('Sonata wheel binding missing',spec.spinName,spec.steerName);
        continue;
      }

      // The authored wheel root is not centred on the hub: its geometry is
      // modelled at an offset in local space. Rotating that node directly makes
      // the wheel orbit like a paddle. Build a dedicated pivot at the actual
      // world-space centre of the visible wheel geometry, then reparent the
      // authored wheel root under it while preserving its world transform.
      spinNode.updateWorldMatrix(true,true);
      box.setFromObject(spinNode);
      box.getCenter(centerWorld);

      const parent=spinNode.parent;
      if(!parent){
        console.warn('Sonata wheel has no parent',spec.spinName);
        continue;
      }
      parent.updateWorldMatrix(true,false);
      centerLocal.copy(centerWorld);
      parent.worldToLocal(centerLocal);

      const spinPivot=new THREE.Object3D();
      spinPivot.name=`sonata_spin_pivot_${spec.spinName}`;
      spinPivot.position.copy(centerLocal);
      // Match the authored wheel root orientation so local X remains the axle.
      spinPivot.quaternion.copy(spinNode.quaternion);
      spinPivot.matrixAutoUpdate=true;
      parent.add(spinPivot);
      spinPivot.updateWorldMatrix(true,false);
      spinPivot.attach(spinNode);

      // The authored steering dummy is also offset from the wheel hub. Rotating
      // it directly makes the front wheel orbit out of its socket. For front
      // wheels, add a second hub-centred pivot one level above that dummy. The
      // outer centred pivot handles steering; the inner centred pivot handles
      // rolling. Both motions therefore share the exact same physical centre.
      let steerPivot=null;
      let steerBindQuaternion=null;
      if(spec.front){
        const steerParent=steerNode.parent;
        if(!steerParent){
          console.warn('Sonata front steering dummy has no parent',spec.steerName);
          continue;
        }
        steerParent.updateWorldMatrix(true,false);
        const steerCenterLocal=centerWorld.clone();
        steerParent.worldToLocal(steerCenterLocal);

        steerPivot=new THREE.Object3D();
        steerPivot.name=`sonata_steer_pivot_${spec.steerName}`;
        steerPivot.position.copy(steerCenterLocal);
        // Preserve the authored steering basis so local Y remains the same
        // steering axis as before, only translated to the hub centre.
        steerPivot.quaternion.copy(steerNode.quaternion);
        steerPivot.matrixAutoUpdate=true;
        steerParent.add(steerPivot);
        steerPivot.updateWorldMatrix(true,false);
        steerPivot.attach(steerNode);
        steerBindQuaternion=steerPivot.quaternion.clone();
      }

      steerNode.matrixAutoUpdate=true;

      wheelControllers.push({
        ...spec,
        spinNode,
        spinPivot,
        steerNode,
        steerPivot,
        spinBindQuaternion:spinPivot.quaternion.clone(),
        steerBindQuaternion
      });
    }
    console.info(`Sonata authored wheel controllers: ${wheelControllers.length}/4 centered roll + front steer pivots`);
  }

  function animateWheels(dt,speed,steerAngle){
    if(!wheelControllers.length)return;
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const radius=.35;
    wheelSpin+=Number(speed||0)*safeDt/radius;
    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;

    for(const wheel of wheelControllers){
      // Roll around the dedicated hub-centred pivot. The pivot inherited the
      // authored wheel orientation, so its local X is the axle but its origin is
      // now the true geometric centre of the wheel.
      spinQuat.setFromAxisAngle(spinAxis,wheelSpin*wheel.spinSign);
      combinedQuat.copy(wheel.spinBindQuaternion).multiply(spinQuat);
      wheel.spinPivot.quaternion.copy(combinedQuat);
      wheel.spinPivot.updateMatrix();

      // Front steering rotates the dedicated hub-centred outer pivot. Do not
      // rotate the authored dummy itself: its origin is offset from the hub and
      // would make the wheel leave its socket.
      if(wheel.front&&wheel.steerPivot&&wheel.steerBindQuaternion){
        steerQuat.setFromAxisAngle(steerAxis,Number(steerAngle)||0);
        combinedQuat.copy(wheel.steerBindQuaternion).multiply(steerQuat);
        wheel.steerPivot.quaternion.copy(combinedQuat);
        wheel.steerPivot.updateMatrix();
      }
    }
  }

  function makeLensGlowMaterial({sourceMaterial,filterMode=0,sideMode=0,tint=0xffffff,whiteWarmth=0.0}){
    const uniforms={
      uMap:{value:sourceMaterial?.map||null},
      uOpacity:{value:0},
      uTint:{value:new THREE.Color(tint)},
      uFilterMode:{value:filterMode},
      uSideMode:{value:sideMode},
      uWhiteWarmth:{value:whiteWarmth}
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
      vertexColors:true,
      vertexShader:`
        varying vec2 vUv;
        varying vec3 vColor;
        varying vec3 vLocalPos;
        void main(){
          vUv=uv;
          vColor=color.rgb;
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
        varying vec3 vColor;
        varying vec3 vLocalPos;

        void main(){
          vec3 rawTex=texture2D(uMap,vUv).rgb;
          vec3 tex=rawTex;
          float lum=dot(tex,vec3(0.2126,0.7152,0.0722));
          float maxc=max(tex.r,max(tex.g,tex.b));
          float minc=min(tex.r,min(tex.g,tex.b));
          float colorSpread=maxc-minc;

          // Brake/running red must be much stricter than the amber/white masks.
          // The Sonata atlas contains orange indicator pixels and dark neutral
          // pixels inside the lower clear lens that the older broad red mask
          // could misclassify. Require a genuinely red-dominant source texel.
          float redRatioG=tex.g / max(tex.r,0.001);
          float redRatioB=tex.b / max(tex.r,0.001);
          float redDominance=tex.r-max(tex.g,tex.b);
          float redMask=smoothstep(0.30,0.44,tex.r)
            * (1.0-smoothstep(0.24,0.32,redRatioG))
            * (1.0-smoothstep(0.27,0.36,redRatioB))
            * smoothstep(0.14,0.24,redDominance);

          float amberRatioG=tex.g / max(tex.r,0.001);
          float amberRatioB=tex.b / max(tex.r,0.001);
          float amberMaskA=smoothstep(0.34,0.52,tex.r) * smoothstep(0.10,0.22,tex.g) * (1.0-smoothstep(0.85,1.06,amberRatioG)) * (1.0-smoothstep(0.38,0.62,amberRatioB));
          float amberMaskB=smoothstep(0.42,0.60,tex.r) * smoothstep(0.18,0.34,tex.g) * (1.0-smoothstep(0.78,1.00,amberRatioG)) * (1.0-smoothstep(0.26,0.46,tex.b / max(tex.g,0.001)));
          float amberMask=max(amberMaskA, amberMaskB);

          float whiteMask=smoothstep(0.28,0.48,lum) * (1.0-smoothstep(0.28,0.50,colorSpread));

          float filterMask=redMask;
          if(uFilterMode>0.5 && uFilterMode<1.5) filterMask=amberMask;
          else if(uFilterMode>=1.5) filterMask=whiteMask;

          float sideMask=1.0;
          if(uSideMode<-0.5){
            sideMask=1.0-smoothstep(-0.08,0.18,vLocalPos.x);
          }else if(uSideMode>0.5){
            sideMask=smoothstep(-0.18,0.08,vLocalPos.x);
          }

          float uvMask=1.0;
          if(uUseUvRegion>0.5){
            float uEnter=smoothstep(uUvMin.x-uUvFeather.x,uUvMin.x+uUvFeather.x,vUv.x);
            float uExit=1.0-smoothstep(uUvMax.x-uUvFeather.x,uUvMax.x+uUvFeather.x,vUv.x);
            float vEnter=smoothstep(uUvMin.y-uUvFeather.y,uUvMin.y+uUvFeather.y,vUv.y);
            float vExit=1.0-smoothstep(uUvMax.y-uUvFeather.y,uUvMax.y+uUvFeather.y,vUv.y);
            uvMask=uEnter*uExit*vEnter*vExit;
          }

          float alpha=uOpacity*filterMask*sideMask*uvMask;
          if(alpha<0.01) discard;
          vec3 tint=uTint;
          if(uFilterMode>=1.5) tint=mix(tint, vec3(1.0, 0.96, 0.90), uWhiteWarmth);
          vec3 litColor=mix(rawTex, tint, clamp(uTintMix,0.0,1.0));
          gl_FragColor=vec4(litColor*filterMask, alpha);
        }
      `
    });
  }

  function registerGlowLayer({targetArray,sourceMesh,filter='red',side=0,tint=0xffffff,whiteWarmth=0.0,uvRegion=null,tintMix=1.0}){
    if(!sourceMesh?.isMesh||!sourceMesh.material?.map)return;
    const filterMode=filter==='red' ? 0 : (filter==='amber' ? 1 : 2);
    const material=makeLensGlowMaterial({sourceMaterial:sourceMesh.material,filterMode,sideMode:side,tint,whiteWarmth,uvRegion,tintMix});
    const mesh=new THREE.Mesh(sourceMesh.geometry,material);
    mesh.name=`${sourceMesh.name||'lamp'}-${filter}-${side}`;
    mesh.position.copy(sourceMesh.position);
    mesh.quaternion.copy(sourceMesh.quaternion);
    mesh.scale.copy(sourceMesh.scale);
    mesh.renderOrder=(sourceMesh.renderOrder||0)+2;
    mesh.visible=false;
    mesh.frustumCulled=sourceMesh.frustumCulled;
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    sourceMesh.parent?.add(mesh);
    targetArray.push({mesh,material,filter,side});
  }

  function buildAuthoredRearLighting(){
    if(!root)return;
    authoredRearGlowLayers.length=0;
    const rearInnerLens=root.getObjectByName('Object_46');
    const rearOuterLens=root.getObjectByName('Object_33');
    if(rearInnerLens?.isMesh){
      registerGlowLayer({targetArray:authoredRearGlowLayers,sourceMesh:rearInnerLens,filter:'red',side:0,tint:0xff2a2e,tintMix:0.42,uvRegion:{min:[0.04,0.842],max:[0.54,1.00],feather:[0.004,0.004]}});
      registerGlowLayer({targetArray:authoredRearGlowLayers,sourceMesh:rearInnerLens,filter:'white',side:0,tint:0xf8fbff,whiteWarmth:0.15,tintMix:0.78});
    }
    // V21.24.66 had the best overall rear-light look, while V21.24.69 fixed the
    // actual rear indicator mesh and signal-state logic. Merge both here: keep
    // Object_33 as the real amber indicator owner, but also restore a red glow
    // only over its authored upper red zone so it cannot wash out the lower
    // reverse or amber bands.
    if(rearOuterLens?.isMesh){
      registerGlowLayer({
        targetArray:authoredRearGlowLayers,
        sourceMesh:rearOuterLens,
        filter:'red',
        side:0,
        tint:0xff2a2e,
        tintMix:0.42,
        uvRegion:{min:[0.44,0.842],max:[0.96,1.00],feather:[0.004,0.004]}
      });
      registerGlowLayer({targetArray:authoredRearGlowLayers,sourceMesh:rearOuterLens,filter:'amber',side:-1,tint:0xffb21c,tintMix:0.88});
      registerGlowLayer({targetArray:authoredRearGlowLayers,sourceMesh:rearOuterLens,filter:'amber',side:1,tint:0xffb21c,tintMix:0.88});
    }
  }

  function buildAuthoredFrontLighting(){
    if(!root)return;
    authoredFrontGlowLayers.length=0;
    const frontLens=root.getObjectByName('Object_7');
    if(!frontLens?.isMesh)return;
    registerGlowLayer({targetArray:authoredFrontGlowLayers,sourceMesh:frontLens,filter:'white',side:0,tint:0xf8fbff,whiteWarmth:0.05,tintMix:0.82});
    registerGlowLayer({targetArray:authoredFrontGlowLayers,sourceMesh:frontLens,filter:'amber',side:-1,tint:0xffb21c,tintMix:0.88});
    registerGlowLayer({targetArray:authoredFrontGlowLayers,sourceMesh:frontLens,filter:'amber',side:1,tint:0xffb21c,tintMix:0.88});
  }

  function updateTurnSignalState(dt,steerAngle,speed=0){
    const steerValue=Number(steerAngle)||0;
    const absSteer=Math.abs(steerValue);
    const maxSteerLow=Math.max(.30,Number(vehicleSystem?.active?.physics?.maxSteerLow)||.43);
    const activationThreshold=maxSteerLow*.74;
    const neutralThreshold=maxSteerLow*.10;
    const stopped=Math.abs(Number(speed)||0)<.35;

    if(absSteer<=neutralThreshold){
      signalState.left=false;
      signalState.right=false;
      signalState.blinkTimer=0;
      return false;
    }

    if(!signalState.left&&!signalState.right&&stopped&&absSteer>=activationThreshold){
      signalState.left=steerValue<0;
      signalState.right=steerValue>0;
      signalState.blinkTimer=0;
    }

    if(signalState.left||signalState.right){
      signalState.blinkTimer=(Number(signalState.blinkTimer)||0)+Math.max(.001,Math.min(.05,Number(dt)||.016));
    }
    return (signalState.left||signalState.right) && ((signalState.blinkTimer%1.05)<0.58);
  }

  function setGlow(layers,filter,side,opacity){
    const visible=opacity>0;
    for(const layer of layers){
      if(layer.filter!==filter)continue;
      if(side!==undefined && layer.side!==side)continue;
      layer.material.uniforms.uOpacity.value=visible?clamp(opacity,0,1):0;
      layer.material.needsUpdate=true;
      layer.mesh.visible=visible;
    }
  }

  function addLamp({size=[.26,.12],position=[0,0,0],rotationY=0,color=0xffffff,target}){
    const material=new THREE.MeshBasicMaterial({
      color,
      transparent:true,
      opacity:0,
      depthWrite:false,
      depthTest:true,
      toneMapped:false,
      side:THREE.DoubleSide
    });
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size[0],size[1]),material);
    mesh.position.set(...position);
    mesh.rotation.y=rotationY;
    mesh.renderOrder=5;
    mesh.visible=false;
    host.add(mesh);
    material.userData={...(material.userData||{}),mesh};
    target.push(material);
  }

  function buildLighting(){
    for(const side of [-1,1]){
      const target=new THREE.Object3D();
      target.position.set(side*.45,.15,30);
      host.add(target);
      const beam=new THREE.SpotLight(0xf8fbff,0,72,.36,.68,1.0);
      beam.position.set(side*.68,.66,2.25);
      beam.target=target;
      beam.castShadow=false;
      beam.visible=false;
      host.add(beam);
      headlightBeams.push({light:beam,target});
    }
  }

  function setMaterialVisibility(materials,{color,opacity}){
    const visible=opacity>0;
    for(const mat of materials){
      mat.color?.setHex(color);
      mat.opacity=visible?clamp(opacity,0,1):0;
      mat.needsUpdate=true;
      if(mat.userData?.mesh)mat.userData.mesh.visible=visible;
    }
  }

  function updateLights({dt=.016,speed=0,steerAngle=0,braking=false,reversing=false,nightLevel=0}={}){
    const night=clamp(Number(nightLevel)||0,0,1);
    const nightOn=night>.06;
    const blinkOn=updateTurnSignalState(dt,steerAngle,speed);
    setMaterialVisibility(headlightMaterials,{color:0xf8fbff,opacity:0});
    setMaterialVisibility(tailRunningMaterials,{color:0xff2028,opacity:0});
    setMaterialVisibility(brakeMaterials,{color:0xff1018,opacity:0});
    setMaterialVisibility(reverseMaterials,{color:0xffffff,opacity:0});

    const runningRed=nightOn?(.16+night*.18):0;
    const brakingRed=braking?.52:0;
    const headlightWhite=nightOn?(.45+night*.28):0;
    const reverseWhite=reversing?.98:0;
    const leftBlink=(signalState.left&&blinkOn)?.98:0;
    const rightBlink=(signalState.right&&blinkOn)?.98:0;

    setGlow(authoredRearGlowLayers,'red',0,Math.max(runningRed,brakingRed));
    setGlow(authoredRearGlowLayers,'white',0,reverseWhite);
    setGlow(authoredRearGlowLayers,'amber',-1,leftBlink);
    setGlow(authoredRearGlowLayers,'amber',1,rightBlink);

    setGlow(authoredFrontGlowLayers,'white',0,headlightWhite);
    setGlow(authoredFrontGlowLayers,'amber',-1,leftBlink);
    setGlow(authoredFrontGlowLayers,'amber',1,rightBlink);

    for(const beam of headlightBeams){
      beam.light.visible=nightOn;
      beam.light.intensity=nightOn?night*95:0;
      beam.light.distance=65+night*15;
    }
  }

  async function load(){
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const loader=new GLTFLoader();
      const url=new URL('./assets/2006_hyundai_sonata.glb',import.meta.url).href;
      const gltf=await loader.loadAsync(url);
      root=gltf.scene||gltf.scenes?.[0];
      if(!root)throw new Error('Sonata GLB sans scène');

      root.name='hyundai_sonata_2006_root';
      normalizeModel(root);
      host.add(root);
      tuneMaterials(root);
      installDarkGlassMeshes();
      bindAuthoredWheels();
      buildLighting();
      buildAuthoredRearLighting();
      buildAuthoredFrontLighting();
      updateLights({});

      ready=true;
      loadError=null;
      applyVisibility();
    }catch(error){
      loadError=error;
      ready=false;
      console.warn('Detailed Sonata GLB unavailable; procedural Sonata fallback kept.',error);
      applyVisibility();
    }
  }

  function setActive(value){
    requestedActive=!!value;
    if(!requestedActive)wheelSpin=0;
    applyVisibility();
  }

  function update(dt,{speed=0,steerAngle=0,braking=false,reversing=false,nightLevel=0}={}){
    if(!requestedActive||!ready||vehicleSystem?.activeId!==vehicleId)return;
    applyVisibility();
    animateWheels(dt,speed,steerAngle);
    updateLights({dt,speed,steerAngle,braking,reversing,nightLevel});
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
