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

function setGameControlsHidden(hidden){
  helpPanel?.classList.toggle('hiddenControls',hidden);
  speedometerDock?.classList.toggle('visible',hidden);
  speedometerDock?.setAttribute('aria-hidden',hidden?'false':'true');
  if(!hidden){
    helpToggle.textContent='−';
    helpToggle.title='Masquer les commandes';
    helpToggle.setAttribute('aria-label',helpToggle.title);
  }else{
    requestAnimationFrame(drawSpeedometer);
  }
}
helpToggle?.addEventListener('click',()=>setGameControlsHidden(true));
showControlsBtn?.addEventListener('click',()=>setGameControlsHidden(false));

function drawGaugeBezel(ctx,cx,cy,radius,{thick=false}={}){
  const housing=ctx.createRadialGradient(cx,cy,radius*.35,cx,cy,radius*1.12);
  housing.addColorStop(0,'rgba(20,22,25,.98)');
  housing.addColorStop(.72,'rgba(5,6,8,.99)');
  housing.addColorStop(1,'rgba(0,0,0,1)');
  ctx.fillStyle=housing;ctx.beginPath();ctx.arc(cx,cy,radius+10,0,Math.PI*2);ctx.fill();
  const metal=ctx.createLinearGradient(cx-radius,cy-radius,cx+radius,cy+radius);
  metal.addColorStop(0,'#777d83');metal.addColorStop(.18,'#f2f4f5');metal.addColorStop(.36,'#70757b');metal.addColorStop(.55,'#f7f8f8');metal.addColorStop(.75,'#777c81');metal.addColorStop(1,'#d8dbde');
  ctx.strokeStyle=metal;ctx.lineWidth=thick?7:5;ctx.beginPath();ctx.arc(cx,cy,radius+3,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,radius-2,0,Math.PI*2);ctx.stroke();
  const face=ctx.createRadialGradient(cx-radius*.16,cy-radius*.18,radius*.06,cx,cy,radius);
  face.addColorStop(0,'#121417');face.addColorStop(.52,'#08090b');face.addColorStop(1,'#010203');
  ctx.fillStyle=face;ctx.beginPath();ctx.arc(cx,cy,radius-6,0,Math.PI*2);ctx.fill();
}

let instrumentStaticBuild=false;
function drawNeedle(ctx,cx,cy,angle,length,{width=4,tail=12}={}){
  if(instrumentStaticBuild)return;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);ctx.shadowColor='rgba(255,38,45,.48)';ctx.shadowBlur=5;ctx.strokeStyle='#ff2d35';ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-tail,0);ctx.lineTo(length,0);ctx.stroke();ctx.shadowBlur=0;ctx.restore();
  const hub=ctx.createRadialGradient(cx-2,cy-2,1,cx,cy,8);hub.addColorStop(0,'#f7f7f7');hub.addColorStop(.24,'#8b8d90');hub.addColorStop(.58,'#25282b');hub.addColorStop(1,'#050607');ctx.fillStyle=hub;ctx.beginPath();ctx.arc(cx,cy,7,0,Math.PI*2);ctx.fill();
}

