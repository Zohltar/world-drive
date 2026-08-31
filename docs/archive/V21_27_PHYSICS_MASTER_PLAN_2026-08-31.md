# World Drive V21.27 — Physics Master Plan

Status: planning / reference architecture  
Stable baseline: V21.26 (`main`, tag `v21.26`)  
Development principle: V21.26 stays untouched. Future physics work branches from the stable baseline and follows this plan progressively.

---

## 1. Objective

Replace the current hybrid vehicle model — bicycle-model yaw plus tire-grip heuristics and drift corrections — with a more physically grounded per-wheel contact-patch model.

The target is not a full motorsport-grade finite-element tire simulation. The target is a lightweight real-time model that:

- derives chassis forces from the actual wheel contact points;
- distinguishes road-surface friction from tire grip;
- lets tire grip vary by vehicle and tire type;
- uses real left/right steering geometry rather than one shared front-wheel angle;
- makes turning radius emerge from wheelbase, track width and steering angles;
- lets understeer, oversteer and drift emerge from tire saturation instead of explicit drift triggers;
- allows rear-wheel lock from the handbrake to physically remove rear lateral authority and generate yaw;
- remains deterministic and performant enough for World Drive at 60–144 FPS;
- preserves the existing terrain/road contact and suspension foundations already built in V21.26.

---

## 2. Current V21.26 state

World Drive already has several strong foundations that should be preserved and reused:

- per-vehicle mass, wheelbase, track width, CG height, front/rear weight bias and yaw inertia metadata;
- drivetrain metadata (FWD / RWD / AWD);
- front/rear drive and brake distribution;
- dynamic longitudinal load transfer;
- aerodynamic downforce support for vehicles such as the F1;
- independent wheel support/contact sampling;
- per-wheel road/terrain contact information;
- friction-circle-inspired grip accounting;
- current per-wheel diagnostic arrays for grip, lateral usage, longitudinal usage and slip;
- a separate chassis heading and velocity heading, allowing visible sideslip;
- finite steering-rack response;
- ABS/EBD behavior for road cars;
- the ability for the current handbrake system to remove rear lateral authority.

The main limitation is architectural: the primary horizontal motion still starts from a kinematic/bicycle yaw request and then applies corrections after the fact.

Current simplified foundation:

```text
steering input
   -> single road-wheel angle
   -> bicycle yaw rate: v / wheelbase * tan(angle)
   -> lateral grip envelope
   -> front/rear slip estimates
   -> yaw corrections / drift helpers
   -> velocity-heading correction
```

The future model should invert this relationship:

```text
wheel states + road surface + tire properties
   -> force at each contact patch
   -> sum of forces + moments
   -> chassis linear acceleration + yaw acceleration
   -> vehicle motion
```

Drift then becomes a result of the physics rather than a special behavior layered on top.

---

## 3. Target architecture

Suggested modules:

```text
vehicle-profiles.js
    vehicle geometry / mass / drivetrain
    tire assignment
    steering-rack limits

surface-physics.js
    surface friction / rolling properties

steering-geometry.js
    rack command
    Ackermann left/right wheel angles

wheel-dynamics.js
    wheel angular velocity
    drive/brake torque
    longitudinal slip ratio

 tire-model.js
    slip angle
    longitudinal slip
    lateral/longitudinal tire forces
    combined-slip friction ellipse
    load sensitivity

vehicle-dynamics.js
    chassis mass properties
    wheel contact velocity
    load transfer
    force/moment accumulation
    integration

driving-runtime.js
    input + transmission + orchestration
```

Names are provisional. The important rule is ownership: the new tire solver should be pure math and testable without Three.js or DOM dependencies.

---

## 4. Wheel contact points are authoritative

The vehicle must be simulated from the physical contact points of its active wheels.

The existing presentation/suspension layer already exposes useful data per wheel, including:

```text
localX
localZ
absX
absZ
axleIndex
front
side
contact
contactFactor
suspensionCompression
suspensionVelocity
```

