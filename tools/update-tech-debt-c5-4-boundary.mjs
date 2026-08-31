import fs from 'node:fs';

const file='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(file,'utf8');

const old=`Next C5 step:\n- C5.4 begins with a fresh post-C5.3 audit before selecting another boundary;\n- continue to prefer low-risk composition/plumbing over the frame-performance governor, physics, terrain rules or C6 diagnostic consolidation.`;
const next=`C5.4 audit completed — selected boundary: geographic sign orchestration:\n- post-C5.3 audit measured \`main.js\` at 2859 lines / 88091 bytes, with 57 imports and 93 top-level functions; audit branch \`audit/main-c5-4\`, run \`33354840492\` PASS responsibility inventory, import/debt audit and production build;\n- the safest cohesive remaining block is the 106-line contiguous fallback/sign-placement orchestration currently at roughly lines 978–1083;\n- \`src/signs.js\` already states that 3D rendering/fallback signs remained in \`main.js\` for its first extraction, so C5.4 completes that existing boundary instead of creating a competing subsystem;\n- extend \`signs.js\` with a geographic-sign orchestration factory owning fallback city/river/speed selection and calls into the rendering callback;\n- keep \`createSignDataService(...)\` authoritative for OSM sign/city/river loading/parsing;\n- keep \`road-furniture.js\` authoritative for 3D sign geometry/materials, atomic sign refresh and face-cache/frame-budget behavior;\n- preserve exact fallback thresholds/distances: route correlation 120 m, speed confidence > .20, nearby-speed suppression 900 m, speed placement +95 m, river -22 m, city -55 m and visible corridor +/-1600 m;\n- preserve endpoint city deduplication, river-name fallback, sign status count, route heights and current left/right placement semantics.\n\nC5.4 required validation:\n- dedicated orchestration QA for endpoint-city, river and speed fallback decisions plus exact distance/threshold constants;\n- existing P9.30 road-sign runtime QA;\n- V21.25 minimap/sign-readout regressions;\n- 288 driving cases, stress and production build;\n- full Dev Integration before C5.4 is declared done.\n\nExplicitly out of scope:\n- performance/frame governor remains deferred;\n- road metadata/hydro/vehicle-selection/route-load ownership remains unchanged;\n- C6 diagnostic-global consolidation remains separate.`;
if(!text.includes(old))throw new Error('C5.4 audit placeholder not found');
text=text.replace(old,next);

const oldRecommended=`**Next: C5.4 — perform a fresh post-C5.3 responsibility audit of \`main.js\` and select the next cohesive low-risk extraction.**\n\nStart from the 2859-line post-C5.3 source. Prefer composition/configuration plumbing; keep the performance governor deferred unless no safer high-value boundary remains. Do not fold C6 diagnostic-global consolidation into C5.4.`;
const newRecommended=`**Next: C5.4 — complete geographic sign orchestration extraction into \`src/signs.js\`.**\n\nMove only fallback city/river/speed selection and sign-placement orchestration. Keep OSM loading/parsing in the existing sign data service and keep all 3D sign construction/frame-budget ownership in \`road-furniture.js\`. Preserve thresholds and placement constants exactly; require dedicated sign orchestration QA, existing sign/minimap regressions, stress and full Dev Integration.`;
if(!text.includes(oldRecommended))throw new Error('C5.4 recommended audit text not found');
text=text.replace(oldRecommended,newRecommended);

const marker='# 7. Work log\n';
const i=text.indexOf(marker);
if(i<0)throw new Error('work log marker missing');
const entry=`\n## 2026-08-30 — C5.4 audit completed; geographic-sign boundary selected\n\n- Fresh post-C5.3 audit: \`main.js\` = 2859 lines / 88091 bytes / 57 imports / 93 top-level functions; audit run \`33354840492\` PASS.\n- Selected the contiguous ~106-line geographic fallback/sign-placement block as lower risk than the frame governor, hydro, route load or vehicle selection.\n- C5.4 will complete the boundary explicitly left in \`signs.js\`: data loading remains there, fallback orchestration moves there, while \`road-furniture.js\` retains 3D rendering and P9.30 frame-budget ownership.\n- Exact fallback thresholds/offsets are frozen by the C5.4 contract; no visual, routing or metadata tuning is allowed.\n`;
text=text.slice(0,i+marker.length)+entry+text.slice(i+marker.length);

fs.writeFileSync(file,text.replace(/[ \t]+$/gm,'').trimEnd()+'\n');
console.log('C5.4 boundary recorded in tech debt plan');
