// Dev Integration aggregate entrypoint.
// R7 app/services structural ownership remains a permanent part of the import/source-tree gate.
// R8 current streaming ownership + P9.17-P9.27 are also certified here in isolated child processes.
await import('./qa-source-tree-r7-app-services.mjs');
await import('./qa-r8-streaming-baseline.mjs');
await import('./DEV_INTEGRATION_AUDIT_BASE.mjs');
