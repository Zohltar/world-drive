# Block 8 R11 — isolated vegetation authoring and regional policy

Date: 2026-09-18. Candidate `candidate/block8-biome-classifier-r1`, PR #14.
R9/R10 diagnostic hardware checkpoints are accepted; do not repeat them.
No production source, tree placement, palette activation, density, scheduling,
route, terrain, hydro, physics, dependencies or main changes belong to this stage.

## Why this stage

The active loader `src/forest-water-assets.js` uses the same 68-triangle procedural
conifer for both proxy-mid/proxy-far aliases. Its original builder is
`src/forest-proxy-assets.js`; the unused 20-triangle far variant is not the current
appearance baseline. Public tracked assets contain no new vegetation library.
`src/forest-authored-lite.js` contains older envelopes derived from a supplied GLB;
R11 does not re-enable or relicense that third-party-derived geometry.

R11 adds five ORIGINAL deterministic, textureless geometric silhouettes and an
isolated comparison gallery. They are generic shape prototypes, not botanical
species. The conifer gallery entry calls the original factory, and automated QA
compares every position/color/normal/index against a separate original build.
The other shapes use hand-authored trunk rings and irregular bipyramid lobes;
no external mesh, image, texture or model was incorporated. Intended use: World
Drive authoring, subject to project licensing; no third-party CC license is invented.

## Model budget and review state

| Gallery entry | Triangles | New position/normal/color bytes | Status |
| --- | ---: | ---: | --- |
| Conifer R4 reference | 68 | Measured from original in native QA | Unchanged appearance reference |
| Temperate broadleaf silhouette | 60 | 6,480 | Prototype; not production approved |
| Tropical broadleaf silhouette | 60 | 6,480 | Prototype; not production approved |
| Dry woodland silhouette | 44 | 4,752 | Prototype; not production approved |
| Shrub silhouette | 36 | 3,888 | Prototype; not production approved |
| Rock silhouette | 16 | 1,728 | Prototype; not production approved |

All six share one opaque Lambert material in the gallery. Each asset has one part,
no texture, alpha cutout, animation, random generator or loading callback. New tree
height matches the original top at 1.9584 local units with the current scale=2;
this is NOT a statement of botanical height in metres. Source pivot remains at ground.
Flat normals, winding, finite attributes/bounds and instancing are checked.
Reported buffer bytes exclude driver, object, material and overall GPU memory.

The catalog deliberately sets `productionApproved:false`, `species:null`, and
`placementAuthority:false`. Its palette lists are PROPOSED broad-family review
categories, not field-verified native species distributions. The real R3 registry
still defaults to EMPTY. A prototype shape can be revised without changing R4.

A <=68 triangle shape does NOT guarantee the same forest draw-call count: distinct
per-chunk asset pools can require more batches. Full-game multi-palette performance
and human visual acceptance are mandatory before production integration.

## Files and ownership

- `tools/biomes/vegetation-prototype-data.mjs`: pure, bounded original vertex data.
- `tools/biomes/vegetation-prototypes.mjs`: explicit Three gallery assembly/disposal.
- `tools/biomes/vegetation-preview-r11.html`: standalone local authoring page.
- `tools/biomes/vegetation-policy.mjs`: pure selection-policy prototype using the
  maintained R3 registry, profiles and source-context contracts.
- `qa/qa-block8-vegetation-policy-r11.mjs`: deterministic policy and geometry gates.
- `qa/qa-block8-vegetation-browser-r11.py`: actual Three + native Chromium, using Vite.
- `.github/workflows/qa-block8-vegetation-r11.yml`: permanent exact-head authoring QA.

No production module imports these tools. Existing source-domain ownership checks
and both R1–R9 and R10 workflow guards remain unchanged, not relaxed for this stage.

## Transition policy — only mutually compatible assets

Policy construction admits at most 256 reviewed asset descriptors, eight reviewed
transition definitions and 256 reviewed regional altitude bands. Queries have no
cache growth, network, timer, terrain sample or wall-clock dependence. Base decisions
without extra configuration match the original R3 selector at identical revision/seed.

Currently admitted authoring pairs are temperate broadleaf/mixed vs temperate conifer,
and temperate conifer vs boreal conifer. Other pairs require a separate reviewed
extension; in particular a tropical/boreal blend is refused. Configured width is
bounded to 1–500 m. This is a CODE/ART constraint, not a measured ecotone width.

