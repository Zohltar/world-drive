// World Drive - vehicle profile registry
// Step 15A: current vehicle becomes the ID4 profile.
// Visual model and audio implementation remain unchanged for now.
// Future profiles (WRX, etc.) can replace physics/audio/visual metadata
// without re-hardcoding values in main.js.

const PROFILES={
  id4:{
    id:'id4',
    name:'ID4',
    description:'Crossover électrique AWD',

    physics:{
      drivetrain:'AWD',
      topSpeedKmh:200,
      accel:6.2,
      brake:9.2,
      reverseAccel:3.2,
      rolling:0.32,
      aero:0.0009,
      wheelbase:2.77,
      maxSteerLow:0.44,
      maxSteerHigh:0.135,
      steeringResponseHigh:4.4,
      roadGripMultiplier:1.02,
      lateralAccelLimit:7.8,
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
      // More immediate than ID4, but not supercar-like.
      accel:7.15,
      brake:10.6,
      reverseAccel:3.5,
      rolling:0.34,
      aero:0.0010,
      wheelbase:2.65,
      maxSteerLow:0.48,
      maxSteerHigh:0.175,
      steeringResponseHigh:5.6,
      roadGripMultiplier:1.10,
      lateralAccelLimit:9.4,
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
      accel:6.7,
      brake:9.8,
      reverseAccel:3.3,
      rolling:0.33,
      aero:0.00092,
      wheelbase:2.70,
      maxSteerLow:0.49,
      maxSteerHigh:0.165,
      steeringResponseHigh:5.2,
      roadGripMultiplier:1.06,
      lateralAccelLimit:8.7,
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
      accel:6.9,
      brake:9.9,
      reverseAccel:3.3,
      rolling:0.34,
      aero:0.00095,
      wheelbase:2.80,
      maxSteerLow:0.47,
      maxSteerHigh:0.158,
      steeringResponseHigh:5.0,
      roadGripMultiplier:1.05,
      lateralAccelLimit:8.5,
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
      accel:13.2,

      // F1 carbon brakes: substantially stronger than road cars.
      brake:20.5,

      reverseAccel:2.4,
      rolling:0.38,
      aero:0.00072,
      wheelbase:3.15,

      // More steering authority at high speed.
      maxSteerLow:0.44,
      maxSteerHigh:0.165,

      // V19.2: preserve full lock, but soften tiny analog corrections and
      // reduce the very nervous high-speed steering response.
      steeringInputExponent:1.45,
      steeringResponseHigh:7.2,

      // Higher asphalt grip / lateral-G ceiling.
      roadGripMultiplier:1.72,
      lateralAccelLimit:18.5,

      // High-downforce RWD: only subtle throttle-on rear slip.
      powerOversteerGripLoss:0.035,
      powerOversteerYaw:0.018,

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

      // Fast, raw 1980s supercar: noticeably stronger than the road sedans,
      // but still far below the F1's acceleration/braking/grip envelope.
      accel:9.0,
      brake:11.8,
      reverseAccel:3.0,
      rolling:0.36,
      aero:0.00078,
      wheelbase:2.45,

      // Wide tires + unassisted old-school steering: strong low-speed lock,
      // progressively calmer at very high speed.
      maxSteerLow:0.43,
      maxSteerHigh:0.142,
      steeringResponseHigh:5.8,

      roadGripMultiplier:1.16,
      lateralAccelLimit:10.3,

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
      referenceTopGearRedlineKmh:320,
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
      topSpeedKmh:200,
      accel:6.9,
      brake:9.4,
      reverseAccel:3.5,
      rolling:0.29,
      aero:0.00082,
      wheelbase:2.57,
      maxSteerLow:0.53,
      maxSteerHigh:0.17,
      steeringResponseHigh:5.3,
      roadGripMultiplier:1.00,
      lateralAccelLimit:8.1,

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

export function createVehicleSystem({
  initialId='wrx'
}={}) {
  if(!PROFILES[initialId]){
    throw new Error(
      `Unknown initial vehicle: ${initialId}`
    );
  }

  let activeId=initialId;
  let active=clone(PROFILES[activeId]);

  // Preserve object identity so systems such as audio can hold a stable reference.
  const physics={...active.physics};

  function applyProfile(profile){
    for(const key of Object.keys(physics)){
      delete physics[key];
    }

    Object.assign(
      physics,
      profile.physics
    );
  }

  function select(id){
    if(!PROFILES[id])return false;
    if(id===activeId)return false;

    activeId=id;
    active=clone(PROFILES[id]);
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
      description:profile.description
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
