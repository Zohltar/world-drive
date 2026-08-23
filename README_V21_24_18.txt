World Drive V21.24.18 — ID.4 rear LED anchor fix

Root cause fixed:
- V21.24.16/17 created the LED bars in raw FBX mesh coordinates but attached them to the GLB root.
- The detailed ID.4 has an internal 0.01 unit-conversion transform under group1, so the bars were effectively placed far away from the vehicle and could not be seen.

Changes:
- rear LED overlays are now parented to the authored group1 node, using the same coordinate space as the car meshes;
- LED bars are moved a few millimetres outward from the rear surface to avoid being hidden inside the body/glass;
- existing subtle additive glow is preserved;
- braking/reverse logic is unchanged.

Countach remains untouched.
