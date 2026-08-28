import * as THREE from 'three';

// World Drive P9.42 — zero-polling runtime + browser frame profiler.
//
// P9.41 retains previous animate() callback timing. P9.42 adds the browser's
// Long Animation Frames observer when Chromium exposes it, so rare >50 ms
// rAF gaps can be separated into script work, browser render/presentation work,
// style/layout, and pauses without changing any gameplay/rendering behavior.

const STATE_KEY='__WORLD_DRIVE_P941_FRAME_RUNTIME_STATE__';
const RAF_PATCH_KEY='__worldDriveP941RafPatch';
const RENDER_PATCH_KEY='__worldDriveP941RenderPatch';
const LOAF_OBSERVER_KEY='__worldDriveP942LoafObserver';
const LOAF_HISTORY_LIMIT=8;

const state=globalThis[STATE_KEY]||{
  enabled:true,
  mainFrames:0,
  lastMainMs:0,
  maxMainMs:0,
  lastMainStartedAt:0,
  lastMainEndedAt:0,
  mainOver12Ms:0,
  mainOver16_7Ms:0,
  mainOver25Ms:0,
  renderCalls:0,
  lastRenderMs:0,
  maxRenderMs:0,
  lastRenderStartedAt:0,
  lastRenderEndedAt:0,
  renderOver4Ms:0,
  renderOver8Ms:0,
  renderOver16Ms:0,
  loafSupported:false,
  loafCount:0,
  loafMaxMs:0,
  loafLast:null,
  loafWorst:null,
  loafHistory:[]
};
if(!Array.isArray(state.loafHistory))state.loafHistory=[];
globalThis[STATE_KEY]=state;

function finite(value,fallback=0){return Number.isFinite(value)?value:fallback;}
function round3(value){return Number(finite(value).toFixed(3));}

function recordMain(started,ended){
  const ms=Math.max(0,ended-started);
  state.mainFrames++;
  state.lastMainMs=ms;
  state.maxMainMs=Math.max(state.maxMainMs,ms);
  state.lastMainStartedAt=started;
  state.lastMainEndedAt=ended;
  if(ms>12)state.mainOver12Ms++;
  if(ms>16.7)state.mainOver16_7Ms++;
  if(ms>25)state.mainOver25Ms++;
}

function recordRender(started,ended){
  const ms=Math.max(0,ended-started);
  state.renderCalls++;
  state.lastRenderMs=ms;
  state.maxRenderMs=Math.max(state.maxRenderMs,ms);
  state.lastRenderStartedAt=started;
  state.lastRenderEndedAt=ended;
  if(ms>4)state.renderOver4Ms++;
  if(ms>8)state.renderOver8Ms++;
  if(ms>16)state.renderOver16Ms++;
}

function compactScript(script){
  return {
    durationMs:round3(script?.duration),
    pauseMs:round3(script?.pauseDuration),
    forcedStyleLayoutMs:round3(script?.forcedStyleAndLayoutDuration),
    invoker:String(script?.invoker||''),
    invokerType:String(script?.invokerType||''),
    sourceFunctionName:String(script?.sourceFunctionName||''),
    sourceURL:String(script?.sourceURL||'')
  };
}

function compactLoaf(entry){
  const start=finite(entry?.startTime);
  const duration=Math.max(0,finite(entry?.duration));
  const end=start+duration;
  const renderStart=finite(entry?.renderStart);
  const styleStart=finite(entry?.styleAndLayoutStart);
  const scripts=Array.isArray(entry?.scripts)?entry.scripts:[];
  const scriptMs=scripts.reduce((sum,script)=>sum+Math.max(0,finite(script?.duration)),0);
  const pauseMs=scripts.reduce((sum,script)=>sum+Math.max(0,finite(script?.pauseDuration)),0);
  const forcedStyleLayoutMs=scripts.reduce((sum,script)=>sum+Math.max(0,finite(script?.forcedStyleAndLayoutDuration)),0);
  const topScripts=scripts
    .slice()
    .sort((a,b)=>finite(b?.duration)-finite(a?.duration))
    .slice(0,4)
    .map(compactScript);
  return {
    startAt:round3(start),
    durationMs:round3(duration),
    blockingMs:round3(entry?.blockingDuration),
    workMs:round3(renderStart>start?renderStart-start:duration),
    browserRenderMs:round3(renderStart>0?Math.max(0,end-renderStart):0),
    styleLayoutMs:round3(styleStart>0?Math.max(0,end-styleStart):0),
    scriptMs:round3(scriptMs),
    pauseMs:round3(pauseMs),
    forcedStyleLayoutMs:round3(forcedStyleLayoutMs),
    renderStartAt:round3(renderStart),
    paintAt:round3(entry?.paintTime),
    presentationAt:round3(entry?.presentationTime),
    scripts:topScripts
  };
}