V21.27 should formalize a physics wheel/contact structure containing at minimum:

```js
{
  id,
  axleIndex,
  side,
  localX,
  localZ,
  radius,
  steerAngle,
  angularVelocity,
  contact,
  contactFactor,
  normalLoadN,
  surface,
  tire,
  slipAngle,
  slipRatio,
  forceLongitudinalN,
  forceLateralN
}
```

Visual wheel pivots may remain presentation objects, but the physics solver must not depend on render-specific transforms when equivalent local geometry exists in the vehicle profile.

---

## 5. Chassis state

The planar chassis state should evolve toward an explicit rigid-body representation:

```text
world position: x, z
world velocity: vx, vz
heading / yaw: psi
yaw rate: omega
mass: m
yaw inertia: Iz
```

This is preferable to storing primarily scalar forward speed plus a separate velocity-heading heuristic.

A compatibility layer may continue to expose:

```text
speed
velocityHeading
heading
```

for HUD, audio and old systems during migration, but those values should eventually be derived from the vector state.

---

## 6. Contact-patch velocity

For each wheel contact point, compute the local velocity from chassis translation plus rotational velocity.

Conceptually:

```text
v_contact = v_cg + omega x r
```

where `r` is the wheel-contact offset from the center of gravity.

For a planar vehicle, this gives each wheel a different instantaneous velocity during yaw.

The velocity is then projected into the wheel's own forward/lateral basis after steering rotation.

This produces:

```text
wheel longitudinal velocity
wheel lateral velocity
```

which are the inputs to the tire model.

---

## 7. Tire slip angle

Each wheel should have its own slip angle.

Conceptually:

```text
alpha = atan2(v_lateral, abs(v_longitudinal))
```

with stable low-speed handling to avoid numerical blow-ups near zero velocity.

The front left and front right wheels will naturally have different slip angles because:

- they have different steering angles under Ackermann geometry;
- they occupy different contact positions;
- their local velocities differ during yaw;
- their vertical loads differ during weight transfer.

There should no longer be one global front/rear slip trigger controlling the complete vehicle.

Front/rear slip values may still exist as diagnostics derived from the wheel states.

---

## 8. Longitudinal slip ratio

Each wheel should eventually track angular velocity `wheelOmega`.

A useful conceptual definition is:

```text
kappa = (wheelSurfaceSpeed - groundLongitudinalSpeed) / referenceSpeed
```

where:

```text
wheelSurfaceSpeed = wheelOmega * wheelRadius
```

A numerically safe low-speed reference must be used.

Interpretation:

```text
kappa ~ 0       rolling normally
kappa > 0       driven wheel spinning
kappa < 0       braking slip
kappa -> -1     locked wheel while vehicle still moving
```

The exact formula and clamps should be selected for numerical stability, not simply copied from a textbook without considering near-zero vehicle speed.

---

## 9. Tire model

The first V21.27 tire model should be intentionally simpler than Pacejka/Magic Formula while retaining the important physical behaviors.

Recommended initial structure:

```text
lateral force request from slip angle
longitudinal force request from slip ratio / torque
vertical load sensitivity
surface friction
combined-slip saturation
```

A smooth saturating curve can replace a hard threshold.

Example conceptual lateral response:

```text
Fy_request = corneringStiffness * alpha
```

with nonlinear saturation as the tire approaches its friction limit.

Longitudinal force similarly comes from drive/brake torque or longitudinal stiffness before saturation.

The design must support later replacement with a richer tire curve without rewriting the chassis solver.

---

## 10. Separate road friction from tire grip

Surface and tire properties must become separate concepts.

Current physics often combines vehicle grip and surface grip into aggregate multipliers. V21.27 should make the relationship explicit.

Conceptually:

```text
mu_effective = mu_surface * tireGripFactor * loadSensitivity * conditionModifiers
```

The core tire-force ceiling is approximately:

```text
Fmax = mu_effective * Fz
```

where `Fz` is the wheel's current normal load.

