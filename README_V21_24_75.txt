World Drive V21.24.75 — Sonata strict authored-red brake mask

Targeted correction only:
- reverse white path unchanged from V21.24.74;
- amber indicator path and V21.24.69 signal logic unchanged;
- brake/running red mask made substantially stricter so orange indicator and neutral/white clear-lens texels cannot qualify as brake red;
- rear red UV boundary tightened with minimal feathering.

Expected behavior:
- braking illuminates only genuinely red authored texels;
- reverse area stays dark unless reversing;
- amber area stays dark unless the indicator is blinking.
