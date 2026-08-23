World Drive V21.24.81 — Sonata true wheel-node animation fix

Base:
- V21.24.80 / V21.24.79 visuals retained.
- Dark 80% glass retained.
- Working V21.24.75 rear-light behavior retained.

Wheel fix:
- stops rotating the outer Model.016..019 placement containers;
- rotates the actual centred wheel assembly nodes wheel.029, wheel.031, wheel.035 and wheel.039;
- front steering is applied to their authored wheel_rf_dummy parent nodes;
- forces matrixAutoUpdate on the animated GLTF nodes.

No lighting or glass changes.