This separation is important because the same tire behaves differently on asphalt, gravel and grass, while two different tires also behave differently on the same asphalt.

---

## 11. Surface physics

Create a central surface-physics definition instead of scattering grip constants through the runtime.

Initial illustrative values only — these must be calibrated during development:

```js
const SURFACES={
  asphaltDry:{mu:1.00,rollingScale:1.00},
  asphaltPoor:{mu:0.85,rollingScale:1.08},
  gravel:{mu:0.55,rollingScale:1.35},
  dirt:{mu:0.45,rollingScale:1.45},
  grass:{mu:0.35,rollingScale:1.65}
};
```

These numbers are planning placeholders, not final physical constants.

Future extensions can include:

- wet asphalt;
- snow;
- ice;
- mud;
- temperature;
- standing water / hydroplaning.

Those are not required for the first V21.27 implementation.

---

## 12. Tire profiles

Vehicle profiles should reference an explicit tire definition.

Example planning schema:

```js
tires:{
  type:'performance-summer',
  muDry:1.08,
  corneringStiffness:85000,
  longitudinalStiffness:92000,
  loadSensitivity:0.09,
  rollingRadius:0.33,
  inertiaKgM2:1.2
}
```

Potential initial categories:

```text
economy / narrow EV tire
all-season touring
performance all-season
performance summer
track tire
racing slick
truck tire
```

Each actual vehicle should receive a tire class appropriate to the vehicle rather than simply inheriting a global road-grip multiplier.

Examples of intended differentiation:

- BMW i3: narrow efficiency-oriented tires, lower peak lateral grip and different breakaway feel;
- Sonata: touring/performance-road tire depending on intended trim;
- Civic: road-performance tire;
- WRX: stronger performance tire and AWD traction characteristics;
- ID.4: high mass, road-oriented EV tire, substantial normal loads;
- F1: racing slick with high stiffness, high grip and strong load/aero interaction.

Exact tire specifications should be researched/calibrated separately when each vehicle is tuned.

---

## 13. Vertical load and load sensitivity

Each wheel needs a current normal load `Fz`.

The existing model already estimates longitudinal and lateral load transfer. V21.27 should refine this into per-wheel load distribution.

Inputs include:

```text
static weight distribution
longitudinal acceleration
lateral acceleration
CG height
wheelbase
track width
suspension/contact state
aerodynamic downforce
```

Important behavior: tire grip is load-sensitive. Doubling normal load should not necessarily double usable lateral force.

The existing approximate exponent/load-sensitivity behavior can be retained initially and moved into the new tire model.

A wheel with no contact must produce zero tire force.

A lightly supported wheel should receive proportionally reduced force authority through `contactFactor` or an equivalent normal-load calculation.

---

## 14. Friction circle / friction ellipse

Longitudinal and lateral tire forces must share the same finite adhesion budget.

Basic circular form:

```text
sqrt(Fx^2 + Fy^2) <= mu * Fz
```

A future friction ellipse may use different longitudinal/lateral limits.

This is central to all desired behavior:

- accelerating hard reduces lateral authority on driven tires;
- heavy braking reduces cornering force;
- wheelspin reduces lateral force;
- a locked rear tire loses most lateral authority;
- understeer and oversteer emerge from which tires saturate first.

No explicit `driftThreshold` should be required.

---

## 15. Steering geometry — Ackermann

The current shared front-wheel steering angle should be replaced by individual wheel angles.

Inputs:

```text
L = wheelbase
T = front track width
delta = requested steering angle at the virtual center wheel
```

Geometric turn radius:

```text
R = L / tan(delta)
```

Inner wheel:

```text
deltaInner = atan(L / (R - T/2))
```

Outer wheel:

```text
deltaOuter = atan(L / (R + T/2))
```

The sign and left/right assignment depend on steering direction.

This geometry should drive both:

1. the tire solver;
2. the visual steering pivots.

The rendered wheels and the physical wheels must therefore point in the same direction.

---

## 16. Turning radius

Turning radius should become an emergent geometric result rather than a separately tuned gameplay value.

