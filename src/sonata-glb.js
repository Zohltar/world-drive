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
  let loadStarted=false;
  let root=null;
  let wheelSpin=0;
  let lastReverseRequested=false;
  let lastReverseGlowOpacity=0;

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
          // Match civilian Sonata exterior exactly: preserve authored body color,
          // roughness, metalness and any authored material response from the GLB.
          // Only keep the same modest environment response used by civil traffic.
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.25,Number(mat.envMapIntensity)||1.25);
        }

        mat.needsUpdate=true;
      }
    });
  }

  function installDarkGlassMeshes(){
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
      {spinName:'wheel.029_56',steerName:'wheel_rf_dummy.015_57',front:false,side: 1,spinSign:-1},
      {spinName:'wheel.031_62',steerName:'wheel_rf_dummy.016_63',front:true, side: 1,spinSign:-1},
      {spinName:'wheel.035_68',steerName:'wheel_rf_dummy.017_69',front:false,side:-1,spinSign: 1},
      {spinName:'wheel.039_74',steerName:'wheel_rf_dummy.018_75',front:true, side:-1,spinSign: 1}
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
      spinPivot.quaternion.copy(spinNode.quaternion);
      spinPivot.matrixAutoUpdate=true;
      parent.add(spinPivot);
      spinPivot.updateWorldMatrix(true,false);
      spinPivot.attach(spinNode);

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
      spinQuat.setFromAxisAngle(spinAxis,wheelSpin*wheel.spinSign);
      combinedQuat.copy(wheel.spinBindQuaternion).multiply(spinQuat);
      wheel.spinPivot.quaternion.copy(combinedQuat);
      wheel.spinPivot.updateMatrix();

      if(wheel.front&&wheel.steerPivot&&wheel.steerBindQuaternion){
        steerQuat.setFromAxisAngle(steerAxis,Number(steerAngle)||0);
        combinedQuat.copy(wheel.steerBindQuaternion).multiply(steerQuat);
        wheel.steerPivot.quaternion.copy(combinedQuat);
        wheel.steerPivot.updateMatrix();
      }
    }
  }

  // M4.6: every uniform referenced by the shader is explicitly initialized.
  // Previous builds declared tint/UV uniforms in GLSL but omitted them from the
  // ShaderMaterial uniform map, making authored lens masks driver-dependent.
  function makeLensGlowMaterial({
    sourceMaterial,
    filterMode=0,
    sideMode=0,
    tint=0xffffff,
    whiteWarmth=0.0,
    uvRegion=null,
    tintMix=1.0
  }){
    const uvMin=uvRegion?.min||[0,0];
    const uvMax=uvRegion?.max||[1,1];
    const uvFeather=uvRegion?.feather||[.004,.004];
    const uniforms={
      uMap:{value:sourceMaterial?.map||null},
      uOpacity:{value:0},
      uTint:{value:new THREE.Color(tint)},
      uFilterMode:{value:filterMode},
      uSideMode:{value:sideMode},
      uWhiteWarmth:{value:whiteWarmth},
      uTintMix:{value:clamp(Number(tintMix)||0,0,1)},
      uUseUvRegion:{value:uvRegion?1:0},
      uUvMin:{value:new THREE.Vector2(uvMin[0],uvMin[1])},
      uUvMax:{value:new THREE.Vector2(uvMax[0],uvMax[1])},
      uUvFeather:{value:new THREE.Vector2(uvFeather[0],uvFeather[1])}
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

          // M4.6: retain texture discrimination, but do not require almost
          // perfectly neutral pixels. The authored clear reverse lens contains
          // mild warm/grey shading in its base-color atlas.
          float whiteMask=smoothstep(0.12,0.32,lum) * (1.0-smoothstep(0.38,0.70,colorSpread));

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
      // The red lens contract is texture-driven across the full authored mesh.
      // Earlier guessed UV crops clipped the actual atlas and could suppress the
      // running/brake glow. Keep only the proven red texture discrimination.
      registerGlowLayer({targetArray:authoredRearGlowLayers,sourceMesh:rearInnerLens,filter:'red',side:0,tint:0xff2a2e,tintMix:0.42});
      // Reverse is spatially narrower and intentionally retains its audited lower
      // Object_46 UV region so white glow cannot wash the upper red strip.
      registerGlowLayer({targetArray:authoredRearGlowLayers,sourceMesh:rearInnerLens,filter:'white',side:0,tint:0xf8fbff,whiteWarmth:0.10,tintMix:1.0,uvRegion:{min:[0.04,0.00],max:[0.54,0.842],feather:[0.008,0.008]}});
    }
    if(rearOuterLens?.isMesh){
      registerGlowLayer({
        targetArray:authoredRearGlowLayers,
        sourceMesh:rearOuterLens,
        filter:'red',
        side:0,
        tint:0xff2a2e,
        tintMix:0.42
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
    lastReverseRequested=!!reversing;
    lastReverseGlowOpacity=reverseWhite;
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
    if(loadStarted)return;
    loadStarted=true;
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
    requestedActive=!!value;if(requestedActive&&!ready&&!loadStarted)load();
    if(!requestedActive)wheelSpin=0;
    applyVisibility();
  }

  function update(dt,{speed=0,steerAngle=0,braking=false,reversing=false,nightLevel=0}={}){
    if(!requestedActive||!ready||vehicleSystem?.activeId!==vehicleId)return;
    applyVisibility();
    animateWheels(dt,speed,steerAngle);
    updateLights({dt,speed,steerAngle,braking,reversing,nightLevel});
  }
  return {
    setActive,
    update,
    get ready(){return ready;},
    get loadError(){return loadError;},
    get active(){return requestedActive&&ready;},
    get wheelControllerCount(){return wheelControllers.length;},
    get reverseMaterialCount(){return authoredRearGlowLayers.filter(layer=>layer.filter==='white').length;},
    get reverseRequested(){return lastReverseRequested;},
    get reverseGlowOpacity(){return lastReverseGlowOpacity;},
    host
  };
}
