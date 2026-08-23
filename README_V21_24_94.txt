World Drive V21.24.94 — BMW i3 unified wheel steering pivots

Change summary:
- based on V21.24.93;
- preserves the successful complete wheel-volume animation;
- uses the tire quadrant centers as the canonical wheel centers;
- forces rim, brake disc and inner-mag auxiliary pieces to use exactly those same pivots;
- fixes the ~5.6 cm lateral pivot mismatch between tire and rim that became visible during steering.

Validation focus:
1. front tire and mag stay perfectly aligned while steering;
2. wheel rolling remains correct;
3. rear wheels remain unsteered.