At low speed with unsaturated tires, minimum turning radius should primarily depend on:

```text
wheelbase
track width
maximum steering rack travel / road-wheel angle
Ackermann geometry
```

At higher speed, actual trajectory radius will also depend on tire slip and available lateral force.

Vehicle profile calibration should therefore include realistic maximum steering angle / steering-rack travel rather than compensating with artificial yaw multipliers.

---

## 17. Steering rack

Keep the V21.26 finite steering-rack travel concept.

Driver input should request a rack position, not instantly teleport the front wheels.

Recommended pipeline:

```text
keyboard/gamepad input
   -> steering input shaping
   -> steering rack target
   -> finite rack slew
   -> center steering angle
   -> Ackermann left/right angles
   -> tire solver
```

High-speed steering-authority reduction may remain if needed for controller usability, but it should modify the steering request/rack behavior — never add or subtract chassis yaw directly.

---

## 18. Wheel angular dynamics

Introduce angular state per physical wheel.

Core equation conceptually:

```text
Iwheel * angularAcceleration
    = driveTorque
    - brakeTorque
    - tireLongitudinalForce * wheelRadius
```

Then integrate:

```text
wheelOmega += angularAcceleration * dt
```

This makes wheelspin and lockup actual physical states instead of inferred booleans.

Initial implementation can use simplified wheel inertia values by tire/vehicle class.

---

## 19. Drivetrain force distribution

Engine/motor output should eventually be converted into wheel torque rather than directly into chassis acceleration.

The existing transmission system can remain authoritative for:

```text
selected gear
RPM
shift timing
redline / limiter
throttle availability
```

The migration path may initially convert its current propulsion acceleration result into equivalent driven-wheel force/torque, then later move toward torque-based powertrain output.

Distribution:

```text
FWD -> front driven wheels
RWD -> rear driven wheels
AWD -> configured front/rear split
```

A later phase can support open/LSD differential behavior, but V21.27 does not require a full differential simulation on day one.

---

## 20. Service brakes and ABS

Service-brake torque should be distributed to individual wheels.

Road cars with `absEnabled !== false` should receive a lightweight ABS controller that prevents excessive negative slip ratio.

Conceptually:

```text
if braking slip exceeds target:
    reduce brake torque on that wheel
```

The target should not be perfect zero slip; real maximum braking occurs at finite slip.

The current EBD concept can remain by adapting brake distribution to available normal load.

Race vehicles or historic/non-ABS vehicles can allow actual wheel lock.

---

## 21. Handbrake / rear-wheel lock

The handbrake should no longer directly request artificial rear slip or yaw.

It should apply brake torque to the configured parking-brake wheels, normally the rear axle.

Sequence:

```text
handbrake input
   -> rear brake torque rises
   -> rear wheel angular velocity falls
   -> longitudinal slip becomes strongly negative
   -> rear tire consumes longitudinal friction capacity
   -> available rear lateral force falls
   -> front tires retain more lateral force than rear tires
   -> net yaw moment develops around CG
   -> chassis rotates while momentum initially continues forward
```

This naturally creates a handbrake turn.

In a perfectly straight-line case with symmetric rear lock and no lateral disturbance, the system should not invent a large yaw moment.

Small physical/asymmetric perturbations may eventually make a real locked car unstable, but deliberate random yaw must not be injected merely because the handbrake is active.

---

## 22. Drift becomes emergent

V21.27 should not have a special "drift mode".

A drift is simply a state where:

```text
chassis heading != velocity direction
```

and the tires are operating with significant slip while forces remain sufficient to sustain a curved trajectory.

Possible causes include:

- rear wheel lock from handbrake;
- RWD power oversteer;
- lift-off oversteer;
- excessive corner entry speed;
- low-friction surface;
- abrupt weight transfer;
- tire-type differences;
- front/rear tire imbalance.

The old drift-specific helpers should be removed progressively only after the new force solver proves equivalent or better behavior.

---

## 23. Understeer and oversteer

