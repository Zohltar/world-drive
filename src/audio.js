// World Drive - vehicle audio
// Profile-aware WebAudio synthesis.
// F1 uses a dedicated dark 12,000-rpm V8 model with no aggressive high harmonics.

export function computeGearRedlineSpeeds(
  profile,
  effectiveRedlineRpm=null
){
  const nominalRedline=
    Math.max(
      1000,
      Number(profile.redlineRpm)||6500
    );

  const referenceRedline=
    Math.max(
      1000,
      Number(profile.referenceRedlineRpm)||
      nominalRedline
    );

  const referenceTopSpeed=
    Math.max(
      20,
      Number(profile.referenceTopGearRedlineKmh)||
      200
    );

  const ratios=
    Array.isArray(profile.gearRatios)&&
    profile.gearRatios.length
      ?profile.gearRatios
       .map(Number)
       .filter(
         value=>
           Number.isFinite(value)&&
           value>0
       )
      :[1];

  const effectiveRedline=
    Math.max(
      800,
      Number(effectiveRedlineRpm)||
      nominalRedline
    );

  const referenceTopGearRatio=
    Math.max(
      .05,
      Number(profile.referenceTopGearRatio)||
      1
    );

  const currentTopGearRatio=
    Math.max(
      .05,
      ratios[
        ratios.length-1
      ]
    );

  // Calibration rule:
  // referenceTopSpeed occurs at referenceRedline with the calibrated
  // reference top-gear ratio. Changing engine redline or any ratio therefore
  // changes the mechanical redline speed automatically.
  const topSpeed=
    referenceTopSpeed*
    (
      effectiveRedline/
      referenceRedline
    )*
    (
      referenceTopGearRatio/
      currentTopGearRatio
    );

  return ratios.map(
    ratio=>
      topSpeed*
      (
        currentTopGearRatio/
        ratio
      )
  );
}

export function computeTransmissionState(
  kmh,
  load,
  profile,
  forcedGear=null
){
  const idle=
    Math.max(
      500,
      Number(profile.idleRpm)||850
    );

  const nominalRedline=
    Math.max(
      idle+1000,
      Number(profile.redlineRpm)||6500
    );

  const gearRedlineSpeeds=
    computeGearRedlineSpeeds(
      profile,
      nominalRedline
    );

  let gear=
    Number.isFinite(Number(forcedGear))&&
    Number(forcedGear)>=1
      ?Math.round(Number(forcedGear))
      :1;

  gear=
    Math.max(
      1,
      Math.min(
        gearRedlineSpeeds.length,
        gear
      )
    );

  if(
    !Number.isFinite(Number(forcedGear))||
    Number(forcedGear)<1
  ){
    while(
      gear<gearRedlineSpeeds.length&&
      kmh>=gearRedlineSpeeds[gear-1]
    ){
      gear++;
    }
  }

  const redlineSpeed=
    Math.max(
      1,
      gearRedlineSpeeds[
        Math.min(
          gearRedlineSpeeds.length-1,
          gear-1
        )
      ]
    );

  // Fixed gear = RPM proportional to road speed.
  // First gear uses clutch slip near launch so engine speed cannot fall below
  // idle while the car is almost stationary.
  let rpm=
    nominalRedline*
    (
      Math.max(0,kmh)/
      redlineSpeed
    );

  if(gear===1){
    const clutchLift=
      Math.min(
        420,
        (nominalRedline-idle)*.065
      )*
      Math.max(
        0,
        Math.min(
          1,
          Number(load)||0
        )
      );

    rpm=
      Math.max(
        idle+clutchLift,
        rpm
      );
  }else{
    rpm=
      Math.max(
        idle,
        rpm
      );
  }

  const local=
    Math.max(
      0,
      Math.min(
        1,
        rpm/
        nominalRedline
      )
    );

  return {
    rpm:Math.min(
      nominalRedline,
      rpm
    ),
    mechanicalRpm:rpm,
    gear,
    local,
    redlineSpeedKmh:redlineSpeed,
    gearRedlineSpeeds
  };
}

