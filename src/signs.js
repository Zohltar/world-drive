// World Drive - geographic sign subsystem
// Owns OSM sign/city/river data loading/parsing plus geographic fallback and
// placement orchestration. Road-furniture remains authoritative for 3D geometry.

const SIGN_TTL_MS=1000*60*60*24*10;

export const GEOGRAPHIC_SIGN_POLICY=Object.freeze({
  routeCorrelationM:120,
  speedConfidenceMin:.20,
  nearbySpeedSuppressionM:900,
  speedAheadM:95,
  riverLeadM:22,
  cityLeadM:55,
  visibleCorridorM:1600
});

export function createSignDataService({
  statusEl,
  toLatLon,
  toWorld,
  nearestRoute,
  fetchCached,
  getGeneration,
  onChanged
}) {
  if(typeof toLatLon!=='function')throw new Error('Signs requires toLatLon()');
  if(typeof toWorld!=='function')throw new Error('Signs requires toWorld()');
  if(typeof nearestRoute!=='function')throw new Error('Signs requires nearestRoute()');
  if(typeof fetchCached!=='function')throw new Error('Signs requires fetchCached()');

  const signs=[];
  const state={
    loading:false,
    center:{x:Infinity,z:Infinity}
  };

  function updateStatus(){
    if(statusEl)statusEl.textContent=String(signs.length);
  }

  function query(ll){
    return `[out:json][timeout:12];(
      node(around:5000,${ll.lat},${ll.lon})["highway"="traffic_sign"];
      node(around:5000,${ll.lat},${ll.lon})["traffic_sign"];
      node(around:5000,${ll.lat},${ll.lon})["place"~"city|town|village|hamlet"]["name"];
      way(around:5000,${ll.lat},${ll.lon})["waterway"~"river|stream"]["name"];
      way(around:5000,${ll.lat},${ll.lon})["natural"="water"]["name"];
    );out tags geom center;`;
  }

  function routeCorrelationForPoint(x,z,maxDistance=55){
    const nearest=nearestRoute(x,z);
    if(!nearest||nearest.d>maxDistance)return null;
    return nearest;
  }

  function extractWaterName(tags={}){
    return tags['name:fr']||
           tags.name||
           tags.official_name||
           null;
  }

  function elementLatLon(element){
    let lat=element?.lat;
    let lon=element?.lon;

    if((lat==null||lon==null)&&element?.center){
      lat=element.center.lat;
      lon=element.center.lon;
    }

    if(
      (lat==null||lon==null) &&
      element?.geometry?.length
    ){
      const middle=
        element.geometry[Math.floor(element.geometry.length/2)];
      lat=middle.lat;
      lon=middle.lon;
    }

    if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))){
      return null;
    }

    return {
      lat:Number(lat),
      lon:Number(lon)
    };
  }

  function classify(element){
    const tags=element?.tags||{};
    let kind=null;
    let label=null;
    let maxspeed=null;

    const signTag=tags.traffic_sign||'';

    if(tags.highway==='traffic_sign'||signTag){
      const speedMatch=
        String(signTag).match(/(?:maxspeed[:=]?|CA:)?(\d{2,3})/i);

      if(speedMatch){
        kind='speed';
        maxspeed=parseFloat(speedMatch[1]);
        label=String(Math.round(maxspeed));
      }
    }

    if(!kind&&tags.place&&tags.name){
      kind='city';
      label=tags['name:fr']||tags.name;
    }

    if(!kind&&(tags.waterway||tags.natural==='water')){
      const waterName=extractWaterName(tags);
      if(waterName){
        kind='river';
        label=waterName;
      }
    }

    if(!kind||!label)return null;

    return {
      kind,
      label,
      maxspeed
    };
  }

  function ingest(data){
    if(!data)return 0;

    const known=new Set(signs.map(sign=>sign.key));
    let added=0;

    for(const element of data.elements||[]){
      const ll=elementLatLon(element);
      if(!ll)continue;

      const world=toWorld(ll.lat,ll.lon);
      const near=routeCorrelationForPoint(
        world.x,
        world.z,
        85
      );
      if(!near)continue;

      const classified=classify(element);
      if(!classified)continue;

      const {
        kind,
        label,
        maxspeed
      }=classified;

      const key=
        `${kind}:${element.type}:${element.id}:${label}`;

      if(known.has(key))continue;

      signs.push({
        key,
        kind,
        label,
        maxspeed,
        x:world.x,
        z:world.z,
        routeCum:near.cum,
        routeDistance:near.d
      });

      known.add(key);
      added++;
    }

    return added;
  }

  async function loadAround(absx,absz){
    if(state.loading)return false;

    state.loading=true;
    const generation=getGeneration?.()??0;
    const ll=toLatLon(absx,absz);

    try{
      const {data}=await fetchCached(
        'signs',
        ll,
        query(ll),
        6500,
        SIGN_TTL_MS
      );

      if(generation!==(getGeneration?.()??0)){
        return false;
      }

      ingest(data);

      state.center={
        x:absx,
        z:absz
      };

      updateStatus();
      onChanged?.();
      return true;
    }finally{
      state.loading=false;
    }
  }

  function reset(){
    signs.length=0;
    state.loading=false;
    state.center={
      x:Infinity,
      z:Infinity
    };
    updateStatus();
  }

  updateStatus();

  return {
    signs,
    loadAround,
    reset,
    ingest,
    query,
    get loading(){
      return state.loading;
    },
    get center(){
      return state.center;
    }
  };
}

