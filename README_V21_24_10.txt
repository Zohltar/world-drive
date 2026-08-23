World Drive V21.24.10 — Countach progressive steering

Changes vs V21.24.9:
- Countach steering input is now non-linear using steeringInputExponent=1.65;
- small joystick movements produce much smaller road-wheel angles;
- steering ramps progressively as the stick approaches full travel;
- 100% stick still reaches the same maximum road-wheel lock;
- authored GLB steering wheel remains synchronized to the actual steering rack;
- no change to grip, suspension, power, braking, camera, lights, terrain, or other vehicles.

Approximate low-speed mapping before rack dynamics:
- 25% stick -> 10% steering command
- 50% stick -> 32%
- 75% stick -> 62%
- 100% stick -> 100%
