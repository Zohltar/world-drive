Packaging note — V21.24.64

Built from V21.24.63.

Added:
- src/sonata-glb.js
- src/assets/2006_hyundai_sonata.glb

Modified:
- src/main.js
- src/vehicle-system.js

Static QA:
- node --check src/sonata-glb.js: PASS
- node --check src/main.js: PASS
- node --check src/vehicle-system.js: PASS
- source wheel geometry inspected: wheelbase ~2.83 m, track ~1.68 m after normalization
