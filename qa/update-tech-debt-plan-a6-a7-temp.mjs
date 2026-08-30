import fs from 'node:fs';
const path='docs/WORLD_DRIVE_TECH_DEBT_PLAN.md';
let s=fs.readFileSync(path,'utf8');

const a6Status='### A6 — Unify version/build branding **[P1]**\n\nStatus: **TODO**';
if(!s.includes(a6Status))throw new Error('A6 status anchor not found');
s=s.replace(a6Status,'### A6 — Unify version/build branding **[P1]**\n\nStatus: **DONE — 2026-08-30**');
const a6Completion='Completion record:\n- Commit: _pending_\n- QA: _pending_\n\n---\n\n### A7 — Root-level legacy file cleanup';
if(!s.includes(a6Completion))throw new Error('A6 completion anchor not found');
s=s.replace(a6Completion,`Completion record:\n- Initial atomic branding commit: \`9ab5ed8c\` — aligned package/lock to semver \`21.31.0\`, made web branding and Electron title/User-Agent derive from \`package.json\`, removed hard-coded V21.25 HTML labels, and added permanent \`qa-version-branding-a6.mjs\`.\n- Final semantic cleanup: \`7f757ca5\` — development channel is explicitly \`dev\` on \`dev\`, and the legacy DOM-wide MutationObserver/version-text rewrite was removed. Static HTML now exposes only explicit branding placeholders.\n- Source of truth: \`package.json\` owns \`version\` + \`worldDriveChannel\`; \`package-lock.json\` mirrors the machine version; \`src/version.js\` and Electron derive from the package metadata.\n- QA: candidate branding audit \`33333279610\` PASS; initial Dev Integration \`33333169584\` PASS 58 steps; final Dev Integration \`33334578131\` PASS 58 steps with \`V21.31 dev\`, Grip R2–R20, forest, WebGL, live route smoke and production build/code split.\n- Release rule: \`stable\` is reserved for explicit release promotion; development builds identify themselves as \`dev\`.\n- Result: one authoritative version/build metadata source and no global DOM text-rewriting fallback remain.\n\n---\n\n### A7 — Root-level legacy file cleanup`);

const a7Status='### A7 — Root-level legacy file cleanup **[P3]**\n\nStatus: **TODO**';
if(!s.includes(a7Status))throw new Error('A7 status anchor not found');
s=s.replace(a7Status,'### A7 — Root-level legacy file cleanup **[P3]**\n\nStatus: **DONE — 2026-08-30**');
const a7Completion='Completion record:\n- Commit: _pending_\n- QA: _pending_\n\n---\n\n## CLEANUP B — Physics architecture stabilization';
if(!s.includes(a7Completion))throw new Error('A7 completion anchor not found');
s=s.replace(a7Completion,`Completion record:\n- Final commit: \`7f2320ef\` — removed obsolete V20.13 PowerShell version patchers and \`index.html.encoding-backup\`; archived historical V21.25 cleanup and V21.24 packaging notes under \`docs/archive/\`; replaced stale root \`README_PACKAGING.md\` with current A6-based packaging instructions.\n- Additional audit finding: the unversioned root \`README_PACKAGING.md\` was itself a V21.24.64 snapshot, so it was archived as \`docs/archive/README_PACKAGING_V21_24_64.md\` rather than retained as current guidance.\n- Permanent gate: \`qa-repo-hygiene-a7.mjs\` prevents the removed root debris/version patchers from returning and verifies current packaging documentation.\n- Audit run \`33334758106\`: PASS A6 branding, A7 hygiene, runtime debt audit, production build and code split.\n- Final Dev Integration run \`33334825498\`: PASS all 59 steps including A6/A7 gates, V21.31 stress, 288 driving cases, Grip R2–R20, forest/frame pacing, WebGL, live route smoke and build/code split.\n- Result: repository root now contains current entry points/docs only; historical notes are clearly marked as archives.\n\n---\n\n## CLEANUP B — Physics architecture stabilization`);

const nextRe=/# 6\. Recommended next task[\s\S]*?(?=\n---\n\n# 7\. Work log)/;
if(!nextRe.test(s))throw new Error('recommended next task block not found');
s=s.replace(nextRe,`# 6. Recommended next task\n\n**Next: B1 — remove the dead \`postSpinSteeringAuthority\` indirection from the active physics runtime while preserving the R4 guarantee that no hidden steering authority valley can return.**\n\nB1 should be behavior-neutral: the helper currently returns exactly 1 and has one active call site. Update R4/B1 QA to assert the legacy helper and multiplier are absent, then run the complete R2–R20 regression suite before proceeding to B2.\n`);

const log='# 7. Work log\n\n';
if(!s.includes(log))throw new Error('work log anchor not found');
s=s.replace(log,`${log}## 2026-08-30 — A6/A7 completed: branding source unified and repository root cleaned\n\n- Unified web, Electron, Squirrel/package and displayed branding around package metadata; development builds now identify as \`V21.31 dev\`.\n- Removed the legacy DOM-wide version MutationObserver and all static application version labels from \`index.html\`.\n- Archived historical cleanup/packaging notes and deleted obsolete version patch scripts plus the encoding backup.\n- Added permanent A6 branding and A7 repository-hygiene gates to Dev Integration.\n- Final A6 QA: \`33334578131\` PASS 58 steps. Final A7 QA: \`33334825498\` PASS 59 steps.\n- Next focus: B1 physics architecture cleanup, starting with the no-op \`postSpinSteeringAuthority\`.\n\n`);

fs.writeFileSync(path,s);
console.log('TECH DEBT PLAN A6/A7 UPDATE: PASS');