function drawTachometer(ctx,{cx,cy,radius}){
  drawGaugeBezel(ctx,cx,cy,radius);
  const profile=activeTransmissionProfile();
  const isCombustion=profile.type==='combustion';
  const start=Math.PI*.75,sweep=Math.PI*1.50;
  if(!isCombustion){
    for(let i=0;i<=8;i++){const ratio=i/8,angle=start+sweep*ratio,major=i%2===0,r1=major?radius-25:radius-20,r2=radius-11;ctx.strokeStyle=major?'rgba(245,247,248,.92)':'rgba(224,229,233,.55)';ctx.lineWidth=major?3:1.5;ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*r1,cy+Math.sin(angle)*r1);ctx.lineTo(cx+Math.cos(angle)*r2,cy+Math.sin(angle)*r2);ctx.stroke();}
    ctx.fillStyle='#f5f6f7';ctx.font='800 24px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('EV',cx,cy-5);ctx.fillStyle='rgba(220,225,230,.74)';ctx.font='700 9px Inter,system-ui,sans-serif';ctx.fillText('ELECTRIC',cx,cy+16);return;
  }
  const redline=Number(profile.redlineRpm)||6500;
  const effectiveRedline=effectiveEngineRedlineRpm(profile,currentOnPavementForInstruments);
  const dialMaxThousands=Math.max(8,Math.ceil(redline/1000));
  const dialMaxRpm=dialMaxThousands*1000;
  const minorStep=200;
  for(let value=0;value<=dialMaxRpm;value+=minorStep){const ratio=value/dialMaxRpm,angle=start+sweep*ratio,major=value%1000===0,mid=value%500===0,r1=major?radius-28:mid?radius-23:radius-18,r2=radius-10,inRed=value>=effectiveRedline*.90;ctx.strokeStyle=inRed?'#ff383e':major?'rgba(250,250,250,.98)':mid?'rgba(242,244,245,.84)':'rgba(226,230,232,.62)';ctx.lineWidth=major?3.3:mid?2.2:1.3;ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*r1,cy+Math.sin(angle)*r1);ctx.lineTo(cx+Math.cos(angle)*r2,cy+Math.sin(angle)*r2);ctx.stroke();}
  for(let i=0;i<=dialMaxThousands;i++){const ratio=(i*1000)/dialMaxRpm,angle=start+sweep*ratio,labelRadius=radius-40;ctx.fillStyle=i*1000>=effectiveRedline*.90?'#ff4a50':'rgba(248,248,248,.94)';ctx.font='800 15px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i),cx+Math.cos(angle)*labelRadius,cy+Math.sin(angle)*labelRadius);}
  ctx.fillStyle='rgba(232,235,237,.78)';ctx.font='700 9px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('x1000 RPM',cx,cy+26);
  const rpmRatio=physicsClamp(engineRpm/dialMaxRpm,0,1);drawNeedle(ctx,cx,cy,start+sweep*rpmRatio,radius-31,{width:3.5,tail:10});
}

