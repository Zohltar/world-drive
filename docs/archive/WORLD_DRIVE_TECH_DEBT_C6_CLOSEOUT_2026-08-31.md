# World Drive — Cleanup C6 Closeout

Date: 2026-08-31
Status: **C6 DONE — human game validation is the next checkpoint**

This document is the authoritative addendum for the end of C6 (`Consolidate diagnostic globals [P2]`) until the large master plan is next folded/rebased. It records the work completed after the C6.9 audit already present in `WORLD_DRIVE_TECH_DEBT_PLAN.md`.

## C6.9 — Traffic-network diagnostics — DONE

Canonical owner:
- `WorldDriveDiagnostics.traffic.network`

Removed independent legacy observer:
- `WorldDriveTrafficNetwork`

Preserved unchanged:
- Traffic MP1 peer election
- sequence handling
- snapshot sanitization and at-most-two-agent cap
- outgoing authority merge
- incoming network/legacy handling
- Node/Electron relay
- traffic rendering

Candidate validation:
- commit `609894126784afe98ab97625bc53b5336a97c11f`
- workflow run `33437638923` — PASS

## C6.10 — Traffic-preload diagnostics — DONE

Canonical owner:
- `WorldDriveDiagnostics.traffic.preload`

Removed independent legacy observer:
- `WorldDriveTrafficPreload`

Preserved unchanged:
- `GLTFLoader.loadAsync` reuse patch
- force-cache asset fetch
- sequential Sonata -> generic passenger pack preload
- WeakMap template cache
- traffic startup behavior

Candidate validation:
- commit `a3b71a46c5a303d9b7169148c6fea2cd9597c1eb`
- workflow run `33438138900` — PASS

## C6.11 — Multiplayer HD visual diagnostics — DONE

Canonical owner:
- `WorldDriveDiagnostics.multiplayer.hdVisuals`

Removed independent legacy observer:
- `__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__`

Ownership preserves the existing two-phase lifecycle:
1. lazy facade diagnostics before the M4 visual implementation is loaded;
2. loaded M4 diagnostics after `multiplayer-visuals-m3.js` takes ownership.

Preserved unchanged:
- visual lazy loading
- authored local-controller adapter
- smoothing
- GLB/material/light behavior
- terrain/support alignment
- M4.14 and M4.15 rendering paths

Candidate validation:
- commit `273e172f59eca8e5b49856dc9aa688e65c0796a6`
- workflow run `33438664632` — PASS

## C6.12 — Traffic runtime/pool diagnostics — DONE

Canonical owners:
- `WorldDriveDiagnostics.traffic.runtime`
- `WorldDriveDiagnostics.traffic.pool`

Compatibility behavior:
- production MP1 facade installs marked delegates for `WorldDriveTraffic` and `WorldDriveTrafficPool`;
- the validated R7 local engine keeps its direct bootstrap observers for direct module construction / QA, and the production facade replaces them synchronously;
- `WorldDriveTrafficSpawn` remains a direct functional QA/dev command and is not classified as diagnostics.

Preserved unchanged:
- R7 local traffic engine
- MP1 authority/follower behavior
- local/pool/preload behavior
- traffic rendering and spawn rules

Candidate validation:
- commit `a121f791cdb62d33f2cee3dbf806ee7d880c35a6`
- workflow run `33438943332` — PASS

## Final C6 integration validation

Permanent Dev Integration registration:
- commit `f486ce18f156a2369c5bbcef3f8c4dc08330a8f2`

Dev Integration run:
- workflow run `33439116807` — PASS
- 87 workflow steps completed successfully
- includes C6.1 through C6.12
- full V21.31 regression stress
- 288-case driving dynamics matrix
- grip R2-R20 regressions
- terrain, traffic, forest and frame-pacing regressions
- M4.14 authored reverse WebGL QA
- M4.15 network-to-WebGL reverse QA
- live route smoke
- production build and code-split QA

## Final global boundary

A fresh source inventory was run after C6.12. A permanent boundary QA now fails if a new direct global surface appears or if ownership of the retained surfaces changes unexpectedly.

Permanent gate:
- `qa/qa-diagnostics-c6-final-inventory.mjs`
- `.github/workflows/qa-diagnostics-c6-final-inventory.yml`

Retained direct World Drive surfaces are intentionally limited to:

### Runtime contract
- `__WORLD_DRIVE_P923_LOCAL_WORLD__`
  - three layered writers: P9.25, P9.26, current local-world builder
  - actively read by the streaming coordinator for prepared world operations
  - this is a live runtime bridge, not a diagnostic observer

### Build metadata
- `worldDriveBuild`
  - build/version branding surface

### Traffic compatibility bootstrap
- `WorldDriveTraffic`
- `WorldDriveTrafficPool`
  - direct only inside the validated local R7 engine for direct-use compatibility
  - production MP1 facade replaces both with marked delegates to canonical diagnostics

### Functional QA/dev command
- `WorldDriveTrafficSpawn`
  - intentionally remains a direct command

### Platform polyfills
- `requestAnimationFrame`
- `requestIdleCallback`
- `setTimeout`
  - browser/runtime fallback surfaces; not World Drive diagnostics

All remaining forest/frame-pacing/physics-shadow legacy diagnostic names are marked compatibility aliases whose canonical implementations live under `WorldDriveDiagnostics`.

## C6 exit decision

**C6 is complete.**

No remaining direct global is an unowned diagnostic observer. Further removal of the retained runtime/control/compatibility surfaces would expand scope into streaming architecture, validated traffic compatibility, or platform behavior and is therefore intentionally deferred.

## Mandatory next checkpoint — human game validation

Do **not** start the next cleanup phase before this checkpoint.

Validate manually:
1. route load and terrain/road generation;
2. normal driving and steering feel;
3. braking in curves;
4. bumps, crests, launches and landings;
5. local traffic;
6. multiplayer traffic/session behavior if available;
7. vehicle switching;
8. headlights, brake lights, reverse lights and turn signals;
9. road signs plus HUD/map readout;
10. satellite/procedural imagery and cache behavior;
11. world streaming across several kilometres;
12. FPS, micro-stutters and hitch behavior;
13. one longer driving session to detect progressive regressions.

Only after the human validation is satisfactory should the next technical-debt phase be selected.
