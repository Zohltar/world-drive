WORLD DRIVE V21.22.3 — HITCH-FREE STREAMING CANDIDATE

Base stable
- V21.21.27 remains the stable baseline.

Base candidate
- V21.22.2 near-quality medium terrain.

Goal
- Remove periodic micro-stutters while preserving the V21.22.2 visual quality.
- Optimize frame-time consistency, not average FPS.

Main-thread hitch sources removed
1. Route-ahead DEM prefetch is now cache-only.
   - Old path: every completed batch could schedule rebuildLocalWorld(), throttled only to 2.4 s.
   - New path: completion never mutates visible geometry.
2. DEM/hydro network completion no longer launches an immediate full world rebuild while driving.
   - Data marks the world dirty and is folded into a calm/recenter refresh.
3. Floating origin uses a cheap render-space shift at 520 m.
   - No geometry allocation/disposal on the normal 520 m recenter.
   - Full local-world refresh target moved to 1450 m and prefers a near-stopped vehicle.
   - 2200 m is the hard safety threshold.
4. Proactive imagery mosaic rebuild is suppressed while actively driving.
   - Route-ahead image tile prefetch stays active.
   - Normal streaming remains authoritative for required imagery.
5. Static directional shadow map is no longer timer-refreshed every ~500 ms.
   - It refreshes only after static world geometry changes.
6. Five-second performance console logging is disabled by default.

Diagnostics
- window.WorldDriveFramePacing() returns hitch count, max frame time, pending stream refresh state, FPS and world centers without periodic logging.

Preserved
- V21.22.2 5.6 km high-detail DEM/imagery terrain.
- V21.22.1 dense medium/far horizon rings.
- V21.22.0 distant terrain colour/haze.
- Vehicle physics and presentation unchanged.
