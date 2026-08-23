// World Drive V21.25 — instrument cluster and compass presentation.
// Extracted mechanically from main.js. Runtime state stays owned by main.js.

export function createInstrumentCluster({
  physicsClamp,
  activeTransmissionProfile,
  effectiveEngineRedlineRpm,
  vehicleTopSpeedKmh,
  vehicleSystem,
  getState
}){
  if(typeof physicsClamp!=='function')throw new Error('instrument cluster requires physicsClamp');
  if(typeof activeTransmissionProfile!=='function')throw new Error('instrument cluster requires activeTransmissionProfile');
  if(typeof effectiveEngineRedlineRpm!=='function')throw new Error('instrument cluster requires effectiveEngineRedlineRpm');
  if(typeof vehicleTopSpeedKmh!=='function')throw new Error('instrument cluster requires vehicleTopSpeedKmh');
  if(!vehicleSystem)throw new Error('instrument cluster requires vehicleSystem');
  if(typeof getState!=='function')throw new Error('instrument cluster requires getState');

  const $=id=>document.getElementById(id);

  let currentOnPavementForInstruments=true;
  let engineRpm=0;
  let speed=0;
  let transmissionShifting=false;
  let transmissionGear=1;
  let revLimiterActive=false;
  let transmissionMode='automatic';
  let heading=0;

  function syncInstrumentState(){
    const state=getState()||{};
    currentOnPavementForInstruments=!!state.currentOnPavementForInstruments;
    engineRpm=Number(state.engineRpm)||0;
    speed=Number(state.speed)||0;
    transmissionShifting=!!state.transmissionShifting;
    const requestedGear=Number(state.transmissionGear);
    transmissionGear=Number.isFinite(requestedGear)?requestedGear:1;
    revLimiterActive=!!state.revLimiterActive;
    transmissionMode=state.transmissionMode==='manual'?'manual':'automatic';
    heading=Number(state.heading)||0;
  }
// ---------- V20.7 unified instrument cluster ----------
const helpPanel=$('help');
const helpToggle=$('helpToggle');
const speedometerDock=$('speedometerDock');
const showControlsBtn=$('showControlsBtn');
const speedometerCanvas=$('speedometerCanvas');
const speedometerCtx=speedometerCanvas?.getContext('2d');

// The existing speedometer dock is reused so the new cluster keeps the same
// "Commandes" show/hide behavior. Everything is drawn by code: no image asset.


function setGameControlsHidden(hidden){
  helpPanel?.classList.toggle('hiddenControls',hidden);
  speedometerDock?.classList.toggle('visible',hidden);
  speedometerDock?.setAttribute(
    'aria-hidden',
    hidden?'false':'true'
  );

  if(!hidden){
    helpToggle.textContent='−';
    helpToggle.title='Masquer les commandes';
    helpToggle.setAttribute(
      'aria-label',
      helpToggle.title
    );
  }else{
    requestAnimationFrame(drawSpeedometer);
  }
}

helpToggle?.addEventListener(
  'click',
  ()=>setGameControlsHidden(true)
);

showControlsBtn?.addEventListener(
  'click',
  ()=>setGameControlsHidden(false)
);

function drawGaugeBezel(
  ctx,
  cx,
  cy,
  radius,
  {
    thick=false
  }={}
){
  // Outer black housing.
  const housing=ctx.createRadialGradient(
    cx,
    cy,
    radius*.35,
    cx,
    cy,
    radius*1.12
  );

  housing.addColorStop(0,'rgba(20,22,25,.98)');
  housing.addColorStop(.72,'rgba(5,6,8,.99)');
  housing.addColorStop(1,'rgba(0,0,0,1)');

  ctx.fillStyle=housing;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius+10,
    0,
    Math.PI*2
  );
  ctx.fill();

  // Chrome / brushed-metal ring inspired by the reference cluster.
  const metal=ctx.createLinearGradient(
    cx-radius,
    cy-radius,
    cx+radius,
    cy+radius
  );

  metal.addColorStop(0,'#777d83');
  metal.addColorStop(.18,'#f2f4f5');
  metal.addColorStop(.36,'#70757b');
  metal.addColorStop(.55,'#f7f8f8');
  metal.addColorStop(.75,'#777c81');
  metal.addColorStop(1,'#d8dbde');

  ctx.strokeStyle=metal;
  ctx.lineWidth=thick?7:5;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius+3,
    0,
    Math.PI*2
  );
  ctx.stroke();

  ctx.strokeStyle='rgba(255,255,255,.65)';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius-2,
    0,
    Math.PI*2
  );
  ctx.stroke();

  // Black dial face.
  const face=ctx.createRadialGradient(
    cx-radius*.16,
    cy-radius*.18,
    radius*.06,
    cx,
    cy,
    radius
  );

  face.addColorStop(0,'#121417');
  face.addColorStop(.52,'#08090b');
  face.addColorStop(1,'#010203');

  ctx.fillStyle=face;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius-6,
    0,
    Math.PI*2
  );
  ctx.fill();
}

