// World Drive multiplayer M2.4 — per-peer presentation lighting.
//
// The remote GLB cache intentionally stays independent from the large local GLB
// controllers. This tiny rig overlays the four networked lighting families on
// the remote vehicle presentation: night/running lights, brake lights, reverse
// lights and left/right turn signals. The rig is per peer, so no cached/shared
// GLB material is mutated when two drivers use the same vehicle.

const PROFILES=Object.freeze({
  id4:Object.freeze({w:1.82,l:4.58,rearY:.78,frontY:.93,tailX:.63,reverseX:.32,signalX:.74}),
  wrx:Object.freeze({w:1.80,l:5.52,rearY:.72,frontY:.86,tailX:.59,reverseX:.31,signalX:.72}),
  civic:Object.freeze({w:1.78,l:4.55,rearY:.73,frontY:.88,tailX:.58,reverseX:.29,signalX:.71}),
  sonata:Object.freeze({w:1.86,l:4.85,rearY:.75,frontY:.91,tailX:.63,reverseX:.31,signalX:.76}),
  i3_2017:Object.freeze({w:1.78,l:4.81,rearY:.82,frontY:.97,tailX:.58,reverseX:.27,signalX:.70}),
  countach_80:Object.freeze({w:2.39,l:4.76,rearY:.53,frontY:.58,tailX:.68,reverseX:.34,signalX:.84}),
  f1_2010:Object.freeze({w:1.78,l:5.00,rearY:.43,frontY:.38,tailX:.18,reverseX:.25,signalX:.68})
});

function clamp01(value){return Math.max(0,Math.min(1,Number(value)||0));}

function makeGlow(THREE,{color,size=[.28,.11],position=[0,0,0],rotationY=0,name='remote-lamp'}){
  const material=new THREE.MeshBasicMaterial({
    color,
    transparent:true,
    opacity:0,
    depthWrite:false,
    depthTest:true,
    toneMapped:false,
    blending:THREE.AdditiveBlending,
    side:THREE.DoubleSide
  });
  const geometry=new THREE.PlaneGeometry(size[0],size[1]);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;
  mesh.position.set(...position);
  mesh.rotation.y=rotationY;
  mesh.renderOrder=12;
  mesh.visible=false;
  return {mesh,material,geometry};
}

function setGlow(entry,opacity){
  const value=clamp01(opacity);
  entry.material.opacity=value;
  entry.mesh.visible=value>.006;
}

export function createRemoteLightingRig(THREE,vehicleId,parent){
  if(!THREE||!parent)return null;
  const p=PROFILES[vehicleId]||PROFILES.wrx;
  const rig=new THREE.Group();
  rig.name=`remote-network-lighting-${vehicleId}`;
  parent.add(rig);

  const rearZ=-p.l*.505;
  const frontZ=p.l*.505;
  const entries=[];
  const tail=[];
  const reverse=[];
  const leftSignal=[];
  const rightSignal=[];
  const headlights=[];

  const add=(target,spec)=>{
    const entry=makeGlow(THREE,spec);
    entries.push(entry);
    target.push(entry);
    rig.add(entry.mesh);
    return entry;
  };

  // Rear running/brake lamps. A slightly wider glow makes the state legible at
  // convoy distance without replacing the authored lamp geometry underneath.
  for(const side of [-1,1]){
    add(tail,{
      color:0xff2638,
      size:[vehicleId==='id4'?.48:.34,.13],
      position:[side*p.tailX,p.rearY,rearZ-.014],
      rotationY:Math.PI,
      name:`remote-tail-${side<0?'l':'r'}`
    });
    add(reverse,{
      color:0xffffff,
      size:[.22,.095],
      position:[side*p.reverseX,p.rearY-.08,rearZ-.022],
      rotationY:Math.PI,
      name:`remote-reverse-${side<0?'l':'r'}`
    });
    const signalTarget=side<0?leftSignal:rightSignal;
    add(signalTarget,{
      color:0xffb21c,
      size:[.24,.105],
      position:[side*p.signalX,p.rearY-.015,rearZ-.032],
      rotationY:Math.PI,
      name:`remote-signal-rear-${side<0?'l':'r'}`
    });
    add(signalTarget,{
      color:0xffb21c,
      size:[.22,.10],
      position:[side*p.signalX,p.frontY-.03,frontZ+.032],
      name:`remote-signal-front-${side<0?'l':'r'}`
    });
    add(headlights,{
      color:0xf8fbff,
      size:[.30,.115],
      position:[side*Math.min(p.tailX,p.w*.34),p.frontY,frontZ+.018],
      name:`remote-headlight-${side<0?'l':'r'}`
    });
  }

  let disposed=false;
  let updates=0;
  let lastState={
    braking:false,
    reversing:false,
    nightLevel:0,
    signalLeft:false,
    signalRight:false,
    signalBlink:false,
    distance:0
  };

  function setState(state={}){
    if(disposed)return;
    lastState={...lastState,...state};
    const night=clamp01(lastState.nightLevel);
    const distance=Math.max(0,Number(lastState.distance)||0);
    const fade=1-clamp01((distance-1500)/1500);
    const running=(night>.035?(.15+night*.22):0)*fade;
    const braking=(lastState.braking ? .95 : 0)*fade;
    const reverseLevel=(lastState.reversing ? .95 : 0)*fade;
    const blink=!!lastState.signalBlink;
    const left=(lastState.signalLeft&&blink ? .94 : 0)*fade;
    const right=(lastState.signalRight&&blink ? .94 : 0)*fade;
    const head=(night>.035?(.24+night*.58):0)*fade;

    for(const entry of tail)setGlow(entry,Math.max(running,braking));
    for(const entry of reverse)setGlow(entry,reverseLevel);
    for(const entry of leftSignal)setGlow(entry,left);
    for(const entry of rightSignal)setGlow(entry,right);
    for(const entry of headlights)setGlow(entry,head);
    updates++;
  }

  function dispose(){
    if(disposed)return;
    disposed=true;
    rig.removeFromParent?.();
    for(const entry of entries){
      entry.geometry.dispose?.();
      entry.material.dispose?.();
    }
    rig.clear?.();
  }

  return {
    rig,
    setState,
    dispose,
    get updates(){return updates;},
    get state(){return {...lastState};}
  };
}
