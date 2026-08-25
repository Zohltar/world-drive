import { createVehicleAudio as createBaseVehicleAudio } from './audio-base.js';
export * from './audio-base.js';

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function smoothstep01(v){const t=clamp01(v);return t*t*(3-2*t);}

export function skidLinkedTireLevel(state={}){
  const skid=Math.max(clamp01(state.skidFrontLevel),clamp01(state.skidRearLevel));
  const shared=clamp01(state.tireSquealLevel);
  const usage=Array.isArray(state.wheelGripUsage)?Math.max(0,...state.wheelGripUsage.map(v=>Number(v)||0)):0;

  // V21.29 P3.12 — the pre-skid warning belongs right at the edge of adhesion.
  // It starts around 94% grip usage and stays deliberately quiet so normal hard
  // cornering does not sound like a continuous tire squeal.
  const usageWarning=smoothstep01((usage-.94)/.06)*.10;
  const sharedWarning=smoothstep01((shared-.72)/.28)*.09;
  const preSkidCue=Math.min(.11,Math.max(usageWarning,sharedWarning));

  // Once rubber is visible, skid darkness is authoritative and the dynamic
  // range is intentionally much larger: light marks are audible, medium marks
  // are obvious, and deep black rubber produces a strong tire scream.
  const visibleSkidCue=skid>.001?Math.min(1,.16+.84*Math.pow(skid,.78)):0;
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
    const attack=target>tireLevel?22:6.5;
    tireLevel+=(target-tireLevel)*(1-Math.exp(-.016*attack));
    if(tireLevel<.001&&target===0)tireLevel=0;
    syncTirePlayback();
    if(tireAudio){
      // Much wider audible range than P3.11. Pre-skid remains subtle because its
      // level is capped near .11; visible skid rapidly grows toward full volume.
      tireAudio.volume=Math.min(1,.006+.20*tireLevel+.74*Math.pow(tireLevel,1.35));
      tireAudio.playbackRate=.93+.15*tireLevel;
    }
  }
  async function wake(){await base.wake();syncTirePlayback();}
  async function setEnabled(enabled){await base.setEnabled(enabled);syncTirePlayback();if(!enabled&&tireAudio)tireAudio.volume=0;}
  return {...base,update,wake,setEnabled,enable:()=>setEnabled(true),disable:()=>setEnabled(false),resume:wake,toggle:()=>setEnabled(!base.enabled),get enabled(){return base.enabled;},get ready(){return base.ready;}};
}