let instrumentStaticBuild=false;

function drawNeedle(
  ctx,
  cx,
  cy,
  angle,
  length,
  {
    width=4,
    tail=12
  }={}
){
  if(instrumentStaticBuild)return;
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(angle);

  ctx.shadowColor='rgba(255,38,45,.48)';
  ctx.shadowBlur=5;
  ctx.strokeStyle='#ff2d35';
  ctx.lineWidth=width;
  ctx.lineCap='round';

  ctx.beginPath();
  ctx.moveTo(-tail,0);
  ctx.lineTo(length,0);
  ctx.stroke();

  ctx.shadowBlur=0;
  ctx.restore();

  const hub=ctx.createRadialGradient(
    cx-2,
    cy-2,
    1,
    cx,
    cy,
    8
  );

  hub.addColorStop(0,'#f7f7f7');
  hub.addColorStop(.24,'#8b8d90');
  hub.addColorStop(.58,'#25282b');
  hub.addColorStop(1,'#050607');

  ctx.fillStyle=hub;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    7,
    0,
    Math.PI*2
  );
  ctx.fill();
}

function drawTachometer(
  ctx,
  {
    cx,
    cy,
    radius
  }
){
  drawGaugeBezel(
    ctx,
    cx,
    cy,
    radius
  );

  const profile=activeTransmissionProfile();
  const isCombustion=
    profile.type==='combustion';

  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;

  if(!isCombustion){
    // EVs keep the same physical cluster, but we avoid inventing RPM.
    for(let i=0;i<=8;i++){
      const ratio=i/8;
      const angle=start+sweep*ratio;
      const major=i%2===0;
      const r1=major?radius-25:radius-20;
      const r2=radius-11;

      ctx.strokeStyle=
        major
          ?'rgba(245,247,248,.92)'
          :'rgba(224,229,233,.55)';

      ctx.lineWidth=major?3:1.5;

      ctx.beginPath();
      ctx.moveTo(
        cx+Math.cos(angle)*r1,
        cy+Math.sin(angle)*r1
      );
      ctx.lineTo(
        cx+Math.cos(angle)*r2,
        cy+Math.sin(angle)*r2
      );
      ctx.stroke();
    }

    ctx.fillStyle='#f5f6f7';
    ctx.font='800 24px Inter,system-ui,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(
      'EV',
      cx,
      cy-5
    );

    ctx.fillStyle='rgba(220,225,230,.74)';
    ctx.font='700 9px Inter,system-ui,sans-serif';
    ctx.fillText(
      'ELECTRIC',
      cx,
      cy+16
    );

    return;
  }

  const redline=
    Number(profile.redlineRpm)||
    6500;

  const effectiveRedline=
    effectiveEngineRedlineRpm(
      profile,
      currentOnPavementForInstruments
    );

  const dialMaxThousands=
    Math.max(
      8,
      Math.ceil(
        redline/
        1000
      )
    );

  const dialMaxRpm=
    dialMaxThousands*
    1000;

  // Dense white ticks.
  const minorStep=200;

  for(
    let value=0;
    value<=dialMaxRpm;
    value+=minorStep
  ){
    const ratio=value/dialMaxRpm;
    const angle=start+sweep*ratio;

    const major=value%1000===0;
    const mid=value%500===0;

    const r1=
      major
        ?radius-28
        :mid
          ?radius-23
          :radius-18;

    const r2=radius-10;

    const inRed=
      value>=effectiveRedline*.90;

    ctx.strokeStyle=
      inRed
        ?'#ff383e'
        :major
          ?'rgba(250,250,250,.98)'
          :mid
            ?'rgba(242,244,245,.84)'
            :'rgba(226,230,232,.62)';

    ctx.lineWidth=
      major
        ?3.3
        :mid
          ?2.2
          :1.3;

    ctx.beginPath();
    ctx.moveTo(
      cx+Math.cos(angle)*r1,
      cy+Math.sin(angle)*r1
    );
    ctx.lineTo(
      cx+Math.cos(angle)*r2,
      cy+Math.sin(angle)*r2
    );
    ctx.stroke();
  }

  // RPM labels.
  for(
    let i=0;
    i<=dialMaxThousands;
    i++
  ){
    const ratio=
      (i*1000)/
      dialMaxRpm;

    const angle=
      start+
      sweep*
      ratio;

    const labelRadius=
      radius-40;

    ctx.fillStyle=
      i*1000>=effectiveRedline*.90
        ?'#ff4a50'
        :'rgba(248,248,248,.94)';

    ctx.font='800 15px Inter,system-ui,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    ctx.fillText(
      String(i),
      cx+Math.cos(angle)*labelRadius,
      cy+Math.sin(angle)*labelRadius
    );
  }

  ctx.fillStyle='rgba(232,235,237,.78)';
  ctx.font='700 9px Inter,system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(
    'x1000 RPM',
    cx,
    cy+26
  );

  const rpmRatio=
    physicsClamp(
      engineRpm/
      dialMaxRpm,
      0,
      1
    );

  drawNeedle(
    ctx,
    cx,
    cy,
    start+sweep*rpmRatio,
    radius-31,
    {
      width:3.5,
      tail:10
    }
  );
}