export function createGeographicSignOrchestrator({
  signs,
  statusEl,
  getWaterFeatures,
  getRouteEndpoints,
  getRouteLength,
  nearestRoute,
  routePointAtCum,
  roadHeightAt,
  getActiveRoadMeta,
  getVehiclePosition,
  addRoadSignAt
}){
  if(!Array.isArray(signs))throw new Error('Geographic sign orchestrator requires signs array');
  if(typeof nearestRoute!=='function')throw new Error('Geographic sign orchestrator requires nearestRoute()');
  if(typeof routePointAtCum!=='function')throw new Error('Geographic sign orchestrator requires routePointAtCum()');
  if(typeof roadHeightAt!=='function')throw new Error('Geographic sign orchestrator requires roadHeightAt()');
  if(typeof addRoadSignAt!=='function')throw new Error('Geographic sign orchestrator requires addRoadSignAt()');

  function nearestRouteCumToFeature(points){
    let best=null,bd=Infinity;
    for(const p of points||[]){
      const n=nearestRoute(p.x,p.z);
      if(n&&n.d<bd){bd=n.d;best=n;}
    }
    return best&&bd<GEOGRAPHIC_SIGN_POLICY.routeCorrelationM?best:null;
  }

  function collectEndpointLocalitySigns(){
    const endpoints=getRouteEndpoints?.()||{};
    const routeLength=Math.max(0,Number(getRouteLength?.())||0);
    const candidates=[
      {p:endpoints.start,cum:0},
      {p:endpoints.end,cum:routeLength}
    ];
    const known=new Set(
      signs
        .filter(sign=>sign.kind==='city')
        .map(sign=>String(sign.label).toLowerCase())
    );

    for(const candidate of candidates){
      const label=candidate.p?.name;
      const normalized=String(label||'').toLowerCase();
      if(
        !label||
        /^(départ|arrivée|waypoint)$/i.test(label)||
        known.has(normalized)
      )continue;

      signs.push({
        key:`city:endpoint:${candidate.cum}:${label}`,
        kind:'city',
        label,
        maxspeed:null,
        x:0,
        z:0,
        routeCum:candidate.cum,
        routeDistance:0,
        fallback:true
      });
      known.add(normalized);
    }
  }

  function collectFallbackRiverSigns(){
    const existing=new Set(
      signs
        .filter(sign=>sign.kind==='river')
        .map(sign=>String(sign.label).toLowerCase())
    );

    for(const feature of getWaterFeatures?.()||[]){
      const tags=feature.tags||{};
      const label=tags['name:fr']||tags.name||tags.official_name;
      const normalized=String(label||'').toLowerCase();
      if(!label||existing.has(normalized))continue;

      const nearest=nearestRouteCumToFeature(feature.points);
      if(!nearest)continue;

      signs.push({
        key:`river:fallback:${feature.type||'way'}:${feature.id}:${label}`,
        kind:'river',
        label,
        maxspeed:null,
        x:nearest.px,
        z:nearest.pz,
        routeCum:nearest.cum,
        routeDistance:nearest.d,
        fallback:true
      });
      existing.add(normalized);
    }
  }

  function addFallbackSpeedSign(){
    const activeRoadMeta=getActiveRoadMeta?.()||{};
    if(
      !activeRoadMeta.maxspeed||
      activeRoadMeta.confidence<=GEOGRAPHIC_SIGN_POLICY.speedConfidenceMin
    )return;

    const vehicle=getVehiclePosition?.()||{};
    const nearest=nearestRoute(vehicle.x,vehicle.z);
    if(!nearest)return;

    const hasNearby=signs.some(sign=>
      sign.kind==='speed'&&
      Math.abs(sign.routeCum-nearest.cum)<GEOGRAPHIC_SIGN_POLICY.nearbySpeedSuppressionM
    );
    if(hasNearby)return;

    const routeLength=Math.max(0,Number(getRouteLength?.())||0);
    const point=routePointAtCum(
      Math.min(
        routeLength,
        nearest.cum+GEOGRAPHIC_SIGN_POLICY.speedAheadM
      )
    );
    point.y=roadHeightAt(point.x,point.z);
    addRoadSignAt(point,Math.round(activeRoadMeta.maxspeed),'speed',1);
  }

  function addGeographicRoadSigns(){
    collectFallbackRiverSigns();
    collectEndpointLocalitySigns();

    const routeLength=Math.max(0,Number(getRouteLength?.())||0);
    if(!routeLength)return;

    const vehicle=getVehiclePosition?.()||{};
    const nearest=nearestRoute(vehicle.x,vehicle.z);
    if(!nearest)return;

    addFallbackSpeedSign();

    if(statusEl)statusEl.textContent=String(signs.length);

    for(const sign of signs){
      if(
        Math.abs(sign.routeCum-nearest.cum)>
        GEOGRAPHIC_SIGN_POLICY.visibleCorridorM
      )continue;

      let cum=sign.routeCum;
      const side=1;
      if(sign.kind==='river'){
        cum=Math.max(0,sign.routeCum-GEOGRAPHIC_SIGN_POLICY.riverLeadM);
      }else if(sign.kind==='city'){
        cum=Math.max(0,sign.routeCum-GEOGRAPHIC_SIGN_POLICY.cityLeadM);
      }

      const point=routePointAtCum(cum);
      point.y=roadHeightAt(point.x,point.z);
      const label=sign.kind==='speed'
        ?Math.round(sign.maxspeed||Number(sign.label))
        :sign.label;
      addRoadSignAt(point,label,sign.kind,side);
    }
  }

  return Object.freeze({
    nearestRouteCumToFeature,
    collectEndpointLocalitySigns,
    collectFallbackRiverSigns,
    addFallbackSpeedSign,
    addGeographicRoadSigns
  });
}
