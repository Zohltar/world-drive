// Dev Integration aggregate entrypoint.
// R7 app/services structural ownership remains a permanent part of the import/source-tree gate.
// R8 current streaming ownership + P9.17-P9.27 are also certified here in isolated child processes.
// R8 issue #2 imagery diagnostics remain permanently covered without changing rendering behavior.
// R8.2 keeps the current public imagery owner at root while nesting only the historical P9.13 implementation.
// R8.3 keeps the current streaming owner/root P9.13 path stable while nesting the historical scheduler implementation.
await import('./qa-source-tree-r7-app-services.mjs');
await import('./qa-source-tree-r8-imagery.mjs');
await import('./qa-source-tree-r8-streaming.mjs');
await import('./qa-r8-streaming-baseline.mjs');
await import('./qa-r8-issue2-imagery-diagnostics.mjs');
await import('./DEV_INTEGRATION_AUDIT_BASE.mjs');
