import {
  createRemoteHdVehicle as createRemoteHdVehicleM3,
  supportsRemoteHdVehicle,
  remoteHdDiagnostics as remoteHdDiagnosticsM3
} from './multiplayer-hd-vehicles-m3.js';
import {createLocalParityRemoteLighting} from './multiplayer-authored-lighting-m31.js';

// M3.1 keeps the proven M3 registry/cache and only replaces the two lighting
// paths that runtime testing showed were not equivalent to their local GLBs.
const LOCAL_PARITY_IDS=new Set(['wrx','sonata']);

export {supportsRemoteHdVehicle};

export async function createRemoteHdVehicle(THREE,vehicleId){
  const base=await createRemoteHdVehicleM3(THREE,vehicleId);
  if(!base||!LOCAL_PARITY_IDS.has(vehicleId))return base;

  const parity=createLocalParityRemoteLighting(THREE,vehicleId,base.root);
  if(!parity)return base;

  const baseSetLighting=base.setLighting?.bind(base)||(()=>{});
  const baseLightingDiagnostics=base.lightingDiagnostics?.bind(base)||(()=>null);
  const baseDispose=base.dispose?.bind(base)||(()=>{});
  let disposed=false;

  const baseMissing=Array.isArray(base.lightingMissing)?base.lightingMissing:[];
  const missing=vehicleId==='wrx'
    ?[...new Set([...baseMissing.filter(family=>family!=='reverse'),...(parity.missingFamilies||[])])]
    :[...(parity.missingFamilies||[])];
  const lightingReady=vehicleId==='wrx'
    ?!!base.lightingReady&&!!parity.ready
    :!!parity.ready;

  return {
    ...base,
    lightingMode:'authored-glb-lamps-v2',
    lightingReady,
    lightingMissing:Object.freeze(missing),
    setLighting(state={}){
      if(disposed)return;
      if(vehicleId==='wrx'){
        // M3's generic WRX still owns brake/night/signals, but its reverse
        // binding is intentionally disabled. The local-parity controller below
        // owns reverse exclusively.
        baseSetLighting({...state,reversing:false});
      }else{
        // Sonata M3.1 owns every authored lamp. Keep the older generic Sonata
        // layers dark so there is no z-fighting or competing mask logic.
        baseSetLighting({
          braking:false,
          reversing:false,
          nightLevel:0,
          signalLeft:false,
          signalRight:false,
          signalBlink:false,
          distance:state.distance
        });
      }
      parity.setState(state);
    },
    lightingDiagnostics:()=>({
      vehicleId,
      mode:'authored-glb-lamps-v2',
      implementation:'m3.1-local-parity-wrapper',
      ready:lightingReady,
      missingFamilies:[...missing],
      base:baseLightingDiagnostics(),
      localParity:parity.diagnostics?.()||null
    }),
    dispose(){
      if(disposed)return;
      disposed=true;
      parity.dispose?.();
      baseDispose();
    }
  };
}

export function remoteHdDiagnostics(){
  return {
    ...remoteHdDiagnosticsM3(),
    mode:'multiplayer-hd-m3.1-local-light-parity',
    localParityOverrides:['wrx-reverse','sonata-all-lamps']
  };
}
