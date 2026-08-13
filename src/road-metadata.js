// World Drive - active road metadata subsystem
// Owns OSM road metadata query, correlation, parsing and HUD state.

const ROAD_META_TTL_MS=1000*60*60*24*7;

export function createRoadMetadataService({
  roadTypeStatus,
  roadSurfaceStatus,
  osmSpeedStatus,
  toLatLon,
  toWorld,
  nearestRoute,
  nearestPointOnPolyline,
  angleDelta,
  fetchCached,
  getGeneration,
  onChanged
}) {
  if(typeof toLatLon!=='function')throw new Error('Road metadata requires toLatLon()');
  if(typeof toWorld!=='function')throw new Error('Road metadata requires toWorld()');
  if(typeof nearestRoute!=='function')throw new Error('Road metadata requires nearestRoute()');
  if(typeof nearestPointOnPolyline!=='function')throw new Error('Road metadata requires nearestPointOnPolyline()');
  if(typeof angleDelta!=='function')throw new Error('Road metadata requires angleDelta()');
  if(typeof fetchCached!=='function')throw new Error('Road metadata requires fetchCached()');

  const meta={
    highway:null,
    surface:'asphalt',
    maxspeed:null,
    lanes:null,
    width:null,
    name:null,
    ref:null,
    confidence:0
  };

  const state={
    loading:false,
    center:{x:Infinity,z:Infinity}
  };

  function query(ll){
    return `[out:json][timeout:10];(
      way(around:90,${ll.lat},${ll.lon})["highway"];
    );out tags geom;`;
  }

  function parseMaxspeed(value){
    if(!value)return null;
    const text=String(value).toLowerCase().trim();
    const number=parseFloat(text);
    if(!Number.isFinite(number))return null;
    return text.includes('mph')?number*1.609344:number;
  }

  function resetMeta(){
    Object.assign(meta,{
      highway:null,
      surface:'asphalt',
      maxspeed:null,
      lanes:null,
      width:null,
      name:null,
      ref:null,
      confidence:0
    });
  }

  function updateHUD(){
    if(roadTypeStatus){
      roadTypeStatus.textContent=
        meta.ref||meta.name||meta.highway||'—';
    }
    if(roadSurfaceStatus){
      roadSurfaceStatus.textContent=meta.surface||'—';
    }
    if(osmSpeedStatus){
      osmSpeedStatus.textContent=
        meta.maxspeed
          ?`${Math.round(meta.maxspeed)} km/h`
          :'—';
    }
  }

  function surfaceGrip(){
    const key=String(meta.surface||'asphalt').toLowerCase();

    if(key.includes('gravel'))return .74;
    if(['compacted','fine_gravel'].includes(key))return .80;
    if(['unpaved','dirt','ground','earth'].includes(key))return .64;
    if(key==='grass')return .54;

    return 1;
  }

  function safeWidth(){
    const lanes=Math.max(
      1,
      Math.min(4,Number(meta.lanes)||2)
    );
    const roadClass=meta.highway||'primary';

    let width=
      lanes*(
        ['motorway','trunk'].includes(roadClass)
          ?3.5
          :['primary','secondary'].includes(roadClass)
            ?3.35
            :3.1
      );

    if(
      Number.isFinite(meta.width) &&
      meta.width>=4.5 &&
      meta.width<=11.5
    ){
      width=meta.width;
    }

    return Math.max(5.5,Math.min(9.5,width));
  }

  function chooseRoad(data,absx,absz,routeNear){
    let winner=null;
    let bestScore=Infinity;

    if(!data||!routeNear)return {winner,bestScore};

    for(const element of data.elements||[]){
      if(!element.geometry?.length||!element.tags?.highway)continue;

      const points=element.geometry.map(point=>{
        const world=toWorld(point.lat,point.lon);
        return {x:world.x,z:world.z};
      });

      const nearest=nearestPointOnPolyline(absx,absz,points);
      const angleDiff=Math.abs(
        angleDelta(nearest.angle,routeNear.angle)
      );
      const aligned=Math.min(
        angleDiff,
        Math.abs(Math.PI-angleDiff)
      );

      // Strict route correlation to avoid picking driveways/service roads.
      if(nearest.d>22||aligned>0.38)continue;

      let score=nearest.d+aligned*28;

      if(
        ['service','track','path','footway']
          .includes(element.tags.highway)
      ){
        score+=12;
      }

      if(score<bestScore){
        bestScore=score;
        winner=element;
      }
    }

    return {winner,bestScore};
  }

  function applyWinner(winner,bestScore){
    if(!winner){
      resetMeta();
      return;
    }

    const tags=winner.tags||{};
    const lanes=parseInt(tags.lanes||'',10);
    const width=parseFloat(tags.width||'');

    Object.assign(meta,{
      highway:tags.highway||null,
      surface:tags.surface||'asphalt',
      maxspeed:parseMaxspeed(tags.maxspeed),
      lanes:Number.isFinite(lanes)?lanes:null,
      width:Number.isFinite(width)?width:null,
      name:tags.name||null,
      ref:tags.ref||null,
      confidence:Math.max(0,1-bestScore/45)
    });
  }

  async function loadAround(absx,absz){
    if(state.loading)return false;

    state.loading=true;
    const generation=getGeneration?.()??0;
    const ll=toLatLon(absx,absz);
    const routeNear=nearestRoute(absx,absz);

    try{
      const {data}=await fetchCached(
        'roadmeta',
        ll,
        query(ll),
        6000,
        ROAD_META_TTL_MS
      );

      if(generation!==(getGeneration?.()??0)){
        return false;
      }

      const {winner,bestScore}=chooseRoad(
        data,
        absx,
        absz,
        routeNear
      );

      applyWinner(winner,bestScore);

      state.center={
        x:absx,
        z:absz
      };

      updateHUD();
      onChanged?.();

      return !!winner;
    }finally{
      state.loading=false;
    }
  }

  function reset(){
    resetMeta();
    state.loading=false;
    state.center={x:Infinity,z:Infinity};
    updateHUD();
  }

  updateHUD();

  return {
    meta,
    loadAround,
    reset,
    updateHUD,
    surfaceGrip,
    safeWidth,
    parseMaxspeed,
    query,
    get loading(){
      return state.loading;
    },
    get center(){
      return state.center;
    }
  };
}
