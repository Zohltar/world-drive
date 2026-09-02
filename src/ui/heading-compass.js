// World Drive V21.31 — standalone horizontal heading compass.
// Owns only HUD presentation; heading state remains supplied by main/instruments.

export function createHeadingCompass({getHeading}){
  if(typeof getHeading!=='function')throw new Error('heading compass requires getHeading');

  const canvas=document.getElementById('compass');
  const headingEl=document.getElementById('compassHeading');
  if(!canvas)return Object.freeze({draw(){}});

  const ctx=canvas.getContext('2d');
  if(!ctx)return Object.freeze({draw(){}});

  const labels=['N','NE','E','SE','S','SO','O','NO'];

  function headingDegrees(){
    const heading=Number(getHeading())||0;
    let deg=(180-heading*180/Math.PI)%360;
    if(deg<0)deg+=360;
    return deg;
  }

  function cardinal(deg){
    return labels[Math.round(deg/45)%8];
  }

  function draw(){
    const rect=canvas.getBoundingClientRect();
    const w=Math.max(1,Math.round(rect.width||560));
    const h=Math.max(1,Math.round(rect.height||58));
    const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
    const W=Math.round(w*dpr);
    const H=Math.round(h*dpr);

    if(canvas.width!==W||canvas.height!==H){
      canvas.width=W;
      canvas.height=H;
    }

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);

    const hd=headingDegrees();
    const center=w/2;
    const pxPerDeg=w/120;
    const startDeg=Math.floor((hd-65)/5)*5;
    const endDeg=Math.ceil((hd+65)/5)*5;

    for(let raw=startDeg;raw<=endDeg;raw+=5){
      const norm=((raw%360)+360)%360;
      const delta=raw-hd;
      const x=center+delta*pxPerDeg;
      if(x<-12||x>w+12)continue;

      const major=norm%45===0;
      const mid=norm%15===0;
      const tickH=major?16:mid?10:6;

      ctx.strokeStyle=major
        ?'rgba(255,255,255,.95)'
        :mid
          ?'rgba(255,255,255,.52)'
          :'rgba(255,255,255,.28)';
      ctx.lineWidth=major?2:1;
      ctx.beginPath();
      ctx.moveTo(x,12);
      ctx.lineTo(x,12+tickH);
      ctx.stroke();

      if(major){
        const txt=cardinal(norm);
        ctx.font='700 12px Inter,system-ui,sans-serif';
        ctx.textAlign='center';
        ctx.textBaseline='top';
        ctx.fillStyle=txt==='N'?'#ff6767':'#e4edf6';
        ctx.fillText(txt,x,31);
      }
    }

    // Thin fixed lubber line under the CSS red pointer.
    ctx.strokeStyle='rgba(255,255,255,.16)';
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(center,10);
    ctx.lineTo(center,h-8);
    ctx.stroke();

    if(headingEl){
      headingEl.textContent=`${cardinal(hd)} · ${String(Math.round(hd)%360).padStart(3,'0')}°`;
    }
  }

  return Object.freeze({draw});
}
