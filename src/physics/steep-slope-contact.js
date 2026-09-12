function clamp(value,min,max){
  return Math.max(min,Math.min(max,Number(value)||0));
}

function finiteNumber(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function fitGroundPlane(contacts){
  const points=[];
  for(const contact of contacts||[]){
    const x=finiteNumber(contact?.localX);
    const z=finiteNumber(contact?.localZ);
    const y=finiteNumber(contact?.ground);
    if(x===null||z===null||y===null)continue;
    points.push({contact,x,z,y});
  }
  if(points.length<4)return null;

  let meanX=0,meanZ=0,meanY=0;
  for(const point of points){meanX+=point.x;meanZ+=point.z;meanY+=point.y;}
  meanX/=points.length;meanZ/=points.length;meanY/=points.length;

  let xx=0,zz=0,xz=0,xy=0,zy=0;
  for(const point of points){
    const x=point.x-meanX;
    const z=point.z-meanZ;
    const y=point.y-meanY;
    xx+=x*x;zz+=z*z;xz+=x*z;xy+=x*y;zy+=z*y;
  }
  const det=xx*zz-xz*xz;
  if(Math.abs(det)<1e-8)return null;

  const slopeX=(xy*zz-zy*xz)/det;
  const slopeZ=(zy*xx-xy*xz)/det;
  const intercept=meanY-slopeX*meanX-slopeZ*meanZ;
  let maxResidual=0;
  for(const point of points){
    point.residual=point.y-(intercept+slopeX*point.x+slopeZ*point.z);
    maxResidual=Math.max(maxResidual,Math.abs(point.residual));
  }
  return {
    points,
    slopeX,
    slopeZ,
    gradeMagnitude:Math.hypot(slopeX,slopeZ),
    maxResidual
  };
}

// Issue #10 — the presentation root stays horizontally translated while the
// sprung body is pitched to the wheel-support plane. On a steep but perfectly
// planar road, the legacy contact-gap test therefore consumed road pitch as if
// it were suspension travel and could mark the entire downhill axle airborne.
//
// Airborne/crest ownership remains with the existing launch solver. This helper
// only repairs wheel-contact flags while the chassis is explicitly supported on
// a road and all sampled wheel grounds agree on one planar support surface.
export function restoreSteepPlanarRoadContacts({
  contacts=[],
  onRoad=false,
  airborne=false,
  suspensionTravel=.14,
  minimumGrade=.06
}={}){
  const result={restored:0,eligible:false,gradeMagnitude:0,maxResidual:Infinity};
  if(!onRoad||airborne||!Array.isArray(contacts)||contacts.length<4)return result;
  if(!contacts.some(contact=>contact?.contact===false))return result;

  const plane=fitGroundPlane(contacts);
  if(!plane)return result;
  result.gradeMagnitude=plane.gradeMagnitude;
  result.maxResidual=plane.maxResidual;

  const residualTolerance=clamp((Number(suspensionTravel)||.14)*.30,.022,.060);
  if(plane.gradeMagnitude<Math.max(.02,Number(minimumGrade)||.06))return result;
  if(plane.maxResidual>residualTolerance)return result;
  result.eligible=true;

  for(const point of plane.points){
    const contact=point.contact;
    if(contact.contact!==false)continue;
    const residualRatio=clamp(Math.abs(point.residual)/Math.max(.001,residualTolerance),0,1);
    contact.contact=true;
    contact.contactFactor=Math.max(
      clamp(Number(contact.contactFactor)||0,0,1),
      clamp(1-residualRatio,.35,1)
    );
    result.restored++;
  }
  return result;
}
