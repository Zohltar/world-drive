import assert from 'node:assert/strict';
import { selectTransmissionDriveDirection } from '../src/transmission-controller.js';

function dir(current,throttle,bodySpeed){
  return selectTransmissionDriveDirection({
    currentDirection:current,
    requestedThrottle:throttle,
    bodyLongitudinalSpeed:bodySpeed
  });
}

// Post-J-turn: still moving rearward by inertia, but accelerator requests D.
assert.equal(dir(1,+.8,-12),1,'post-J-turn forward throttle must keep Drive engaged');

// Coasting rearward after the spin must not magically select Reverse.
assert.equal(dir(1,0,-12),1,'rearward inertia alone must not select Reverse');

// Normal braking while still travelling forward must remain Drive.
assert.equal(dir(1,-.8,8),1,'brake pedal at forward speed must not engage Reverse');
assert.equal(dir(1,-.8,.8),1,'Reverse must not engage while appreciably moving forward');

// Once nearly stopped, the same negative pedal becomes the game's Reverse request.
assert.equal(dir(1,-.8,.2),-1,'near standstill negative pedal should engage Reverse');
assert.equal(dir(1,-.8,-2),-1,'negative pedal while already moving rearward should engage Reverse');

// Reverse remains selected while coasting or continuing to request reverse.
assert.equal(dir(-1,0,-5),-1,'Reverse coast must retain Reverse');
assert.equal(dir(-1,-.6,-5),-1,'reverse throttle must retain Reverse');

// A positive pedal is an explicit D request even while the vehicle still rolls back.
assert.equal(dir(-1,+.5,-5),1,'positive pedal must select Drive from Reverse');

console.table({
  post_j_turn:{body_mps:-12,input:+.8,direction:dir(1,+.8,-12)},
  forward_brake:{body_mps:8,input:-.8,direction:dir(1,-.8,8)},
  reverse_engage:{body_mps:.2,input:-.8,direction:dir(1,-.8,.2)},
  reverse_to_drive:{body_mps:-5,input:+.5,direction:dir(-1,+.5,-5)}
});
console.log('V21.29 TRANSMISSION DIRECTION QA: PASS');
