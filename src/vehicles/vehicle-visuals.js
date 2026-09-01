import {VEHICLE_RENDER_ROOT_SCALE,vehicleBodyStance} from './vehicle-render-contract.js';

// World Drive V21.25 cleanup — GLB-era vehicle visual infrastructure.
//
// V21.24.94 still built complete procedural passenger-car bodies even though
// every selectable passenger/race car now has its own authored GLB system.
// Those legacy bodies were normally hidden at runtime, but they duplicated
// geometry, materials, lights and wheel visuals and could conflict with the GLB
// ownership logic. V21.25 keeps only the shared car root, sprung body group,
// invisible suspension/physics wheel probes and the generic headlight/brake API.
export function createVehicleVisualSystem({
  THREE,
  scene,
  vehicleSystem
}){
  const car=new THREE.Group();
  const bodyGroup=new THREE.Group();
  car.add(bodyGroup);

  const tailMat=new THREE.MeshBasicMaterial({color:0x8b1825});
  const brakeLampMat=new THREE.MeshBasicMaterial({color:0x8b1825});
  const extraBrakeLampMaterials=[];

  let brakeLightLevel=0;
  const brakeBaseColor=new THREE.Color(0x8b1825);
  const brakeHotColor=new THREE.Color(0xff3048);

  function updateBrakeLights(dt,braking){
    const target=braking?1:0;
    brakeLightLevel+=(target-brakeLightLevel)*(1-Math.exp(-dt*(braking?14:7)));
    tailMat.color.copy(brakeBaseColor).lerp(brakeHotColor,brakeLightLevel);
    brakeLampMat.color.copy(brakeBaseColor).lerp(brakeHotColor,brakeLightLevel);
    for(const entry of extraBrakeLampMaterials){
      entry.material.color.copy(entry.baseColor).lerp(entry.hotColor,brakeLightLevel);
    }
  }

  const wheels=[];
  const probeMaterial=new THREE.MeshBasicMaterial({color:0x000000});

  function addWheelProbe({vehicleId,x,y=0,z,radius,width=.27,front=z>0}){
    const pivot=new THREE.Group();
    pivot.position.set(x,y,z);
    pivot.userData.vehicleId=vehicleId;
    car.add(pivot);

    const tire=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,8),probeMaterial);
    tire.rotation.z=Math.PI/2;
    tire.visible=false;
    pivot.add(tire);

    const rim=new THREE.Mesh(new THREE.CylinderGeometry(radius*.60,radius*.60,width+.01,8),probeMaterial);
    rim.rotation.z=Math.PI/2;
    rim.visible=false;
    pivot.add(rim);

    const wheel={pivot,tire,rim,front:!!front,visualCamber:0,vehicleId};
    wheels.push(wheel);
    return wheel;
  }

  function addFourWheelProbes({vehicleId,x,z,radius,width=.27,y=0}){
    for(const side of [-1,1]){
      addWheelProbe({vehicleId,x:x*side,y,z:-z,radius,width,front:false});
      addWheelProbe({vehicleId,x:x*side,y,z,radius,width,front:true});
    }
  }

  addFourWheelProbes({vehicleId:'id4',x:.86,z:1.22,radius:.38,width:.27});
  addFourWheelProbes({vehicleId:'wrx',x:.86,z:1.25,radius:.365,width:.285,y:-.02});
  addFourWheelProbes({vehicleId:'civic',x:1.80*.47,z:2.70*.5,radius:.34,width:.25});
  addFourWheelProbes({vehicleId:'sonata',x:1.86*.47,z:2.80*.5,radius:.35,width:.25});
  addFourWheelProbes({vehicleId:'i3_2017',x:1.78*.47,z:2.57*.5,radius:.36,width:.25});
  addFourWheelProbes({vehicleId:'f1_2010',x:.88,z:1.48,radius:.39,width:.34,y:.04});

  for(const side of [-1,1]){
    addWheelProbe({vehicleId:'countach_80',x:.91*side,z:-1.225,radius:.38,width:.34,front:false});
    addWheelProbe({vehicleId:'countach_80',x:.86*side,z:1.225,radius:.36,width:.29,front:true});
  }

  function applyVehicleVisualProfile(){
    const id=vehicleSystem.activeId;
    for(const wheel of wheels)wheel.pivot.visible=wheel.vehicleId===id;
    bodyGroup.position.y=vehicleBodyStance(id);
  }

  applyVehicleVisualProfile();

  const headlightRig=new THREE.Group();
  headlightRig.name='vehicle-headlights';
  bodyGroup.add(headlightRig);

  const headlightGlowMat=new THREE.MeshBasicMaterial({color:0xf3f7ff,transparent:true,opacity:0,depthWrite:false});
  const headlightLights=[];
  const headlightGlows=[];

  for(const x of [-.64,.64]){
    const glow=new THREE.Mesh(new THREE.SphereGeometry(.085,10,6),headlightGlowMat.clone());
    glow.position.set(x,1.02,2.25);
    glow.scale.set(1.45,.65,.42);
    glow.renderOrder=6;
    headlightRig.add(glow);
    headlightGlows.push(glow);

    const light=new THREE.SpotLight(0xf4f8ff,0,95,Math.PI/7.5,.58,1.55);
    light.position.set(x,1.02,2.18);
    light.castShadow=false;
    const target=new THREE.Object3D();
    target.position.set(x*.30,.30,72);
    headlightRig.add(light);
    headlightRig.add(target);
    light.target=target;
    headlightLights.push(light);
  }

  let headlightLevel=0;
  function smoothstep01(value){const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);}

  function updateAutomaticHeadlights(daylight){
    const countachMount=vehicleSystem.activeId==='countach_80';
    for(let i=0;i<headlightLights.length;i++){
      const side=i===0?-1:1;
      const x=(countachMount?.56:.64)*side;
      const y=countachMount?.59:1.02;
      const z=countachMount?2.04:2.18;
      headlightLights[i].position.set(x,y,z);
      headlightLights[i].target.position.set(x*.30,countachMount?.16:.30,72);
      headlightGlows[i].position.set(x,y,z+.07);
    }

    const duskFactor=1-smoothstep01((daylight-.10)/.24);
    headlightLevel=duskFactor;
    for(const light of headlightLights)light.intensity=185*headlightLevel;
    for(const glow of headlightGlows){
      glow.material.opacity=.12+.88*headlightLevel;
      glow.visible=headlightLevel>.015;
    }
  }

  // Shared with M4 remote authored visuals. Presentation/support math continues
  // to use unscaled probe coordinates, exactly as it historically did locally.
  car.scale.set(VEHICLE_RENDER_ROOT_SCALE,VEHICLE_RENDER_ROOT_SCALE,VEHICLE_RENDER_ROOT_SCALE);
  scene.add(car);

  function activeVehicleWheels(){return wheels.filter(wheel=>wheel.vehicleId===vehicleSystem.activeId);}

  return {
    car,
    bodyGroup,
    wheels,
    tailMat,
    brakeLampMat,
    extraBrakeLampMaterials,
    updateBrakeLights,
    updateAutomaticHeadlights,
    applyVehicleVisualProfile,
    activeVehicleWheels,
    get brakeLightLevel(){return brakeLightLevel;},
    get headlightLevel(){return headlightLevel;}
  };
}