These should become diagnostic descriptions, not control logic.

Understeer:

```text
front tires saturate before rear tires
-> requested front lateral force cannot be generated
-> vehicle turns less than steering geometry requests
```

Oversteer:

```text
rear tires lose lateral authority before front tires
-> force imbalance creates yaw moment
-> rear of vehicle rotates outward
```

Four-wheel slide:

```text
all tires near combined-slip limit
-> reduced steering authority
-> vehicle trajectory carries outward
```

No fixed `frontDominance` / `rearDominance` yaw injection should remain in the final model.

---

## 24. Force and moment accumulation

For each wheel, compute the tire forces in wheel coordinates and rotate them into chassis/world coordinates.

Sum forces:

```text
Fx_total = sum(Fx_wheel_world)
Fz_total_plane = sum(Fz_wheel_world_horizontal_component as appropriate)
```

For planar X/Z motion the horizontal force vector is accumulated across wheels.

For each wheel at position `r=(rx,rz)` relative to CG, accumulate yaw moment conceptually as:

```text
Mz += rx * Fz_horizontal - rz * Fx_horizontal
```

Equivalent 2D cross-product formulation should be used consistently with World Drive's axis conventions.

Then:

```text
ax = FworldX / mass
az = FworldZ / mass
yawAccel = Mz / yawInertia
```

Integrate velocity and yaw rate from these values.

This force/moment accumulation is the heart of V21.27.

---

## 25. Position integration

Once the chassis has explicit world velocity:

```text
vx += ax * dt
vz += az * dt
x  += vx * dt
z  += vz * dt

yawRate += yawAccel * dt
heading += yawRate * dt
```

A stable integrator such as semi-implicit Euler is sufficient initially.

Avoid overcomplicating the first implementation with higher-order integration unless tests show a real need.

---

## 26. Fixed physics timestep

Run horizontal vehicle physics at a fixed timestep independent of render FPS.

Recommended initial target:

```text
120 Hz
physicsDt = 1 / 120 s
```

Use an accumulator:

```text
accumulator += renderFrameDt
while accumulator >= physicsDt:
    simulatePhysicsStep(physicsDt)
    accumulator -= physicsDt
```

Benefits:

- predictable tire-force integration;
- consistent handbrake lock behavior;
- less sensitivity to 30/60/120/144 Hz rendering;
- easier deterministic QA;
- easier comparison between vehicle calibrations.

Include a maximum number of catch-up steps per frame to prevent a temporary stall from causing a spiral of death.

The renderer/presentation may interpolate if necessary, but this is optional in the first implementation.

---

## 27. Interaction with vertical suspension physics

Do not rewrite the existing road/terrain support system as part of the first horizontal-physics migration.

The V21.26 suspension/contact system already independently samples wheel support and determines contact state.

V21.27 should initially consume its contact data.

Longer term, vertical normal load and horizontal tire force can be coupled more tightly, but the first goal is to replace the horizontal bicycle/drift model without destabilizing the proven terrain, crest, jump and suspension code.

Important rules:

- no-contact wheel => zero tire force;
- reduced `contactFactor` => reduced normal force authority;
- airborne chassis => no ground tire forces;
- F1 downforce remains an external vertical load contribution when applicable.

---

## 28. Vehicle profile migration

Current fields such as these should be treated as legacy calibration during transition:

```text
roadGripMultiplier
lateralAccelLimit
frontTireGripScale
rearTireGripScale
powerOversteerGripLoss
powerOversteerYaw
```

They should not all be deleted immediately.

Migration policy:

1. introduce explicit tire definitions;
2. run old and new diagnostics side-by-side;
3. calibrate each vehicle;
4. stop using obsolete fields one by one;
5. remove a field only after QA proves no active path depends on it.

Do not perform a mass deletion of historical physics fields in the same commit that introduces the new solver.

---

## 29. Suggested initial vehicle/tire identities

Planning intent only:

