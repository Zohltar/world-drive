// Guaranteed multiplayer fallback/support visual.
// Used only when the legacy exact-procedural clone cannot be constructed.
// It keeps four stable wheel pivots for receiver-local support while the
// authored remote GLB loads asynchronously.

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
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

function wheel(THREE,{x,y,z,front,radius=.34,width=.24}){
  const tire=new THREE.Mesh(
    new THREE.CylinderGeometry(radius,radius,width,14),
    new THREE.MeshStandardMaterial({color:0x15191e,roughness:.9,metalness:.02})
  );
  tire.rotation.z=Math.PI/2;
  const pivot=new THREE.Group();
  pivot.position.set(x,y,z);
  pivot.add(tire);
  return {
    pivot,
    tire,
    rim:null,
    front:!!front,
    radius,
    baseX:x,
    baseZ:z
  };
}

export function createRemoteSupportFallback(THREE,vehicleId,name){
  const root=new THREE.Group();
  root.name=`remote-support-fallback-${vehicleId}-${name}`;
  root.rotation.order='YXZ';

  // Match the local vehicle architecture: yaw/world placement belongs to root,
  // while road-grade pitch/roll and sender suspension motion belong to a sprung
  // body group. The hidden support-wheel pivots stay directly under root so
  // terrain sampling is never distorted by body attitude.
  const bodyGroup=new THREE.Group();
  bodyGroup.name=`remote-support-body-${vehicleId}-${name}`;
  bodyGroup.rotation.order='XYZ';
  root.add(bodyGroup);

  const specs={
    id4:{color:0x3b6e91,w:1.82,l:4.58,h:.63,wheelbase:2.76,r:.36},
    wrx:{color:0x2766a5,w:1.80,l:4.48,h:.48,wheelbase:2.64,r:.35},
    civic:{color:0x101317,w:1.78,l:4.52,h:.47,wheelbase:2.70,r:.34},
    sonata:{color:0xe9edf0,w:1.86,l:4.80,h:.48,wheelbase:2.80,r:.35},
    i3_2017:{color:0xf0f1ee,w:1.78,l:4.00,h:.70,wheelbase:2.57,r:.35},
    f1_2010:{color:0xc51f27,w:1.78,l:4.75,h:.24,wheelbase:3.15,r:.32},
    countach_80:{color:0xd6d2c7,w:1.89,l:4.76,h:.34,wheelbase:2.45,r:.34}
  };
  const s=specs[vehicleId]||specs.wrx;

  const bodyMat=new THREE.MeshStandardMaterial({color:s.color,roughness:.5,metalness:.16});
  const glassMat=new THREE.MeshStandardMaterial({color:0x172b3b,roughness:.24,metalness:.12});
  const body=new THREE.Mesh(new THREE.BoxGeometry(s.w,s.h,s.l),bodyMat);
  body.position.y=.58+s.h*.25;
  body.castShadow=true;
  bodyGroup.add(body);

  if(vehicleId!=='f1_2010'){
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(s.w*.76,.48,Math.min(2.15,s.l*.48)),glassMat);
    cabin.position.set(0,1.02,-.12);
    bodyGroup.add(cabin);
  }

  const brakeBase=new THREE.Color(0x721018);
  const brakeHot=new THREE.Color(0xff2638);
  const brakeMat=new THREE.MeshBasicMaterial({color:brakeBase.clone()});
  const rearLampGeom=new THREE.BoxGeometry(.38,.12,.06);
  for(const x of [-s.w*.30,s.w*.30]){
    const lamp=new THREE.Mesh(rearLampGeom,brakeMat);
    lamp.position.set(x,.74,-s.l*.505);
    bodyGroup.add(lamp);
  }

  const halfWB=s.wheelbase*.5;
  const halfTrack=s.w*.44;
  const wheels=[
    wheel(THREE,{x:-halfTrack,y:s.r,z: halfWB,front:true,radius:s.r}),
    wheel(THREE,{x: halfTrack,y:s.r,z: halfWB,front:true,radius:s.r}),
    wheel(THREE,{x:-halfTrack,y:s.r,z:-halfWB,front:false,radius:s.r}),
    wheel(THREE,{x: halfTrack,y:s.r,z:-halfWB,front:false,radius:s.r})
  ];
  for(const entry of wheels)root.add(entry.pivot);

  // Keep the name tag upright in world/root space instead of pitching it with
  // the vehicle body on steep grades.
  const tagMaterial=new THREE.SpriteMaterial({
    map:labelTexture(THREE,name),transparent:true,depthTest:false,depthWrite:false
  });
  const tag=new THREE.Sprite(tagMaterial);
  tag.position.set(0,2.25,0);tag.scale.set(3.7,.92,1);tag.renderOrder=1000;
  root.add(tag);

  return {
    root,
    bodyGroup,
    wheels,
    brakeMat,
    brakeBase,
    brakeHot,
    setBraking(level){brakeMat.color.copy(brakeBase).lerp(brakeHot,level);},
    setHeadlights(){},
    dispose(){
      root.traverse(obj=>{
        obj.geometry?.dispose?.();
        const mats=Array.isArray(obj.material)?obj.material:[obj.material];
        for(const mat of mats){
          if(!mat)continue;
          mat.map?.dispose?.();
          mat.dispose?.();
        }
      });
      root.clear();
    }
  };
}
