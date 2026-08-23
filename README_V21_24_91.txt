World Drive V21.24.91 — BMW i3 complete inner-mag animation

Change summary:
- based on V21.24.90;
- keeps +20% size, tire/rim rotation, front-only steering, wheel-center logo animation and current lighting;
- adds the remaining inner mag geometry authored in Carro_Metal_Preto (without _1);
- selects those vertices only inside a tight cylinder around each wheel hub, preventing nearby body trim from moving;
- selected inner-mag vertices now receive the exact same spin + steering transform as the corresponding wheel.

Validation:
- with the front wheel strongly steered, no mag segment should remain aligned with the body.
