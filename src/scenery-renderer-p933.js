import {createSceneryRenderer as createSceneryRendererP9} from './scenery-renderer-p9.js';

// Foret P9.33 — startup forest readiness gate.
//
// P9.29/P9.31/P9.32 already keep moving-frame work tiny and prioritize travel
// ahead. The remaining visible defect is startup: gameplay can begin while the
// first forest ring is still being assembled. This wrapper keeps the renderer
// unchanged and exposes a route-safe readiness probe based on freshly built
// active chunks. It deliberately uses a bounded timeout so missing assets can
// never prevent driving.

const DEFAULT_INITIAL_CHUNKS=14;
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

  function whenInitialForestReady({
    minChunks=DEFAULT_INITIAL_CHUNKS,
    timeoutMs=DEFAULT_TIMEOUT_MS,
    pollMs=DEFAULT_POLL_MS
  }={}){
    const generation=routeGeneration;
    const started=performance.now();
    const target=Math.max(8,Math.floor(finite(minChunks,DEFAULT_INITIAL_CHUNKS)));
    const timeout=Math.max(600,finite(timeoutMs,DEFAULT_TIMEOUT_MS));
    const poll=Math.max(15,finite(pollMs,DEFAULT_POLL_MS));

    return new Promise(resolve=>{
      const check=()=>{
        if(generation!==routeGeneration){resolve(false);return;}
        const stats=base.forestStats?.()||{};
        const active=Math.max(0,finite(stats.activeChunks));
        if(active>=target){
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
    return {
      routeGeneration,
      activeChunks:Math.max(0,finite(stats.activeChunks)),
      queuedChunks:Math.max(0,finite(stats.queuedChunks)),
      targetChunks:DEFAULT_INITIAL_CHUNKS,
      timeoutMs:DEFAULT_TIMEOUT_MS
    };
  }

  // Startup UI is intentionally decoupled from the scenery constructor. A
  // tiny global bridge lets the existing vehicle chooser await the forest
  // without threading a new dependency through main.js.
  globalThis.__WORLD_DRIVE_P933_FOREST_READY__=whenInitialForestReady;
  globalThis.__WORLD_DRIVE_P933_FOREST_STATUS__=startupForestStatus;

  return Object.freeze({
    ...base,
    clearForestCache,
    whenInitialForestReady,
    startupForestStatus
  });
}