```text
ID.4
  heavy AWD EV
  road-oriented EV tire
  moderate lateral grip
  strong traction from AWD
  large load-transfer / mass feel

WRX
  lighter AWD sport sedan
  performance road tire
  higher lateral grip
  strong launch/corner-exit traction

Civic
  FWD compact
  road-performance tire
  front-heavy load distribution
  natural power understeer when front tires are overloaded

Sonata
  FWD larger sedan
  touring/performance-road tire
  softer breakaway and more mass/inertia than Civic

i3
  light/narrow EV layout
  narrow efficiency tire
  lower peak lateral capacity but low mass

Countach
  RWD sports car
  period-appropriate performance tire
  throttle-sensitive rear axle

F1 2010
  RWD race car
  slick tire
  very high stiffness
  high tire grip
  strong aerodynamic load interaction
  no ABS
```

These are behavior targets, not final data values.

---

## 30. Multi-axle and truck compatibility

The architecture must remain generalized.

Do not hard-code exactly four wheels in the core solver.

Passenger cars can use optimized four-wheel paths where appropriate, but the underlying data model should allow:

```text
2 axles / 4 wheels
3+ axles
truck tractor
future trailers / articulated combinations
rear steer or multi-steer axles
```

The existing `axles[]` profile structure should remain useful.

---

## 31. Trailer scope

V21.27 should initially focus the new tire solver on the active powered vehicle/tractor.

Trailer tire force simulation can follow later once the core solver is stable.

Do not block passenger-car physics improvements on a complete articulated multi-body solver.

However, avoid architectural choices that make trailer wheel forces impossible later.

---

## 32. Diagnostics

Add physics diagnostics before removing old behavior.

Useful optional debug output:

```text
per wheel:
  Fz
  Fx
  Fy
  slip angle
  slip ratio
  mu effective
  combined utilization
  angular velocity
  locked / spinning state
  contact state

chassis:
  vx / vz
  speed
  sideslip angle
  yaw rate
  yaw acceleration
  total Fx/Fy
  total yaw moment
```

A debug overlay/toggle is preferable to permanent console logging.

The normal browser console should remain clean.

---

## 33. Skid marks and tire audio

Skid marks and squeal should become outputs of real tire states.

Potential drivers:

```text
lateral slip angle beyond tire's efficient region
longitudinal slip ratio during lock/spin
combined force utilization near/above peak
wheel load
surface type
```

Do not use skid effects as inputs to the physics.

They remain presentation consequences.

---

## 34. Planned removal of legacy drift helpers

The following types of behavior should eventually disappear from the core physics once the new solver replaces them:

- explicit rear-slip yaw additions;
- arbitrary power-oversteer yaw injection;
- manually forced rear lateral residuals specific to handbrake mode;
- front/rear dominance rules used directly to modify yaw;
- trajectory-follow heuristics that artificially align momentum to chassis heading;
- four-wheel-slide speed scrub that duplicates drag already produced by sliding tire forces.

Removal must be progressive.

During migration, old logic may remain as fallback behind a feature flag until the new solver is validated.

---

## 35. Feature flag / A-B migration

Recommended temporary development mechanism:

```js
physicsModel:'legacy' | 'wheel-forces'
```

Development builds may expose a debug toggle.

Stable releases should use one authoritative model, not let users unknowingly switch between unfinished solvers.

A/B mode is for calibration and regression comparison only.

---

## 36. Development phases

### V21.27.1 — Tire and surface data foundation

Create:

```text
tire-model.js or tire-definitions.js
surface-physics.js
```

Add explicit tire assignments to vehicle profiles.

No major change to vehicle behavior yet.

QA:

- all vehicle profiles resolve a tire definition;
- all known road/terrain states resolve a surface definition;
- no runtime behavior regression;
- pure-math tire/surface tests.

---

### V21.27.2 — Ackermann steering

Create individual physical steering angles for left/right steerable wheels.

Use the same angles for visual wheel pivots.

Preserve finite steering-rack timing.

QA:

