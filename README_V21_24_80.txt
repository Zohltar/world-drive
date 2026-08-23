World Drive V21.24.80 — Sonata rigid wheel-pivot animation fix

Base:
- V21.24.79 direct dark glass meshes;
- V21.24.75 validated rear lighting behavior retained.

Wheel fix:
- stops animating the matrix-authored Sonata wheel Model.* nodes directly;
- inserts dedicated steer and spin pivots at the exact four authored wheel centres;
- rolls all four wheel assemblies from vehicle speed;
- front two wheel assemblies also receive the visible steering angle;
- right-side rolling sign remains inverted to match the source's 180-degree Y bind orientation.

No changes to:
- brake/reverse/indicator lighting;
- dark 80% glazing;
- physics, suspension or vehicle dimensions.
