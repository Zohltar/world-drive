// World Drive - gamepad subsystem
// GuliKit / Xbox-compatible controller mapping extracted from main.js.

export function createGamepadController({
  statusEl,
  audio,
  toast,
  onCycleCamera,
  onToggleAssist,
  onToggleAutopilot,
  onResetToRoad,
  isAutopilotEnabled,
  disableAutopilot
}) {
  const state={
    connected:false,
    id:'',
    steer:0,
    lookX:0,
    lookY:0,
    throttle:0,
    brake:0,
    hand:false,
    prevButtons:[],
    activeIndex:null,
    lastInputAt:0
  };

  function setStatus(text){
    if(statusEl)statusEl.textContent=text;
  }

  function deadzone(v,dz=.10){
    const a=Math.abs(v);
    if(a<=dz)return 0;
    return Math.sign(v)*(a-dz)/(1-dz);
  }

  function button(gp,i){
    return !!gp?.buttons?.[i]?.pressed;
  }

  function buttonValue(gp,i){
    return Number(gp?.buttons?.[i]?.value)||0;
  }

  function pressedEdge(gp,i){
    const now=button(gp,i);
    const prev=!!state.prevButtons[i];
    state.prevButtons[i]=now;
    return now&&!prev;
  }

  function axisTrigger(v){
    if(!Number.isFinite(v))return 0;
    return Math.max(0,Math.min(1,(v+1)/2));
  }

  function activity(gp){
    let score=0;
    for(const a of gp.axes||[])score=Math.max(score,Math.abs(a||0));
    for(const b of gp.buttons||[])score=Math.max(score,b?.value||0);
    return score;
  }

  function choose(){
    if(!navigator.getGamepads)return null;
    const pads=[...navigator.getGamepads()].filter(Boolean);
    if(!pads.length)return null;

    // Keep the controller the player is already using.
    const active=pads.find(p=>p.index===state.activeIndex);
    if(active)return active;

    // Otherwise prefer whichever controller is producing actual input.
    const used=pads.slice().sort((a,b)=>activity(b)-activity(a))[0];
    if(activity(used)>.08){
      state.activeIndex=used.index;
      return used;
    }

    // Windows may retain paired Xbox controllers while the GuliKit is active.
    return pads.find(p=>/gulikit|controller xw/i.test(p.id||'')) ||
           pads.find(p=>p.mapping==='standard') ||
           pads[0];
  }

  function clearState(){
    state.connected=false;
    state.activeIndex=null;
    state.steer=0;
    state.lookX=0;
    state.lookY=0;
    state.throttle=0;
    state.brake=0;
    state.hand=false;
    state.prevButtons=[];
  }

  function update(){
    if(!navigator.getGamepads){
      setStatus('Non supportée');
      clearState();
      return;
    }

    const gp=choose();
    if(!gp){
      clearState();
      setStatus('—');
      return;
    }

    const inputActivity=activity(gp);
    if(inputActivity>.08){
      state.activeIndex=gp.index;
      state.lastInputAt=performance.now();
    }

    state.connected=true;
    state.id=gp.id||'Gamepad';

    const shortId=/gulikit/i.test(state.id)
      ?'GuliKit XW'
      :(gp.mapping==='standard'?'Gamepad standard':'Gamepad');
    setStatus(shortId);

    // Standard Xbox/GuliKit XInput mapping.
    state.steer=deadzone(Number(gp.axes?.[0])||0);
    state.lookX=deadzone(Number(gp.axes?.[2])||0,.12);
    state.lookY=deadzone(Number(gp.axes?.[3])||0,.12);

    let lt=buttonValue(gp,6);
    let rt=buttonValue(gp,7);

    // HID/DInput fallbacks only. In standard/XInput mode, axes 2/3 belong to
    // the right stick and must never be reused as trigger axes.
    if(lt<.01&&rt<.01&&gp.mapping!=='standard'&&(gp.axes?.length||0)>=6){
      lt=axisTrigger(Number(gp.axes[4]));
      rt=axisTrigger(Number(gp.axes[5]));
    }

    if(lt<.01&&rt<.01&&gp.mapping!=='standard'&&(gp.axes?.length||0)>=3){
      const t=Number(gp.axes[2])||0;
      if(Math.abs(t)>.08){
        if(t<0)lt=Math.min(1,-t);
        else rt=Math.min(1,t);
      }
    }

    state.brake=Math.max(0,Math.min(1,lt));
    state.throttle=Math.max(0,Math.min(1,rt));
    state.hand=button(gp,0); // A

    if(audio&&!audio.isRunning())audio.showActivationHint();

    if(pressedEdge(gp,3))onCycleCamera?.();       // Y
    if(pressedEdge(gp,2))onToggleAssist?.();      // X
    if(pressedEdge(gp,1))onToggleAutopilot?.();   // B
    if(pressedEdge(gp,9))onResetToRoad?.();       // Menu / Start

    if(
      isAutopilotEnabled?.() &&
      (Math.abs(state.steer)>.14||state.brake>.08||state.hand)
    ){
      disableAutopilot?.('Reprise manuelle — manette');
    }
  }

  function onConnected(e){
    if(/gulikit|controller xw/i.test(e.gamepad?.id||'')){
      state.activeIndex=e.gamepad.index;
    }
    setStatus(/gulikit/i.test(e.gamepad?.id||'')?'GuliKit XW':'Détectée');
    toast?.('Manette détectée — appuie sur un bouton');
  }

  function onDisconnected(e){
    if(state.activeIndex===e.gamepad?.index)state.activeIndex=null;
    state.connected=false;
    setStatus('—');
    toast?.('Manette déconnectée');
  }

  addEventListener('gamepadconnected',onConnected);
  addEventListener('gamepaddisconnected',onDisconnected);

  return {
    state,
    update
  };
}
