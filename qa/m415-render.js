import * as THREE from 'three';
import {createMultiplayerClient} from '/src/multiplayer.js';
import {createMultiplayerVisualSystem} from '/src/multiplayer-visuals.js';

const WIDTH=640,HEIGHT=360;
const BASE_LAT=45.50,BASE_LON=-73.40;
let seq=1000;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function waitFor(predicate,{timeoutMs=12000,label='condition'}={}){
  const started=performance.now();
  return new Promise((resolve,reject)=>{
    const tick=()=>{
      let value;
      try{value=predicate();}catch(error){reject(error);return;}
      if(value){resolve(value);return;}
      if(performance.now()-started>timeoutMs){reject(new Error(`Timeout waiting for ${label}`));return;}
      requestAnimationFrame(tick);
    };
    tick();
  });
}
function waitForOpen(ws,timeoutMs=3000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('sender websocket open timeout')),timeoutMs);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('sender websocket error'));},{once:true});
  });
}
function llToXZ(lat,lon){
  const metersPerLon=111320*Math.cos(BASE_LAT*Math.PI/180);
  return{x:(lon-BASE_LON)*metersPerLon,z:-(lat-BASE_LAT)*111320};
}
function packet(vehicleId,gear){
  return{
    type:'state',seq:++seq,name:`M415Sender-${vehicleId}`,vehicleId,
    lat:BASE_LAT,lon:BASE_LON,y:0,heading:0,velocityHeading:gear===-1?Math.PI:0,
    speed:0,longitudinalAccel:0,steer:0,
    gear,reversing:gear===-1,braking:false,nightLevel:0,
    signalLeft:false,signalRight:false,signalBlink:false,lightingProtocol:'m2.4',
    onRoad:true,skidFront:0,skidRear:0,
    bodyPitch:0,bodyYaw:0,bodyRoll:0,bodyY:0,wheelPitch:0,wheelRoll:0
  };
}
function readPixels(renderer){
  const gl=renderer.getContext(),pixels=new Uint8Array(WIDTH*HEIGHT*4);
  gl.readPixels(0,0,WIDTH,HEIGHT,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  return pixels;
}
function compare(base,lit){
  let positive=0,strong=0,maxDelta=0,total=0,changed=0;
  let minX=WIDTH,minY=HEIGHT,maxX=-1,maxY=-1;
  for(let i=0;i<WIDTH*HEIGHT;i++){
    const o=i*4;
    const b=.2126*base[o]+.7152*base[o+1]+.0722*base[o+2];
    const l=.2126*lit[o]+.7152*lit[o+1]+.0722*lit[o+2];
    const d=l-b;
    if(Math.abs(d)>2){changed++;const x=i%WIDTH,y=Math.floor(i/WIDTH);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    if(d>2){positive++;total+=d;maxDelta=Math.max(maxDelta,d);}
    if(d>12)strong++;
  }
  return{changed,positive,strong,maxDelta,averagePositive:positive?total/positive:0,bbox:changed?{minX,minY,maxX,maxY,width:maxX-minX+1,height:maxY-minY+1}:null};
}
function frameCamera(camera,object){
  object.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(object),size=new THREE.Vector3(),center=new THREE.Vector3();
  box.getSize(size);box.getCenter(center);
  const distance=Math.max(4.5,size.z*1.15,size.x*1.8);
  camera.position.set(center.x,center.y+size.y*.05,box.min.z-distance);
  camera.lookAt(center.x,center.y,center.z);
  camera.near=.05;camera.far=100;camera.updateProjectionMatrix();
  return{box,size,center,distance};
}
async function pump(client,ms){
  const start=performance.now();let last=start;
  while(performance.now()-start<ms){
    await new Promise(resolve=>requestAnimationFrame(now=>{
      const dt=Math.max(.001,Math.min(.05,(now-last)/1000));last=now;client.update(dt);resolve();
    }));
  }
}
async function hold(sender,client,vehicleId,gear,ms=420){
  const started=performance.now();
  while(performance.now()-started<ms){
    sender.send(JSON.stringify(packet(vehicleId,gear)));
    await pump(client,34);
  }
  await pump(client,180);
}
function remoteRoot(scene,vehicleId){
  return scene.children.find(child=>String(child.name||'').includes(`remote-support-fallback-${vehicleId}-M415Sender-${vehicleId}`))||null;
}

async function testVehicle(vehicleId){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x030507);
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(1);renderer.setSize(WIDTH,HEIGHT,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  document.body.innerHTML='';document.body.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(42,WIDTH/HEIGHT,.05,100);
  scene.add(new THREE.HemisphereLight(0xffffff,0x223344,2.4));
  const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(0,5,-6);scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,1.2);fill.position.set(3,2,4);scene.add(fill);

  const visuals=createMultiplayerVisualSystem({THREE,scene,llToXZ,groundHeightForWheel:()=>0});
  if(visuals.loaded)throw new Error(`${vehicleId}: public visual runtime should start lazy`);
  const localState={lat:BASE_LAT,lon:BASE_LON,y:0,heading:0,speed:0,vehicleId:'id4',steer:0,onRoad:true,skidFront:0,skidRear:0,bodyPitch:0,bodyYaw:0,bodyRoll:0,bodyY:0,wheelPitch:0,wheelRoll:0};
  const client=createMultiplayerClient({
    scene,latLonToWorld:llToXZ,getWorldOffset:()=>({x:0,z:0}),getLocalState:()=>localState,
    createRemoteVisual:visuals.createRemoteVehicleVisual,
    getLocalRenderPosition:()=>({x:0,z:0}),solveRemoteSupport:visuals.solveRemoteVehicleSupport,
    getHeadlightLevel:()=>0,toast:()=>{}
  });
  if(client.loaded)throw new Error(`${vehicleId}: public client runtime should start lazy`);
  await client.connect();
  if(!client.loaded||!visuals.loaded)throw new Error(`${vehicleId}: lazy multiplayer runtimes did not load on connect`);
  await waitFor(()=>client.isConnected(),{label:'observer websocket connection'});

  const sender=new WebSocket('ws://127.0.0.1:8081');await waitForOpen(sender);
  sender.send(JSON.stringify({type:'hello',name:`M415Sender-${vehicleId}`,vehicleId}));
  await sleep(60);

  await hold(sender,client,vehicleId,1,480);
  await waitFor(()=>client.getPeers().some(p=>p.vehicleId===vehicleId),{label:`${vehicleId} peer receive`});
  const root=await waitFor(()=>remoteRoot(scene,vehicleId),{label:`${vehicleId} remote root`});
  await waitFor(()=>{const d=visuals.diagnostics();return d.adapters?.find(a=>a.vehicleId===vehicleId&&a.visualReady)||null;},{label:`${vehicleId} authored adapter`});
  frameCamera(camera,root);
  key.position.copy(camera.position).add(new THREE.Vector3(0,3,0));key.target.position.set(0,1,0);scene.add(key.target);

  renderer.render(scene,camera);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));renderer.render(scene,camera);
  const drivePixels=readPixels(renderer);
  const drivePeer=client.getPeers().find(p=>p.vehicleId===vehicleId);
  if(drivePeer?.gear!==1||drivePeer?.reversing!==false)throw new Error(`${vehicleId}: integrated Drive peer state wrong ${JSON.stringify(drivePeer)}`);

  await hold(sender,client,vehicleId,-1,520);
  const reversePeer=client.getPeers().find(p=>p.vehicleId===vehicleId);
  if(reversePeer?.gear!==-1||reversePeer?.reversing!==true)throw new Error(`${vehicleId}: integrated reverse peer state wrong ${JSON.stringify(reversePeer)}`);
  const reverseDiag=visuals.diagnostics().adapters.find(a=>a.vehicleId===vehicleId);
  if(reverseDiag?.gear!==-1||reverseDiag?.reversing!==true)throw new Error(`${vehicleId}: integrated adapter did not receive R ${JSON.stringify(reverseDiag)}`);
  renderer.render(scene,camera);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));renderer.render(scene,camera);
  const reversePixels=readPixels(renderer),on=compare(drivePixels,reversePixels);

  await hold(sender,client,vehicleId,0,500);
  const neutralPeer=client.getPeers().find(p=>p.vehicleId===vehicleId);
  if(neutralPeer?.gear!==0||neutralPeer?.reversing!==false)throw new Error(`${vehicleId}: integrated Neutral peer state wrong ${JSON.stringify(neutralPeer)}`);
  renderer.render(scene,camera);await new Promise(r=>requestAnimationFrame(r));renderer.render(scene,camera);
  const neutralPixels=readPixels(renderer),off=compare(neutralPixels,reversePixels);

  if(on.positive<20||on.strong<4||on.maxDelta<12)throw new Error(`${vehicleId}: network->client->GPU R lacks pixel evidence ${JSON.stringify(on)}`);
  if(off.positive<20||off.strong<4||off.maxDelta<12)throw new Error(`${vehicleId}: network->client->GPU N->R lacks pixel evidence ${JSON.stringify(off)}`);

  const report={vehicleId,lazyFacades:true,peerReverse:{gear:reversePeer.gear,reversing:reversePeer.reversing},adapterReverse:{gear:reverseDiag.gear,reversing:reverseDiag.reversing,reverseMaterialCount:reverseDiag.reverseMaterialCount,reverseGlowOpacity:reverseDiag.reverseGlowOpacity},driveToReverse:on,neutralToReverse:off};
  try{sender.close();}catch{} client.disconnect(); renderer.dispose();scene.clear();
  return report;
}

(async()=>{
  try{
    const reports=[];for(const id of ['sonata','wrx'])reports.push(await testVehicle(id));
    globalThis.__M415_RESULT__={ok:true,reports};console.log('M4.15 PUBLIC LAZY NETWORK GPU QA PASS',reports);
  }catch(error){globalThis.__M415_RESULT__={ok:false,error:String(error?.stack||error)};console.error('M4.15 PUBLIC LAZY NETWORK GPU QA FAIL',error);}
})();
