import { buildWrxVisual } from './wrx-visual.js';

// World Drive V18E — local vehicle construction and local light presentation.
// Pure extraction from main.js: no intended gameplay or rendering change.
export function createVehicleVisualSystem({
  THREE,
  scene,
  vehicleSystem
}){
  const car=new THREE.Group();

  // ID.4-inspired compact electric crossover proportions// ID.4-inspired compact electric crossover proportions// ID.4-inspired compact electric crossover proportions — generic, no brand marks.
  const bodyMat=new THREE.MeshStandardMaterial({color:0xbfc4c9,metalness:.32,roughness:.30});
  const lowerMat=new THREE.MeshStandardMaterial({color:0x20252a,metalness:.10,roughness:.45});
  const glassMat=new THREE.MeshStandardMaterial({color:0x182936,metalness:.18,roughness:.18,transparent:true,opacity:.88});
  const lightMat=new THREE.MeshBasicMaterial({color:0xeaf5ff});
  const tailMat=new THREE.MeshBasicMaterial({color:0x8b1825});
  const brakeLampMat=new THREE.MeshBasicMaterial({color:0x8b1825});

  // Additional vehicle visuals register their own rear-lamp materials here so
  // updateBrakeLights() can drive every selectable car consistently.
  const extraBrakeLampMaterials=[];

  const wheelMat=new THREE.MeshStandardMaterial({color:0x111418,metalness:.25,roughness:.38});
  const rimMat=new THREE.MeshStandardMaterial({color:0xa7adb2,metalness:.65,roughness:.24});

  // Lower battery-floor / rocker area
  const floor=new THREE.Mesh(new THREE.BoxGeometry(1.98,.34,4.55),lowerMat);
  floor.position.y=.55;floor.castShadow=true;car.add(floor);

  // Main rounded crossover body
  const bodyGeom=new THREE.BoxGeometry(1.92,.70,4.38,3,2,5);
  const body= new THREE.Mesh(bodyGeom,bodyMat);
  body.position.y=.91;body.castShadow=true;car.add(body);

  // soften body silhouette by slightly scaling end vertices
  {
    const p=body.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const z=p.getZ(i), y=p.getY(i);
      const end=Math.min(1,Math.abs(z)/2.19);
      if(y>.05){
        p.setX(i,p.getX(i)*(1-.07*end));
        p.setY(i,p.getY(i)-.08*end);
      }
    }
    p.needsUpdate=true;body.geometry.computeVertexNormals();
  }

  // Sloped glasshouse / panoramic roof
  const cabinGeom=new THREE.BoxGeometry(1.68,.78,2.45,2,2,4);
  const cabin=new THREE.Mesh(cabinGeom,glassMat);
  cabin.position.set(0,1.48,-.18);
  cabin.castShadow=true;
  car.add(cabin);
  {
    const p=cabin.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const z=p.getZ(i), y=p.getY(i);
      if(y>0){
        const taper=.10+.12*Math.abs(z)/1.225;
        p.setX(i,p.getX(i)*(1-taper));
      }
      // more sloped windshield/front roof
      if(z>0)p.setY(i,p.getY(i)-.12*(z/1.225));
    }
    p.needsUpdate=true;cabin.geometry.computeVertexNormals();
  }

  // Body-colored hood and rear shoulders
  const hood=new THREE.Mesh(new THREE.BoxGeometry(1.72,.22,1.18),bodyMat);
  hood.position.set(0,1.18,1.50);hood.rotation.x=-.035;hood.castShadow=true;car.add(hood);

  const rearDeck=new THREE.Mesh(new THREE.BoxGeometry(1.76,.18,.80),bodyMat);
  rearDeck.position.set(0,1.16,-1.73);rearDeck.rotation.x=.025;rearDeck.castShadow=true;car.add(rearDeck);

  // Panoramic roof panel
  const roof=new THREE.Mesh(new THREE.BoxGeometry(1.34,.035,1.58),glassMat);
  roof.position.set(0,1.89,-.26);roof.rotation.x=-.015;car.add(roof);

  // Continuous front light bar + slim headlights
  const frontBar=new THREE.Mesh(new THREE.BoxGeometry(1.50,.055,.05),lightMat);
  frontBar.position.set(0,1.02,2.205);car.add(frontBar);
  for(const x of [-.68,.68]){
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(.34,.12,.055),lightMat);
    lamp.position.set(x,1.00,2.215);car.add(lamp);
  }

  // Rear red light bar
  const rearBar=new THREE.Mesh(new THREE.BoxGeometry(1.56,.08,.05),tailMat);
  rearBar.position.set(0,1.06,-2.205);car.add(rearBar);

  const brakeLamps=[];
  for(const x of [-.62,.62]){
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(.34,.15,.055),brakeLampMat);
    lamp.position.set(x,1.03,-2.215);
    car.add(lamp);brakeLamps.push(lamp);
  }
  let brakeLightLevel=0;
  const brakeBaseColor=new THREE.Color(0x8b1825);
  const brakeHotColor=new THREE.Color(0xff3048);
  function updateBrakeLights(dt,braking){
    const target=braking?1:0;

    brakeLightLevel+=
      (target-brakeLightLevel)*
      (1-Math.exp(-dt*(braking?14:7)));

    tailMat.color
      .copy(brakeBaseColor)
      .lerp(
        brakeHotColor,
        brakeLightLevel
      );

    brakeLampMat.color
      .copy(brakeBaseColor)
      .lerp(
        brakeHotColor,
        brakeLightLevel
      );

    for(const entry of extraBrakeLampMaterials){
      entry.material.color
        .copy(entry.baseColor)
        .lerp(
          entry.hotColor,
          brakeLightLevel
        );
    }
  }

  // Black front/rear lower valances
  const frontValance=new THREE.Mesh(new THREE.BoxGeometry(1.72,.24,.18),lowerMat);
  frontValance.position.set(0,.66,2.18);car.add(frontValance);
  const rearValance=new THREE.Mesh(new THREE.BoxGeometry(1.72,.23,.18),lowerMat);
  rearValance.position.set(0,.66,-2.18);car.add(rearValance);

  // Wheel arches / wheels
  // Front wheels use a steering pivot group. Tire/rim spin INSIDE the pivot,
  // so wheel roll and steering never fight each other through Euler rotations.
  const wheels=[];
  const frontWheelPivots=[];
  for(const x of [-.86,.86])for(const z of [-1.22,1.22]){
    const pivot=new THREE.Group();
    pivot.position.set(x,0,z);
    car.add(pivot);

    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.27,20),wheelMat);
    tire.rotation.z=Math.PI/2;
    tire.castShadow=true;
    pivot.add(tire);

    const rim=new THREE.Mesh(new THREE.CylinderGeometry(.235,.235,.285,10),rimMat);
    rim.rotation.z=Math.PI/2;
    pivot.add(rim);

    wheels.push({
      pivot,
      tire,
      rim,
      front:z>0,
      visualCamber:0
    });
    if(z>0)frontWheelPivots.push(pivot);
  }

  // Subtle wheel-arch trim
  for(const x of [-.83,.83])for(const z of [-1.22,1.22]){
    const arch=new THREE.Mesh(new THREE.TorusGeometry(.41,.05,8,18,Math.PI),lowerMat);
    arch.rotation.y=Math.PI/2;
    arch.rotation.z=(x<0?Math.PI/2:-Math.PI/2);
    arch.position.set(x,.59,z);
    car.add(arch);
  }

  // Side mirrors
  for(const x of [-1.02,1.02]){
    const mirror=new THREE.Mesh(new THREE.BoxGeometry(.16,.14,.28),lowerMat);
    mirror.position.set(x,1.46,.53);mirror.castShadow=true;car.add(mirror);
  }

  // Separate sprung body from unsprung wheel assemblies.
  // Everything except wheel pivots becomes the sprung visual body.
  const bodyGroup=new THREE.Group();
  const wheelPivotSet=new Set(wheels.map(w=>w.pivot));
  const sprungChildren=car.children.filter(c=>!wheelPivotSet.has(c));
  for(const child of sprungChildren){
    car.remove(child);
    bodyGroup.add(child);
  }
  car.add(bodyGroup);
  // Lower the sprung body relative to wheel centers for compact-crossover proportions.
  // Keeps a modest wheel-arch gap instead of an off-road / lifted stance.
  bodyGroup.position.y=-.22;

  // Tag the original visual as ID4 before adding other vehicle models.
  for(const child of bodyGroup.children){
    child.userData.vehicleId='id4';
  }
  for(const wheel of wheels){
    wheel.vehicleId='id4';
    wheel.pivot.userData.vehicleId='id4';
  }


  function makeVehicleMaterial(color,metalness=.25,roughness=.34){
    return new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness
    });
  }

  function addVehicleMesh(group,geometry,material,position,rotation=null){
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(...position);
    if(rotation)mesh.rotation.set(...rotation);
    mesh.castShadow=true;
    mesh.userData.vehicleId=group.userData.vehicleId;
    group.add(mesh);
    return mesh;
  }

  function buildRoadCarVisual({
    id,
    color,
    length=4.55,
    width=1.82,
    height=.66,
    cabinLength=2.25,
    cabinHeight=.66,
    wheelbase=2.68,
    wheelRadius=.35,
    blackRoof=false,
    sport=false,
    compact=false
  }){
    const group=new THREE.Group();
    group.userData.vehicleId=id;
    bodyGroup.add(group);

    const paint=makeVehicleMaterial(color,.34,.27);
    const dark=makeVehicleMaterial(0x11161b,.15,.42);
    const glass=makeVehicleMaterial(0x152633,.18,.16);
    const lamp=new THREE.MeshBasicMaterial({color:0xeaf5ff});

    const rearBaseColor=
      new THREE.Color(0x861520);

    const rearHotColor=
      new THREE.Color(0xff3048);

    const red=
      new THREE.MeshBasicMaterial({
        color:rearBaseColor.clone()
      });

    extraBrakeLampMaterials.push({
      vehicleId:id,
      material:red,
      baseColor:rearBaseColor,
      hotColor:rearHotColor
    });

    addVehicleMesh(group,new THREE.BoxGeometry(width,.24,length),dark,[0,.61,0]);
    addVehicleMesh(group,new THREE.BoxGeometry(width*.97,height,length*.94,3,2,5),paint,[0,.94,0]);

    const cabin=addVehicleMesh(
      group,
      new THREE.BoxGeometry(width*.82,cabinHeight,cabinLength,2,2,4),
      blackRoof?dark:glass,
      [0,1.46,-.12]
    );

    const cp=cabin.geometry.attributes.position;
    for(let i=0;i<cp.count;i++){
      const z=cp.getZ(i);
      const y=cp.getY(i);
      if(y>0)cp.setX(i,cp.getX(i)*(.88-.06*Math.abs(z)/(cabinLength*.5)));
    }
    cp.needsUpdate=true;
    cabin.geometry.computeVertexNormals();

    addVehicleMesh(group,new THREE.BoxGeometry(width*.82,.18,length*.24),paint,[0,1.18,length*.34],[-.04,0,0]);
    addVehicleMesh(group,new THREE.BoxGeometry(width*.85,.14,length*.16),paint,[0,1.16,-length*.40],[.03,0,0]);

    if(blackRoof){
      addVehicleMesh(group,new THREE.BoxGeometry(width*.62,.04,cabinLength*.58),glass,[0,1.81,-.18]);
    }

    if(sport){
      addVehicleMesh(group,new THREE.BoxGeometry(width*.78,.06,.18),dark,[0,1.26,-length*.49]);
    }

    for(const x of [-width*.34,width*.34]){
      addVehicleMesh(group,new THREE.BoxGeometry(width*.18,.10,.05),lamp,[x,1.00,length*.475]);
      addVehicleMesh(group,new THREE.BoxGeometry(width*.20,.12,.05),red,[x,1.00,-length*.475]);
    }

    const localWheels=[];
    for(const x of [-width*.47,width*.47]){
      for(const z of [-wheelbase*.5,wheelbase*.5]){
        const pivot=new THREE.Group();
        pivot.position.set(x,0,z);
        pivot.userData.vehicleId=id;
        car.add(pivot);

        const tire=new THREE.Mesh(
          new THREE.CylinderGeometry(wheelRadius,wheelRadius,.25,20),
          wheelMat
        );
        tire.rotation.z=Math.PI/2;
        tire.castShadow=true;
        pivot.add(tire);

        const rim=new THREE.Mesh(
          new THREE.CylinderGeometry(wheelRadius*.61,wheelRadius*.61,.265,10),
          rimMat
        );
        rim.rotation.z=Math.PI/2;
        pivot.add(rim);

        const wheel={
          pivot,tire,rim,
          front:z>0,
          visualCamber:0,
          vehicleId:id
        };
        wheels.push(wheel);
        localWheels.push(wheel);
        if(z>0)frontWheelPivots.push(pivot);
      }
    }

    return {group,wheels:localWheels};
  }

  function buildCountach80Visual(){
    const id='countach_80';
    const group=new THREE.Group();
    group.userData.vehicleId=id;
    bodyGroup.add(group);

    const paint=makeVehicleMaterial(0xd3171f,.38,.24);
    const paintDark=makeVehicleMaterial(0xa60f18,.34,.28);
    const black=makeVehicleMaterial(0x0d1013,.18,.34);
    const glass=makeVehicleMaterial(0x101d27,.20,.13);
    const silver=makeVehicleMaterial(0xaab0b4,.72,.22);
    const lamp=new THREE.MeshBasicMaterial({color:0xf4f3df});

    const rearBaseColor=new THREE.Color(0x7d1119);
    const rearHotColor=new THREE.Color(0xff2638);
    const rearLamp=new THREE.MeshBasicMaterial({
      color:rearBaseColor.clone()
    });

    extraBrakeLampMaterials.push({
      vehicleId:id,
      material:rearLamp,
      baseColor:rearBaseColor,
      hotColor:rearHotColor
    });

    // Low, wide lower tub.
    addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.96,.24,4.18),
      black,
      [0,.42,0]
    );

    // Main wedge. Front vertices are lowered and narrowed to create the
    // unmistakable Countach-like nose without importing an external model.
    const wedge=addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.92,.42,4.05,4,2,6),
      paint,
      [0,.62,.02]
    );

    {
      const pos=wedge.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        const z=pos.getZ(i);
        const y=pos.getY(i);
        const front=Math.max(0,Math.min(1,(z+.15)/2.18));
        const rear=Math.max(0,Math.min(1,(-z-.45)/1.75));

        if(y>0){
          pos.setY(
            i,
            y-front*.17-rear*.035
          );
        }

        pos.setX(
          i,
          pos.getX(i)*(1-front*.065)
        );
      }
      pos.needsUpdate=true;
      wedge.geometry.computeVertexNormals();
    }

    // Sharp front wedge / bumper lip.
    const nose=addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.86,.18,.74),
      paint,
      [0,.59,1.86],
      [-.105,0,0]
    );

    // Slim black front air dam.
    addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.82,.13,.16),
      black,
      [0,.34,2.03]
    );

    // Angular glasshouse. The top is heavily tapered for the classic
    // trapezoidal cabin profile.
    const cabin=addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.54,.50,1.72,2,2,4),
      glass,
      [0,.91,-.16],
      [.015,0,0]
    );

    {
      const pos=cabin.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        const y=pos.getY(i);
        const z=pos.getZ(i);
        if(y>0){
          pos.setX(i,pos.getX(i)*.72);
          if(z>0)pos.setZ(i,z*.84);
        }
      }
      pos.needsUpdate=true;
      cabin.geometry.computeVertexNormals();
    }

    // Red roof cap and A/C-pillar shoulders keep the car visibly red from above.
    addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.02,.055,1.03),
      paintDark,
      [0,1.18,-.20]
    );

    for(const x of [-.78,.78]){
      // Deep NACA/side-intake blocks.
      addVehicleMesh(
        group,
        new THREE.BoxGeometry(.16,.32,.82),
        black,
        [x,.70,-.88],
        [0,0,x<0?-.08:.08]
      );

      // Door sill / lower side strake.
      addVehicleMesh(
        group,
        new THREE.BoxGeometry(.12,.16,1.55),
        paintDark,
        [x*.99,.47,-.02]
      );

      // Small angular mirrors.
      addVehicleMesh(
        group,
        new THREE.BoxGeometry(.20,.11,.28),
        black,
        [x*1.13,.90,.38],
        [0,x<0?-.18:.18,0]
      );
    }

    // Pop-up-headlight era housings: kept down in daylight, with slim visible
    // front lamps so World Drive's automatic projected beams still read well.
    for(const x of [-.56,.56]){
      addVehicleMesh(
        group,
        new THREE.BoxGeometry(.42,.075,.42),
        paintDark,
        [x,.68,1.59],
        [-.10,0,0]
      );
      addVehicleMesh(
        group,
        new THREE.BoxGeometry(.28,.075,.055),
        lamp,
        [x,.59,2.055]
      );
    }

    // Rear deck with black engine louvers.
    addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.77,.18,1.17),
      paint,
      [0,.69,-1.45],
      [.035,0,0]
    );

    for(let z=-1.17;z>=-1.77;z-=.14){
      addVehicleMesh(
        group,
        new THREE.BoxGeometry(1.22,.045,.075),
        black,
        [0,.80,z]
      );
    }

    // Wide rear fascia and paired rectangular lamps.
    addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.82,.28,.16),
      black,
      [0,.51,-2.02]
    );

    for(const x of [-.56,.56]){
      addVehicleMesh(
        group,
        new THREE.BoxGeometry(.49,.18,.055),
        rearLamp,
        [x,.57,-2.115]
      );
    }

    // Iconic 1980s high rear wing.
    for(const x of [-.63,.63]){
      addVehicleMesh(
        group,
        new THREE.BoxGeometry(.075,.45,.12),
        black,
        [x,.91,-1.64],
        [-.07,0,0]
      );
    }

    addVehicleMesh(
      group,
      new THREE.BoxGeometry(1.73,.075,.42),
      paintDark,
      [0,1.10,-1.72],
      [-.05,0,0]
    );

    // Rear exhaust pair.
    for(const x of [-.20,.20]){
      const exhaust=new THREE.Mesh(
        new THREE.CylinderGeometry(.055,.055,.20,10),
        silver
      );
      exhaust.rotation.x=Math.PI/2;
      exhaust.position.set(x,.48,-2.10);
      exhaust.castShadow=true;
      exhaust.userData.vehicleId=id;
      group.add(exhaust);
    }

    // Period-correct staggered wheel stance: slightly wider rear track and tires.
    const localWheels=[];
    const axle=[
      {z:-1.225,x:.91,r:.38,width:.34,front:false},
      {z: 1.225,x:.86,r:.36,width:.29,front:true}
    ];

    // Side first, axle second preserves World Drive's expected order:
    // rear-left, front-left, rear-right, front-right.
    for(const side of [-1,1]){
      for(const spec of axle){
        const pivot=new THREE.Group();
        pivot.position.set(spec.x*side,0,spec.z);
        pivot.userData.vehicleId=id;
        car.add(pivot);

        const tire=new THREE.Mesh(
          new THREE.CylinderGeometry(spec.r,spec.r,spec.width,22),
          wheelMat
        );
        tire.rotation.z=Math.PI/2;
        tire.castShadow=true;
        pivot.add(tire);

        const rim=new THREE.Mesh(
          new THREE.CylinderGeometry(spec.r*.57,spec.r*.57,spec.width+.018,12),
          silver
        );
        rim.rotation.z=Math.PI/2;
        pivot.add(rim);

        // Small dark center gives the wheel a more period-correct deep-dish look.
        const hub=new THREE.Mesh(
          new THREE.CylinderGeometry(spec.r*.18,spec.r*.18,spec.width+.028,12),
          black
        );
        hub.rotation.z=Math.PI/2;
        pivot.add(hub);

        const wheel={
          pivot,
          tire,
          rim,
          front:spec.front,
          visualCamber:0,
          vehicleId:id
        };

        wheels.push(wheel);
        localWheels.push(wheel);
        if(spec.front)frontWheelPivots.push(pivot);
      }
    }

    return {group,wheels:localWheels};
  }

  function buildF12010Visual(){
    const id='f1_2010';
    const group=new THREE.Group();
    group.userData.vehicleId=id;
    bodyGroup.add(group);

    const red=makeVehicleMaterial(0xb8141b,.34,.25);
    const white=makeVehicleMaterial(0xf1f1ed,.28,.30);
    const carbon=makeVehicleMaterial(0x101214,.12,.30);
    const glass=makeVehicleMaterial(0x111820,.18,.16);

    const f1BrakeBase=
      new THREE.Color(0x7f1018);

    const f1BrakeHot=
      new THREE.Color(0xff2638);

    const f1BrakeMat=
      new THREE.MeshBasicMaterial({
        color:f1BrakeBase.clone()
      });

    extraBrakeLampMaterials.push({
      vehicleId:id,
      material:f1BrakeMat,
      baseColor:f1BrakeBase,
      hotColor:f1BrakeHot
    });

    addVehicleMesh(group,new THREE.BoxGeometry(.72,.28,4.55),red,[0,.57,.05]);
    addVehicleMesh(group,new THREE.BoxGeometry(1.18,.24,1.45),red,[0,.68,-.28]);
    addVehicleMesh(group,new THREE.BoxGeometry(.54,.38,1.12),white,[0,.90,-.25]);
    addVehicleMesh(group,new THREE.BoxGeometry(.46,.25,.54),glass,[0,1.05,-.08]);
    addVehicleMesh(group,new THREE.BoxGeometry(1.72,.08,.38),carbon,[0,.42,2.05]);
    addVehicleMesh(group,new THREE.BoxGeometry(1.48,.10,.34),carbon,[0,.92,-2.02]);
    addVehicleMesh(group,new THREE.BoxGeometry(.10,.55,.12),carbon,[-.62,.68,-1.94]);
    addVehicleMesh(group,new THREE.BoxGeometry(.10,.55,.12),carbon,[.62,.68,-1.94]);

    // Central F1 rear rain/brake light.
    addVehicleMesh(
      group,
      new THREE.BoxGeometry(.18,.10,.06),
      f1BrakeMat,
      [0,.61,-2.28]
    );

    const localWheels=[];
    for(const x of [-.88,.88]){
      for(const z of [-1.48,1.48]){
        const pivot=new THREE.Group();
        pivot.position.set(x,.04,z);
        pivot.userData.vehicleId=id;
        car.add(pivot);
        const tire=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.34,20),wheelMat);
        tire.rotation.z=Math.PI/2;tire.castShadow=true;pivot.add(tire);
        const rim=new THREE.Mesh(new THREE.CylinderGeometry(.20,.20,.35,12),rimMat);
        rim.rotation.z=Math.PI/2;pivot.add(rim);
        const wheel={pivot,tire,rim,front:z>0,visualCamber:0,vehicleId:id};
        wheels.push(wheel);localWheels.push(wheel);
        if(z>0)frontWheelPivots.push(pivot);
      }
    }
    return {group,wheels:localWheels};
  }

  const civicVisual=buildRoadCarVisual({
    id:'civic',
    color:0x080a0c,
    length:4.58,
    width:1.80,
    height:.61,
    cabinLength:2.34,
    cabinHeight:.62,
    wheelbase:2.70,
    wheelRadius:.34,
    sport:true
  });

  const sonataVisual=buildRoadCarVisual({
    id:'sonata',
    color:0xf2f3f1,
    length:4.86,
    width:1.86,
    height:.62,
    cabinLength:2.48,
    cabinHeight:.64,
    wheelbase:2.80,
    wheelRadius:.35,
    blackRoof:true,
    sport:true
  });

  const i3Visual=buildRoadCarVisual({
    id:'i3_2017',
    color:0xf1f1ed,
    length:4.00,
    width:1.78,
    height:.78,
    cabinLength:2.28,
    cabinHeight:.78,
    wheelbase:2.57,
    wheelRadius:.36,
    blackRoof:true,
    compact:true
  });

  const f12010Visual=buildF12010Visual();
  const countach80Visual=buildCountach80Visual();

  const wrxVisual=buildWrxVisual({
    THREE,
    car,
    bodyGroup,
    wheels,
    brakeLampMaterial:brakeLampMat
  });

  function applyVehicleVisualProfile(){
    const id=vehicleSystem.activeId;

    for(const child of bodyGroup.children){
      const vehicleId=child.userData?.vehicleId;
      if(vehicleId){
        child.visible=vehicleId===id;
      }
    }

    for(const wheel of wheels){
      if(wheel.vehicleId){
        wheel.pivot.visible=wheel.vehicleId===id;
      }
    }

    const stance={
      id4:-.22,
      wrx:-.31,
      civic:-.30,
      sonata:-.30,
      f1_2010:-.38,
      countach_80:-.33,
      i3_2017:-.24
    };

    bodyGroup.position.y=
      stance[id]??-.28;
  }

  applyVehicleVisualProfile();

  // ----- Automatic vehicle headlights -----
  // Vehicle-agnostic rig: attached to the sprung body so the beams follow
  // pitch/roll/camber, while remaining visible for both ID4 and WRX visuals.
  const headlightRig=new THREE.Group();
  headlightRig.name='vehicle-headlights';
  bodyGroup.add(headlightRig);

  const headlightGlowMat=new THREE.MeshBasicMaterial({
    color:0xf3f7ff,
    transparent:true,
    opacity:0,
    depthWrite:false
  });

  const headlightLights=[];
  const headlightGlows=[];

  for(const x of [-.64,.64]){
    // Small visible LED/lens glow.
    const glow=new THREE.Mesh(
      new THREE.SphereGeometry(.085,10,6),
      headlightGlowMat.clone()
    );
    glow.position.set(x,1.02,2.25);
    glow.scale.set(1.45,.65,.42);
    glow.renderOrder=6;
    headlightRig.add(glow);
    headlightGlows.push(glow);

    // Real forward illumination. Shadows are intentionally disabled:
    // two shadow-casting spotlights would be unnecessarily expensive.
    const light=new THREE.SpotLight(
      0xf4f8ff,
      0,
      95,
      Math.PI/7.5,
      .58,
      1.55
    );

    light.position.set(x,1.02,2.18);
    light.castShadow=false;

    const target=new THREE.Object3D();
    target.position.set(
      x*.30,
      .30,
      72
    );

    headlightRig.add(light);
    headlightRig.add(target);
    light.target=target;

    headlightLights.push(light);
  }

  let headlightLevel=0;

  function smoothstep01(value){
    const t=Math.max(0,Math.min(1,value));
    return t*t*(3-2*t);
  }

  function updateAutomaticHeadlights(daylight){
    // Countach sits dramatically lower than the other road cars. Keep the
    // existing vehicle-agnostic rig, but move its lamps down to the wedge nose
    // only while this vehicle is selected.
    const countachMount=
      vehicleSystem.activeId==='countach_80';

    for(let i=0;i<headlightLights.length;i++){
      const side=i===0?-1:1;
      const x=(countachMount?.56:.64)*side;
      const y=countachMount?.59:1.02;
      const z=countachMount?2.04:2.18;

      headlightLights[i].position.set(x,y,z);
      headlightLights[i].target.position.set(
        x*.30,
        countachMount?.16:.30,
        72
      );

      headlightGlows[i].position.set(
        x,
        y,
        z+.07
      );
    }

    // Full headlights at night and around civil twilight.
    // Fade out gradually once daylight becomes strong enough.
    const duskFactor=
      1-smoothstep01(
        (daylight-.10)/.24
      );

    headlightLevel=duskFactor;

    for(const light of headlightLights){
      light.intensity=
        185*headlightLevel;
    }

    for(const glow of headlightGlows){
      glow.material.opacity=
        .12+
        .88*headlightLevel;
      glow.visible=
        headlightLevel>.015;
    }
  }

  


  // Slightly larger crossover scale than old sedan-like box
  car.scale.set(.80,.80,.80);
  scene.add(car);


  function activeVehicleWheels(){
    return wheels.filter(
      wheel=>!wheel.vehicleId||wheel.vehicleId===vehicleSystem.activeId
    );
  }

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
    get brakeLightLevel(){
      return brakeLightLevel;
    },
    get headlightLevel(){
      return headlightLevel;
    }
  };
}
