// World Drive V21.24.45 — Honda Civic Si 2006 night-balance tuning.
// Keeps the authored-light geometry mapping from V21.24.44 and rebalances
// nighttime lighting: dimmer rear running lights for clearer brake contrast,
// stronger visible headlamp glow at the front, same clean reverse/headlight
// material isolation, and the same projected beams from the correct RootNode.


export function createCivicGlbSystem({
  THREE,
  bodyGroup,
  existingWheels,
  vehicleSystem
}){
  const vehicleId='civic';
  const host=new THREE.Group();
  host.name='civic-2006-glb-host';
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
  const caliperAnimators=[];
  const headlightBeams=[];
  const tailMaterials=[];
  const reverseMaterials=[];
  const headlightMaterials=[];

  const spinAxis=new THREE.Vector3(1,0,0); // X = axle axis in the authored mesh
  const steerAxis=new THREE.Vector3(0,1,0);
  const spinQuat=new THREE.Quaternion();
  const steerQuat=new THREE.Quaternion();
  const combinedQuat=new THREE.Quaternion();
  const tmpVec=new THREE.Vector3();
  const tmpNormal=new THREE.Vector3();

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
    // The supplied Civic is already authored with +Z toward the front.
    model.rotation.y=0;
    model.updateMatrixWorld(true);

    const initialBox=new THREE.Box3().setFromObject(model);
    const initialSize=new THREE.Vector3();
    initialBox.getSize(initialSize);

    // Match the existing World Drive Civic footprint without changing physics.
    const targetLength=4.55;
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

  function brightenBaseMaterials(sceneRoot){
    const tuned=new WeakSet();
    sceneRoot.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      obj.castShadow=true;
      obj.receiveShadow=true;
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const mat of materials){
        if(!mat||tuned.has(mat))continue;
        tuned.add(mat);
        const name=String(mat.name||'').toLowerCase();
        mat.dithering=true;
        if(mat.transparent)mat.depthWrite=false;

        // Similar daytime fix as the WRX: the Civic is texture-driven and too
        // dark at noon, so provide a modest emissive daylight fill per surface.
        if(name.includes('capaint')){
          if(mat.color)mat.color.multiplyScalar(1.08);
          if(!mat.emissive)mat.emissive=new THREE.Color(0x396dff);
          else mat.emissive.setHex(0x396dff);
          if(mat.map)mat.emissiveMap=mat.map;
          mat.emissiveIntensity=.22;
          if('roughness' in mat)mat.roughness=Math.max(.18,Math.min(.42,Number(mat.roughness)||.28));
          if('metalness' in mat)mat.metalness=Math.max(.10,Number(mat.metalness)||.10);
          if('envMapIntensity' in mat)mat.envMapIntensity=1.85;
        }else if(name.includes('chassis')||name.includes('plas_2')||name.includes('plas')){
          if(mat.color)mat.color.multiplyScalar(1.10);
          if(!mat.emissive)mat.emissive=new THREE.Color(0x14181d);
          else mat.emissive.setHex(0x14181d);
          mat.emissiveIntensity=.12;
          if('envMapIntensity' in mat)mat.envMapIntensity=1.45;
        }else if(name.includes('material')||name.includes('disk')||name.includes('calipers')||name.includes('badges')){
          if(mat.color)mat.color.multiplyScalar(1.08);
          if(!mat.emissive)mat.emissive=new THREE.Color(0x24282e);
          else mat.emissive.setHex(0x24282e);
          mat.emissiveIntensity=.10;
          if('envMapIntensity' in mat)mat.envMapIntensity=1.65;
        }else if(name.includes('glass')||name.includes('light')){
          if('envMapIntensity' in mat)mat.envMapIntensity=1.35;
          if(!mat.emissive)mat.emissive=new THREE.Color(0x0b0f14);
          else mat.emissive.setHex(0x0b0f14);
          mat.emissiveIntensity=.05;
        }else if(name.includes('internal')){
          if(mat.color)mat.color.multiplyScalar(1.06);
          if(!mat.emissive)mat.emissive=new THREE.Color(0x101214);
          else mat.emissive.setHex(0x101214);
          mat.emissiveIntensity=.06;
          if('envMapIntensity' in mat)mat.envMapIntensity=1.15;
        }else{
          if(mat.color)mat.color.multiplyScalar(1.05);
          if('envMapIntensity' in mat)mat.envMapIntensity=Math.max(1.15,Number(mat.envMapIntensity)||1.15);
        }

        mat.needsUpdate=true;
      }
    });
  }

  function getMeshesByMaterial(sceneRoot){
    const map=new Map();
    sceneRoot.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const mat of materials){
        const key=String(mat?.name||'').toLowerCase();
        if(!key)continue;
        if(!map.has(key))map.set(key,[]);
        map.get(key).push(obj);
      }
    });
    return map;
  }

  function makeVertexAnimator(mesh,{spin=true,frontSteer=true}={}){
    const geometry=mesh?.geometry;
    const position=geometry?.getAttribute?.('position');
    if(!geometry||!position)return null;
    const normal=geometry.getAttribute?.('normal')||null;
    const bindPosition=new Float32Array(position.array);
    const bindNormal=normal?new Float32Array(normal.array):null;
    position.setUsage?.(THREE.DynamicDrawUsage);
    normal?.setUsage?.(THREE.DynamicDrawUsage);

    const groups=[];
    const specs=[
      {front:true, side:-1, match:(x,y,z)=>z>=0&&x<0},
      {front:true, side: 1, match:(x,y,z)=>z>=0&&x>=0},
      {front:false,side:-1, match:(x,y,z)=>z<0&&x<0},
      {front:false,side: 1, match:(x,y,z)=>z<0&&x>=0}
    ];

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
        front:spec.front,
        side:spec.side,
        verts,
        center:new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2)
      });
    }

    if(groups.length!==4)return null;
    return {
      mesh,
      position,
      normal,
      bindPosition,
      bindNormal,
      groups,
      spin:!!spin,
      frontSteer:!!frontSteer
    };
  }

  function prepareWheelAnimation(sceneRoot){
    wheelAnimators.length=0;
    caliperAnimators.length=0;
    const byMaterial=getMeshesByMaterial(sceneRoot);

    // All four tires/rims/discs are consolidated into one authored mesh per
    // material, so animate vertex quadrants around each real wheel centre.
    for(const materialName of ['tyre','material','disk']){
      for(const mesh of byMaterial.get(materialName)||[]){
        const animator=makeVertexAnimator(mesh,{spin:true,frontSteer:true});
        if(animator)wheelAnimators.push(animator);
      }
    }

    // Calipers follow front steering but never spin with the wheels/discs.
    for(const mesh of byMaterial.get('calipers')||[]){
      const animator=makeVertexAnimator(mesh,{spin:false,frontSteer:true});
      if(animator)caliperAnimators.push(animator);
    }
  }

  function animateVertexAnimator(animator,steerAngle){
    const {position,normal,bindPosition,bindNormal,groups,spin,frontSteer}=animator;
    spinQuat.setFromAxisAngle(spinAxis,wheelSpin);

    for(const group of groups){
      const steer=group.front&&frontSteer ? Number(steerAngle)||0 : 0;
      steerQuat.setFromAxisAngle(steerAxis,steer);

      if(spin)combinedQuat.copy(steerQuat).multiply(spinQuat);
      else combinedQuat.copy(steerQuat);

      const c=group.center;
      for(const vi of group.verts){
        const o=vi*3;
        tmpVec.set(
          bindPosition[o]-c.x,
          bindPosition[o+1]-c.y,
          bindPosition[o+2]-c.z
        ).applyQuaternion(combinedQuat).add(c);
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
    if(!wheelAnimators.length&&!caliperAnimators.length)return;
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const radius=.325;
    wheelSpin+=Number(speed||0)*safeDt/radius;
    if(Math.abs(wheelSpin)>Math.PI*2048)wheelSpin%=Math.PI*2;

    for(const animator of wheelAnimators)animateVertexAnimator(animator,steerAngle);
    for(const animator of caliperAnimators)animateVertexAnimator(animator,steerAngle);
  }

  function cloneLampMaterial(base,{name='civic-lamp',color=0xffffff,intensity=.01}={}){
    const mat=base.clone();
    mat.name=name;
    if(!mat.emissive)mat.emissive=new THREE.Color(color);
    mat.emissive.setHex(color);
    mat.emissiveIntensity=intensity;
    mat.toneMapped=false;
    mat.dithering=true;
    if(mat.transparent)mat.depthWrite=false;
    mat.needsUpdate=true;
    return mat;
  }

  function splitMeshTriangles(mesh,categories){
    if(!mesh?.geometry||!mesh?.material||!categories?.length)return false;
    const geometry=mesh.geometry.clone();
    const pos=geometry.getAttribute?.('position');
    if(!pos||pos.count<3)return false;

    const sourceMaterial=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    if(!sourceMaterial)return false;
    const sourceIndex=geometry.index
      ?Array.from(geometry.index.array)
      :Array.from({length:pos.count},(_,i)=>i);

    const buckets=[[]]; // 0 = untouched/base material
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
      const dynamic=cloneLampMaterial(sourceMaterial,{
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

  function bindAuthoredLights(sceneRoot){
    tailMaterials.length=0;
    reverseMaterials.length=0;
    headlightMaterials.length=0;

    sceneRoot.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      const names=materials.map(mat=>String(mat?.name||'').toLowerCase());
      const blob=`${String(obj.name||'').toLowerCase()} ${names.join(' ')}`;

      // Red rear lamp lens. Only rear/outboard triangles become dynamic.
      if(blob.includes('red_glass')){
        splitMeshTriangles(obj,[{
          name:'civic-rear-red-dynamic',
          color:0xff1820,
          target:tailMaterials,
          match:(x,y,z)=>z<-1.48&&Math.abs(x)>.32&&y>.50&&y<1.02
        }]);
        return;
      }

      // The clear-light mesh also contains glass elsewhere on the car. Split
      // front headlight and rear reverse triangles by their authored positions.
      if(blob.includes('glasslights_high')||names.some(name=>name==='glass')){
        splitMeshTriangles(obj,[
          {
            name:'civic-reverse-white-dynamic',
            color:0xffffff,
            target:reverseMaterials,
            match:(x,y,z)=>z<-1.55&&Math.abs(x)>.30&&y>.50&&y<.90
          },
          {
            name:'civic-headlight-clear-dynamic',
            color:0xf8fbff,
            target:headlightMaterials,
            match:(x,y,z)=>z>1.48&&Math.abs(x)>.30&&y>.58&&y<.98
          }
        ]);
        return;
      }

      // Inner lamp cluster / refracted surfaces: illuminate only the front,
      // upper outboard region. The amber indicator lens remains untouched.
      if(blob.includes('lightrefracted_high')||blob.includes('light_r')||blob.includes('lightcluster_high')||names.some(name=>name==='lights')){
        splitMeshTriangles(obj,[{
          name:'civic-headlight-inner-dynamic',
          color:0xf8fbff,
          target:headlightMaterials,
          match:(x,y,z)=>z>1.42&&Math.abs(x)>.30&&y>.58&&y<.96
        }]);
      }
    });
  }

  function createHeadlightProjectors(){
    for(const beam of headlightBeams){
      if(beam.light?.parent)beam.light.parent.remove(beam.light);
      if(beam.target?.parent)beam.target.parent.remove(beam.target);
    }
    headlightBeams.length=0;

    // Critical for this asset: meshes live under RootNode beneath an authored
    // 0.01 FBX conversion transform. Attaching lights directly to scene root
    // makes their positions roughly 100x too far away after normalization.
    const authoredParent=root?.getObjectByName('RootNode')||root;
    if(!authoredParent)return;

    for(const side of [-1,1]){
      const target=new THREE.Object3D();
      target.position.set(side*.60,.12,28.0);
      authoredParent.add(target);

      const light=new THREE.SpotLight(0xf8fbff,0,70,0.38,0.62,1.0);
      light.name=`civic-headlight-${side<0?'l':'r'}`;
      light.position.set(side*.68,.69,2.02);
      light.target=target;
      light.visible=false;
      light.castShadow=false;
      authoredParent.add(light);

      headlightBeams.push({light,target});
    }
  }

  function setHeadlights(nightLevel=0){
    const level=clamp(Number(nightLevel)||0,0,1);
    const visible=level>.06;

    // The user wants the lamps themselves to read as illuminated, not only the
    // projected beam on the road. Raise the authored front-lens emissive glow.
    const glow=visible ? (1.10+level*6.4) : .01;
    for(const mat of headlightMaterials){
      mat.emissive?.setHex(0xf8fbff);
      mat.emissiveIntensity=glow;
      mat.needsUpdate=true;
    }

    const beamIntensity=level*115.0;
    for(const beam of headlightBeams){
      if(!beam?.light)continue;
      beam.light.visible=visible;
      beam.light.intensity=beamIntensity;
      beam.light.distance=60+level*20;
      beam.light.angle=.36;
      beam.light.penumbra=.68;
      beam.light.decay=1.0;
    }
  }

  function setRearLights(braking=false,reversing=false,nightLevel=0){
    const night=clamp(Number(nightLevel)||0,0,1);

    // Night running lights must stay visible but be clearly dimmer than full
    // braking so the stop event reads immediately from behind.
    const runningIntensity=night>.06 ? (.14+night*1.10) : .01;
    const brakeIntensity=5.8;
    const tailIntensity=braking ? brakeIntensity : runningIntensity;
    for(const mat of tailMaterials){
      mat.emissive?.setHex(0xff1820);
      mat.emissiveIntensity=tailIntensity;
      mat.needsUpdate=true;
    }

    for(const mat of reverseMaterials){
      mat.emissive?.setHex(0xffffff);
      mat.emissiveIntensity=reversing?5.3:.01;
      mat.needsUpdate=true;
    }
  }

  async function load(){
    if(loadStarted)return;
    loadStarted=true;
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const loader=new GLTFLoader();
      const url=new URL('./assets/2006_honda_civic_si.glb',import.meta.url).href;
      const gltf=await loader.loadAsync(url);
      root=gltf.scene||gltf.scenes?.[0];
      if(!root)throw new Error('Civic GLB sans scène');

      root.name='honda_civic_si_2006_root';
      normalizeModel(root);
      host.add(root);
      brightenBaseMaterials(root);
      prepareWheelAnimation(root);
      bindAuthoredLights(root);
      createHeadlightProjectors();
      setRearLights(false,false,0);
      setHeadlights(0);

      ready=true;
      loadError=null;
      applyVisibility();
    }catch(error){
      loadError=error;
      ready=false;
      console.warn('Detailed Civic GLB unavailable; procedural Civic fallback kept.',error);
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
    setRearLights(braking,reversing,nightLevel);
    setHeadlights(nightLevel);
  }
  return {
    setActive,
    update,
    get ready(){return ready;},
    get loadError(){return loadError;},
    get active(){return requestedActive&&ready;},
    host
  };
}
