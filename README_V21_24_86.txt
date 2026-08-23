World Drive V21.24.86 — BMW i3 scale + wheel axis fix

Changes vs V21.24.85:
- i3 visual model enlarged by 20% (target visual length ~4.812 m);
- corrected GLB local-axis interpretation: local X is wheel axle, local Y is longitudinal, local Z is vertical;
- combined tire and brake-disc mesh now splits into the four actual wheel quadrants using local X/Y;
- all tire/rim/disc wheel parts rotate around local X together;
- steering now rotates around local Z (world vertical);
- only local-Y<0/front axle wheel groups receive steering; rear wheels remain straight;
- rendered wheel radius increased 20% in angular-speed calculation so rolling rate matches the enlarged model.

Unchanged:
- i3 physics/dynamics;
- lighting;
- materials;
- all other vehicles and world systems.