function drawSpeedGauge(ctx,{cx,cy,radius}){
  drawGaugeBezel(ctx,cx,cy,radius,{thick:true});
  const start=Math.PI*.75,sweep=Math.PI*1.50;
  const mechanicalMax=Math.max(80,vehicleTopSpeedKmh());
  const dialMax=Math.max(180,Math.ceil(mechanicalMax/20)*20);
  ctx.strokeStyle='rgba(242,244,246,.88)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx,cy,radius-13,start,start+sweep);ctx.stroke();
  for(let value=0;value<=dialMax;value+=10){const ratio=value/dialMax,angle=start+sweep*ratio,major=value%20===0,r1=major?radius-29:radius-23,r2=radius-13;ctx.strokeStyle=major?'#08090a':'rgba(13,14,15,.72)';ctx.lineWidth=major?2.5:1.3;ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*r1,cy+Math.sin(angle)*r1);ctx.lineTo(cx+Math.cos(angle)*r2,cy+Math.sin(angle)*r2);ctx.stroke();if(major){ctx.fillStyle='rgba(247,247,247,.97)';ctx.font='800 15px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(value),cx+Math.cos(angle)*(radius-34),cy+Math.sin(angle)*(radius-34));}}
  ctx.fillStyle='rgba(245,246,247,.92)';ctx.font='800 11px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('km/h',cx,cy-28);
  const kmh=Math.abs(speed)*3.6,speedRatio=physicsClamp(kmh/dialMax,0,1);drawNeedle(ctx,cx,cy,start+sweep*speedRatio,radius-39,{width:4,tail:13});
  const lcdW=44,lcdH=44,lcdX=cx-lcdW/2,lcdY=cy+42;
  const lcd=ctx.createLinearGradient(lcdX,lcdY,lcdX,lcdY+lcdH);lcd.addColorStop(0,'#383c42');lcd.addColorStop(.48,'#202329');lcd.addColorStop(1,'#111318');ctx.fillStyle=lcd;ctx.strokeStyle='rgba(180,186,192,.62)';ctx.lineWidth=1.4;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(lcdX,lcdY,lcdW,lcdH,4);else ctx.rect(lcdX,lcdY,lcdW,lcdH);ctx.fill();ctx.stroke();
  if(!instrumentStaticBuild){
    const profile=activeTransmissionProfile();
    const isCombustion=profile.type==='combustion';
    let gearText;
    if(!isCombustion){
      gearText=transmissionGear<0?'R':transmissionGear===0?'N':'D';
    }else if(transmissionShifting){
      gearText='—';
    }else if(transmissionGear<0){
      gearText='R';
    }else if(transmissionGear===0){
      gearText='N';
    }else{
      gearText=String(transmissionGear);
    }
    ctx.fillStyle=revLimiterActive?'#ff474d':'#ff3a40';ctx.font='900 27px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(gearText,cx,lcdY+lcdH/2+1);
    const status=revLimiterActive?'LIMIT':transmissionShifting?'SHIFT':transmissionMode==='manual'?'MAN':'AUTO';
    if(status){ctx.fillStyle=revLimiterActive?'#ff575d':transmissionShifting?'#ffd36a':'rgba(220,226,232,.72)';ctx.font=transmissionShifting||revLimiterActive?'900 8px Inter,system-ui,sans-serif':'800 7px Inter,system-ui,sans-serif';ctx.fillText(status,cx,lcdY-5);}
  }
}

let staticSpeedometerLayer=null;
let staticSpeedometerWidth=0;
let staticSpeedometerHeight=0;
function invalidateStaticSpeedometer(){staticSpeedometerLayer=null;staticSpeedometerWidth=0;staticSpeedometerHeight=0;}
function drawSpeedometer(){
  syncInstrumentState();
  if(!speedometerCtx||!speedometerCanvas)return;
  const rect=speedometerCanvas.getBoundingClientRect();
  const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  const cssW=Math.max(360,Math.round(rect.width||520)),cssH=Math.max(190,Math.round(rect.height||250));
  const pixelW=Math.round(cssW*dpr),pixelH=Math.round(cssH*dpr);
  if(speedometerCanvas.width!==pixelW||speedometerCanvas.height!==pixelH){speedometerCanvas.width=pixelW;speedometerCanvas.height=pixelH;invalidateStaticSpeedometer();}
  speedometerCtx.setTransform(dpr,0,0,dpr,0,0);speedometerCtx.clearRect(0,0,cssW,cssH);
  if(!staticSpeedometerLayer||staticSpeedometerWidth!==cssW||staticSpeedometerHeight!==cssH){
    staticSpeedometerWidth=cssW;staticSpeedometerHeight=cssH;
    staticSpeedometerLayer=document.createElement('canvas');staticSpeedometerLayer.width=pixelW;staticSpeedometerLayer.height=pixelH;
    const sctx=staticSpeedometerLayer.getContext('2d');sctx.setTransform(dpr,0,0,dpr,0,0);instrumentStaticBuild=true;
    const gap=cssW*.09,radius=Math.min(82,cssH*.36,cssW*.19),totalWidth=radius*4+gap,leftCx=(cssW-totalWidth)/2+radius,rightCx=leftCx+radius*2+gap,cy=cssH*.50;
    drawTachometer(sctx,{cx:leftCx,cy,radius});drawSpeedGauge(sctx,{cx:rightCx,cy,radius});instrumentStaticBuild=false;
  }
  speedometerCtx.drawImage(staticSpeedometerLayer,0,0,staticSpeedometerLayer.width,staticSpeedometerLayer.height,0,0,cssW,cssH);
  const gap=cssW*.09,radius=Math.min(82,cssH*.36,cssW*.19),totalWidth=radius*4+gap,leftCx=(cssW-totalWidth)/2+radius,rightCx=leftCx+radius*2+gap,cy=cssH*.50;
  drawTachometer(speedometerCtx,{cx:leftCx,cy,radius});drawSpeedGauge(speedometerCtx,{cx:rightCx,cy,radius});
}

function drawCompass(){
  syncInstrumentState();
  const canvas=$('compassCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const size=Math.max(110,Math.round(canvas.getBoundingClientRect().width||130));const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));canvas.width=size*dpr;canvas.height=size*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
  const cx=size/2,cy=size/2,radius=size*.42;ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
  const labels=[['N',0],['E',Math.PI/2],['S',Math.PI],['O',Math.PI*1.5]];ctx.font='800 12px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const [label,a] of labels){const angle=a-heading;ctx.fillStyle=label==='N'?'#ff4a50':'rgba(240,243,245,.86)';ctx.fillText(label,cx+Math.sin(angle)*radius*.75,cy-Math.cos(angle)*radius*.75);}
  ctx.strokeStyle='#ffd36a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,cy-radius*.72);ctx.lineTo(cx-5,cy-radius*.58);ctx.lineTo(cx+5,cy-radius*.58);ctx.closePath();ctx.stroke();
}

return {setGameControlsHidden,drawSpeedometer,drawCompass,invalidateStaticSpeedometer};
}
