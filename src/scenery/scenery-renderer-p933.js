import {createSceneryRenderer as createSceneryRendererP9} from './scenery-renderer-p9.js';
import {FOREST_STREAMING_POLICY as FOREST} from '../forest-streaming-policy.js';
import {ensureWorldDriveDiagnostics,installDiagnosticAlias} from '../diagnostics.js';

// Foret P9.35 — route-aware startup forest readiness gate.
//
// P9.33 waited for a raw number of active chunks, which could be satisfied by
// chunks behind the spawn. P9.34 added forward coverage. P9.35 makes the exit
// condition directional as well: startup is only considered ready when the
// forward half has a clear majority over the rear half.

const DEFAULT_INITIAL_CHUNKS=14;
const DEFAULT_FRONT_CHUNKS=8;
const DEFAULT_FRONT_LEAD=2;
const DEFAULT_TIMEOUT_MS=5500;
const DEFAULT_POLL_MS=35;

function finite(value,fallback=0){return Number.isFinite(value)?value:fallback;}

export function createSceneryRenderer(options){
  const base=createSceneryRendererP9(options);
  let routeGeneration=0;

  function clearForestCache(...args){
    routeGeneration++;
    return base.clearForestCache?.(...args);
  }

  function routeDirection(){
    const center=options.getWorldOffset?.()||{x:0,z:0};
    try{
      const nr=options.nearestRoute?.(finite(center.x),finite(center.z));
      if(!nr||!Number.isFinite(nr.angle))return null;
      return {
        center:{x:finite(center.x),z:finite(center.z)},
        angle:nr.angle,
        x:Math.sin(nr.angle),
        z:Math.cos(nr.angle)
      };
    }catch{
      return null;
    }
  }

  function directionalCoverage(){
    const dir=routeDirection();
    const chunkCells=Math.max(1,FOREST.chunkCells||4);
    const chunkSize=(FOREST.cellSize||120)*chunkCells;
    const lateralBand=chunkSize*.15;
    let front=0,rear=0,lateral=0,total=0;

    const inspect=child=>{
      if(!child||child.visible===false)return;
      const match=/^forest-chunk-(-?\d+):(-?\d+)$/.exec(String(child.name||''));
      if(match){
        total++;
        if(!dir){lateral++;return;}
        const cx=Number(match[1]),cz=Number(match[2]);
        const x=(cx+.5)*chunkSize,z=(cz+.5)*chunkSize;
        const forward=(x-dir.center.x)*dir.x+(z-dir.center.z)*dir.z;
        if(forward>lateralBand)front++;
        else if(forward<-lateralBand)rear++;
        else lateral++;
        return;
      }
      for(const nested of child.children||[])inspect(nested);
    };

    for(const child of options.forestGroup?.children||[])inspect(child);

    return {
      total,front,rear,lateral,
      directionKnown:!!dir,
      angle:dir?.angle??null,
      dirX:dir?.x??0,
      dirZ:dir?.z??0
    };
  }

  function whenInitialForestReady({
    minChunks=DEFAULT_INITIAL_CHUNKS,
    minFrontChunks=DEFAULT_FRONT_CHUNKS,
    minFrontLead=DEFAULT_FRONT_LEAD,
    timeoutMs=DEFAULT_TIMEOUT_MS,
    pollMs=DEFAULT_POLL_MS
  }={}){
    const generation=routeGeneration;
    const started=performance.now();
    const target=Math.max(8,Math.floor(finite(minChunks,DEFAULT_INITIAL_CHUNKS)));
    const frontTarget=Math.max(4,Math.floor(finite(minFrontChunks,DEFAULT_FRONT_CHUNKS)));
    const frontLead=Math.max(1,Math.floor(finite(minFrontLead,DEFAULT_FRONT_LEAD)));
    const timeout=Math.max(600,finite(timeoutMs,DEFAULT_TIMEOUT_MS));
    const poll=Math.max(15,finite(pollMs,DEFAULT_POLL_MS));

    return new Promise(resolve=>{
      const check=()=>{
        if(generation!==routeGeneration){resolve(false);return;}
        const stats=base.forestStats?.()||{};
        const active=Math.max(0,finite(stats.activeChunks));
        const coverage=directionalCoverage();
        const forwardReady=!coverage.directionKnown||(
          coverage.front>=frontTarget&&
          coverage.front>=coverage.rear+frontLead
        );
        if(active>=target&&forwardReady){
          resolve(true);
          return;
        }
        if(performance.now()-started>=timeout){
          resolve(false);
          return;
        }
        setTimeout(check,poll);
      };
      check();
    });
  }

  function startupForestStatus(){
    const stats=base.forestStats?.()||{};
    const coverage=directionalCoverage();
    return {
      routeGeneration,
      activeChunks:Math.max(0,finite(stats.activeChunks)),
      queuedChunks:Math.max(0,finite(stats.queuedChunks)),
      frontChunks:coverage.front,
      rearChunks:coverage.rear,
      lateralChunks:coverage.lateral,
      frontLead:coverage.front-coverage.rear,
      directionKnown:coverage.directionKnown,
      dirX:finite(coverage.dirX),
      dirZ:finite(coverage.dirZ),
      targetChunks:DEFAULT_INITIAL_CHUNKS,
      targetFrontChunks:DEFAULT_FRONT_CHUNKS,
      targetFrontLead:DEFAULT_FRONT_LEAD,
      timeoutMs:DEFAULT_TIMEOUT_MS
    };
  }

  const diagnostics=ensureWorldDriveDiagnostics();
  diagnostics.forest.whenInitialReady=whenInitialForestReady;
  diagnostics.forest.startupStatus=startupForestStatus;
  installDiagnosticAlias('__WORLD_DRIVE_P933_FOREST_READY__',()=>diagnostics.forest.whenInitialReady);
  installDiagnosticAlias('__WORLD_DRIVE_P933_FOREST_STATUS__',()=>diagnostics.forest.startupStatus);
  installDiagnosticAlias('__WORLD_DRIVE_P934_FOREST_READY__',()=>diagnostics.forest.whenInitialReady);
  installDiagnosticAlias('__WORLD_DRIVE_P934_FOREST_STATUS__',()=>diagnostics.forest.startupStatus);
  installDiagnosticAlias('__WORLD_DRIVE_P935_FOREST_READY__',()=>diagnostics.forest.whenInitialReady);
  installDiagnosticAlias('__WORLD_DRIVE_P935_FOREST_STATUS__',()=>diagnostics.forest.startupStatus);

  return Object.freeze({
    ...base,
    clearForestCache,
    whenInitialForestReady,
    startupForestStatus
  });
}
