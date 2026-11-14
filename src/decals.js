// Figma 贴图：物料模式（含「管理贴面」）、左栏贴面清单与贴图面板、3D 贴图平面、本机图片仓库（IndexedDB）、Figma 取图。
// 与 app.js 打包在同一个 <script> 里：直接用 app.js 的全局（objects / room / roomGroup / selected / select / checkpoint / persist / geometry …）。
// Decals.create() 由 app.js 在界面就绪后调用一次；数据规则在 decal-model.js。
const Decals=(()=>{
const TOKEN_KEY='ces-figma-token';
const NOT_IMAGE='这个文件不是图片。请从 Figma 导出 PNG、JPG 或 SVG。';
const BAD_LINK='这不是 Figma 画框链接。请在 Figma 选中画框 → 右键「复制链接」再贴。';
class Shown extends Error{} // 直接给用户看的错误

// ---------- 图片仓库：按内容 hash 存 IndexedDB，方案里只存 assetId ----------
let dbp=null;
function db(){return dbp||(dbp=new Promise((ok,bad)=>{const r=indexedDB.open('ces-decal-assets',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets');r.onsuccess=()=>ok(r.result);r.onerror=()=>{dbp=null;bad(r.error);};}));}
function tx(mode,fn){return db().then(d=>new Promise((ok,bad)=>{const t=d.transaction('assets',mode),req=fn(t.objectStore('assets'));t.oncomplete=()=>ok(req.result);t.onerror=t.onabort=()=>bad(t.error);}));}
const getAsset=id=>tx('readonly',s=>s.get(id));
const putAsset=(id,rec)=>tx('readwrite',s=>s.put(rec,id));
async function hash(buf){
 if(crypto.subtle)return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buf))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const u=new Uint8Array(buf);let out='';for(let k=0;k<8;k++){let h=2166136261^k*16777619;for(let i=0;i<u.length;i++)h=Math.imul(h^u[i],16777619);out+=(h>>>0).toString(16).padStart(8,'0');}return out; // 没有 crypto.subtle 的老环境
}
const pics=new Map(); // assetId → Promise<{img,width,height}>
function loadImg(blob){return new Promise((ok,bad)=>{const img=new Image();img.onload=()=>ok(img);img.onerror=()=>bad(new Shown('图片打不开，可能文件损坏了。'));img.src=URL.createObjectURL(blob);});}
function imageOf(id){
 if(!pics.has(id))pics.set(id,getAsset(id).then(rec=>{if(!rec)throw Error('missing');return loadImg(rec.blob).then(img=>({img,width:rec.width,height:rec.height}));}).catch(e=>{pics.delete(id);throw e;}));
 return pics.get(id);
}
// 进仓库：非图片拒收；长边超过 2048 缩小；SVG / WebP 等转成 PNG。先存图成功，才返回 id。
async function ingest(blob){
 if(!blob||!/^image\/(png|jpeg|svg\+xml|webp|gif)$/.test(blob.type))throw new Shown(NOT_IMAGE);
 const img=await loadImg(blob);let w=img.naturalWidth||1024,h=img.naturalHeight||1024;const k=Math.min(1,2048/Math.max(w,h));
 let out=blob,mime=blob.type;
 if(k<1||!['image/png','image/jpeg'].includes(mime)){
  w=Math.max(1,Math.round(w*k));h=Math.max(1,Math.round(h*k));const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
  mime=mime==='image/jpeg'?'image/jpeg':'image/png';out=await new Promise(ok=>c.toBlob(ok,mime,.92));
 }
 URL.revokeObjectURL(img.src);
 const id=await hash(await out.arrayBuffer());
 try{await putAsset(id,{mime,width:w,height:h,blob:out});}catch(e){throw new Shown('图片存不进本机（浏览器存储不可用或满了）。请先导出 JSON 备份。');}
 return id;
}
const toBase64=blob=>new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=()=>bad(r.error);r.readAsDataURL(blob);});
async function exportAssets(ids){const out={};for(const id of ids){const rec=await getAsset(id).catch(()=>null);if(rec)out[id]={mime:rec.mime,width:rec.width,height:rec.height,base64:await toBase64(rec.blob)};}return out;}
async function importAssets(assets){for(const [id,a] of Object.entries(assets)){const bin=atob(a.base64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);await putAsset(id,{mime:a.mime,width:a.width,height:a.height,blob:new Blob([u],{type:a.mime})});}}

function create(onMode){
 const M=DecalModel,NAMES=M.FACE_NAMES;
 const el=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k.startsWith('on'))e[k]=v;else e.setAttribute(k,v);}e.append(...kids);return e;};
 const S={mode:false,manage:false,owner:null,face:null,error:'',busy:false,relink:false,needToken:false,pendingLink:''};
 let hover=null,hlKey=null,pending=0;
 const track=p=>{pending++;return Promise.resolve(p).finally(()=>pending--);};
 const key=(owner,face)=>owner+'|'+face;

 // ---------- 贴图的主人：一个物体，或场地（A/B 墙） ----------
 function objTarget(o){const t=o.userData.type;return {owner:'obj:'+o.userData.id,data:o.userData,allowed:M.facesFor(t,o.userData),parents:[o],
  name:()=>(t.startsWith('acrylic')?'亚克力立牌':definitions[t].name)+' '+o.userData.id,
  spec:f=>{const s=M.faceSpec(t,o.userData.size,f,o.userData);return s&&{parent:o,...s};}};}
 const wall=f=>roomGroup.getObjectByName(f==='A'?'wallA':'wallB');
 function roomTarget(){return {owner:'room',data:room,allowed:['A','B'],parents:['A','B'].map(wall).filter(Boolean),
  name:f=>f==='A'?'A 左墙':'B 后墙',spec:f=>wall(f)?{parent:wall(f),...M.wallSpec(room,f)}:null};}
 function target(owner){if(owner==='room')return roomTarget();const o=objects.find(o=>'obj:'+o.userData.id===owner);return o?objTarget(o):null;}
 const facesOn=t=>t?.data.decalFaces||[];
 const decalOf=(t,f)=>t?.data.decals?.[f];
 const panelFaces=(t,f)=>t.owner==='room'?[f]:facesOn(t);
 function setFaces(t,faces){
  const d=t.data;if(faces.length)d.decalFaces=faces;else delete d.decalFaces;
  for(const f of Object.keys(d.decals||{}))if(!faces.includes(f))delete d.decals[f];
  if(d.decals&&!Object.keys(d.decals).length)delete d.decals;
 }

 // ---------- 3D：贴图平面、亮面、悬停高亮 ----------
 const plane=(color,opacity,offset)=>new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:offset}));
 const hl=plane(0x2f7cf6,.32,-4);hl.renderOrder=6;hl.userData.hl=true;
 function place(mesh,spec){const round=!!spec.round;if(mesh.isMesh&&!!mesh.userData.round!==round){mesh.geometry.dispose();mesh.geometry=round?new THREE.CircleGeometry(.5,64):new THREE.PlaneGeometry(1,1);mesh.userData.round=round;}spec.parent.add(mesh);mesh.position.set(...spec.pos);mesh.rotation.set(...spec.rot);mesh.scale.set(spec.scale[0],spec.scale[1],1);}
 function highlight(f){hlKey=f?key(f.owner,f.face):null;hl.parent?.remove(hl);const s=f&&target(f.owner)?.spec(f.face);if(s)place(hl,s);}
 function clear(t,kind){for(const p of t.parents)for(const c of [...p.children])if(c.userData[kind]){p.remove(c);c.geometry.dispose();c.material.map?.dispose();c.material.dispose();}}
 function addDecal(t,face,d){
  const spec=t.spec(face);if(!spec)return;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,visible:false}));
  m.userData={decal:true,dk:{owner:t.owner,face}};m.renderOrder=4;place(m,spec);
  const [fw,fh]=spec.size,{fit,scale,ox,oy,rot}=d;
  track(imageOf(d.assetId).then(pic=>{
   if(!m.parent)return; // 期间已被重画
   const den=2048/Math.max(fw,fh),c=document.createElement('canvas');c.width=Math.max(2,Math.round(fw*den));c.height=Math.max(2,Math.round(fh*den));
   const p=M.placeImage(c.width,c.height,pic.width,pic.height,{fit,scale,ox,oy,rot}),x=c.getContext('2d');x.translate(p.cx,p.cy);x.rotate(p.angle);x.drawImage(pic.img,-p.w/2,-p.h/2,p.w,p.h);
   const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   m.material.map=tex;m.material.visible=true;m.material.needsUpdate=true;m.userData.size=[c.width,c.height];
  }).catch(()=>{m.userData.missing=true;}));
 }
 const tintFaces=t=>S.mode?facesOn(t):[];
 function drawTints(t){clear(t,'tint');for(const f of tintFaces(t)){const s=t.spec(f);if(!s)continue;const m=plane(0x2f7cf6,.24,-3);m.renderOrder=5;m.userData={tint:true,dk:{owner:t.owner,face:f}};place(m,s);}}
 function drawTarget(t){clear(t,'decal');for(const [f,d] of Object.entries(t.data.decals||{}))if(facesOn(t).includes(f))addDecal(t,f,d);drawTints(t);if(t.owner===S.owner)markCurrent();}
 // 面板打开着的那一面：一直描一圈蓝框（还没贴图时再铺一层浅蓝），图本身不被盖住
 const frameMat=new THREE.MeshBasicMaterial({color:0x2f7cf6,toneMapped:false,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,side:THREE.DoubleSide});
 let current=null;
 function markCurrent(){
  if(current){current.parent?.remove(current);current.traverse(c=>{if(c.isMesh){c.geometry.dispose();if(c.material!==frameMat)c.material.dispose();}});current=null;}
  const t=S.mode&&!S.manage&&S.owner&&target(S.owner),sp=t&&facesOn(t).includes(S.face)&&t.spec(S.face);if(!sp)return;
  const b=Math.min(.03,Math.max(.008,Math.min(...sp.size)*.04)),bx=b/sp.size[0],by=b/sp.size[1];let g;
  if(sp.round)g=new THREE.RingGeometry(.5-bx,.5,64);
  else{const sh=new THREE.Shape([[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>new THREE.Vector2(x,y))),hole=new THREE.Path([[-.5+bx,-.5+by],[.5-bx,-.5+by],[.5-bx,.5-by],[-.5+bx,.5-by]].map(([x,y])=>new THREE.Vector2(x,y)));sh.holes.push(hole);g=new THREE.ShapeGeometry(sh);}
  current=new THREE.Group();current.userData={current:true,key:key(S.owner,S.face)};const frame=new THREE.Mesh(g,frameMat);frame.renderOrder=7;current.add(frame);
  if(!decalOf(t,S.face)){const fill=plane(0x2f7cf6,.3,-4);fill.renderOrder=6;if(sp.round){fill.geometry.dispose();fill.geometry=new THREE.CircleGeometry(.5,64);}current.add(fill);}
  place(current,sp);
 }
 const allTargets=()=>[roomTarget(),...objects.map(objTarget)];
 const drawAllTints=()=>allTargets().forEach(drawTints);
 const redraw=owner=>{const t=target(owner);if(t)drawTarget(t);};

 // ---------- 鼠标下是哪个面 ----------
 const caster=new THREE.Raycaster(),ndc=new THREE.Vector2();
 function faceAt(x,y){
  const r=renderer.domElement.getBoundingClientRect();ndc.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);camera.updateMatrixWorld();scene.updateMatrixWorld(true);caster.setFromCamera(ndc,camera);
  const targets=[...objects.filter(o=>o.visible),...['A','B'].map(wall).filter(w=>w&&w.visible)];
  const hit=caster.intersectObjects(targets,true).find(h=>!h.object.userData.hl);if(!hit)return null;
  if(hit.object.userData.dk)return {...hit.object.userData.dk};
  if(hit.object.name==='wallA')return hit.face.normal.x>.5?{owner:'room',face:'A'}:null;
  if(hit.object.name==='wallB')return hit.face.normal.z>.5?{owner:'room',face:'B'}:null;
  let o=hit.object;while(o.parent&&!objects.includes(o))o=o.parent;if(!objects.includes(o))return null;
  // 点中的位置落在哪个可贴面里：朝向一致、在面的范围内，取离得最近的（L 台有两个面朝同一边）
  const t=objTarget(o),n=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);let best=null,bestDist=Infinity;
  for(const f of t.allowed){const sp=t.spec(f);if(!sp)continue;
   probe.position.set(...sp.pos);probe.rotation.set(...sp.rot);probe.scale.set(sp.scale[0],sp.scale[1],1);probe.updateMatrix();probe.matrixWorld.multiplyMatrices(o.matrixWorld,probe.matrix);
   if(fn.set(0,0,1).transformDirection(probe.matrixWorld).dot(n)<.7)continue;
   const q=hit.point.clone().applyMatrix4(inv.copy(probe.matrixWorld).invert());if(Math.abs(q.x)>.52||Math.abs(q.y)>.52)continue;
   const dist=Math.abs(q.z);if(dist<bestDist){best=f;bestDist=dist;}}
  return best?{owner:t.owner,face:best}:null;
 }
 const probe=new THREE.Object3D(),fn=new THREE.Vector3(),inv=new THREE.Matrix4();
 const litAt=(x,y)=>{const f=S.mode&&!S.manage&&faceAt(x,y);return f&&facesOn(target(f.owner)).includes(f.face)?f:null;};

 // ---------- 管理贴面：在贴图模式里点任意物体 / 墙的面，加上或去掉「可贴图的面」 ----------
 function toggleFace(f){const t=target(f.owner);if(!t)return;const on=facesOn(t).includes(f.face);
  const go=()=>{checkpoint();setFaces(t,on?facesOn(t).filter(x=>x!==f.face):t.allowed.filter(x=>x===f.face||facesOn(t).includes(x)));drawTarget(t);persist();renderPanel();};
  if(on&&decalOf(t,f.face))ask(t.name(f.face)+'「'+NAMES[f.face]+'」已经贴了图。去掉这个面会把图一起删掉（可以撤销）。','删除',go);else go();}
 function setManage(on){if(on===S.manage)return;S.manage=on;closeAsk();Object.assign(S,{owner:null,face:null,error:'',relink:false,needToken:false});hover=null;highlight(null);renderer.domElement.style.cursor='';renderPanel();}
 // 删除确认：带蒙层的小窗，必须选了才能继续
 let askBox=null;
 function closeAsk(){askBox?.remove();askBox=null;}
 function ask(text,okText,ok){closeAsk();const yes=el('button',{class:'dk-btn danger-fill',onclick:()=>{closeAsk();ok();}},okText),no=el('button',{class:'dk-btn',onclick:closeAsk},'取消');
  askBox=el('div',{class:'dk-modal',onclick:e=>{if(e.target===askBox)closeAsk();}},el('div',{class:'dk-dialog',role:'alertdialog','aria-modal':'true'},el('p',{},text),el('div',{class:'dk-actions'},no,yes)));document.body.append(askBox);yes.focus();}

 // ---------- 贴图模式 ----------
  const side=el('div',{id:'decalSide',class:'dk-panel',hidden:''});document.querySelector('aside').append(side); // 物料模式下替换左栏
 function setMode(on){
  if(on===S.mode)return;
  if(on){cancelPlacement();setWalking(false);showLibrary(false);}
  S.mode=on;S.manage=false;closeAsk();if(on)select(null);Object.assign(S,{owner:null,face:null,error:'',relink:false,needToken:false});onMode?.();
  highlight(null);renderer.domElement.style.cursor='';drawAllTints();renderPanel();
 }
 const manageBtn=el('button',{class:'dk-btn',onclick:()=>setManage(!S.manage)});

 // ---------- 贴上 / 改 / 删 ----------
 function apply(owner,face,assetId,source,keep){
  const t=target(owner);if(!t||!facesOn(t).includes(face))return;
  checkpoint();const prev=decalOf(t,face),d=t.data.decals||(t.data.decals={});
  const p=keep&&prev?{fit:prev.fit,scale:prev.scale,ox:prev.ox,oy:prev.oy,rot:prev.rot}:M.defaults();
  d[face]={source,assetId,...p};drawTarget(t);persist();
  if(S.mode)Object.assign(S,{owner,face,error:'',relink:false});renderPanel();
 }
 function fail(owner,face,e){if(!(e instanceof Shown))console.error(e);if(S.mode)Object.assign(S,{owner,face,error:e instanceof Shown?e.message:'出错了，请重试。'});renderPanel();}
 function applyFile(owner,face,file,keep=false){
  if(S.owner!==owner||S.face!==face)Object.assign(S,{owner,face,relink:false,needToken:false});
  S.error='';S.busy=true;renderPanel();
  return track(ingest(file).then(id=>{S.busy=false;apply(owner,face,id,{kind:'file'},keep);}).catch(e=>{S.busy=false;fail(owner,face,e);}));
 }
 async function figmaBlob(src,token){
  let res;try{res=await fetch('https://api.figma.com/v1/images/'+src.fileKey+'?ids='+encodeURIComponent(src.nodeId)+'&format=png',{headers:{'X-Figma-Token':token}});}catch(e){throw new Shown('连不上 Figma，请检查网络后再试。');}
  if(res.status===401||res.status===403){S.needToken=true;throw new Shown('Figma 令牌无效，或这个令牌打不开这个文件：请重新生成令牌后粘贴。');}
  if(res.status===404)throw new Shown('找不到这个 Figma 文件：请确认链接来自你能打开的文件。');
  if(res.status===429)throw new Shown('Figma 说请求太频繁，等一分钟再试。');
  if(!res.ok)throw new Shown('Figma 暂时出错（'+res.status+'），稍后再试。');
  const url=(await res.json().catch(()=>({}))).images?.[src.nodeId];if(!url)throw new Shown('Figma 里找不到这个画框。请在 Figma 选中画框 → 右键「复制链接」再贴。');
  let img;try{img=await fetch(url);}catch(e){throw new Shown('Figma 给了图片地址，但浏览器不让网页读取这张图（跨域限制），这个做法走不通，需要改。');}
  if(!img.ok)throw new Shown('Figma 图片下载失败（'+img.status+'），稍后再试。');
  const blob=await img.blob();return blob.type?blob:new Blob([blob],{type:'image/png'});
 }
 function applyLink(owner,face,text,keep=false){
  const parsed=M.parseFigmaUrl(text);
  Object.assign(S,{owner,face,error:''});
  if(!parsed){S.error=BAD_LINK;renderPanel();return Promise.resolve();}
  const token=localStorage.getItem(TOKEN_KEY);
  if(!token){Object.assign(S,{needToken:true,pendingLink:text.trim(),pendingKeep:keep});renderPanel();return Promise.resolve();}
  const source={kind:'figma',url:text.trim(),...parsed};S.busy=true;renderPanel();
  return track(figmaBlob(source,token).then(ingest).then(id=>{S.busy=false;S.needToken=false;apply(owner,face,id,source,keep);}).catch(e=>{S.busy=false;if(S.needToken){S.pendingLink=text.trim();S.pendingKeep=keep;}fail(owner,face,e);}));
 }
 function change(t,face,fn,{record=true,repaint=true}={}){const d=decalOf(t,face);if(!d)return;if(record)checkpoint();fn(d);drawTarget(t);if(record)persist();else schedulePersist();if(repaint)renderPanel();}

 // ---------- 面板 ----------
 const picker=el('input',{type:'file',accept:'image/png,image/jpeg,image/svg+xml,image/webp',hidden:''});document.body.append(picker);
 let pickFor=null;picker.onchange=()=>{const f=picker.files[0];if(f&&pickFor)applyFile(pickFor.owner,pickFor.face,f);picker.value='';};
 const choose=(owner,face)=>{pickFor={owner,face};picker.click();};
 function close(){Object.assign(S,{owner:null,face:null,error:'',relink:false,needToken:false});renderPanel();}
 function open(owner,face){Object.assign(S,{owner,face,error:'',relink:false,needToken:false});renderPanel();}
 const filesIn=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
 function dropTarget(node,owner,face){node.ondragover=e=>{if(filesIn(e)){e.preventDefault();e.stopPropagation();node.classList.add('over');}};node.ondragleave=()=>node.classList.remove('over');node.ondrop=e=>{if(!filesIn(e))return;e.preventDefault();e.stopPropagation();node.classList.remove('over');applyFile(owner,face,e.dataTransfer.files[0]);};}
 const seg=(opts,val,on)=>el('div',{class:'dk-seg'},...opts.map(([v,t])=>el('button',{class:v===val?'on':'',onclick:()=>on(v)},t)));
 const sliding=new WeakSet();
 function slider(label,min,max,val,on,show){const out=el('output',{},show(val));const r=el('input',{type:'range',min,max,step:1,value:val,'aria-label':label});
  r.oninput=()=>{out.textContent=show(+r.value);const first=!sliding.has(r);sliding.add(r);on(+r.value,first);};r.onchange=()=>{sliding.delete(r);persist();};
  return el('div',{class:'dk-row'},el('label',{},label),r,out);}
 const iconBtn=(name,title,fn,cls='')=>{const b=el('button',{class:'dk-btn dk-icon '+cls,title,'aria-label':title,onclick:fn});b.append(icon(name));return b;};
 const btn=(text,fn,attrs={})=>el('button',{class:'dk-btn',onclick:fn,...attrs},text);
 function renderPanel(){
  const t=S.owner&&target(S.owner);
  if(S.owner&&(!t||!facesOn(t).includes(S.face)))Object.assign(S,{owner:null,face:null,error:''});
  if(current?.userData.key!==(S.owner?key(S.owner,S.face):undefined)||(current&&!current.parent))markCurrent();
  document.body.classList.toggle('decaling',S.mode);side.hidden=!S.mode;side.replaceChildren();if(!S.mode)return;
  if(!S.owner){renderList();return;}
  const panel=side,{owner,face}=S,faces=panelFaces(t,face),d=decalOf(t,face);
  panel.append(el('div',{class:'dk-head'},el('strong',{},t.name(face)),el('small',{},M.sizeText(t.spec(face).size)),iconBtn('x','返回贴面列表（Esc）',close,'dk-x')));
  if(faces.length>1)panel.append(el('div',{class:'dk-faces'},...faces.map(f=>el('button',{class:'dk-face'+(f===face?' on':''),onclick:()=>open(owner,f)},...(decalOf(t,f)?[el('i')]:[]),NAMES[f]))));
  if(S.error)panel.append(el('div',{class:'dk-note err',role:'alert'},S.error));
  if(!d||S.relink||S.needToken){emptyState(t,face,d);return;}
  const [fw,fh]=t.spec(face).size,img=el('img',{alt:''});
  const thumb=el('div',{class:'dk-thumb',style:`height:${Math.round(Math.max(48,Math.min(150,216*fh/fw)))}px`},img);
  if(d.source.kind==='file'){thumb.title='拖新图片到这里替换';dropTarget(thumb,owner,face);}
  imageOf(d.assetId).then(p=>{img.src=p.img.src;}).catch(()=>{thumb.replaceWith(el('div',{class:'dk-note err'},'这张图在本机找不到了（可能换了浏览器）：请换图，或重新导入带图片的方案文件。'));});
  panel.append(thumb);
  panel.append(el('div',{class:'dk-row'},el('label',{},'摆法'),seg([['contain','完整显示'],['cover','铺满']],d.fit,v=>change(t,face,x=>{x.fit=v;x.scale=1;x.ox=x.oy=0;}))));
  const live=k=>(v,first)=>{if(first)checkpoint();change(t,face,x=>{x[k]=v/100;},{record:false,repaint:false});};
  panel.append(slider('大小',30,200,Math.round(d.scale*100),live('scale'),v=>v+'%'));
  panel.append(slider('左右',-50,50,Math.round(d.ox*100),live('ox'),v=>(v>0?'+':'')+v));
  panel.append(slider('上下',-50,50,Math.round(d.oy*100),live('oy'),v=>(v>0?'+':'')+v));
  const turn=(name,title,delta)=>{const b=el('button',{class:'dk-btn',title,onclick:()=>change(t,face,x=>{x.rot=(x.rot+delta)%360;})});b.append(icon(name),'90°');return b;};
  panel.append(el('div',{class:'dk-row'},el('label',{},'方向'),turn('rotate-ccw','逆时针转 90°',270),turn('rotate-cw','顺时针转 90°',90),btn('复位',()=>change(t,face,x=>Object.assign(x,{scale:1,ox:0,oy:0,rot:0})))));
  if(faces.length>1){const sel=el('select',{'aria-label':'挪到'},...faces.map(f=>{const o=el('option',{value:f},NAMES[f]+(f!==face&&decalOf(t,f)?'（会替换那面的图）':''));if(f===face)o.selected=true;return o;}));
   sel.onchange=()=>{const to=sel.value;if(to===face)return;checkpoint();t.data.decals[to]=t.data.decals[face];delete t.data.decals[face];drawTarget(t);persist();open(owner,to);};
   panel.append(el('div',{class:'dk-row'},el('label',{},'挪到'),sel));}
  const del=iconBtn('trash','删除贴图',()=>{checkpoint();delete t.data.decals[face];if(!Object.keys(t.data.decals).length)delete t.data.decals;drawTarget(t);persist();S.error='';renderPanel();},'danger');
  if(d.source.kind==='figma'){
   const latest=btn('取最新',()=>applyLink(owner,face,d.source.url,true),{title:'从 Figma 重新取这个画框'});if(S.busy){latest.disabled=true;latest.replaceChildren(el('span',{class:'dk-spin'}),'取最新…');}
   panel.append(el('div',{class:'dk-row'},el('label',{},'原稿'),latest,btn('换链接',()=>{S.relink=true;S.error='';renderPanel();}),del));
  }else panel.append(el('div',{class:'dk-row'},el('label',{},'图片'),btn('换图',()=>choose(owner,face)),del));
 }
 // 没选中面：「管理贴面」按钮 + 说明 + 已标出的可贴面清单（点一行打开这一面的编辑）
 function renderList(){
  manageBtn.textContent=S.manage?'保存并退出管理模式':'管理贴面';manageBtn.classList.toggle('primary',S.manage);manageBtn.title=S.manage?'回到贴图（Esc）':'';
  side.append(el('div',{class:'dk-top'},manageBtn,el('p',{class:'dk-explain'},'先选面，再贴图。点「管理贴面」，再点场景里物体或墙的面，选出哪些面要贴图；选完点「保存并退出管理模式」，再在下面选一个面放设计图。')));
  const rows=[];for(const t of [...objects.map(objTarget),roomTarget()])for(const f of facesOn(t))rows.push([t,f]);
  side.append(el('h2',{style:'margin-top:16px'},'可贴图的面'));
  if(!rows.length){side.append(el('p',{class:'dk-explain'},'还没有。点「管理贴面」添加。'));return;}
  side.append(el('div',{class:'dk-list'},...rows.map(([t,f])=>{
   const b=el('button',{class:'dk-item',onclick:()=>{if(S.manage)setManage(false);highlight(null);open(t.owner,f);}},el('span',{class:'dk-iname'},t.name(f)),el('small',{},t.owner==='room'?'内侧':NAMES[f]),...(decalOf(t,f)?[el('i',{title:'已贴图'})]:[]));
   b.onmouseenter=()=>highlight({owner:t.owner,face:f});b.onmouseleave=()=>highlight(null);return b;})));
 }
 function emptyState(t,face,d){
  const {owner}=t,panel=side;
  if(S.needToken){
   const inp=el('input',{type:'password',placeholder:'figd_…','aria-label':'Figma 个人令牌',autocomplete:'off'}),go=el('button',{class:'dk-btn primary'},'连接');
   go.onclick=()=>{const v=inp.value.trim();if(!v)return;localStorage.setItem(TOKEN_KEY,v);S.needToken=false;applyLink(owner,face,S.pendingLink,S.pendingKeep);};inp.onkeydown=e=>{if(e.key==='Enter')go.click();};
   panel.append(el('div',{class:'dk-note warn'},'第一次用要先连上 Figma：在 Figma「设置 → 安全 → 个人令牌」生成一串字，贴到下面。只存在这台电脑。'),el('div',{class:'dk-link',style:'margin-top:8px'},inp,go));
   setTimeout(()=>inp.focus(),0);return;
  }
  const inp=el('input',{placeholder:'粘贴 Figma 画框链接','aria-label':'Figma 画框链接'}),go=el('button',{class:'dk-btn primary'},'贴上');
  if(S.busy){go.disabled=true;go.replaceChildren(el('span',{class:'dk-spin'}),'取图中');}
  go.onclick=()=>{if(!S.busy&&inp.value.trim())applyLink(owner,face,inp.value);};inp.onkeydown=e=>{if(e.key==='Enter')go.click();};
  panel.append(el('div',{class:'dk-link'},inp,go));
  if(S.relink&&d)panel.append(el('div',{class:'dk-row'},btn('取消',()=>{S.relink=false;S.error='';renderPanel();})));
  else{const drop=el('div',{class:'dk-drop small',tabindex:'0',role:'button',onclick:()=>choose(owner,face),onkeydown:e=>{if(e.key==='Enter')choose(owner,face);}},'或拖图片到这里 · ⌘V · 选文件');dropTarget(drop,owner,face);panel.append(drop);}
  setTimeout(()=>{if(inp.isConnected&&!S.busy)inp.focus();},0);
 }

 // ---------- 画布事件 ----------
 const canvas=renderer.domElement;let lastPointer=null;
 window.addEventListener('dragover',e=>{if(filesIn(e))e.preventDefault();}); // 拖到别处不让浏览器打开图片
 window.addEventListener('drop',e=>{if(filesIn(e))e.preventDefault();});
 canvas.addEventListener('dragover',e=>{if(!filesIn(e))return;e.preventDefault();const f=litAt(e.clientX,e.clientY);e.dataTransfer.dropEffect=f?'copy':'none';if(S.mode)highlight(f||null);});
 canvas.addEventListener('dragleave',()=>{if(S.mode)highlight(null);});
 canvas.addEventListener('drop',e=>{if(!filesIn(e))return;e.preventDefault();const f=litAt(e.clientX,e.clientY);if(S.mode)highlight(null);if(f)applyFile(f.owner,f.face,e.dataTransfer.files[0]);});
 canvas.addEventListener('pointermove',e=>{lastPointer={x:e.clientX,y:e.clientY};if(e.buttons)return;
  if(S.manage){const f=faceAt(e.clientX,e.clientY),k=f&&key(f.owner,f.face);if(k!==hover){hover=k;highlight(f);}canvas.style.cursor=f?'pointer':'';}
  else if(S.mode)canvas.style.cursor=litAt(e.clientX,e.clientY)?'pointer':'';});
 canvas.addEventListener('pointerleave',()=>{if(S.manage){hover=null;highlight(null);}});
 // app.js 的 pointerup 在确认是「单击」后先问这里；返回 true 表示已处理，不再做选中
 function onCanvasClick(e){
  if(S.manage){const f=faceAt(e.clientX,e.clientY);if(f)toggleFace(f);return true;}
  if(S.mode){const f=litAt(e.clientX,e.clientY);if(f)open(f.owner,f.face);else close();return true;}
  return false;
 }
 document.addEventListener('paste',e=>{if(!S.mode||['INPUT','TEXTAREA'].includes(e.target.tagName))return;const file=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(!file)return;
  const f=(lastPointer&&litAt(lastPointer.x,lastPointer.y))||(S.owner&&{owner:S.owner,face:S.face});if(f){e.preventDefault();applyFile(f.owner,f.face,file);}});
 // 捕获阶段先于 app.js 的快捷键：Esc 分层退出；选面时不让 Delete 删掉物体
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(askBox)closeAsk();else if(S.manage)setManage(false);else if(S.mode){S.owner?close():setMode(false);}else return;e.stopImmediatePropagation();}
  else if(askBox&&!['Tab','Enter',' '].includes(e.key))e.stopImmediatePropagation(); // 确认窗开着时别的快捷键不生效
 },true);

 return {
  drawObject:o=>drawTarget(objTarget(o)),drawRoom:()=>drawTarget(roomTarget()),
  blocksSelect:()=>S.mode,onCanvasClick,
  exit(){setMode(false);},enter(){setMode(true);},isOn:()=>S.mode,
  refresh(){renderPanel();},
  exportAssets,importAssets,
  debug(){const meshes={},tints=[];for(const t of allTargets())for(const p of t.parents)for(const c of p.children){const k=key(c.userData.dk?.owner,c.userData.dk?.face);if(c.userData.decal)meshes[k]={image:!!c.material.map,canvasW:c.userData.size?.[0],canvasH:c.userData.size?.[1]};if(c.userData.tint)tints.push(k);}
   return {mode:S.mode,manage:S.manage,owner:S.owner,face:S.face,asking:!!askBox,current:current?.parent?current.userData.key:null,hover,highlight:hlKey,pending,meshes,tints};}
 };
}
return {create};
})();
