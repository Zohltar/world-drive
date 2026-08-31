import fs from 'node:fs';

function read(file){return fs.readFileSync(file,'utf8');}
function write(file,text){fs.writeFileSync(file,text);}
function replaceAllChecked(text,from,to,label,min=1){
  const count=text.split(from).length-1;
  if(count<min)throw new Error(`B7 ${label}: expected at least ${min}, got ${count}`);
  return text.split(from).join(to);
}

// Single yaw owner: rename the retained low-physical-authority aggregate grip-loss
// fallback to its actual role. No math, thresholds or coefficients change.
{
  const file='src/physics/yaw-authority.js';
  let s=read(file);
  s=replaceAllChecked(s,'legacyGripYawAcceleration','gripLossFallbackYawAcceleration','owner function name');
  s=replaceAllChecked(s,'const legacyYawAccel=useLegacyDriftAssist','const fallbackYawAccel=useLegacyDriftAssist','fallback local');
  s=replaceAllChecked(s,'    legacyYawAccel,\n    physicalYaw,','    fallbackYawAccel,\n    physicalYaw,','blend input');
  s=replaceAllChecked(s,'    legacyYawAccel,authoritativeYawAccel','    fallbackYawAccel,authoritativeYawAccel','return property');
  const marker=`export function gripLossFallbackYawAcceleration({\n`;
  const comment=`// Cleanup B7 — retained aggregate grip-loss yaw fallback.\n//\n// This is not a second free-running yaw controller. estimateWheelGripUsage()\n// can measure an axle-force-loss moment at 20 Hz before the high-sideslip R7\n// per-wheel solver has meaningful authority. In that low-authority transition\n// this filtered aggregate moment supplies missing grip-loss yaw; blendDriftForce()\n// progressively replaces it with the physical per-wheel yaw moment as\n// driftPhysicalAuthority rises. R16/R21 suppress front-dominated opposing\n// moments so ordinary understeer cannot become counter-yaw. Profiles such as\n// the F1 opt out through legacyDriftAssist=false.\n`;
  if(!s.includes(marker))throw new Error('B7 owner marker missing');
  s=s.replace(marker,comment+marker);
  write(file,s);
}

// Compatibility export boundary follows the truthful name; do not keep an alias
// that invites future code to treat this fallback as general legacy yaw authority.
{
  const file='src/driving-runtime-base.js';
  let s=read(file);
  s=replaceAllChecked(s,'legacyGripYawAcceleration','gripLossFallbackYawAcceleration','runtime export rename');
  write(file,s);
}

// R16 still owns the safety invariant, but now calls the accurately named fallback.
{
  const file='qa-grip-fwd-power-r16.mjs';
  let s=read(file);
  s=replaceAllChecked(s,'legacyGripYawAcceleration','gripLossFallbackYawAcceleration','R16 import/calls');
  s=s.replace('const legacy=gripLossFallbackYawAcceleration({','const fallback=gripLossFallbackYawAcceleration({');
  s=s.replace('return {env,grip,legacy};','return {env,grip,fallback};');
  s=s.replaceAll('r.legacy','r.fallback');
  s=s.replaceAll('filteredYaw:Number(r.fallback.toFixed(3))','filteredYaw:Number(r.fallback.toFixed(3))');
  write(file,s);
}

// B5 equivalence reference remains mathematically identical while its terminology
// tracks the post-audit ownership semantics.
{
  const file='qa-yaw-authority-b5.mjs';
  let s=read(file);
  s=replaceAllChecked(s,'oldLegacyGripYawAcceleration','referenceGripLossFallbackYawAcceleration','B5 reference rename');
  s=replaceAllChecked(s,'legacyGripYawAcceleration','gripLossFallbackYawAcceleration','B5 public rename');
  s=replaceAllChecked(s,'legacyYawAccel','fallbackYawAccel','B5 result rename');
  s=s.replace('legacy yaw compatibility export changed','grip-loss fallback compatibility export changed');
  s=s.replace('legacy yaw filter still locally owned by runtime','grip-loss fallback still locally owned by runtime');
  s=s.replace('physical-vs-legacy yaw blend','physical-vs-fallback yaw blend');
  write(file,s);
}

// R23 should verify that F1 opts out of the retained fallback, without calling
// it a general legacy yaw source.
{
  const file='qa-grip-f1-legacy-r23.mjs';
  let s=read(file);
  s=replaceAllChecked(s,'const legacyYawAccel=useLegacyDriftAssist','const fallbackYawAccel=useLegacyDriftAssist','R23 source marker');
  s=s.replace('legacy grip yaw is not gated','grip-loss fallback yaw is not gated');
  write(file,s);
}

console.log('CLEANUP B7 FALLBACK YAW SEMANTIC RENAME PATCH: PASS');
