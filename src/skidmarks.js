// World Drive V21.8 — pooled skid-mark renderer + shared tire-audio slip cue.
// Local rubber is driven by independent per-wheel adhesion loss; multiplayer
// keeps the compact front/rear aggregate state.
export function createSkidMarkSystem({THREE,scene,getWorldOffset,getRoadSurface,maxSegments=7200}){
  const MIN_SEGMENT=.12,MAX_SEGMENT=3.0,REMOTE_DRAW_DISTANCE=520,MIN_RECYCLE_AGE_MS=20000;
  const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
  const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.34,depthWrite:false,depthTest:true,vertexColors:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3,side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(geometry,material,maxSegments);mesh.name='skid-marks';mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.renderOrder=4;scene.add(mesh);
  const slots=Array.from({length:maxSegments},()=>({active:false,absX:0,absZ:0,y:0,width:.2,length:0,shade:.05,bornAt:0,quaternion:new THREE.Quaternion()}));
  const tracks=new Map(),dummy=new THREE.Object3D(),basis=new THREE.Matrix4(),up=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3(),correctedForward=new THREE.Vector3(),color=new THREE.Color();
  let nextSlot=0,lastOffsetX=NaN,lastOffsetZ=NaN;
  let localState={front:0,rear:0,wheels:[0,0,0,0],tireAudio:0,brakeAudio:0,onRoad:false};
  let lateralSquealTime=0,brakingSlipTime=0;
  const wheelSlipTime=[0,0,0,0],LATERAL_MARK_DELAY=.70,BRAKE_MARK_DELAY=.38;
  function smoothstep01(value){const t=Math.max(0,Math.min(1,Number(value)||0));return t*t*(3-2*t);}
  function currentOffset(){const o=getWorldOffset?.()||{x:0,z:0};return{x:Number(o.x)||0,z:Number(o.z)||0};}
  function hide(index){dummy.position.set(0,-10000,0);dummy.quaternion.identity();dummy.scale.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);color.setRGB(0,0,0);mesh.setColorAt(index,color);}
  for(let i=0;i<maxSegments;i++)hide(i);mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  function roadNormal(absX,absZ){const surface=getRoadSurface?.(absX,absZ);if(!surface){up.set(0,1,0);return{up,y:null};}const a=Number(surface.angle)||0,pitch=Number(surface.pitch)||0,roll=Number(surface.roll)||0;const f=new THREE.Vector3(Math.sin(a),Math.tan(pitch),Math.cos(a)).normalize();const left=new THREE.Vector3(-Math.cos(a),Math.tan(roll),Math.sin(a)).normalize();up.crossVectors(left,f).normalize();if(up.y<0)up.multiplyScalar(-1);return{up,y:Number.isFinite(surface.y)?surface.y:null};}
  function write(index){const slot=slots[index];if(!slot.active){hide(index);return;}const o=currentOffset();dummy.position.set(slot.absX-o.x,slot.y,slot.absZ-o.z);dummy.quaternion.copy(slot.quaternion);dummy.scale.set(slot.width,1,slot.length);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);color.setRGB(slot.shade,slot.shade,slot.shade);mesh.setColorAt(index,color);}
  function refreshForFloatingOrigin(){const o=currentOffset();if(o.x===lastOffsetX&&o.z===lastOffsetZ)return;lastOffsetX=o.x;lastOffsetZ=o.z;for(let i=0;i<slots.length;i++)if(slots[i].active)write(i);mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  function acquireWritableSlot(){const now=performance.now();for(let attempt=0;attempt<maxSegments;attempt++){const index=nextSlot,slot=slots[index];nextSlot=(nextSlot+1)%maxSegments;if(!slot.active||now-slot.bornAt>=MIN_RECYCLE_AGE_MS)return{index,now};}return null;}
  function placeSegment(start,end,intensity,tireWidth){const dx=end.absX-start.absX,dz=end.absZ-start.absZ,length=Math.hypot(dx,dz);if(length<MIN_SEGMENT||length>MAX_SEGMENT)return false;const midX=(start.absX+end.absX)*.5,midZ=(start.absZ+end.absZ)*.5,road=roadNormal(midX,midZ);const y=Number.isFinite(road.y)?road.y+.016:(start.ground+end.ground)*.5+.016;forward.set(dx,end.ground-start.ground,dz);forward.addScaledVector(road.up,-forward.dot(road.up));if(forward.lengthSq()<1e-8)return false;forward.normalize();right.crossVectors(road.up,forward).normalize();correctedForward.crossVectors(right,road.up).normalize();basis.makeBasis(right,road.up,correctedForward);const writable=acquireWritableSlot();if(!writable)return true;const slot=slots[writable.index];slot.active=true;slot.bornAt=writable.now;slot.absX=midX;slot.absZ=midZ;slot.y=y;slot.length=length;slot.width=Math.max(.11,Math.min(.38,Number(tireWidth)||.22))*(.72+intensity*.24);slot.quaternion.setFromRotationMatrix(basis);slot.shade=.025+(1-intensity)*.075;write(writable.index);mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;return true;}
  function resetSource(sourceId){const prefix=`${sourceId}:`;for(const key of [...tracks.keys()])if(key.startsWith(prefix))tracks.delete(key);}
  function updateSource(sourceId,contacts,{front=0,rear=0,wheels=null,onRoad=false,distance=0}={}){refreshForFloatingOrigin();if(Number.isFinite(distance)&&distance>REMOTE_DRAW_DISTANCE){resetSource(sourceId);return;}if(!onRoad||!Array.isArray(contacts)||contacts.length!==4){resetSource(sourceId);return;}for(let index=0;index<contacts.length;index++){const c=contacts[index],absX=Number(c?.absX),absZ=Number(c?.absZ),ground=Number(c?.ground);if(!Number.isFinite(absX)||!Number.isFinite(absZ)||!Number.isFinite(ground))continue;const wheelIntensity=Array.isArray(wheels)&&Number.isFinite(Number(wheels[index]))?Number(wheels[index]):(c.front?front:rear);const intensity=smoothstep01(wheelIntensity),key=`${sourceId}:${index}`;let track=tracks.get(key);if(!track){track={absX,absZ,ground,skidding:false};tracks.set(key,track);continue;}const travel=Math.hypot(absX-track.absX,absZ-track.absZ);if(intensity<.055||travel>MAX_SEGMENT){track.absX=absX;track.absZ=absZ;track.ground=ground;track.skidding=false;continue;}if(!track.skidding){track.absX=absX;track.absZ=absZ;track.ground=ground;track.skidding=true;continue;}if(travel>=MIN_SEGMENT){const placed=placeSegment(track,{absX,absZ,ground},intensity,c.width);if(placed){track.absX=absX;track.absZ=absZ;track.ground=ground;}}}}
  function computeSlip({onRoad,speed,steerAngle,lateralGripUsage,wheelGripUsage,wheelSlipLevels,wheelLateralUsage,wheelLongitudinalUsage,contacts,longitudinalAccel,handbrake,vehicle,dt=0}){
    if(!onRoad||Math.abs(speed)<3.4){lateralSquealTime=0;brakingSlipTime=0;for(let i=0;i<4;i++)wheelSlipTime[i]=0;return{front:0,rear:0,wheels:[0,0,0,0],tireAudio:0,brakeAudio:0,onRoad:!!onRoad};}
    if(Array.isArray(wheelGripUsage)&&wheelGripUsage.length===4){
      const safeDt=Math.max(0,Math.min(.05,Number(dt)||0));
      const speedGate=smoothstep01((Math.abs(speed)*3.6-16)/18),handbrakeSpeedGate=smoothstep01((Math.abs(speed)*3.6-10)/16);
      const hasDeepSlip=Array.isArray(wheelSlipLevels)&&wheelSlipLevels.length===4,hasLateralUsage=Array.isArray(wheelLateralUsage)&&wheelLateralUsage.length===4,hasLongitudinalUsage=Array.isArray(wheelLongitudinalUsage)&&wheelLongitudinalUsage.length===4;
      const accelerating=Number(longitudinalAccel)>0.20,braking=Number(longitudinalAccel)<-0.20;
      const globalLateralUsage=Math.max(0,Number(lateralGripUsage)||0);
      const globalLateralRubber=smoothstep01((globalLateralUsage-1.15)/.20);
      const lateralAdhesionCue=smoothstep01((globalLateralUsage-.84)/.36)*.38*speedGate;
      const tireAudioWheels=[0,0,0,0],brakeAudioWheels=[0,0,0,0];
      const wheels=wheelGripUsage.map((usage,index)=>{
        const rear=index===0||index===2;
        if(handbrake&&rear){wheelSlipTime[index]=Math.max(wheelSlipTime[index],.80);tireAudioWheels[index]=handbrakeSpeedGate;return handbrakeSpeedGate;}
        const contactMeta=Array.isArray(contacts)?contacts[index]:null;
        const contactFactor=contactMeta?.contact===false?0:Math.max(0,Math.min(1,Number(contactMeta?.contactFactor)||1));
        const rubberLoadGate=smoothstep01((contactFactor-.55)/.35);
        const deepSlip=hasDeepSlip?Math.max(0,Math.min(1,Number(wheelSlipLevels[index])||0)):smoothstep01((Math.max(0,Number(usage)||0)-1.16)/.34);
        const lateralUtil=hasLateralUsage?Math.max(0,Number(wheelLateralUsage[index])||0):0;
        const longitudinalUtil=hasLongitudinalUsage?Math.max(0,Number(wheelLongitudinalUsage[index])||0):0;
        const conservativeLateralUtil=Math.min(lateralUtil,globalLateralUsage*1.18+.06);
        const wheelLateralBias=.62+.38*smoothstep01((conservativeLateralUtil-1.02)/.30);
        const lateralRubber=globalLateralRubber*wheelLateralBias*rubberLoadGate;

        // V21.27 visual follow-up — a genuinely deep lateral slide can deposit
        // rubber even before the slower vehicle-wide lateralGripUsage filter has
        // caught up. This is especially important immediately after an oblique
        // landing (P4), where wheel slip is already real but the global envelope
        // is still rebuilding. It is visual-only: no grip/force state is changed.
        const deepLateralRubber=hasLateralUsage
          ?smoothstep01((lateralUtil-1.08)/.42)*smoothstep01((deepSlip-.38)/.42)*rubberLoadGate
          :0;

        const driveRubber=accelerating&&hasLongitudinalUsage?smoothstep01((longitudinalUtil-1.40)/.34)*smoothstep01((deepSlip-.82)/.18)*rubberLoadGate:0;
        const brakeRubber=braking&&hasLongitudinalUsage?smoothstep01((longitudinalUtil-1.26)/.30)*smoothstep01((deepSlip-.76)/.24)*rubberLoadGate:0;
        const driveAudio=accelerating&&hasLongitudinalUsage?smoothstep01((longitudinalUtil-1.08)/.32)*smoothstep01((deepSlip-.42)/.42)*rubberLoadGate:0;
        const brakeAudio=braking&&hasLongitudinalUsage?smoothstep01((longitudinalUtil-.95)/.34)*smoothstep01((deepSlip-.34)/.42)*rubberLoadGate:0;
        const mixedRubber=globalLateralRubber>.02&&lateralUtil>.85&&longitudinalUtil>.48?globalLateralRubber*smoothstep01((deepSlip-.84)/.16)*rubberLoadGate*.82:0;
        const raw=Math.max(lateralRubber,deepLateralRubber,driveRubber,brakeRubber,mixedRubber)*speedGate;
        const markLinkedAudio=raw>.02?Math.min(1,.30+raw*.70):0;
        tireAudioWheels[index]=Math.max(markLinkedAudio,driveAudio*.72*speedGate,brakeAudio*.48*speedGate);
        brakeAudioWheels[index]=Math.max(brakeAudio*.78*speedGate,brakeRubber>0?Math.min(1,.26+brakeRubber*.74)*speedGate:0);
        if(raw>.035)wheelSlipTime[index]+=safeDt;else wheelSlipTime[index]=0;
        const intenseLateral=deepLateralRubber>.72;
        const delay=intenseLateral?.18:raw>.86?.36:raw>.62?.56:.84;
        return wheelSlipTime[index]>=delay?raw:0;
      });
      return{front:Math.max(wheels[1]||0,wheels[3]||0),rear:Math.max(wheels[0]||0,wheels[2]||0),wheels,tireAudio:Math.max(lateralAdhesionCue,...tireAudioWheels),brakeAudio:Math.max(...brakeAudioWheels),onRoad:true};
    }
    const gripUsage=Math.max(0,Number(lateralGripUsage)||0),lateralSqueal=smoothstep01((gripUsage-.98)/.17);
    if(lateralSqueal>.001)lateralSquealTime+=Math.max(0,Math.min(.05,Number(dt)||0));else lateralSquealTime=0;
    const lateralSlip=lateralSquealTime>=LATERAL_MARK_DELAY?lateralSqueal:0;
    const brakingG=Math.max(0,-(Number(longitudinalAccel)||0)/9.81),brakeCapabilityG=Math.max(.70,(Number(vehicle?.brake)||9.8)/9.81),brakeStart=Math.max(.48,brakeCapabilityG*.62),brakeFull=Math.max(brakeStart+.24,brakeCapabilityG*.92),rawBrakeSlip=smoothstep01((brakingG-brakeStart)/Math.max(.01,brakeFull-brakeStart));
    if(rawBrakeSlip>.001)brakingSlipTime+=Math.max(0,Math.min(.05,Number(dt)||0));else brakingSlipTime=0;
    const brakeSlip=brakingSlipTime>=BRAKE_MARK_DELAY?rawBrakeSlip:0,speedGate=smoothstep01((Math.abs(speed)*3.6-12)/18),handbrakeSlip=handbrake?speedGate:0;
    const front=Math.max(lateralSlip*.72,brakeSlip),rear=Math.max(lateralSlip,brakeSlip*.72,handbrakeSlip);
    return{front,rear,wheels:[rear,front,rear,front],tireAudio:Math.max(lateralSqueal*.82*speedGate,handbrakeSlip),brakeAudio:rawBrakeSlip*speedGate*.82,onRoad:true};
  }
  function updateLocal(args){localState=computeSlip(args);updateSource('local',args.contacts,localState);return localState;}
  function updateRemote({peerId,contacts,front,rear,onRoad,distance}){if(!peerId)return;updateSource(`remote:${peerId}`,contacts,{front,rear,onRoad,distance});}
  function clear(){tracks.clear();nextSlot=0;lateralSquealTime=0;brakingSlipTime=0;for(let i=0;i<4;i++)wheelSlipTime[i]=0;for(let i=0;i<slots.length;i++){slots[i].active=false;slots[i].bornAt=0;hide(i);}mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  return{updateLocal,updateRemote,resetSource,clear,get localState(){return{...localState};}};
}
