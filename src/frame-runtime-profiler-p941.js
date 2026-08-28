import * as THREE from 'three';

// World Drive P9.41 — zero-polling runtime frame profiler.
//
// The streaming coordinator sees the rAF-to-rAF interval at the beginning of a
// frame, but historically could not tell whether that delay came from World
// Drive's previous animate() callback, WebGL submission, or time spent outside
// the main callback (browser scheduling / GC / OS / other tasks). This module is
// loaded before main.js executes and wraps only the browser primitives needed to
// retain that previous-frame timing. It does not schedule work of its own.

const STATE_KEY='__WORLD_DRIVE_P941_FRAME_RUNTIME_STATE__';
const RAF_PATCH_KEY='__worldDriveP941RafPatch';
const RENDER_PATCH_KEY='__worldDriveP941RenderPatch';

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
  renderOver16Ms:0
};
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

installRafProfiler();
installRenderProfiler();

export function frameRuntimeSnapshot(){
  return {
    enabled:true,
    mode:'p941-previous-main-frame',
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
    }
  };
}
