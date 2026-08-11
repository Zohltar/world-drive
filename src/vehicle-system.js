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
      topSpeedKmh:200,
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
      offroadGrip:0.70,
      offroadDrag:0.95
    },

    audio:{
      type:'combustion',
      profile:'boxer-turbo',
      idleRpm:850,
      redlineRpm:6700,
      gearCount:6
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
      topSpeedKmh:200,
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
      offroadGrip:0.62,
      offroadDrag:1.04
    },

    audio:{
      type:'combustion',
      profile:'civic',
      idleRpm:750,
      redlineRpm:6800,
      gearCount:6
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
      topSpeedKmh:200,
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
      offroadGrip:0.60,
      offroadDrag:1.06
    },

    audio:{
      type:'combustion',
      profile:'sonata-sport',
      idleRpm:750,
      redlineRpm:6500,
      gearCount:6
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
      topSpeedKmh:350,
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
      steeringResponseHigh:10.0,

      // Higher asphalt grip / lateral-G ceiling.
      roadGripMultiplier:1.72,
      lateralAccelLimit:18.5,

      offroadGrip:0.34,
      offroadDrag:2.25
    },

    audio:{
      type:'combustion',
      profile:'f1-v8',
      idleRpm:3200,
      redlineRpm:12000,
      gearCount:7,
      topSpeedKmh:350,
      shiftPoints:[72,124,174,224,270,312,350],
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

  i3_2017:{
    id:'i3_2017',
    name:'BMW i3 2017 blanche/noire',
    description:'Citadine électrique propulsion',

    physics:{
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