- inner wheel turns more than outer wheel;
- straight steering produces equal zero angles;
- left/right symmetry;
- reverse geometry remains valid;
- low-speed turning circle matches the vehicle geometry within calibration tolerance;
- visual and physical steering angles match.

---

### V21.27.3 — Four-wheel horizontal force solver

Introduce:

```text
explicit chassis vx/vz
per-wheel contact velocity
slip angle
per-wheel lateral force
per-wheel longitudinal force
force/moment summation
```

Initially wheel angular speed may still be approximated for driven/braked forces.

Run new and legacy models side-by-side for diagnostics if needed.

QA:

- straight-line coasting remains straight;
- symmetric steering has symmetric response;
- no spontaneous yaw with zero steering on flat uniform road;
- higher speed requires greater lateral force for the same radius;
- front saturation yields understeer;
- rear saturation yields oversteer;
- loss of one wheel contact reduces available force appropriately.

---

### V21.27.4 — Wheel angular velocity, braking and lockup

Add:

```text
wheel inertia
wheel omega
wheel torque balance
slip ratio
ABS modulation
handbrake rear torque
actual wheel lock
```

QA:

- free rolling wheel surface speed converges to road speed;
- driven wheel can spin on low-mu surface;
- hard non-ABS braking can lock wheels;
- ABS-equipped road car avoids sustained lock under service braking;
- handbrake can lock/reduce rear-wheel rotation;
- symmetric handbrake in a straight line does not create arbitrary yaw;
- handbrake while cornering creates rear lateral-force loss and physical yaw.

---

### V21.27.5 — Remove legacy drift mechanics

After the wheel-force solver is demonstrably stable:

- remove explicit legacy rear-slip yaw helper;
- remove old power-oversteer yaw injection where redundant;
- remove drift-specific trajectory correction;
- derive skid/audio directly from tire state;
- recalibrate every vehicle.

QA must compare old stable behavior where appropriate while accepting intentional realism changes.

---

### V21.27.6 — Vehicle calibration pass

Tune vehicles individually using real-world geometry/performance where available.

Calibration targets can include:

```text
minimum turning diameter
0-100 km/h
braking distance\anskidpad lateral acceleration
high-speed stability
power-on/off balance
handbrake behavior where applicable
```

Do not tune one global coefficient to make all vehicles feel alike.

---

## 37. Fixed-step implementation strategy

Suggested runtime structure:

```js
const PHYSICS_DT=1/120;
let physicsAccumulator=0;

function updateDrive(renderDt){
  physicsAccumulator+=Math.min(renderDt,MAX_ACCUMULATED_TIME);

  let steps=0;
  while(physicsAccumulator>=PHYSICS_DT && steps<MAX_PHYSICS_STEPS){
    simulateVehicleStep(PHYSICS_DT);
    physicsAccumulator-=PHYSICS_DT;
    steps++;
  }
}
```

Inputs should be sampled/held consistently across substeps.

Presentation systems can continue updating at render rate.

Do not allocate large transient objects inside the 120 Hz hot path.

Reuse scratch arrays/objects similarly to current V21 performance work.

---

## 38. Numerical stability rules

- avoid division by near-zero wheel longitudinal velocity;
- clamp extreme slip ratios used internally for force curves;
- use smooth saturation instead of discontinuous force changes;
- keep force signs and World Drive axis conventions explicitly documented;
- no random perturbation in core deterministic physics;
- cap catch-up physics steps after long frame stalls;
- never silently teleport heading or velocity direction to stabilize a slide;
- if emergency stabilization is required during development, keep it explicit and temporary behind debug instrumentation.

---

## 39. Performance target

The per-wheel solver should remain lightweight.

For a normal 4-wheel car at 120 Hz, the math cost is trivial compared with rendering/streaming if implemented without unnecessary allocations or spatial queries.

Road/terrain queries must not be duplicated inside every tire equation.

Use the already-computed wheel-contact/support state where possible.

Desired design:

```text
contact sampling: existing presentation/support layer
physics solver: pure scalar/vector math
rendering: independent
```

