// World Drive - network routing service

export function createRoutingService({
  onStatus,
  onLoadingText,
  distance
}) {
  const providers=[
    {
      label:'OSRM Project',
      buildUrl:coords=>`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
    },
    {
      label:'OSM Routing',
      buildUrl:coords=>`https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
    }
  ];

  async function fetchJson(url,timeoutMs=8500,label='routeur'){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);

    try{
      const response=await fetch(url,{
        signal:controller.signal,
        cache:'no-store'
      });

      if(!response.ok){
        throw new Error(`${label}: HTTP ${response.status}`);
      }

      const data=await response.json();
      if(!data?.routes?.[0]?.geometry?.coordinates?.length){
        throw new Error(`${label}: réponse invalide`);
      }

      return data;
    }finally{
      clearTimeout(timer);
    }
  }

  function orientCoordinates(coordinates,start){
    const oriented=coordinates.slice();
    if(oriented.length<2||!start||typeof distance!=='function')return oriented;

    const first={lon:oriented[0][0],lat:oriented[0][1]};
    const lastPoint=oriented[oriented.length-1];
    const last={lon:lastPoint[0],lat:lastPoint[1]};

    const firstToStart=distance(first,start);
    const lastToStart=distance(last,start);
    if(lastToStart<firstToStart)oriented.reverse();

    return oriented;
  }

  async function fetchRoute({points,start}){
    if(!Array.isArray(points)||points.length<2){
      throw new Error('Au moins deux points sont requis pour le routage');
    }

    const coords=points.map(p=>`${p.lon},${p.lat}`).join(';');

    onStatus?.('Connexion…');
    onLoadingText?.('Récupération du tracé routier…');

    const attempts=providers.map(provider=>(async()=>{
      try{
        const data=await fetchJson(
          provider.buildUrl(coords),
          8500,
          provider.label
        );
        return {provider,data};
      }catch(error){
        console.warn(provider.label,error);
        throw error;
      }
    })());

    let winner;
    try{
      winner=await Promise.any(attempts);
    }catch(error){
      onStatus?.('Échec');
      throw new Error('Aucun serveur de routage n’a répondu dans le délai prévu');
    }

    const coordinates=orientCoordinates(
      winner.data.routes[0].geometry.coordinates,
      start
    );

    onStatus?.(winner.provider.label);

    return {
      provider:winner.provider.label,
      coordinates
    };
  }

  return {fetchRoute};
}
