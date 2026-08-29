import {tireRoadFractionFromLateral} from './physics/surface-transition.js';

export function createWheelGroundSupport({
  roadSurfaceAt,
  terrainAbs,
  roadHalfWidth,
}){
  const groundHeightRoadScratch={};
  const roadSampleCache={x:NaN,z:NaN,valid:false,y:0,lateral:Infinity};
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

  function sampleRoadSurface(absx,absz){
    if(absx===roadSampleCache.x&&absz===roadSampleCache.z){
      return roadSampleCache.valid?roadSampleCache:null;
    }
    const rs=roadSurfaceAt(absx,absz,groundHeightRoadScratch);
    roadSampleCache.x=absx;roadSampleCache.z=absz;
    roadSampleCache.valid=!!rs;
    roadSampleCache.y=Number(rs?.y)||0;
    roadSampleCache.lateral=Number.isFinite(Number(rs?.lateral))?Number(rs.lateral):Infinity;
    return roadSampleCache.valid?roadSampleCache:null;
  }

  function roadFractionForWheel(absx,absz,tireWidth=.25){
    if(fastWheelRoadSupport.active){
      const dx=absx-fastWheelRoadSupport.centerX;
      const dz=absz-fastWheelRoadSupport.centerZ;
      const along=dx*fastWheelRoadSupport.sinAngle+dz*fastWheelRoadSupport.cosAngle;
      const lateral=-dx*fastWheelRoadSupport.cosAngle+dz*fastWheelRoadSupport.sinAngle;
      if(Math.abs(along)<8.5){
        return tireRoadFractionFromLateral({roadLateral:lateral,roadHalfWidth:fastWheelRoadSupport.halfWidth,tireWidth});
      }
    }
    const rs=sampleRoadSurface(absx,absz);
    return rs
      ?tireRoadFractionFromLateral({roadLateral:rs.lateral,roadHalfWidth,tireWidth})
      :0;
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

    const rs=sampleRoadSurface(absx,absz);
    if(rs&&Math.abs(rs.lateral)<roadHalfWidth)return rs.y;
    return terrainAbs(absx,absz);
  }

  return {
    setFastWheelRoadSupport,
    groundHeightForWheel,
    roadFractionForWheel,
    support:fastWheelRoadSupport
  };
}
