World Drive V21.24.2 — Real Countach source asset candidate

What changed
- Added the user-supplied real 1989 Lamborghini Countach GLB to src/assets/countach_80_real.glb
- Also copied it to src/assets/countach_80.glb so any Countach GLB pipeline can target a stable asset name immediately
- Updated the Countach visual metadata in vehicle-system.js to declare the preferred GLB asset

Why this matters
- Unlike the previous Countach pass, this is a true authored car mesh rather than a simplified box-derived export
- It provides the correct foundation for a genuinely more realistic Countach visual in World Drive

Notes
- Physics/gameplay were intentionally left untouched in this packaging pass
- Existing trucks and other vehicles remain unchanged
