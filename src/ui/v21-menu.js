// World Drive V21.25 — V21 application menu and settings presentation.
// The menu owns DOM; main.js remains authoritative for driving/runtime state.

export function createV21MenuSystem({
  WORLD_DRIVE_VERSION_LABEL,
  DEFAULT_WORLD_SETTINGS,
  appSettings,
  vehicleSystem,
  vehicleSelect,
  transmissionModeSelect,
  timeSlider,
  timeLabel,
  vehicleTopSpeedKmh,
  keyboardCodes,
  clearKeyboardState,
  queueSettingsSave,
  cloneDefaultControls,
  applyDisplayDistanceProfile,
  imageryService,
  vehicleAudio,
  multiplayer,
  cameraController,
  toggleAssist,
  toggleRoadSpeedLimits,
  toggleAutopilot,
  resetToRoad,
  getWorldCacheStats,
  clearWorldDriveCache,
  toast,
  getRuntimeState,
  getKeyboardRebindAction,
  setKeyboardRebindAction,
  onMenuOpenChange
}){
  if(!appSettings)throw new Error('V21 menu requires appSettings');
  if(typeof getRuntimeState!=='function')throw new Error('V21 menu requires getRuntimeState');
  if(typeof getKeyboardRebindAction!=='function'||typeof setKeyboardRebindAction!=='function')throw new Error('V21 menu requires keyboard rebind accessors');
  const $=id=>document.getElementById(id);
  let v21MenuOpen=false;
  let v21MenuEl=null;
  let v21MenuButton=null;
  let assist=false;
  let obeyRoadSpeedLimits=true;
  let transmissionMode='automatic';
  let autopilot=false;

  function syncLiveState(){
    const state=getRuntimeState()||{};
    assist=!!state.assist;
    obeyRoadSpeedLimits=state.obeyRoadSpeedLimits!==false;
    transmissionMode=state.transmissionMode==='manual'?'manual':'automatic';
    autopilot=!!state.autopilot;
  }
// ---------- V21 reorganized menu ----------
const KEYBOARD_ACTION_LABELS={
  accelerate:'Accélérer',
  brake:'Freiner / reculer',
  steerLeft:'Tourner à gauche',
  steerRight:'Tourner à droite',
  handbrake:'Frein à main',
  shiftUp:'Rapport +',
  shiftDown:'Rapport −',
  camera:'Changer caméra',
  assist:'Assistance voie',
  autopilot:'Pilote automatique',
  reset:'Replacer sur la route'
};

const GAMEPAD_ACTION_LABELS={
  shiftUpButton:'Rapport +',
  shiftDownButton:'Rapport −',
  handbrakeButton:'Frein à main',
  cameraButton:'Changer caméra',
  assistButton:'Assistance voie',
  autopilotButton:'Pilote automatique',
  resetButton:'Replacer sur la route',
  reverseViewButton:'Vue arrière'
};

const GAMEPAD_BUTTONS=[
  [0,'A'],
  [1,'B'],
  [2,'X'],
  [3,'Y'],
  [4,'LB'],
  [5,'RB'],
  [6,'LT'],
  [7,'RT'],
  [8,'View / Back'],
  [9,'Menu / Start'],
  [10,'L3'],
  [11,'R3'],
  [12,'D-pad haut'],
  [13,'D-pad bas'],
  [14,'D-pad gauche'],
  [15,'D-pad droite']
];

const GAMEPAD_AXES=[
  [0,'Stick gauche X'],
  [1,'Stick gauche Y'],
  [2,'Stick droit X'],
  [3,'Stick droit Y']
];

function prettyKeyCode(code){
  const aliases={
    Space:'Espace',
    ArrowUp:'↑',
    ArrowDown:'↓',
    ArrowLeft:'←',
    ArrowRight:'→',
    BracketLeft:'[',
    BracketRight:']',
    Escape:'Échap'
  };

  if(aliases[code]){
    return aliases[code];
  }

  if(/^Key[A-Z]$/.test(code)){
    return code.slice(3);
  }

  if(/^Digit\d$/.test(code)){
    return code.slice(5);
  }

  return code||'—';
}

function prettyKeyboardBinding(action){
  const codes=
    keyboardCodes(action);

  return codes
    .map(prettyKeyCode)
    .join(' / ');
}

function formatCacheBytes(bytes){
  const value=
    Math.max(
      0,
      Number(bytes)||0
    );

  if(value<1024){
    return `${Math.round(value)} o`;
  }

  if(value<1024*1024){
    return `${(value/1024).toFixed(1)} Ko`;
  }

  if(value<1024*1024*1024){
    return `${(value/1024/1024).toFixed(1)} Mo`;
  }

  return `${(value/1024/1024/1024).toFixed(2)} Go`;
}

function v21SetToggle(
  id,
  enabled,
  {
    on='ON',
    off='OFF'
  }={}
){
  const button=$(id);
  if(!button)return;

  button.textContent=
    enabled
      ?on
      :off;

  button.classList.toggle(
    'on',
    !!enabled
  );
}

function syncV21VehicleInfo(){
  const active=
    vehicleSystem?.active;

  if(!active)return;

  const drivetrain=
    $('v21VehicleDrivetrain');

  const gears=
    $('v21VehicleGears');

  const redline=
    $('v21VehicleRedline');

  const top=
    $('v21VehicleTop');

  if(drivetrain){
    drivetrain.textContent=
      active.physics?.drivetrain||
      '—';
  }

  if(gears){
    gears.textContent=
      active.audio?.type==='combustion'
        ?`${active.audio.gearCount||active.audio.gearRatios?.length||'—'} rapports`
        :'Électrique';
  }

  if(redline){
    redline.textContent=
      active.audio?.type==='combustion'
        ?`${Math.round(active.audio.redlineRpm||0)} RPM`
        :'—';
  }

  if(top){
    top.textContent=
      `${Math.round(vehicleTopSpeedKmh())} km/h`;
  }
}

function applyV21DisplayVisibility(){
  const display=
    appSettings.display||
    DEFAULT_WORLD_SETTINGS.display;

  const dock=
    $('speedometerDock');

  if(dock){
    dock.style.display=
      display.cluster
        ?''
        :'none';

    if(display.cluster){
      dock.classList.add('visible');
    }
  }

  const map=
    $('mapbox');

  if(map){
    map.style.display=
      display.minimap
        ?''
        :'none';
  }

  const compass=
    $('compassWrap');

  if(compass){
    compass.style.display=
      display.compass
        ?''
        :'none';
  }
}

function syncV21RuntimeControls(){
  syncLiveState();
  v21SetToggle(
    'v21AssistToggle',
    !!assist
  );

  v21SetToggle(
    'v21RoadLimitsToggle',
    !!obeyRoadSpeedLimits
  );

  v21SetToggle(
    'v21ImageryToggle',
    !!imageryService?.enabled
  );

  v21SetToggle(
    'v21AudioToggle',
    !!appSettings.audioEnabled
  );

  v21SetToggle(
    'v21ClusterToggle',
    !!appSettings.display?.cluster
  );

  v21SetToggle(
    'v21MinimapToggle',
    !!appSettings.display?.minimap
  );

  v21SetToggle(
    'v21CompassToggle',
    !!appSettings.display?.compass
  );

  const distance=
    $('v21DisplayDistance');

  if(distance){
    distance.value=
      appSettings.displayDistance||
      'high';
  }

  if(transmissionModeSelect){
    transmissionModeSelect.value=
      transmissionMode;
  }

  const autoStatus=
    $('v21AutopilotState');

  if(autoStatus){
    autoStatus.textContent=
      autopilot
        ?'ON'
        :'OFF';
  }

  syncV21VehicleInfo();
  refreshV21KeyboardBindings();
}

async function refreshV21CacheStats(){
  const sizeEl=
    $('v21CacheSize');

  const recordsEl=
    $('v21CacheRecords');

  if(sizeEl){
    sizeEl.textContent='Calcul…';
  }

  try{
    const stats=
      await getWorldCacheStats();

    if(sizeEl){
      sizeEl.textContent=
        formatCacheBytes(
          stats.bytes
        );
    }

    if(recordsEl){
      recordsEl.textContent=
        `${stats.records} éléments`;
    }
  }catch(error){
    console.warn(
      'Cache stats failed',
      error
    );

    if(sizeEl){
      sizeEl.textContent='—';
    }

    if(recordsEl){
      recordsEl.textContent='Indisponible';
    }
  }
}

function refreshV21KeyboardBindings(){
  const container=
    $('v21KeyboardControls');

  if(!container)return;

  for(const button of container.querySelectorAll('[data-keyboard-action]')){
    const action=
      button.dataset.keyboardAction;

    button.textContent=
      prettyKeyboardBinding(
        action
      );
  }
}

function buildV21KeyboardControls(){
  const wrap=
    document.createElement('div');

  wrap.id=
    'v21KeyboardControls';

  wrap.className=
    'v21ControlsGrid';

  for(
    const [action,label]
    of Object.entries(
      KEYBOARD_ACTION_LABELS
    )
  ){
    const name=
      document.createElement('div');

    name.className=
      'v21ControlName';

    name.textContent=
      label;

    const value=
      document.createElement('div');

    value.className=
      'v21ControlValue';

    const button=
      document.createElement('button');

    button.type='button';
    button.className=
      'v21MenuBtn';

    button.dataset.keyboardAction=
      action;

    button.textContent=
      prettyKeyboardBinding(
        action
      );

    button.addEventListener(
      'click',
      ()=>{
        setKeyboardRebindAction(action);

        button.textContent=
          'Appuyez sur une touche…';
      }
    );

    value.appendChild(button);
    wrap.append(name,value);
  }

  return wrap;
}

function gamepadOptionHtml(
  selectedValue,
  {
    allowNone=false
  }={}
){
  const parts=[];

  if(allowNone){
    parts.push(
      `<option value="" ${selectedValue===null?'selected':''}>—</option>`
    );
  }

  for(const [value,label] of GAMEPAD_BUTTONS){
    parts.push(
      `<option value="${value}" ${Number(selectedValue)===value?'selected':''}>${label}</option>`
    );
  }

  return parts.join('');
}

function buildV21GamepadControls(){
  const wrap=
    document.createElement('div');

  wrap.className=
    'v21ControlsGrid';

  const controls=
    appSettings.controls.gamepad;

  const sensitivityName=
    document.createElement('div');

  sensitivityName.className=
    'v21ControlName';

  sensitivityName.textContent=
    'Sensibilité joysticks';

  const sensitivityValue=
    document.createElement('div');

  sensitivityValue.className=
    'v21ControlValue v21JoystickSensitivity';

  const sensitivitySlider=
    document.createElement('input');

  sensitivitySlider.type='range';
  sensitivitySlider.min='50';
  sensitivitySlider.max='200';
  sensitivitySlider.step='5';
  sensitivitySlider.setAttribute(
    'aria-label',
    'Sensibilité des joysticks de la manette'
  );

  const rawSensitivity=
    Number(controls.joystickSensitivity);

  const sensitivity=
    Number.isFinite(rawSensitivity)
      ?Math.max(.5,Math.min(2,rawSensitivity))
      :1;

  sensitivitySlider.value=
    String(Math.round(sensitivity*100));

  const sensitivityLabel=
    document.createElement('span');

  const syncSensitivityLabel=()=>{
    sensitivityLabel.textContent=
      `${sensitivitySlider.value} %`;
  };

  syncSensitivityLabel();

  sensitivitySlider.addEventListener(
    'input',
    ()=>{
      controls.joystickSensitivity=
        Number(sensitivitySlider.value)/100;

      syncSensitivityLabel();
      queueSettingsSave();
    }
  );

  sensitivityValue.append(
    sensitivitySlider,
    sensitivityLabel
  );

  wrap.append(
    sensitivityName,
    sensitivityValue
  );

  const addSelect=(
    label,
    key,
    choices,
    {
      allowNone=false
    }={}
  )=>{
    const name=
      document.createElement('div');

    name.className=
      'v21ControlName';

    name.textContent=label;

    const value=
      document.createElement('div');

    value.className=
      'v21ControlValue';

    const select=
      document.createElement('select');

    select.className=
      'v21MenuSelect';

    if(choices==='buttons'){
      select.innerHTML=
        gamepadOptionHtml(
          controls[key],
          {
            allowNone
          }
        );
    }else{
      select.innerHTML=
        choices
          .map(
            ([index,text])=>
              `<option value="${index}" ${Number(controls[key])===index?'selected':''}>${text}</option>`
          )
          .join('');
    }

    select.addEventListener(
      'change',
      ()=>{
        controls[key]=
          allowNone&&
          select.value===''
            ?null
            :Number(
               select.value
             );

        queueSettingsSave();
      }
    );

    value.appendChild(select);
    wrap.append(name,value);
  };

  addSelect(
    'Direction',
    'steerAxis',
    GAMEPAD_AXES
  );

  addSelect(
    'Caméra horizontale',
    'lookXAxis',
    GAMEPAD_AXES
  );

  addSelect(
    'Caméra verticale',
    'lookYAxis',
    GAMEPAD_AXES
  );

  addSelect(
    'Accélérateur',
    'throttleButton',
    'buttons'
  );

  addSelect(
    'Frein / recul',
    'brakeButton',
    'buttons'
  );

  for(
    const [key,label]
    of Object.entries(
      GAMEPAD_ACTION_LABELS
    )
  ){
    addSelect(
      label,
      key,
      'buttons',
      {
        allowNone:
          key==='assistButton'
      }
    );
  }

  return wrap;
}

function createV21Section(
  title,
  content
){
  const section=
    document.createElement('section');

  section.className='v21Section';

  if(title){
    const heading=
      document.createElement('div');

    heading.className=
      'v21SectionTitle';

    heading.textContent=
      title;

    section.appendChild(
      heading
    );
  }

  if(content){
    section.appendChild(
      content
    );
  }

  return section;
}

function createV21Row(
  label,
  control,
  subtext=''
){
  const row=
    document.createElement('div');

  row.className='v21Row';

  const labelWrap=
    document.createElement('div');

  labelWrap.className=
    'v21Label';

  labelWrap.textContent=
    label;

  if(subtext){
    const small=
      document.createElement('small');

    small.textContent=
      subtext;

    labelWrap.appendChild(
      small
    );
  }

  row.append(
    labelWrap,
    control
  );

  return row;
}

function createV21ToggleButton(
  id,
  handler
){
  const button=
    document.createElement('button');

  button.type='button';
  button.id=id;
  button.className=
    'v21Toggle';

  button.addEventListener(
    'click',
    handler
  );

  return button;
}

function parseV21DesktopMultiplayerTarget(value){
  let raw=String(value||'').trim();
  raw=raw.replace(/^wss?:\/\//i,'');
  raw=raw.split('/')[0].trim();

  const match=raw.match(/^([A-Za-z0-9._-]+)(?::(\d{1,5}))?$/);
  if(!match){
    return null;
  }

  const port=match[2]
    ?Math.max(1,Math.min(65535,Number(match[2])||8081))
    :8081;

  return {
    host:match[1],
    port
  };
}

function waitV21DesktopNetwork(ms=110){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function installV21DesktopMultiplayer(multiplayerPanel){
  const desktop=window.worldDriveDesktop;
  const api=desktop?.multiplayer;

  if(!desktop?.isDesktop||!api||!multiplayerPanel){
    return;
  }

  const wrap=document.createElement('div');
  wrap.className='v21DesktopMp';

  const status=document.createElement('div');
  status.className='v21DesktopMpStatus';
  status.dataset.state='off';
  status.textContent='Aucune session Windows active.';

  const hostActions=document.createElement('div');
  hostActions.className='v21DesktopMpActions';

  const hostButton=document.createElement('button');
  hostButton.type='button';
  hostButton.className='v21MenuBtn';
  hostButton.textContent='Héberger une session';

  const stopButton=document.createElement('button');
  stopButton.type='button';
  stopButton.className='v21MenuBtn danger';
  stopButton.textContent='Arrêter';
  stopButton.disabled=true;

  hostActions.append(hostButton,stopButton);

  const joinWrap=document.createElement('div');
  joinWrap.className='v21DesktopMpJoin';

  const hostInput=document.createElement('input');
  hostInput.type='text';
  hostInput.className='v21DesktopMpInput';
  hostInput.autocomplete='off';
  hostInput.spellcheck=false;
  hostInput.placeholder='IP du PC hôte, ex. 192.168.1.42';
  hostInput.value=localStorage.getItem('worlddrive_windows_mp_host')||'';

  const joinButton=document.createElement('button');
  joinButton.type='button';
  joinButton.className='v21MenuBtn';
  joinButton.textContent='Se connecter';

  joinWrap.append(hostInput,joinButton);

  const hint=document.createElement('div');
  hint.className='v21DesktopMpHint';
  hint.textContent='LAN Windows · port 8081 par défaut. Autorise World Drive dans le pare-feu Windows si demandé.';

  wrap.append(hostActions,joinWrap,status,hint);

  multiplayerPanel.appendChild(
    createV21Section(
      'Session Windows',
      wrap
    )
  );

  let busy=false;

  function setBusy(value){
    busy=!!value;
    hostButton.disabled=busy;
    joinButton.disabled=busy;
    hostInput.disabled=busy;
    if(busy)stopButton.disabled=true;
  }

  function applyStatus(result){
    const state=result||{};
    stopButton.disabled=busy||state.mode==='off'||!state.mode;

    if(state.mode==='host'){
      const addresses=(state.lanUrls||[]).slice(0,3);
      const addressText=addresses.length
        ?addresses.join(' · ')
        :(state.localUrl||'ws://127.0.0.1:8081');
      status.dataset.state='on';
      status.textContent=`Session hébergée · ${addressText} · donne une de ces adresses aux autres joueurs.`;
      return;
    }

    if(state.mode==='join'){
      const remote=state.remoteHost
        ?`${state.remoteHost}:${state.remotePort||8081}`
        :'hôte LAN';
      status.dataset.state='on';
      status.textContent=`Connexion Windows prête · ${remote}. Le jeu passe par le relais local ${state.localUrl||'ws://127.0.0.1:8081'}.`;
      return;
    }

    if(state.error){
      status.dataset.state='error';
      status.textContent=`Erreur réseau · ${state.error}`;
      return;
    }

    status.dataset.state='off';
    status.textContent='Aucune session Windows active.';
  }

  async function resetGameClient(){
    try{
      multiplayer.disconnect();
    }catch{}
    await waitV21DesktopNetwork();
  }

  hostButton.addEventListener('click',async()=>{
    if(busy)return;
    setBusy(true);
    status.dataset.state='off';
    status.textContent='Démarrage de la session LAN…';

    try{
      await resetGameClient();
      const result=await api.host({port:8081});
      applyStatus(result);

      if(!result?.ok||result.mode!=='host'){
        toast(result?.error||'Impossible de démarrer la session multijoueur');
        return;
      }

      await waitV21DesktopNetwork(140);
      multiplayer.connect();
      toast('Session multijoueur hébergée');
    }catch(error){
      applyStatus({error:error?.message||String(error)});
      toast('Impossible de démarrer la session multijoueur');
    }finally{
      setBusy(false);
      try{
        applyStatus(await api.status());
      }catch{}
    }
  });

  joinButton.addEventListener('click',async()=>{
    if(busy)return;

    const target=parseV21DesktopMultiplayerTarget(hostInput.value);
    if(!target){
      status.dataset.state='error';
      status.textContent='Adresse invalide. Exemple : 192.168.1.42 ou PC-SALON:8081';
      return;
    }

    localStorage.setItem('worlddrive_windows_mp_host',hostInput.value.trim());
    setBusy(true);
    status.dataset.state='off';
    status.textContent=`Préparation de la connexion vers ${target.host}:${target.port}…`;

    try{
      await resetGameClient();
      const result=await api.join({
        host:target.host,
        port:target.port,
        localPort:8081
      });
      applyStatus(result);

      if(!result?.ok||result.mode!=='join'){
        toast(result?.error||'Impossible de joindre la session multijoueur');
        return;
      }

      await waitV21DesktopNetwork(140);
      multiplayer.connect();
      toast(`Connexion à ${target.host}:${target.port}`);
    }catch(error){
      applyStatus({error:error?.message||String(error)});
      toast('Impossible de joindre la session multijoueur');
    }finally{
      setBusy(false);
      try{
        applyStatus(await api.status());
      }catch{}
    }
  });

  hostInput.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      joinButton.click();
    }
  });

  stopButton.addEventListener('click',async()=>{
    if(busy)return;
    setBusy(true);

    try{
      await resetGameClient();
      applyStatus(await api.stop());
      toast('Session multijoueur arrêtée');
    }catch(error){
      applyStatus({error:error?.message||String(error)});
    }finally{
      setBusy(false);
      try{
        applyStatus(await api.status());
      }catch{}
    }
  });

  api.status()
    .then(async result=>{
      applyStatus(result);
      if(result?.mode==='host'||result?.mode==='join'){
        await waitV21DesktopNetwork(160);
        if(!multiplayer.isConnected())multiplayer.connect();
      }
    })
    .catch(()=>{});
}

