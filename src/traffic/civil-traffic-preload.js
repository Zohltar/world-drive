import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ensureWorldDriveDiagnostics} from '../diagnostics.js';
import {
  GENERIC_PASSENGER_PACK_URL,
  GENERIC_PASSENGER_PACK_FALLBACK_URL,
  buildGenericPassengerTemplates
} from './civil-traffic-pool.js';

// Traffic preload P1 — move the expensive GLB parse/template extraction to app
// startup instead of the first seconds of driving. GLTFLoader.loadAsync is patched
// only for the two civil-traffic assets and simply reuses the already parsed GLTF.

const originalLoadAsync=GLTFLoader.prototype.loadAsync;
const state={
  started:false,
  patched:false,
  phase:'idle',
  sonata:{promise:null,ready:false,error:null,fetchMs:0,parseMs:0},
  pack:{promise:null,ready:false,error:null,fetchMs:0,parseMs:0,buildMs:0,templates:0}
};

const now=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();

function assetKind(url){
  const value=String(url||'').toLowerCase();
  if(value.includes('2006_hyundai_sonata.glb'))return 'sonata';
  if(value.includes('generic_passenger_car_pack'))return 'pack';
  return null;
}

function absoluteUrl(url){
  try{
    if(typeof document!=='undefined'&&document.baseURI)return new URL(url,document.baseURI).href;
  }catch{}
  return String(url||'');
}

function basePathFor(url){
  try{return new URL('.',absoluteUrl(url)).href;}catch{return '';}
}

async function fetchBuffer(url){
  const started=now();
  const response=await fetch(url,{cache:'force-cache'});
  if(!response.ok)throw new Error(`HTTP ${response.status} while preloading ${url}`);
  const buffer=await response.arrayBuffer();
  return {buffer,fetchMs:now()-started,url};
}

async function parseBuffer(buffer,url){
  const loader=new GLTFLoader();
  const started=now();
  const gltf=await loader.parseAsync(buffer,basePathFor(url));
  return {gltf,parseMs:now()-started};
}

async function preloadSonata(){
  const url=new URL('../assets/2006_hyundai_sonata.glb',import.meta.url).href;
  state.phase='sonata-fetch';
  const fetched=await fetchBuffer(url);
  state.sonata.fetchMs=fetched.fetchMs;
  state.phase='sonata-parse';
  const parsed=await parseBuffer(fetched.buffer,url);
  state.sonata.parseMs=parsed.parseMs;
  state.sonata.ready=true;
  state.phase='sonata-ready';
  return parsed.gltf;
}

async function preloadPack(){
  let fetched=null,lastError=null;
  state.phase='pack-fetch';
  for(const url of [GENERIC_PASSENGER_PACK_URL,GENERIC_PASSENGER_PACK_FALLBACK_URL]){
    try{fetched=await fetchBuffer(url);break;}catch(error){lastError=error;}
  }
  if(!fetched)throw lastError||new Error('Civil traffic pack preload failed');
  state.pack.fetchMs=fetched.fetchMs;
  state.phase='pack-parse';
  const parsed=await parseBuffer(fetched.buffer,fetched.url);
  state.pack.parseMs=parsed.parseMs;
  state.phase='pack-build';
  const buildStarted=now();
  const templates=buildGenericPassengerTemplates(parsed.gltf.scene||parsed.gltf.scenes?.[0]);
  state.pack.buildMs=now()-buildStarted;
  state.pack.templates=templates.size;
  state.pack.ready=templates.size>0;
  state.phase='ready';
  return parsed.gltf;
}

function installLoaderReusePatch(){
  if(state.patched)return;
  state.patched=true;
  GLTFLoader.prototype.loadAsync=function(url,onProgress){
    const kind=assetKind(url);
    if(kind==='sonata'&&state.sonata.promise)return state.sonata.promise;
    if(kind==='pack'&&state.pack.promise)return state.pack.promise;
    return originalLoadAsync.call(this,url,onProgress);
  };
}

export function civilTrafficPreloadDiagnostics(){
  return {
    started:state.started,
    patched:state.patched,
    phase:state.phase,
    sonata:{
      ready:state.sonata.ready,
      error:state.sonata.error?String(state.sonata.error?.message||state.sonata.error):null,
      fetchMs:Number(state.sonata.fetchMs.toFixed(1)),
      parseMs:Number(state.sonata.parseMs.toFixed(1))
    },
    pack:{
      ready:state.pack.ready,
      error:state.pack.error?String(state.pack.error?.message||state.pack.error):null,
      fetchMs:Number(state.pack.fetchMs.toFixed(1)),
      parseMs:Number(state.pack.parseMs.toFixed(1)),
      buildMs:Number(state.pack.buildMs.toFixed(1)),
      templates:state.pack.templates
    }
  };
}

export function startCivilTrafficAssetPreload(){
  installLoaderReusePatch();
  if(state.started)return;
  state.started=true;

  // Sequential by design: never parse both GLBs in the same startup slice.
  state.sonata.promise=preloadSonata().catch(error=>{
    state.sonata.error=error;
    state.phase='sonata-error';
    throw error;
  });
  state.pack.promise=state.sonata.promise
    .catch(()=>null)
    .then(()=>preloadPack())
    .catch(error=>{
      state.pack.error=error;
      state.phase='pack-error';
      throw error;
    });

  try{
    ensureWorldDriveDiagnostics().traffic.preload=civilTrafficPreloadDiagnostics;
  }catch{}
}