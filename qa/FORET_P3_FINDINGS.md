# Foret P3 findings

Confirmed root causes from runtime/repository audit:

1. The compact GLB committed in P1 is only 7,853 bytes. That is far too small to contain the selected authored tree meshes from the 42.8 MB source scene. The runtime loader therefore had no useful authored tree payload to render.
2. The blue triangular artifacts are not the removed GLB water sample anymore. They come from the terrain-contact river ribbon itself: lifting outer ribbon vertices to high bank terrain creates steep blue triangles/walls when the terrain rises sharply beside the water.
3. Ambient forest generation is active in scenery-renderer.js, so the absence of visible trees is consistent with the asset payload failure rather than missing rebuild calls.
4. Branch `foret` is correctly based on the current dev-integrated route-map commit; the page title remaining V21.31 stable is version-label legacy and not evidence that the wrong branch is running.

P3 correction plan: replace the broken compact asset with verified baked/normalized tree geometry derived from the supplied GLB, and replace bank-lift water geometry with horizontal water surfaces whose lateral extent terminates at terrain intersection points.