// World Drive V21.24.49 — articulated tractor / trailer subsystem + exact Saia GLB wheel hubs.
//
// The pure articulation helpers at the top intentionally have no Three.js/DOM
// dependency so reverse stability, jackknife limits and combination mass can be
// stress-tested in Node. createTruckTrailerSystem() owns only rendering + the
// small amount of runtime state needed by the selected truck combination.

const TAU=Math.PI*2;

export function clampTruck(value,min,max){
  return Math.max(min,Math.min(max,value));
}

export function wrapAngle(angle){
  let a=Number(angle)||0;
  while(a>Math.PI)a-=TAU;
  while(a<-Math.PI)a+=TAU;
  return a;
}

export function angleDeltaTruck(target,current){
  return wrapAngle((Number(target)||0)-(Number(current)||0));
}

export function combinationDynamics({tractor={},trailer=null}={}){
  const tractorMass=Math.max(1,Number(tractor.massKg)||8500);
  const trailerMass=trailer?Math.max(0,Number(trailer.massKg)||0):0;
  const totalMass=tractorMass+trailerMass;
  const trailerShare=trailerMass/Math.max(1,totalMass);

  // V21.23.1: keep this legacy/static scale only as a diagnostic. Runtime
  // propulsion now uses a power-limited tractive model (see driveAccelScaleAtSpeed)
  // so a loaded tractor has strong low-gear hill-climb force without impossible
  // high-speed acceleration.
  const driveAccelScale=trailerMass>0
    ?clampTruck(Math.pow(tractorMass/totalMass,.82),.28,1)
    :1;
  const wheelPowerKw=Math.max(50,Number(tractor.tractivePowerKw)||340);
  const maxTractiveAccel=Math.max(.25,Number(tractor.accel)||2.0);

  const tractorBrake=Math.max(.1,Number(tractor.brake)||6);
  const trailerBrake=trailer?Math.max(0,Number(trailer.brakeDecel)||0):0;
  const combinedBrakeAccel=trailerMass>0
    ?(tractorMass*tractorBrake+trailerMass*trailerBrake)/totalMass
    :tractorBrake;
  const serviceBrakeScale=clampTruck(combinedBrakeAccel/tractorBrake,.45,1.10);

  return {
    tractorMassKg:tractorMass,
    trailerMassKg:trailerMass,
    totalMassKg:totalMass,
    trailerMassShare:trailerShare,
    driveAccelScale,
    wheelPowerKw,
    maxTractiveAccel,
    serviceBrakeScale,
    rollingResistanceAccel:trailer
      ?Math.max(0,Number(trailer.rollingResistanceAccel)||0)*trailerShare
      :0,
    aeroDragCoeff:trailer
      ?Math.max(0,Number(trailer.aeroDragCoeff)||0)
      :0
  };
}

export function driveAccelScaleAtSpeed({tractor={},trailer=null,speedMps=0}={}){
  if(!trailer)return 1;
  const combo=combinationDynamics({tractor,trailer});
  const baseAccel=Math.max(.25,Number(tractor.accel)||2.0);
  const v=Math.max(5.25,Math.abs(Number(speedMps)||0));
  const powerLimitedAccel=(combo.wheelPowerKw*1000)/(combo.totalMassKg*v);
  // First/low gears may use the tractor profile's full calibrated tractive
  // acceleration. As road speed rises, available acceleration follows P/(m*v).
  const availableAccel=Math.min(combo.maxTractiveAccel,powerLimitedAccel);
  return clampTruck(availableAccel/baseAccel,.18,1);
}

export function createTrailerState({heading=0,hitchX=0,hitchZ=0}={}){
  return {
    initialized:true,
    heading:wrapAngle(heading),
    yawRate:0,
    hitchX:Number(hitchX)||0,
    hitchZ:Number(hitchZ)||0,
    previousHitchX:Number(hitchX)||0,
    previousHitchZ:Number(hitchZ)||0,
    articulation:0,
    longitudinalHitchSpeed:0,
    lateralHitchSpeed:0,
    jackknifeRatio:0,
    axleX:Number(hitchX)||0,
    axleZ:Number(hitchZ)||0,
    centerX:Number(hitchX)||0,
    centerZ:Number(hitchZ)||0
  };
}

// Non-holonomic semi-trailer model.
//
// The kingpin is constrained to the tractor hitch. The trailer axle group may
// roll along its own longitudinal axis but cannot instantaneously move sideways.
// Lateral kingpin velocity therefore becomes trailer yaw. This is the key
// property that makes reverse behaviour naturally unstable instead of using a
// scripted "reverse = jackknife" effect.
export function stepTrailerArticulation({
  state,
  hitchX=0,
  hitchZ=0,
  tractorHeading=0,
  dt=.016,
  trailer={}
}={}){
  const step=Math.max(.001,Math.min(.05,Number(dt)||.016));
  const kingpinToAxles=Math.max(2,Number(trailer.kingpinToAxlesM)||11.75);
  const kingpinToCenter=Math.max(1,Number(trailer.kingpinToCenterM)||7.05);
  const response=Math.max(.7,Number(trailer.tireCorneringResponse)||3.6);
  const maxArticulation=clampTruck(
    Number(trailer.maxArticulationRad)||1.43,
    .6,
    1.53
  );

  const s=state||createTrailerState({heading:tractorHeading,hitchX,hitchZ});
  if(!s.initialized||!Number.isFinite(s.heading)){
    Object.assign(s,createTrailerState({heading:tractorHeading,hitchX,hitchZ}));
  }

  const hvx=(hitchX-s.previousHitchX)/step;
  const hvz=(hitchZ-s.previousHitchZ)/step;
  const sh=Math.sin(s.heading),ch=Math.cos(s.heading);
  const rightX=ch,rightZ=-sh;
  const forwardX=sh,forwardZ=ch;
  const longitudinal=hvx*forwardX+hvz*forwardZ;
  const lateral=hvx*rightX+hvz*rightZ;

  // Ideal no-slip yaw rate from lateral kingpin velocity. Tire carcass/chassis
  // compliance makes the actual trailer yaw build over time, especially at
  // parking speed, so use a finite response instead of teleporting heading.
  let targetYawRate=lateral/kingpinToAxles;
  const speedMagnitude=Math.hypot(hvx,hvz);
  const speedResponse=.52+.48*clampTruck(speedMagnitude/8,0,1);
  const responseAlpha=1-Math.exp(-step*response*speedResponse);
  s.yawRate+=(targetYawRate-s.yawRate)*responseAlpha;

  if(speedMagnitude<.08){
    s.yawRate*=Math.exp(-step*4.5);
  }

  s.heading=wrapAngle(s.heading+s.yawRate*step);

  let articulation=angleDeltaTruck(tractorHeading,s.heading);
  if(Math.abs(articulation)>maxArticulation){
    articulation=clampTruck(articulation,-maxArticulation,maxArticulation);
    s.heading=wrapAngle(tractorHeading-articulation);
    // Collision/stop at the articulation limit removes the component that
    // would keep forcing the trailer farther through the tractor.
    if(Math.sign(s.yawRate)===-Math.sign(articulation))s.yawRate*=.25;
  }

  const tfX=Math.sin(s.heading),tfZ=Math.cos(s.heading);
  s.hitchX=hitchX;
  s.hitchZ=hitchZ;
  s.axleX=hitchX-tfX*kingpinToAxles;
  s.axleZ=hitchZ-tfZ*kingpinToAxles;
  s.centerX=hitchX-tfX*kingpinToCenter;
  s.centerZ=hitchZ-tfZ*kingpinToCenter;
  s.previousHitchX=hitchX;
  s.previousHitchZ=hitchZ;
  s.articulation=articulation;
  s.longitudinalHitchSpeed=longitudinal;
  s.lateralHitchSpeed=lateral;
  s.jackknifeRatio=clampTruck(Math.abs(articulation)/maxArticulation,0,1);
  return s;
}

