// One local Quaternius model, independent skeletons/materials/mixers per instance.
const people=(()=>{
 const types=new Set(['staff','visitor']),actors=new Map();let asset=null,baseBounds=null,loading=false,error='';
 const animations=['Idle','Walk','Standing','Sitting','Clapping','Run','Jump','RunningJump','Punch','SwordSlash','Death'];
 const labels={Idle:'待机',Walk:'行走（原地）',Standing:'站立',Sitting:'坐姿',Clapping:'鼓掌',Run:'跑步（原地）',Jump:'跳跃',RunningJump:'跑跳',Punch:'挥拳',SwordSlash:'挥臂',Death:'倒地'};
 const clipName=clip=>clip.name.split('|').pop().replace(/^Man_/,'');
 function poseBounds(root){const bounds=new THREE.Box3(),v=new THREE.Vector3();root.updateMatrixWorld(true);root.traverse(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);if(mesh.isSkinnedMesh)mesh.boneTransform(i,v);bounds.expandByPoint(mesh.localToWorld(v));}});return bounds;}
 function status(){const node=document.getElementById('peopleStatus');if(node)node.textContent=error?'人物加载失败，请刷新重试':asset?'Quaternius · 1 款模型 · 内置动画':'人物素材加载中…';document.querySelectorAll('[data-add="staff"],[data-add="visitor"]').forEach(b=>b.disabled=!asset);}
 function load(){
  if(loading||asset)return;loading=true;status();
  const bytes=Uint8Array.from(atob(document.getElementById('humanAsset').textContent.trim()),c=>c.charCodeAt(0));
  new THREE.GLTFLoader().parse(bytes.buffer,'',gltf=>{
   asset=gltf;const idle=asset.animations.find(c=>clipName(c)==='Idle'),mixer=new THREE.AnimationMixer(asset.scene);if(idle){mixer.clipAction(idle).play();mixer.update(0);}baseBounds=poseBounds(asset.scene);mixer.stopAllAction();mixer.uncacheRoot(asset.scene);
   loading=false;status();for(const o of objects)if(types.has(o.userData.type))geometry(o);sync();renderList();
  },e=>{loading=false;error=String(e);status();console.error('人物模型加载失败',e);});
 }
 function dispose(g){const actor=actors.get(g);if(!actor)return;actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.model);actors.delete(g);}
 function build(g){
  if(!asset)return;const p=g.userData,model=THREE.SkeletonUtils.clone(asset.scene);
  const white=new THREE.MeshStandardMaterial({color:'#f3f3ef',roughness:.85,metalness:0,skinning:true});
  const shirt=white.clone();shirt.vertexColors=true;shirt.color.set('#ffffff');const clothesColor=new THREE.Color(p.clothesColor||(p.type==='staff'?'#165DFF':'#f3f3ef'));
  model.traverse(mesh=>{if(!mesh.isMesh)return;const isShirt=mesh.material.name==='Shirt';mesh.geometry=mesh.geometry.clone();
   if(isShirt){
    // Existing arm weights keep sleeves white; tint the torso like a vest, without changing the mesh.
    const {position,skinIndex,skinWeight}=mesh.geometry.attributes,colors=new Float32Array(position.count*3);
    for(let i=0;i<position.count;i++){let armWeight=0;for(let j=0;j<4;j++)if(/^(UpperArm|LowerArm|Palm)/.test(mesh.skeleton.bones[skinIndex.array[i*4+j]].name))armWeight+=skinWeight.array[i*4+j];const color=armWeight>.5?white.color:clothesColor;color.toArray(colors,i*3);}
    mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
   }
   mesh.material=isShirt?shirt:white;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;});
  const offset=new THREE.Group(),visual=new THREE.Group(),size=baseBounds.getSize(new THREE.Vector3()),factor=1.75/size.y*(p.personScale||1);
  offset.position.set(-(baseBounds.min.x+baseBounds.max.x)/2,-baseBounds.min.y,-(baseBounds.min.z+baseBounds.max.z)/2);offset.add(model);visual.add(offset);visual.scale.setScalar(factor);g.add(visual);p.size=size.multiplyScalar(factor).toArray();
  const mixer=new THREE.AnimationMixer(model),clip=asset.animations.find(c=>clipName(c)===(p.animation||'Idle'))||asset.animations.find(c=>clipName(c)==='Idle');if(clip){mixer.clipAction(clip).play();mixer.update(0);}actors.set(g,{model,mixer,white,shirt,visual});
 }
 // Driven people (userData.driven) are skipped here; their owner poses them with pose().
 function update(dt){for(const [g,a] of actors)if(g.visible&&!g.userData.driven)a.mixer.update(dt);}
 // Show clip `name` at `time` seconds (looped). Returns what is shown, or null if g has no model yet.
 function pose(g,name,time){
  const a=actors.get(g);if(!a)return null;
  const clip=asset.animations.find(c=>clipName(c)===name)||asset.animations.find(c=>clipName(c)==='Idle');if(!clip)return null;
  if(a.clip!==clip){a.mixer.stopAllAction();a.action=a.mixer.clipAction(clip);a.action.play();a.clip=clip;}
  a.action.time=((time%clip.duration)+clip.duration)%clip.duration;a.mixer.update(0);
  return {name:clipName(clip),time:a.action.time};
 }
 return {types,actors,animations,labels,load,build,dispose,update,pose,ready:()=>!!asset,error:()=>error};
})();
