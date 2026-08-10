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
      accel:6.2,
      brake:9.2,
      reverseAccel:3.2,
      rolling:0.32,
      aero:0.0009,
      wheelbase:2.77,
      maxSteerLow:0.43,
      maxSteerHigh:0.115,
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
      // More immediate than ID4, but not supercar-like.
      accel:7.15,
      brake:10.6,
      reverseAccel:3.5,
      rolling:0.34,
      aero:0.0010,
      wheelbase:2.65,
      maxSteerLow:0.46,
      maxSteerHigh:0.135,
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