Do not perform new Overpass, terrain-index or route-nearest searches inside each tire-force calculation.

---

## 40. Core QA scenarios

Every major physics revision should include deterministic automated tests plus manual driving tests.

Automated scenarios:

```text
1. stationary vehicle on flat road
2. straight acceleration
3. straight braking
4. constant-radius low-speed turn
5. Ackermann left/right symmetry
6. high-speed corner saturation
7. FWD throttle-on corner
8. RWD throttle-on corner
9. AWD low-mu launch
10. handbrake straight line
11. handbrake while turning
12. ABS service-brake stop
13. non-ABS wheel lock
14. one wheel unloaded / no contact
15. all wheels airborne
16. gravel vs asphalt comparison
17. different tire profiles on same chassis
18. frame-rate independence / fixed-step reproducibility
```

Manual regression routes should include:

- normal highway driving;
- tight hairpins;
- Yungas / stacked mountain road sections;
- aggressive braking downhill;
- dirt/off-road transitions;
- high-speed F1 test;
- handbrake/drift test on a wide safe section.

---

## 41. Success criteria

V21.27 physics can replace the legacy model when all of the following are true:

- low-speed turning radius visually and physically matches front-wheel geometry;
- each vehicle has meaningfully different handling from geometry, mass and tire properties;
- road surface changes alter available grip without rewriting vehicle coefficients;
- wheelspin can occur from excessive drive torque;
- wheel lock can occur from excessive brake torque when ABS is absent or handbrake is used;
- ABS-equipped road cars do not unrealistically lock their service-braked wheels;
- handbrake oversteer emerges from rear tire force loss, not explicit yaw injection;
- understeer emerges from front tire saturation;
- oversteer emerges from rear tire saturation;
- four-wheel slides preserve momentum instead of following an artificial steering trajectory;
- no spontaneous oscillation/yaw exists during normal straight driving;
- physics outcome is effectively independent of render FPS;
- CPU cost remains acceptable on the current World Drive target machines;
- console remains clean;
- existing terrain/suspension/airborne behavior remains stable.

---

## 42. Non-goals for the first V21.27 implementation

Do not expand scope unnecessarily.

Not required initially:

- full Pacejka parameter fitting;
- tire temperature simulation;
- tire wear;
- pressure simulation;
- aquaplaning;
- deformable tire carcass;
- detailed suspension linkage geometry;
- differential clutch-plate physics;
- drivetrain shaft elasticity;
- full multi-body trailer tire simulation;
- damage model.

The architecture should leave room for some of these later without requiring them now.

---

## 43. Guiding principles

1. Forces first, heuristics second.
2. Wheel contact points are authoritative.
3. Surface grip and tire grip are separate.
4. Individual wheels have individual steering/slip/load states.
5. Steering geometry controls turning radius.
6. Drift is an emergent state, not a mode.
7. Rear-wheel lock must come from wheel angular dynamics and brake torque.
8. Chassis yaw comes from summed tire moments.
9. No hidden heading or trajectory teleport in normal physics.
10. Fixed timestep for reproducibility.
11. Preserve V21.26 as rollback baseline.
12. Migrate incrementally with QA at every stage.

---

## 44. Recommended starting point when work resumes

When this project is resumed, begin from V21.26 stable on a new development branch, for example:

```text
physics/v21.27
```

First implementation task:

```text
V21.27.1 — create tire/surface definitions and pure-math QA
```

Do not begin by deleting the current drift solver.

The first goal is to build the new physical vocabulary and diagnostics beside the known-good system. Only once the new force model proves itself should legacy yaw/slip helpers be retired.

---

## 45. Plan authority

This file is the reference/master plan for the V21.27 physics redesign.

It is intentionally more detailed than an implementation checklist so future work can resume without reconstructing the architecture from conversation history.

When implementation choices conflict with this document, update this plan explicitly rather than silently drifting away from it.

Calibration values marked as examples/placeholders are not binding. Architectural principles, migration order, physical ownership and QA requirements are the important parts to preserve.
