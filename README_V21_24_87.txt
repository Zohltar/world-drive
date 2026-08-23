World Drive V21.24.87 — BMW i3 wheel-center ghost removal

Change summary:
- based on V21.24.86;
- preserves the +20% scale, full wheel rotation, and front-only steering;
- hides the Carro_Freio_Disco sub-mesh, which appears visually as a static duplicate mag/center ghost while the wheel spins;
- leaves all other vehicle behavior unchanged.

Validation focus:
1. no stationary ghost mag remains at wheel center;
2. tire + rim still rotate correctly;
3. only front wheels steer.
