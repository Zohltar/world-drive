// World Drive V21.21.26 — instrumented road-car behavior calibration + steering rack.
// Existing vehicles keep their proven gameplay calibration while exposing mass,
// CG, track, axle, inertia and coupling metadata for future vehicle classes.

const PROFILES={
  id4:{
    id:'id4',
    name:'ID4',
    description:'Crossover électrique AWD',

    physics:{
      drivetrain:'AWD',
      // V21.21 generalized chassis model. These values are calibration data
      // for the physics engine; visuals remain independently defined below.
      vehicleClass:'passenger',
      massKg:2226,
      // 2024 ID.4 AWD Pro S curb mass: 4,907 lb (~2,226 kg).
      cgHeight:0.56,
      trackWidth:1.59,
      frontWeightBias:0.48,
      // Instrumented 2024 AWD Pro S: ~48/52 front/rear.
      brakeBiasFront:0.62,
      // 2024 dual-motor ID.4 is strongly rear-motor biased (282 hp rear / 107 hp front).
      driveBiasFront:0.28,
      yawInertiaScale:1.10,
      longitudinalAccelLimit:8.75,
      bodyLength:4.58,
      bodyWidth:1.85,
      topSpeedKmh:160,
      // 2024 AWD Pro S: ~4.8 s 0-60 mph and 169 ft 70-0 mph.
      accel:7.00,
      brake:9.63,
      reverseAccel:3.2,
      rolling:0.32,
      aero:0.0009,
      wheelbase:2.77,
      maxSteerLow:0.44,
      maxSteerHigh:0.135,
      steeringResponseHigh:4.4,
      // Center -> full requested steering travel time. The physics rack now
      // slews linearly toward the joystick target instead of teleporting there.
      steeringCenterToFullTimeSec:0.58,
      steeringReturnToCenterTimeSec:0.40,
      roadGripMultiplier:1.02,
      // Instrumented skidpad: ~0.86 g.
      lateralAccelLimit:8.43,
      suspensionTravel:0.17,
      suspensionResponse:14.0,

      offroadGrip:0.58,
      offroadDrag:1.15
    },

    audio:{
      type:'ev',
      profile:'id4'
    },

    visual:{
      type:'crossover',
      profile:'id4',
      rideHeight:0.38,
      bodyStyle:'compact-electric-crossover'
    }
  },
  wrx:{
    id:'wrx',
    name:'WRX',
    description:'Berline sport AWD · Boxer Turbo',

    physics:{
      drivetrain:'AWD',
      vehicleClass:'passenger',
      massKg:1510,
      // 2024 WRX 6MT base curb mass: 3,329 lb (~1,510 kg).
      cgHeight:0.50,
      trackWidth:1.56,
      frontWeightBias:0.58,
      brakeBiasFront:0.62,
      driveBiasFront:0.45,
      yawInertiaScale:0.96,
      longitudinalAccelLimit:9.47,
      bodyLength:4.60,
      bodyWidth:1.80,
      // More immediate than ID4, but not supercar-like.
      // 2024 6MT: ~5.5 s 0-60 mph and 156 ft 70-0 mph.
      accel:6.36,
      brake:10.42,
      reverseAccel:3.5,
      rolling:0.34,
      aero:0.0010,
      wheelbase:2.65,
      maxSteerLow:0.48,
      maxSteerHigh:0.175,
      steeringResponseHigh:5.6,
      steeringCenterToFullTimeSec:0.46,
      steeringReturnToCenterTimeSec:0.34,
      roadGripMultiplier:1.10,
      lateralAccelLimit:9.32,
      suspensionTravel:0.14,
      suspensionResponse:18.0,

      offroadGrip:0.70,
      offroadDrag:0.95
    },

    audio:{
      type:'combustion',
      profile:'boxer-turbo',
      idleRpm:850,
      redlineRpm:6700,
      gearCount:6,

      // V20.6 mechanical gearbox calibration.
      // 225 km/h = top-gear redline at the reference RPM/ratio.
      referenceRedlineRpm:6700,
      referenceTopGearRedlineKmh:225,
      referenceTopGearRatio:1,
      gearRatios:[4.3,2.443182,1.706349,1.360759,1.168478,1],
      shiftDuration:0.16,
      downshiftDuration:0.14,
      revLimiterHz:12.5,
      revLimiterDropRpm:220,
    },

    visual:{
      type:'sport-sedan',
      profile:'wrx',
      rideHeight:0.31,
      bodyStyle:'rally-sport-sedan',
      color:'rally-blue',
      hoodScoop:true,
      rearWing:true
    }
  },
  civic:{
    id:'civic',
    name:'Honda Civic noire',
    description:'Berline compacte traction',

    physics:{
      drivetrain:'FWD',
      vehicleClass:'passenger',
      massKg:1345,
      // 2024 Civic Sport (Canada) curb mass: 1,345 kg.
      cgHeight:0.50,
      trackWidth:1.55,
      frontWeightBias:0.61,
      // 2024 Civic Sport published distribution: 61/39 front/rear.
      brakeBiasFront:0.64,
      driveBiasFront:1.00,
      yawInertiaScale:0.98,
      longitudinalAccelLimit:8.67,
      bodyLength:4.55,
      bodyWidth:1.80,
      // Civic Sport 2.0 CVT: ~8.8 s 0-60 mph and 170 ft 70-0 mph.
      accel:4.44,
      brake:9.54,
      reverseAccel:3.3,
      rolling:0.33,
      aero:0.00092,
      wheelbase:2.70,
      maxSteerLow:0.49,
      maxSteerHigh:0.165,
      steeringResponseHigh:5.2,
      steeringCenterToFullTimeSec:0.52,
      steeringReturnToCenterTimeSec:0.38,
      roadGripMultiplier:1.06,
      lateralAccelLimit:8.53,
      suspensionTravel:0.15,
      suspensionResponse:15.0,

      offroadGrip:0.62,
      offroadDrag:1.04
    },

    audio:{
      type:'combustion',
      profile:'civic',
      idleRpm:750,
      redlineRpm:6800,
      gearCount:6,

      // V20.6 mechanical gearbox calibration.
      // 180 km/h = top-gear redline at the reference RPM/ratio.
      referenceRedlineRpm:6800,
      referenceTopGearRedlineKmh:180,
      referenceTopGearRatio:1,
      gearRatios:[4.888889,2.820513,1.964286,1.506849,1.235955,1],
      shiftDuration:0.22,
      downshiftDuration:0.18,
      revLimiterHz:11.5,
      revLimiterDropRpm:240,
    },

    visual:{
      type:'sedan',
      profile:'civic',
      rideHeight:0.29,
      color:'black'
    }
  },

  sonata:{
    id:'sonata',
    name:'Hyundai Sonata Sport blanche',
    description:'Berline sport traction',

    physics:{
      drivetrain:'FWD',
      vehicleClass:'passenger',
      massKg:1584,
      // 2017 Sonata Sport 2.0T curb mass: 3,492 lb (~1,584 kg).
      cgHeight:0.54,
      trackWidth:1.60,
      frontWeightBias:0.61,
      brakeBiasFront:0.64,
      driveBiasFront:1.00,
      yawInertiaScale:1.04,
      longitudinalAccelLimit:8.82,
      bodyLength:4.85,
      bodyWidth:1.86,
      // Sonata Sport 2.0T: ~7.2 s 0-60 mph and 167 ft 70-0 mph.
      accel:5.01,
      brake:9.70,
      reverseAccel:3.3,
      rolling:0.34,
      aero:0.00095,
      wheelbase:2.80,
      maxSteerLow:0.47,
      maxSteerHigh:0.158,
      steeringResponseHigh:5.0,
      steeringCenterToFullTimeSec:0.55,
      steeringReturnToCenterTimeSec:0.40,
      roadGripMultiplier:1.05,
      lateralAccelLimit:8.04,
      suspensionTravel:0.15,
      suspensionResponse:14.0,

      offroadGrip:0.60,
      offroadDrag:1.06
    },

    audio:{
      type:'combustion',
      profile:'sonata-sport',
      idleRpm:750,
      redlineRpm:6500,
      gearCount:6,

      // V20.6 mechanical gearbox calibration.
      // 205 km/h = top-gear redline at the reference RPM/ratio.
      referenceRedlineRpm:6500,
      referenceTopGearRedlineKmh:205,
      referenceTopGearRatio:1,
      gearRatios:[4.6875,2.678571,1.875,1.461039,1.222826,1],
      shiftDuration:0.18,
      downshiftDuration:0.16,
      revLimiterHz:11.0,
      revLimiterDropRpm:220,
    },

    visual:{
      type:'sport-sedan',
      profile:'sonata',
      rideHeight:0.30,
      color:'white'
    }
  },

  f1_2010:{
    id:'f1_2010',
    name:'F1 2010',
    description:'Monoplace · haute adhérence',

    physics:{
      drivetrain:'RWD',
      vehicleClass:'racecar',
      // FIA 2010 minimum was 620 kg. World Drive uses 740 kg as a
      // representative running mass (driver + substantial race fuel), rather
      // than pretending a fuel-loaded race car always sits at minimum weight.
      massKg:740,
      fiaMinimumMassKg:620,
      cgHeight:0.30,
      trackWidth:1.80,
      frontWeightBias:0.46,
      brakeBiasFront:0.56,
      absEnabled:false,
      driveBiasFront:0.00,
      yawInertiaScale:0.82,
      longitudinalAccelLimit:20.5,
      bodyLength:5.00,
      bodyWidth:1.80,
      // Small reduction keeps 0-100 km/h near a representative ~2.6 s once
      // the 1->2 shift interruption is included.
      accel:12.3,

      // F1 carbon brakes: substantially stronger than road cars.
      brake:20.5,

      reverseAccel:2.4,
      rolling:0.38,
      aero:0.00072,

      // 2010-era aerodynamic load. Renault R30 launch targets disclosed a
      // Czt of ~3.10 referenced to 1.47 m² => ClA ≈ 4.56 m². The 42% aero
      // balance target is used as the front downforce share. Tire load
      // sensitivity means not every extra newton of vertical load becomes an
      // equal percentage of grip, hence the 0.88 efficiency and 3.0x cap.
      aeroDownforceClA:4.56,
      aeroDownforceFrontBias:0.42,
      aeroGripEfficiency:0.88,
      aeroGripScaleMax:3.00,

      // V21.21.23 — aerodynamic vertical stability. Full wing load helps the
      // car follow convex road crests while contact exists. Once airborne, a
      // reduced share remains because the wings still see airflow, but attitude
      // changes and floor sealing are no longer guaranteed.
      aeroLaunchRetentionScale:1.00,
      aeroAirborneDownforceScale:0.55,
      wheelbase:3.15,

      // V21.21.24 — F1 steering is intentionally much more progressive than
      // the road-car rack mapping. A keyboard/gamepad full-lock request must
      // not instantly ask the tires for 4–8 g at neighbourhood speed.
      maxSteerLow:0.34,
      maxSteerHigh:0.115,
      parkingSteerBoost:0.06,
      steeringInputExponent:1.72,
      steeringResponseLow:2.55,
      steeringResponseMid:3.20,
      steeringResponseHigh:4.80,
      steeringReturnRateLow:3.65,
      steeringReturnRateHigh:5.10,

      // V21.21.25 — physically interpretable rack speed. 0.42 s is the time
      // required to move from centred wheels to a full-scale joystick request.
      // A left-lock -> right-lock reversal therefore takes about 0.84 s.
      steeringCenterToFullTimeSec:0.42,
      steeringReturnToCenterTimeSec:0.30,

      // Cap full-lock road-wheel angle to a fraction of the tire+aero lateral
      // envelope. This keeps steering alone below breakaway while still
      // allowing throttle, braking, curbs or loose surfaces to consume the
      // remaining friction circle and create real slip.
      // The V21.21.24 0.66 reserve made long fast bends unnecessarily hard.
      // With finite rack travel we can safely use more of the real aero/tire
      // envelope while still retaining margin for bumps, braking and throttle.
      steeringGripEnvelopeFraction:0.82,
      yawResponseMultiplier:0.86,

      // Grip belongs in the tire/aero envelope below, not in the geometric
      // bicycle yaw equation. The previous 1.72 multiplier made the chassis
      // request 72% more yaw than the wheel angle geometrically implied.
      roadGripMultiplier:1.00,
      lateralAccelLimit:20.5,
      frontTireGripScale:1.20,
      rearTireGripScale:1.20,

      // High-downforce RWD: only subtle throttle-on rear slip.
      powerOversteerGripLoss:0.018,
      powerOversteerYaw:0.010,

      suspensionTravel:0.075,
      suspensionResponse:22.0,

      offroadGrip:0.34,
      offroadDrag:2.25
    },

    audio:{
      type:'combustion',
      profile:'f1-v8',
      idleRpm:3200,
      redlineRpm:12000,
      gearCount:7,

      // V20.6 mechanical gearbox calibration.
      // 350 km/h = top-gear redline at the reference RPM/ratio.
      referenceRedlineRpm:12000,
      referenceTopGearRedlineKmh:350,
      referenceTopGearRatio:1,
      gearRatios:[4.861111,2.822581,2.011494,1.5625,1.296296,1.121795,1],
      shiftDuration:0.075,
      downshiftDuration:0.065,
      revLimiterHz:16.5,
      revLimiterDropRpm:380,

      cylinders:8,
      naturallyAspirated:true
    },

    visual:{
      type:'open-wheel',
      profile:'f1_2010',
      rideHeight:0.12,
      color:'red-white'
    }
  },

  countach_80:{
    id:'countach_80',
    name:'Lamborghini Countach rouge',
    description:'Supercar V12 des années 80 · propulsion',

    physics:{
      drivetrain:'RWD',
      vehicleClass:'passenger',
      massKg:1490,
      // Countach LP5000 QV representative curb mass: ~1,490 kg.
      cgHeight:0.48,
      trackWidth:1.50,
      frontWeightBias:0.44,
      brakeBiasFront:0.57,
      absEnabled:false,
      driveBiasFront:0.00,
      yawInertiaScale:0.90,
      // Period Pirelli grip is stronger than the old brake hardware; braking
      // remains hardware-limited below this tire friction ceiling.
      longitudinalAccelLimit:9.50,
      bodyLength:4.14,
      bodyWidth:2.00,

      // Fast, raw 1980s supercar: noticeably stronger than the road sedans,
      // but still far below the F1's acceleration/braking/grip envelope.
      // Period road tests put a representative Countach around 5 s 0-100
      // and roughly 200 ft from 70-0; it should feel fast, not modern-supercar fast.
      accel:6.77,
      brake:7.30,
      reverseAccel:3.0,
      rolling:0.36,
      aero:0.00078,
      wheelbase:2.45,

      // Wide tires + unassisted old-school steering: strong low-speed lock,
      // progressively calmer at very high speed.
      maxSteerLow:0.43,
      maxSteerHigh:0.142,
      steeringResponseHigh:5.8,
      steeringCenterToFullTimeSec:0.44,
      steeringReturnToCenterTimeSec:0.32,

      roadGripMultiplier:1.16,
      // Contemporary Pirelli P7 road tests were around 0.82 g.
      lateralAccelLimit:8.04,

      // V19.2: old-school supercar. Under power the rear gives up lateral grip
      // before rotating, preserving the heavy cornering feel.
      powerOversteerGripLoss:0.18,
      powerOversteerYaw:0.055,

      // Very much a road car despite its exotic shape.
      suspensionTravel:0.11,
      suspensionResponse:17.0,

      offroadGrip:0.42,
      offroadDrag:1.45
    },

    audio:{
      type:'combustion',
      profile:'countach-v12',
      idleRpm:950,
      redlineRpm:7500,
      gearCount:5,

      // V20.6 mechanical gearbox calibration.
      // 320 km/h = top-gear redline at the reference RPM/ratio.
      referenceRedlineRpm:7500,
      referenceTopGearRedlineKmh:295,
      referenceTopGearRatio:1,
      gearRatios:[4.444444,2.539683,1.702128,1.269841,1],
      shiftDuration:0.28,
      downshiftDuration:0.22,
      revLimiterHz:9.5,
      revLimiterDropRpm:280,

      cylinders:12,
      naturallyAspirated:true
    },

    visual:{
      type:'wedge-supercar',
      profile:'countach_80',
      rideHeight:0.18,
      color:'red',
      rearWing:true
    }
  },

  i3_2017:{
    id:'i3_2017',
    name:'BMW i3 2017 blanche/noire',
    description:'Citadine électrique propulsion',

    physics:{
      drivetrain:'RWD',
      vehicleClass:'passenger',
      massKg:1343,
      // 2017 BMW i3 94 Ah BEV curb mass: 2,961 lb (~1,343 kg).
      cgHeight:0.54,
      trackWidth:1.57,
      frontWeightBias:0.48,
      brakeBiasFront:0.60,
      driveBiasFront:0.00,
      yawInertiaScale:0.96,
      longitudinalAccelLimit:8.39,
      bodyLength:4.01,
      bodyWidth:1.78,
      topSpeedKmh:150,
      // 2017 BEV: ~6.6 s 0-60 mph, 177 ft 70-0, 0.77 g skidpad.
      accel:5.28,
      brake:9.23,
      reverseAccel:3.5,
      rolling:0.29,
      aero:0.00082,
      wheelbase:2.57,
      maxSteerLow:0.53,
      maxSteerHigh:0.17,
      steeringResponseHigh:5.3,
      steeringCenterToFullTimeSec:0.50,
      steeringReturnToCenterTimeSec:0.36,
      roadGripMultiplier:1.00,
      lateralAccelLimit:7.55,

      powerOversteerGripLoss:0.08,
      powerOversteerYaw:0.030,

      suspensionTravel:0.16,
      suspensionResponse:14.0,

      offroadGrip:0.55,
      offroadDrag:1.18
    },

    audio:{
      type:'ev',
      profile:'i3'
    },

    visual:{
      type:'compact-ev',
      profile:'i3_2017',
      rideHeight:0.33,
      color:'white-black'
    }
  }
};

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

