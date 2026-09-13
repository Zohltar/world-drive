// Built-in route presets used by startup and the route planner.

import LagunaSecaTrack from './circuits/laguna-seca.json' with {type:'json'};

export const MANIC2={
  lat:49.3213,
  lon:-68.3467,
  name:'Manic‑2'
};

export const MANIC5={
  lat:50.6451065,
  lon:-68.7271214,
  name:'Manic‑5'
};

export const R169_START={
  lat:48.39474,
  lon:-71.67772,
  name:'Hébertville'
};

export const R169_END={
  lat:48.650002,
  lon:-72.449997,
  name:'Saint‑Félicien'
};

export const R132_START={
  lat:48.849998,
  lon:-67.533333,
  name:'Matane'
};

export const R132_END={
  lat:48.533333,
  lon:-64.216667,
  name:'Percé'
};

// Bolivia · Camino de la Muerte / North Yungas Road.
// The midpoint keeps the router on the historic road instead of the newer route.
export const YUNGAS_START={
  lat:-16.29911,
  lon:-67.81891,
  name:'Chuspipata · Yungas'
};

export const YUNGAS_END={
  lat:-16.23312,
  lon:-67.73975,
  name:'Yolosa · Yungas'
};

export const YUNGAS_WAYPOINTS=[
  {
    lat:-16.2577,
    lon:-67.7861,
    name:'Camino de la Muerte'
  }
];

// California · WeatherTech Raceway Laguna Seca, current Grand Prix layout.
// The geometry is a committed snapshot of the OSM highway=raceway main loop,
// excluding pit lane. Circuit presets intentionally do not depend on a live
// road router accepting raceway access at play time.
const [LAGUNA_START_LON,LAGUNA_START_LAT]=LagunaSecaTrack.coordinates[0];
export const LAGUNA_SECA_START={
  lat:LAGUNA_START_LAT,
  lon:LAGUNA_START_LON,
  name:'Laguna Seca · circuit'
};
export const LAGUNA_SECA_END={...LAGUNA_SECA_START};
export const LAGUNA_SECA_CIRCUIT=Object.freeze({
  id:'laguna-seca-grand-prix',
  label:'Laguna Seca · Circuit',
  provider:'Circuit preset · OSM',
  routeKind:'circuit',
  closedLoop:true,
  civilTraffic:false,
  roadSpec:Object.freeze({
    asphaltWidthM:15,
    shoulderWidthM:0,
    edgeLineInsetM:.22,
    centerLine:false,
    widthSource:'published MotoGP technical data · 15 m nominal width'
  }),
  lengthM:LagunaSecaTrack.lengthM,
  sourceWayIds:Object.freeze([...LagunaSecaTrack.sourceWayIds]),
  coordinates:Object.freeze(LagunaSecaTrack.coordinates.map(point=>Object.freeze([...point])))
});
