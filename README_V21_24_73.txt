World Drive V21.24.73 — Sonata authored brake preservation fix

Change summary:
- keeps the V21.24.69 turn-signal logic and mesh ownership fixes;
- keeps the V21.24.72 outer red UV isolation so reverse and amber are not overwritten;
- changes brake/running light rendering so red glow preserves more of the authored lamp texture detail instead of flattening it with an overly solid red overlay;
- slightly reduces brake red dominance so the preferred V21.24.66 rear-lamp look remains visible while braking.

Validation focus:
1. braking should no longer visually crush the .66 rear-lamp rendering;
2. reverse white and rear amber remain readable;
3. upper red section still responds for night and braking.
