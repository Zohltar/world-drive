import { aerodynamicLoad, fitWheelSupportPlane } from '../vehicle-dynamics.js';
import { ackermannSteeringAngles, ackermannAngleForSide } from '../physics/steering-geometry.js';
import { horizontalTravelDirection, crestLaunchDecision, airborneLandingDecision } from '../physics/airborne-dynamics.js';

// World Drive V21.21.26 — vehicle presentation + aero-aware vertical dynamics.
// Multi-wheel suspension support, airborne motion, body pose and projected contact shadow.
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
  const vehicleShadowUniforms={
    uOpacity:{value:.72},
    uSoftness:{value:1.0},
    uSunTail:{value:new THREE.Vector2(.12,-.22)},
    uHeightFade:{value:1.0},
    uVehicleAspect:{value:2.05}
  };

  const vehicleShadowMaterial=new THREE.ShaderMaterial({
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
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
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
        return 1.0-smoothstep(1.0-feather,1.0,d);
      }
      float boxSoft(vec2 p,vec2 halfSize,float radius){
        vec2 q=abs(p)-halfSize+radius;
        float outside=length(max(q,0.0))-radius;
        float inside=min(max(q.x,q.y),0.0);
        float d=outside+inside;
        return 1.0-smoothstep(-.10,.34*uSoftness,d);
      }
      float hash21(vec2 p){
        p=fract(p*vec2(123.34,345.45));
        p+=dot(p,p+34.345);
        return fract(p.x*p.y);
      }
      void main(){
        vec2 p=(vUv-.5)*2.0;
        float chassis=boxSoft(p+vec2(0.0,.02),vec2(.45,.70),.28);
        float cabinMass=ellipse(p+vec2(0.0,.06),vec2(.50,.74),.27);
        float body=max(chassis*.90,cabinMass*.68);
        float core=ellipse(p+vec2(0.0,.02),vec2(.37,.57),.30);
        vec2 tailP=p-uSunTail;
        float tail=ellipse(tailP,vec2(.60,.82),.34);
        float alpha=body*.56+core*.34+tail*.10;
        float n=hash21(gl_FragCoord.xy*.35)-.5;
        alpha+=n*.018*alpha;
        vec2 edgeUv=abs(vUv-.5)*2.0;
        float edgeFade=1.0-smoothstep(.82,1.0,max(edgeUv.x,edgeUv.y));
        alpha*=edgeFade*uOpacity*uHeightFade;
        if(alpha<.006)discard;
        gl_FragColor=vec4(0.0,0.0,0.0,clamp(alpha,0.0,.82));
      }
    `
  });

  const vehicleShadowRig=new THREE.Group();
  vehicleShadowRig.name='vehicle-projected-shadow-rig';
  vehicleShadowRig.rotation.order='YXZ';

  const vehicleShadowGeometry=new THREE.PlaneGeometry(3.35,6.25,3,4);
  const vehicleShadowPositions=vehicleShadowGeometry.attributes.position;
  vehicleShadowPositions.setUsage?.(THREE.DynamicDrawUsage);
  const vehicleShadowLocalX=new Float32Array(vehicleShadowPositions.count);
  const vehicleShadowLocalZ=new Float32Array(vehicleShadowPositions.count);
  for(let i=0;i<vehicleShadowPositions.count;i++){
    vehicleShadowLocalX[i]=vehicleShadowPositions.getX(i);
    vehicleShadowLocalZ[i]=-vehicleShadowPositions.getY(i);
  }

  const vehicleShadow=new THREE.Mesh(vehicleShadowGeometry,vehicleShadowMaterial);
  vehicleShadow.name='vehicle-projected-contact-shadow';
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
  let airborne=false;
  let airborneTime=0;
  let verticalVelocity=0;
  let previousSupportY=null;
  let filteredSupportVelocity=0;
  let landingCompression=0;
  const verticalAeroScratch={};
  const wheelSpringState=new Map();
  const suspensionSampleScratch=[];
  const contactSampleScratch=[];
  const wheelCompressionScratch=[];

  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

  function springStateFor(wheel){
    let state=wheelSpringState.get(wheel.pivot.uuid);
    if(!state){
      state={y:Number(wheel.pivot.position.y)||0,velocity:0,compression:0,compressionVelocity:0};
      wheelSpringState.set(wheel.pivot.uuid,state);
    }
    return state;
  }

  function updateSuspensionVisuals(dt,onRoad,currentSteerAngle){
    const {heading,velocityHeading,absX,absZ,speed,longitudinalAccel,rearSlipAmount=0,VEHICLE}=getDrivingState();
    const safeDt=Math.max(.001,Math.min(.05,Number(dt)||.016));
    const c=Math.cos(heading);
    const sn=Math.sin(heading);
    const suspensionWheels=activeVehicleWheels();
    if(suspensionWheels.length<4){
      console.warn('Vehicle wheel configuration invalid',vehicleSystem.activeId,suspensionWheels.length);
      return;
    }

    const suspensionTravel=clamp(VEHICLE.suspensionTravel??.14,.055,.40);
    const suspensionResponse=clamp(VEHICLE.suspensionResponse??15,4,26);
    const samples=suspensionSampleScratch;
    samples.length=suspensionWheels.length;

    for(let wheelIndex=0;wheelIndex<suspensionWheels.length;wheelIndex++){
      const w=suspensionWheels[wheelIndex];
      const lx=w.pivot.position.x;
      const lz=w.pivot.position.z;
      const wx=absX+lx*c+lz*sn;
      const wz=absZ-lx*sn+lz*c;
      const ground=groundHeightForWheel(wx,wz,true);
      const tireWidth=(Number(w.tire?.geometry?.parameters?.height)||.27)*(Number(car.scale?.x)||1);
      const sample=samples[wheelIndex]||(samples[wheelIndex]={});
      sample.w=w;sample.ground=ground;sample.absX=wx;sample.absZ=wz;
      sample.localX=lx;sample.localZ=lz;
      sample.axleIndex=Number.isInteger(w.axleIndex)?w.axleIndex:(w.front?0:Math.max(1,(VEHICLE.axles?.length||2)-1));
      sample.front=!!w.front;sample.side=lx<0?'left':'right';sample.width=tireWidth;
    }

    if(samples.length<4){wheelContactSamples=[];return;}

    let avgGround,targetWheelPlanePitch,targetWheelPlaneRoll;
    if(samples.length===4){
      const rearL=samples[0].ground;
      const frontL=samples[1].ground;
      const rearR=samples[2].ground;
      const frontR=samples[3].ground;
      const frontAvg=(frontL+frontR)*.5;
      const rearAvg=(rearL+rearR)*.5;
      const leftAvg=(frontL+rearL)*.5;
      const rightAvg=(frontR+rearR)*.5;
      avgGround=(frontAvg+rearAvg)*.5;
      targetWheelPlanePitch=Math.atan2(rearAvg-frontAvg,Math.max(1.2,Number(VEHICLE.wheelbase)||2.77));
      targetWheelPlaneRoll=Math.atan2(leftAvg-rightAvg,Math.max(1.0,Number(VEHICLE.trackWidth)||1.56));
    }else{
      const supportPlane=fitWheelSupportPlane(samples);
      avgGround=supportPlane.meanY;
      targetWheelPlanePitch=supportPlane.pitch;
      targetWheelPlaneRoll=supportPlane.roll;
    }

    if(!airborne){
      if(onRoad){
        wheelPlanePitch=targetWheelPlanePitch;
        wheelPlaneRoll=targetWheelPlaneRoll;
      }else{
        const wheelPlaneRate=1-Math.exp(-safeDt*10);
        wheelPlanePitch+=(targetWheelPlanePitch-wheelPlanePitch)*wheelPlaneRate;
        wheelPlaneRoll+=(targetWheelPlaneRoll-wheelPlaneRoll)*wheelPlaneRate;
      }
    }else{
      // Grip R6 — no contact means the terrain underneath cannot torque the
      // chassis/support plane. Preserve takeoff attitude until contact returns.
    }

    const camberAbs=Math.abs(wheelPlaneRoll);
    const effectiveWheelRadius=WHEEL_RADIUS*Math.cos(camberAbs)+TIRE_HALF_WIDTH*Math.sin(camberAbs);
    const supportY=avgGround+effectiveWheelRadius+TIRE_VISUAL_CLEARANCE;

    if(!Number.isFinite(previousSupportY)){
      previousSupportY=supportY;
      car.position.y=supportY;
      verticalVelocity=0;
      filteredSupportVelocity=0;
    }

    const rawSupportVelocity=clamp((supportY-previousSupportY)/safeDt,-22,22);
    filteredSupportVelocity+=(rawSupportVelocity-filteredSupportVelocity)*(1-Math.exp(-safeDt*18));

    const gravity=9.81;
    const aeroVertical=aerodynamicLoad({vehicle:VEHICLE,speedAbs:Math.abs(speed),airborne:false},verticalAeroScratch);
    const aeroDownforceAccel=Math.max(0,Number(aeroVertical?.downforceAccel)||0);
    const launchAeroScale=clamp(Number(VEHICLE?.aeroLaunchRetentionScale)||1,0,1);
    const airborneAeroScale=clamp(Number(VEHICLE?.aeroAirborneDownforceScale)||0,0,1);
    const supportedDownwardAccel=gravity+aeroDownforceAccel*launchAeroScale;
    const airborneDownwardAccel=gravity+aeroDownforceAccel*airborneAeroScale;

    // Grip R6 — momentum-path crest separation. Contact loss follows the
    // actual horizontal velocity vector and gravity, not chassis heading or a
    // gameplay minimum-speed threshold.
    let launchedThisFrame=false;
    if(!airborne){
      const supportYAtCenter=(centerX,centerZ)=>{
        const ground=groundHeightForWheel(centerX,centerZ);
        return Number.isFinite(ground)?ground+effectiveWheelRadius+TIRE_VISUAL_CLEARANCE:NaN;
      };
      const travel=horizontalTravelDirection({speed,heading,velocityHeading});
      const launchSlopeProbe=clamp(travel.speedAbs*.035,.35,1.80);
      const supportAtTravel=distance=>supportYAtCenter(
        absX+distance*travel.x,
        absZ+distance*travel.z
      );
      const supportBehind=supportAtTravel(-launchSlopeProbe);
      const supportAhead=supportAtTravel(launchSlopeProbe);
      const currentCenterSupportY=supportAtTravel(0);
      const spatialSupportVelocity=
        Number.isFinite(supportBehind)&&Number.isFinite(supportAhead)
          ?clamp((supportAhead-supportBehind)/(2*launchSlopeProbe)*travel.speedAbs,-22,22)
          :filteredSupportVelocity;

      const launchPredictionTime=.075;
      const futureSupportY=supportAtTravel(travel.speedAbs*launchPredictionTime);
      const launchOriginY=Number.isFinite(currentCenterSupportY)?currentCenterSupportY:supportY;
      const separation=crestLaunchDecision({
        speedAbs:travel.speedAbs,
        supportOriginY:launchOriginY,
        futureSupportY,
        supportVerticalVelocity:spatialSupportVelocity,
        predictionTime:launchPredictionTime,
        downwardAccel:supportedDownwardAccel
      });

      if(separation.canLaunch){
        airborne=true;
        airborneTime=0;
        verticalVelocity=spatialSupportVelocity;
        launchedThisFrame=true;
      }else{
        car.position.y=supportY;
        verticalVelocity=filteredSupportVelocity;
      }
    }

    if(airborne&&!launchedThisFrame){
      airborneTime+=safeDt;
      verticalVelocity-=airborneDownwardAccel*safeDt;
      const nextAirborneY=car.position.y+verticalVelocity*safeDt;
      car.position.y=nextAirborneY;
      if(airborneLandingDecision({
        nextY:nextAirborneY,
        supportY,
        verticalVelocity,
        supportVerticalVelocity:filteredSupportVelocity
      })){
        const impactSpeed=Math.max(0,filteredSupportVelocity-verticalVelocity);
        car.position.y=supportY;
        verticalVelocity=filteredSupportVelocity;
        airborne=false;
        airborneTime=0;
        landingCompression=clamp(impactSpeed*.018,0,.115);
      }
    }

    previousSupportY=supportY;
    landingCompression+=(0-landingCompression)*(1-Math.exp(-safeDt*5.8));

    const localContactSamples=contactSampleScratch;
    localContactSamples.length=samples.length;
    for(let sampleIndex=0;sampleIndex<samples.length;sampleIndex++){
      const s=samples[sampleIndex];
      const state=springStateFor(s.w);
      const contactLocalY=s.ground+effectiveWheelRadius+TIRE_VISUAL_CLEARANCE-car.position.y;
      let targetLocalY;
      if(airborne)targetLocalY=-suspensionTravel;
      else targetLocalY=clamp(contactLocalY,-suspensionTravel,suspensionTravel);

      const springK=suspensionResponse*suspensionResponse;
      const springD=suspensionResponse*1.55;
      const springAccel=(targetLocalY-state.y)*springK-state.velocity*springD;
      state.velocity+=springAccel*safeDt;
      state.y+=state.velocity*safeDt;

      if(!airborne){
        if(state.y<contactLocalY){state.y=contactLocalY;if(state.velocity<0)state.velocity=0;}
        state.y=Math.min(state.y,contactLocalY+suspensionTravel*.72);
      }

      const previousCompression=state.compression;
      state.compression=airborne?0:clamp(contactLocalY-state.y+suspensionTravel*.22,0,suspensionTravel);
      state.compressionVelocity=(state.compression-previousCompression)/safeDt;
      s.w.pivot.position.y=state.y;
      const contactGap=airborne?Infinity:Math.max(0,state.y-contactLocalY);
      const contact=!airborne&&contactGap<Math.max(.035,suspensionTravel*.38);
      const contactFactor=contact?clamp(1-contactGap/Math.max(.045,suspensionTravel*.75),.20,1):0;
      const contactSample=localContactSamples[sampleIndex]||(localContactSamples[sampleIndex]={});
      contactSample.absX=s.absX;contactSample.absZ=s.absZ;contactSample.ground=s.ground;
      contactSample.localX=s.localX;contactSample.localZ=s.localZ;contactSample.axleIndex=s.axleIndex;
      contactSample.front=s.front;contactSample.side=s.side;contactSample.width=s.width;
      contactSample.contact=contact;contactSample.contactFactor=contactFactor;
      contactSample.suspensionCompression=state.compression;
      contactSample.suspensionVelocity=state.compressionVelocity;
    }
    wheelContactSamples=localContactSamples;

    const visualYawRate=(speed/VEHICLE.wheelbase)*Math.tan(currentSteerAngle||0);
    const lateralAccel=clamp(speed*visualYawRate,-8,8);
    const cgHeight=Math.max(.20,Number(VEHICLE.cgHeight)||.50);
    const physicsTrack=Math.max(1.0,Number(VEHICLE.trackWidth)||1.56);
    const physicsWheelbase=Math.max(1.2,Number(VEHICLE.wheelbase)||2.65);
    const rollGain=.0075*(cgHeight/.50)*(1.56/physicsTrack);
    const pitchGain=.0045*(cgHeight/.50)*(2.65/physicsWheelbase);
    const dynamicRoll=clamp(lateralAccel*rollGain,-.085,.085);
    const dynamicPitch=clamp(-longitudinalAccel*pitchGain,-.055,.055);

    const wheelCompression=wheelCompressionScratch;
    wheelCompression.length=localContactSamples.length;
    for(let i=0;i<localContactSamples.length;i++)wheelCompression[i]=Number(localContactSamples[i].suspensionCompression)||0;

    let frontCompression,rearCompression,leftCompression,rightCompression;
    if(localContactSamples.length===4){
      rearCompression=((wheelCompression[0]||0)+(wheelCompression[2]||0))*.5;
      frontCompression=((wheelCompression[1]||0)+(wheelCompression[3]||0))*.5;
      leftCompression=((wheelCompression[0]||0)+(wheelCompression[1]||0))*.5;
      rightCompression=((wheelCompression[2]||0)+(wheelCompression[3]||0))*.5;
    }else{
      let frontSum=0,frontN=0,rearSum=0,rearN=0,leftSum=0,leftN=0,rightSum=0,rightN=0;
      for(let i=0;i<localContactSamples.length;i++){
        const sample=localContactSamples[i],value=wheelCompression[i]||0;
        if(sample.front||sample.axleIndex===0){frontSum+=value;frontN++;}else{rearSum+=value;rearN++;}
        if(sample.side==='left'){leftSum+=value;leftN++;}else{rightSum+=value;rightN++;}
      }
      frontCompression=frontN?frontSum/frontN:0;
      rearCompression=rearN?rearSum/rearN:0;
      leftCompression=leftN?leftSum/leftN:0;
      rightCompression=rightN?rightSum/rightN:0;
    }

    const springPitch=clamp((rearCompression-frontCompression)*.22,-.030,.030);
    const springRoll=clamp((rightCompression-leftCompression)*.24,-.035,.035);
    const cornerSpeedFactor=Math.min(1,Math.abs(speed)/22);
    const targetCorneringYaw=clamp(
      visualYawRate*.055*cornerSpeedFactor+
      Math.sign(currentSteerAngle||visualYawRate||1)*clamp(Number(rearSlipAmount)||0,0,1)*.026,
      -.065,.065
    );
    corneringVisualYaw+=(targetCorneringYaw-corneringVisualYaw)*(1-Math.exp(-safeDt*(Math.abs(targetCorneringYaw)>.002?7.5:9.5)));
    if(!airborne){
      const targetRoll=-wheelPlaneRoll+dynamicRoll+springRoll;
      const targetPitch=wheelPlanePitch+dynamicPitch+springPitch;
      suspensionRoll+=(targetRoll-suspensionRoll)*(1-Math.exp(-safeDt*7.0));
      suspensionPitch+=(targetPitch-suspensionPitch)*(1-Math.exp(-safeDt*7.2));
    }
    const avgCompression=wheelCompression.reduce((sum,value)=>sum+value,0)/Math.max(1,wheelCompression.length);
    const targetHeave=-avgCompression*.18-landingCompression;
    suspensionHeave+=(targetHeave-suspensionHeave)*(1-Math.exp(-safeDt*(airborne?3.2:8.5)));

    bodyGroup.rotation.x=suspensionPitch;
    bodyGroup.rotation.y=corneringVisualYaw;
    bodyGroup.rotation.z=suspensionRoll;
    const configuredBodyBaseY=Number(vehicleSystem.active?.visual?.bodyBaseY);
    const bodyBaseY=Number.isFinite(configuredBodyBaseY)?configuredBodyBaseY:vehicleSystem.activeId==='wrx'?-.31:vehicleSystem.activeId==='countach_80'?-.33:-.22;
    bodyGroup.position.y=bodyBaseY+suspensionHeave;
  }

  function shadowGroundAt(absSampleX,absSampleZ){
    const roadSample=roadSurfaceAt(absSampleX,absSampleZ);
    if(roadSample&&Number.isFinite(roadSample.y)&&Math.abs(Number(roadSample.lateral)||0)<ROAD_WHEEL_CONTACT_HALF_WIDTH+.95){
      return roadSample.y;
    }
    const terrainY=terrainAbs(absSampleX,absSampleZ);
    return Number.isFinite(terrainY)?terrainY:0;
  }

  function updateContactShadow(projectGeometry=true){
    const {absX,absZ,heading,timeOfDay}=getDrivingState();
    const groundY=shadowGroundAt(absX,absZ);
    const rideGap=Math.max(0,car.position.y-groundY-.35);
    vehicleShadowUniforms.uHeightFade.value=Math.max(.18,Math.min(1,1-rideGap*.58));
    const spread=1+Math.min(.14,rideGap*.075);
    vehicleShadow.scale.set(spread,spread,1);
    vehicleShadowRig.position.set(car.position.x,groundY,car.position.z);
    vehicleShadowRig.rotation.set(0,heading,0);
    const cosH=Math.cos(heading);
    const sinH=Math.sin(heading);
    const decalLift=.026;

    if(projectGeometry){
      for(let i=0;i<vehicleShadowPositions.count;i++){
        const localX=vehicleShadowLocalX[i]*spread;
        const localZ=vehicleShadowLocalZ[i]*spread;
        const sampleX=absX+localX*cosH+localZ*sinH;
        const sampleZ=absZ-localX*sinH+localZ*cosH;
        const sampleGround=shadowGroundAt(sampleX,sampleZ);
        vehicleShadowPositions.setZ(i,sampleGround-groundY+decalLift);
      }
      vehicleShadowPositions.needsUpdate=true;
    }

    const sunLen=Math.hypot(sun.position.x,sun.position.z)||1;
    const sunX=sun.position.x/sunLen;
    const sunZ=sun.position.z/sunLen;
    const localSide=sunX*cosH-sunZ*sinH;
    const localForward=sunX*sinH+sunZ*cosH;
    vehicleShadowUniforms.uSunTail.value.set(-localSide*.14,-localForward*.20);
    const daylight=Math.max(0,Math.sin((timeOfDay-6)/12*Math.PI));
    vehicleShadowUniforms.uOpacity.value=.60+daylight*.12;
  }

  function updateWheels(dt,speed,visualSteer){
    const vehicle=getDrivingState()?.VEHICLE||{};
    const geometry=ackermannSteeringAngles({wheelbase:vehicle.wheelbase,trackWidth:vehicle.trackWidth,centerAngle:visualSteer});
    for(const w of wheels){
      if(w.vehicleId&&w.vehicleId!==vehicleSystem.activeId)continue;
      w.tire.rotation.x-=speed*dt/.38;
      w.rim.rotation.x-=speed*dt/.38;
      const side=w.side!==undefined?w.side:(Number(w.pivot?.position?.x)<0?'left':'right');
      const targetWheelYaw=w.front?ackermannAngleForSide(geometry,side):0;
      w.pivot.rotation.y+=(targetWheelYaw-w.pivot.rotation.y)*(1-Math.exp(-dt*12));
      if(!Number.isFinite(w.visualCamber))w.visualCamber=0;
      const targetCamber=-wheelPlaneRoll;
      w.visualCamber+=(targetCamber-w.visualCamber)*(1-Math.exp(-dt*18));
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
    const configuredBodyBaseY=Number(vehicleSystem.active?.visual?.bodyBaseY);
    bodyGroup.position.y=Number.isFinite(configuredBodyBaseY)?configuredBodyBaseY:vehicleSystem.activeId==='wrx'?-.31:vehicleSystem.activeId==='countach_80'?-.33:-.22;
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