function drawSpeedGauge(
  ctx,
  {
    cx,
    cy,
    radius
  }
){
  drawGaugeBezel(
    ctx,
    cx,
    cy,
    radius,
    {
      thick:true
    }
  );

  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;

  const mechanicalMax=
    Math.max(
      80,
      vehicleTopSpeedKmh()
    );

  const dialMax=
    Math.max(
      180,
      Math.ceil(
        mechanicalMax/
        20
      )*
      20
    );

  // Bright inner scale band.
  ctx.strokeStyle='rgba(242,244,246,.88)';
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius-13,
    start,
    start+sweep
  );
  ctx.stroke();

  for(
    let value=0;
    value<=dialMax;
    value+=10
  ){
    const ratio=value/dialMax;
    const angle=start+sweep*ratio;

    const major=value%20===0;
    const r1=
      major
        ?radius-29
        :radius-23;

    const r2=radius-13;

    ctx.strokeStyle=
      major
        ?'#08090a'
        :'rgba(13,14,15,.72)';

    ctx.lineWidth=
      major
        ?2.5
        :1.3;

    ctx.beginPath();
    ctx.moveTo(
      cx+Math.cos(angle)*r1,
      cy+Math.sin(angle)*r1
    );
    ctx.lineTo(
      cx+Math.cos(angle)*r2,
      cy+Math.sin(angle)*r2
    );
    ctx.stroke();

    if(major){
      ctx.fillStyle='rgba(247,247,247,.97)';
      ctx.font='800 15px Inter,system-ui,sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';

      ctx.fillText(
        String(value),
        cx+Math.cos(angle)*(radius-34),
        cy+Math.sin(angle)*(radius-34)
      );
    }
  }

  ctx.fillStyle='rgba(245,246,247,.92)';
  ctx.font='800 11px Inter,system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(
    'km/h',
    cx,
    cy-28
  );

  const kmh=
    Math.abs(speed)*
    3.6;

  const speedRatio=
    physicsClamp(
      kmh/
      dialMax,
      0,
      1
    );

  drawNeedle(
    ctx,
    cx,
    cy,
    start+sweep*speedRatio,
    radius-39,
    {
      width:4,
      tail:13
    }
  );

  // Integrated gear LCD, inspired by the rectangular display in the reference.
  const lcdW=44;
  const lcdH=44;
  const lcdX=cx-lcdW/2;
  const lcdY=cy+42;

  const lcd=ctx.createLinearGradient(
    lcdX,
    lcdY,
    lcdX,
    lcdY+lcdH
  );

  lcd.addColorStop(0,'#383c42');
  lcd.addColorStop(.48,'#202329');
  lcd.addColorStop(1,'#111318');

  ctx.fillStyle=lcd;
  ctx.strokeStyle='rgba(180,186,192,.62)';
  ctx.lineWidth=1.4;

  ctx.beginPath();
  if(ctx.roundRect){
    ctx.roundRect(
      lcdX,
      lcdY,
      lcdW,
      lcdH,
      4
    );
  }else{
    ctx.rect(
      lcdX,
      lcdY,
      lcdW,
      lcdH
    );
  }
  ctx.fill();
  ctx.stroke();

  if(!instrumentStaticBuild){
    const profile=activeTransmissionProfile();
    const isCombustion=
      profile.type==='combustion';

    let gearText;

    if(!isCombustion){
      gearText=
        speed<-.25
          ?'R'
          :'D';
    }else if(transmissionShifting){
      gearText='—';
    }else{
      gearText=
        transmissionGear<0
          ?'R'
          :String(
             Math.max(
               1,
               transmissionGear
             )
           );
    }

    ctx.fillStyle=
      revLimiterActive
        ?'#ff474d'
        :'#ff3a40';

    ctx.font='900 27px Inter,system-ui,sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    ctx.fillText(
      gearText,
      cx,
      lcdY+lcdH/2+1
    );

    const status=
      revLimiterActive
        ?'LIMIT'
        :transmissionShifting
          ?'SHIFT'
          :transmissionMode==='manual'
            ?'MAN'
            :'AUTO';

    if(status){
      ctx.fillStyle=
        revLimiterActive
          ?'#ff575d'
          :transmissionShifting
            ?'#ffd36a'
            :'rgba(220,226,232,.72)';

      ctx.font=
        transmissionShifting||
        revLimiterActive
          ?'900 8px Inter,system-ui,sans-serif'
          :'800 7px Inter,system-ui,sans-serif';

      ctx.fillText(
        status,
        cx,
        lcdY-5
      );
    }
  }
}

