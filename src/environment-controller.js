export function createEnvironmentController({
  THREE,
  $,
  appSettings,
  camera,
  scene,
  worldStreaming,
  queueSettingsSave,
  hemi,
  sun,
  moonLight,
  moonMaterial,
  moonSprite,
  vehicleVisuals,
  moonDirection,
  updateMoonSkyPosition,
}){
  const DISPLAY_DISTANCE_PROFILES={
    low:{
      label:'Basse',
      cameraFar:3200,
      fogDensity:.00102,
      streamingScale:.96
    },
  
    medium:{
      label:'Moyenne',
      cameraFar:4500,
      fogDensity:.00082,
      streamingScale:1.32
    },
  
    high:{
      label:'Haute',
      cameraFar:6500,
      fogDensity:.00058,
      streamingScale:1.82
    }
  };
  
  function applyDisplayDistanceProfile(
    requestedProfile,
    {
      save=false
    }={}
  ){
    const key=
      DISPLAY_DISTANCE_PROFILES[
        requestedProfile
      ]
        ?requestedProfile
        :'high';
  
    const profile=
      DISPLAY_DISTANCE_PROFILES[key];
  
    appSettings.displayDistance=key;
  
    camera.far=
      profile.cameraFar;
  
    camera.updateProjectionMatrix();
  
    if(scene.fog){
      scene.fog.density=
        profile.fogDensity;
    }
  
    worldStreaming.setDistanceScale?.(
      profile.streamingScale
    );
  
    if(save){
      queueSettingsSave();
    }
  
    const select=$('v21DisplayDistance');
  
    if(select){
      select.value=key;
    }
  
    return key;
  }
  
  // ---------- V5 time-of-day prototype ----------
  const timeSlider=$('timeSlider'),timeLabel=$('timeLabel');
  let timeOfDay=12;
  function setTimeOfDay(hour){
    timeOfDay=((Number(hour)%24)+24)%24;
    const hh=Math.floor(timeOfDay),mm=Math.round((timeOfDay-hh)*60)%60;
    timeLabel.textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
  
    const daylight=Math.max(0,Math.sin((timeOfDay-6)/12*Math.PI));
  
    // Smoothly bring moonlight in through dusk and remove it through dawn.
    // This keeps the transition compatible with the existing automatic lights.
    const nightFactor=
      1-Math.min(
        1,
        daylight/.24
      );
  
    scene.background=
      new THREE.Color().setHSL(
        .58,
        .45,
        .08+.50*daylight
      );
  
    scene.fog.color.copy(
      scene.background
    );
  
    hemi.intensity=
      .10+
      2.05*daylight;
  
    sun.intensity=
      .03+
      2.55*daylight;
  
    // A little directional blue moonlight makes body panels readable without
    // flattening the night scene. No moon shadows: cheap enough for multiplayer.
    moonLight.intensity=
      .22*
      nightFactor;
  
    moonMaterial.opacity=
      .92*
      nightFactor;
  
    moonSprite.visible=
      nightFactor>.02;
  
    vehicleVisuals.updateAutomaticHeadlights(daylight);
  
    const a=(timeOfDay-6)/12*Math.PI;
  
    sun.position.set(
      Math.cos(a)*900,
      Math.max(
        35,
        Math.sin(a)*950
      ),
      420
    );
  
    // Move the crescent through a simple east-to-west night arc.
    const nightHour=
      timeOfDay>=18
        ?timeOfDay-18
        :timeOfDay+6;
  
    const moonArc=
      Math.max(
        0,
        Math.min(
          12,
          nightHour
        )
      )/
      12*
      Math.PI;
  
    moonDirection.set(
      Math.cos(moonArc)*.72,
      .18+Math.sin(moonArc)*.82,
      -.58
    ).normalize();
  
    updateMoonSkyPosition();
  }
  timeSlider.addEventListener('input',e=>setTimeOfDay(e.target.value));

  return {
    applyDisplayDistanceProfile,
    setTimeOfDay,
    timeSlider,
    timeLabel,
    getTimeOfDay:()=>timeOfDay
  };
}
