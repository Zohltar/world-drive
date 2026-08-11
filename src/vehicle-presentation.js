// World Drive V18E — vehicle presentation state.
// Suspension/body pose, wheel presentation and projected contact shadow.
export function createVehiclePresentation({
  THREE,
  scene,
  car,
  bodyGroup,
  wheels,
  vehicleSystem,
  sun,
  roadSurfaceAt,
  terrainAbs,
  groundHeightForWheel,
  activeVehicleWheels,
  getDrivingState,
  ROAD_WHEEL_CONTACT_HALF_WIDTH,
  WHEEL_RADIUS,
  TIRE_HALF_WIDTH,
  TIRE_VISUAL_CLEARANCE
}){
  // ----- Professional projected vehicle shadow -----
  // A single procedural shader approximates soft chassis occlusion + four tire
  // contacts + a subtle sun-direction tail. It is fully local: it does NOT alter
  // the scene sun, hemisphere light or time-of-day illumination.
  const vehicleShadowUniforms={
    uOpacity:{value:.72},
    uSoftness:{value:1.0},
    uSunTail:{value:new THREE.Vector2(.12,-.22)},
    uHeightFade:{value:1.0},
    uVehicleAspect:{value:2.05}
  };

  const vehicleShadowMaterial=
    new THREE.ShaderMaterial({
      uniforms:vehicleShadowUniforms,
      transparent:true,
      depthWrite:false,
      depthTest:true,
      side:THREE.DoubleSide,
      blending:THREE.NormalBlending,

      vertexShader:`
        varying vec2 vUv;

        void main(){
          vUv=uv;
          gl_Position=
            projectionMatrix*
            modelViewMatrix*
            vec4(position,1.0);
        }
      `,

      fragmentShader:`
        precision highp float;

        varying vec2 vUv;

        uniform float uOpacity;
        uniform float uSoftness;
        uniform vec2 uSunTail;
        uniform float uHeightFade;
        uniform float uVehicleAspect;

        float ellipse(vec2 p,vec2 radius,float feather){
          vec2 q=p/radius;
          float d=length(q);
          return 1.0-smoothstep(
            1.0-feather,
            1.0,
            d
          );
        }

        float boxSoft(vec2 p,vec2 halfSize,float radius){
          vec2 q=abs(p)-halfSize+radius;
          float outside=length(max(q,0.0))-radius;
          float inside=min(max(q.x,q.y),0.0);
          float d=outside+inside;

          return 1.0-smoothstep(
            -.10,
            .34*uSoftness,
            d
          );
        }

        float hash21(vec2 p){
          p=fract(p*vec2(123.34,345.45));
          p+=dot(p,p+34.345);
          return fract(p.x*p.y);
        }

        void main(){
          // Vehicle-local projected coordinates:
          // x = left/right, y = front/rear.
          vec2 p=(vUv-.5)*2.0;

          // Main underbody shape. Two overlapping rounded masses avoid the
          // obvious "perfect oval" look of the previous approach.
          float chassis=
            boxSoft(
              p+vec2(0.0,.02),
              vec2(.45,.70),
              .28
            );

          float cabinMass=
            ellipse(
              p+vec2(0.0,.06),
              vec2(.50,.74),
              .27
            );

          float body=
            max(
              chassis*.90,
              cabinMass*.68
            );

          // Stronger ambient occlusion immediately below the center of the car.
          float core=
            ellipse(
              p+vec2(0.0,.02),
              vec2(.37,.57),
              .30
            );

          // Single continuous vehicle silhouette only.
          // No separate tire-contact shadows: the chassis/core masses provide
          // all near-ground occlusion.

          // Broad directional penumbra. This is deliberately subtle: it hints at
          // light direction without pretending to be a full geometry shadow map.
          vec2 tailP=
            p-
            uSunTail;

          float tail=
            ellipse(
              tailP,
              vec2(.60,.82),
              .34
            );

          // Ground-contact weighting:
          // one continuous body silhouette with a darker central contact core
          // and only a subtle directional penumbra.
          float alpha=
            body*.56+
            core*.34+
            tail*.10;

          // Avoid perfectly smooth computer-generated edges.
          float n=
            hash21(
              gl_FragCoord.xy*.35
            )-.5;

          alpha+=
            n*.018*alpha;

          // Fade the very outer fringe to remove any visible rectangular quad.
          vec2 edgeUv=
            abs(vUv-.5)*2.0;

          float edgeFade=
            1.0-
            smoothstep(
              .82,
              1.0,
              max(edgeUv.x,edgeUv.y)
            );

          alpha*=
            edgeFade*
            uOpacity*
            uHeightFade;

          if(alpha<.006){
            discard;
          }

          gl_FragColor=
            vec4(
              0.0,
              0.0,
              0.0,
              clamp(alpha,0.0,.82)
            );
        }
      `
    });

  const vehicleShadowRig=
    new THREE.Group();

  vehicleShadowRig.name=
    'vehicle-projected-shadow-rig';

  // Yaw first, then local pitch/roll. The child plane keeps its own permanent
  // ground-facing rotation, so updating the rig can never stand the shadow upright.
  vehicleShadowRig.rotation.order='YXZ';

  const vehicleShadow=
    new THREE.Mesh(
      new THREE.PlaneGeometry(
        3.35,
        6.25,
        1,
        1
      ),
      vehicleShadowMaterial
    );

  vehicleShadow.name=
    'vehicle-projected-contact-shadow';

  // PlaneGeometry is created in XY. Rotate it once into the rig's local XZ plane.
  // IMPORTANT: never overwrite this rotation in updateContactShadow().
  vehicleShadow.rotation.x=-Math.PI/2;
  vehicleShadow.renderOrder=4;

  vehicleShadowRig.add(vehicleShadow);
  scene.add(vehicleShadowRig);



  let suspensionRoll=0;
  let suspensionPitch=0;
  let suspensionHeave=0;
  let corneringVisualYaw=0;
  let wheelPlaneRoll=0;
  let wheelPlanePitch=0;
  let wheelContactSamples=[];

  function updateSuspensionVisuals(dt,onRoad,currentSteerAngle){
    const {heading,absX,absZ,speed,longitudinalAccel,VEHICLE}=getDrivingState();
    const c=Math.cos(heading),sn=Math.sin(heading);

    const suspensionWheels=activeVehicleWheels();
    if(suspensionWheels.length!==4){
      console.warn(
        'Vehicle wheel configuration invalid',
        vehicleSystem.activeId,
        suspensionWheels.length
      );
      return;
    }

    // Pass 1: sample the support surface independently under each wheel.
    const samples=[];

    for(const w of suspensionWheels){
      const lx=w.pivot.position.x;
      const lz=w.pivot.position.z;

      const wx=absX + lx*c + lz*sn;
      const wz=absZ - lx*sn + lz*c;

      let ground;

      if(onRoad){
        const roadSample=roadSurfaceAt(wx,wz);
        if(
          roadSample&&
          Math.abs(roadSample.lateral)<ROAD_WHEEL_CONTACT_HALF_WIDTH
        ){
          ground=roadSample.y;
        }
      }

      if(!Number.isFinite(ground)){
        ground=groundHeightForWheel(wx,wz);
      }

      const tireWidth=
        (
          Number(w.tire?.geometry?.parameters?.height)||
          .27
        )*
        (Number(car.scale?.x)||1);

      samples.push({
        w,
        ground,
        absX:wx,
        absZ:wz,
        front:!!w.front,
        width:tireWidth
      });
    }

    if(samples.length!==4){
      wheelContactSamples=[];
      return;
    }

    wheelContactSamples=samples.map(sample=>({
      absX:sample.absX,
      absZ:sample.absZ,
      ground:sample.ground,
      front:sample.front,
      width:sample.width
    }));

    const contacts=samples.map(s=>s.ground);

    // wheels order: rearL, frontL, rearR, frontR
    const rearL=contacts[0],frontL=contacts[1],rearR=contacts[2],frontR=contacts[3];
    const frontAvg=(frontL+frontR)*.5;
    const rearAvg=(rearL+rearR)*.5;
    const leftAvg=(frontL+rearL)*.5;
    const rightAvg=(frontR+rearR)*.5;
    const avgGround=(frontAvg+rearAvg)*.5;

    const wheelbase=VEHICLE.wheelbase||2.77;
    const wheelTrack=2.00;

    const targetWheelPlanePitch=
      Math.atan2(rearAvg-frontAvg,wheelbase);

    const targetWheelPlaneRoll=
      Math.atan2(leftAvg-rightAvg,wheelTrack);

    // On pavement this is collision geometry, not a soft animation:
    // use the actual contact plane immediately.
    if(onRoad){
      wheelPlanePitch=targetWheelPlanePitch;
      wheelPlaneRoll=targetWheelPlaneRoll;
    }else{
      const wheelPlaneRate=1-Math.exp(-dt*10);
      wheelPlanePitch+=(targetWheelPlanePitch-wheelPlanePitch)*wheelPlaneRate;
      wheelPlaneRoll+=(targetWheelPlaneRoll-wheelPlaneRoll)*wheelPlaneRate;
    }

    // Vertical tire envelope when cambered.
    const camberAbs=Math.abs(wheelPlaneRoll);
    const effectiveWheelRadius=
      WHEEL_RADIUS*Math.cos(camberAbs)+
      TIRE_HALF_WIDTH*Math.sin(camberAbs);

    // Pass 2: solve chassis root height from the four wheel contacts.
    if(onRoad){
      car.position.y=
        avgGround+
        effectiveWheelRadius+
        TIRE_VISUAL_CLEARANCE;
    }

    // Pass 3: position each wheel relative to the solved chassis root.
    for(const s of samples){
      const targetLocalY=
        s.ground+
        effectiveWheelRadius+
        TIRE_VISUAL_CLEARANCE-
        car.position.y;

      if(onRoad){
        s.w.pivot.position.y=targetLocalY;
      }else{
        const suspensionRate=1-Math.exp(-dt*18);
        s.w.pivot.position.y+=
          (targetLocalY-s.w.pivot.position.y)*
          suspensionRate;
      }
    }

    // Dynamic sprung-body movement layered over the wheel support plane.
    const visualYawRate=
      (speed/VEHICLE.wheelbase)*
      Math.tan(currentSteerAngle||0);

    const lateralAccel=
      Math.max(-8,Math.min(8,speed*visualYawRate));

    const dynamicRoll=
      Math.max(-.065,Math.min(.065,lateralAccel*.0075));

    const dynamicPitch=
      Math.max(-.040,Math.min(.040,-longitudinalAccel*.0045));

    // Subtle visual rotation into the bend. It grows with actual yaw rate and
    // road speed, then recenters smoothly. Purely cosmetic: car.rotation.y
    // remains the authoritative driving heading.
    const cornerSpeedFactor=
      Math.min(1,Math.abs(speed)/22);

    const targetCorneringYaw=
      Math.max(
        -.050,
        Math.min(
          .050,
          visualYawRate*.055*cornerSpeedFactor
        )
      );

    corneringVisualYaw+=
      (targetCorneringYaw-corneringVisualYaw)*
      (1-Math.exp(-dt*(Math.abs(targetCorneringYaw)>.002?7.5:9.5)));

    // wheelPlaneRoll > 0 means LEFT wheels are higher.
    // Three.js rotation.z > 0 raises vehicle local +X (RIGHT side),
    // therefore the static road-bank component needs the opposite sign.
    const targetRoll=
      -wheelPlaneRoll+
      dynamicRoll;

    const targetPitch=
      wheelPlanePitch+
      dynamicPitch;

    suspensionRoll+=
      (targetRoll-suspensionRoll)*
      (1-Math.exp(-dt*7.0));

    suspensionPitch+=
      (targetPitch-suspensionPitch)*
      (1-Math.exp(-dt*7.2));

    // Heave is visual only; wheel contacts determine road support geometry.
    if(onRoad){
      suspensionHeave+=
        (0-suspensionHeave)*
        (1-Math.exp(-dt*10));
    }else{
      const targetHeave=
        Math.max(
          -.045,
          Math.min(
            .045,
            (avgGround-car.position.y)*.055
          )
        );

      suspensionHeave+=
        (targetHeave-suspensionHeave)*
        (1-Math.exp(-dt*5.5));
    }

    bodyGroup.rotation.x=suspensionPitch;
    bodyGroup.rotation.y=corneringVisualYaw;
    bodyGroup.rotation.z=suspensionRoll;

    const bodyBaseY=
      vehicleSystem.activeId==='wrx'
        ?-.31
        :vehicleSystem.activeId==='countach_80'
          ?-.33
          :-.22;

    bodyGroup.position.y=
      bodyBaseY+
      suspensionHeave;
  }

  function updateContactShadow(){
    const {roadContact,absX,absZ,heading,timeOfDay}=getDrivingState();
    const roadSurface=
      roadContact
        ?roadSurfaceAt(absX,absZ)
        :null;

    const groundY=
      roadSurface?.y??
      terrainAbs(absX,absZ);

    // Keep the projection on the actual support plane.
    vehicleShadowRig.position.set(
      car.position.x,
      groundY+.032,
      car.position.z
    );

    const surfacePitch=
      roadContact
        ?wheelPlanePitch
        :0;

    const surfaceRoll=
      roadContact
        ?wheelPlaneRoll
        :0;

    // The rig follows vehicle heading + road support plane.
    // The child quad remains permanently horizontal relative to this rig.
    vehicleShadowRig.rotation.set(
      -surfacePitch,
      heading,
      -surfaceRoll
    );

    const rideGap=
      Math.max(
        0,
        car.position.y-groundY-.35
      );

    // Contact shadow is strongest near the road and softens/spreads if the car
    // becomes airborne or crests a sharp grade.
    vehicleShadowUniforms.uHeightFade.value=
      Math.max(
        .22,
        Math.min(
          1,
          1-rideGap*.52
        )
      );

    const spread=
      1+
      Math.min(
        .20,
        rideGap*.12
      );

    vehicleShadow.scale.set(
      spread,
      spread,
      1
    );

    // Use the current time-of-day sun only as a DIRECTION INPUT.
    // The shadow shader never moves or modifies the actual sun.
    const sunLen=
      Math.hypot(
        sun.position.x,
        sun.position.z
      )||1;

    const sunX=
      sun.position.x/sunLen;

    const sunZ=
      sun.position.z/sunLen;

    // Rotate world sun direction into vehicle-local axes.
    const sinH=Math.sin(heading);
    const cosH=Math.cos(heading);

    const localSide=
      sunX*cosH-
      sunZ*sinH;

    const localForward=
      sunX*sinH+
      sunZ*cosH;

    // Shadow extends opposite the incoming sun direction.
    vehicleShadowUniforms.uSunTail.value.set(
      -localSide*.16,
      -localForward*.24
    );

    // Slightly stronger at daytime, but never enough to override the global
    // lighting cycle. At night it behaves mostly as ambient contact occlusion.
    const daylight=
      Math.max(
        0,
        Math.sin(
          (timeOfDay-6)/
          12*
          Math.PI
        )
      );

    vehicleShadowUniforms.uOpacity.value=
      .62+
      daylight*.13;
  }

  function updateWheels(dt,speed,visualSteer){
    for(const w of wheels){
      if(w.vehicleId&&w.vehicleId!==vehicleSystem.activeId)continue;

      // Tire/rim roll independently inside the steering/suspension pivot.
      w.tire.rotation.x-=speed*dt/.38;
      w.rim.rotation.x-=speed*dt/.38;

      const targetWheelYaw=
        w.front
          ?visualSteer
          :0;

      w.pivot.rotation.y+=
        (targetWheelYaw-w.pivot.rotation.y)*
        (1-Math.exp(-dt*12));

      if(!Number.isFinite(w.visualCamber)){
        w.visualCamber=0;
      }

      const targetCamber=-wheelPlaneRoll;

      w.visualCamber+=
        (targetCamber-w.visualCamber)*
        (1-Math.exp(-dt*18));

      w.pivot.rotation.z=w.visualCamber;
    }
  }

  function reset(){
    suspensionRoll=0;
    suspensionPitch=0;
    suspensionHeave=0;
    corneringVisualYaw=0;
    wheelPlaneRoll=0;
    wheelPlanePitch=0;
    wheelContactSamples=[];

    bodyGroup.rotation.set(0,0,0);
    bodyGroup.position.y=
      vehicleSystem.activeId==='wrx'
        ?-.31
        :vehicleSystem.activeId==='countach_80'
          ?-.33
          :-.22;
  }

  return {
    updateSuspensionVisuals,
    updateContactShadow,
    updateWheels,
    reset,
    get wheelPlaneRoll(){return wheelPlaneRoll;},
    get wheelPlanePitch(){return wheelPlanePitch;},
    get wheelContacts(){return wheelContactSamples;}
  };
}
