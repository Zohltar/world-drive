export function createAutopilotController({
  state,
  $,
  nearestRoute,
  recenterIfNeeded,
  routePointAtCum,
  angleDelta,
  queueSettingsSave,
  syncRuntimeControls,
  toast,
}){
  function setAutopilot(enabled,message=''){
    state.autopilot=enabled;
    $('autopilotBtn').textContent='Pilote auto: '+(state.autopilot?'ON':'OFF');
    $('autopilotStatus').textContent=state.autopilot?'ACTIF':'OFF';

    if(state.autopilot){
      state.assist=true;
      state.appSettings.assist=true;
      queueSettingsSave();
      $('assist').textContent='Assist: ON';
      state.roadContact=true;

      const n=nearestRoute(state.absX,state.absZ);
      if(n&&n.d>6){
        state.absX=n.px;
        state.absZ=n.pz;
        recenterIfNeeded(state.absX,state.absZ,true);
      }

      toast(message||'Pilote automatique activé');
    }else{
      state.autopilotSteer=0;
      toast(message||'Pilote automatique désactivé');
    }

    syncRuntimeControls();
  }

  function toggleAutopilot(){
    setAutopilot(!state.autopilot);
  }

  function autopilotControl(dt,nr){
    if(!state.autopilot||!nr||!state.routeLength){
      return {throttle:0,turn:0,hand:false};
    }

    const kmh=Math.abs(state.speed)*3.6;
    const lookAhead=Math.max(18,Math.min(105,18+kmh*.40));
    const target=routePointAtCum(
      Math.min(state.routeLength-1,nr.cum+lookAhead)
    );

    const desired=Math.atan2(target.x-state.absX,target.z-state.absZ);
    const headingErr=angleDelta(desired,state.heading);

    const lateralSign=Math.sign(
      Math.sin(nr.angle)*(state.absZ-nr.pz)-
      Math.cos(nr.angle)*(state.absX-nr.px)
    )||0;
    const crossTrack=Math.min(1,nr.d/5)*lateralSign;
    const steerRequest=Math.max(
      -1,
      Math.min(1,headingErr*1.55-crossTrack*.34)
    );

    state.autopilotSteer+=(steerRequest-state.autopilotSteer)*(
      1-Math.exp(-dt*(kmh>130?4.5:6.5))
    );

    let maxCurve=0;
    const step=Math.max(12,lookAhead*.45);
    let prev=routePointAtCum(
      Math.min(state.routeLength-1,nr.cum+step)
    );

    for(let d=step*2;d<=lookAhead*2.6;d+=step){
      const q=routePointAtCum(
        Math.min(state.routeLength-1,nr.cum+d)
      );
      const ds=Math.max(5,q.cum-prev.cum);
      maxCurve=Math.max(
        maxCurve,
        Math.abs(angleDelta(q.angle,prev.angle))/ds
      );
      prev=q;
    }

    const curveSpeed=maxCurve>.00015
      ?Math.sqrt(3.0/maxCurve)
      :state.maxSpeedMps;

    const roadLimit=(
      state.obeyRoadSpeedLimits&&
      state.activeRoadMeta.maxspeed
    )
      ?state.activeRoadMeta.maxspeed/3.6
      :state.maxSpeedMps;

    let targetSpeed=Math.min(
      state.maxSpeedMps,
      roadLimit,
      Math.max(7.5,curveSpeed)
    );

    const remaining=state.routeLength-nr.cum;
    if(remaining<120){
      targetSpeed=Math.min(
        targetSpeed,
        Math.sqrt(Math.max(0,remaining)*5.2)
      );
    }
    if(remaining<8)targetSpeed=0;

    const errorV=targetSpeed-state.speed;
    let throttle=0;
    if(errorV>1.0)throttle=Math.min(1,.30+errorV/5);
    else if(errorV>.12)throttle=Math.max(.08,errorV/1.2);
    else if(errorV<-.25)throttle=Math.max(-1,errorV/3.5);

    if(remaining<5&&Math.abs(state.speed)<.45){
      state.speed=0;
      setAutopilot(false,'Arrivée à destination');
    }

    return {
      throttle,
      turn:state.autopilotSteer,
      hand:false
    };
  }

  function toggleAssist(){
    if(state.autopilot){
      setAutopilot(false,'Pilote auto désactivé');
    }
    state.assist=!state.assist;
    state.appSettings.assist=state.assist;
    queueSettingsSave();
    $('assist').textContent='Assist: '+(state.assist?'ON':'OFF');
    syncRuntimeControls();
    toast('Assistance '+(state.assist?'activée':'désactivée'));
  }

  function updateSpeedLimitModeUI(){
    const speedLimitModeBtn=$('speedLimitModeBtn');
    if(!speedLimitModeBtn)return;

    speedLimitModeBtn.textContent=
      'Limites route: '+
      (state.obeyRoadSpeedLimits?'ON':'OFF');

    speedLimitModeBtn.classList.toggle(
      'active',
      state.obeyRoadSpeedLimits
    );

    speedLimitModeBtn.title=
      state.obeyRoadSpeedLimits
        ?'Le pilote automatique respecte les limites OSM'
        :'Le pilote automatique ignore les limites OSM';
  }

  function toggleRoadSpeedLimits(){
    state.obeyRoadSpeedLimits=!state.obeyRoadSpeedLimits;
    state.appSettings.obeyRoadSpeedLimits=state.obeyRoadSpeedLimits;
    queueSettingsSave();
    updateSpeedLimitModeUI();
    syncRuntimeControls();

    if(state.obeyRoadSpeedLimits&&state.activeRoadMeta.maxspeed){
      toast(
        `Limites route ON · ${Math.round(state.activeRoadMeta.maxspeed)} km/h`
      );
    }else{
      toast('Limites route '+(state.obeyRoadSpeedLimits?'ON':'OFF'));
    }
  }

  return {
    setAutopilot,
    toggleAutopilot,
    autopilotControl,
    toggleAssist,
    updateSpeedLimitModeUI,
    toggleRoadSpeedLimits
  };
}
