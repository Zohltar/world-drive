// World Drive - vehicle audio subsystem
// Extracted from main.js without changing the sound model.

export function createVehicleAudio({
  statusEl,
  enableButton,
  vehicle,
  getState,
  getNearestRoute
}) {
  let audioCtx=null;
  let audioMaster=null;
  let motorOsc1=null;
  let motorOsc2=null;
  let motorGain=null;
  let tireNoise=null;
  let tireGain=null;
  let audioReady=false;

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function makeNoiseBuffer(ctx,seconds=2){
    const n=Math.floor(ctx.sampleRate*seconds);
    const b=ctx.createBuffer(1,n,ctx.sampleRate);
    const d=b.getChannelData(0);
    let last=0;
    for(let i=0;i<n;i++){
      const white=Math.random()*2-1;
      last=last*.72+white*.28;
      d[i]=last;
    }
    return b;
  }

  async function init(){
    if(audioReady){
      if(audioCtx?.state==='suspended'){
        try{await audioCtx.resume()}
        catch(e){console.warn('Audio resume failed',e)}
      }
      setStatus(audioCtx?.state==='running'?'ON':'Suspendu');
      return;
    }

    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){setStatus('Non supporté');return}

    audioCtx=new AC();
    audioMaster=audioCtx.createGain();
    audioMaster.gain.value=.32;
    audioMaster.connect(audioCtx.destination);

    motorOsc1=audioCtx.createOscillator();
    motorOsc2=audioCtx.createOscillator();
    motorOsc1.type='sine';
    motorOsc2.type='triangle';

    motorGain=audioCtx.createGain();
    motorGain.gain.value=.0001;

    const motorFilter=audioCtx.createBiquadFilter();
    motorFilter.type='lowpass';
    motorFilter.frequency.value=1200;

    motorOsc1.connect(motorGain);
    motorOsc2.connect(motorGain);
    motorGain.connect(motorFilter);
    motorFilter.connect(audioMaster);
    motorOsc1.start();
    motorOsc2.start();

    tireNoise=audioCtx.createBufferSource();
    tireNoise.buffer=makeNoiseBuffer(audioCtx,2);
    tireNoise.loop=true;

    tireGain=audioCtx.createGain();
    tireGain.gain.value=.0001;

    const tireFilter=audioCtx.createBiquadFilter();
    tireFilter.type='bandpass';
    tireFilter.frequency.value=1450;
    tireFilter.Q.value=.75;

    tireNoise.connect(tireFilter);
    tireFilter.connect(tireGain);
    tireGain.connect(audioMaster);
    tireNoise.start();

    audioReady=true;
    try{await audioCtx.resume()}
    catch(e){console.warn('Audio start failed',e)}
    setStatus(audioCtx.state==='running'?'ON':'Suspendu');
  }

  function update(){
    if(!audioReady||!audioCtx)return;
    if(audioCtx.state!=='running'){
      setStatus('Suspendu');
      return;
    }

    const {speed,longitudinalAccel,currentSteerAngle}=getState();
    const now=audioCtx.currentTime;
    const kmh=Math.abs(speed)*3.6;

    const accelLoad=Math.min(1,Math.abs(longitudinalAccel)/6.5);
    const f1=72+kmh*3.0;
    const f2=f1*2.04;

    motorOsc1.frequency.setTargetAtTime(f1,now,.055);
    motorOsc2.frequency.setTargetAtTime(f2,now,.055);

    const motorVol=kmh<1?.0001:Math.min(.11,.018+kmh/1900+accelLoad*.035);
    motorGain.gain.setTargetAtTime(motorVol,now,.07);

    const yawRate=(speed/vehicle.wheelbase)*Math.tan(currentSteerAngle||0);
    const lateralG=Math.abs(speed*yawRate)/9.81;
    const nr=getNearestRoute();
    const onPavement=!!(nr&&nr.d<8.5);
    const gripThreshold=onPavement?.43:.30;

    const scrub=Math.max(0,Math.min(1,(lateralG-gripThreshold)/.48));
    const speedGate=Math.max(0,Math.min(1,(kmh-18)/28));
    const tireVol=scrub*speedGate*.24;

    tireGain.gain.setTargetAtTime(
      Math.max(.0001,tireVol),
      now,
      tireVol>.01?.035:.12
    );
  }

  function wake(){
    init().catch(e=>console.warn('Audio activation failed',e));
  }

  function isRunning(){
    return !!(audioReady&&audioCtx?.state==='running');
  }

  function showActivationHint(){
    if(!isRunning())setStatus('Clique Activer');
  }

  function showError(){
    setStatus('Erreur audio');
  }

  if(enableButton){
    enableButton.addEventListener('click',e=>{
      e.stopPropagation();
      wake();
    });
  }

  addEventListener('pointerdown',()=>{
    if(!isRunning())wake();
  },{passive:true});

  addEventListener('keydown',()=>{
    if(!isRunning())wake();
  },{passive:true});

  addEventListener('gamepadconnected',()=>{
    setStatus(isRunning()?'ON':'OFF');
  });

  return {init,update,wake,isRunning,showActivationHint,showError};
}
