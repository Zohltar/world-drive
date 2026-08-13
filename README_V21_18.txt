World Drive V21.18 - Flat Departure Platform

Base: V21.17 validated baseline.

Goal
- Every route must begin on a stable, flat driving surface, including extreme mountain starts such as Chuspipata / Yungas.

Changes
- First 28 m of the road profile are forced perfectly level longitudinally.
- Road camber/roll is also forced to 0 over those first 28 m.
- Original road elevation and camber return smoothly from 28 m to 100 m.
- Horizontal route geometry is unchanged.
- A terrain start pad is generated around the first route point: approximately 40 m x 20 m flat core with a 22 m smooth terrain blend.
- The start pad follows the first route segment explicitly, not the nearest X/Z switchback branch.
- Spawn placement now resolves the road by cumulative route distance, preventing an overlapping upper/lower switchback from being selected by mistake.
- The start-only logic automatically disables itself once streaming moves away from route kilometre 0.

Version
- UI / runtime: V21.18 / 21.18-alpha
- package.json: 21.18.0

Files to replace
- src/main.js
- src/terrain.js
- package.json
