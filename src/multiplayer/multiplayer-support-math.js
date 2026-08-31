// Pure multiplayer support-plane solver. No DOM / Three.js dependency.

const avg=(list,key)=>list.reduce((sum,item)=>sum+Number(item[key]||0),0)/Math.max(1,list.length);

export function solveRemoteSupportPlane({
  centerX=0,
  centerZ=0,
  heading=0,
  contacts=[],
  groundHeight=()=>0,
  tireHalfWidth=.135,
  clearance=.018
}={}){
  if(!Array.isArray(contacts)||contacts.length<4)return null;
  const c=Math.cos(Number(heading)||0),s=Math.sin(Number(heading)||0);
  const sampled=contacts.map((contact,index)=>{
    const lx=Number(contact.x)||0,lz=Number(contact.z)||0;
    const absX=(Number(centerX)||0)+lx*c+lz*s;
    const absZ=(Number(centerZ)||0)-lx*s+lz*c;
    const ground=Number(groundHeight(absX,absZ));
    return {
      index,
      lx,lz,absX,absZ,
      ground:Number.isFinite(ground)?ground:0,
      front:!!contact.front,
      radius:Math.max(.1,Number(contact.radius)||.34),
      width:Math.max(.08,Number(contact.width)||Number(contact.radius)*.72||.24),
      axleId:contact.axleId||null
    };
  });
  const left=sampled.filter(item=>item.lx<0),right=sampled.filter(item=>item.lx>=0);
  if(!left.length||!right.length)return null;
  const zValues=sampled.map(item=>item.lz),maxZ=Math.max(...zValues),minZ=Math.min(...zValues),spanZ=Math.max(.5,maxZ-minZ),tol=Math.max(.12,spanZ*.08);
  const front=sampled.filter(item=>item.lz>=maxZ-tol),rear=sampled.filter(item=>item.lz<=minZ+tol);
  if(!front.length||!rear.length)return null;
  const frontAvg=avg(front,'ground'),rearAvg=avg(rear,'ground'),leftAvg=avg(left,'ground'),rightAvg=avg(right,'ground'),avgGround=avg(sampled,'ground');
  const wheelbase=Math.max(.5,Math.abs(avg(front,'lz')-avg(rear,'lz'))),track=Math.max(.5,Math.abs(avg(right,'lx')-avg(left,'lx')));
  const wheelPitch=Math.atan2(rearAvg-frontAvg,wheelbase),wheelRoll=Math.atan2(leftAvg-rightAvg,track);
  const meanRadius=sampled.reduce((sum,item)=>sum+item.radius,0)/sampled.length;
  const effectiveRadius=meanRadius*Math.cos(Math.abs(wheelRoll))+Math.max(.06,Number(tireHalfWidth)||.135)*Math.sin(Math.abs(wheelRoll));
  const rootY=avgGround+effectiveRadius+(Number(clearance)||0);
  return {
    rootY,
    wheelPitch,
    wheelRoll,
    supportAxles:new Set(sampled.map(item=>item.axleId).filter(Boolean)).size,
    wheelLocalY:sampled.map(item=>item.ground+effectiveRadius+(Number(clearance)||0)-rootY),
    wheelContacts:sampled.map(item=>({absX:item.absX,absZ:item.absZ,ground:item.ground,front:item.front,width:item.width,axleId:item.axleId}))
  };
}
