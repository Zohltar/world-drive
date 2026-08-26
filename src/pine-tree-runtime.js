// World Drive forest pine derived from the user-supplied pine_tree_01.glb.
// We keep the authored foliage texture but render it on three crossed cards:
// this preserves the pine silhouette at driving distance for only 6 triangles/tree.
const PINE_TEXTURE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAEFklEQVR42o2UXYiUVRjHf+frfeedmV1b0e1CzaKI7FN0YzPYJghLwiiIRQLDq0jILUqCoGiZCKMPFFotDLoRgmDL6CLxqly7Mcu+hEi0oC4ypdbddnZm3vPZxaxGatC5OXD+8D/nec7z/wn+xxpvNHRzaso/tumBt+uL+rfOzMx6bbRWStPttKlUqwQf8M4iL2cwOooCxCWClCQSMUWU1sQYEFIghSRGj5DysoZicpIApIsFYwzOOrLMoJXCWUdRFMQYSTFRqVTQ500W9gSk9Q/ddq8w7qt1N47OQBMO9cR2u01RK0hI5lotjDGUpcMHT5ZltNsd9IJZ6pU6qqpLflo92wn7na/e0Ww2p3vngwJAKUGe5XQ6f2G0QitN13aoVHJiTEBCA6nRaOgb1s4/IePPV0ep1k63y1oK7tEnn7vng3a0G8u5c++T+FE+oqSQgpQiSuekFIGE0prQ7SKEQD7z/MiKm4a6rzjv7grBrW619fVKqa+DFZvOnJ55tzNvE636WQTJ5AZXWozRGGOwpaWoFqSYiDFSFAVqeGTldTaIbnDd5dGo+/44x8mK0q/X+vLlJe6kd3G1qdjhNY1Vx/yfDCujh1Milt1SKq1JKVFaizYGay1y1crNx0Us12a1YlG9rz+v18KpRQPZUiNFvVavHpWZyCjSL1F3NgspMmM03nuEAKV7P50ZDQlSjMgTZ967OStSd8ngkp0imhOVvPjVJbtFKHeNyXSoFle8MRCGdtSvkhNSCKVUb/6MyRZ+M6FNttBPkLE7/3u6cumOVtuem5v23+6bWPaCFMnnNRWUDN19uz79CE7y1rapVm5y561Fa7UwMiVFUYGUCCH0enjk89OtowdPhVvWLRvz0a6/faRdVjK1IcZie1bzW+5/cM0nhRjqTE1NceuqazcKpYZAROucFEIihKC0Dq0V3gdkY7yhAeHL+J0xqp0XekAq87GdDce90xNnpqe3NpvNBKSYAlornA/E4FFaY61DyV42QvDIwR8GE5CSEG1fmj17Xjr0qu1aWRkId+59+fCBzIjvx8Y2ZABa9UqNwZNlOUoKUgxkeQVShJSQk5OTAaB/Rf0zV/X7x/durJqqvVtm7uFnd46sefPFwwcWL+5LAEb1sqyUvNDDvJJDAh88laK4kGUmnjpYAuXu3aP1uX71pbW2eO3pL76ZrQ0ZfjsbAVwIpCDR2lBai0AgpaS0JVppQgj/ps34OHLbtslWEmLMiPp+IUR65/Fj7jwcvHNIKfAh4myJMppuaUkxgpRY6/55IUCzSQTYtf1IB/jwYnxppcjznPnWPFmeo6QkhUClrw9nLYJ0ecACYnx8/BJNaYN3PZBq3YuaybLeHHpPluf/aZiazWa89Brw3mO07pE7RHpRDD3SSMnfjR39HInundIAAAAASUVORK5CYII=';
let cached=null;

export function buildPineTreeAsset(THREE){
  if(cached)return cached;
  const positions=[];
  const uvs=[];
  const indices=[];
  const width=.72;
  for(let card=0;card<3;card++){
    const angle=card*Math.PI/3;
    const nx=Math.cos(angle)*width*.5;
    const nz=Math.sin(angle)*width*.5;
    const base=positions.length/3;
    positions.push(-nx,0,-nz, nx,0,nz, nx,1,nz, -nx,1,-nz);
    uvs.push(0,0, 1,0, 1,1, 0,1);
    indices.push(base,base+1,base+2, base,base+2,base+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const texture=new THREE.TextureLoader().load(PINE_TEXTURE);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.flipY=false;
  const material=new THREE.MeshStandardMaterial({
    map:texture,
    roughness:.88,
    metalness:0,
    transparent:true,
    alphaTest:.38,
    side:THREE.DoubleSide
  });
  cached={geometry,material,source:'pine_tree_01.glb texture',triangles:6};
  return cached;
}
