World Drive V21.24.82 — Sonata sanitized wheel binding fix

Root cause addressed:
- Three.js GLTFLoader sanitizes punctuation in authored node names.
- Previous Sonata wheel code searched exact names such as `wheel.029_56`.
- If runtime exposes the node with punctuation removed/sanitized, no wheel controllers are bound and animation silently does nothing.

Fix:
- node matching now canonicalizes both authored and runtime names by removing punctuation;
- the same four true wheel roots and steering dummies from V21.24.81 are used;
- runtime console reports `Sonata authored wheel controllers: 4/4` when binding succeeds.

Preserved:
- V21.24.79 dark glazing;
- V21.24.75 rear lighting behavior;
- physics and vehicle dynamics unchanged.
