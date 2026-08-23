World Drive V21.24.84 — Sonata centered front steering pivots

Base: V21.24.83.

Fix:
- keeps the working centered wheel-roll pivots from V21.24.83;
- stops rotating the authored front wheel_rf_dummy nodes directly, because their origins are offset from the hub;
- adds a dedicated hub-centered steering pivot for each front wheel;
- front steering and wheel rolling now share the same wheel-center point.

Unchanged:
- rear lighting / brake / reverse / indicators;
- dark 80% glass;
- vehicle physics and suspension.