function setV21MenuOpen(open){
  v21MenuOpen=
    !!open;
  onMenuOpenChange?.(v21MenuOpen);

  if(v21MenuEl){
    v21MenuEl.classList.toggle(
      'open',
      v21MenuOpen
    );
  }

  if(v21MenuButton){
    v21MenuButton.textContent=
      '☰ MENU';

    v21MenuButton.classList.toggle(
      'hidden',
      v21MenuOpen
    );

    v21MenuButton.setAttribute(
      'aria-hidden',
      v21MenuOpen
        ?'true'
        :'false'
    );
  }

  if(v21MenuOpen){
    clearKeyboardState();
    refreshV21CacheStats();
    syncV21RuntimeControls();
  }
}

function activateV21Tab(name){
  if(!v21MenuEl)return;

  for(const tab of v21MenuEl.querySelectorAll('.v21Tab')){
    tab.classList.toggle(
      'active',
      tab.dataset.tab===name
    );
  }

  for(const panel of v21MenuEl.querySelectorAll('.v21Panel')){
    panel.classList.toggle(
      'active',
      panel.dataset.panel===name
    );
  }

  const title=
    v21MenuEl.querySelector(
      '#v21MenuTitle'
    );

  const activeTab=
    v21MenuEl.querySelector(
      `.v21Tab[data-tab="${name}"]`
    );

  if(
    title&&
    activeTab
  ){
    title.textContent=
      activeTab.dataset.title||
      activeTab.textContent.trim();
  }
}