// V21.21 — normalize every vehicle into the same chassis/axle schema.
// The legacy flat fields remain available so existing renderer/audio systems
// keep working while the dynamics layer can reason about arbitrary axles.
function normalizePhysics(raw){
  const physics=clone(raw||{});
  const wheelbase=Math.max(1,Number(physics.wheelbase)||2.7);
  const trackWidth=Math.max(.8,Number(physics.trackWidth)||1.55);
  const frontWeightBias=clamp(Number(physics.frontWeightBias)||.55,.30,.75);
  const drivetrain=physics.drivetrain||'AWD';
  let driveBiasFront=Number(physics.driveBiasFront);
  if(!Number.isFinite(driveBiasFront)){
    driveBiasFront=drivetrain==='FWD'?1:(drivetrain==='RWD'?0:.5);
  }
  driveBiasFront=clamp(driveBiasFront,0,1);
  const brakeBiasFront=clamp(Number(physics.brakeBiasFront)||.62,.40,.80);

  // Static load on the front axle equals b/L, where b is CG distance from
  // the rear axle. Axle positions are expressed from the chassis CG.
  const frontAxleX=(1-frontWeightBias)*wheelbase;
  const rearAxleX=-frontWeightBias*wheelbase;

  physics.massKg=Math.max(250,Number(physics.massKg)||1500);
  physics.cgHeight=Math.max(.15,Number(physics.cgHeight)||.52);
  physics.trackWidth=trackWidth;
  physics.frontWeightBias=frontWeightBias;
  physics.brakeBiasFront=brakeBiasFront;
  physics.driveBiasFront=driveBiasFront;
  physics.yawInertiaScale=Math.max(.45,Number(physics.yawInertiaScale)||1);
  physics.longitudinalAccelLimit=Math.max(
    3,
    Number(physics.longitudinalAccelLimit)||Number(physics.brake)||9.81
  );
  physics.bodyLength=Math.max(wheelbase+.6,Number(physics.bodyLength)||wheelbase+1.6);
  physics.bodyWidth=Math.max(trackWidth+.15,Number(physics.bodyWidth)||trackWidth+.3);

  physics.axles=[
    {
      id:'front',
      positionM:frontAxleX,
      staticLoadFraction:frontWeightBias,
      steerFactor:1,
      driveShare:driveBiasFront,
      brakeShare:brakeBiasFront,
      trackWidth,
      wheelCount:2
    },
    {
      id:'rear',
      positionM:rearAxleX,
      staticLoadFraction:1-frontWeightBias,
      steerFactor:0,
      driveShare:1-driveBiasFront,
      brakeShare:1-brakeBiasFront,
      trackWidth,
      wheelCount:2
    }
  ];

  // Reserved coupling metadata. V21.21 does not simulate a trailer yet, but
  // future rigid bodies can attach here without changing the vehicle schema.
  physics.coupling={
    rearHitchOffsetM:-physics.bodyLength*.48,
    supportsArticulation:true
  };

  // Approximate planar yaw inertia for response scaling. It is intentionally
  // derived instead of hand-tuned so larger future chassis react more slowly.
  physics.yawInertiaKgM2=
    physics.massKg*
    (wheelbase*wheelbase+trackWidth*trackWidth)/12*
    physics.yawInertiaScale;

  return physics;
}