const instrumentStaticCanvas=document.createElement('canvas');
const instrumentStaticCtx=instrumentStaticCanvas.getContext('2d');
let instrumentStaticCacheKey='';
const instrumentDynamicCache={
  dialMax:180,
  tachDialMaxRpm:8000,
  isCombustion:true
};

function instrumentCacheKey(dpr){
  return [
    vehicleSystem.activeId,
    currentOnPavementForInstruments?'road':'terrain',
    dpr.toFixed(2)
  ].join('|');
}

function drawTachometerDynamic(ctx,{cx,cy,radius}){
  if(!instrumentDynamicCache.isCombustion)return;
  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;
  const rpmRatio=physicsClamp(engineRpm/instrumentDynamicCache.tachDialMaxRpm,0,1);
  drawNeedle(ctx,cx,cy,start+sweep*rpmRatio,radius-31,{width:3.5,tail:10});
}

function drawSpeedGaugeDynamic(ctx,{cx,cy,radius}){
  const start=Math.PI*.75;
  const sweep=Math.PI*1.50;
  const kmh=Math.abs(speed)*3.6;
  const speedRatio=physicsClamp(kmh/instrumentDynamicCache.dialMax,0,1);
  drawNeedle(ctx,cx,cy,start+sweep*speedRatio,radius-39,{width:4,tail:13});

  const lcdH=44;
  const lcdY=cy+42;
  let gearText;
  if(!instrumentDynamicCache.isCombustion){
    gearText=speed<-.25?'R':'D';
  }else if(transmissionShifting){
    gearText='—';
  }else{
    gearText=transmissionGear<0?'R':String(Math.max(1,transmissionGear));
  }

  ctx.fillStyle=revLimiterActive?'#ff474d':'#ff3a40';
  ctx.font='900 27px Inter,system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(gearText,cx,lcdY+lcdH/2+1);

  const status=revLimiterActive?'LIMIT':transmissionShifting?'SHIFT':transmissionMode==='manual'?'MAN':'AUTO';
  if(status){
    ctx.fillStyle=revLimiterActive?'#ff575d':transmissionShifting?'#ffd36a':'rgba(220,226,232,.72)';
    ctx.font=transmissionShifting||revLimiterActive
      ?'900 8px Inter,system-ui,sans-serif'
      :'800 7px Inter,system-ui,sans-serif';
    ctx.fillText(status,cx,lcdY-5);
  }
}

