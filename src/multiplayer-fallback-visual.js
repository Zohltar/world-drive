import {getMultiplayerVehicleSpec} from './multiplayer-vehicle-registry.js';

// M3 guaranteed multiplayer support visual.
// Metrics and axle probes come from the authoritative vehicle registry rather
// than a second hand-maintained four-wheel table.

function labelTexture(THREE,text){
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font='700 52px system-ui, sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  const safe=String(text||'Conducteur').slice(0,24);
  const width=Math.min(480,Math.max(170,ctx.measureText(safe).width+58));
  const x=(canvas.width-width)/2;
  ctx.fillStyle='rgba(5,13,22,.84)';ctx.strokeStyle='rgba(228,241,255,.78)';ctx.lineWidth=4;
  ctx.beginPath();ctx.roundRect(x,20,width,88,22);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f6fbff';ctx.fillText(safe,canvas.width/2,64);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  return texture;
}

function makeSupportWheel(THREE,{x,z,front,radius=.34,axleId=''}){
  const width=Math.max(.18,Math.min(.34,radius*.72));
  const tire=new THREE.Mesh(
    new THREE.CylinderGeometry(radius,radius,width,14),
    new THREE.MeshStandardMaterial({color:0x15191e,roughness:.9,metalness:.02})
  );
  tire.rotation.z=Math.PI/2;
  const pivot=new THREE.Group();
  pivot.name=`remote-support-${axleId}-${x<0?'left':'right'}`;
  pivot.position.set(x,radius,z);
  pivot.add(tire);
  return {pivot,tire,rim:null,front:!!front,radius,baseX:x,baseZ:z,axleId};
}

export function createRemoteSupportFallback(THREE,vehicleId,name){
  const spec=getMultiplayerVehicleSpec(vehicleId);
  const root=new THREE.Group();
  root.name=`remote-support-fallback-${vehicleId}-${name}`;
  root.rotation.order='YXZ';

  const bodyGroup=new THREE.Group();
  bodyGroup.name=`remote-support-body-${vehicleId}-${name}`;
  bodyGroup.rotation.order='XYZ';
  root.add(bodyGroup);

  const w=spec.physics.bodyWidth;
  const l=spec.physics.bodyLength;
  const h=spec.visual.bodyHeight;
  const r=spec.visual.wheelRadius;
  const bodyMat=new THREE.MeshStandardMaterial({color:spec.visual.color,roughness:.5,metalness:.16});
  const glassMat=new THREE.MeshStandardMaterial({color:0x172b3b,roughness:.24,metalness:.12});

  const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,l),bodyMat);
  body.position.y=r+h*.58;
  body.castShadow=true;
  bodyGroup.add(body);

  if(vehicleId!=='f1_2010'){
    const cabinLength=spec.vehicleClass==='tractor'?Math.min(3.6,l*.44):Math.min(2.15,l*.48);
    const cabinHeight=spec.vehicleClass==='tractor'?Math.max(1.55,h*.62):Math.max(.42,h*.78);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(w*.78,cabinHeight,cabinLength),glassMat);
    cabin.position.set(0,r+h+cabinHeight*.28,spec.vehicleClass==='tractor'?l*.12:-.12);
    bodyGroup.add(cabin);
  }

  const brakeBase=new THREE.Color(0x721018);
  const brakeHot=new THREE.Color(0xff2638);
  const brakeMat=new THREE.MeshBasicMaterial({color:brakeBase.clone()});
  const rearLampGeom=new THREE.BoxGeometry(Math.min(.42,w*.22),Math.max(.10,h*.12),.06);
  for(const x of [-w*.30,w*.30]){
    const lamp=new THREE.Mesh(rearLampGeom,brakeMat);
    lamp.position.set(x,r+h*.62,-l*.505);
    bodyGroup.add(lamp);
  }

  const wheels=spec.visual.supportContacts.map(contact=>
    makeSupportWheel(THREE,{
      x:contact.x,
      z:contact.z,
      front:contact.front,
      radius:contact.radius,
      axleId:contact.axleId
    })
  );
  for(const entry of wheels)root.add(entry.pivot);

  const tagMaterial=new THREE.SpriteMaterial({
    map:labelTexture(THREE,name),transparent:true,depthTest:false,depthWrite:false
  });
  const tag=new THREE.Sprite(tagMaterial);
  tag.position.set(0,Math.max(2.25,r+h+1.1),0);tag.scale.set(3.7,.92,1);tag.renderOrder=1000;
  root.add(tag);

  return {
    root,
    bodyGroup,
    wheels,
    vehicleSpec:spec,
    brakeMat,
    brakeBase,
    brakeHot,
    setBraking(level){brakeMat.color.copy(brakeBase).lerp(brakeHot,Math.max(0,Math.min(1,Number(level)||0)));},
    setHeadlights(){},
    dispose(){
      root.traverse(obj=>{
        obj.geometry?.dispose?.();
        const mats=Array.isArray(obj.material)?obj.material:[obj.material];
        for(const mat of mats){if(!mat)continue;mat.map?.dispose?.();mat.dispose?.();}
      });
      root.clear();
    }
  };
}
