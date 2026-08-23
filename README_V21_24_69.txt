World Drive V21.24.69 — Sonata true amber UV / mesh fix

Fixes:
- rear amber indicators now use the actual GLB mesh that owns the amber pixels (Object_33);
- front amber mask now reads the raw authored texture color instead of the darkened vertex-color result;
- red running/brake and white reverse behavior preserved;
- front square light cards remain removed;
- turn signal behavior now matches requested vehicle logic:
  * activates only at a stop with strong steering lock;
  * remains latched while moving;
  * cancels only when steering returns within ±10% of neutral;
  * visible blink cadence retained.

No physics changes.
