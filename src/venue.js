// Context scenery only: never part of editable objects or saved plan data.
function buildVenue(){
 release(venueGroup);venueGroup.clear();venueGroup.name='venue';
 const sx=room.width/67,sz=room.depth/60,north=room.depth/2,west=room.width/2;
 const aisleX=20*.3048,aisleZ=12*.3048,rightW=199*sx,rightD=133*sz,creatorD=368*sz;
 const creatorSouth=north+aisleZ,creatorNorth=creatorSouth+creatorD,leftX=west+aisleX,leftW=269*sx;
 const minX=west-rightW,maxX=leftX+leftW,minZ=north-rightD,maxZ=creatorNorth+34*sz;
 venueGroup.userData={bounds:{minX,maxX,minZ,maxZ},aisleX,aisleZ};
 function floor(name,x0,z0,w,d,color){
  const m=box(venueGroup,w,.10,d,x0+w/2,-.17,z0+d/2,color);m.material.dispose();m.material=new THREE.MeshBasicMaterial({color:new THREE.Color(color).convertSRGBToLinear(),toneMapped:false});m.name=name;m.castShadow=false;return m;
 }
 const hall=floor('hall-ground',minX-2,minZ-2,maxX-minX+4,maxZ-minZ+4,'#f1f0e9');hall.position.y=-.28;
 floor('our-block',west-rightW,north-rightD,rightW,rightD,'#d7ddd5');
 floor('creator-floor',west-rightW,creatorSouth,rightW,creatorD,'#d8e3df');
 floor('west-middle',leftX,creatorSouth,leftW,131*sz,'#d9ddd9');
 floor('west-north',leftX,creatorSouth+169*sz,leftW,233*sz,'#d9ddd9');
 floor('west-south',leftX,minZ,leftW,105*sz,'#d9ddd9');
 const centerX=west-rightW/2,stageZ=creatorNorth-4,midZ=creatorSouth+creatorD/2;
 // Stage, lectern and chairs form one set (local origin = creator floor centre); flipping turns it 180°.
 const set=new THREE.Group();set.name='creator-set';set.position.set(centerX,0,midZ);set.rotation.y=creatorFlipped?Math.PI:0;venueGroup.add(set);
 const sz0=stageZ-midZ;
 const stage=box(set,8,.3,3,0,.03,sz0,'#9eaea6');stage.name='creator-stage';
 box(set,2,.15,.45,0,-.045,sz0-1.725,'#b4c1b7');
 const lectern=new THREE.Group();lectern.name='creator-lectern';lectern.position.set(-2.4,.18,sz0-.3);set.add(lectern);
 box(lectern,.7,1.05,.5,0,.525,0,'#e5e9e0');box(lectern,.85,.06,.65,0,1.08,0,'#f8f9f4');
 // Same chair model as the palette; 2m clear middle aisle, 1.1m row pitch, rows fill the floor down to the south edge.
 const seatNorth=sz0-4.5,rows=Math.floor((seatNorth+creatorD/2-1.2)/1.1)+1,cols=8;
 const prototype=new THREE.Group();prototype.userData={type:'chair',size:[.46,.82,.50]};geometry(prototype);prototype.updateMatrixWorld(true);
 prototype.children.forEach((part,i)=>part.material.color.set(i<2?'#899d91':'#64766a').convertSRGBToLinear());
 for(const part of prototype.children){
  const chairs=new THREE.InstancedMesh(part.geometry,part.material,rows*cols*2);chairs.name='creator-chairs';chairs.castShadow=true;chairs.receiveShadow=true;
  let index=0;const offset=new THREE.Matrix4();
  for(let row=0;row<rows;row++)for(const side of [-1,1])for(let col=0;col<cols;col++){
   offset.makeTranslation(side*(1+.23+col*.7),-.12,seatNorth-row*1.1);chairs.setMatrixAt(index++,offset.clone().multiply(part.matrixWorld));
  }
  set.add(chairs);
 }
}
function venueView(){
 const {minX,maxX,minZ,maxZ}=venueGroup.userData.bounds,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
 // North (+Z) up, east (-X) right, matching the source plan.
 const height=Math.max((maxZ-minZ+8),(maxX-minX+8)/camera.aspect)/2/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
 orbit.target.set(cx,0,cz);camera.position.set(cx,height,cz-.001);orbit.update();
}
