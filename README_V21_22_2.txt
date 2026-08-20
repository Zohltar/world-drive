World Drive V21.22.2 — Near-Quality Medium Terrain Candidate

Base stable: V21.21.27
Base candidate: V21.22.1

Goal
- Give the medium-distance terrain the same DEM + imagery pipeline and terrain-grid density as the near field.

Changes
- High-detail terrain/imagery footprint: 3200 m -> 5600 m.
- High-detail half extent: 1600 m -> 2800 m.
- Terrain grid: 256 -> 448 segments, preserving exactly 12.5 m spacing.
- Distant horizon starts at the new 2800 m seam instead of 1600 m.
- Route-ahead DEM/imagery warm-cache ladder extended to 5 km.
- V21.22.0 distant colour/haze and V21.22.1 dense horizon rings retained beyond the new seam.

Non-regression
- Vehicle physics/presentation files unchanged from V21.21.27.
- Road generation/material unchanged from V21.21.27/V21.22.1.
