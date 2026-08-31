import {createVehicleSystem} from '../src/vehicle-system.js';
import {createPerWheelShadowSolver} from '../src/physics/per-wheel-shadow-solver.js';
import {blendDriftForce} from '../src/physics/drift-force-coupling.js';
import {
  longitudinalTractionLimit,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  yawResponseRate
} from '../src/vehicle-dynamics.js';
import {advanceYawAuthority} from '../src/physics/yaw-authority.js';

const DEG=Math.PI/180;
const ids=['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017'];

function contactsFor(v){
  const half=(Number(v.trackWidth)||1.55)*.5;
  const wb=Number(v.wheelbase)||2.7;
  const fb=Number(v.frontWeightBias)||.55;
  const frontZ=(1-fb)*wb,rearZ=-fb*wb;
  return [
    {localX:-half,localZ:rearZ,front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
    {localX:-half,localZ:frontZ,front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
    {localX: half,localZ:rearZ,front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
    {localX: half,localZ:frontZ,front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
  ];
}

function bin(betaDeg){
  if(betaDeg<=5)return '0-5';
  if(betaDeg<=15)return '5-15';
  return '15+';
}

const sys=createVehicleSystem({initialId:ids[0]});
const summary={};
const worst=[];
for(const id of ids){
  if(sys.activeId!==id)sys.select(id);
  const v=sys.physics;
  const contacts=contactsFor(v);
  const useLegacy=v?.legacyDriftAssist!==false;
  const stats={samples:0,legacyNonzero:0,lowAuthorityLegacy:0,highAuthorityLegacy:0,maxLegacy:0,maxDelta:0,bins:{'0-5':0,'5-15':0,'15+':0}};
  for(const speed of [8,15,25,40,60]){
    for(const steerDeg of [3,7,12,20]){
      for(const throttle of [0,.5,1]){
        const steer=steerDeg*DEG;
        const requestedDrive=(Number(v.accel)||0)*throttle;
        const mu=Math.max(.25,(Number(v.longitudinalAccelLimit)||Number(v.brake)||9.8)/9.80665);
        const drive=longitudinalTractionLimit({vehicle:v,requestedAccel:requestedDrive,surfaceMu:mu,mode:'drive',airborne:false,speedAbs:speed},{});
        const env=lateralDynamicsEnvelope({vehicle:v,speed,steerAngle:steer,steerInput:1,driveThrottle:throttle,onPavement:true,surfaceGrip:1,awdOffroadGripBonus:1,rearSlipAmount:0,airborne:false},{});
        const requestedLat=Math.min(env.requestedLatAccel,env.latLimit);
        let grip={smoothed:[0,0,0,0]};
        for(let i=0;i<12;i++){
          grip=estimateWheelGripUsage({
            requestedLatAccel:requestedLat,
            signedLatAccel:Math.sign(env.signedLatAccel||steer||1)*requestedLat,
            latLimit:env.latLimit,longitudinalAccel:drive.acceleration,
            requestedPropulsionAccel:requestedDrive,appliedPropulsionAccel:drive.acceleration,
            propulsionAccel:drive.acceleration,serviceBrakeAccel:0,surfaceMu:mu,
            throttle,handbrake:false,airborne:false,vehicle:v,speedAbs:speed,
            dt:1/60,contacts,previousUsage:grip.smoothed||[0,0,0,0]
          },grip);
        }
        for(const betaDeg of [0,2.5,5,10,20,40]){
          const beta=betaDeg*DEG;
          const solver=createPerWheelShadowSolver({hz:120,maxSubSteps:8});
          let physical=null;
          for(let i=0;i<20;i++){
            physical=solver.advance(1/120,{
              vehicleId:id,vehicle:v,contacts,speed,heading:0,velocityHeading:beta,
              yawRate:env.yawRate*.15,centerSteerAngle:steer,
              longitudinalAccel:drive.acceleration,
              lateralAccel:Math.sign(env.signedLatAccel||1)*requestedLat,
              requestedDriveAccel:drive.acceleration,requestedBrakeAccel:0,
              handbrake:false,surfaceId:'asphalt-dry'
            });
          }
          const rearLoss=Math.abs(env.signedLatAccel)>.15?1-(Number(grip.rearLateralForceScale)||1):0;
          const r=advanceYawAuthority({
            yawRate:env.yawRate,dynamicYawRate:0,dt:1/120,
            yawResponse:yawResponseRate({vehicle:v,speedAbs:speed,airborne:false}),
            jTurnLatchedActive:false,requestedLatAccel:env.requestedLatAccel,latLimit:env.latLimit,
            frontSlipAmount:grip.frontLateral,rearSlipAmount:grip.rearLateral,
            airborne:false,useLegacyDriftAssist:useLegacy,drivetrain:env.drivetrain,
            powerCorneringLoad:env.powerCorneringLoad,steer:1,powerOversteerYaw:v.powerOversteerYaw??.035,
            speedAbs:speed,speed,steeringTravelSpeed:speed,handbrake:false,
            currentSideslip:beta,frictionYawAccel:grip.frictionYawAccel,
            rearLateralForceLoss:rearLoss,physicalTireYawAccel:physical?.predictedYawAccel,
            targetFrontSlip:grip.frontLateral,targetRearSlip:grip.rearLateral,
            frontLateralForceScale:grip.frontLateralForceScale,rearLateralForceScale:grip.rearLateralForceScale
          });
          const noLegacyAccel=blendDriftForce(0,r.physicalTireYawAccel,r.driftPhysicalAuthority);
          const delta=r.authoritativeYawAccel-noLegacyAccel;
          const mag=Math.abs(r.legacyYawAccel);
          stats.samples++;
          stats.maxLegacy=Math.max(stats.maxLegacy,mag);
          stats.maxDelta=Math.max(stats.maxDelta,Math.abs(delta));
          if(mag>.05){
            stats.legacyNonzero++;
            stats.bins[bin(betaDeg)]++;
            if(r.driftPhysicalAuthority<.12)stats.lowAuthorityLegacy++;
            else stats.highAuthorityLegacy++;
            worst.push({id,speed,steerDeg,throttle,betaDeg,legacy:r.legacyYawAccel,physical:r.physicalTireYawAccel,authority:r.driftPhysicalAuthority,delta,targetYaw:r.yawRate,front:grip.frontLateral,rear:grip.rearLateral});
          }
        }
      }
    }
  }
  summary[id]=stats;
}

worst.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
console.log('=== B7 LEGACY GRIP YAW AUDIT SUMMARY ===');
console.table(Object.entries(summary).map(([id,s])=>({id,...s,bins:JSON.stringify(s.bins)})));
console.log('\nLargest legacy-only yaw deltas:');
console.table(worst.slice(0,30).map(r=>({
  ...r,
  legacy:+r.legacy.toFixed(3),physical:+r.physical.toFixed(3),authority:+r.authority.toFixed(3),delta:+r.delta.toFixed(3),targetYaw:+r.targetYaw.toFixed(3),front:+r.front.toFixed(3),rear:+r.rear.toFixed(3)
})));

const active=Object.entries(summary).filter(([id,s])=>id!=='f1_2010'&&s.legacyNonzero>0);
if(!active.length)throw new Error('Audit found no remaining legacy yaw contribution; verify sampling');
if(summary.f1_2010.legacyNonzero!==0)throw new Error('F1 R23 unexpectedly uses legacy grip yaw');
const low=sum(active.map(([,s])=>s.lowAuthorityLegacy));
const high=sum(active.map(([,s])=>s.highAuthorityLegacy));
console.log('\nAUTHORITY DISTRIBUTION',{lowAuthorityLegacy:low,highAuthorityLegacy:high,lowFraction:low/Math.max(1,low+high)});
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