function rebuildInstrumentStaticCache(dpr,cssW,cssH){
  const profile=activeTransmissionProfile();
  instrumentDynamicCache.isCombustion=profile.type==='combustion';
  instrumentDynamicCache.tachDialMaxRpm=Math.max(8,Math.ceil((Number(profile.redlineRpm)||6500)/1000))*1000;
  const mechanicalMax=Math.max(80,vehicleTopSpeedKmh());
  instrumentDynamicCache.dialMax=Math.max(180,Math.ceil(mechanicalMax/20)*20);

  const pxW=Math.round(cssW*dpr);
  const pxH=Math.round(cssH*dpr);
  instrumentStaticCanvas.width=pxW;
  instrumentStaticCanvas.height=pxH;
  const ctx=instrumentStaticCtx;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);

  const panel=ctx.createLinearGradient(0,0,0,cssH);
  panel.addColorStop(0,'rgba(9,10,12,.92)');
  panel.addColorStop(.38,'rgba(1,2,3,.97)');
  panel.addColorStop(1,'rgba(0,0,0,.99)');
  ctx.fillStyle=panel;
  ctx.strokeStyle='rgba(118,124,130,.30)';
  ctx.lineWidth=1.5;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(2,2,cssW-4,cssH-4,22);else ctx.rect(2,2,cssW-4,cssH-4);
  ctx.fill();ctx.stroke();

  const hood=ctx.createLinearGradient(0,0,0,52);
  hood.addColorStop(0,'rgba(25,27,30,.80)');
  hood.addColorStop(1,'rgba(3,4,5,0)');
  ctx.fillStyle=hood;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(16,8,cssW-32,55,24);else ctx.rect(16,8,cssW-32,55);
  ctx.fill();

  instrumentStaticBuild=true;
  try{
    drawTachometer(ctx,{cx:108,cy:125,radius:84});
    drawSpeedGauge(ctx,{cx:337,cy:120,radius:112});
  }finally{
    instrumentStaticBuild=false;
  }
}

function drawSpeedometer(){
  syncInstrumentState();
  if(!speedometerCtx||!speedometerDock?.classList.contains('visible'))return;

  const canvas=speedometerCanvas;
  const dpr=devicePixelRatio||1;
  const cssW=480;
  const cssH=236;
  const pxW=Math.round(cssW*dpr);
  const pxH=Math.round(cssH*dpr);
  if(canvas.width!==pxW||canvas.height!==pxH){
    canvas.width=pxW;
    canvas.height=pxH;
    instrumentStaticCacheKey='';
  }

  const key=instrumentCacheKey(dpr);
  if(key!==instrumentStaticCacheKey){
    rebuildInstrumentStaticCache(dpr,cssW,cssH);
    instrumentStaticCacheKey=key;
  }

  const ctx=speedometerCtx;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(instrumentStaticCanvas,0,0);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  // Dynamic layer remains full-rate: only the two needles and the LCD text are
  // repainted each frame. The expensive bezels, gradients, ticks and labels are
  // pixel-identical cached content.
  drawTachometerDynamic(ctx,{cx:108,cy:125,radius:84});
  drawSpeedGaugeDynamic(ctx,{cx:337,cy:120,radius:112});
}