export function createVehicleAudio({
  statusEl,
  enableButton,
  vehicle,
  getProfile=()=>({type:'ev',profile:'id4'}),
  getState,
  getNearestRoute
}) {
  const MASTER_GAIN=.34;

  let ctx=null;
  let master=null;
  let ready=false;
  let enabled=false;

  let motorOsc1=null;
  let motorOsc2=null;
  let motorGain=null;
  let motorFilter=null;

  let exhaustOsc1=null;
  let exhaustOsc2=null;
  let exhaustGain=null;
  let exhaustFilter=null;

  let turboOsc=null;
  let turboGain=null;

  let tireNoise=null;
  let tireGain=null;
  let tireFilter=null;
  let tireBuffer=null;

  let brakeNoise=null;
  let brakeGain=null;
  let brakeFilter=null;
  let brakeBuffer=null;

  const TIRE_SAMPLE_URL='./assets/audio/tire-squeal.mp3';
  const BRAKE_SAMPLE_URL='./assets/audio/brake-squeal.mp3';

  let currentProfile=getProfile?.()||{type:'ev',profile:'id4'};

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function syncButton(){
    if(!enableButton)return;

    // Keep the requested label; color communicates the actual mode.
    enableButton.textContent='Activer audio';
    enableButton.classList.toggle('audioOn',enabled);
    enableButton.classList.toggle('audioOff',!enabled);
    enableButton.setAttribute(
      'aria-pressed',
      enabled?'true':'false'
    );
    enableButton.title=
      enabled
        ?'Audio ON — cliquer pour couper'
        :'Audio OFF — cliquer pour activer';
  }

  function makeNoiseBuffer(seconds=2){
    const n=Math.floor(ctx.sampleRate*seconds);
    const buffer=ctx.createBuffer(1,n,ctx.sampleRate);
    const data=buffer.getChannelData(0);

    let last=0;
    for(let i=0;i<n;i++){
      const white=Math.random()*2-1;
      last=last*.72+white*.28;
      data[i]=last;
    }

    return buffer;
  }

  async function loadAudioSample(url,label){
    try{
      const response=await fetch(url);
      if(!response.ok){
        throw new Error(`HTTP ${response.status}`);
      }

      const bytes=await response.arrayBuffer();
      return await ctx.decodeAudioData(bytes);
    }catch(error){
      console.warn(`${label} sample failed to load`,error);
      return null;
    }
  }

  async function loadTireSample(){
    tireBuffer=await loadAudioSample(
      TIRE_SAMPLE_URL,
      'Tire squeal'
    );
    return !!tireBuffer;
  }

  async function loadBrakeSample(){
    brakeBuffer=await loadAudioSample(
      BRAKE_SAMPLE_URL,
      'Brake squeal'
    );
    return !!brakeBuffer;
  }

  function buildNodes(){
    master=ctx.createGain();
    master.gain.value=MASTER_GAIN;
    master.connect(ctx.destination);

    // EV layer.
    motorOsc1=ctx.createOscillator();
    motorOsc2=ctx.createOscillator();
    motorOsc1.type='sine';
    motorOsc2.type='triangle';

    motorGain=ctx.createGain();
    motorGain.gain.value=.0001;

    motorFilter=ctx.createBiquadFilter();
    motorFilter.type='lowpass';
    motorFilter.frequency.value=1300;

    motorOsc1.connect(motorGain);
    motorOsc2.connect(motorGain);
    motorGain.connect(motorFilter);
    motorFilter.connect(master);

    motorOsc1.start();
    motorOsc2.start();

    // Boxer combustion layer. Two harmonically related oscillators deliberately
    // use a slightly asymmetric ratio to suggest the classic uneven boxer pulse.
    exhaustOsc1=ctx.createOscillator();
    exhaustOsc2=ctx.createOscillator();
    exhaustOsc1.type='sawtooth';
    exhaustOsc2.type='triangle';

    exhaustGain=ctx.createGain();
    exhaustGain.gain.value=.0001;

    exhaustFilter=ctx.createBiquadFilter();
    exhaustFilter.type='lowpass';
    exhaustFilter.frequency.value=520;
    exhaustFilter.Q.value=.72;

    exhaustOsc1.connect(exhaustGain);
    exhaustOsc2.connect(exhaustGain);
    exhaustGain.connect(exhaustFilter);
    exhaustFilter.connect(master);

    exhaustOsc1.start();
    exhaustOsc2.start();

    // Turbo whistle.
    turboOsc=ctx.createOscillator();
    turboOsc.type='sine';
    turboGain=ctx.createGain();
    turboGain.gain.value=.0001;
    turboOsc.connect(turboGain);
    turboGain.connect(master);
    turboOsc.start();

    // Tire scrub uses the supplied real-world sample instead of synthesized
    // noise. Gain/filter remain persistent; the looping source is created once
    // the MP3 has decoded.
    tireGain=ctx.createGain();
    tireGain.gain.value=.0001;

    tireFilter=ctx.createBiquadFilter();
    tireFilter.type='bandpass';
    tireFilter.frequency.value=1250;
    tireFilter.Q.value=.55;

    tireFilter.connect(tireGain);
    tireGain.connect(master);

    // Second real-world sample for high tire/brake stress.
    brakeGain=ctx.createGain();
    brakeGain.gain.value=.0001;

    brakeFilter=ctx.createBiquadFilter();
    brakeFilter.type='bandpass';
    brakeFilter.frequency.value=1180;
    brakeFilter.Q.value=.60;

    brakeFilter.connect(brakeGain);
    brakeGain.connect(master);
  }

  async function wake(){
    if(!enabled){
      setStatus('OFF');
      syncButton();
      return;
    }

    if(ready){
      if(ctx?.state==='suspended'){
        try{
          await ctx.resume();
        }catch(error){
          console.warn('Audio resume failed',error);
        }
      }

      if(master&&ctx?.state==='running'){
        try{
          const now=ctx.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(
            MASTER_GAIN,
            now
          );
        }catch(error){
          console.warn(
            'Audio master gain restore failed',
            error
          );
        }
      }

      setStatus(
        ctx?.state==='running'
          ?'ON'
          :'Suspendu'
      );
      syncButton();
      return;
    }

    const AudioContextClass=
      window.AudioContext||
      window.webkitAudioContext;

    if(!AudioContextClass){
      setStatus('Non supporté');
      return;
    }

    ctx=new AudioContextClass();
    buildNodes();

    if(await loadTireSample()){
      tireNoise=ctx.createBufferSource();
      tireNoise.buffer=tireBuffer;
      tireNoise.loop=true;

      if(tireBuffer.duration>5){
        tireNoise.loopStart=1.7;
        tireNoise.loopEnd=Math.max(
          2.5,
          tireBuffer.duration-.65
        );
      }

      tireNoise.connect(tireFilter);
      tireNoise.start(0,tireNoise.loopStart||0);
    }

    if(await loadBrakeSample()){
      brakeNoise=ctx.createBufferSource();
      brakeNoise.buffer=brakeBuffer;
      brakeNoise.loop=true;

      if(brakeBuffer.duration>2.5){
        brakeNoise.loopStart=.35;
        brakeNoise.loopEnd=Math.max(
          1.0,
          brakeBuffer.duration-.30
        );
      }

      brakeNoise.connect(brakeFilter);
      brakeNoise.start(0,brakeNoise.loopStart||0);
    }

    ready=true;

    try{
      await ctx.resume();
    }catch(error){
      console.warn('Audio start failed',error);
    }

    if(master&&ctx.state==='running'){
      const now=ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(
        MASTER_GAIN,
        now
      );
    }

    setStatus(
      ctx.state==='running'
        ?'ON'
        :'Suspendu'
    );
    syncButton();
  }

  async function setEnabled(nextEnabled){
    enabled=!!nextEnabled;
    syncButton();

    if(enabled){
      await wake();
      return;
    }

    setStatus('OFF');

    if(master&&ctx){
      try{
        const now=ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(
          .0001,
          now
        );
      }catch(error){}
    }

    if(ctx?.state==='running'){
      try{
        await ctx.suspend();
      }catch(error){
        console.warn('Audio suspend failed',error);
      }
    }
  }

  function toggle(){
    return setEnabled(!enabled);
  }

  function estimateCombustionRpm(kmh,load,profile,forcedGear=null){
    return computeTransmissionState(kmh,load,profile,forcedGear);
  }

  function update(){
    if(!enabled){
      setStatus('OFF');
      return;
    }

    if(!ready||!ctx)return;

    if(ctx.state!=='running'){
      setStatus('Suspendu');
      return;
    }

    const now=ctx.currentTime;
    const state=getState?.()||{};
    const kmh=Math.abs(state.speed||0)*3.6;
    const accelLoad=Math.min(
      1,
      Math.abs(state.longitudinalAccel||0)/7.5
    );

    currentProfile=getProfile?.()||currentProfile;

    if(currentProfile.type==='combustion'){
      const fallbackTransmission=
        estimateCombustionRpm(
          kmh,
          accelLoad,
          currentProfile,
          state.transmissionGear
        );

      const rpm=
        Number.isFinite(Number(state.engineRpm))
          ?Number(state.engineRpm)
          :fallbackTransmission.rpm;

      const gear=
        Number.isFinite(Number(state.transmissionGear))
          ?Number(state.transmissionGear)
          :fallbackTransmission.gear;

      const local=fallbackTransmission.local;

      const isF1=
        currentProfile.profile==='f1-v8';

      if(isF1){
        // F1 synth rebuilt from scratch:
        // intentionally dark, low/mid focused, and capped at 12,000 rpm.
        const idle=
          currentProfile.idleRpm||3200;

        const redline=
          currentProfile.redlineRpm||12000;

        const rpmNorm=
          Math.max(
            0,
            Math.min(
              1,
              (rpm-idle)/
              Math.max(
                1,
                redline-idle
              )
            )
          );

        // Four-stroke V8 firing rate.
        const firingHz=
          rpm/60*4;

        // Deliberately use sub-harmonics of firing frequency.
        // At 12,000 rpm:
        // low ~= 176 Hz, body ~= 344 Hz, edge ~= 520 Hz.
        // This keeps the engine deep instead of shrill.
        const lowOrder=
          firingHz*.22;

        const bodyOrder=
          firingHz*.43;

        const edgeOrder=
          firingHz*.65;

        exhaustOsc1.type='sawtooth';
        exhaustOsc2.type='triangle';
        turboOsc.type='triangle';

        exhaustOsc1.frequency.setTargetAtTime(
          Math.max(
            70,
            lowOrder
          ),
          now,
          .030
        );

        exhaustOsc2.frequency.setTargetAtTime(
          Math.max(
            110,
            bodyOrder
          ),
          now,
          .030
        );

        turboOsc.frequency.setTargetAtTime(
          Math.max(
            150,
            edgeOrder
          ),
          now,
          .035
        );

        // Keep the entire engine dark.
        // Even at redline the low-pass remains below ~2.2 kHz.
        exhaustFilter.type='lowpass';
        exhaustFilter.frequency.setTargetAtTime(
          900+
          rpmNorm*950+
          accelLoad*280,
          now,
          .050
        );

        exhaustFilter.Q.setTargetAtTime(
          .42,
          now,
          .050
        );

        // Main exhaust body dominates the sound.
        const exhaustVol=
          .075+
          rpmNorm*.095+
          accelLoad*.050;

        exhaustGain.gain.setTargetAtTime(
          Math.min(
            .205,
            exhaustVol
          ),
          now,
          .040
        );

        // Third layer only adds texture/body.
        // It is intentionally quiet and never becomes a whistle.
        turboGain.gain.setTargetAtTime(
          .003+
          rpmNorm*.010+
          accelLoad*.006,
          now,
          .045
        );

        // No EV layer.
        motorGain.gain.setTargetAtTime(
          .0001,
          now,
          .040
        );
      }else{
        // Road-car combustion model. Preserve the boxer-turbo character used
        // by WRX and generic combustion vehicles, with a dedicated naturally
        // aspirated V12 texture for the Countach.
        const isCountachV12=
          currentProfile.profile==='countach-v12';

        const fireHz=
          isCountachV12
            ?rpm/60*6
            :rpm/60*2;

        exhaustOsc1.type='sawtooth';
        exhaustOsc2.type='triangle';
        turboOsc.type='sine';

        exhaustOsc1.frequency.setTargetAtTime(
          Math.max(
            28,
            fireHz*(isCountachV12 ? .32 : .50)
          ),
          now,
          .035
        );

        exhaustOsc2.frequency.setTargetAtTime(
          Math.max(
            34,
            fireHz*(isCountachV12 ? .54 : .93)
          ),
          now,
          .040
        );

        const exhaustVol=
          kmh<1
            ?.035
            :Math.min(
                .19,
                .045+
                accelLoad*.105+
                kmh/2700
              );

        exhaustGain.gain.setTargetAtTime(
          exhaustVol,
          now,
          .045
        );

        exhaustFilter.type='lowpass';
        exhaustFilter.frequency.setTargetAtTime(
          isCountachV12
            ?520+accelLoad*980+rpm/9
            :360+accelLoad*780+rpm/13,
          now,
          .055
        );

        exhaustFilter.Q.setTargetAtTime(
          .72,
          now,
          .055
        );

        const boostGate=
          Math.max(
            0,
            Math.min(
              1,
              (kmh-18)/65
            )
          );

        turboOsc.frequency.setTargetAtTime(
          850+
          rpm*.19,
          now,
          .055
        );

        turboGain.gain.setTargetAtTime(
          isCountachV12
            ? .0001
            :Math.max(
                .0001,
                boostGate*
                accelLoad*
                .055
              ),
          now,
          .045
        );

        motorGain.gain.setTargetAtTime(
          .0001,
          now,
          .04
        );
      }    }else{
      // ID4 EV whine, preserving the original World Drive character.
      const f1=72+kmh*3.0;
      const f2=f1*2.04;

      motorOsc1.frequency.setTargetAtTime(
        f1,
        now,
        .055
      );
      motorOsc2.frequency.setTargetAtTime(
        f2,
        now,
        .055
      );

      const motorVol=
        kmh<1
          ?.0001
          :Math.min(
              .11,
              .018+
              kmh/1900+
              accelLoad*.035
            );

      motorGain.gain.setTargetAtTime(
        motorVol,
        now,
        .07
      );

      // Mute combustion/turbo layers.
      exhaustGain.gain.setTargetAtTime(
        .0001,
        now,
        .04
      );
      turboGain.gain.setTargetAtTime(
        .0001,
        now,
        .04
      );
    }

    // V18K — lateral tire audio now uses the SAME grip saturation value as
    // vehicle physics. Steering input by itself can no longer trigger squeal.
    const speed=state.speed||0;

    const gripUsage=
      Math.max(
        0,
        Number(state.lateralGripUsage)||0
      );

    const brakingG=
      Math.max(
        0,
        -(state.longitudinalAccel||0)/9.81
      );

    // Start only at the real adhesion limit. The small .98 allowance avoids
    // numerical flutter exactly around 1.00 after the shared physical buildup.
    const lateralNorm=
      Math.max(
        0,
        Math.min(
          1,
          (gripUsage-.98)/.17
        )
      );

    const brakingNorm=
      Math.max(
        0,
        Math.min(
          1,
          (brakingG-.22)/.78
        )
      );

    const tireLevel=
      lateralNorm*lateralNorm*
      (3-2*lateralNorm);

    // Brake sample is now purely longitudinal. A corner by itself should not
    // produce brake squeal in addition to the tire scrub sample.
    const brakeLevel=
      brakingNorm*brakingNorm*
      (3-2*brakingNorm);

    const speedGate=
      Math.max(
        0,
        Math.min(
          1,
          (kmh-12)/28
        )
      );

    tireFilter?.frequency.setTargetAtTime(
      950+
      tireLevel*1100+
      Math.min(260,kmh*.95),
      now,
      .04
    );

    brakeFilter?.frequency.setTargetAtTime(
      900+
      brakeLevel*1250+
      Math.min(280,kmh*1.05),
      now,
      .04
    );

    const tireVol=
      tireBuffer
        ?tireLevel*speedGate*.42
        :0;

    const brakeVol=
      brakeBuffer
        ?brakeLevel*speedGate*.40
        :0;

    // Only tiny smoothing to avoid clicks; perceptually this is immediate.
    tireGain?.gain.setTargetAtTime(
      Math.max(.0001,tireVol),
      now,
      .018
    );

    brakeGain?.gain.setTargetAtTime(
      Math.max(.0001,brakeVol),
      now,
      .018
    );

    setStatus('ON');
  }

  function setProfile(profile){
    currentProfile=profile||getProfile?.()||currentProfile;

    if(!ready||!ctx)return;

    const now=ctx.currentTime;
    motorGain?.gain.setTargetAtTime(.0001,now,.025);
    exhaustGain?.gain.setTargetAtTime(.0001,now,.025);
    turboGain?.gain.setTargetAtTime(.0001,now,.025);
    tireGain?.gain.setTargetAtTime(.0001,now,.018);
    brakeGain?.gain.setTargetAtTime(.0001,now,.018);
  }

  function isRunning(){
    return !!(
      enabled &&
      ready &&
      ctx &&
      ctx.state==='running'
    );
  }

  function showActivationHint(){
    if(!enabled){
      setStatus('OFF');
    }else if(!isRunning()){
      setStatus('Clique Activer');
    }
    syncButton();
  }

  function showError(){
    setStatus('Erreur audio');
  }

  if(enableButton){
    syncButton();

    enableButton.addEventListener('click',event=>{
      event.stopPropagation();

      toggle().catch(error=>{
        console.warn('Audio toggle failed',error);
        showError();
      });
    });
  }

  addEventListener(
    'pointerdown',
    ()=>{
      if(enabled&&(!ready||ctx?.state!=='running')){
        wake().catch(()=>{});
      }
    },
    {passive:true}
  );

  addEventListener(
    'keydown',
    ()=>{
      if(enabled&&(!ready||ctx?.state!=='running')){
        wake().catch(()=>{});
      }
    },
    {passive:true}
  );

  addEventListener(
    'gamepadconnected',
    ()=>{
      setStatus(
        enabled&&ready&&ctx?.state==='running'
          ?'ON'
          :'OFF'
      );
    }
  );

  return {
    update,
    wake,
    setProfile,
    isRunning,
    showActivationHint,
    showError,

    toggle,
    setEnabled,

    // Compatibility aliases for gamepad/input modules.
    enable:()=>setEnabled(true),
    disable:()=>setEnabled(false),
    resume:wake,

    get enabled(){
      return enabled;
    },

    get ready(){
      return ready;
    }
  };
}
