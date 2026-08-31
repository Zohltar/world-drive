import fs from 'node:fs';

const file='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(file,'utf8');

function replaceSection(title,nextTitle,body){
  const start=`### ${title}`;
  const next=`### ${nextTitle}`;
  const i=text.indexOf(start);
  const j=text.indexOf(next,i+start.length);
  if(i<0||j<0)throw new Error(`section markers missing: ${title} -> ${nextTitle}`);
  text=text.slice(0,i)+body.trimEnd()+'\n\n---\n\n'+text.slice(j);
}

replaceSection(
  'C3 — Flatten road geometry layers after A1 **[P2]**',
  'C4 — Modernize forest file naming/layers **[P2]**',
`### C3 — Flatten road geometry layers after A1 **[P2]**

Status: **DONE (2026-08-30)**

Correction completed:
- removed the historical \`road-geometry-base.js\` layer and made \`road-geometry.js\` the single canonical production owner;
- preserved V21.31 smoothing, banking, road-profile/volume and terrain/bridge behavior;
- modernized stale V21.25 source-location assumptions instead of reintroducing old contracts;
- updated the old profile-frame assertion from historical \`z\` to current \`pz\`;
- confirmed \`roadSurfaceAt()\` owns geometric surface height while the physical +0.10 m road-support offset remains intentionally owned by \`wheel-ground-support.js\`;
- added permanent \`qa-road-geometry-c3.mjs\` / \`qa-cleanup-c3.yml\` ownership coverage.

Completion record:
- Integration commit: \`386c4d80\` — canonical road geometry consolidation.
- Permanent-gate hardening commit: \`f2624a20\`.
- Permanent C3 gate run \`33352045645\`: PASS.
- Final C3 Dev Integration run \`33352045710\`: PASS all then-current steps, including stress, driving matrix, forest, WebGL, build and code split.
- Human validation: not required; behavior-sensitive route/terrain regressions remained green and no tuning changed.
- Result: one canonical road-geometry production module remains; old source-location QA can no longer force the removed base layer back in.`
);

replaceSection(
  'C4 — Modernize forest file naming/layers **[P2]**',
  'C5 — Reduce `main.js` size / responsibilities **[P2]**',
`### C4 — Modernize forest file naming/layers **[P2]**

Status: **DONE (2026-08-30)**

Correction completed:
- replaced historical production filenames with responsibility-based names while preserving separate responsibilities;
- canonical orchestration/diagnostics: \`forest-chunk-streamer.js\`;
- frame-budget/core generation: \`forest-chunk-streamer-core.js\`;
- terrain sampling: \`forest-terrain-sampler.js\`;
- frame attribution: \`frame-runtime-profiler.js\`;
- migrated active P9.29–P9.42 QA source paths without changing frame budgets, batch sizes, catch-up budgets, prefetch, retention or hitch attribution behavior;
- intentionally preserved P9.xx diagnostic aliases for compatibility until C6 consolidates diagnostics.

Completion record:
- Integration commit: \`fd667b73\` — modernized forest production names.
- Dev Integration registration commit: \`85cb4554\`.
- Permanent C4 gate run \`33352459857\`: PASS.
- Final C4 Dev Integration run \`33352603137\`: PASS 69/69.
- Candidate validation covered all active forest QA P9.29–P9.42, stress, build and diff hygiene with unchanged measured forest policy values.
- Human validation: not required; this was an ownership/naming migration with performance-sensitive values unchanged.
- Result: forest production filenames describe responsibility rather than historical release steps; diagnostic compatibility remains explicitly deferred to C6.`
);

