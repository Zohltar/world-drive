import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

for(const file of [
  'src/multiplayer-authored-lighting.js',
  'src/multiplayer-hd-vehicles.js',
  'src/multiplayer-visuals.js'
]){
  execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}

const authored=fs.readFileSync('src/multiplayer-authored-lighting.js','utf8');
const hd=fs.readFileSync('src/multiplayer-hd-vehicles.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');

for(const marker of [
  "mode:'authored-glb-lamps-v1'",
  "path.includes('fh_light_glass_red_material')",
  "name:'remote-civic-tail'",
  "root.getObjectByName('Object_46')",
  "name==='carro_refletor_farol'",
  "blob.includes('signallights')",
  "'13_headlight_glass_glass_0'",
  "'REARLEDs_011_001_RearLight_0'",
  'setEmission(s.brake,0xff1018',
  'setEmission(s.reverse,0xffffff',
  'setEmission(s.headlight,0xf8fbff',
  'setEmission(s.signalLeft,0xffb21c',
  'setEmission(s.signalRight,0xffb21c'
]){
  assert(authored.includes(marker),`missing M2.5 authored lamp marker: ${marker}`);
}

for(const marker of [
  "from './multiplayer-authored-lighting.js'",
  'const lighting=createRemoteAuthoredLighting(THREE,vehicleId,root);',
  "lightingMode:lighting?.mode||'none'",
  'setLighting(state){',
  'lighting?.setState(state);',
  "authoredLighting:'authored-glb-lamps-v1'"
]){
  assert(hd.includes(marker),`missing M2.5 HD lighting controller marker: ${marker}`);
}

for(const marker of [
  "hdLightingActive=instance.lightingMode==='authored-glb-lamps-v1'",
  'if(hdLightingActive&&hdInstance?.setLighting)',
  'fallbackSetBraking?.(0);',
  'fallbackSetHeadlights?.(0,normalized.distance);',
  'if(lightingRig?.rig)lightingRig.rig.visible=false;',
  'hdInstance.setLighting(normalized);',
  "fallbackScope:'loading-only'",
  "hdSource:'authored-glb-lamps-v1'"
]){
  assert(visuals.includes(marker),`missing M2.5 authored ownership marker: ${marker}`);
}

const routeStart=visuals.indexOf('if(hdLightingActive&&hdInstance?.setLighting)');
const fallbackStart=visuals.indexOf('if(lightingRig?.rig)lightingRig.rig.visible=true;',routeStart);
assert(routeStart>=0&&fallbackStart>routeStart,'authored lighting must be selected before fallback rendering');

console.log('V21.31 MULTIPLAYER M2.5 AUTHORED LIGHTING QA: PASS',{
  fallbackScope:'loading-only',
  hdLighting:'peer-local authored GLB lamps',
  replicated:['brake','reverse','night','signal-left','signal-right'],
  oldProceduralLightsAfterHd:false
});
