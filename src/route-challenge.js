// Competitive route challenge UI/state.
// Physics remains authoritative in main.js: this module only observes final
// Route/Terrain contact, speed and route progress.

const $=id=>document.getElementById(id);

export function createRouteChallenge({
  getSpeed,
  getRouteLength,
  toast
}){
  const runChallengeEl=$('runChallenge');
  const runStateEl=$('runState');
  const runTimerEl=$('runTimer');
  const runQualityEl=$('runQuality');
  const qualityFillEl=$('qualityFill');
  const resetRunBtn=$('resetRunBtn');
  const challengeSubsection=$('challengeSubsection');
  const challengeSubsectionToggle=$('challengeSubsectionToggle');
  const challengeSubsectionSummary=$('challengeSubsectionSummary');

  // The challenge now lives inside the route map. Keep the legacy nodes alive
  // because they are still useful as compatibility/status targets.
  if(challengeSubsection){
    challengeSubsection.style.display='none';
  }

  if(runChallengeEl){
    runChallengeEl.style.display='none';
  }

  const mapbox=$('mapbox');
  let v21MapChallenge=$('v21MapChallenge');

  if(!v21MapChallenge&&mapbox){
    v21MapChallenge=document.createElement('div');
    v21MapChallenge.id='v21MapChallenge';
    v21MapChallenge.innerHTML=`
      <div class="v21ChallengeLabel">Temps :</div>
      <div class="v21ChallengeValue" id="v21ChallengeTime">00:00.000 sec</div>
      <div class="v21ChallengeLabel">Qualité :</div>
      <div class="v21ChallengeValue" id="v21ChallengeQuality">100 %</div>
    `;
    mapbox.appendChild(v21MapChallenge);
  }

  challengeSubsectionToggle?.addEventListener(
    'click',
    ()=>{
      if(!challengeSubsection)return;

      const collapsed=challengeSubsection.classList.toggle('collapsed');
      const chevron=challengeSubsectionToggle.querySelector('.routeSubsectionChevron');

      if(chevron){
        chevron.textContent=collapsed?'+':'−';
      }
    }
  );

  const state={
    running:false,
    finished:false,
    startedAt:0,
    finishedAt:0,
    lastSampleAt:0,
    offroadMs:0
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

  function formatRunTimeDetailed(ms){
    const safe=Math.max(0,Math.floor(ms||0));
    const milliseconds=safe%1000;
    const totalSeconds=Math.floor(safe/1000);
    const seconds=totalSeconds%60;
    const minutes=Math.floor(totalSeconds/60);

    return (
      String(minutes).padStart(2,'0')+
      ':'+
      String(seconds).padStart(2,'0')+
      '.'+
      String(milliseconds).padStart(3,'0')+
      ' sec'
    );
  }

  function elapsedMs(now=performance.now()){
    if(!state.running&&!state.finished){
      return 0;
    }

    const end=state.finished?state.finishedAt:now;
    return Math.max(0,end-state.startedAt);
  }

  let nextHudAt=0;

  function updateHUD(now=performance.now(),force=false){
    if(!force&&now<nextHudAt)return;
    nextHudAt=now+100;

    const penalty=Math.floor(state.offroadMs/1000);
    const quality=Math.max(0,100-penalty);
    const mapChallengeTime=$('v21ChallengeTime');
    const mapChallengeQuality=$('v21ChallengeQuality');

    if(mapChallengeTime){
      mapChallengeTime.textContent=formatRunTimeDetailed(elapsedMs(now));
    }

    if(mapChallengeQuality){
      mapChallengeQuality.textContent=String(quality)+' %';
    }

    if(runTimerEl){
      runTimerEl.textContent=formatRunTime(elapsedMs(now));
    }

    if(runQualityEl){
      runQualityEl.textContent=String(quality);
    }

    if(qualityFillEl){
      qualityFillEl.style.width=quality+'%';
      qualityFillEl.style.backgroundColor=
        quality>=90
          ?'#55d98b'
          :quality>=70
            ?'#e2c45b'
            :quality>=45
              ?'#e28b50'
              :'#df5a61';
    }

    if(runQualityEl){
      runQualityEl.style.color=
        quality>=90
          ?'#71e29f'
          :quality>=70
            ?'#f0d56b'
            :quality>=45
              ?'#f1a263'
              :'#f06a71';
    }

    runChallengeEl?.classList.toggle('running',state.running);
    runChallengeEl?.classList.toggle('finished',state.finished);

    if(runStateEl){
      runStateEl.textContent=
        state.finished
          ?'TERMINÉ'
          :state.running
            ?'EN COURSE'
            :'PRÊT';
    }

    if(challengeSubsectionSummary){
      challengeSubsectionSummary.textContent=
        state.running||state.finished
          ?formatRunTime(elapsedMs(now))
          :'PRÊT';
    }
  }

  function reset(){
    state.running=false;
    state.finished=false;
    state.startedAt=0;
    state.finishedAt=0;
    state.lastSampleAt=0;
    state.offroadMs=0;
    updateHUD(performance.now(),true);
  }

  function start(now){
    if(state.running||state.finished)return;

    state.running=true;
    state.startedAt=now;
    state.lastSampleAt=now;
    updateHUD(now,true);
  }

  function finish(now){
    if(!state.running)return;

    state.running=false;
    state.finished=true;
    state.finishedAt=now;
    state.lastSampleAt=now;
    updateHUD(now,true);

    toast?.(
      'Parcours terminé · '+
      formatRunTime(elapsedMs(now))
    );
  }

  function update(onRoad,nearestRoute){
    const now=performance.now();
    const speedKmh=Math.abs(Number(getSpeed?.())||0)*3.6;
    const routeLength=Math.max(0,Number(getRouteLength?.())||0);

    if(!state.running&&!state.finished&&speedKmh>.8){
      start(now);
    }

    if(state.running){
      const sampleDelta=Math.max(0,now-state.lastSampleAt);

      if(!onRoad){
        state.offroadMs+=sampleDelta;
      }

      state.lastSampleAt=now;

      if(
        nearestRoute&&
        routeLength>0&&
        nearestRoute.cum>=routeLength-12
      ){
        finish(now);
      }
    }

    updateHUD(now);
  }

  resetRunBtn?.addEventListener(
    'click',
    ()=>{
      reset();
      toast?.('Défi parcours réinitialisé');
    }
  );

  updateHUD(performance.now(),true);

  return {
    reset,
    update,
    getState:()=>({...state})
  };
}
