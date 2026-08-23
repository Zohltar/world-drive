World Drive V21.24.89 — BMW i3 full rim-component animation fix

Change summary:
- based on V21.24.88;
- keeps +20% scale, tire/rim rotation and front-only steering;
- identifies Carro_Metal_Preto_1 meshes whose vertices are essentially entirely inside the four wheel volumes;
- animates those inner-rim/spoke meshes with the same wheel spin and front steering;
- keeps body trim meshes static;
- keeps wheel-center BMW logo animation.

Expected result:
- no second fixed mag remains behind the rotating rim.