function addBox(THREE,parent,size,position,material,{cast=true,receive=true}={}){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
  mesh.position.set(...position);
  mesh.castShadow=cast;
  mesh.receiveShadow=receive;
  parent.add(mesh);
  return mesh;
}

function addCylinder(THREE,parent,{radius=.2,length=.5,position=[0,0,0],material,radial=12}={}){
  const geometry=new THREE.CylinderGeometry(radius,radius,length,radial);
  geometry.rotateZ(Math.PI/2); // bake wheel axle along local X; rotation.x = rolling
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(...position);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}

function addLampPlane(THREE,parent,{size=[.3,.12],position=[0,0,0],rotation=[0,0,0],color=0xffffff,target=null,shape='rect',forceOnTop=false,doubleSided=false}={}){
  const material=new THREE.MeshBasicMaterial({
    color,
    transparent:true,
    opacity:1,
    side:doubleSided?THREE.DoubleSide:THREE.FrontSide,
    depthWrite:false,
    depthTest:!forceOnTop,
    toneMapped:false
  });
  const geometry=shape==='circle'
    ?new THREE.CircleGeometry(Math.max(size[0],size[1])*.5,24)
    :new THREE.PlaneGeometry(size[0],size[1]);
  const mesh=new THREE.Mesh(geometry,material);
  material.userData={...(material.userData||{}),mesh};
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.renderOrder=6;
  mesh.visible=target?false:true;
  parent.add(mesh);
  if(Array.isArray(target))target.push(material);
  return {mesh,material};
}

function setLampMaterials(materials,{hex,intensity,visible=true}){
  for(const mat of materials){
    if(!mat)continue;
    if(mat.color)mat.color.setHex(hex);
    mat.opacity=visible?1:0;
    mat.visible=visible;
    mat.needsUpdate=true;
    if(mat.userData?.mesh)mat.userData.mesh.visible=visible;
  }
}

