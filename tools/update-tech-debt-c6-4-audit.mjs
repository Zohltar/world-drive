import fs from 'node:fs';

const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let text=fs.readFileSync(path,'utf8');

const oldStatus='Status: **IN PROGRESS — C6.1/C6.2/C6.3 DONE; C6.4 road-sign audit next (2026-08-31)**';
const newStatus='Status: **IN PROGRESS — C6.1/C6.2/C6.3 DONE; C6.4 road-sign boundary selected (2026-08-31)**';
if(!text.includes(oldStatus))throw new Error('C6.4 pre-audit status marker not found');
text=text.replace(oldStatus,newStatus);

const insertBefore='\n---\n\n# 4. Items intentionally NOT scheduled for immediate deletion';
const audit=`\nC6.4 read-only audit — road-sign diagnostic globals:\n- branch \`audit/diagnostics-c6-4\`; first run \`33397020292\` stopped only in the new audit script because it assumed an obsolete P9.30 diagnostic mode label; no runtime QA executed or failed;\n- corrected run \`33397131467\`: PASS exact global inventory, P9.30 runtime signs, P9.37 combined frame pacing, C5.4 geographic sign orchestration, V21.25 minimap sign readout, runtime import/debt audit and production build;\n- exactly two road-sign diagnostic globals remain: \`__WORLD_DRIVE_P930_ROAD_SIGNS__\` and \`__WORLD_DRIVE_P937_ROAD_SIGNS__\`;\n- P9.30 has one writer in \`src/road-furniture-p930.js\`, zero runtime readers and zero QA/source-string consumers; its current diagnostic mode is \`p930-incremental-sign-build\`;\n- P9.37 has one writer in \`src/road-furniture-p937.js\`, zero runtime readers and exactly one QA/source-string consumer in \`qa-p937-combined-frame-pacing.mjs\`; its current mode is \`p937-idle-sign-collection\`;\n- P9.37 already composes \`base.diagnostics()\` and spreads the complete P9.30 payload before adding its own P9.37 scheduling section, so the P9.30 global is externally redundant even though the P9.30 diagnostic function remains an internal API;\n- accepted behavior remains green: P9.30 runtime built 4 signs with bounded slices/commit, P9.37 coalesced idle refresh stayed intact, C5.4 sign placement policy stayed intact, and minimap readout remains 5 s + fade with bidirectional rearm.\n\nC6.4 selected boundary — one canonical road-sign snapshot:\n- make the stable \`WorldDriveDiagnostics.roadSigns\` category authoritative and expose the existing P9.37 combined diagnostic function as \`roadSigns.snapshot\`;\n- keep P9.30 \`diagnostics()\` internal and unchanged because P9.37 already consumes it; remove \`__WORLD_DRIVE_P930_ROAD_SIGNS__\` because it has no consumer;\n- migrate the sole P9.37 QA source-string contract to the canonical diagnostics root, then remove \`__WORLD_DRIVE_P937_ROAD_SIGNS__\` rather than preserving an otherwise unused compatibility store;\n- preserve exact diagnostic payloads, callable timing and allocation cadence: registration occurs at road-furniture system creation, while each snapshot still computes P9.30 + P9.37 data only when called;\n- no changes to sign geometry, texture/cache policy, placement, geographic sign selection, idle scheduling thresholds, minimap 5 s/fade readout or sign rearm;\n- candidate validation must include C6.4 equivalence, P9.30 runtime, P9.37 combined frame pacing, C5.4 geographic signs, minimap sign readout, C6.1–C6.3, runtime import/debt audit, full stress and production build before integration.\n`;
if(!text.includes('C6.4 read-only audit — road-sign diagnostic globals:')){
  if(!text.includes(insertBefore))throw new Error('C6 section end marker not found');
  text=text.replace(insertBefore,audit+insertBefore);
}

const oldNext=`**Next: C6.4 — audit road-sign diagnostic globals.**\n\nStart read-only: inventory every road-sign diagnostic global, writer, runtime reader and QA/source-string dependency before changing ownership. Preserve the P9.37 compatibility alias until its current consumer/QA contract is explicitly migrated; no road-sign rendering, placement, timing or sign-readout behavior changes during the audit.`;
const newNext=`**Next: C6.4 — implement the audited canonical road-sign snapshot.**\n\nMove only diagnostic publication: register the existing combined P9.37 diagnostic function at \`WorldDriveDiagnostics.roadSigns.snapshot\`, remove the unconsumed P9.30/P9.37 globals after migrating the sole QA source-string contract, and preserve all road-sign rendering, placement, scheduling and minimap readout behavior.`;
if(!text.includes(oldNext))throw new Error('C6.4 recommended-next audit marker not found');
text=text.replace(oldNext,newNext);

fs.writeFileSync(path,text);
console.log('C6.4 audit findings and implementation boundary recorded');
