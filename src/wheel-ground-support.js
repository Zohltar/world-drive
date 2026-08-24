export function createWheelGroundSupport({
  roadSurfaceAt,
  terrainAbs,
  roadHalfWidth,
}){
  const groundHeightRoadScratch={};
  const fastWheelRoadSupport={
    active:false,
    centerX:0,
    centerZ:0,
    centerY:0,
    sinAngle:0,
    cosAngle:1,
    tanPitch:0,
    tanRoll:0,
    halfWidth:roadHalfWidth
  };

  function setFastWheelRoadSupport(active,roadFrame,centerY,centerX,centerZ){
    if(!active||!roadFrame||!Number.isFinite(centerY)){
      fastWheelRoadSupport.active=false;
      return;
    }

    fastWheelRoadSupport.active=true;
    fastWheelRoadSupport.centerX=centerX;
    fastWheelRoadSupport.centerZ=centerZ;
    fastWheelRoadSupport.centerY=centerY;
    fastWheelRoadSupport.sinAngle=Math.sin(roadFrame.angle||0);
    fastWheelRoadSupport.cosAngle=Math.cos(roadFrame.angle||0);
    fastWheelRoadSupport.tanPitch=Math.tan(roadFrame.pitch||0);
    fastWheelRoadSupport.tanRoll=Math.tan(roadFrame.roll||0);
  }

  function groundHeightForWheel(absx,absz,preferLocalRoadPlane=false){
    if(preferLocalRoadPlane&&fastWheelRoadSupport.active){
      const dx=absx-fastWheelRoadSupport.centerX;
      const dz=absz-fastWheelRoadSupport.centerZ;
      const along=dx*fastWheelRoadSupport.sinAngle+dz*fastWheelRoadSupport.cosAngle;
      const lateral=-dx*fastWheelRoadSupport.cosAngle+dz*fastWheelRoadSupport.sinAngle;

      if(
        Math.abs(lateral)<fastWheelRoadSupport.halfWidth&&
        Math.abs(along)<8.5
      ){
        return fastWheelRoadSupport.centerY+
          fastWheelRoadSupport.tanPitch*along+
          fastWheelRoadSupport.tanRoll*lateral;
      }
    }

    const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);
    if(rs&&Math.abs(rs.lateral)<roadHalfWidth)return rs.y;
    return terrainAbs(absx,absz);
  }

  return {
    setFastWheelRoadSupport,
    groundHeightForWheel,
    support:fastWheelRoadSupport
  };
}
