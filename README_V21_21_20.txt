World Drive V21.21.20 — Graphics Recovery Candidate

Base: V21.21.19 Right-Lane Assist Candidate.
Physics, lane assist, terrain-road-bed behavior and frame-pacing architecture are preserved.

Changes:
- Restores the WebGL stencil buffer so the existing road/shoulder stencil ownership works again.
  Transparent hydro surfaces use NotEqual against road stencil ref 1 and therefore cannot draw
  over visible road pixels.
- Enlarges the near terrain + imagery patch from 2000 m to 2400 m.
- Uses 192 near-terrain segments (modest density increase; road-bed transition remains unchanged).
- Increases world streaming distance scale:
    Low    .78 -> .90
    Medium 1.00 -> 1.16
    High   1.35 -> 1.55
- Road profile ribbon sampling tightened from <=5 m to <=4 m.
- Asphalt procedural texture raised 128 -> 256 and anisotropy up to 8x.
- Keeps native WebGL MSAA and raises the adaptive render-scale ladder modestly:
    level 0: 1.00 -> 1.08
    level 1: .92  -> .96
    level 2: .80  -> .84
    level 3: .72  -> .76
- No FXAA or post-processing is reintroduced.

Expected tradeoff:
Slightly higher GPU bandwidth/triangle cost and somewhat earlier/more DEM + imagery prefetch traffic,
in exchange for cleaner lane markings, less visible terrain arrival and correct road-over-river compositing.
