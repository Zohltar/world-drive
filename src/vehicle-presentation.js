// World Drive V21.5 — vehicle presentation + frame-rate-independent vertical dynamics.
// Four-wheel suspension, airborne motion, body pose and projected contact shadow.
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
      polygonOffset:true,
      polygonOffsetFactor:-2,
      polygonOffsetUnits:-2,

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

  // The shadow is a lightly tessellated decal instead of one rigid quad.
  // Its vertices are projected onto the road/terrain every frame, allowing the
  // silhouette to follow crests, cambers and road transitions without clipping
  // through the driving surface. 35 vertices keeps this inexpensive.
  const vehicleShadowGeometry=
    new THREE.PlaneGeometry(
      3.35,
      6.25,
      4,
      6
    );

  const vehicleShadowPositions=
    vehicleShadowGeometry.attributes.position;

  vehicleShadowPositions.setUsage?.(
    THREE.DynamicDrawUsage
  );

  const vehicleShadowLocalX=
    new Float32Array(
      vehicleShadowPositions.count
    );

  const vehicleShadowLocalZ=
    new Float32Array(
      vehicleShadowPositions.count
    );

  for(
    let i=0;
    i<vehicleShadowPositions.count;
    i++
  ){
    vehicleShadowLocalX[i]=
      vehicleShadowPositions.getX(i);

    // PlaneGeometry starts in XY. After the permanent -90° X rotation below,
    // geometry Y becomes local -Z. Geometry Z becomes vertical displacement.
    vehicleShadowLocalZ[i]=
      -vehicleShadowPositions.getY(i);
  }

  const vehicleShadow=
    new THREE.Mesh(
      vehicleShadowGeometry,
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

  // V20.0 lightweight vertical/chassis state.
  // The horizontal vehicle model stays intentionally simple, but vertical
  // support now behaves ballistically when the road falls away beneath the car.
  let airborne=false;
  let airborneTime=0;
  let verticalVelocity=0;
  let previousSupportY=null;
  let filteredSupportVelocity=0;
  let landingCompression=0;

  // Independent wheel suspension state. Wheel pivots are still guaranteed not
  // to penetrate their support surface, while rebound/droop can lag naturally.
  const wheelSpringState=new Map();

  function clamp(value,min,max){
    return Math.max(min,Math.min(max,value));
  }

  function springStateFor(wheel){
    let state=wheelSpringState.get(wheel.pivot.uuid);

    if(!state){
      state={
        y:Number(wheel.pivot.position.y)||0,
        velocity:0,
        compression:0,
        compressionVelocity:0
      };

      wheelSpringState.set(
        wheel.pivot.uuid,
        state
      );
    }

    return state;
  }

  function updateSuspensionVisuals(dt,onRoad,currentSteerAngle){
    const {
      heading,
      absX,
      absZ,
      speed,
      longitudinalAccel,
      rearSlipAmount=0,
      VEHICLE
    }=getDrivingState();

    const safeDt=
      Math.max(
        .001,
        Math.min(
          .05,
          Number(dt)||.016
        )
      );

    const c=Math.cos(heading);
    const sn=Math.sin(heading);

    const suspensionWheels=activeVehicleWheels();

    if(suspensionWheels.length!==4){
      console.warn(
        'Vehicle wheel configuration invalid',
        vehicleSystem.activeId,
        suspensionWheels.length
      );
      return;
    }

    const suspensionTravel=
      clamp(
        VEHICLE.suspensionTravel??.14,
        .055,
        .24
      );

    const suspensionResponse=
      clamp(
        VEHICLE.suspensionResponse??15,
        8,
        26
      );

    // ---------------------------------------------------------------
    // PASS 1 — independent support sample under every wheel.
    // ---------------------------------------------------------------
    const samples=[];

    for(const w of suspensionWheels){
      const lx=w.pivot.position.x;
      const lz=w.pivot.position.z;

      const wx=
        absX+
        lx*c+
        lz*sn;

      const wz=
        absZ-
        lx*sn+
        lz*c;

      let ground;

      if(onRoad){
        const roadSample=
          roadSurfaceAt(
            wx,
            wz
          );

        if(
          roadSample&&
          Math.abs(
            roadSample.lateral
          )<
          ROAD_WHEEL_CONTACT_HALF_WIDTH
        ){
          ground=roadSample.y;
        }
      }

      if(!Number.isFinite(ground)){
        ground=
          groundHeightForWheel(
            wx,
            wz
          );
      }

      const tireWidth=
        (
          Number(
            w.tire?.geometry?.parameters?.height
          )||
          .27
        )*
        (
          Number(car.scale?.x)||
          1
        );

      samples.push({
        w,
        ground,
        absX:wx,
        absZ:wz,
        front:!!w.front,
        side:
          lx<0
            ?'left'
            :'right',
        width:tireWidth
      });
    }

    if(samples.length!==4){
      wheelContactSamples=[];
      return;
    }

    const contacts=
      samples.map(
        sample=>sample.ground
      );

    // Current construction order:
    // rear-left, front-left, rear-right, front-right.
    const rearL=contacts[0];
    const frontL=contacts[1];
    const rearR=contacts[2];
    const frontR=contacts[3];

    const frontAvg=
      (frontL+frontR)*.5;

    const rearAvg=
      (rearL+rearR)*.5;

    const leftAvg=
      (frontL+rearL)*.5;

    const rightAvg=
      (frontR+rearR)*.5;

    const avgGround=
      (frontAvg+rearAvg)*.5;

    const wheelbase=
      VEHICLE.wheelbase||
      2.77;

    const wheelTrack=2.00;

    const targetWheelPlanePitch=
      Math.atan2(
        rearAvg-frontAvg,
        wheelbase
      );

    const targetWheelPlaneRoll=
      Math.atan2(
        leftAvg-rightAvg,
        wheelTrack
      );

    // Ground support plane is geometric. While airborne, preserve the takeoff
    // attitude and let it relax only very slowly instead of snapping to terrain.
    if(!airborne){
      if(onRoad){
        wheelPlanePitch=
          targetWheelPlanePitch;

        wheelPlaneRoll=
          targetWheelPlaneRoll;
      }else{
        const wheelPlaneRate=
          1-
          Math.exp(
            -safeDt*10
          );

        wheelPlanePitch+=
          (
            targetWheelPlanePitch-
            wheelPlanePitch
          )*
          wheelPlaneRate;

        wheelPlaneRoll+=
          (
            targetWheelPlaneRoll-
            wheelPlaneRoll
          )*
          wheelPlaneRate;
      }
    }else{
      const airAttitudeRate=
        1-
        Math.exp(
          -safeDt*.55
        );

      wheelPlanePitch+=
        (
          targetWheelPlanePitch-
          wheelPlanePitch
        )*
        airAttitudeRate;

      wheelPlaneRoll+=
        (
          targetWheelPlaneRoll-
          wheelPlaneRoll
        )*
        airAttitudeRate;
    }

    const camberAbs=
      Math.abs(
        wheelPlaneRoll
      );

    const effectiveWheelRadius=
      WHEEL_RADIUS*
      Math.cos(camberAbs)+
      TIRE_HALF_WIDTH*
      Math.sin(camberAbs);

    const supportY=
      avgGround+
      effectiveWheelRadius+
      TIRE_VISUAL_CLEARANCE;

    // ---------------------------------------------------------------
    // VERTICAL DYNAMICS — follow the road while supported, then ballistic.
    // ---------------------------------------------------------------
    if(!Number.isFinite(previousSupportY)){
      previousSupportY=supportY;
      car.position.y=supportY;
      verticalVelocity=0;
      filteredSupportVelocity=0;
    }

    const rawSupportVelocity=
      clamp(
        (
          supportY-
          previousSupportY
        )/
        safeDt,
        -22,
        22
      );

    filteredSupportVelocity+=
      (
        rawSupportVelocity-
        filteredSupportVelocity
      )*
      (
        1-
        Math.exp(
          -safeDt*18
        )
      );

    const gravity=9.81;

    if(!airborne){
      // V21.5 — frame-rate-independent crest / speed-bump launch detection.
      //
      // The old test predicted only one render frame ahead. Because ballistic
      // separation grows with dt², high-refresh clients (120/144+ FPS) were
      // effectively glued to the road while 30 FPS clients could launch.
      //
      // Instead, sample the support surface in SPACE and predict over a fixed
      // physical horizon. This makes the lift-off criterion depend on road
      // curvature + vehicle speed, not render-frame duration.
      const supportYAtCenter=(centerX,centerZ)=>{
        let totalGround=0;

        for(const w of suspensionWheels){
          const lx=w.pivot.position.x;
          const lz=w.pivot.position.z;

          const wx=
            centerX+
            lx*c+
            lz*sn;

          const wz=
            centerZ-
            lx*sn+
            lz*c;

          let ground;

          if(onRoad){
            const roadSample=
              roadSurfaceAt(
                wx,
                wz
              );

            if(
              roadSample&&
              Math.abs(
                roadSample.lateral
              )<
              ROAD_WHEEL_CONTACT_HALF_WIDTH
            ){
              ground=roadSample.y;
            }
          }

          if(!Number.isFinite(ground)){
            ground=
              groundHeightForWheel(
                wx,
                wz
              );
          }

          if(!Number.isFinite(ground)){
            return NaN;
          }

          totalGround+=ground;
        }

        return (
          totalGround/
          suspensionWheels.length+
          effectiveWheelRadius+
          TIRE_VISUAL_CLEARANCE
        );
      };

      const supportAtTravel=travel=>
        supportYAtCenter(
          absX+travel*sn,
          absZ+travel*c
        );

      // Spatial slope probe: deliberately independent of dt. A slightly longer
      // probe at very high speed suppresses tiny terrain/mesh noise without
      // hiding real crests.
      const launchSlopeProbe=
        clamp(
          Math.abs(speed)*.035,
          .70,
          1.80
        );

      const supportBehind=
        supportAtTravel(
          -launchSlopeProbe
        );

      const supportAhead=
        supportAtTravel(
          launchSlopeProbe
        );

      const spatialSupportVelocity=
        Number.isFinite(supportBehind)&&
        Number.isFinite(supportAhead)
          ?clamp(
              (
                supportAhead-
                supportBehind
              )/
              (2*launchSlopeProbe)*
              speed,
              -22,
              22
            )
          :filteredSupportVelocity;

      // Fixed physical look-ahead. At 120 km/h this is ~2.5 m; at 200 km/h
      // ~4.2 m. The exact same horizon is used at 30, 60, 120 or 144 FPS.
      const launchPredictionTime=.075;
      const futureTravel=
        speed*
        launchPredictionTime;

      const futureSupportY=
        supportAtTravel(
          futureTravel
        );

      const predictedBallisticY=
        supportY+
        spatialSupportVelocity*
        launchPredictionTime-
        .5*
        gravity*
        launchPredictionTime*
        launchPredictionTime;

      const predictedGap=
        Number.isFinite(futureSupportY)
          ?predictedBallisticY-
            futureSupportY
          :0;

      // Required vertical acceleration for the chassis to remain glued to the
      // sampled support curve. If the road would have to pull the car downward
      // faster than gravity can accelerate it, normal force reaches zero and
      // the vehicle must leave the surface. A small acceleration margin filters
      // numerical noise and imperceptible road tessellation ripples.
      const requiredSupportAccel=
        Number.isFinite(futureSupportY)
          ?2*
            (
              futureSupportY-
              supportY-
              spatialSupportVelocity*
              launchPredictionTime
            )/
            (
              launchPredictionTime*
              launchPredictionTime
            )
          :0;

      const launchAccelMargin=1.25;

      const canLaunch=
        Math.abs(speed)>7.5&&
        predictedGap>.003&&
        requiredSupportAccel<
          -(
            gravity+
            launchAccelMargin
          );

      if(canLaunch){
        airborne=true;
        airborneTime=0;

        // Carry the actual spatial road tangent into the ballistic phase. This
        // also removes the remaining one-frame dependency from takeoff velocity.
        verticalVelocity=
          spatialSupportVelocity;
      }else{
        car.position.y=supportY;

        // Preserve the existing supported-motion filtering and landing feel.
        verticalVelocity=
          filteredSupportVelocity;
      }
    }

    if(airborne){
      airborneTime+=safeDt;

      verticalVelocity-=
        gravity*
        safeDt;

      car.position.y+=
        verticalVelocity*
        safeDt;

      // Land once the wheel support plane catches the ballistic chassis.
      if(
        airborneTime>.025&&
        car.position.y<=supportY&&
        verticalVelocity<=
          filteredSupportVelocity+
          .8
      ){
        const impactSpeed=
          Math.max(
            0,
            filteredSupportVelocity-
            verticalVelocity
          );

        car.position.y=supportY;
        verticalVelocity=
          filteredSupportVelocity;

        airborne=false;
        airborneTime=0;

        landingCompression=
          clamp(
            impactSpeed*.018,
            0,
            .115
          );
      }
    }

    previousSupportY=supportY;

    landingCompression+=
      (
        0-
        landingCompression
      )*
      (
        1-
        Math.exp(
          -safeDt*5.8
        )
      );

    // ---------------------------------------------------------------
    // PASS 2 — independent wheel spring / droop.
    // ---------------------------------------------------------------
    const localContactSamples=[];

    for(const s of samples){
      const state=
        springStateFor(
          s.w
        );

      const contactLocalY=
        s.ground+
        effectiveWheelRadius+
        TIRE_VISUAL_CLEARANCE-
        car.position.y;

      let targetLocalY;

      if(airborne){
        // Unsprung wheel extends toward full droop while in the air.
        targetLocalY=
          -suspensionTravel;
      }else{
        targetLocalY=
          clamp(
            contactLocalY,
            -suspensionTravel,
            suspensionTravel
          );
      }

      const springK=
        suspensionResponse*
        suspensionResponse;

      const springD=
        suspensionResponse*
        1.55;

      const springAccel=
        (
          targetLocalY-
          state.y
        )*
        springK-
        state.velocity*
        springD;

      state.velocity+=
        springAccel*
        safeDt;

      state.y+=
        state.velocity*
        safeDt;

      // A tire may visually rebound above a depression, but it may never pass
      // through the support surface.
      if(!airborne){
        if(state.y<contactLocalY){
          state.y=contactLocalY;

          if(state.velocity<0){
            state.velocity=0;
          }
        }

        state.y=
          Math.min(
            state.y,
            contactLocalY+
            suspensionTravel*.72
          );
      }

      const previousCompression=
        state.compression;

      state.compression=
        airborne
          ?0
          :clamp(
             contactLocalY-
             state.y+
             suspensionTravel*.22,
             0,
             suspensionTravel
           );

      state.compressionVelocity=
        (
          state.compression-
          previousCompression
        )/
        safeDt;

      s.w.pivot.position.y=
        state.y;

      const contactGap=
        airborne
          ?Infinity
          :Math.max(
             0,
             state.y-
             contactLocalY
           );

      const contact=
        !airborne&&
        contactGap<
          Math.max(
            .035,
            suspensionTravel*.38
          );

      const contactFactor=
        contact
          ?clamp(
             1-
             contactGap/
             Math.max(
               .045,
               suspensionTravel*.75
             ),
             .20,
             1
           )
          :0;

      localContactSamples.push({
        absX:s.absX,
        absZ:s.absZ,
        ground:s.ground,
        front:s.front,
        side:s.side,
        width:s.width,
        contact,
        contactFactor,
        suspensionCompression:
          state.compression,
        suspensionVelocity:
          state.compressionVelocity
      });
    }

    wheelContactSamples=
      localContactSamples;

    // ---------------------------------------------------------------
    // SPRUNG-BODY VISUAL RESPONSE.
    // ---------------------------------------------------------------
    const visualYawRate=
      (
        speed/
        VEHICLE.wheelbase
      )*
      Math.tan(
        currentSteerAngle||0
      );

    const lateralAccel=
      clamp(
        speed*
        visualYawRate,
        -8,
        8
      );

    const dynamicRoll=
      clamp(
        lateralAccel*.0075,
        -.065,
        .065
      );

    const dynamicPitch=
      clamp(
        -longitudinalAccel*.0045,
        -.040,
        .040
      );

    const wheelCompression=
      localContactSamples.map(
        c=>
          Number(
            c.suspensionCompression
          )||0
      );

    const rearCompression=
      (
        wheelCompression[0]+
        wheelCompression[2]
      )*.5;

    const frontCompression=
      (
        wheelCompression[1]+
        wheelCompression[3]
      )*.5;

    const leftCompression=
      (
        wheelCompression[0]+
        wheelCompression[1]
      )*.5;

    const rightCompression=
      (
        wheelCompression[2]+
        wheelCompression[3]
      )*.5;

    // Independent compression contributes a small transient body reaction in
    // addition to the static road support plane.
    const springPitch=
      clamp(
        (
          rearCompression-
          frontCompression
        )*.22,
        -.030,
        .030
      );

    const springRoll=
      clamp(
        (
          rightCompression-
          leftCompression
        )*.24,
        -.035,
        .035
      );

    const cornerSpeedFactor=
      Math.min(
        1,
        Math.abs(speed)/22
      );

    const targetCorneringYaw=
      clamp(
        visualYawRate*
        .055*
        cornerSpeedFactor+
        Math.sign(
          currentSteerAngle||
          visualYawRate||
          1
        )*
        clamp(
          Number(rearSlipAmount)||0,
          0,
          1
        )*
        .026,
        -.065,
        .065
      );

    corneringVisualYaw+=
      (
        targetCorneringYaw-
        corneringVisualYaw
      )*
      (
        1-
        Math.exp(
          -safeDt*
          (
            Math.abs(
              targetCorneringYaw
            )>.002
              ?7.5
              :9.5
          )
        )
      );

    const targetRoll=
      -wheelPlaneRoll+
      dynamicRoll+
      springRoll;

    const targetPitch=
      wheelPlanePitch+
      dynamicPitch+
      springPitch;

    const attitudeRate=
      airborne
        ?2.1
        :7.0;

    suspensionRoll+=
      (
        targetRoll-
        suspensionRoll
      )*
      (
        1-
        Math.exp(
          -safeDt*
          attitudeRate
        )
      );

    suspensionPitch+=
      (
        targetPitch-
        suspensionPitch
      )*
      (
        1-
        Math.exp(
          -safeDt*
          (
            airborne
              ?1.8
              :7.2
          )
        )
      );

    const avgCompression=
      wheelCompression.reduce(
        (sum,value)=>sum+value,
        0
      )/
      4;

    const targetHeave=
      -avgCompression*.18-
      landingCompression;

    suspensionHeave+=
      (
        targetHeave-
        suspensionHeave
      )*
      (
        1-
        Math.exp(
          -safeDt*
          (
            airborne
              ?3.2
              :8.5
          )
        )
      );

    bodyGroup.rotation.x=
      suspensionPitch;

    bodyGroup.rotation.y=
      corneringVisualYaw;

    bodyGroup.rotation.z=
      suspensionRoll;

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

  function shadowGroundAt(absSampleX,absSampleZ){
    // Prefer the rendered road surface only while the sample is actually inside
    // the road envelope. Outside it, project onto the terrain instead. This
    // prevents the decal from floating over shoulders or cutting under the road.
    const roadSample=
      roadSurfaceAt(
        absSampleX,
        absSampleZ
      );

    if(
      roadSample&&
      Number.isFinite(roadSample.y)&&
      Math.abs(
        Number(roadSample.lateral)||0
      )<
        ROAD_WHEEL_CONTACT_HALF_WIDTH+
        .95
    ){
      return roadSample.y;
    }

    const terrainY=
      terrainAbs(
        absSampleX,
        absSampleZ
      );

    return Number.isFinite(terrainY)
      ?terrainY
      :0;
  }

  function updateContactShadow(){
    const {
      absX,
      absZ,
      heading,
      timeOfDay
    }=getDrivingState();

    const groundY=
      shadowGroundAt(
        absX,
        absZ
      );

    const rideGap=
      Math.max(
        0,
        car.position.y-
        groundY-
        .35
      );

    // Contact shadow is strongest near the road and softens/spreads if the car
    // becomes airborne or crests a sharp grade.
    vehicleShadowUniforms.uHeightFade.value=
      Math.max(
        .18,
        Math.min(
          1,
          1-rideGap*.58
        )
      );

    const spread=
      1+
      Math.min(
        .14,
        rideGap*.075
      );

    vehicleShadow.scale.set(
      spread,
      spread,
      1
    );

    // Keep the rig itself simple and stable: vehicle yaw only. Pitch/roll are no
    // longer approximated with one large plane; every decal vertex gets the real
    // road/terrain height below it.
    vehicleShadowRig.position.set(
      car.position.x,
      groundY,
      car.position.z
    );

    vehicleShadowRig.rotation.set(
      0,
      heading,
      0
    );

    const cosH=Math.cos(heading);
    const sinH=Math.sin(heading);
    const decalLift=.026;

    for(
      let i=0;
      i<vehicleShadowPositions.count;
      i++
    ){
      const localX=
        vehicleShadowLocalX[i]*
        spread;

      const localZ=
        vehicleShadowLocalZ[i]*
        spread;

      const sampleX=
        absX+
        localX*cosH+
        localZ*sinH;

      const sampleZ=
        absZ-
        localX*sinH+
        localZ*cosH;

      const sampleGround=
        shadowGroundAt(
          sampleX,
          sampleZ
        );

      // Geometry Z becomes vertical after vehicleShadow.rotation.x=-PI/2.
      // A small lift plus polygon offset keeps the decal visibly above the road
      // without creating a perceivable gap beneath the tires.
      vehicleShadowPositions.setZ(
        i,
        sampleGround-
        groundY+
        decalLift
      );
    }

    vehicleShadowPositions.needsUpdate=true;

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
    const localSide=
      sunX*cosH-
      sunZ*sinH;

    const localForward=
      sunX*sinH+
      sunZ*cosH;

    // Shadow extends opposite the incoming sun direction.
    vehicleShadowUniforms.uSunTail.value.set(
      -localSide*.14,
      -localForward*.20
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
      .60+
      daylight*.12;
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

    airborne=false;
    airborneTime=0;
    verticalVelocity=0;
    previousSupportY=null;
    filteredSupportVelocity=0;
    landingCompression=0;
    wheelSpringState.clear();

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
    get wheelContacts(){return wheelContactSamples;},
    get airborne(){return airborne;},
    get verticalVelocity(){return verticalVelocity;}
  };
}
