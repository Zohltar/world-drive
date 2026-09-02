// Route timer for the trip-map panel.
// Physics remains authoritative in main.js; this module only observes speed
// and route progress to start/stop the elapsed timer.

const $=id=>document.getElementById(id);

export function createRouteChallenge({
  getSpeed,
  getRouteLength,
  toast
}){
  // The old "Défi parcours" subsection is legacy UI. The only remaining
  // useful feature is the elapsed timer now shown directly in routeMapInfo.
  // Remove the obsolete block from the live DOM so it cannot reserve space,
  // reappear through old CSS, or interfere with the rebuilt map panel.
  $('challengeSubsection')?.remove();

  const state={
    running:false,
    finished:false,
    startedAt:0,
    finishedAt:0
  };

  function formatRunTime(ms){
    const safe=Math.max(0,ms||0);
    const totalTenths=Math.floor(safe/100);
    const tenths=totalTenths%10;
    const totalSeconds=Math.floor(totalTenths/10);
    const seconds=totalSeconds%60;
    const minutes=Math.floor(totalSeconds/60);

    return (
      String(minutes).padStart(2,'0')+
      ':'+
      String(seconds).padStart(2,'0')+
      '.'+
      tenths
    );
  }

  function elapsedMs(now=performance.now()){
    if(!state.running&&!state.finished)return 0;
    const end=state.finished?state.finishedAt:now;
    return Math.max(0,end-state.startedAt);
  }

  let nextHudAt=0;
  function updateHUD(now=performance.now(),force=false){
    if(!force&&now<nextHudAt)return;
    nextHudAt=now+100;
    const timeEl=$('routeMapTime');
    if(timeEl)timeEl.textContent=formatRunTime(elapsedMs(now));
  }

  function reset(){
    state.running=false;
    state.finished=false;
    state.startedAt=0;
    state.finishedAt=0;
    updateHUD(performance.now(),true);
  }

  function start(now){
    if(state.running||state.finished)return;
    state.running=true;
    state.startedAt=now;
    updateHUD(now,true);
  }

  function finish(now){
    if(!state.running)return;
    state.running=false;
    state.finished=true;
    state.finishedAt=now;
    updateHUD(now,true);
    toast?.('Parcours terminé · '+formatRunTime(elapsedMs(now)));
  }

  function update(onRoad,nearestRoute){
    void onRoad;
    const now=performance.now();
    const speedKmh=Math.abs(Number(getSpeed?.())||0)*3.6;
    const routeLength=Math.max(0,Number(getRouteLength?.())||0);

    if(!state.running&&!state.finished&&speedKmh>.8){
      start(now);
    }

    if(
      state.running&&
      nearestRoute&&
      routeLength>0&&
      nearestRoute.cum>=routeLength-12
    ){
      finish(now);
    }

    updateHUD(now);
  }

  updateHUD(performance.now(),true);

  return {
    reset,
    update,
    getState:()=>({...state})
  };
}
