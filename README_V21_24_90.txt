World Drive V21.24.90 — BMW i3 inner rim ring animation fix

Change summary:
- based on V21.24.89;
- keeps +20% visual size, working tire/rim rotation and front-only steering;
- explicitly animates the separate inner circular rim faces at x≈±0.69 which remained fixed behind Carro_Roda;
- each inner ring now uses the same wheel center, spin and front steering transform as its corresponding tire/rim;
- brake-disc ghost remains hidden; body/suspension geometry is not intentionally moved.

Validation focus:
- steer the front wheel outward: there should no longer be a stationary inner-mag ring left behind.
