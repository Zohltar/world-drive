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

function restoreFalseContactsWithinArticulation({
  plane,
  suspensionTravel,
  tolerance,
  minimumFactor
}={}){
  let restored=0;
  for(const point of plane?.points||[]){
    const contact=point.contact;
    if(contact?.contact!==false)continue;
    const residual=Math.abs(Number(point.residual)||0);
    if(residual>tolerance)continue;

    // Residual from the best rigid wheel plane is suspension articulation, not
    // tire slip. Keep meaningful normal support while the road warp remains
    // inside the available wheel travel; spring/load-transfer logic may still
    // redistribute that support afterwards.
    const travel=Math.max(.001,Number(suspensionTravel)||.14);
    const articulationRatio=clamp(residual/travel,0,1);
    const supportFactor=clamp(1-articulationRatio*.72,minimumFactor,1);
    contact.contact=true;
    contact.contactFactor=Math.max(
      clamp(Number(contact.contactFactor)||0,0,1),
      supportFactor
    );
    restored++;
  }
  return restored;
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

// Issue #13 — a corner exit can combine longitudinal grade with a changing
// road bank/superelevation. Four wheel samples then form a shallow saddle rather
// than one perfect plane. The legacy vertical-gap contact test can interpret
// that bounded torsion as two diagonal wheels being airborne, which removes
// normal load and lets chassis yaw outrun the momentum trajectory at very low
// speed.
//
// This is deliberately narrower than a generic "keep wheels glued" rule:
// - road support must already own the chassis;
// - the vehicle must not be airborne;
// - only false contacts are repaired;
// - deviation from the best rigid support plane must fit inside a bounded
//   fraction of real suspension travel.
// Large discontinuities remain false contacts and crest/airborne behavior stays
// under the existing launch solver.
export function restoreBoundedRoadArticulationContacts({
  contacts=[],
  onRoad=false,
  airborne=false,
  suspensionTravel=.14,
  articulationRatio=.56
}={}){
  const result={restored:0,eligible:false,gradeMagnitude:0,maxResidual:Infinity,tolerance:0};
  if(!onRoad||airborne||!Array.isArray(contacts)||contacts.length<4)return result;
  if(!contacts.some(contact=>contact?.contact===false))return result;

  const plane=fitGroundPlane(contacts);
  if(!plane)return result;
  result.gradeMagnitude=plane.gradeMagnitude;
  result.maxResidual=plane.maxResidual;

  const travel=clamp(Number(suspensionTravel)||.14,.055,.40);
  const ratio=clamp(Number(articulationRatio)||.56,.35,.70);
  const tolerance=clamp(travel*ratio,.030,.120);
  result.tolerance=tolerance;
  if(plane.maxResidual>tolerance)return result;

  result.eligible=true;
  result.restored=restoreFalseContactsWithinArticulation({
    plane,
    suspensionTravel:travel,
    tolerance,
    minimumFactor:.55
  });
  return result;
}
