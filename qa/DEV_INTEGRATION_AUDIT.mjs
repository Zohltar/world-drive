// Dev Integration permanent regression inventory.
// Issue #9 stays here after certification: future imagery/terrain changes must
// keep the road-aware satellite tessellation clearance contract green.
await import('./qa-post-refactor-dom-safety-r1.mjs');
await import('./qa-route-generation-race-r3.mjs');
await import('./qa-route-generation-p935-r3.mjs');
await import('./qa-forest-route-cache-r3.mjs');
await import('./qa-forest-terrain-commit-alignment-r6.mjs');
await import('./qa-forest-route-cache-suspension-r7.mjs');
await import('./qa-post-refactor-road-transition-baseline-r1.mjs');
await import('./qa-post-refactor-visual-job-timing-r1.mjs');
await import('./qa-post-refactor-lan-relay-hardening-r1.mjs');
await import('./qa-post-refactor-electron-ipc-origin-r1.mjs');
await import('./qa-post-refactor-overpass-parity-r1.mjs');
await import('./qa-post-refactor-local-data-build-r1.mjs');
await import('./qa-source-tree-r7-app-services.mjs');
await import('./qa-source-tree-r8-imagery.mjs');
await import('./qa-source-tree-r8-streaming.mjs');
await import('./qa-source-tree-r8-local-world.mjs');
await import('./qa-source-tree-r8-terrain.mjs');
await import('./qa-source-tree-r8-world-scene.mjs');
await import('./qa-source-tree-r8-world-materials.mjs');
await import('./qa-r8-streaming-baseline.mjs');
await import('./qa-r8-issue2-imagery-diagnostics.mjs');
await import('./qa-route-start-final-placement-r8.mjs');
await import('./qa-r8-forest-route-readiness.mjs');
await import('./qa-r9-root-cleanliness.mjs');
await import('./qa-phase-o-naming-boundary.mjs');
await import('./qa-issue9-road-aware-grid-r2.mjs');
await import('./DEV_INTEGRATION_AUDIT_BASE.mjs');