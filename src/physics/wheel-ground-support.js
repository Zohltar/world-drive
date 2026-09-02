export function createWheelGroundSupport({
  roadSurfaceAt,
  terrainAbs,
  roadHalfWidth,
}){
  const groundHeightRoadScratch={};
  const supportOuterHalfWidth=Math.max(4,Number(roadHalfWidth)||8.5);
  // Grip R14 — the visible road/shoulder earthwork is much narrower than the
  // old 8.5 m wheel-support corridor. Keep a solid road core, then blend toward
  // terrain before the legacy outer threshold so crossing roadContact cannot
  // create a one-frame vertical step.
  const supportCoreHalfWidth=Math.min(
    5.4,
    Math.max(3.75,supportOuterHalfWidth-2.8)
  );
  let inferredRoadSurfaceOffset=.10;

  const fastWheelRoadSupport={
    active:false,
    centerX:0,
    centerZ:0,
    centerY:0,
    sinAngle:0,
    cosAngle:1,
    tanPitch:0,
    tanRoll:0,
    halfWidth:supportOuterHalfWidth,
    coreHalfWidth:supportCoreHalfWidth
  };

  function smoothstep01(value){
    const t=Math.max(0,Math.min(1,Number(value)||0));
    return t*t*(3-2*t);
  }

  function finiteHeight(value,fallback){
    return Number.isFinite(value)?value:fallback;
  }

  function terrainHeight(absx,absz){
    const value=terrainAbs(absx,absz);
    return Number.isFinite(value)?value:0;
  }

  function blendRoadToTerrain(roadY,terrainY,lateral){
    const d=Math.abs(Number(lateral)||0);
    if(d<=supportCoreHalfWidth)return roadY;
    if(d>=supportOuterHalfWidth)return terrainY;
    const t=smoothstep01(
      (d-supportCoreHalfWidth)/
      Math.max(.001,supportOuterHalfWidth-supportCoreHalfWidth)
    );
    return roadY+(terrainY-roadY)*t;
  }

  function setFastWheelRoadSupport(active,roadFrame,centerY,centerX,centerZ){
    if(!active||!roadFrame||!Number.isFinite(centerY)){
      fastWheelRoadSupport.active=false;
      return;
    }

    const angle=Number(roadFrame.angle)||0;
    const sinAngle=Math.sin(angle);
    const cosAngle=Math.cos(angle);
    const tanPitch=Math.tan(Number(roadFrame.pitch)||0);
    const tanRoll=Math.tan(Number(roadFrame.roll)||0);
    const frameCenterX=Number(roadFrame.px);
    const frameCenterZ=Number(roadFrame.pz);
    const frameCenterY=Number(roadFrame.y);

    // The old fast plane was centred on the CAR. When roadContact became true,
    // every wheel was therefore treated as if it were near the road centre and
    // could snap from terrain height to road height at once. Anchor the plane to
    // the actual projected road centre instead. Infer the asphalt surface offset
    // from the caller's already-correct centre sample so fallback and fast paths
    // remain vertically identical.
    if(
      Number.isFinite(frameCenterX)&&
      Number.isFinite(frameCenterZ)&&
      Number.isFinite(frameCenterY)&&
      Number.isFinite(centerX)&&
      Number.isFinite(centerZ)
    ){
      const dx=centerX-frameCenterX;
      const dz=centerZ-frameCenterZ;
      const along=dx*sinAngle+dz*cosAngle;
      const lateral=-dx*cosAngle+dz*sinAngle;
      const frameAtVehicle=
        frameCenterY+
        tanPitch*along+
        tanRoll*lateral;
      const inferred=centerY-frameAtVehicle;
      if(Number.isFinite(inferred)){
        inferredRoadSurfaceOffset=Math.max(-.5,Math.min(.5,inferred));
      }
      fastWheelRoadSupport.centerX=frameCenterX;
      fastWheelRoadSupport.centerZ=frameCenterZ;
      fastWheelRoadSupport.centerY=frameCenterY+inferredRoadSurfaceOffset;
    }else{
      fastWheelRoadSupport.centerX=centerX;
      fastWheelRoadSupport.centerZ=centerZ;
      fastWheelRoadSupport.centerY=centerY;
    }

    fastWheelRoadSupport.active=true;
    fastWheelRoadSupport.sinAngle=sinAngle;
    fastWheelRoadSupport.cosAngle=cosAngle;
    fastWheelRoadSupport.tanPitch=tanPitch;
    fastWheelRoadSupport.tanRoll=tanRoll;
  }

  function fastRoadSample(absx,absz){
    if(!fastWheelRoadSupport.active)return null;
    const dx=absx-fastWheelRoadSupport.centerX;
    const dz=absz-fastWheelRoadSupport.centerZ;
    const along=dx*fastWheelRoadSupport.sinAngle+dz*fastWheelRoadSupport.cosAngle;
    const lateral=-dx*fastWheelRoadSupport.cosAngle+dz*fastWheelRoadSupport.sinAngle;
    if(
      Math.abs(lateral)>=supportOuterHalfWidth||
      Math.abs(along)>=8.5
    )return null;
    return {
      lateral,
      y:fastWheelRoadSupport.centerY+
        fastWheelRoadSupport.tanPitch*along+
        fastWheelRoadSupport.tanRoll*lateral
    };
  }

  function fallbackRoadSample(absx,absz){
    const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);
    if(!rs||Math.abs(Number(rs.lateral)||0)>=supportOuterHalfWidth)return null;
    return {
      lateral:Number(rs.lateral)||0,
      y:finiteHeight(Number(rs.y)+inferredRoadSurfaceOffset,Number(rs.y)||0)
    };
  }

  function groundHeightForWheel(absx,absz,preferLocalRoadPlane=false){
    const terrainY=terrainHeight(absx,absz);
    const roadSample=
      preferLocalRoadPlane
        ?fastRoadSample(absx,absz)||fallbackRoadSample(absx,absz)
        :fallbackRoadSample(absx,absz);
    if(!roadSample)return terrainY;
    return blendRoadToTerrain(roadSample.y,terrainY,roadSample.lateral);
  }

  return {
    setFastWheelRoadSupport,
    groundHeightForWheel,
    support:fastWheelRoadSupport
  };
}
