import {createRemoteSupportFallback} from './multiplayer-fallback-visual.js';

// Multiplayer M3 support layer.
// Visible authored GLBs are owned by multiplayer-visuals.js. This layer owns
// only a deterministic receiver-local support chassis, generated from the same
// normalized vehicle metrics as gameplay. It supports arbitrary axle counts.

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
    const c=Math.cos(remoteHeading||0);
    const sn=Math.sin(remoteHeading||0);
    const contacts=[];

    for(const wheel of visual.wheels){
      const lx=Number.isFinite(wheel.baseX)?wheel.baseX:wheel.pivot.position.x;
      const lz=Number.isFinite(wheel.baseZ)?wheel.baseZ:wheel.pivot.position.z;
      const wx=center.x+lx*c+lz*sn;
      const wz=center.z-lx*sn+lz*c;
      const ground=groundHeightForWheel(wx,wz);
      const radius=Math.max(.1,Number(wheel.radius)||.34);
      const tireWidth=(Number(wheel.tire?.geometry?.parameters?.height)||radius*.72);
      contacts.push({wheel,ground,lx,lz,absX:wx,absZ:wz,front:!!wheel.front,radius,width:tireWidth});
    }

    // A support plane needs at least two longitudinal stations and both sides.
    if(contacts.length<4)return null;

    const left=contacts.filter(item=>item.lx<0);
    const right=contacts.filter(item=>item.lx>=0);
    if(!left.length||!right.length)return null;

    // Use the foremost and rearmost axle stations rather than assuming exactly
    // two axles. Passenger cars reduce to their normal front/rear pair, while a
    // 6x4 tractor naturally uses steer axle -> rear tandem envelope.
    const zValues=contacts.map(item=>item.lz);
    const maxZ=Math.max(...zValues);
    const minZ=Math.min(...zValues);
    const spanZ=Math.max(.5,maxZ-minZ);
    const stationTolerance=Math.max(.12,spanZ*.08);
    const front=contacts.filter(item=>item.lz>=maxZ-stationTolerance);
    const rear=contacts.filter(item=>item.lz<=minZ+stationTolerance);

    const avg=list=>list.reduce((sum,item)=>sum+item.ground,0)/Math.max(1,list.length);
    const avgCoord=(list,key)=>list.reduce((sum,item)=>sum+item[key],0)/Math.max(1,list.length);
    const frontAvg=avg(front),rearAvg=avg(rear),leftAvg=avg(left),rightAvg=avg(right),avgGround=avg(contacts);
    const frontZ=avgCoord(front,'lz'),rearZ=avgCoord(rear,'lz');
    const leftX=avgCoord(left,'lx'),rightX=avgCoord(right,'lx');
    const wheelbase=Math.max(.5,Math.abs(frontZ-rearZ));
    const track=Math.max(.5,Math.abs(rightX-leftX));

    const wheelPitch=Math.atan2(rearAvg-frontAvg,wheelbase);
    const wheelRoll=Math.atan2(leftAvg-rightAvg,track);
    const camberAbs=Math.abs(wheelRoll);
    const averageRadius=contacts.reduce((sum,item)=>sum+item.radius,0)/contacts.length;
    const effectiveWheelRadius=
      averageRadius*Math.cos(camberAbs)+
      Math.max(.06,Number(TIRE_HALF_WIDTH)||.135)*Math.sin(camberAbs);
    const rootY=avgGround+effectiveWheelRadius+(Number(TIRE_VISUAL_CLEARANCE)||.018);

    return {
      rootY,
      wheelPitch,
      wheelRoll,
      supportAxles:new Set(contacts.map(item=>item.wheel.axleId).filter(Boolean)).size,
      wheelLocalY:contacts.map(item=>
        item.ground+effectiveWheelRadius+(Number(TIRE_VISUAL_CLEARANCE)||.018)-rootY
      ),
      wheelContacts:contacts.map(item=>({
        absX:item.absX,
        absZ:item.absZ,
        ground:item.ground,
        front:item.front,
        width:item.width,
        axleId:item.wheel.axleId||null
      }))
    };
  }

  return {createRemoteVehicleVisual,solveRemoteVehicleSupport};
}
