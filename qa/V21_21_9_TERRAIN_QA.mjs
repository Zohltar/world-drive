import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const terrain=fs.readFileSync(path.join(root,'src/terrain.js'),'utf8');

const checks=[];
const check=(name,ok)=>{checks.push([name,!!ok]);};

check('no_ground_matrix_freeze', !/ground\.matrixAutoUpdate\s*=\s*false/.test(main));
check('initial_ground_plane_rotation', /ground\.rotation\.x\s*=\s*-Math\.PI\/2/.test(main));
check('terrain_geometry_rotated_into_xz', /geometry\.rotateX\(\s*-Math\.PI\/2\s*\)/.test(terrain));
check('terrain_resets_mesh_rotation', /ground\.rotation\.set\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(terrain));
check('rebuild_wrapper_does_not_refreeze_ground', /const rebuildGroundTerrain=\(\)=>terrainService\.rebuildGround\(\);/.test(main));
check('frame_pacing_streaming_8hz', /WORLD_STREAMING_INTERVAL\s*=\s*\.12/.test(main));
check('directional_prefetch_250ms', /nextDirectionalPrefetchAt\s*=\s*now\+250/.test(main));
check('sign_group_split', /signGroup=new THREE\.Group\(\)/.test(main) && /refreshRoadSignsOnly\(\)/.test(main));
check('floating_origin_520', />520\*520/.test(main));
check('other_static_groups_still_frozen', /freezeStaticMatrices\(roadGroup\)/.test(main) && /freezeStaticMatrices\(forestGroup\)/.test(main));

// Minimal transform regression model. terrain.js rotates its new plane geometry
// into XZ and resets the mesh Euler rotation to 0. A stale -90° mesh matrix
// would rotate the already-horizontal XZ vertex into XY (vertical terrain).
function rotateX([x,y,z],a){
  const c=Math.cos(a),s=Math.sin(a);
  return [x,y*c-z*s,y*s+z*c];
}
const horizontalVertex=[100,12,50];
const stale=rotateX(horizontalVertex,-Math.PI/2);
const fixed=rotateX(horizontalVertex,0);
check('regression_model_v218_becomes_vertical', Math.abs(stale[2]+12)<1e-9 && Math.abs(stale[1]-50)<1e-9);
check('regression_model_v219_stays_xz', Math.abs(fixed[1]-12)<1e-9 && Math.abs(fixed[2]-50)<1e-9);

let failed=0;
for(const [name,ok] of checks){
  console.log(`${name}: ${ok?'PASS':'FAIL'}`);
  if(!ok)failed++;
}
if(failed){
  console.error(`FAILED ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`PASS ${checks.length}/${checks.length}`);
