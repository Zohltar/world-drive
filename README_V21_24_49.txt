World Drive V21.24.49 — Saia exact wheel hubs

Base: V21.24.48

Fixes:
- wheel pivots are no longer inferred from partial tire/rim fragment bounds;
- exact authored axle/hub centres drive every tractor and trailer wheel;
- tire tread, tire sidewalls and rim fragments on the same axle/side all share one rigid spin pivot;
- preserves the corrected rolling direction from V21.24.48;
- preserves truck physics, articulation and the high/closer chase camera.

Why:
The Saia GLB splits some wheels into incomplete quadrants. In V21.24.48 the first fragment could establish an off-centre hub (one trailer fragment was about 0.10 m high), causing apparent quarter/tread wobble while spinning.
