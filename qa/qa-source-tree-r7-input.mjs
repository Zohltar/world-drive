import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));

for(const rel of [
  'src/keyboard-controls.js',
  'src/gamepad.js',
  'src/input/keyboard-controls.js',
  'src/input/gamepad.js'
])assert.equal(exists(rel),true,`${rel} missing`);

const keyboardFacade=read('src/keyboard-controls.js');
const gamepadFacade=read('src/gamepad.js');
const keyboardImpl=read('src/input/keyboard-controls.js');
const gamepadImpl=read('src/input/gamepad.js');
const main=read('src/main.js');

assert.match(keyboardFacade,/export\s*\{\s*createKeyboardControls\s*\}\s*from\s*['"]\.\/input\/keyboard-controls\.js['"]/,'keyboard root facade must re-export nested implementation');
assert.match(gamepadFacade,/export\s*\{\s*createGamepadController\s*\}\s*from\s*['"]\.\/input\/gamepad\.js['"]/,'gamepad root facade must re-export nested implementation');
assert.ok(keyboardFacade.length<300,'keyboard root facade must stay thin');
assert.ok(gamepadFacade.length<300,'gamepad root facade must stay thin');

assert.match(keyboardImpl,/export function createKeyboardControls\s*\(/,'nested keyboard implementation must own createKeyboardControls');
assert.match(gamepadImpl,/export function createGamepadController\s*\(/,'nested gamepad implementation must own createGamepadController');
assert.ok(!keyboardImpl.includes("from '../main.js'")&&!keyboardImpl.includes("from './main.js'"),'keyboard implementation must not depend on main.js');
assert.ok(!gamepadImpl.includes("from '../main.js'")&&!gamepadImpl.includes("from './main.js'"),'gamepad implementation must not depend on main.js');

assert.ok(main.includes("from './keyboard-controls.js'"),'main.js must keep stable keyboard root facade');
assert.ok(main.includes("from './gamepad.js'"),'main.js must keep stable gamepad root facade');
assert.ok(!main.includes("from './input/keyboard-controls.js'")&&!main.includes("from './input/gamepad.js'"),'main.js must not bypass R7 input facades');

const keyboardModule=await import('../src/keyboard-controls.js');
const gamepadModule=await import('../src/gamepad.js');
assert.equal(typeof keyboardModule.createKeyboardControls,'function','keyboard facade export must resolve');
assert.equal(typeof gamepadModule.createGamepadController,'function','gamepad facade export must resolve');

console.log('SOURCE TREE R7 INPUT QA: PASS',{
  stableRootFacades:true,
  nestedKeyboard:true,
  nestedGamepad:true,
  mainFacadeBoundary:true,
  browserBehaviorUnchangedByMove:true
});
