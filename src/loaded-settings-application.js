// Applies already-loaded application settings to live runtime/UI state.
// Persistence and settings identity remain owned by application-settings.js.
export function createLoadedSettingsApplication({
  settings,
  setTransmissionMode,
  setAssist,
  setObeyRoadSpeedLimits,
  updateSpeedLimitModeUI,
  isImageryEnabled,
  toggleImagery,
  applyDisplayDistanceProfile,
  applyDisplayVisibility,
  getAssistStatusEl=()=>null,
  getTransmissionModeSelect=()=>null,
  syncRuntimeControls
}){
  if(!settings||typeof settings!=='object'){
    throw new TypeError('loaded settings application requires settings');
  }

  async function apply(){
    const transmissionMode=
      settings.transmissionMode==='manual'
        ?'manual'
        :'automatic';
    const assist=settings.assist!==false;
    const obeyRoadSpeedLimits=settings.obeyRoadSpeedLimits!==false;

    setTransmissionMode(transmissionMode);
    setAssist(assist);
    setObeyRoadSpeedLimits(obeyRoadSpeedLimits);

    updateSpeedLimitModeUI();

    const imageryEnabled=!!settings.imageryEnabled;
    if(isImageryEnabled()!==imageryEnabled){
      toggleImagery();
    }

    applyDisplayDistanceProfile(
      settings.displayDistance||'high'
    );

    applyDisplayVisibility();

    const assistStatusEl=getAssistStatusEl();
    if(assistStatusEl){
      assistStatusEl.textContent=
        'Assist: '+(assist?'ON':'OFF');
    }

    const transmissionModeSelect=getTransmissionModeSelect();
    if(transmissionModeSelect){
      transmissionModeSelect.value=transmissionMode;
    }

    syncRuntimeControls();
  }

  return {apply};
}
