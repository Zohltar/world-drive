export function createRoutePlannerUi({
  $,
  documentRef,
  geocodingService,
  createRequestedRoute,
  toast,
  MANIC2,
  MANIC5,
  R169_START,
  R169_END,
  R132_START,
  R132_END,
  YUNGAS_START,
  YUNGAS_END,
  YUNGAS_WAYPOINTS,
}){
  // ---------- human-friendly place search ----------
  let selectedStart={...MANIC2};
  let selectedEnd={...MANIC5};
  function setSelectedPlace(which,p){
    if(which==='start'){
      selectedStart={lat:p.lat,lon:p.lon,name:p.name||$('startPlace').value};
      $('startLat').value=p.lat;$('startLon').value=p.lon;
      $('startPlace').value=p.name||$('startPlace').value;
      $('startSearchResults').classList.remove('open');
    }else{
      selectedEnd={lat:p.lat,lon:p.lon,name:p.name||$('endPlace').value};
      $('endLat').value=p.lat;$('endLon').value=p.lon;
      $('endPlace').value=p.name||$('endPlace').value;
      $('endSearchResults').classList.remove('open');
    }
  }
  
  function renderSearchResults(which,items){
    const box=$(which==='start'?'startSearchResults':'endSearchResults');
    box.replaceChildren();
    if(!items.length){
      const d=documentRef.createElement('div');d.className='searchChoice';d.textContent='Aucun résultat';box.appendChild(d);
      box.classList.add('open');return;
    }
    for(const p of items){
      const b=documentRef.createElement('button');b.className='searchChoice';
      const meta=documentRef.createElement('span');meta.className='searchMeta';
      b.textContent=String(p.name||'');
      meta.textContent=`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
      b.appendChild(meta);
      b.onclick=()=>setSelectedPlace(which,p);
      box.appendChild(b);
    }
    box.classList.add('open');
  }
  
  async function searchPlaceField(which){
    const input=$(which==='start'?'startPlace':'endPlace');
    const btn=$(which==='start'?'findStartBtn':'findEndBtn');
    const old=btn.textContent;btn.textContent='…';btn.disabled=true;
    try{
      const items=await geocodingService.search(input.value,5);
      renderSearchResults(which,items);
    }catch(e){
      console.warn(e);toast('Recherche de lieu indisponible');
    }finally{btn.textContent=old;btn.disabled=false}
  }
  
  $('findStartBtn').onclick=()=>searchPlaceField('start');
  $('findEndBtn').onclick=()=>searchPlaceField('end');
  $('startPlace').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaceField('start')});
  $('endPlace').addEventListener('keydown',e=>{if(e.key==='Enter')searchPlaceField('end')});
  
  // ---------- route planner ----------
  $('buildRouteBtn').addEventListener('click',async()=>{
    const btn=$('buildRouteBtn'),old=btn.textContent;btn.textContent='Préparation…';btn.disabled=true;
    try{
      // If the user edited text without clicking Search, resolve it automatically.
      const startText=$('startPlace').value.trim();
      const endText=$('endPlace').value.trim();
  
      if(startText && startText!==selectedStart.name){
        const r=await geocodingService.search(startText,1);
        if(!r[0]){toast('Départ introuvable');return}
        setSelectedPlace('start',{...r[0],name:startText});
      }
      if(endText && endText!==selectedEnd.name){
        const r=await geocodingService.search(endText,1);
        if(!r[0]){toast('Destination introuvable');return}
        setSelectedPlace('end',{...r[0],name:endText});
      }
  
      const waypoints=await geocodingService.resolveWaypointLines($('waypointsInput').value);
      createRequestedRoute({...selectedStart},{...selectedEnd},waypoints);
    }catch(e){
      console.error(e);toast('Impossible de préparer le trajet');
    }finally{btn.textContent=old;btn.disabled=false}
  });
  function applyPreset(start,end,waypoints=[]){
    const presetWaypoints=Array.isArray(waypoints)?waypoints:[];
  
    $('waypointsInput').value=
      presetWaypoints
        .map(point=>point.name||`${point.lat}, ${point.lon}`)
        .join('\n');
  
    selectedStart={...start};selectedEnd={...end};
    $('startPlace').value=start.name;$('endPlace').value=end.name;
    $('startLat').value=start.lat;$('startLon').value=start.lon;
    $('endLat').value=end.lat;$('endLon').value=end.lon;
    createRequestedRoute(
      {...start},
      {...end},
      presetWaypoints.map(point=>({...point}))
    );
  }
  $('preset389Btn').addEventListener('click',()=>applyPreset(MANIC2,MANIC5));
  $('preset169Btn').addEventListener('click',()=>applyPreset(R169_START,R169_END));
  $('preset132Btn').addEventListener('click',()=>applyPreset(R132_START,R132_END));
  
  // V21.14: add Yungas without requiring an index.html replacement. The planner
  // is later moved wholesale into the V21 Route tab, so this button follows it.
  const presetGrid=documentRef.querySelector('#plannerBox .presetGrid');
  if(presetGrid&&!$('presetYungasBtn')){
    const button=documentRef.createElement('button');
    button.id='presetYungasBtn';
    button.type='button';
    button.textContent='☠ Yungas · Chuspipata → Yolosa';
    button.title='Camino de la Muerte · Bolivie';
    button.addEventListener(
      'click',
      ()=>applyPreset(
        YUNGAS_START,
        YUNGAS_END,
        YUNGAS_WAYPOINTS
      )
    );
    presetGrid.appendChild(button);
  }

  return {
    setSelectedPlace,
    renderSearchResults,
    searchPlaceField,
    applyPreset,
    getSelection:()=>({
      start:{...selectedStart},
      end:{...selectedEnd}
    })
  };
}
