// World Drive V21.25 — keyboard input controller.
// Owns key state and rebinding events; gameplay actions remain callbacks into main.js.

export function createKeyboardControls({
  appSettings,
  defaults,
  queueSettingsSave,
  getKeyboardRebindAction,
  setKeyboardRebindAction,
  getRuntimeState,
  onShiftUp,
  onShiftDown,
  onCycleCamera,
  onToggleAssist,
  onToggleAutopilot,
  onResetToRoad,
  onManualTakeover
}){
  if(!appSettings||!defaults)throw new Error('keyboard controls require settings');
  if(typeof getRuntimeState!=='function')throw new Error('keyboard controls require runtime state');
  if(typeof getKeyboardRebindAction!=='function'||typeof setKeyboardRebindAction!=='function')throw new Error('keyboard controls require rebind accessors');

  const keys={};

  function codes(action){
    const configured=appSettings?.controls?.keyboard?.[action];
    const fallback=defaults?.controls?.keyboard?.[action]||[];
    return Array.isArray(configured)&&configured.length?configured:fallback;
  }

  function actionDown(action){
    return codes(action).some(code=>!!keys[code]);
  }

  function actionMatches(action,code){
    return codes(action).includes(code);
  }

  function clearState(){
    for(const key of Object.keys(keys))delete keys[key];
  }

  function assignBinding(action,code){
    const controls=appSettings.controls.keyboard;
    for(const otherAction of Object.keys(controls)){
      if(otherAction===action)continue;
      controls[otherAction]=(controls[otherAction]||[]).filter(existing=>existing!==code);
    }
    controls[action]=[code];
    queueSettingsSave?.();
  }

  function keydown(e){
    const rebindAction=getKeyboardRebindAction();
    if(rebindAction){
      e.preventDefault();
      e.stopPropagation();
      if(e.code==='Escape'){
        setKeyboardRebindAction(null);
        window.dispatchEvent(new CustomEvent('worlddrive-keyboard-rebind-cancel'));
        return;
      }
      setKeyboardRebindAction(null);
      assignBinding(rebindAction,e.code);
      window.dispatchEvent(new CustomEvent('worlddrive-keyboard-rebound',{detail:{action:rebindAction,code:e.code}}));
      return;
    }

    const state=getRuntimeState()||{};
    const inputTag=String(e.target?.tagName||'').toUpperCase();
    if(
      !state.gameStarted||
      state.menuOpen||
      inputTag==='INPUT'||inputTag==='TEXTAREA'||inputTag==='SELECT'||
      e.target?.isContentEditable
    )return;

    keys[e.code]=true;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','BracketLeft','BracketRight'].includes(e.code))e.preventDefault();

    if(!e.repeat&&actionMatches('shiftUp',e.code))onShiftUp?.();
    if(!e.repeat&&actionMatches('shiftDown',e.code))onShiftDown?.();
    if(!e.repeat&&actionMatches('camera',e.code))onCycleCamera?.();
    if(!e.repeat&&actionMatches('assist',e.code))onToggleAssist?.();
    if(!e.repeat&&actionMatches('autopilot',e.code))onToggleAutopilot?.();
    if(!e.repeat&&actionMatches('reset',e.code))onResetToRoad?.();

    if(
      state.autopilot&&(
        actionMatches('steerLeft',e.code)||
        actionMatches('steerRight',e.code)||
        actionMatches('brake',e.code)||
        actionMatches('handbrake',e.code)
      )
    )onManualTakeover?.();
  }

  function keyup(e){
    keys[e.code]=false;
  }

  addEventListener('keydown',keydown);
  addEventListener('keyup',keyup);

  return Object.freeze({
    codes,
    actionDown,
    actionMatches,
    clearState,
    dispose(){
      removeEventListener('keydown',keydown);
      removeEventListener('keyup',keyup);
      clearState();
    }
  });
}
