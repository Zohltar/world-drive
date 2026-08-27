// World Drive M4.2 — shared local/remote authored-vehicle render contract.
// These are presentation transforms, not physics metrics. Local and remote
// authored controllers must live under the same root scale/stance convention.

export const VEHICLE_RENDER_ROOT_SCALE=.80;

export const VEHICLE_BODY_STANCE=Object.freeze({
  id4:-.22,
  wrx:-.31,
  civic:-.30,
  sonata:-.30,
  f1_2010:-.38,
  countach_80:-.33,
  i3_2017:-.24,
  semi_6x4:0
});

export function vehicleBodyStance(vehicleId){
  return Number.isFinite(VEHICLE_BODY_STANCE[vehicleId])
    ?VEHICLE_BODY_STANCE[vehicleId]
    :-.28;
}
