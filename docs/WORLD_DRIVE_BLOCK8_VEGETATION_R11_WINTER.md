# Block 8 R11W — four winter variants in vegetation preview

## Accepted outcome — 2026-09-18

**HUMAN winter STYLE PASS: « pass excellent! »**, PR #14 comment **5734183717**,
accepted reference **c7bb678d290c8e275c79b134a23cc6897d1e26f7**. All four winter
shapes are accepted; do not ask for the same gallery verdict again. Summer approval
5732527872 remains valid. Next action is the limited opt-in rendered R12 pilot in
WORLD_DRIVE_BLOCK8_RENDERED_PILOT_R12.md, not additional model variety. This approval
is style/use acceptance, not a winter driving/GPU benchmark, automatic season rule,
merge or release permission.

The following implementation and original review procedure are retained as historical
evidence. Any pending-review/show-preview wording below is superseded by this outcome.


2026-09-18. Existing candidate `candidate/block8-biome-classifier-r1`, PR #14.
This is an authoring-gallery extension, not the first rendered driving pilot.

## User decisions

The six R11 summer silhouettes received HUMAN STYLE PASS / permission to use in
comment 5732527872. More general variety is deferred. The user subsequently requested
winter conifer, temperate broadleaf, shrub and rock, with this explicit correction:
**« feuillu tempéré = dénudé ET enneigé »**. A snowy leafy crown is not compliant.
Winter style remains pending human inspection; do not reopen summer/R9/R10 gates.

## Model construction and declared budgets

| Model | Triangles | Position/normal/color bytes | Seasonal form |
| --- | ---: | ---: | --- |
| Conifer winter | 180 | 19,440 | Original R4 outline, white snow on upper skirts, dark needles beneath |
| Temperate broadleaf winter | 114 | 12,312 | 19 tapered bare branch segments, snow on upward branch faces |
| Shrub winter | 72 | 7,776 | 12 dormant woody segments, light snow on upper limbs |
| Rock winter | 32 | 3,456 | Original outline, snow cap and a few cool frost/ice-colored facets |
| Total | 398 | 42,984 | Four single-part assets |

The snow and frost are baked geometry/vertex colors, not a transparent ice shader,
weather simulation, texture or extra material pass. Branch snow has a small raised
upper ridge. Conifer/rock faces are split into snow and exposed portions, with no
coplanar overlay and no changes to the base silhouette. Conifer needles remain;
leafless tree/shrub have wood and snow only, no foliage lobes. Their height matches
the approved reference; a bare crown naturally occupies less volume than a leafy one.

The winter tree/shrub cost exceeds the 68-triangle SUMMER reference. It is explicitly
measured and bounded, not hidden behind the previous summer budget. All ten gallery
assets share one opaque Lambert material and use no textures. Counts exclude
pedestals, object/driver overhead and total browser/GPU memory. One part per asset
allows one draw per model in the gallery but does not certify full-forest draw calls
or FPS. Model heights are local normalized units, not botanical metres.

## Ownership and seasonal selection

- `tools/biomes/vegetation-winter-data.mjs`: four immutable descriptors, pure owned
  buffers and exact summer/winter ID mapping. Unsupported tropical/dry winter returns
  null; invalid IDs/seasons throw rather than silently selecting a different biome.
- `tools/biomes/vegetation-seasonal-prototypes.mjs`: builds the original summer kit,
  then four winter assets sharing its material. Idempotent disposal releases every
  owned geometry once and the shared material once. No game integration/import.
- Existing `vegetation-prototype-data.mjs` and `vegetation-prototypes.mjs` are unchanged.
- Existing `vegetation-preview-r11.html`: adds the Summer/Winter selector and direct
  `?season=winter` entry. Rotation, wireframe and lighting persist across switches.

This mapping has no automatic calendar, latitude, altitude, climate or network
behavior. It is not an ecological winter eligibility rule. The broad-family R11
policy and R3 production registry are unchanged; descriptors still have no production
approval or placement permission. The models are authorized for a future candidate
pilot by style, not globally installed in driving by this extension.

## Validation contract

The R11 workflow keeps its entire-runtime guard against the accepted R10 SHA and
all existing 27-group policy, native summer and service-boundary tests. It adds:

1. Actual pinned Three.js winter geometry QA: exact budgets, finite arrays, unit
   normals agreeing with face winding, upward snow faces, containing bounds,
   unchanged conifer/rock extrema, matched bare heights, absence of foliage in the
   naked assets, snow and exposed surfaces, repeatability/ownership, strict inputs,
   instancing, 100 rebuilds, 10,000 switches and idempotent resource disposal.
2. Native Vite/Chromium winter preview: four rendered winter models and four
   pedestals, switch summer/winter 200 times without geometry-count growth,
   summer stats retained, direct winter URL, narrow layout, wireframe and rotated
   low light, no page errors or external requests. Summer factory parity stays tested.
3. All inherited R1–R10 geographic/Worker/full-game/Vite and 97-command integration
   checks on the current SHA. Historical green results are not transferred.

Evidence: tested-commit.txt, winter-qa.json, winter-browser-qa.json, summer.png,
winter.png, winter-wireframe.png, winter-side-light.png and winter-narrow.png in the
expanded R11 artifact. The live PR lists the exact final SHA/run outcomes. The local
container cannot resolve GitHub or obtain native dependencies; native proof must
come from the actual Actions run, not a claimed local browser run.

## Human preview

After current exact-head QA is green, pull the existing candidate and run `npm run dev`.
Open (substitute Vite's actual port as necessary):

```text
http://localhost:5173/tools/biomes/vegetation-preview-r11.html?season=winter
```

No new package, Python installation or console activation. The Summer/Winter selector
compares the existing approved summer assets with the four winter variants. No
new Manic driving test is requested. Main and forest-R4 runtime are untouched.
The next gate is WINTER STYLE review, then the scoped opt-in rendered pilot; no PR
merge or visual-biome/full-game performance certification follows from gallery QA.
