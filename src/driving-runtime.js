export * from './driving-runtime-base.js';
import {
  createDrivingRuntime as createBaseDrivingRuntime,
  bodyRelativeLongitudinalSpeed
} from './driving-runtime-base.js';

export function createDrivingRuntime(args={}){
  const originalUpdateTransmission=args.updateTransmission;
  if(typeof originalUpdateTransmission!=='function')return createBaseDrivingRuntime(args);

  const updateTransmissionWithBodySpeed=(dt,requestedThrottle,onPavement=true,automaticOverride=false)=>{
    const state=typeof args.getState==='function'?args.getState():null;
    const bodySpeed=bodyRelativeLongitudinalSpeed(state||{});
    return originalUpdateTransmission(
      dt,
      requestedThrottle,
      onPavement,
      automaticOverride,
      bodySpeed
    );
  };

  return createBaseDrivingRuntime({
    ...args,
    updateTransmission:updateTransmissionWithBodySpeed
  });
}