export function createTruckTrailerSystem({
  THREE,
  scene,
  car,
  bodyGroup,
  existingWheels=[],
  vehicleSystem,
  groundHeightForWheel,
  getWorldOffset
}={}){
  const truckId='semi_6x4';
  const truckIds=new Set([truckId]);

  // Procedural tractor remains as a load/error fallback only. The selected
  // truck now uses the supplied Saia LTL tractor + half-trailer GLB.
  const truckBody=new THREE.Group();
  truckBody.name='semi-tractor-procedural-fallback';
  truckBody.visible=false;
  bodyGroup.add(truckBody);

  const assetTruckBody=new THREE.Group();
  assetTruckBody.name='saia-tractor-glb-visual';
  assetTruckBody.visible=false;
  bodyGroup.add(assetTruckBody);

  const frameMat=new THREE.MeshStandardMaterial({color:0x262a2f,roughness:.74,metalness:.34});
  const cabMat=new THREE.MeshStandardMaterial({color:0x8c1520,roughness:.36,metalness:.20});
  const cabDarkMat=new THREE.MeshStandardMaterial({color:0x561019,roughness:.42,metalness:.16});
  const glassMat=new THREE.MeshStandardMaterial({color:0x172c3a,roughness:.14,metalness:.20,transparent:true,opacity:.88});
  const chromeMat=new THREE.MeshStandardMaterial({color:0xb9c0c5,roughness:.24,metalness:.76});
  const tireMat=new THREE.MeshStandardMaterial({color:0x111315,roughness:.84,metalness:.04});
  const rimMat=new THREE.MeshStandardMaterial({color:0xaab0b5,roughness:.28,metalness:.68});
  const trailerMat=new THREE.MeshStandardMaterial({color:0xe6e8e6,roughness:.68,metalness:.05});
  const trailerSideMat=new THREE.MeshStandardMaterial({color:0xcfd3d1,roughness:.72,metalness:.08});
  const brakeLampMat=new THREE.MeshBasicMaterial({color:0x651015});

  const truckHeadlightMaterials=[];
  const truckTailRunningMaterials=[];
  const truckBrakeMaterials=[];
  const truckReverseMaterials=[];
  const truckFrontSignalLeftMaterials=[];
  const truckFrontSignalRightMaterials=[];
  const trailerTailRunningMaterials=[];
  const trailerBrakeMaterials=[];
  const trailerReverseMaterials=[];
  const trailerSignalLeftMaterials=[];
  const trailerSignalRightMaterials=[];
  const truckHeadlightBeams=[];
  const truckLightState={braking:false,reversing:false,nightLevel:0,turnLeft:false,turnRight:false,blinkTimer:0};

  // --- Procedural fallback tractor ---
  addBox(THREE,truckBody,[2.52,.40,8.55],[0,.56,-.72],frameMat);
  addBox(THREE,truckBody,[2.62,3.88,2.92],[0,2.34,-0.18],cabMat);
  addBox(THREE,truckBody,[2.58,3.68,2.70],[0,2.36,2.18],cabMat);
  addBox(THREE,truckBody,[2.40,.70,2.56],[0,4.46,0.86],cabMat);
  addBox(THREE,truckBody,[2.54,.34,2.72],[0,4.08,0.84],cabDarkMat);
  addBox(THREE,truckBody,[2.18,1.04,.10],[0,2.84,3.28],glassMat,{cast:false});
  addBox(THREE,truckBody,[.08,1.32,1.44],[-1.31,2.82,1.12],glassMat,{cast:false});
  addBox(THREE,truckBody,[.08,1.32,1.44],[ 1.31,2.82,1.12],glassMat,{cast:false});
  addBox(THREE,truckBody,[2.34,.36,.42],[0,.76,3.34],chromeMat);
  addBox(THREE,truckBody,[2.18,.26,.24],[0,1.28,3.18],cabDarkMat);
  addBox(THREE,truckBody,[1.72,.22,.16],[0,1.86,3.10],cabDarkMat);
  addBox(THREE,truckBody,[.44,.12,.08],[-.78,1.58,3.18],chromeMat);
  addBox(THREE,truckBody,[.44,.12,.08],[ .78,1.58,3.18],chromeMat);
  addBox(THREE,truckBody,[.44,.96,2.34],[-1.05,1.02,-1.56],cabDarkMat);
  addBox(THREE,truckBody,[.44,.96,2.34],[ 1.05,1.02,-1.56],cabDarkMat);
  addBox(THREE,truckBody,[.34,.58,1.74],[-1.16,1.02,2.02],cabMat);
  addBox(THREE,truckBody,[.34,.58,1.74],[ 1.16,1.02,2.02],cabMat);
  addBox(THREE,truckBody,[.18,1.08,1.60],[-1.30,1.52,2.08],cabMat);
  addBox(THREE,truckBody,[.18,1.08,1.60],[ 1.30,1.52,2.08],cabMat);
  addBox(THREE,truckBody,[.22,.40,1.76],[-1.30,1.02,2.08],cabDarkMat);
  addBox(THREE,truckBody,[.22,.40,1.76],[ 1.30,1.02,2.08],cabDarkMat);
  addBox(THREE,truckBody,[.24,.12,1.84],[-1.28,1.92,2.08],cabDarkMat);
  addBox(THREE,truckBody,[.24,.12,1.84],[ 1.28,1.92,2.08],cabDarkMat);
  addBox(THREE,truckBody,[2.30,.12,2.35],[0,.79,-3.55],frameMat);
  addBox(THREE,truckBody,[1.56,.18,1.12],[0,1.06,-3.12],cabDarkMat);
  addBox(THREE,truckBody,[.10,.98,.10],[-1.48,2.48,1.96],chromeMat);
  addBox(THREE,truckBody,[.10,.98,.10],[1.48,2.48,1.96],chromeMat);
  addBox(THREE,truckBody,[.14,2.42,.14],[-1.07,2.24,-1.34],chromeMat);
  addBox(THREE,truckBody,[.14,2.42,.14],[1.07,2.24,-1.34],chromeMat);
  addBox(THREE,truckBody,[.20,.16,.08],[-.82,.72,-4.90],brakeLampMat,{cast:false});
  addBox(THREE,truckBody,[.20,.16,.08],[.82,.72,-4.90],brakeLampMat,{cast:false});

  const tractorWheels=[];
  function makeTractorWheel({x,z,axleIndex,front=false}){
    const pivot=new THREE.Group();
    pivot.position.set(x,0,z);
    pivot.visible=false;
    car.add(pivot);
    const visualTireRadius=front?.74:.68;
    const visualTireY=visualTireRadius-.38;
    const tire=addCylinder(THREE,pivot,{radius:visualTireRadius,length:front?.33:.35,position:[0,visualTireY,0],material:tireMat,radial:20});
    const rim=addCylinder(THREE,pivot,{radius:front?.37:.33,length:front?.345:.365,position:[0,visualTireY,0],material:rimMat,radial:20});
    const wheel={
      vehicleId:truckId,
      pivot,tire,rim,axleIndex,front,
      side:x<0?'left':'right',
      visualCamber:0
    };
    tractorWheels.push(wheel);
    return wheel;
  }
  makeTractorWheel({x:-1.02,z:2.12,axleIndex:0,front:true});
  makeTractorWheel({x: 1.02,z:2.12,axleIndex:0,front:true});
  for(const [axleIndex,z] of [[1,-2.72],[2,-4.02]]){
    for(const x of [-1.05,-.79,.79,1.05])makeTractorWheel({x,z,axleIndex,front:false});
  }

  function buildTruckLighting(){
    // Headlamp lenses: visible bright white points at the tractor nose.
    for(const side of [-1,1]){
      addLampPlane(THREE,assetTruckBody,{
        size:[.28,.16],
        position:[side*.96,1.08,3.18],
        rotation:[0,0,0],
        color:0xf7fbff,
        target:truckHeadlightMaterials
      });
      addLampPlane(THREE,assetTruckBody,{
        size:[.16,.10],
        position:[side*1.18,.98,3.21],
        rotation:[0,0,0],
        color:0xffb000,
        target:side<0?truckFrontSignalLeftMaterials:truckFrontSignalRightMaterials
      });

      const beamTarget=new THREE.Object3D();
      beamTarget.position.set(side*.55,0.45,34.0);
      assetTruckBody.add(beamTarget);

      const beam=new THREE.SpotLight(0xf8fbff,0,88,0.36,0.68,1.05);
      beam.position.set(side*.98,1.04,3.06);
      beam.target=beamTarget;
      beam.visible=false;
      beam.castShadow=false;
      assetTruckBody.add(beam);
      truckHeadlightBeams.push({light:beam,target:beamTarget});

      // Low-intensity tractor rear running lights (barely visible with trailer attached).
      addLampPlane(THREE,assetTruckBody,{
        size:[.18,.10],
        position:[side*.92,.84,-4.72],
        rotation:[0,Math.PI,0],
        color:0xff2430,
        target:truckTailRunningMaterials
      });
      addLampPlane(THREE,assetTruckBody,{
        size:[.22,.12],
        position:[side*.92,.84,-4.75],
        rotation:[0,Math.PI,0],
        color:0xff1018,
        target:truckBrakeMaterials
      });
      addLampPlane(THREE,assetTruckBody,{
        size:[.14,.08],
        position:[side*.64,.84,-4.73],
        rotation:[0,Math.PI,0],
        color:0xffffff,
        target:truckReverseMaterials
      });
    }
  }

  // --- Articulated trailer root. Both the fallback and detailed GLB trailer
  // live under the same physics-driven group so articulation remains unchanged.
  const trailerGroup=new THREE.Group();
  trailerGroup.name='articulated-trailer';
  trailerGroup.visible=false;
  trailerGroup.rotation.order='YXZ';
  scene.add(trailerGroup);

  const proceduralTrailerVisual=new THREE.Group();
  proceduralTrailerVisual.name='procedural-trailer-fallback';
  trailerGroup.add(proceduralTrailerVisual);

  const assetTrailerBody=new THREE.Group();
  assetTrailerBody.name='saia-trailer-glb-visual';
  assetTrailerBody.visible=false;
  trailerGroup.add(assetTrailerBody);

  addBox(THREE,proceduralTrailerVisual,[2.60,3.70,16.15],[0,2.55,0],trailerMat);
  addBox(THREE,proceduralTrailerVisual,[2.64,.16,16.18],[0,.78,0],trailerSideMat);
  addBox(THREE,proceduralTrailerVisual,[2.56,.08,15.7],[0,4.41,0],trailerSideMat);
  addBox(THREE,proceduralTrailerVisual,[2.42,.18,.08],[0,.83,-8.10],frameMat);
  const trailerBrakeMat=new THREE.MeshBasicMaterial({color:0x651015});
  addBox(THREE,proceduralTrailerVisual,[.28,.18,.08],[-.88,1.06,-8.11],trailerBrakeMat,{cast:false});
  addBox(THREE,proceduralTrailerVisual,[.28,.18,.08],[ .88,1.06,-8.11],trailerBrakeMat,{cast:false});

  const trailerWheelMeshes=[];
  const axleCenterFromBody=-(11.75-7.05);
  for(const z of [axleCenterFromBody-.61,axleCenterFromBody+.61]){
    for(const x of [-1.05,-.79,.79,1.05]){
      const holder=new THREE.Group();
      holder.position.set(x,.50,z);
      proceduralTrailerVisual.add(holder);
      const tire=addCylinder(THREE,holder,{radius:.49,length:.27,material:tireMat,radial:16});
      const rim=addCylinder(THREE,holder,{radius:.24,length:.285,material:rimMat,radial:16});
      trailerWheelMeshes.push({holder,tire,rim});
    }
  }

  function buildTrailerLighting(){
    // V21.24.53 — the authored lamp pockets are on the actual rear bumper area
    // of the shorter Saia half-trailer, which still sits near the original
    // trailer-group rear depth (~ -2.2 m in World Drive coordinates). The
    // previous 0.22 placement pushed the lamps into/through the trailer body so
    // they became effectively invisible. Keep them on the rear face and render
    // them above the mesh so the designated round recesses visibly light up.
    const rearFaceZ=-2.18;
    const lampY=1.03;
    const redX=1.03;
    const amberX=.79;
    const whiteX=.56;
    for(const side of [-1,1]){
      addLampPlane(THREE,trailerGroup,{
        size:[.22,.22],
        position:[side*redX,lampY,rearFaceZ],
        rotation:[0,Math.PI,0],
        color:0xff2430,
        target:trailerTailRunningMaterials,
        shape:'circle',
        forceOnTop:true
      });
      addLampPlane(THREE,trailerGroup,{
        size:[.26,.26],
        position:[side*redX,lampY,rearFaceZ-.01],
        rotation:[0,Math.PI,0],
        color:0xff1018,
        target:trailerBrakeMaterials,
        shape:'circle',
        forceOnTop:true
      });
      addLampPlane(THREE,trailerGroup,{
        size:[.19,.19],
        position:[side*amberX,lampY,rearFaceZ],
        rotation:[0,Math.PI,0],
        color:0xffb000,
        target:side<0?trailerSignalLeftMaterials:trailerSignalRightMaterials,
        shape:'circle',
        forceOnTop:true
      });
      addLampPlane(THREE,trailerGroup,{
        size:[.19,.19],
        position:[side*whiteX,lampY,rearFaceZ],
        rotation:[0,Math.PI,0],
        color:0xffffff,
        target:trailerReverseMaterials,
        shape:'circle',
        forceOnTop:true
      });
    }
  }

  buildTruckLighting();
  buildTrailerLighting();

  let truckAssetReady=false;
  let truckAssetLoadError=null;

  // V21.24.47 — GPU-transform wheel animation for the detailed Saia GLB.
  // The source model stores several wheels inside shared meshes, so during the
  // split we carve each axle/side into its own pivot instead of rotating every
  // vertex on the CPU each frame.
  const assetTractorWheelControllers=[];
  const assetTrailerWheelControllers=[];
  const assetWheelControllerMap=new Map();
  let tractorAssetWheelSpin=0;
  let trailerAssetWheelSpin=0;
  let previousTrailerAxleX=null;
  let previousTrailerAxleZ=null;

  // Authored Saia wheel centres in source-model coordinates.  V21.24.48
  // estimated each pivot from whichever tire/rim fragment happened to be seen
  // first.  Several wheels are split into incomplete quadrant/tread meshes, so
  // those fragment bounds can be off-centre (one trailer wheel was ~10 cm high).
  // Use the actual axle/hub centres instead: every tire, tread and rim fragment
  // then rotates around exactly the same rigid axis.
  const SOURCE_AXLES=[
    {x:309.0, tractor:true, front:true,  hubY:55.55,hubSideZ:121.0},
    {x:-108.7,tractor:true, front:false, hubY:55.98,hubSideZ:102.0},
    {x:-228.8,tractor:true, front:false, hubY:55.98,hubSideZ:102.0},
    {x:-757.7,tractor:false,front:false, hubY:55.98,hubSideZ:102.0},
    {x:-887.3,tractor:false,front:false, hubY:55.98,hubSideZ:102.0}
  ];

  function exactAssetWheelHub(group,anchorX){
    const axle=group?.axle||{};
    const side=group?.side<0?-1:1;
    const sourceLateral=side*(Number(axle.hubSideZ)||102.0);
    // geometryPiece mapping:
    // source +X forward -> World Drive +Z
    // source +Z lateral -> World Drive -X
    return new THREE.Vector3(
      -sourceLateral*.0092,
      (Number(axle.hubY)||55.98)*.0100,
      ((Number(axle.x)||0)-anchorX)*.0100
    );
  }

  function cloneAssetMaterial(source){
    const material=source?.clone?.()||source;
    if(!material)return material;
    material.dithering=true;
    if(material.transparent)material.depthWrite=false;
    if('envMapIntensity' in material)material.envMapIntensity=Math.max(1.15,Number(material.envMapIntensity)||1.15);
    material.needsUpdate=true;
    return material;
  }

  function geometryPiece(sourceGeometry,indices,sourceMatrix,anchorX,{scaleX=.0092,scaleY=.0100,scaleZ=.0100}={}){
    if(!indices?.length)return null;
    const geometry=sourceGeometry.clone();
    geometry.applyMatrix4(sourceMatrix);
    geometry.setIndex(indices);
    geometry.clearGroups();
    geometry.addGroup(0,indices.length,0);

    // Source asset: +X = vehicle forward, +Y = up, +Z = lateral.
    // World Drive: +Z = forward, +Y = up, +X = lateral. A -90° Y rotation
    // preserves handedness; slight width compression puts the trailer near 2.6m.
    geometry.translate(-anchorX,0,0);
    geometry.rotateY(-Math.PI/2);
    geometry.scale(scaleX,scaleY,scaleZ);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function splitIndicesBySourceX(geometry,sourceMatrix,cutX=-500){
    const transformed=geometry.clone();
    transformed.applyMatrix4(sourceMatrix);
    const pos=transformed.getAttribute?.('position');
    if(!pos)return {tractor:[],trailer:[]};
    const sourceIndex=transformed.index
      ?Array.from(transformed.index.array)
      :Array.from({length:pos.count},(_,i)=>i);
    const tractor=[];
    const trailer=[];
    for(let i=0;i+2<sourceIndex.length;i+=3){
      const a=sourceIndex[i],b=sourceIndex[i+1],c=sourceIndex[i+2];
      const cx=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
      (cx<cutX?trailer:tractor).push(a,b,c);
    }
    transformed.dispose?.();
    return {tractor,trailer};
  }

  function indexedGeometryCenter(geometry){
    const pos=geometry?.getAttribute?.('position');
    const index=geometry?.index?.array;
    if(!pos||!index?.length)return new THREE.Vector3();
    let minX=Infinity,minY=Infinity,minZ=Infinity;
    let maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    const seen=new Set();
    for(const raw of index){
      const i=Number(raw);
      if(seen.has(i))continue;
      seen.add(i);
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      if(x<minX)minX=x;if(y<minY)minY=y;if(z<minZ)minZ=z;
      if(x>maxX)maxX=x;if(y>maxY)maxY=y;if(z>maxZ)maxZ=z;
    }
    if(!Number.isFinite(minX))return new THREE.Vector3();
    return new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2);
  }

  function splitWheelIndicesByAxleAndSide(geometry,sourceMatrix){
    const transformed=geometry.clone();
    transformed.applyMatrix4(sourceMatrix);
    const pos=transformed.getAttribute?.('position');
    if(!pos){
      transformed.dispose?.();
      return [];
    }
    const sourceIndex=transformed.index
      ?Array.from(transformed.index.array)
      :Array.from({length:pos.count},(_,i)=>i);
    const buckets=new Map();
    for(let i=0;i+2<sourceIndex.length;i+=3){
      const a=sourceIndex[i],b=sourceIndex[i+1],c=sourceIndex[i+2];
      const cx=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
      const cz=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
      let best=null,bestDist=Infinity;
      for(let axleIndex=0;axleIndex<SOURCE_AXLES.length;axleIndex++){
        const axle=SOURCE_AXLES[axleIndex];
        const dist=Math.abs(cx-axle.x);
        if(dist<bestDist){bestDist=dist;best={axleIndex,axle};}
      }
      // Tire radius is ~55 source units. 85 gives a little tolerance for rims
      // and dual-wheel sidewalls while rejecting unrelated geometry.
      if(!best||bestDist>85)continue;
      const side=cz<0?-1:1;
      const key=`${best.axleIndex}:${side}`;
      if(!buckets.has(key))buckets.set(key,{...best,side,indices:[]});
      buckets.get(key).indices.push(a,b,c);
    }
    transformed.dispose?.();
    return [...buckets.values()].filter(bucket=>bucket.indices.length);
  }

  function addAssetWheelPieces(target,obj,anchorX){
    const sourceMaterial=Array.isArray(obj.material)?obj.material[0]:obj.material;
    const groups=splitWheelIndicesByAxleAndSide(obj.geometry,obj.matrixWorld);
    for(const group of groups){
      const belongsToTractor=!!group.axle.tractor;
      if((target===assetTruckBody)!==belongsToTractor)continue;
      const geometry=geometryPiece(obj.geometry,group.indices,obj.matrixWorld,anchorX);
      if(!geometry)continue;

      // V21.24.49: every authored tire/rim/tread fragment that belongs to
      // the same axle + side shares ONE exact hub axis.  Never derive the axis
      // from a fragment bounding box: partial tread/rim quadrants are not centred.
      const key=`${belongsToTractor?'tractor':'trailer'}:${group.axleIndex}:${group.side}`;
      let controller=assetWheelControllerMap.get(key);
      if(!controller){
        const center=exactAssetWheelHub(group,anchorX);
        const steerPivot=new THREE.Group();
        steerPivot.name=`saia-wheel-${group.axleIndex}-${group.side<0?'l':'r'}-steer`;
        steerPivot.position.copy(center);
        target.add(steerPivot);

        const spinPivot=new THREE.Group();
        spinPivot.name=`saia-wheel-${group.axleIndex}-${group.side<0?'l':'r'}-spin`;
        steerPivot.add(spinPivot);

        controller={
          steerPivot,
          spinPivot,
          center:center.clone(),
          front:belongsToTractor&&!!group.axle.front,
          side:group.side
        };
        assetWheelControllerMap.set(key,controller);
        (belongsToTractor?assetTractorWheelControllers:assetTrailerWheelControllers).push(controller);
      }

      // Geometry is already flattened into World Drive coordinates. Rebase ALL
      // fragments around the exact physical hub. Their relative shape cannot
      // deform because only the shared spinPivot is animated afterwards.
      geometry.translate(-controller.center.x,-controller.center.y,-controller.center.z);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const mesh=new THREE.Mesh(geometry,cloneAssetMaterial(sourceMaterial));
      mesh.name=`${obj.name||'saia-wheel'}-${group.axleIndex}-${group.side<0?'l':'r'}-mesh`;
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      controller.spinPivot.add(mesh);
    }
  }

  function animateAssetWheels(speed,dt,steerAngle=0){
    if(!truckAssetReady)return;
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const radius=.54;
    // +X is the baked wheel axle. Positive rotation makes the contact patch
    // move rearward while the truck moves forward (+Z), i.e. true rolling.
    tractorAssetWheelSpin+=Number(speed||0)*safeDt/radius;
    if(Math.abs(tractorAssetWheelSpin)>Math.PI*2048)tractorAssetWheelSpin%=Math.PI*2;

    for(const wheel of assetTractorWheelControllers){
      wheel.steerPivot.rotation.y=wheel.front?(Number(steerAngle)||0):0;
      wheel.spinPivot.rotation.x=tractorAssetWheelSpin;
    }
    for(const wheel of assetTrailerWheelControllers){
      wheel.spinPivot.rotation.x=trailerAssetWheelSpin;
    }
  }

  function addFlattenedMesh(target,obj,indices,anchorX){
    if(!indices?.length||!obj?.geometry)return;
    const geometry=geometryPiece(obj.geometry,indices,obj.matrixWorld,anchorX);
    if(!geometry)return;
    const sourceMaterial=Array.isArray(obj.material)?obj.material[0]:obj.material;
    const mesh=new THREE.Mesh(geometry,cloneAssetMaterial(sourceMaterial));
    mesh.name=`${obj.name||'saia-part'}-${target===assetTrailerBody?'trailer':'tractor'}`;
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    target.add(mesh);
  }

  function buildSaiaSplitVisual(sourceRoot){
    sourceRoot.updateMatrixWorld(true);
    const tractorAnchorX=195;   // aligns tandem / fifth-wheel with existing tractor origin
    const trailerCenterX=-555;  // visual centre of the supplied half-trailer
    const splitCutX=-500;       // clean gap between tractor tandem and trailer axles

    assetTractorWheelControllers.length=0;
    assetTrailerWheelControllers.length=0;
    assetWheelControllerMap.clear();

    sourceRoot.traverse(obj=>{
      if(!obj?.isMesh&&!obj?.isSkinnedMesh)return;
      const name=String(obj.name||'').toLowerCase();
      const parentName=String(obj.parent?.name||'').toLowerCase();
      const materialNames=(Array.isArray(obj.material)?obj.material:[obj.material])
        .map(mat=>String(mat?.name||'').toLowerCase());
      const blob=`${parentName} ${name} ${materialNames.join(' ')}`;
      const sourceIndex=obj.geometry?.index
        ?Array.from(obj.geometry.index.array)
        :Array.from({length:obj.geometry?.getAttribute?.('position')?.count||0},(_,i)=>i);
      if(!sourceIndex.length)return;

      // V21.24.47: tires and rims are carved into independent axle/side pieces
      // so the detailed GLB wheels can roll (and the tractor front wheels steer)
      // through cheap object transforms instead of remaining baked into the body.
      const isTire=blob.includes('tire012')||materialNames.includes('tire');
      const isRim=name.includes('_rim_')||parentName.includes('rim')||materialNames.includes('material');
      if(isTire||isRim){
        addAssetWheelPieces(assetTruckBody,obj,tractorAnchorX);
        addAssetWheelPieces(assetTrailerBody,obj,trailerCenterX);
        return;
      }

      // The authored trailer shell is already a clean group; keep it whole even
      // though its nose overlaps the tractor fifth-wheel area. Trailer rear frame
      // is also a dedicated mesh. Mixed undercarriage is split spatially at the
      // clean tractor/trailer axle gap.
      const trailerWhole=
        blob.includes('trailer_trailer')||
        blob.includes('chassi_detal016');
      const mixed=
        blob.includes('pan001')||
        blob.includes('rearview_mirror_base1');

      if(trailerWhole){
        addFlattenedMesh(assetTrailerBody,obj,sourceIndex,trailerCenterX);
        return;
      }
      if(mixed){
        const pieces=splitIndicesBySourceX(obj.geometry,obj.matrixWorld,splitCutX);
        addFlattenedMesh(assetTruckBody,obj,pieces.tractor,tractorAnchorX);
        addFlattenedMesh(assetTrailerBody,obj,pieces.trailer,trailerCenterX);
        return;
      }
      addFlattenedMesh(assetTruckBody,obj,sourceIndex,tractorAnchorX);
    });

    // The existing trailer rigid-body centre sits 7.05m behind the kingpin;
    // this shorter supplied half-trailer's visual centre is ~4.05m behind it.
    // Shift the visual forward 3m inside the physics-driven trailer group so
    // the nose still meets the tractor while leaving articulation untouched.
    assetTrailerBody.position.z=3.0;
  }

  // Load the new tractor+trailer asset once, split it into two visual bodies,
  // then let the existing articulation system drive each body independently.
  (async()=>{
    try{
      const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
      const loader=new GLTFLoader();
      const modelUrl=new URL('./assets/saia_ltl_freight_truck_half_trailer.glb',import.meta.url).href;
      const gltf=await loader.loadAsync(modelUrl);
      const sourceRoot=gltf.scene||gltf.scenes?.[0];
      if(!sourceRoot)throw new Error('GLB Saia sans scène');
      buildSaiaSplitVisual(sourceRoot);
      truckAssetReady=true;
      truckAssetLoadError=null;
      if(active){
        applyTractorVisual();
        for(const w of tractorWheels)w.pivot.visible=false;
      }
    }catch(error){
      truckAssetLoadError=error;
      console.warn('Saia truck/trailer GLB unavailable; procedural fallback kept.',error);
    }
  })();

  const hiddenBodyState=new Map();
  const hiddenWheelState=new Map();
  const savedBodyGroupScale=new THREE.Vector3(1,1,1);
  let active=false;
  let trailerState=createTrailerState();
  let lastCombo=combinationDynamics({tractor:{},trailer:null});
  const truckCameraPos=new THREE.Vector3();
  const truckCameraTarget=new THREE.Vector3();
  let truckCameraInitialized=false;
  let truckLookYaw=0;
  let truckLookPitch=0;

  function isTruckProfile(id=vehicleSystem?.activeId){
    return truckIds.has(id);
  }

  function applyTractorVisual(){
    if(!active){
      truckBody.visible=false;
      assetTruckBody.visible=false;
      return;
    }
    assetTruckBody.visible=!!truckAssetReady;
    assetTrailerBody.visible=!!truckAssetReady;
    proceduralTrailerVisual.visible=!truckAssetReady;
    truckBody.visible=!truckAssetReady;
  }

  function hitchPoint(absX,absZ,heading){
    const offset=Number(vehicleSystem?.physics?.coupling?.rearHitchOffsetM)||-3.05;
    return {
      x:absX+Math.sin(heading)*offset,
      z:absZ+Math.cos(heading)*offset
    };
  }

  function hidePassengerVisuals(){
    hiddenBodyState.clear();
    for(const child of bodyGroup.children){
      if(child===truckBody||child===assetTruckBody)continue;
      hiddenBodyState.set(child,child.visible);
      child.visible=false;
    }
    hiddenWheelState.clear();
    for(const w of existingWheels){
      if(!w?.pivot)continue;
      hiddenWheelState.set(w.pivot,w.pivot.visible);
      w.pivot.visible=false;
    }
  }

  function restorePassengerVisuals(){
    for(const [obj,visible] of hiddenBodyState)obj.visible=visible;
    for(const [obj,visible] of hiddenWheelState)obj.visible=visible;
    hiddenBodyState.clear();
    hiddenWheelState.clear();
  }

  function setActive(next,{absX=0,absZ=0,heading=0}={}){
    const should=!!next;
    if(should===active){
      if(should){
        applyTractorVisual();
        resetPose(absX,absZ,heading);
      }
      return;
    }
    active=should;
    truckCameraInitialized=false;
    truckLookYaw=0;
    truckLookPitch=0;
    if(active){
      savedBodyGroupScale.copy(bodyGroup.scale);
      bodyGroup.scale.set(1,1,1);
      hidePassengerVisuals();
      applyTractorVisual();
      for(const w of tractorWheels)w.pivot.visible=!truckAssetReady;
      trailerGroup.visible=true;
      resetPose(absX,absZ,heading);
    }else{
      truckBody.visible=false;
      assetTruckBody.visible=false;
      for(const w of tractorWheels)w.pivot.visible=false;
      trailerGroup.visible=false;
      restorePassengerVisuals();
      bodyGroup.scale.copy(savedBodyGroupScale);
    }
  }

  function resetPose(absX=0,absZ=0,heading=0){
    const hitch=hitchPoint(absX,absZ,heading);
    trailerState=createTrailerState({heading,hitchX:hitch.x,hitchZ:hitch.z});
    previousTrailerAxleX=null;
    previousTrailerAxleZ=null;
    tractorAssetWheelSpin=0;
    trailerAssetWheelSpin=0;
    const trailer=vehicleSystem?.active?.trailer||null;
    lastCombo=combinationDynamics({tractor:vehicleSystem?.physics||{},trailer});
    updateVisualPose({absX,absZ,heading,speed:0,dt:.016,skipPhysics:true});
  }

  function updateVisualPose({absX=0,absZ=0,heading=0,speed=0,steerAngle=0,dt=.016,skipPhysics=false}={}){
    if(!active)return;
    const trailer=vehicleSystem?.active?.trailer;
    if(!trailer)return;
    const hitch=hitchPoint(absX,absZ,heading);
    if(skipPhysics){
      trailerState.previousHitchX=hitch.x;
      trailerState.previousHitchZ=hitch.z;
      trailerState.hitchX=hitch.x;
      trailerState.hitchZ=hitch.z;
      trailerState.heading=heading;
      trailerState.articulation=0;
      const fX=Math.sin(heading),fZ=Math.cos(heading);
      trailerState.axleX=hitch.x-fX*(Number(trailer.kingpinToAxlesM)||11.75);
      trailerState.axleZ=hitch.z-fZ*(Number(trailer.kingpinToAxlesM)||11.75);
      trailerState.centerX=hitch.x-fX*(Number(trailer.kingpinToCenterM)||7.05);
      trailerState.centerZ=hitch.z-fZ*(Number(trailer.kingpinToCenterM)||7.05);
    }else{
      stepTrailerArticulation({state:trailerState,hitchX:hitch.x,hitchZ:hitch.z,tractorHeading:heading,dt,trailer});
    }

    // Roll trailer wheels from the trailer axle's own signed travel rather than
    // blindly copying tractor speed. This remains correct while articulating or
    // reversing.
    if(!skipPhysics&&Number.isFinite(previousTrailerAxleX)&&Number.isFinite(previousTrailerAxleZ)){
      const travelX=trailerState.axleX-previousTrailerAxleX;
      const travelZ=trailerState.axleZ-previousTrailerAxleZ;
      const thNow=trailerState.heading;
      const signedTravel=travelX*Math.sin(thNow)+travelZ*Math.cos(thNow);
      trailerAssetWheelSpin+=signedTravel/.54;
      if(Math.abs(trailerAssetWheelSpin)>Math.PI*2048)trailerAssetWheelSpin%=Math.PI*2;
    }
    previousTrailerAxleX=trailerState.axleX;
    previousTrailerAxleZ=trailerState.axleZ;

    const worldOffset=getWorldOffset?.()||{x:0,z:0};
    const th=trailerState.heading;
    const tfX=Math.sin(th),tfZ=Math.cos(th);
    const rightX=Math.cos(th),rightZ=-Math.sin(th);
    const kpToAxles=Math.max(2,Number(trailer.kingpinToAxlesM)||11.75);

    const frontGround=Number(groundHeightForWheel?.(hitch.x,hitch.z,true));
    const rearGround=Number(groundHeightForWheel?.(trailerState.axleX,trailerState.axleZ,true));
    const centerGround=Number(groundHeightForWheel?.(trailerState.centerX,trailerState.centerZ,true));
    const leftGround=Number(groundHeightForWheel?.(
      trailerState.axleX-rightX*1.02,
      trailerState.axleZ-rightZ*1.02,
      true
    ));
    const rightGround=Number(groundHeightForWheel?.(
      trailerState.axleX+rightX*1.02,
      trailerState.axleZ+rightZ*1.02,
      true
    ));

    const fg=Number.isFinite(frontGround)?frontGround:(Number.isFinite(centerGround)?centerGround:0);
    const rg=Number.isFinite(rearGround)?rearGround:fg;
    const cg=Number.isFinite(centerGround)?centerGround:(fg+rg)*.5;
    const lg=Number.isFinite(leftGround)?leftGround:rg;
    const rgg=Number.isFinite(rightGround)?rightGround:rg;

    trailerGroup.position.set(
      trailerState.centerX-worldOffset.x,
      cg+.03,
      trailerState.centerZ-worldOffset.z
    );
    trailerGroup.rotation.y=th;
    trailerGroup.rotation.x=-clampTruck(Math.atan2(fg-rg,kpToAxles),-.20,.20);
    trailerGroup.rotation.z=clampTruck(Math.atan2(rgg-lg,2.04),-.14,.14);

    animateAssetWheels(speed,dt,steerAngle);

    for(const w of trailerWheelMeshes){
      w.tire.rotation.x-=speed*dt/.49;
      w.rim.rotation.x-=speed*dt/.49;
    }
  }

  function update(dt,drivingState={}){
    if(!active)return;
    updateVisualPose({...drivingState,dt});
    updateTruckLights(dt,drivingState);
  }

  function updateTruckLights(dt,{braking=false,reversing=false,nightLevel=0,speed=0,steerAngle=0,steerInput=0}={}){
    truckLightState.braking=!!braking;
    truckLightState.reversing=!!reversing;
    truckLightState.nightLevel=clampTruck(Number(nightLevel)||0,0,1);

    const stopSpeed=Math.abs(Number(speed)||0);
    const maxSteerLow=Math.max(.30,Number(vehicleSystem?.active?.physics?.maxSteerLow)||.43);
    const signalThreshold=maxSteerLow*.74;
    const neutralThreshold=maxSteerLow*.10;
    const steerValue=Number(steerAngle)||0;
    const absSteer=Math.abs(steerValue);
    const steerInputValue=Number.isFinite(Number(steerInput)) ? Number(steerInput) : 0;
    const absSteerInput=Math.abs(steerInputValue);
    const activationInputThreshold=.88;
    const neutralInputThreshold=.10;
    const canSignalBySteer=stopSpeed<.35;

    let nextTurnLeft=!!truckLightState.turnLeft;
    let nextTurnRight=!!truckLightState.turnRight;

    const neutralByInput=absSteerInput<=neutralInputThreshold;
    const neutralByAngle=absSteer<=neutralThreshold;
    if(neutralByInput||neutralByAngle){
      nextTurnLeft=false;
      nextTurnRight=false;
    }else if(nextTurnLeft&&(steerInputValue<-neutralInputThreshold||steerValue<-neutralThreshold)){
      nextTurnLeft=true;
      nextTurnRight=false;
    }else if(nextTurnRight&&(steerInputValue>neutralInputThreshold||steerValue>neutralThreshold)){
      nextTurnLeft=false;
      nextTurnRight=true;
    }else if(canSignalBySteer&&(steerInputValue<=-activationInputThreshold||steerValue<=-signalThreshold)){
      nextTurnLeft=true;
      nextTurnRight=false;
    }else if(canSignalBySteer&&(steerInputValue>=activationInputThreshold||steerValue>=signalThreshold)){
      nextTurnLeft=false;
      nextTurnRight=true;
    }

    const previousBlinking=truckLightState.turnLeft||truckLightState.turnRight;
    truckLightState.turnLeft=nextTurnLeft&&!nextTurnRight;
    truckLightState.turnRight=nextTurnRight&&!nextTurnLeft;
    if(truckLightState.turnLeft||truckLightState.turnRight){
      truckLightState.blinkTimer=previousBlinking
        ?((Number(truckLightState.blinkTimer)||0)+Math.max(.001,Math.min(.05,Number(dt)||.016)))
        :0;
    }else{
      truckLightState.blinkTimer=0;
    }
    const nightOn=truckLightState.nightLevel>.06;
    const runningVisible=nightOn;
    const headlightVisible=nightOn;
    const headlightHex=0xf8fbff;
    const runningRed=0xff2630;
    const brakeRed=0xff1018;
    const indicatorAmber=0xffb000;
    const blinkOn=(truckLightState.turnLeft||truckLightState.turnRight)
      ?((truckLightState.blinkTimer%1.2)<0.55)
      :false;

    const truckHeadlightIntensity=runningVisible ? (.42+truckLightState.nightLevel*1.65) : 0;
    const rearRunningIntensity=runningVisible ? (.20+truckLightState.nightLevel*.44) : 0;
    const brakeIntensity=truckLightState.braking ? 1 : 0;
    const reverseIntensity=truckLightState.reversing ? 1 : 0;
    const leftSignalIntensity=(truckLightState.turnLeft&&blinkOn) ? .96 : 0;
    const rightSignalIntensity=(truckLightState.turnRight&&blinkOn) ? .96 : 0;

    for(const mat of truckHeadlightMaterials){
      mat.color.setHex(headlightHex);
      mat.opacity=truckHeadlightIntensity>0 ? clampTruck(truckHeadlightIntensity,0,.98) : 0;
      mat.needsUpdate=true;
      if(mat.userData?.mesh)mat.userData.mesh.visible=truckHeadlightIntensity>0;
    }
    for(const beam of truckHeadlightBeams){
      if(!beam?.light)continue;
      beam.light.visible=headlightVisible;
      beam.light.intensity=headlightVisible ? (truckLightState.nightLevel*72.0) : 0;
      beam.light.distance=70+truckLightState.nightLevel*18;
      beam.light.angle=0.34;
      beam.light.penumbra=0.68;
      beam.light.decay=1.0;
    }

    const runningGroups=[trailerTailRunningMaterials];
    const brakeGroups=[trailerBrakeMaterials];
    const reverseGroups=[trailerReverseMaterials];
    for(const group of runningGroups){
      for(const mat of group){
        mat.color.setHex(runningRed);
        mat.opacity=rearRunningIntensity>0 ? clampTruck(rearRunningIntensity,0,.72) : 0;
        mat.needsUpdate=true;
        if(mat.userData?.mesh)mat.userData.mesh.visible=rearRunningIntensity>0;
      }
    }
    for(const group of brakeGroups){
      for(const mat of group){
        mat.color.setHex(brakeRed);
        mat.opacity=brakeIntensity>0 ? .96 : 0;
        mat.needsUpdate=true;
        if(mat.userData?.mesh)mat.userData.mesh.visible=brakeIntensity>0;
      }
    }
    for(const group of reverseGroups){
      for(const mat of group){
        mat.color.setHex(0xffffff);
        mat.opacity=reverseIntensity>0 ? .96 : 0;
        mat.needsUpdate=true;
        if(mat.userData?.mesh)mat.userData.mesh.visible=reverseIntensity>0;
      }
    }

    const signalSets=[
      {materials:truckFrontSignalLeftMaterials,intensity:leftSignalIntensity},
      {materials:truckFrontSignalRightMaterials,intensity:rightSignalIntensity},
      {materials:trailerSignalLeftMaterials,intensity:leftSignalIntensity},
      {materials:trailerSignalRightMaterials,intensity:rightSignalIntensity}
    ];
    for(const {materials,intensity} of signalSets){
      for(const mat of materials){
        mat.color.setHex(indicatorAmber);
        mat.opacity=intensity>0 ? intensity : 0;
        mat.needsUpdate=true;
        if(mat.userData?.mesh)mat.userData.mesh.visible=intensity>0;
      }
    }

    // Procedural fallback rear lamps still mirror brake state so the fallback
    // remains usable if the GLB fails to load.
    brakeLampMat.color.setHex(truckLightState.braking?0xff2737:0x651015);
    trailerBrakeMat.color.setHex(truckLightState.braking?0xff2737:0x651015);
  }

  function setBrakeLights(braking){
    // V21.24.57: this compatibility hook is called from updateDrive() every
    // frame, before the full truck lighting update. It must NEVER touch turn
    // signal state or the blink timer. Earlier versions called
    // updateTruckLights() here without steering input, which reset the signal
    // to neutral every frame: at a stop it looked permanently ON because the
    // timer restarted at zero, and once moving it cancelled immediately.
    truckLightState.braking=!!braking;
    brakeLampMat.color.setHex(truckLightState.braking?0xff2737:0x651015);
    trailerBrakeMat.color.setHex(truckLightState.braking?0xff2737:0x651015);
  }

  function longitudinalScales(){
    if(!active)return {driveAccelScale:1,serviceBrakeScale:1,rollingResistanceAccel:0,aeroDragCoeff:0,totalMassKg:Number(vehicleSystem?.physics?.massKg)||0};
    lastCombo=combinationDynamics({tractor:vehicleSystem?.physics||{},trailer:vehicleSystem?.active?.trailer||null});
    return lastCombo;
  }

  function driveAccelScaleForSpeed(speedAbs=0){
    if(!active)return 1;
    const trailer=vehicleSystem?.active?.trailer||null;
    return driveAccelScaleAtSpeed({
      tractor:vehicleSystem?.physics||{},
      trailer,
      speedMps:speedAbs
    });
  }

  function tractorYawScale(speedAbs=0){
    if(!active)return 1;
    const v=Math.max(0,Math.abs(Number(speedAbs)||0));
    const speedT=clampTruck((v-8)/30,0,1);
    const massT=clampTruck(lastCombo.trailerMassShare/.70,0,1);
    // A loaded fifth-wheel combination resists quick tractor yaw at road speed;
    // at parking speed retain the mechanical turning radius needed for docking.
    return 1-.12*speedT*massT;
  }

  function adjustCamera(camera,camTarget,heading,dt,options={}){
    if(!active||!camera||!car)return;

    const modeLabel=String(options.modeLabel||'').toLowerCase();
    const isChase=!modeLabel||modeLabel.includes('chase');
    if(!isChase){
      truckCameraInitialized=false;
      return;
    }

    const lookX=clampTruck(Number(options.lookX)||0,-1,1);
    const lookY=clampTruck(Number(options.lookY)||0,-1,1);
    const lookAlpha=1-Math.exp(-Math.max(.001,dt)*7.5);
    truckLookYaw+=(lookX*1.18-truckLookYaw)*lookAlpha;
    truckLookPitch+=((-lookY)*.44-truckLookPitch)*lookAlpha;

    const viewHeading=heading+truckLookYaw;
    const fx=Math.sin(viewHeading),fz=Math.cos(viewHeading);
    const rx=Math.cos(viewHeading),rz=-Math.sin(viewHeading);
    const anchorY=car.position.y+2.35;

    // V21.24.47: move substantially closer while staying high. The supplied
    // half-trailer is shorter than the old 53-ft box, so a 34 m camera makes the
    // entire rig tiny and hides the tractor behind the trailer. A steep elevated
    // view at ~23 m keeps the tractor/coupling visible without sacrificing road
    // preview.
    const desiredDistance=23.0;
    const desiredSide=0.0;
    const desiredHeight=13.8+Math.sin(truckLookPitch)*3.4;

    const desiredX=car.position.x-fx*desiredDistance+rx*desiredSide;
    const desiredZ=car.position.z-fz*desiredDistance+rz*desiredSide;
    let desiredY=car.position.y+desiredHeight;

    // Terrain-aware chase support. Do not let the long truck camera tunnel into
    // a hillside behind the combination on steep mountain roads.
    const wo=getWorldOffset?.()||{x:0,z:0};
    const ground=Number(groundHeightForWheel?.(
      desiredX+wo.x,
      desiredZ+wo.z,
      true
    ));
    if(Number.isFinite(ground))desiredY=Math.max(desiredY,ground+4.0);

    // Aim toward the tractor/cab instead of the trailer centre. With the higher
    // eye line this lets the camera look over the trailer roof and keeps the
    // tractor visible in the lower-middle of frame.
    const targetDistance=0.8;
    const desiredTargetX=car.position.x+fx*targetDistance;
    const desiredTargetZ=car.position.z+fz*targetDistance;
    const desiredTargetY=anchorY+1.25+Math.sin(truckLookPitch)*5.4;

    if(!truckCameraInitialized){
      truckCameraPos.copy(camera.position);
      truckCameraTarget.copy(camTarget);
      truckCameraInitialized=true;
    }

    // One owner, critically damped-ish exponential chase. This state is never
    // derived from camera.js' intermediate passenger-car position, preventing
    // the previous 10.5m <-> 25.5m controller fight.
    const posAlpha=1-Math.exp(-Math.max(.001,dt)*4.4);
    const targetAlpha=1-Math.exp(-Math.max(.001,dt)*6.2);
    truckCameraPos.x+=(desiredX-truckCameraPos.x)*posAlpha;
    truckCameraPos.y+=(desiredY-truckCameraPos.y)*posAlpha;
    truckCameraPos.z+=(desiredZ-truckCameraPos.z)*posAlpha;
    truckCameraTarget.x+=(desiredTargetX-truckCameraTarget.x)*targetAlpha;
    truckCameraTarget.y+=(desiredTargetY-truckCameraTarget.y)*targetAlpha;
    truckCameraTarget.z+=(desiredTargetZ-truckCameraTarget.z)*targetAlpha;

    camera.position.copy(truckCameraPos);
    camTarget.copy(truckCameraTarget);
    camera.lookAt(camTarget);
  }

  return {
    truckId,
    tractorWheels,
    isTruckProfile,
    setActive,
    resetPose,
    update,
    setBrakeLights,
    longitudinalScales,
    driveAccelScaleForSpeed,
    tractorYawScale,
    adjustCamera,
    get active(){return active;},
    get articulation(){return trailerState.articulation||0;},
    get jackknifeRatio(){return trailerState.jackknifeRatio||0;},
    get trailerHeading(){return trailerState.heading||0;},
    get totalMassKg(){return lastCombo.totalMassKg||0;},
    get glbReady(){return truckAssetReady;},
    get glbLoadError(){return truckAssetLoadError;}
  };
}