replaceSection(
  'C5 — Reduce `main.js` size / responsibilities **[P2]**',
  'C6 — Consolidate diagnostic globals **[P2]**',
`### C5 — Reduce \`main.js\` size / responsibilities **[P2]**

Status: **IN PROGRESS — C5.1 DONE (2026-08-30)**

Audit baseline:
- \`main.js\` measured 3245 lines / 100343 bytes, with 54 imports and about 100 top-level functions before C5 extraction work.

Rule:
- \`main.js\` should become a composition root, not another place containing vehicle/terrain/physics rules;
- perform small responsibility-based extractions only;
- preserve accepted visuals, physics and frame pacing exactly.

C5.1 completed — world materials:
- extracted procedural road/water texture creation and static world-surface material configuration into canonical \`src/world-materials.js\`;
- preserved exact texture sizes, deterministic seeds, colors, roughness, bump scales, stencil ownership, anisotropy and contact constants;
- kept the animated shared \`waterTex\` explicit because \`animate()\` advances its UV offset every frame;
- removed more than 200 lines of material-generation responsibility from \`main.js\` without changing visual tuning.

C5.1 completion record:
- Integration commit: \`e14b5ec1\` — move world materials out of main.
- Dev Integration registration commit: \`f6f1f125\`.
- Permanent C5.1 gate run \`33353622236\`: PASS materials contract, terrain ownership, 288 driving cases, stress and build.
- Final C5.1 Dev Integration run \`33353661136\`: PASS 70/70.
- Human validation: not required for this exact extraction; material values and animated-water wiring are protected directly by QA and the full integration suite.

Next C5 extraction:
- C5.2: extract sky/lighting construction (hemisphere light, sun, crescent-moon texture/sprite/light and moon positioning) behind a responsibility-based module;
- retain \`environment-controller.js\` as owner of time-of-day/display-distance behavior;
- retain \`animate()\` cadence and performance-governor ownership in \`main.js\` for this step;
- verify exact light/material constants plus environment QA, stress, driving matrix and build before integration.

Completion record:
- C5 overall remains open until additional high-value responsibilities are removed and \`main.js\` is materially closer to a composition root.`
);

const nextStart='# 6. Recommended next task';
const workStart='# 7. Work log';
const ni=text.indexOf(nextStart);
const wi=text.indexOf(workStart,ni);
if(ni<0||wi<0)throw new Error('recommended-next/work-log markers missing');
text=text.slice(0,ni)+`# 6. Recommended next task\n\n**Next: C5.2 — extract sky/lighting construction from \`main.js\`.**\n\nKeep time-of-day policy in \`environment-controller.js\` and frame cadence/performance-governor logic in \`main.js\`. Move only static sky-light construction and moon positioning behind a responsibility-based module, preserve every accepted visual constant, and require dedicated QA plus full Dev Integration before continuing C5.\n\n---\n\n`+text.slice(wi);

const workLogMarker='# 7. Work log\n';
const logIndex=text.indexOf(workLogMarker);
if(logIndex<0)throw new Error('work-log marker missing');
const entry=`\n## 2026-08-30 — C3/C4 completed; C5.1 world-material extraction completed\n\n- C3 consolidated road geometry into one canonical owner; stale V21.25 implementation-location contracts were migrated without changing route behavior. Permanent gate \`33352045645\` PASS; Dev Integration \`33352045710\` PASS.\n- C4 renamed forest production layers by responsibility while preserving all performance-sensitive values and P9.xx diagnostic compatibility for C6. Permanent gate \`33352459857\` PASS; Dev Integration \`33352603137\` PASS 69/69.\n- C5 audit measured \`main.js\` at 3245 lines / 100343 bytes. C5.1 extracted world materials into \`src/world-materials.js\`, including explicit animated-water texture ownership. Permanent gate \`33353622236\` PASS; Dev Integration \`33353661136\` PASS 70/70.\n- Next focus: C5.2 sky/lighting construction extraction; no time-of-day or frame-pacing policy changes.\n`;
text=text.slice(0,logIndex+workLogMarker.length)+entry+text.slice(logIndex+workLogMarker.length);

fs.writeFileSync(file,text.replace(/[ \t]+$/gm,'').trimEnd()+'\n');
console.log('Tech debt plan updated through C5.1');
