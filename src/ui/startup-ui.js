// World Drive V21.25 — startup overlay and vehicle chooser.
// Rendering/UI ownership only. Engine state remains in main.js through callbacks.

export function createStartupUi({
  versionLabel,
  title,
  loading,
  getRouteSummary,
  getVehicles,
  onStartVehicle
}){
  if(typeof getRouteSummary!=='function')throw new Error('startup UI requires getRouteSummary');
  if(typeof getVehicles!=='function')throw new Error('startup UI requires getVehicles');
  if(typeof onStartVehicle!=='function')throw new Error('startup UI requires onStartVehicle');
  const $=id=>document.getElementById(id);
  let selectedVehicle=null;

  function install(){
    if(document.getElementById('v21Startup'))return;
    const overlay=document.createElement('div');
    overlay.id='v21Startup';
    overlay.innerHTML=`
      <div class="v21StartupCard">
        <div class="v21StartupBrand">
          <h1>WORLD DRIVE</h1>
          <p id="v21StartupVersion"></p>
        </div>
        <div id="v21BootContent">
          <div class="v21RouteSummary">
            <span>Trajet par défaut</span>
            <b>Manic-2 → Manic-5</b>
          </div>
          <div class="v21BootRows">
            <div class="v21BootRow" id="v21BootRoute" data-state="loading"><span class="v21BootDot"></span><span>Trajet</span><b>Préparation…</b></div>
            <div class="v21BootRow" id="v21BootHydro" data-state="waiting"><span class="v21BootDot"></span><span>Hydrographie initiale</span><b>En attente</b></div>
            <div class="v21BootRow" id="v21BootSettings" data-state="loading"><span class="v21BootDot"></span><span>Réglages</span><b>Chargement…</b></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const versionText=$('v21StartupVersion');
    if(versionText)versionText.textContent=`${versionLabel} · initialisation du monde`;
    document.title=title;
    const oldLoadingTitle=loading?.querySelector('h1');
    if(oldLoadingTitle)oldLoadingTitle.textContent=title;
    loading?.classList.add('hidden');
  }

  function setProgress(key,state,text){
    const map={route:'v21BootRoute',hydro:'v21BootHydro',settings:'v21BootSettings'};
    const row=$(map[key]);
    if(!row)return;
    row.dataset.state=state;
    const value=row.querySelector('b');
    if(value)value.textContent=text;
  }

  function showVehicleChooser(){
    const content=$('v21BootContent');
    if(!content)return;
    selectedVehicle=null;
    const route=getRouteSummary()||{};
    content.innerHTML=`
      <div class="v21RouteSummary"><span>Trajet prêt</span><b id="v21RouteReadySummary"></b></div>
      <div style="margin-top:18px">
        <div style="font-size:11px;color:#8aa0b3;text-transform:uppercase;letter-spacing:.12em;font-weight:800">Choisissez votre véhicule</div>
        <div class="v21VehicleGrid" id="v21VehicleGrid"></div>
      </div>
      <button id="v21StartButton" disabled>DÉMARRER</button>
    `;
    const routeSummary=$('v21RouteReadySummary');
    if(routeSummary)routeSummary.textContent=`${route.start||'Départ'} → ${route.end||'Arrivée'}`;
    const grid=$('v21VehicleGrid');
    for(const vehicle of getVehicles()||[]){
      const button=document.createElement('button');
      button.type='button';
      button.className='v21VehicleChoice';
      button.dataset.vehicleId=vehicle.id;
      const vehicleName=document.createElement('b');
      const vehicleDescription=document.createElement('span');
      vehicleName.textContent=String(vehicle.name||'');
      vehicleDescription.textContent=String(vehicle.description||'');
      button.appendChild(vehicleName);
      button.appendChild(vehicleDescription);
      button.addEventListener('click',()=>{
        selectedVehicle=vehicle.id;
        grid.querySelectorAll('.v21VehicleChoice').forEach(item=>item.classList.toggle('selected',item===button));
        const startButton=$('v21StartButton');
        if(startButton)startButton.disabled=false;
      });
      grid.appendChild(button);
    }
    $('v21StartButton')?.addEventListener('click',async()=>{
      if(!selectedVehicle)return;
      const startButton=$('v21StartButton');
      if(startButton){startButton.disabled=true;startButton.textContent='PRÉPARATION DE LA FORÊT DEVANT…';}
      try{
        const waitForForest=
          globalThis.WorldDriveDiagnostics?.forest?.whenInitialReady||
          globalThis.__WORLD_DRIVE_P935_FOREST_READY__||
          globalThis.__WORLD_DRIVE_P934_FOREST_READY__||
          globalThis.__WORLD_DRIVE_P933_FOREST_READY__;
        if(typeof waitForForest==='function'){
          // P9.35: do not accept a startup ring dominated by rear chunks.
          await waitForForest({
            minChunks:14,
            minFrontChunks:8,
            minFrontLead:2,
            timeoutMs:5500,
            pollMs:35
          });
        }
        if(startButton)startButton.textContent='DÉMARRAGE…';
        const started=await onStartVehicle(selectedVehicle);
        if(started===false){
          if(startButton){startButton.disabled=false;startButton.textContent='DÉMARRER';}
          return;
        }
        $('v21Startup')?.classList.add('hidden');
      }catch(error){
        console.error('Vehicle start failed',error);
        if(startButton){startButton.disabled=false;startButton.textContent='DÉMARRER';}
        throw error;
      }
    });
  }

  return Object.freeze({install,setProgress,showVehicleChooser});
}