// V21 always starts with the compact instrument cluster visible.
// Visibility is now persisted in IndexedDB through appSettings.display.
setGameControlsHidden(true);

// ---------- compass ----------
const compassCanvas=$('compass'),compassCtx=compassCanvas.getContext('2d'),compassHeading=$('compassHeading');
const compassTapeCanvas=document.createElement('canvas');
const compassTapeCtx=compassTapeCanvas.getContext('2d');
let compassTapeKey='';

function headingDeg(){
  // World coordinates use +X = east and +Z = south because llToXZ()
  // negates latitude. Vehicle heading 0 therefore points SOUTH, not north.
  let d=(180-heading*180/Math.PI)%360;
  if(d<0)d+=360;
  return d;
}
function cardinalLabel(d){
  const labels=['N','NE','E','SE','S','SO','O','NO'];
  return labels[Math.round(d/45)%8];
}

function rebuildCompassTape(w,h,dpr){
  const pxPerDeg=w/120;
  const tapeCssW=w*9; // 1080 degrees: safe crop across the 0/360 wrap.
  compassTapeCanvas.width=Math.max(1,Math.round(tapeCssW*dpr));
  compassTapeCanvas.height=Math.max(1,Math.round(h*dpr));
  const ctx=compassTapeCtx;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,tapeCssW,h);

  for(let deg=0;deg<=1080;deg+=5){
    const norm=((deg%360)+360)%360;
    const x=deg*pxPerDeg;
    const major=(norm%45===0);
    const mid=(norm%15===0);
    const tickH=major?16:mid?10:6;
    ctx.strokeStyle=major?'rgba(255,255,255,.95)':mid?'rgba(255,255,255,.5)':'rgba(255,255,255,.28)';
    ctx.lineWidth=major?2:1;
    ctx.beginPath();
    ctx.moveTo(x,12);ctx.lineTo(x,12+tickH);ctx.stroke();

    if(major){
      const txt=cardinalLabel(norm);
      ctx.font='700 12px system-ui';
      ctx.textAlign='center';
      ctx.textBaseline='top';
      ctx.fillStyle=(txt==='N')?'#ff6767':'#e4edf6';
      ctx.fillText(txt,x,31);
    }
  }
}

let lastCompassHeadingText='';
function drawCompass(){
  syncInstrumentState();
  const dpr=devicePixelRatio||1,w=compassCanvas.clientWidth,h=compassCanvas.clientHeight;
  const W=Math.round(w*dpr),H=Math.round(h*dpr);
  if(compassCanvas.width!==W||compassCanvas.height!==H){
    compassCanvas.width=W;compassCanvas.height=H;compassTapeKey='';
  }
  const tapeKey=`${W}x${H}@${dpr.toFixed(2)}`;
  if(tapeKey!==compassTapeKey){
    rebuildCompassTape(w,h,dpr);
    compassTapeKey=tapeKey;
  }

  const hd=headingDeg();
  const pxPerDeg=w/120;
  const center=w/2;
  const sourceCssX=(hd+360)*pxPerDeg-center;

  // Full-rate refresh remains intact, but all ticks/labels come from one cached
  // strip. Per-frame work is a single blit plus the center marker.
  compassCtx.setTransform(1,0,0,1,0,0);
  compassCtx.clearRect(0,0,W,H);
  compassCtx.drawImage(
    compassTapeCanvas,
    sourceCssX*dpr,0,w*dpr,h*dpr,
    0,0,W,H
  );

  compassCtx.setTransform(dpr,0,0,dpr,0,0);
  compassCtx.strokeStyle='rgba(255,255,255,.16)';
  compassCtx.lineWidth=1;
  compassCtx.beginPath();
  compassCtx.moveTo(center,10);compassCtx.lineTo(center,h-8);compassCtx.stroke();

  const headingText=`${cardinalLabel(hd)} · ${String(Math.round(hd)%360).padStart(3,'0')}°`;
  if(headingText!==lastCompassHeadingText){
    lastCompassHeadingText=headingText;
    compassHeading.textContent=headingText;
  }
}


  return Object.freeze({
    setGameControlsHidden,
    drawSpeedometer,
    drawCompass
  });
}

