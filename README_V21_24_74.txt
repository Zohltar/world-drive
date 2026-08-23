World Drive V21.24.74 — Sonata brake red-zone only fix

Change summary:
- keeps V21.24.69 turn-signal logic and current reverse/amber behavior;
- keeps the authored-light rendering approach from the previous candidate;
- limits brake/running red activation to the red portions only on BOTH rear lamp meshes;
- specifically adds the same kind of zone isolation used for the reverse and indicator paths so braking cannot light the reverse or indicator sections.

Validation focus:
1. braking lights only the red portion;
2. reverse white remains off unless reversing;
3. amber rear indicator remains off unless blinking.
