WORLD DRIVE V21.20.1 — WINDOWS OSM NETWORK FIX

Base: V21.20 Windows Multiplayer candidate.

Fixes Windows/Electron only:
- Overpass POST requests (hydrography, scenery, signs, road metadata/bridges) are routed through a same-origin local proxy handled by Electron/Node.
- Browser/Vite mode keeps using direct Overpass fetches exactly as before.
- Desktop static server prefers fixed localhost port 17317 so IndexedDB/cache/settings remain on the same origin between launches; it falls back to a dynamic port if 17317 is already occupied.
- Multiplayer host/join integration is unchanged.
- Road mesh and terrain are unchanged.

Test focus:
1. npm run desktop
2. Load Manic-5 or Yungas
3. Advanced: Hydrographie should become OSM/Cache, Decor reel should populate, Ponts/Panneaux may populate when mapped.
4. Close/reopen desktop: OSM cache should persist because the desktop origin is stable.