A caller must supply a verified boundary distance and a resolved source-polygon
neighbor context from the same source identity/revision. At distance d inside width w,
the shared-pool weight is `1 - smoothstep(d/w)`: all shared at the boundary, native
outside the band. A fixed seed/key chooses deterministically, with no time dependence.
Only assets explicitly eligible in BOTH palettes, realms and ecoregion restrictions
may enter the shared pool. A neighbour-only species never leaks across. If no shared
asset or reliable boundary context exists, retain the exact native selection and
report why blending was unavailable; do not invent a different biome.

R10 does NOT yet prepare source-boundary distances. All boundary-distance tests in
R11 are synthetic API controls. This is not proof of smooth real geographic crossings.

## Elevation policy — regional input, not a universal altitude

The literature describes climatic treelines using thermal/growing-season criteria
and region/taxon effects, not one globally constant height in metres:
Körner & Paulsen (2004), DOI 10.1111/j.1365-2699.2003.01043.x,
https://edoc.unibas.ch/entities/publication/242ab9b5-108b-409d-8c0b-3d950a7043d1 ;
Paulsen & Körner (2014), DOI 10.1007/s00035-014-0124-0,
https://edoc.unibas.ch/entities/publication/6f9f772b-9674-46cd-9520-a1bf3e374a91 .
These sources justify avoiding a universal threshold; they do NOT supply the bands
used in our tests or validate a Manic/Andes/Alps cutoff.

A reviewed band requires exact source ID/SHA, ecoregion ID, referenced lower/upper
metres and an explicit vertical datum. Reliable altitude must use the SAME datum;
missing/invalid/mismatched elevation refuses a tree decision instead of coercing to 0.
With valid evidence the tree eligibility weight tapers monotonically through the
band, using a stable per-position sample. It does not rewrite the original biome,
source record or terrain height. Non-tree assets do not inherit a tree-only cutoff.

NO real treeline bands are bundled. Without one the base R3 result stays unchanged
and elevationStatus is explicitly `unconfigured`; it is NOT altitude validation.
The synthetic 1,000–1,600 m QA band is not a suggested regional or worldwide value.
The candidate/production registry is empty by default, and this policy has no planting
permission. Before a rendered alpine pilot, qualify region-specific evidence and
actual DEM datum; do not use shifted visual terrain Y as an altitude silently.

## Validation and visual review

Local pure gate: 27 groups, 109,500 counted stress decisions plus other assertions.
The 10,000-key synthetic taper retains 10,000 /8,493 /5,081 /1,568 /0 selections at
its five sample altitudes. These counts are deterministic API tests, not ecology.
Five original geometries meet exact triangle/buffer ceilings with no invalid or
zero-area triangle, outward winding/normal agreement and independent repeatable arrays.

The R11 workflow checks ALL runtime files against accepted R10, then runs the same
pure gate plus existing ownership checks, installs existing npm dependencies and
renders the gallery in native Chromium. It validates actual Three attributes/bounds,
opaque shared material, conifer byte-for-byte parity and finite instance matrices.
Screenshots: default, wireframe, rotated/low-light. No external gallery requests or
page errors are accepted. Evidence includes tested SHA, reports and source archive.
Primary geometry API reference: https://threejs.org/docs/pages/BufferGeometry.html .
Actual browser results must be read from the exact current run, not inferred from
local syntax/pure tests. No local Three/native-browser run is claimed without evidence.

After exact-head R11 + inherited R1–R10 QA are green, open under normal `npm run dev`:
`http://localhost:5173/tools/biomes/vegetation-preview-r11.html`.
No Python installation, data package or console activation is needed for the gallery.
It does not launch the driving scene. Request a STYLE verdict before assigning the
models to real regions; do not request another unchanged R9/R10 drive.

## Next integration gate

Inspect the gallery first; adjust silhouettes/proportions only when supported by the
review. Then qualify actual regional palette memberships, altitude and source-boundary
inputs and design one opt-in multi-palette rendered pilot, without global replacement.
Preserve R4 first-layer scheduling/full density/exclusions and conservative unavailable
handling. Missing prepared data must never erase the accepted live forest mid-frame.
PR #14 stays draft/unmerged; main remains untouched. Block 8 is not DONE/CERTIFIED.
