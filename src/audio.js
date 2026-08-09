// World Drive - vehicle audio
// Profile-aware WebAudio synthesis: EV whine for ID4 and boxer-turbo combustion
// character for WRX. No external audio assets required.

export function createVehicleAudio({
  statusEl,
  enableButton,
  vehicle,
  getProfile=()=>({type:'ev',profile:'id4'}),
  getState,
  getNearestRoute
}) {
  let ctx=null;
  let master=null;
  let ready=false;

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
  let currentProfile=getProfile?.()||{type:'ev',profile:'id4'};

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
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

  function buildNodes(){
    master=ctx.createGain();
    master.gain.value=.34;
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

    // Shared tire scrub.
    tireNoise=ctx.createBufferSource();
    tireNoise.buffer=makeNoiseBuffer(2);
    tireNoise.loop=true;

    tireGain=ctx.createGain();
    tireGain.gain.value=.0001;

    const tireFilter=ctx.createBiquadFilter();
    tireFilter.type='bandpass';
    tireFilter.frequency.value=1450;
    tireFilter.Q.value=.75;

    tireNoise.connect(tireFilter);
    tireFilter.connect(tireGain);
    tireGain.connect(master);
    tireNoise.start();
  }

  async function wake(){
    if(ready){
      if(ctx?.state==='suspended'){
        try{
          await ctx.resume();
        }catch(error){
          console.warn('Audio resume failed',error);
        }
      }

      setStatus(
        ctx?.state==='running'
          ?'ON'
          :'Suspendu'
      );
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
    ready=true;

    try{
      await ctx.resume();
    }catch(error){
      console.warn('Audio start failed',error);
    }

    setStatus(
      ctx.state==='running'
        ?'ON'
        :'Suspendu'
    );
  }

  function estimateCombustionRpm(kmh,load,profile){
    const idle=profile.idleRpm||850;
    const redline=profile.redlineRpm||6700;

    // Simple six-speed automaticized sound model. It is intentionally independent
    // from the actual drivetrain physics for now.
    const shiftPoints=[28,52,82,118,160,205];
    let gear=1;

    while(
      gear<shiftPoints.length &&
      kmh>shiftPoints[gear-1]
    ){
      gear++;
    }

    const lower=gear===1
      ?0
      :shiftPoints[gear-2];

    const upper=shiftPoints[
      Math.min(
        shiftPoints.length-1,
        gear-1
      )
    ];

    const span=Math.max(1,upper-lower);
    const local=Math.max(
      0,
      Math.min(1,(kmh-lower)/span)
    );

    const rpm=
      idle+
      (redline-idle)*
      (.22+.70*local+.08*load);

    return {
      rpm:Math.min(redline,rpm),
      gear
    };
  }

  function update(){
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
      const {rpm}=estimateCombustionRpm(
        kmh,
        accelLoad,
        currentProfile
      );

      // Four-stroke fundamental approximation plus uneven boxer secondary pulse.
      const fireHz=rpm/60*2;
      exhaustOsc1.frequency.setTargetAtTime(
        Math.max(28,fireHz*.50),
        now,
        .035
      );
      exhaustOsc2.frequency.setTargetAtTime(
        Math.max(34,fireHz*.93),
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

      exhaustFilter.frequency.setTargetAtTime(
        360+
        accelLoad*780+
        rpm/13,
        now,
        .055
      );

      // Turbo becomes obvious under load and above low rpm/speed.
      const boostGate=Math.max(
        0,
        Math.min(1,(kmh-18)/65)
      );

      turboOsc.frequency.setTargetAtTime(
        850+
        rpm*.19,
        now,
        .055
      );

      turboGain.gain.setTargetAtTime(
        Math.max(
          .0001,
          boostGate*accelLoad*.055
        ),
        now,
        .045
      );

      // Mute EV layer.
      motorGain.gain.setTargetAtTime(
        .0001,
        now,
        .04
      );
    }else{
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

    // Shared tire scrub. Better grip naturally delays squeal because vehicle
    // profile wheelbase/steering affects lateral demand.
    const speed=state.speed||0;
    const yawRate=
      (speed/Math.max(.1,vehicle.wheelbase))*
      Math.tan(state.currentSteerAngle||0);

    const lateralG=
      Math.abs(speed*yawRate)/9.81;

    const nearest=getNearestRoute?.();
    const onPavement=!!(
      nearest&&nearest.d<8.5
    );

    const baseThreshold=onPavement?.43:.30;
    const gripBonus=Math.max(
      0,
      (vehicle.offroadGrip||.58)-.58
    )*.18;

    const threshold=baseThreshold+gripBonus;

    const scrub=Math.max(
      0,
      Math.min(
        1,
        (lateralG-threshold)/.48
      )
    );

    const speedGate=Math.max(
      0,
      Math.min(1,(kmh-18)/28)
    );

    const tireVol=scrub*speedGate*.24;

    tireGain.gain.setTargetAtTime(
      Math.max(.0001,tireVol),
      now,
      tireVol>.01?.035:.12
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
  }

  function isRunning(){
    return !!(
      ready &&
      ctx &&
      ctx.state==='running'
    );
  }

  function showActivationHint(){
    if(!isRunning()){
      setStatus('Clique Activer');
    }
  }

  function showError(){
    setStatus('Erreur audio');
  }

  if(enableButton){
    enableButton.addEventListener('click',event=>{
      event.stopPropagation();
      wake().catch(error=>{
        console.warn('Audio activation failed',error);
        showError();
      });
    });
  }

  addEventListener(
    'pointerdown',
    ()=>{
      if(!ready||ctx?.state!=='running'){
        wake().catch(()=>{});
      }
    },
    {passive:true}
  );

  addEventListener(
    'keydown',
    ()=>{
      if(!ready||ctx?.state!=='running'){
        wake().catch(()=>{});
      }
    },
    {passive:true}
  );

  addEventListener(
    'gamepadconnected',
    ()=>{
      setStatus(
        ready&&ctx?.state==='running'
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

    // Compatibility aliases for gamepad/input modules.
    enable:wake,
    resume:wake,

    get ready(){
      return ready;
    }
  };
}
