World Drive V21.24.72 — Sonata V21.24.66 visuals + V21.24.69 logic

Goal:
- keep the turn-signal behavior and mesh ownership fixes from V21.24.69;
- recover the preferred rear-light visual look associated with V21.24.66.

Targeted changes:
- retained the V21.24.69 steering-driven turn-signal logic exactly;
- retained rear amber indicator ownership on Object_33;
- retained front amber detection using the raw authored texture color;
- restored an upper red glow on the outer rear lamp, but constrained it to the authored upper red UV zone only so it does not overwrite the reverse or amber sections.

Expected validation points:
1. upper outer red tail section responds for night + brake;
2. white reverse remains visible;
3. amber rear indicator remains visible;
4. front indicator behavior remains the same as V21.24.69.
