// World Drive V21.23.3 — generalized cars + multi-axle tractor profiles.
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
      bodyStyle:'compact-electric-crossover',
      asset:'id4_2021.glb',
      glbPreferred:true,
      glbRole:'full-vehicle-reference',
      referenceStyle:'volkswagen-id4-2021'
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
      // Power R1 — road-speed capability is separate from the theoretical
      // sixth-gear redline used for physical gearing/RPM.
      powertrainTopSpeedKmh:225,
      bodyLength:4.60,
      bodyWidth:1.80,
      // More immediate than ID4, but not supercar-like.
      // 2024 6MT: ~5.5 s 0-60 mph and 156 ft 70-0 mph.
      // accel remains the fallback for legacy/non-torque paths. Power R1
      // derives forward acceleration from crank torque and gearing instead.
      accel:6.36,
      brake:10.42,
      reverseAccel:3.5,
      // Physical resistance calibration for the torque-driven WRX path.
      rolling:0.18,
      aero:0.00032,
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
      redlineRpm:6100,
      gearCount:6,

      // Power R1 — 2024 WRX VB 2.4T / 6MT physical powertrain. Subaru rates
      // 258 lb-ft (~350 Nm) from 2000-5200 rpm and 271 hp at 5600 rpm.
      powertrainModel:'torque',
      peakPowerHp:271,
      peakPowerRpm:5600,
      // Power R2 — broaden the low/mid-rpm torque band for the requested WRX
      // punch while keeping the 4600-5600 rpm power plateau near ~202 kW
      // (~271 hp). This improves in-gear response without raising road top speed.
      peakTorqueNm:420,
      torqueCurveNm:[
        [850,200],
        [1200,280],
        [1600,370],
        [1800,420],
        [4600,420],
        [5200,372],
        [5600,345],
        [6100,300]
      ],
      finalDriveRatio:4.111,
      driveWheelRadiusM:0.3265,
      drivetrainEfficiency:0.86,
      launchClutchRpm:2000,
      launchClutchFadeMps:5.5,

      // Real close-ratio 6MT gearing. The theoretical 6th-gear redline speed
      // remains separate from the vehicle road-speed cap above.
      referenceRedlineRpm:6100,
      referenceTopGearRedlineKmh:274,
      referenceTopGearRatio:0.667,
      gearRatios:[3.455,1.947,1.367,1.029,0.825,0.667],
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
      rearWing:true,
      asset:'subaru_wrx_vb.glb',
      glbPreferred:true,
      glbRole:'full-vehicle-reference',
      referenceStyle:'subaru-wrx-vb'
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
      color:'black',
      asset:'2006_honda_civic_si.glb',
      glbPreferred:true,
      glbRole:'full-vehicle-reference',
      referenceStyle:'honda-civic-si-2006'
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
      color:'white',
      asset:'2006_hyundai_sonata.glb',
      glbPreferred:true,
      glbRole:'full-vehicle-reference',
      referenceStyle:'hyundai-sonata-2006'
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
      color:'red-white',
      asset:'f1_2010_ferrari.glb',
      glbPreferred:true,
      glbRole:'full-vehicle-reference'
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
      // V21.24.10 — progressive gamepad steering curve. Small stick inputs
      // produce fine road-wheel corrections, while the last part of travel
      // ramps up more aggressively and still reaches the full steering lock.
      steeringInputExponent:1.65,
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
      bodyBaseY:-.38,
      color:'red',
      rearWing:true,
      asset:'countach_80.glb',
      sourceAsset:'countach_80_real.glb',
      glbPreferred:true,
      glbRole:'full-vehicle-reference',
      referenceStyle:'1989-countach'
    }
  },


  semi_6x4:{
    id:'semi_6x4',
    name:'Camion routier + remorque',
    description:'Tracteur 6x4 articulé · modèle 3D Saia LTL Freight',

    physics:{
      drivetrain:'RWD',
      vehicleClass:'tractor',

      // Representative North-American sleeper tractor. This is intentionally
      // generic rather than tied to one manufacturer/model.
      massKg:8600,
      cgHeight:1.18,
      trackWidth:2.04,
      frontWeightBias:0.35,
      brakeBiasFront:0.28,
      driveBiasFront:0.00,
      yawInertiaScale:1.34,
      longitudinalAccelLimit:5.6,
      bodyLength:8.55,
      bodyWidth:2.55,
      topSpeedKmh:105,
      reverseTopSpeedKmh:18,

      // Loaded-combination calibration. Trailer mass is applied separately by
      // truck-trailer.js so bobtail/trailer variants can later share this cab.
      accel:2.05,
      // Approximate usable wheel power after drivetrain losses. Runtime truck
      // acceleration follows P/(m*v), while low gears are traction/torque capped.
      tractivePowerKw:340,
      brake:5.20,
      reverseAccel:1.05,
      // Heavy-truck coast losses are kept physically plausible. Propulsion is
      // already power-limited in truck-trailer.js, so giant arcade aero drag is
      // neither necessary nor desirable for hill-climb behaviour.
      rolling:0.080,
      aero:0.00012,

      // Effective steering-axle -> tandem-centre wheelbase. Individual axle
      // locations below are preserved by normalizePhysics().
      wheelbase:5.45,
      // Modern highway tractors commonly offer ~45–50° wheel cut. Keep the
      // normal low-speed rack close to V21.23.1, then add the extra travel only
      // in the parking/hairpin envelope so highway steering stays familiar.
      maxSteerLow:0.64,
      maxSteerHigh:0.095,
      parkingSteerBoost:0.38,
      steeringInputExponent:1.16,
      steeringResponseLow:2.15,
      steeringResponseMid:2.45,
      steeringResponseHigh:2.70,
      steeringReturnRateLow:3.0,
      steeringReturnRateHigh:3.8,
      steeringCenterToFullTimeSec:1.05,
      steeringReturnToCenterTimeSec:0.78,
      roadGripMultiplier:0.94,
      lateralAccelLimit:4.15,
      // V21.23.3: loaded highway-tractor suspension. The first truck candidate
      // reused a very soft/long-travel visual setup (0.22 m @ 9.5 response),
      // which made the 27.1 t combination wallow. Keep enough travel for
      // uneven roads, but use a much faster, more heavily controlled spring.
      suspensionTravel:0.14,
      suspensionResponse:18.5,
      offroadGrip:0.48,
      offroadDrag:1.75,

      // Three physical tractor axles: one steer axle and a driven tandem.
      // Dual rear tires are represented as four wheel contacts per axle.
      axles:[
        {
          id:'steer',
          positionM:2.12,
          staticLoadFraction:0.35,
          steerFactor:1,
          driveShare:0,
          brakeShare:0.28,
          trackWidth:2.04,
          wheelCount:2
        },
        {
          id:'drive-1',
          positionM:-2.72,
          staticLoadFraction:0.33,
          steerFactor:0,
          driveShare:0.50,
          brakeShare:0.36,
          trackWidth:1.86,
          wheelCount:4
        },
        {
          id:'drive-2',
          positionM:-4.02,
          staticLoadFraction:0.32,
          steerFactor:0,
          driveShare:0.50,
          brakeShare:0.36,
          trackWidth:1.86,
          wheelCount:4
        }
      ],

      coupling:{
        type:'fifth-wheel',
        rearHitchOffsetM:-3.45,
        supportsArticulation:true,
        maxArticulationRad:1.43
      }
    },

    trailer:{
      id:'dryvan_53',
      type:'dry-van',
      name:'Remorque fourgon 53 pi',
      lengthM:16.15,
      widthM:2.60,
      heightM:4.05,
      massKg:18500,
      kingpinToCenterM:7.05,
      kingpinToAxlesM:11.75,
      axleSpreadM:1.22,
      axleCount:2,
      wheelCount:8,
      brakeDecel:4.80,
      rollingResistanceAccel:0.035,
      aeroDragCoeff:0.000025,
      yawInertiaScale:1.0,
      tireCorneringResponse:3.6,
      maxArticulationRad:1.43
    },

    audio:{
      type:'combustion',
      // Reuse a proven combustion voice for now; the very low RPM calibration
      // makes it substantially deeper. A dedicated diesel sample bank can be
      // added without touching the truck physics.
      profile:'sonata-sport',
      idleRpm:600,
      redlineRpm:2200,
      gearCount:12,
      referenceRedlineRpm:2200,
      referenceTopGearRedlineKmh:105,
      referenceTopGearRatio:1,
      gearRatios:[14.40,11.20,8.70,6.80,5.30,4.10,3.20,2.48,1.93,1.50,1.20,1.00],
      shiftDuration:0.42,
      downshiftDuration:0.34,
      revLimiterHz:7.0,
      revLimiterDropRpm:90,
      cylinders:6
    },

    visual:{
      type:'semi-tractor-glb',
      profile:'semi_6x4',
      rideHeight:0.48,
      bodyBaseY:-.08,
      asset:'saia_ltl_freight_truck_half_trailer.glb',
      glbPreferred:true,
      glbRole:'articulated-tractor-trailer-reference',
      color:'saia-red'
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
      type:'compact-ev-glb',
      profile:'i3_2017',
      rideHeight:0.33,
      asset:'2017_bmw_i3.glb',
      glbPreferred:true,
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

  const configuredAxles=Array.isArray(physics.axles)?physics.axles:[];
  if(configuredAxles.length>=2){
    physics.axles=configuredAxles.map((axle,index)=>({
      id:axle.id||`axle-${index}`,
      positionM:Number.isFinite(Number(axle.positionM))?Number(axle.positionM):frontAxleX+(rearAxleX-frontAxleX)*(index/Math.max(1,configuredAxles.length-1)),
      staticLoadFraction:Math.max(.01,Number(axle.staticLoadFraction)||1/configuredAxles.length),
      steerFactor:Number.isFinite(Number(axle.steerFactor))?Number(axle.steerFactor):(index===0?1:0),
      driveShare:Math.max(0,Number(axle.driveShare)||0),
      brakeShare:Math.max(0,Number(axle.brakeShare)||0),
      trackWidth:Math.max(.8,Number(axle.trackWidth)||trackWidth),
      wheelCount:Math.max(1,Math.round(Number(axle.wheelCount)||2))
    }));

    for(const key of ['staticLoadFraction','driveShare','brakeShare']){
      const total=physics.axles.reduce((sum,axle)=>sum+Math.max(0,Number(axle[key])||0),0);
      if(total>1e-8){
        for(const axle of physics.axles)axle[key]=Math.max(0,Number(axle[key])||0)/total;
      }
    }
  }else{
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
  }

  // Coupling metadata is profile-defined for articulated vehicles. Passenger
  // cars retain the historical generic rear attachment point.
  physics.coupling={
    rearHitchOffsetM:-physics.bodyLength*.48,
    supportsArticulation:true,
    ...(physics.coupling||{})
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
