World Drive V21.21.21 — Real Mass + F1 Downforce Candidate

Goal
- Replace approximate road-car masses with representative published curb masses.
- Preserve the validated V21.21.20 graphics/performance and V21.21.19 lane assist.
- Add speed-squared aerodynamic downforce to the 2010 F1 profile so high-speed grip/braking increase for a physical reason rather than by a flat magic grip bonus.

Representative vehicle mass calibration
- Volkswagen ID.4 AWD Pro S (2024): 2,226 kg (4,907 lb)
- Subaru WRX 6MT base (2024): 1,510 kg (3,329 lb)
- Honda Civic Sport sedan (2024 Canada): 1,345 kg
- Hyundai Sonata Sport 2.0T (2017): 1,584 kg (3,492 lb)
- Lamborghini Countach LP5000 QV: 1,490 kg
- BMW i3 94 Ah BEV (2017): 1,343 kg (2,961 lb)
- F1 2010: simulation retains 740 kg representative running mass; FIA minimum was 620 kg. A fuel-loaded 2010 race car did not remain at minimum mass throughout a race.

F1 aerodynamic model
- Uses downforce proportional to v^2.
- Generic 2010 coefficient-area target: ClA = 4.56 m^2.
- 42% front aerodynamic balance.
- Tire load-sensitivity efficiency = 0.84.
- Aero grip multiplier capped at 3.0x so very high speed does not become unlimited grip.
- At 200 km/h: ~8.62 kN downforce (~879 kg-force equivalent), ~2.00x tire grip scale.
- At 300 km/h: ~19.40 kN downforce (~1,978 kg-force equivalent), grip scale capped at 3.00x.
- No road car receives synthetic downforce.
- Downforce does not create tire grip while airborne.

Important engine fix discovered during QA
The vehicle-system keeps one stable physics object and mutates it when changing cars. The V21.21 layout WeakMap cache previously assumed the object was immutable, so switching vehicles after the layout had been cached could retain the previous vehicle's mass/wheelbase/inertia. V21.21.21 adds a one-integer layout revision on vehicle selection. This has negligible hot-path cost and ensures each selected car actually uses its own physical chassis data.

Sources used for representative data
- Subaru of America, 2024 WRX brochure: base manual curb weight 3,329 lb.
- Honda Canada / Honda Info Center, 2024 Civic Sedan: Sport curb weight 1,345 kg (Canada) / 2,935 lb (US).
- BMW Group Canada/U.S. media technical data, 2017 i3 94 Ah: 2,961 lb curb weight.
- Edmunds, 2024 Volkswagen ID.4 AWD Pro S: 4,907 lb curb weight.
- Edmunds/Kelley Blue Book, 2017 Hyundai Sonata Sport 2.0T: 3,492 lb curb weight.
- Multiple Countach LP5000 QV specifications: ~1,490 kg curb/unladen weight.
- FIA 2010 Formula One Technical Regulations: 620 kg minimum weight.
- 2010 Renault R30 aerodynamic targets disclosed in Force India Formula One Team Ltd v 1 Malaysia Racing Team: Czt ~3.10 referenced to 1.47 m^2, aero balance ~42%.

Notes
Real mass by itself does not make gravity stronger: all cars accelerate downward at g. In World Drive it matters through yaw inertia, axle load transfer, tire forces and momentum coupling. Several previous mass guesses were already close to production values, so do not expect every road car to suddenly feel dramatically heavier from the number change alone. This candidate establishes a correct mass baseline; further 'heaviness' tuning should target suspension/yaw/transient tire behavior rather than inventing excess kilograms.
