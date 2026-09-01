import fs from 'node:fs';
import {ensureWorldDriveDiagnostics,installDiagnosticAlias} from '../src/diagnostics.js';

const main=fs.readFileSync('src/main.js','utf8');
const runtimeBase=fs.readFileSync('src/driving-runtime-base.js','utf8');

const target={};
const root=ensureWorldDriveDiagnostics(target);
root.physics.shadow=()=>({token:1});
const alias=installDiagnosticAlias('WorldDrivePhysicsShadow',()=>root.physics.shadow,target);
if(target.WorldDrivePhysicsShadow!==alias)throw new Error('DevTools alias was not installed');
if(alias()?.token!==1)throw new Error('DevTools alias does not call canonical physics shadow');
root.physics.shadow=()=>({token:2});
if(alias()?.token!==2)throw new Error('DevTools alias captured a stale callable');
if(ensureWorldDriveDiagnostics(target)!==root)throw new Error('diagnostics root identity changed');
if(ensureWorldDriveDiagnostics(target).physics!==root.physics)throw new Error('physics category identity changed');

if(!main.includes('worldDriveDiagnostics.physics.shadow=()=>'))throw new Error('canonical physics-shadow callable missing');
if(!/installDiagnosticAlias\(\s*'WorldDrivePhysicsShadow',\s*\(\)=>worldDriveDiagnostics\.physics\.shadow,\s*window\s*\)/s.test(main))throw new Error('live DevTools compatibility alias missing');
if(/window\.WorldDrivePhysicsShadow\s*=/.test(main))throw new Error('independent legacy writer remains');
if(!runtimeBase.includes('const physicsShadow=createPerWheelShadowSolver({hz:120,maxSubSteps:8});'))throw new Error('shadow solver cadence changed');
if(!runtimeBase.includes('physicsShadow.advance(dt,{'))throw new Error('shadow solver advance hook missing');
if(!runtimeBase.includes('physicsShadowDiagnostics:()=>physicsShadow.diagnostics()'))throw new Error('shadow snapshot API changed');

console.log('CLEANUP C6.6 PHYSICS SHADOW DIAGNOSTICS QA: PASS');
