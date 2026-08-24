// World Drive V21.27 — surface friction foundation.
//
// Surface grip is intentionally separated from tire grip. Values here are
// calibration multipliers relative to clean dry asphalt; tire-model.js owns the
// tire's own peak/sliding friction and load sensitivity.

const PROFILES={
  'asphalt-dry':{
    id:'asphalt-dry',
    label:'Asphalte sec',
    peakScale:1.00,
    slideScale:1.00,
    rollingResistanceScale:1.00
  },
  'asphalt-poor':{
    id:'asphalt-poor',
    label:'Asphalte usé / contaminé',
    peakScale:.86,
    slideScale:.84,
    rollingResistanceScale:1.08
  },
  'asphalt-wet':{
    id:'asphalt-wet',
    label:'Asphalte mouillé',
    peakScale:.72,
    slideScale:.70,
    rollingResistanceScale:1.03
  },
  gravel:{
    id:'gravel',
    label:'Gravier',
    peakScale:.58,
    slideScale:.62,
    rollingResistanceScale:1.55
  },
  dirt:{
    id:'dirt',
    label:'Terre',
    peakScale:.48,
    slideScale:.54,
    rollingResistanceScale:1.75
  },
  grass:{
    id:'grass',
    label:'Herbe',
    peakScale:.38,
    slideScale:.44,
    rollingResistanceScale:1.95
  }
};

export const SURFACE_FRICTION_PROFILES=Object.freeze(
  Object.fromEntries(
    Object.entries(PROFILES).map(([id,profile])=>[
      id,
      Object.freeze({...profile})
    ])
  )
);

export function surfaceFrictionProfile(id='asphalt-dry'){
  return SURFACE_FRICTION_PROFILES[id]||SURFACE_FRICTION_PROFILES['asphalt-dry'];
}

export function surfaceFrictionScales(id='asphalt-dry'){
  const profile=surfaceFrictionProfile(id);
  return {
    peak:profile.peakScale,
    slide:profile.slideScale,
    rollingResistance:profile.rollingResistanceScale
  };
}
