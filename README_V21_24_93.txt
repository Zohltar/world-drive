World Drive V21.24.93 — BMW i3 complete wheel-volume animation fix

Based directly on V21.24.86.

Diagnosis:
- the visible i3 mag is fragmented across Carro_Roda plus many Carro_Metal_Preto / Carro_Metal_Preto_1 submeshes;
- those auxiliary pieces remain attached to the body in V21.24.86, producing the fixed second-mag/spinner effect.

Fix:
- preserve working tire, brake-disc and Carro_Roda animation;
- derive the four true wheel centers from Carro_Roda;
- animate every black-metal/logo vertex located inside a tight 0.30 m radial wheel volume and +/-0.32 m axle slab;
- front wheel-local pieces receive steering + spin; rear pieces receive spin only;
- surrounding body/fender geometry remains outside the tight wheel volume and stays fixed.

No changes to scale, physics, lights or other vehicles.