function normalizedProfile(profile){
  const copy=clone(profile);
  copy.physics=normalizePhysics(copy.physics);
  return copy;
}

export function createVehicleSystem({
  initialId='wrx'
}={}) {
  if(!PROFILES[initialId]){
    throw new Error(
      `Unknown initial vehicle: ${initialId}`
    );
  }

  let activeId=initialId;
  let active=normalizedProfile(PROFILES[activeId]);

  // Preserve object identity so systems such as audio can hold a stable reference.
  const physics={...active.physics,_layoutRevision:1};

  function applyProfile(profile){
    const nextLayoutRevision=(Number(physics._layoutRevision)||0)+1;
    for(const key of Object.keys(physics)){
      delete physics[key];
    }

    Object.assign(
      physics,
      profile.physics
    );
    physics._layoutRevision=nextLayoutRevision;
  }

  function select(id){
    if(!PROFILES[id])return false;
    if(id===activeId)return false;

    activeId=id;
    active=normalizedProfile(PROFILES[id]);
    applyProfile(active);

    return true;
  }

  function populateSelect(selectElement){
    if(!selectElement)return;

    selectElement.innerHTML='';

    for(const profile of Object.values(PROFILES)){
      const option=document.createElement('option');
      option.value=profile.id;
      option.textContent=profile.name;
      option.selected=profile.id===activeId;
      selectElement.appendChild(option);
    }
  }

  function list(){
    return Object.values(PROFILES).map(profile=>({
      id:profile.id,
      name:profile.name,
      description:profile.description,
      vehicleClass:profile.physics?.vehicleClass||'passenger'
    }));
  }

  return {
    physics,
    select,
    populateSelect,
    list,

    get active(){
      return active;
    },

    get activeId(){
      return activeId;
    }
  };
}


