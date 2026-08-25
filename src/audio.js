import { createVehicleAudio as createBaseVehicleAudio } from './audio-base.js';
export * from './audio-base.js';

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function smoothstep01(v){const t=clamp01(v);return t*t*(3-2*t);}

export function skidLinkedTireLevel(state={}){
  const skid=Math.max(clamp01(state.skidFrontLevel),clamp01(state.skidRearLevel));
  const shared=clamp01(state.tireSquealLevel);
  const usage=Array.isArray(state.wheelGripUsage)?Math.max(0,...state.wheelGripUsage.map(v=>Number(v)||0)):0;
  const preSkidCue=Math.min(.16,Math.max(shared*.18,smoothstep01((usage-.82)/.18)*.14));
  const visibleSkidCue=skid>.001?Math.min(1,.14+.86*Math.pow(skid,1.08)):0;
  return Math.max(preSkidCue,visibleSkidCue);
}

export function createVehicleAudio(args={}){
  const originalGetState=typeof args.getState==='function'?args.getState:()=>({});
  const base=createBaseVehicleAudio({
    ...args,
    getState:()=>{
      const s=originalGetState()||{};
      return {...s,tireSquealLevel:0,skidFrontLevel:0,skidRearLevel:0,frontSlipAmount:0,rearSlipAmount:0,chassisSlipAngle:0,lateralGripUsage:0};
    }
  });
  let tireAudio=null,tireLevel=0,tirePlayRequested=false;
  function ensureTireAudio(){
    if(tireAudio||typeof Audio==='undefined')return tireAudio;
    tireAudio=new Audio('./assets/audio/tire-squeal.mp3');
    tireAudio.loop=true;tireAudio.preload='auto';tireAudio.volume=0;
    return tireAudio;
  }
  function syncTirePlayback(){
    const audio=ensureTireAudio();if(!audio)return;
    if(base.enabled){
      if(audio.paused&&!tirePlayRequested){tirePlayRequested=true;audio.play().catch(()=>{}).finally(()=>{tirePlayRequested=false;});}
    }else if(!audio.paused){audio.pause();audio.currentTime=0;}
  }
  function update(){
    base.update();
    const state=originalGetState()||{};
    const target=base.enabled?skidLinkedTireLevel(state):0;
    const attack=target>tireLevel?18:5.5;
    tireLevel+=(target-tireLevel)*(1-Math.exp(-.016*attack));
    if(tireLevel<.001&&target===0)tireLevel=0;
    syncTirePlayback();
    if(tireAudio){
      tireAudio.volume=Math.min(1,.02+.42*tireLevel*tireLevel+.16*tireLevel);
      tireAudio.playbackRate=.94+.12*tireLevel;
    }
  }
  async function wake(){await base.wake();syncTirePlayback();}
  async function setEnabled(enabled){await base.setEnabled(enabled);syncTirePlayback();if(!enabled&&tireAudio)tireAudio.volume=0;}
  return {...base,update,wake,setEnabled,enable:()=>setEnabled(true),disable:()=>setEnabled(false),resume:wake,toggle:()=>setEnabled(!base.enabled),get enabled(){return base.enabled;},get ready(){return base.ready;}};
}