function recordLoaf(entry){
  const compact=compactLoaf(entry);
  state.loafCount++;
  state.loafMaxMs=Math.max(state.loafMaxMs,compact.durationMs);
  state.loafLast=compact;
  if(!state.loafWorst||compact.durationMs>finite(state.loafWorst.durationMs))state.loafWorst=compact;
  state.loafHistory.push(compact);
  while(state.loafHistory.length>LOAF_HISTORY_LIMIT)state.loafHistory.shift();
}

function installRafProfiler(){
  const current=globalThis.requestAnimationFrame;
  if(typeof current!=='function'||current?.[RAF_PATCH_KEY])return false;
  const original=current.bind(globalThis);
  const wrapped=callback=>original(timestamp=>{
    const isWorldDriveMain=callback?.name==='animate';
    if(!isWorldDriveMain)return callback(timestamp);
    const started=performance.now();
    try{
      return callback(timestamp);
    }finally{
      recordMain(started,performance.now());
    }
  });
  wrapped[RAF_PATCH_KEY]=true;
  wrapped.__worldDriveP941Original=original;
  globalThis.requestAnimationFrame=wrapped;
  return true;
}

function installRenderProfiler(){
  const proto=THREE?.WebGLRenderer?.prototype;
  const current=proto?.render;
  if(typeof current!=='function'||current?.[RENDER_PATCH_KEY])return false;
  const original=current;
  const wrapped=function(...args){
    const started=performance.now();
    try{
      return original.apply(this,args);
    }finally{
      recordRender(started,performance.now());
    }
  };
  wrapped[RENDER_PATCH_KEY]=true;
  wrapped.__worldDriveP941Original=original;
  proto.render=wrapped;
  return true;
}

function installLongAnimationFrameProfiler(){
  const PO=globalThis.PerformanceObserver;
  const supported=Array.isArray(PO?.supportedEntryTypes)&&PO.supportedEntryTypes.includes('long-animation-frame');
  state.loafSupported=!!supported;
  if(!supported||globalThis[LOAF_OBSERVER_KEY])return false;
  try{
    const observer=new PO(list=>{
      for(const entry of list.getEntries())recordLoaf(entry);
    });
    observer.observe({type:'long-animation-frame',buffered:true});
    globalThis[LOAF_OBSERVER_KEY]=observer;
    return true;
  }catch{
    state.loafSupported=false;
    return false;
  }
}

installRafProfiler();
installRenderProfiler();
installLongAnimationFrameProfiler();

export function frameRuntimeSnapshot(){
  return {
    enabled:true,
    mode:'p941-previous-main-frame',
    browserMode:'p942-long-animation-frame',
    main:{
      frames:state.mainFrames,
      lastMs:round3(state.lastMainMs),
      maxMs:round3(state.maxMainMs),
      lastStartedAt:round3(state.lastMainStartedAt),
      lastEndedAt:round3(state.lastMainEndedAt),
      over12Ms:state.mainOver12Ms,
      over16_7Ms:state.mainOver16_7Ms,
      over25Ms:state.mainOver25Ms
    },
    renderSubmit:{
      calls:state.renderCalls,
      lastMs:round3(state.lastRenderMs),
      maxMs:round3(state.maxRenderMs),
      lastStartedAt:round3(state.lastRenderStartedAt),
      lastEndedAt:round3(state.lastRenderEndedAt),
      over4Ms:state.renderOver4Ms,
      over8Ms:state.renderOver8Ms,
      over16Ms:state.renderOver16Ms
    },
    browserLongFrames:{
      supported:state.loafSupported===true,
      thresholdMs:50,
      count:finite(state.loafCount),
      maxMs:round3(state.loafMaxMs),
      last:state.loafLast?{...state.loafLast,scripts:state.loafLast.scripts.map(item=>({...item}))}:null,
      worst:state.loafWorst?{...state.loafWorst,scripts:state.loafWorst.scripts.map(item=>({...item}))}:null,
      recent:state.loafHistory.map(item=>({...item,scripts:item.scripts.map(script=>({...script}))}))
    }
  };
}
