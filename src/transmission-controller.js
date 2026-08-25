import { createTransmissionController as createBaseTransmissionController } from './transmission-controller-base.js';

export function createTransmissionController(args={}){
  const rawGetSpeed=typeof args.getSpeed==='function'?args.getSpeed:()=>0;
  let bodyLongitudinalSpeed=NaN;

  const base=createBaseTransmissionController({
    ...args,
    getSpeed:()=>Number.isFinite(bodyLongitudinalSpeed)
      ?bodyLongitudinalSpeed
      :rawGetSpeed()
  });
  const baseUpdateTransmission=base.updateTransmission;

  return {
    ...base,
    updateTransmission(
      dt,
      requestedThrottle,
      onPavement=true,
      automaticOverride=false,
      nextBodyLongitudinalSpeed=NaN
    ){
      const next=Number(nextBodyLongitudinalSpeed);
      bodyLongitudinalSpeed=Number.isFinite(next)?next:NaN;
      return baseUpdateTransmission(
        dt,
        requestedThrottle,
        onPavement,
        automaticOverride
      );
    },
    getTransmissionLongitudinalSpeed(){
      return Number.isFinite(bodyLongitudinalSpeed)
        ?bodyLongitudinalSpeed
        :rawGetSpeed();
    }
  };
}
