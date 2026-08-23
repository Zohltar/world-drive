// World Drive V21.25 — minimap and transient road-sign readout.
// Extracted mechanically from main.js. Runtime route/sign state remains owned by main.js.

export function createMinimapSystem({
  routePointAt,
  multiplayer,
  llToXZ,
  getState
}){
  if(typeof routePointAt!=='function')throw new Error('minimap requires routePointAt');
  if(!multiplayer||typeof multiplayer.getPeers!=='function')throw new Error('minimap requires multiplayer');
  if(typeof llToXZ!=='function')throw new Error('minimap requires llToXZ');
  if(typeof getState!=='function')throw new Error('minimap requires getState');

  const $=id=>document.getElementById(id);
  let route=[];
  let routeLength=0;
  let geographicSigns=[];
  let roadGuideSign=null;
  let ROUTE_START={name:'Départ'};
  let ROUTE_END={name:'Arrivée'};

  function syncMinimapState(){
    const state=getState()||{};
    route=Array.isArray(state.route)?state.route:[];
    routeLength=Number(state.routeLength)||0;
    geographicSigns=Array.isArray(state.geographicSigns)?state.geographicSigns:[];
    roadGuideSign=state.roadGuideSign||null;
    ROUTE_START=state.routeStart||{name:'Départ'};
    ROUTE_END=state.routeEnd||{name:'Arrivée'};
  }
// ---------- transient sign readout on minimap ----------
const signReadout={key:null,text:'',startedAt:0,duration:5000,fadeMs:1100};
const passedSignKeys=new Set();
function signDisplayCum(f){
  if(!f)return 0;
  if(f.kind==='river')return Math.max(0,f.routeCum-22);
  if(f.kind==='city')return Math.max(0,f.routeCum-55);
  return f.routeCum;
}
function signReadoutText(f){
  if(!f)return '';
  if(f.kind==='speed')return String(Math.round(f.maxspeed||Number(f.label)||0));
  return String(f.label||'');
}
function updatePassedSignReadout(nr){
  syncMinimapState();
  const candidates=roadGuideSign
    ?[...geographicSigns,roadGuideSign]
    :geographicSigns;
  if(!nr||!candidates.length)return;
  let best=null,bestDelta=Infinity;
  for(const f of candidates){
    if(!f?.key||passedSignKeys.has(f.key))continue;
    const d=Math.abs(signDisplayCum(f)-nr.cum);
    if(d<=14 && d<bestDelta){best=f;bestDelta=d}
  }
  if(best){
    passedSignKeys.add(best.key);
    signReadout.key=best.key;
    signReadout.text=signReadoutText(best);
    signReadout.startedAt=performance.now();
  }
  // Rearm after moving well clear of the sign in EITHER direction.
  // This makes a U-turn + recross behave the same as the original pass.
  for(const f of candidates){
    if(passedSignKeys.has(f.key) && Math.abs(signDisplayCum(f)-nr.cum)>80){
      passedSignKeys.delete(f.key);
    }
  }
}

// ---------- minimap ----------
const mc=$('minimap'),mctx=mc.getContext('2d');
let bounds=null;
function prepMap(){
  syncMinimapState();let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;for(const p of route){minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z)}bounds={minx,maxx,minz,maxz}}
