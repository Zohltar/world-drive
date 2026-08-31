// Canonical World Drive sky-light construction.
// Owns static light/sprite creation and moon positioning only;
// time-of-day policy remains in environment-controller.js.
export function createSkyLighting({THREE,scene,camera,documentRef=document}){
  const hemi=new THREE.HemisphereLight(0xd6ecff,0x4e6345,2.15);
  scene.add(hemi);

  const sun=new THREE.DirectionalLight(0xfff2d2,2.6);
  sun.position.set(-180,260,-120);
  sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left=-300;
  sun.shadow.camera.right=300;
  sun.shadow.camera.top=300;
  sun.shadow.camera.bottom=-300;
  scene.add(sun);

  // V18G crescent moon + subtle moonlight. The moon intentionally remains
  // much weaker than the sun so headlights stay dominant at night.
  const moonLight=new THREE.DirectionalLight(0xb9d7ff,0);
  moonLight.castShadow=false;
  scene.add(moonLight);

  function createCrescentMoonTexture(){
    const canvas=documentRef.createElement('canvas');
    canvas.width=256;
    canvas.height=256;

    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,256,256);

    const halo=ctx.createRadialGradient(128,128,42,128,128,116);
    halo.addColorStop(0,'rgba(218,232,255,.25)');
    halo.addColorStop(.55,'rgba(190,215,255,.09)');
    halo.addColorStop(1,'rgba(170,205,255,0)');

    ctx.fillStyle=halo;
    ctx.beginPath();
    ctx.arc(128,128,116,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle='rgba(236,244,255,.98)';
    ctx.beginPath();
    ctx.arc(128,128,67,0,Math.PI*2);
    ctx.fill();

    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath();
    ctx.arc(158,111,67,0,Math.PI*2);
    ctx.fill();
    ctx.globalCompositeOperation='source-over';

    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.needsUpdate=true;
    return texture;
  }

  const moonTexture=createCrescentMoonTexture();
  const moonMaterial=new THREE.SpriteMaterial({
    map:moonTexture,
    color:0xe8f2ff,
    transparent:true,
    opacity:0,
    depthWrite:false,
    depthTest:false,
    fog:false
  });
  const moonSprite=new THREE.Sprite(moonMaterial);
  moonSprite.scale.set(115,115,1);
  moonSprite.renderOrder=-5;
  moonSprite.visible=false;
  scene.add(moonSprite);

  const moonDirection=new THREE.Vector3(.35,.72,-.60).normalize();

  function updateMoonSkyPosition(){
    // Keep the moon effectively at infinity while preserving a stable world
    // direction as the local rendering origin follows the car.
    moonSprite.position
      .copy(camera.position)
      .addScaledVector(moonDirection,3100);

    moonLight.position
      .copy(camera.position)
      .addScaledVector(moonDirection,850);
  }

  return {
    hemi,
    sun,
    moonLight,
    moonMaterial,
    moonSprite,
    moonDirection,
    updateMoonSkyPosition
  };
}