function installV21Menu(){
  if(v21MenuEl)return;  const oldHud=
    $('hud');

  if(oldHud){
    oldHud.style.display='none';
  }

  const oldHelp=
    $('help');

  if(oldHelp){
    oldHelp.style.display='none';
  }

  const oldShowControls=
    $('showControlsBtn');

  if(oldShowControls){
    oldShowControls.style.display='none';
  }

  v21MenuButton=
    document.createElement('button');

  v21MenuButton.id=
    'v21MenuButton';

  v21MenuButton.type='button';
  v21MenuButton.textContent=
    '☰ MENU';

  v21MenuButton.addEventListener(
    'click',
    ()=>{
      setV21MenuOpen(
        !v21MenuOpen
      );
    }
  );

  document.body.appendChild(
    v21MenuButton
  );

  v21MenuEl=
    document.createElement('div');

  v21MenuEl.id=
    'v21Menu';

  v21MenuEl.innerHTML=`
    <div id="v21MenuPanel">
      <nav class="v21MenuNav">
        <div class="v21Brand">
          <strong>WORLD DRIVE</strong>
          <span>${WORLD_DRIVE_VERSION_LABEL.toUpperCase()}</span>
        </div>

        <button class="v21Tab active" data-tab="vehicle" data-title="Véhicule">🚗 Véhicule</button>
        <button class="v21Tab" data-tab="world" data-title="Carte & monde">🗺️ Carte & monde</button>
        <button class="v21Tab" data-tab="route" data-title="Trajet">🧭 Trajet</button>
        <button class="v21Tab" data-tab="driving" data-title="Conduite">🎮 Conduite</button>
        <button class="v21Tab" data-tab="audio" data-title="Audio & affichage">🔊 Audio & affichage</button>
        <button class="v21Tab" data-tab="multiplayer" data-title="Multijoueur">👥 Multijoueur</button>
        <button class="v21Tab" data-tab="advanced" data-title="Avancé">⚙️ Avancé</button>
      </nav>

      <div class="v21MenuMain">
        <header class="v21MenuTop">
          <h2 id="v21MenuTitle">Véhicule</h2>
          <button id="v21MenuClose" type="button" aria-label="Fermer le menu">×</button>
        </header>

        <div class="v21Panel active" data-panel="vehicle"></div>
        <div class="v21Panel" data-panel="world"></div>
        <div class="v21Panel" data-panel="route"></div>
        <div class="v21Panel" data-panel="driving"></div>
        <div class="v21Panel" data-panel="audio"></div>
        <div class="v21Panel" data-panel="multiplayer"></div>
        <div class="v21Panel" data-panel="advanced"></div>
      </div>
    </div>
  `;

  document.body.appendChild(
    v21MenuEl
  );

  v21MenuEl
    .querySelectorAll(
      '.v21Tab'
    )
    .forEach(
      tab=>
        tab.addEventListener(
          'click',
          ()=>activateV21Tab(
            tab.dataset.tab
          )
        )
    );

  $('v21MenuClose')
    ?.addEventListener(
      'click',
      ()=>setV21MenuOpen(false)
    );

  v21MenuEl.addEventListener(
    'click',
    event=>{
      if(event.target===v21MenuEl){
        setV21MenuOpen(false);
      }
    }
  );

  addEventListener(
    'keydown',
    event=>{
      if(
        event.code==='Escape'&&
        v21MenuOpen&&
        !getKeyboardRebindAction()
      ){
        setV21MenuOpen(false);
      }
    }
  );

  const vehiclePanel=
    v21MenuEl.querySelector(
      '[data-panel="vehicle"]'
    );

  const vehicleControls=
    document.createElement('div');

  if(vehicleSelect){
    vehicleSelect.classList.add(
      'v21MenuSelect'
    );

    vehicleControls.appendChild(
      createV21Row(
        'Modèle',
        vehicleSelect
      )
    );
  }

  if(transmissionModeSelect){
    transmissionModeSelect.classList.add(
      'v21MenuSelect'
    );

    vehicleControls.appendChild(
      createV21Row(
        'Transmission',
        transmissionModeSelect
      )
    );
  }

  vehiclePanel.appendChild(
    createV21Section(
      'Véhicule',
      vehicleControls
    )
  );

  const vehicleInfo=
    document.createElement('div');

  vehicleInfo.className=
    'v21InfoGrid';

  vehicleInfo.innerHTML=`
    <div class="v21InfoCard">
      <span>Transmission</span>
      <b id="v21VehicleDrivetrain">—</b>
    </div>
    <div class="v21InfoCard">
      <span>Boîte</span>
      <b id="v21VehicleGears">—</b>
    </div>
    <div class="v21InfoCard">
      <span>Redline</span>
      <b id="v21VehicleRedline">—</b>
    </div>
    <div class="v21InfoCard">
      <span>Vitesse mécanique</span>
      <b id="v21VehicleTop">—</b>
    </div>
  `;

  vehiclePanel.appendChild(
    createV21Section(
      'Informations',
      vehicleInfo
    )
  );

  const vehicleActions=
    document.createElement('div');

  const resetVehicleButton=
    document.createElement('button');

  resetVehicleButton.type='button';
  resetVehicleButton.className=
    'v21MenuBtn';
  resetVehicleButton.textContent=
    'Replacer sur la route';
  resetVehicleButton.addEventListener(
    'click',
    ()=>resetToRoad()
  );

  vehicleActions.appendChild(
    resetVehicleButton
  );

  vehiclePanel.appendChild(
    createV21Section(
      '',
      vehicleActions
    )
  );

  // Map & world
  const worldPanel=
    v21MenuEl.querySelector(
      '[data-panel="world"]'
    );

  const worldControls=
    document.createElement('div');

  const imageryToggle=
    createV21ToggleButton(
      'v21ImageryToggle',
      ()=>{
        const enabled=
          imageryService.toggle();

        appSettings.imageryEnabled=
          enabled;

        queueSettingsSave();
        syncV21RuntimeControls();
      }
    );

  worldControls.appendChild(
    createV21Row(
      'Photo / imagerie',
      imageryToggle
    )
  );

  const distanceSelect=
    document.createElement('select');

  distanceSelect.id=
    'v21DisplayDistance';

  distanceSelect.className=
    'v21MenuSelect';

  distanceSelect.innerHTML=`
    <option value="low">Basse</option>
    <option value="medium">Moyenne</option>
    <option value="high">Haute</option>
  `;

  distanceSelect.addEventListener(
    'change',
    ()=>{
      applyDisplayDistanceProfile(
        distanceSelect.value,
        {
          save:true
        }
      );
    }
  );

  worldControls.appendChild(
    createV21Row(
      'Distance d’affichage',
      distanceSelect,
      'Haute par défaut'
    )
  );

  if(timeSlider){
    timeSlider.style.width='170px';

    const timeWrap=
      document.createElement('div');

    timeWrap.style.display='flex';
    timeWrap.style.alignItems='center';
    timeWrap.style.gap='8px';

    timeWrap.append(
      timeSlider,
      timeLabel
    );

    worldControls.appendChild(
      createV21Row(
        'Heure',
        timeWrap
      )
    );
  }

  worldPanel.appendChild(
    createV21Section(
      'Monde',
      worldControls
    )
  );

  const cacheWrap=
    document.createElement('div');

  cacheWrap.innerHTML=`
    <div class="v21InfoGrid">
      <div class="v21InfoCard">
        <span>Taille cache</span>
        <b id="v21CacheSize">Calcul…</b>
      </div>
      <div class="v21InfoCard">
        <span>Entrées persistantes</span>
        <b id="v21CacheRecords">—</b>
      </div>
    </div>
  `;

  const clearButton=
    document.createElement('button');

  clearButton.type='button';
  clearButton.className=
    'v21MenuBtn danger';

  clearButton.style.marginTop='10px';
  clearButton.textContent=
    'Vider la cache';

  clearButton.addEventListener(
    'click',
    async()=>{
      const confirmed=
        window.confirm(
          'Vider toute la cache et réinitialiser tous les réglages V21 ?'
        );

      if(!confirmed)return;

      clearButton.disabled=true;
      clearButton.textContent=
        'Vidage…';

      try{
        await clearWorldDriveCache();

        location.reload();
      }catch(error){
        console.warn(
          'Full cache clear failed',
          error
        );

        clearButton.disabled=false;
        clearButton.textContent=
          'Vider la cache';

        toast(
          'Impossible de vider la cache'
        );
      }
    }
  );

  cacheWrap.appendChild(
    clearButton
  );

  worldPanel.appendChild(
    createV21Section(
      'Cache',
      cacheWrap
    )
  );

  // Route
  const routePanel=
    v21MenuEl.querySelector(
      '[data-panel="route"]'
    );

  const planner=
    $('plannerBox');

  if(planner){
    routePanel.appendChild(
      createV21Section(
        'Planifier',
        planner
      )
    );
  }

  const jump=
    $('jumpBox');

  if(jump){
    routePanel.appendChild(
      createV21Section(
        'Progression',
        jump
      )
    );
  }

  // Driving
  const drivingPanel=
    v21MenuEl.querySelector(
      '[data-panel="driving"]'
    );

  const drivingControls=
    document.createElement('div');

  const assistToggle=
    createV21ToggleButton(
      'v21AssistToggle',
      ()=>toggleAssist()
    );

  drivingControls.appendChild(
    createV21Row(
      'Assistance voie',
      assistToggle
    )
  );

  const autoButton=
    document.createElement('button');

  autoButton.type='button';
  autoButton.className=
    'v21MenuBtn';
  autoButton.innerHTML=
    'Pilote auto · <span id="v21AutopilotState">OFF</span>';

  autoButton.addEventListener(
    'click',
    ()=>{
      toggleAutopilot();
      syncV21RuntimeControls();
    }
  );

  drivingControls.appendChild(
    createV21Row(
      'Pilote automatique',
      autoButton
    )
  );

  const roadLimitToggle=
    createV21ToggleButton(
      'v21RoadLimitsToggle',
      ()=>toggleRoadSpeedLimits()
    );

  drivingControls.appendChild(
    createV21Row(
      'Respect limites OSM',
      roadLimitToggle
    )
  );

  const cameraButton=
    document.createElement('button');

  cameraButton.type='button';
  cameraButton.className=
    'v21MenuBtn';
  cameraButton.textContent=
    'Changer caméra';
  cameraButton.addEventListener(
    'click',
    ()=>cameraController.cycle()
  );

  drivingControls.appendChild(
    createV21Row(
      'Caméra',
      cameraButton
    )
  );

  drivingPanel.appendChild(
    createV21Section(
      'Conduite',
      drivingControls
    )
  );

  const keyboardDetails=
    document.createElement('details');

  keyboardDetails.className=
    'v21Section';

  keyboardDetails.innerHTML=
    '<summary class="v21SectionTitle" style="cursor:pointer;margin:0">Clavier · configurer</summary>';

  keyboardDetails.appendChild(
    buildV21KeyboardControls()
  );

  const keyboardReset=
    document.createElement('button');

  keyboardReset.type='button';
  keyboardReset.className=
    'v21MenuBtn';
  keyboardReset.style.marginTop='10px';
  keyboardReset.textContent=
    'Réinitialiser clavier';

  keyboardReset.addEventListener(
    'click',
    ()=>{
      appSettings.controls.keyboard=
        cloneDefaultControls()
          .keyboard;

      queueSettingsSave();
      refreshV21KeyboardBindings();
    }
  );

  keyboardDetails.appendChild(
    keyboardReset
  );

  drivingPanel.appendChild(
    keyboardDetails
  );

  const gamepadDetails=
    document.createElement('details');

  gamepadDetails.className=
    'v21Section';

  gamepadDetails.innerHTML=
    '<summary class="v21SectionTitle" style="cursor:pointer;margin:0">Manette · configurer</summary>';

  gamepadDetails.appendChild(
    buildV21GamepadControls()
  );

  const gamepadReset=
    document.createElement('button');

  gamepadReset.type='button';
  gamepadReset.className=
    'v21MenuBtn';
  gamepadReset.style.marginTop='10px';
  gamepadReset.textContent=
    'Réinitialiser manette';

  gamepadReset.addEventListener(
    'click',
    ()=>{
      appSettings.controls.gamepad=
        cloneDefaultControls()
          .gamepad;

      queueSettingsSave();

      // Rebuild the editable list so all selects show their defaults.
      const fresh=
        buildV21GamepadControls();

      const current=
        gamepadDetails.querySelector(
          '.v21ControlsGrid'
        );

      current?.replaceWith(
        fresh
      );
    }
  );

  gamepadDetails.appendChild(
    gamepadReset
  );

  drivingPanel.appendChild(
    gamepadDetails
  );

  // Audio & display
  const audioPanel=
    v21MenuEl.querySelector(
      '[data-panel="audio"]'
    );

  const audioControls=
    document.createElement('div');

  const audioToggle=
    createV21ToggleButton(
      'v21AudioToggle',
      async()=>{
        const next=
          !appSettings.audioEnabled;

        appSettings.audioEnabled=
          next;

        queueSettingsSave();

        try{
          await vehicleAudio.setEnabled(
            next
          );
        }catch(error){
          console.warn(
            'Audio setting failed',
            error
          );
        }

        syncV21RuntimeControls();
      }
    );

  audioControls.appendChild(
    createV21Row(
      'Audio',
      audioToggle,
      'ON par défaut'
    )
  );

  const clusterToggle=
    createV21ToggleButton(
      'v21ClusterToggle',
      ()=>{
        appSettings.display.cluster=
          !appSettings.display.cluster;

        queueSettingsSave();
        applyV21DisplayVisibility();
        syncV21RuntimeControls();
      }
    );

  audioControls.appendChild(
    createV21Row(
      'Compteurs',
      clusterToggle
    )
  );

  const minimapToggle=
    createV21ToggleButton(
      'v21MinimapToggle',
      ()=>{
        appSettings.display.minimap=
          !appSettings.display.minimap;

        queueSettingsSave();
        applyV21DisplayVisibility();
        syncV21RuntimeControls();
      }
    );

  audioControls.appendChild(
    createV21Row(
      'Mini-carte',
      minimapToggle
    )
  );

  const compassToggle=
    createV21ToggleButton(
      'v21CompassToggle',
      ()=>{
        appSettings.display.compass=
          !appSettings.display.compass;

        queueSettingsSave();
        applyV21DisplayVisibility();
        syncV21RuntimeControls();
      }
    );

  audioControls.appendChild(
    createV21Row(
      'Boussole',
      compassToggle
    )
  );

  audioPanel.appendChild(
    createV21Section(
      'Audio & affichage',
      audioControls
    )
  );

  // Multiplayer
  const multiplayerPanel=
    v21MenuEl.querySelector(
      '[data-panel="multiplayer"]'
    );

  const multiplayerBox=
    document.querySelector(
      '.multiplayerBox'
    );

  installV21DesktopMultiplayer(
    multiplayerPanel
  );

  if(multiplayerBox){
    multiplayerPanel.appendChild(
      createV21Section(
        'Multijoueur LAN',
        multiplayerBox
      )
    );
  }

  // Advanced live status
  const advancedPanel=
    v21MenuEl.querySelector(
      '[data-panel="advanced"]'
    );

  const advanced=
    document.createElement('div');

  const statusSources=[
    ['Relief','elevStatus'],
    ['Hydrographie','waterStatus'],
    ['Ponts OSM','bridgeStatus'],
    ['Décor réel','sceneryStatus'],
    ['Imagerie','imageryStatus'],
    ['Routage','routingStatus'],
    ['Route active','roadTypeStatus'],
    ['Surface','roadSurfaceStatus'],
    ['Limite OSM','osmSpeedStatus'],
    ['Panneaux OSM','signStatus'],
    ['Manette','gamepadStatus'],
    ['Audio','audioStatus']
  ];

  for(const [label,id] of statusSources){
    const row=
      document.createElement('div');

    row.className=
      'v21StatusLine';

    row.innerHTML=`
      <span>${label}</span>
      <b data-v21-status-source="${id}">—</b>
    `;

    advanced.appendChild(row);
  }

  advancedPanel.appendChild(
    createV21Section(
      'État des sous-systèmes',
      advanced
    )
  );

  const statusTimer=
    setInterval(
      ()=>{
        if(
          !v21MenuOpen||
          !v21MenuEl
        ){
          return;
        }

        v21MenuEl
          .querySelectorAll(
            '[data-v21-status-source]'
          )
          .forEach(
            target=>{
              const source=$(
                target.dataset.v21StatusSource
              );

              target.textContent=
                source?.textContent?.trim()||
                '—';
            }
          );
      },
      500
    );

  v21MenuEl.dataset.statusTimer=
    String(statusTimer);

  addEventListener(
    'worlddrive-keyboard-rebound',
    ()=>refreshV21KeyboardBindings()
  );

  addEventListener(
    'worlddrive-keyboard-rebind-cancel',
    ()=>refreshV21KeyboardBindings()
  );

  syncV21RuntimeControls();
  syncV21VehicleInfo();
  applyV21DisplayVisibility();
}


  return Object.freeze({
    install:installV21Menu,
    syncRuntimeControls:syncV21RuntimeControls,
    syncVehicleInfo:syncV21VehicleInfo,
    applyDisplayVisibility:applyV21DisplayVisibility,
    setOpen:setV21MenuOpen,
    isOpen:()=>v21MenuOpen,
    showButton(){if(v21MenuButton)v21MenuButton.style.display='block';},
    hideButton(){if(v21MenuButton)v21MenuButton.style.display='none';}
  });
}

