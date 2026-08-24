// World Drive V21.27 — steering geometry foundation.
//
// Geometry only: no speed-based steering assist and no tire grip. The caller
// supplies the rack/centre road-wheel angle; this module converts it to the
// inner/outer wheel angles that correspond to one common instantaneous centre.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

export function turningRadiusFromSteer({wheelbase=2.7,centerAngle=0}={}){
  const L=Math.max(.25,finite(wheelbase,2.7));
  const delta=finite(centerAngle,0);
  if(Math.abs(delta)<1e-9)return Infinity;
  return Math.abs(L/Math.tan(delta));
}

export function ackermannSteeringAngles({
  wheelbase=2.7,
  trackWidth=1.55,
  centerAngle=0
}={}){
  const L=Math.max(.25,finite(wheelbase,2.7));
  const T=Math.max(.25,finite(trackWidth,1.55));
  const delta=finite(centerAngle,0);
  const sign=Math.sign(delta);

  if(!sign||Math.abs(delta)<1e-9){
    return {
      centerAngle:0,
      innerAngle:0,
      outerAngle:0,
      centerRadius:Infinity,
      innerRadius:Infinity,
      outerRadius:Infinity,
      turnSign:0
    };
  }

  const centerRadius=Math.abs(L/Math.tan(delta));
  // Avoid a singularity if an intentionally extreme requested lock places the
  // instantaneous centre inside half the front track.
  const innerRadius=Math.max(.05,centerRadius-T*.5);
  const outerRadius=centerRadius+T*.5;
  const innerAngle=sign*Math.atan(L/innerRadius);
  const outerAngle=sign*Math.atan(L/outerRadius);

  return {
    centerAngle:delta,
    innerAngle,
    outerAngle,
    centerRadius,
    innerRadius,
    outerRadius,
    turnSign:sign
  };
}

// The runtime/visual integration decides which physical side is inside based on
// World Drive's steering-sign convention. Keeping that mapping outside the pure
// geometry avoids baking renderer coordinates into the physics math.
export function ackermannAngleForRole(geometry,role='outer'){
  if(role==='inner')return finite(geometry?.innerAngle,0);
  if(role==='center')return finite(geometry?.centerAngle,0);
  return finite(geometry?.outerAngle,0);
}

// Maps one physical wheel side to the inner/outer Ackermann angle.
// World Drive convention: positive steering is a right turn, therefore the
// right front wheel is inside for positive angles and the left is inside for
// negative angles. Accept both string and numeric (-1/+1) side metadata.
export function ackermannAngleForSide(geometry,side='left'){
  const turnSign=Math.sign(finite(geometry?.turnSign,0));
  if(!turnSign)return 0;
  const normalizedSide=
    side==='right'||Number(side)>0
      ?'right'
      :'left';
  const inside=
    turnSign>0
      ?normalizedSide==='right'
      :normalizedSide==='left';
  return finite(
    inside
      ?geometry?.innerAngle
      :geometry?.outerAngle,
    0
  );
}
