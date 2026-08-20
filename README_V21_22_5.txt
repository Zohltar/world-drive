WORLD DRIVE V21.22.5 — SATELLITE TERRAIN PIPELINE REWRITE CANDIDATE

Stable baseline
- V21.21.27 remains the official stable baseline.

Candidate base
- V21.22.4 terrain preload buffer.
- V21.22.3 hitch-free frame pacing is preserved.

Root cause addressed
- The historical satellite renderer was designed around a small local patch and
  a small slippy-map mosaic.
- V21.22.2 enlarged the high-detail terrain to 5.6 km but still treated imagery
  as one monolithic texture over the whole ground.
- A clamped texture sampled outside its true geographic coverage repeats its
  edge pixels, which appears as kilometre-long green/tan radial streaks.
- Preloading alone cannot fix an imagery-coverage/UV mismatch.

V21.22.5 architecture
1. The 5.6 km / 448-segment DEM terrain remains unchanged in scope.
2. Satellite imagery is no longer assigned to groundMat.map.
3. Imagery is divided into exact georeferenced 3x3 slippy-tile chunks at z16.
4. Every chunk is published only after all nine real source tiles are present.
5. Missing chunks reveal a natural DEM/hillshade underlay; imagery is never
   stretched or repeated outside its real bounds.
6. Satellite chunk geometry samples terrainService.renderHeightAt(), including
   road excavation/start-pad geometry.
7. Chunk composition is serialized and committed on browser idle turns to avoid
   reintroducing the periodic main-thread/GPU hitches removed in V21.22.3.
8. Existing chunks survive soft floating-origin recentering and are realigned on
   a full world refresh.
9. The V21.22.4 two-dimensional DEM/imagery preload buffer remains active.
10. Near/road-bed fallback contour-line styling has been removed so unloaded
    areas remain natural rather than striped.

Preserved
- V21.22.3 hitch-free streaming/recenter behavior.
- V21.22.2 5.6 km high-detail terrain footprint and 12.5 m DEM spacing.
- V21.22.1 dense medium/far horizon.
- V21.22.0 distant terrain colour/haze.
- Vehicle physics/presentation byte-for-byte identical to V21.21.27.

User validation requested
- Repeat the Manic-2 -> Manic-5 departure shown in the V21.22.4 screenshot.
- Confirm the huge tan/green radial streaks are gone.
- Observe unloaded areas: they may temporarily show natural shaded terrain, but
  no image edge should ever stretch across the scene.
- Drive at least 60 seconds and confirm V21.22.3's zero-micro-stutter behavior.
