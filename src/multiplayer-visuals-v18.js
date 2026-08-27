import {createRemoteSupportFallback} from './multiplayer-fallback-visual.js';
import {solveRemoteSupportPlane} from './multiplayer-support-math.js';

// Multiplayer M3 support layer.
// Visible authored GLBs are owned by multiplayer-visuals-m3.js. This module owns
// only the registry-derived support chassis and a pure multi-axle terrain solve.

export function createMultiplayerVisualSystem({
  THREE,
  llToXZ,
  groundHeightForWheel,
  TIRE_HALF_WIDTH=.135,
  TIRE_VISUAL_CLEARANCE=.018
}={}){
  function createRemoteVehicleVisual(vehicleId,name){
    return createRemoteSupportFallback(THREE,vehicleId,name);
  }

  function solveRemoteVehicleSupport({lat,lon,heading:remoteHeading,visual}={}){
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!visual?.wheels?.length)return null;
    const center=llToXZ(lat,lon);
    const contacts=visual.wheels.map(wheel=>({
      x:Number.isFinite(wheel.baseX)?wheel.baseX:wheel.pivot.position.x,
      z:Number.isFinite(wheel.baseZ)?wheel.baseZ:wheel.pivot.position.z,
      front:!!wheel.front,
      radius:Math.max(.1,Number(wheel.radius)||.34),
      width:Number(wheel.tire?.geometry?.parameters?.height)||Math.max(.12,(Number(wheel.radius)||.34)*.72),
      axleId:wheel.axleId||null
    }));
    return solveRemoteSupportPlane({
      centerX:center.x,
      centerZ:center.z,
      heading:remoteHeading,
      contacts,
      groundHeight:groundHeightForWheel,
      tireHalfWidth:TIRE_HALF_WIDTH,
      clearance:TIRE_VISUAL_CLEARANCE
    });
  }

  return {createRemoteVehicleVisual,solveRemoteVehicleSupport};
}
