// Canonical World Drive world-surface material factory.
// Owns procedural road/water texture creation and static material configuration;
// gameplay/physics remains outside this module.

export const ROAD_SURFACE_OFFSET=.10;
export const TIRE_VISUAL_CLEARANCE=.018;
export const WHEEL_RADIUS=.38;
export const TIRE_HALF_WIDTH=.135;
export const ROAD_WHEEL_CONTACT_HALF_WIDTH=8.5;

export function createWorldMaterials({THREE,renderer,documentRef=globalThis.document}={}){
  if(!THREE)throw new Error('world materials require THREE');
  if(!renderer?.capabilities?.getMaxAnisotropy)throw new Error('world materials require renderer capabilities');
  if(!documentRef?.createElement)throw new Error('world materials require a document-like canvas factory');

  function makeRoadSurfaceTextures(kind='asphalt'){
    const size=512;
    const colorCanvas=documentRef.createElement('canvas');
    const bumpCanvas=documentRef.createElement('canvas');
    const roughCanvas=documentRef.createElement('canvas');
    colorCanvas.width=colorCanvas.height=size;
    bumpCanvas.width=bumpCanvas.height=size;
    roughCanvas.width=roughCanvas.height=size;

    const cctx=colorCanvas.getContext('2d');
    const bctx=bumpCanvas.getContext('2d');
    const rctx=roughCanvas.getContext('2d');
    const colorImage=cctx.createImageData(size,size);
    const bumpImage=bctx.createImageData(size,size);
    const roughImage=rctx.createImageData(size,size);

    // Deterministic procedural texture: stable between launches/rebuilds and
    // dense enough that the road no longer reads as one flat grey ribbon.
    let seed=kind==='asphalt'?0x21_21_27:0x51_0A_27;
    const rand=()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    };

    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){
        const i=(y*size+x)*4;
        const macro=
          Math.sin(x*.041)+
          Math.sin(y*.033)+
          Math.sin((x+y)*.017);
        const grain=(rand()-.5);

        if(kind==='asphalt'){
          const base=72+macro*2.2+grain*16;
          const tyreBand=
            Math.exp(-Math.pow((x/size-.24)/.055,2))+
            Math.exp(-Math.pow((x/size-.76)/.055,2));
          const polished=tyreBand*2.3;
          colorImage.data[i]=Math.max(0,Math.min(255,base-polished));
          colorImage.data[i+1]=Math.max(0,Math.min(255,base+1-polished));
          colorImage.data[i+2]=Math.max(0,Math.min(255,base+2-polished));
          const bump=128+grain*54+macro*5;
          const rough=232-grain*18-tyreBand*10;
          bumpImage.data[i]=bumpImage.data[i+1]=bumpImage.data[i+2]=Math.max(0,Math.min(255,bump));
          roughImage.data[i]=roughImage.data[i+1]=roughImage.data[i+2]=Math.max(0,Math.min(255,rough));
        }else{
          const base=126+macro*5+grain*30;
          colorImage.data[i]=Math.max(0,Math.min(255,base+8));
          colorImage.data[i+1]=Math.max(0,Math.min(255,base+5));
          colorImage.data[i+2]=Math.max(0,Math.min(255,base-4));
          const bump=128+grain*88+macro*8;
          const rough=246-grain*8;
          bumpImage.data[i]=bumpImage.data[i+1]=bumpImage.data[i+2]=Math.max(0,Math.min(255,bump));
          roughImage.data[i]=roughImage.data[i+1]=roughImage.data[i+2]=Math.max(0,Math.min(255,rough));
        }
        colorImage.data[i+3]=bumpImage.data[i+3]=roughImage.data[i+3]=255;
      }
    }

    cctx.putImageData(colorImage,0,0);
    bctx.putImageData(bumpImage,0,0);
    rctx.putImageData(roughImage,0,0);

    cctx.globalAlpha=kind==='asphalt'?.22:.34;
    for(let i=0;i<(kind==='asphalt'?1800:2600);i++){
      const x=rand()*size,y=rand()*size;
      const radius=kind==='asphalt'?.35+rand()*1.15:.55+rand()*1.75;
      const light=rand()>.52;
      cctx.fillStyle=kind==='asphalt'
        ?(light?'#74787a':'#36393b')
        :(light?'#b3aa93':'#6f6a5e');
      cctx.beginPath();cctx.arc(x,y,radius,0,Math.PI*2);cctx.fill();
    }
    cctx.globalAlpha=1;

    const makeTexture=(canvas,{srgb=false}={})=>{
      const texture=new THREE.CanvasTexture(canvas);
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.repeat.set(1,1);
      texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
      if(srgb)texture.colorSpace=THREE.SRGBColorSpace;
      return texture;
    };

    return {
      color:makeTexture(colorCanvas,{srgb:true}),
      bump:makeTexture(bumpCanvas),
      roughness:makeTexture(roughCanvas)
    };
  }

  const asphaltTextures=makeRoadSurfaceTextures('asphalt');
  const shoulderTextures=makeRoadSurfaceTextures('gravel');

  const roadMat=new THREE.MeshStandardMaterial({
    color:0xffffff,
    map:asphaltTextures.color,
    bumpMap:asphaltTextures.bump,
    bumpScale:.045,
    roughnessMap:asphaltTextures.roughness,
    roughness:.94,
    polygonOffset:true,
    polygonOffsetFactor:-2,
    polygonOffsetUnits:-2,
    stencilWrite:true,
    stencilRef:1,
    stencilFunc:THREE.AlwaysStencilFunc,
    stencilFail:THREE.KeepStencilOp,
    stencilZFail:THREE.KeepStencilOp,
    stencilZPass:THREE.ReplaceStencilOp
  });
  const shoulderMat=new THREE.MeshStandardMaterial({
    color:0xffffff,
    map:shoulderTextures.color,
    bumpMap:shoulderTextures.bump,
    bumpScale:.075,
    roughnessMap:shoulderTextures.roughness,
    roughness:1,
    polygonOffset:true,
    polygonOffsetFactor:-1,
    polygonOffsetUnits:-1,
    stencilWrite:true,
    stencilRef:1,
    stencilFunc:THREE.AlwaysStencilFunc,
    stencilFail:THREE.KeepStencilOp,
    stencilZFail:THREE.KeepStencilOp,
    stencilZPass:THREE.ReplaceStencilOp
  });
  const roadEdgeMat=new THREE.MeshStandardMaterial({
    color:0x4f4e49,
    roughness:1,
    metalness:0,
    stencilWrite:true,
    stencilRef:1,
    stencilFunc:THREE.AlwaysStencilFunc,
    stencilFail:THREE.KeepStencilOp,
    stencilZFail:THREE.KeepStencilOp,
    stencilZPass:THREE.ReplaceStencilOp
  });
  const roadUnderMat=new THREE.MeshStandardMaterial({
    color:0x292b2a,
    roughness:1,
    metalness:0,
    side:THREE.DoubleSide,
    stencilWrite:true,
    stencilRef:1,
    stencilFunc:THREE.AlwaysStencilFunc,
    stencilFail:THREE.KeepStencilOp,
    stencilZFail:THREE.KeepStencilOp,
    stencilZPass:THREE.ReplaceStencilOp
  });
  const lineYellow=new THREE.MeshStandardMaterial({
    color:0xe2c34a,
    roughness:.72,
    metalness:0,
    polygonOffset:true,
    polygonOffsetFactor:-3,
    polygonOffsetUnits:-3
  });
  const lineWhite=new THREE.MeshStandardMaterial({
    color:0xe3e3df,
    roughness:.72,
    metalness:0,
    polygonOffset:true,
    polygonOffsetFactor:-3,
    polygonOffsetUnits:-3
  });
  const treeTrunkMat=new THREE.MeshStandardMaterial({color:0x604532,roughness:1});
  const treeMat=new THREE.MeshStandardMaterial({color:0x315b35,roughness:1});

  function makeWaterTexture(){
    const c=documentRef.createElement('canvas');c.width=c.height=128;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#2a6f96';ctx.fillRect(0,0,128,128);
    ctx.strokeStyle='rgba(255,255,255,.08)';
    ctx.lineWidth=1;
    for(let y=6;y<128;y+=10){
      ctx.beginPath();
      for(let x=0;x<=128;x+=8){
        const yy=y+Math.sin((x+y)*.12)*1.6;
        if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
      }
      ctx.stroke();
    }
    const t=new THREE.CanvasTexture(c);
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(18,18);
    t.colorSpace=THREE.SRGBColorSpace;
    return t;
  }
  const waterTex=makeWaterTexture();
  const waterStencil={
    stencilWrite:true,
    stencilRef:1,
    stencilFunc:THREE.NotEqualStencilFunc,
    stencilFail:THREE.KeepStencilOp,
    stencilZFail:THREE.KeepStencilOp,
    stencilZPass:THREE.KeepStencilOp
  };
  const waterMat=new THREE.MeshStandardMaterial({
    color:0x2a6f96,map:waterTex,roughness:.16,metalness:.12,
    transparent:true,opacity:.90,side:THREE.DoubleSide,
    ...waterStencil
  });
  const riverMat=new THREE.MeshStandardMaterial({
    color:0x2f7da7,map:waterTex,roughness:.18,metalness:.10,
    transparent:true,opacity:.93,side:THREE.DoubleSide,
    ...waterStencil
  });
  const coastWaterMat=new THREE.MeshStandardMaterial({
    color:0x235f86,map:waterTex,roughness:.14,metalness:.16,
    transparent:true,opacity:.94,side:THREE.DoubleSide,
    ...waterStencil
  });

  return Object.freeze({
    roadMat,
    shoulderMat,
    roadEdgeMat,
    roadUnderMat,
    lineYellow,
    lineWhite,
    treeTrunkMat,
    treeMat,
    waterMat,
    riverMat,
    coastWaterMat
  });
}