// Pure QA hook used by V21.21 tests; harmless in production.
export function validateVehicleProfiles(){
  const errors=[];
  for(const [id,source] of Object.entries(PROFILES)){
    const p=normalizePhysics(source.physics);
    const load=p.axles.reduce((sum,a)=>sum+a.staticLoadFraction,0);
    const drive=p.axles.reduce((sum,a)=>sum+a.driveShare,0);
    const brake=p.axles.reduce((sum,a)=>sum+a.brakeShare,0);
    if(Math.abs(load-1)>1e-6)errors.push(`${id}: axle loads != 1`);
    if(Math.abs(drive-1)>1e-6)errors.push(`${id}: drive shares != 1`);
    if(Math.abs(brake-1)>1e-6)errors.push(`${id}: brake shares != 1`);
    if(!(p.yawInertiaKgM2>0))errors.push(`${id}: invalid yaw inertia`);
    if(!(p.massKg>0&&p.wheelbase>0&&p.trackWidth>0))errors.push(`${id}: invalid chassis geometry`);
    if(Number(p.aeroDownforceClA||0)<0)errors.push(`${id}: invalid aero downforce coefficient-area`);
    if(p.aeroDownforceClA>0&&!(p.aeroDownforceFrontBias>0&&p.aeroDownforceFrontBias<1))errors.push(`${id}: invalid aero balance`);
  }
  return {ok:errors.length===0,errors};
}