function drawMap(cum=0){
  syncMinimapState();if(!bounds)return;const dpr=devicePixelRatio||1,w=mc.clientWidth,h=mc.clientHeight;if(mc.width!==Math.round(w*dpr)||mc.height!==Math.round(h*dpr)){mc.width=Math.round(w*dpr);mc.height=Math.round(h*dpr)}mctx.setTransform(dpr,0,0,dpr,0,0);mctx.clearRect(0,0,w,h);mctx.fillStyle='#0a1725';mctx.fillRect(0,0,w,h);const pad=18,sx=(w-2*pad)/(bounds.maxx-bounds.minx),sz=(h-2*pad)/(bounds.maxz-bounds.minz),sc=Math.min(sx,sz),X=x=>pad+(x-bounds.minx)*sc,Z=z=>pad+(z-bounds.minz)*sc;
 mctx.strokeStyle='#89a3ba';mctx.lineWidth=3;mctx.beginPath();route.forEach((p,i)=>i?mctx.lineTo(X(p.x),Z(p.z)):mctx.moveTo(X(p.x),Z(p.z)));mctx.stroke();

 // Fixed endpoint markers: green = Manic-2 start, white = Manic-5 destination.
 if(route.length){
   const a=route[0],b=route[route.length-1];
   mctx.fillStyle='#56e37a';mctx.beginPath();mctx.arc(X(a.x),Z(a.z),4,0,Math.PI*2);mctx.fill();
   mctx.fillStyle='#f2f5f8';mctx.beginPath();mctx.arc(X(b.x),Z(b.z),4,0,Math.PI*2);mctx.fill();
 }
 // Red dot = current vehicle position/progress.
 const p=routePointAt(cum/routeLength),carMapX=X(p.x),carMapZ=Z(p.z);mctx.fillStyle='#ff4949';mctx.beginPath();mctx.arc(carMapX,carMapZ,5,0,Math.PI*2);mctx.fill();

 // V18A: connected LAN peers appear directly from their geographic position.
 for(const peer of multiplayer.getPeers()){
   const remote=llToXZ(peer.lat,peer.lon);
   if(
     remote.x<bounds.minx||remote.x>bounds.maxx||
     remote.z<bounds.minz||remote.z>bounds.maxz
   )continue;

   const px=X(remote.x),pz=Z(remote.z);
   mctx.fillStyle='#48d9ff';
   mctx.beginPath();
   mctx.arc(px,pz,4.5,0,Math.PI*2);
   mctx.fill();

   mctx.font='700 9px system-ui';
   mctx.textAlign='left';
   mctx.textBaseline='bottom';
   mctx.fillStyle='#bdefff';
   mctx.fillText(peer.name,px+7,pz-4);
 }

 // When a road sign is crossed, briefly repeat its text beside the vehicle marker.
 if(signReadout.text&&signReadout.startedAt){
   const age=performance.now()-signReadout.startedAt;
   if(age<signReadout.duration){
     const fadeStart=signReadout.duration-signReadout.fadeMs;
     const alpha=age<=fadeStart?1:Math.max(0,1-(age-fadeStart)/signReadout.fadeMs);
     mctx.save();mctx.globalAlpha=alpha;mctx.font='700 12px system-ui';mctx.textBaseline='middle';
     const text=signReadout.text,padX=8,boxH=24,boxW=Math.ceil(mctx.measureText(text).width)+padX*2;
     let bx=carMapX+12,by=carMapZ-boxH-7;
     if(bx+boxW>w-5)bx=carMapX-boxW-12;
     if(by<5)by=carMapZ+9;
     mctx.fillStyle='rgba(7,18,30,.94)';mctx.strokeStyle='rgba(235,244,252,.72)';mctx.lineWidth=1;
     mctx.beginPath();mctx.roundRect(bx,by,boxW,boxH,6);mctx.fill();mctx.stroke();
     mctx.fillStyle='#f6fbff';mctx.textAlign='left';mctx.fillText(text,bx+padX,by+boxH/2);
     mctx.restore();
   }else{signReadout.key=null;signReadout.text='';signReadout.startedAt=0}
 }
 // Endpoint labels are anchored to the actual route geometry.
 const startPt=route[0], endPt=route[route.length-1];
 if(startPt&&endPt){
   const sxp=X(startPt.x), szp=Z(startPt.z), exp=X(endPt.x), ezp=Z(endPt.z);
   mctx.font='700 11px system-ui';
   mctx.textBaseline='middle';

   mctx.fillStyle='#7dff9a';
   mctx.textAlign=sxp < w/2 ? 'left' : 'right';
   mctx.fillText(ROUTE_START.name||'Départ', sxp + (sxp < w/2 ? 8 : -8), szp);

   mctx.fillStyle='#f0f4f8';
   mctx.textAlign=exp < w/2 ? 'left' : 'right';
   mctx.fillText(ROUTE_END.name||'Arrivée', exp + (exp < w/2 ? 8 : -8), ezp);
 }
}



  function resetSignReadout(){
    passedSignKeys.clear();
    signReadout.key=null;
    signReadout.text='';
    signReadout.startedAt=0;
  }

  return Object.freeze({
    resetSignReadout,
    prepMap,
    drawMap,
    updatePassedSignReadout
  });
}

