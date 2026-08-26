// World Drive V21.31 — minimap, route-panel information and transient road-sign readout.
// Runtime route/sign state remains owned by main.js.

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
  let progressDisplayMode='km';

  function syncMinimapState(){
    const state=getState()||{};
    route=Array.isArray(state.route)?state.route:[];
    routeLength=Number(state.routeLength)||0;
    geographicSigns=Array.isArray(state.geographicSigns)?state.geographicSigns:[];
    roadGuideSign=state.roadGuideSign||null;
    ROUTE_START=state.routeStart||{name:'Départ'};
    ROUTE_END=state.routeEnd||{name:'Arrivée'};
  }

  // ---------- route map panel ----------
  const mapbox=$('mapbox');
  const minimapCanvas=$('minimap');

  function installMapPanelUi(){
    if(!mapbox||!minimapCanvas||$('routeMapInfo'))return;

    const style=document.createElement('style');
    style.textContent=`
      #mapbox{
        display:flex!important;
        flex-direction:column!important;
        height:min(560px,calc(100vh - 28px))!important;
        min-height:420px;
        background:rgba(4,10,18,var(--route-map-opacity,.80))!important;
        overflow:hidden;
      }
      #mapbox .panelHeader{flex:0 0 28px}
      #routeMapInfo{
        flex:0 0 auto;
        display:grid;
        grid-template-columns:1fr 1fr 1fr;
        gap:6px;
        margin:4px 0 7px;
      }
      .routeMapMetric{
        min-width:0;
        padding:6px 7px;
        border:1px solid rgba(255,255,255,.07);
        border-radius:8px;
        background:rgba(255,255,255,.045);
      }
      .routeMapMetricLabel{
        display:block;
        font-size:8px;
        line-height:1.15;
        text-transform:uppercase;
        letter-spacing:.055em;
        color:#8fa6bf;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .routeMapMetricValue{
        display:block;
        margin-top:3px;
        font-size:11px;
        line-height:1.1;
        font-weight:800;
        color:#edf5fc;
        white-space:nowrap;
      }
      button.routeMapMetric{
        min-height:0;
        text-align:left;
        cursor:pointer;
        color:inherit;
      }
      button.routeMapMetric:hover{background:rgba(255,255,255,.085)}
      #routeMapCanvasZone{
        position:relative;
        flex:1 1 auto;
        min-height:150px;
        overflow:hidden;
        border-radius:10px;
        background:#0a1725;
      }
      #routeMapCanvasZone #minimap{
        width:100%!important;
        height:100%!important;
        border-radius:10px;
      }
      #routeMapOpacity{
        flex:0 0 auto;
        display:grid;
        grid-template-columns:auto 1fr auto;
        align-items:center;
        gap:8px;
        margin-top:7px;
        padding:3px 2px 0;
      }
      #routeMapOpacity label,#routeMapOpacityValue{
        font-size:9px;
        font-weight:700;
        color:#9fb2c5;
      }
      #routeMapOpacity input{margin:0;width:100%}
      #mapbox.collapsed #routeMapInfo,
      #mapbox.collapsed #routeMapCanvasZone,
      #mapbox.collapsed #routeMapOpacity,
      #mapbox.collapsed .routeSubsection{display:none!important}
      #mapbox.collapsed{height:48px!important;min-height:48px!important}
      @media(max-width:900px){
        #mapbox{height:min(500px,calc(100vh - 28px))!important}
        #routeMapInfo{grid-template-columns:1fr 1fr}
        #routeMapInfo .routeMapMetric:first-child{grid-column:1/-1}
      }
    `;
    document.head.appendChild(style);

    const info=document.createElement('div');
    info.id='routeMapInfo';
    info.setAttribute('aria-label','Informations du trajet');
    info.innerHTML=`
      <div class="routeMapMetric">
        <span class="routeMapMetricLabel">Longueur trajet</span>
        <strong class="routeMapMetricValue" id="routeMapLength">— km</strong>
      </div>
      <button class="routeMapMetric" id="routeMapDoneToggle" type="button" title="Cliquer pour afficher km ou %">
        <span class="routeMapMetricLabel">Distance parcourue</span>
        <strong class="routeMapMetricValue" id="routeMapDone">— km</strong>
      </button>
      <button class="routeMapMetric" id="routeMapRemainToggle" type="button" title="Cliquer pour afficher km ou %">
        <span class="routeMapMetricLabel">Distance à faire</span>
        <strong class="routeMapMetricValue" id="routeMapRemain">— km</strong>
      </button>
    `;

    const canvasZone=document.createElement('div');
    canvasZone.id='routeMapCanvasZone';
    minimapCanvas.parentNode.insertBefore(canvasZone,minimapCanvas);
    canvasZone.appendChild(minimapCanvas);
    canvasZone.parentNode.insertBefore(info,canvasZone);

    const opacity=document.createElement('div');
    opacity.id='routeMapOpacity';
    opacity.innerHTML=`
      <label for="routeMapOpacitySlider">Opacité</label>
      <input id="routeMapOpacitySlider" type="range" min="25" max="100" step="5" value="80" aria-label="Opacité du panneau de carte">
      <span id="routeMapOpacityValue">80 %</span>
    `;
    mapbox.appendChild(opacity);

    const toggleMode=()=>{
      progressDisplayMode=progressDisplayMode==='km'?'percent':'km';
      updateRouteMapInfo(lastDrawCum);
    };
    $('routeMapDoneToggle')?.addEventListener('click',toggleMode);
    $('routeMapRemainToggle')?.addEventListener('click',toggleMode);

    $('routeMapOpacitySlider')?.addEventListener('input',event=>{
      const pct=Math.max(25,Math.min(100,Number(event.target.value)||80));
      mapbox.style.setProperty('--route-map-opacity',(pct/100).toFixed(2));
      const value=$('routeMapOpacityValue');
      if(value)value.textContent=`${pct} %`;
    });
  }

  let lastDrawCum=0;
  function updateRouteMapInfo(cum=0){
    lastDrawCum=Number.isFinite(cum)?Math.max(0,cum):0;
    const total=Math.max(0,routeLength);
    const done=Math.min(total,lastDrawCum);
    const remain=Math.max(0,total-done);
    const donePct=total>0?done/total*100:0;
    const remainPct=total>0?remain/total*100:0;

    const lengthEl=$('routeMapLength');
    const doneEl=$('routeMapDone');
    const remainEl=$('routeMapRemain');
    if(lengthEl)lengthEl.textContent=total>0?`${(total/1000).toFixed(1)} km`:'— km';

    if(progressDisplayMode==='percent'){
      if(doneEl)doneEl.textContent=`${donePct.toFixed(1)} %`;
      if(remainEl)remainEl.textContent=`${remainPct.toFixed(1)} %`;
    }else{
      if(doneEl)doneEl.textContent=`${(done/1000).toFixed(1)} km`;
      if(remainEl)remainEl.textContent=`${(remain/1000).toFixed(1)} km`;
    }
  }

  installMapPanelUi();

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
    const candidates=roadGuideSign?[...geographicSigns,roadGuideSign]:geographicSigns;
    if(!nr||!candidates.length)return;
    let best=null,bestDelta=Infinity;
    for(const f of candidates){
      if(!f?.key||passedSignKeys.has(f.key))continue;
      const d=Math.abs(signDisplayCum(f)-nr.cum);
      if(d<=14&&d<bestDelta){best=f;bestDelta=d;}
    }
    if(best){
      passedSignKeys.add(best.key);
      signReadout.key=best.key;
      signReadout.text=signReadoutText(best);
      signReadout.startedAt=performance.now();
    }
    for(const f of candidates){
      if(passedSignKeys.has(f.key)&&Math.abs(signDisplayCum(f)-nr.cum)>80){
        passedSignKeys.delete(f.key);
      }
    }
  }

  // ---------- minimap ----------
  const mc=minimapCanvas;
  const mctx=mc?.getContext('2d');
  let bounds=null;

  function prepMap(){
    syncMinimapState();
    let minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
    for(const p of route){
      minx=Math.min(minx,p.x);maxx=Math.max(maxx,p.x);
      minz=Math.min(minz,p.z);maxz=Math.max(maxz,p.z);
    }
    bounds={minx,maxx,minz,maxz};
    updateRouteMapInfo(lastDrawCum);
  }

  function drawMap(cum=0){
    syncMinimapState();
    updateRouteMapInfo(cum);
    if(!bounds||!mc||!mctx||!route.length||routeLength<=0)return;

    const dpr=devicePixelRatio||1,w=mc.clientWidth,h=mc.clientHeight;
    if(w<=0||h<=0)return;
    if(mc.width!==Math.round(w*dpr)||mc.height!==Math.round(h*dpr)){
      mc.width=Math.round(w*dpr);mc.height=Math.round(h*dpr);
    }
    mctx.setTransform(dpr,0,0,dpr,0,0);
    mctx.clearRect(0,0,w,h);
    mctx.fillStyle='#0a1725';mctx.fillRect(0,0,w,h);

    const pad=18;
    const spanX=Math.max(1,bounds.maxx-bounds.minx);
    const spanZ=Math.max(1,bounds.maxz-bounds.minz);
    const sx=(w-2*pad)/spanX,sz=(h-2*pad)/spanZ,sc=Math.min(sx,sz);
    const mapW=spanX*sc,mapH=spanZ*sc;
    const originX=(w-mapW)/2,originZ=(h-mapH)/2;
    const X=x=>originX+(x-bounds.minx)*sc;
    const Z=z=>originZ+(z-bounds.minz)*sc;

    mctx.strokeStyle='#89a3ba';mctx.lineWidth=3;mctx.beginPath();
    route.forEach((p,i)=>i?mctx.lineTo(X(p.x),Z(p.z)):mctx.moveTo(X(p.x),Z(p.z)));
    mctx.stroke();

    const a=route[0],b=route[route.length-1];
    mctx.fillStyle='#56e37a';mctx.beginPath();mctx.arc(X(a.x),Z(a.z),4,0,Math.PI*2);mctx.fill();
    mctx.fillStyle='#f2f5f8';mctx.beginPath();mctx.arc(X(b.x),Z(b.z),4,0,Math.PI*2);mctx.fill();

    const p=routePointAt(Math.max(0,Math.min(1,cum/routeLength)));
    const carMapX=X(p.x),carMapZ=Z(p.z);
    mctx.fillStyle='#ff4949';mctx.beginPath();mctx.arc(carMapX,carMapZ,5,0,Math.PI*2);mctx.fill();

    for(const peer of multiplayer.getPeers()){
      const remote=llToXZ(peer.lat,peer.lon);
      if(remote.x<bounds.minx||remote.x>bounds.maxx||remote.z<bounds.minz||remote.z>bounds.maxz)continue;
      const px=X(remote.x),pz=Z(remote.z);
      mctx.fillStyle='#48d9ff';mctx.beginPath();mctx.arc(px,pz,4.5,0,Math.PI*2);mctx.fill();
      mctx.font='700 9px system-ui';mctx.textAlign='left';mctx.textBaseline='bottom';mctx.fillStyle='#bdefff';
      mctx.fillText(peer.name,px+7,pz-4);
    }

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
      }else{
        signReadout.key=null;signReadout.text='';signReadout.startedAt=0;
      }
    }

    // Endpoint labels stay inside the canvas map area. The route statistics are
    // now DOM content above the canvas, so they can never overlap route geometry.
    const startPt=route[0],endPt=route[route.length-1];
    if(startPt&&endPt){
      const sxp=X(startPt.x),szp=Z(startPt.z),exp=X(endPt.x),ezp=Z(endPt.z);
      mctx.font='700 11px system-ui';mctx.textBaseline='middle';
      mctx.fillStyle='#7dff9a';mctx.textAlign=sxp<w/2?'left':'right';
      mctx.fillText(ROUTE_START.name||'Départ',sxp+(sxp<w/2?8:-8),szp);
      mctx.fillStyle='#f0f4f8';mctx.textAlign=exp<w/2?'left':'right';
      mctx.fillText(ROUTE_END.name||'Arrivée',exp+(exp<w/2?8:-8),ezp);
    }
  }

  function resetSignReadout(){
    passedSignKeys.clear();
    signReadout.key=null;signReadout.text='';signReadout.startedAt=0;
  }

  return Object.freeze({
    resetSignReadout,
    prepMap,
    drawMap,
    updatePassedSignReadout
  });
}
