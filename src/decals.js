// Figma 贴图：常规模式选面、贴图模式、右侧贴图面板、3D 贴图平面、本机图片仓库（IndexedDB）、Figma 取图。
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

function create(){
 const M=DecalModel,NAMES=M.FACE_NAMES;
 const el=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k.startsWith('on'))e[k]=v;else e.setAttribute(k,v);}e.append(...kids);return e;};
 const S={mode:false,owner:null,face:null,error:'',busy:false,relink:false,needToken:false,pendingLink:''};
 let pick=null,hover=null,hlKey=null,pending=0;
 const track=p=>{pending++;return Promise.resolve(p).finally(()=>pending--);};
 const key=(owner,face)=>owner+'|'+face;

 // ---------- 贴图的主人：一个物体，或场地（A/B 墙） ----------
 function objTarget(o){const t=o.userData.type;return {owner:'obj:'+o.userData.id,data:o.userData,allowed:M.facesFor(t),parents:[o],
  name:()=>(t.startsWith('acrylic')?'亚克力立牌':definitions[t].name)+' '+o.userData.id,
  spec:f=>{const s=M.faceSpec(t,o.userData.size,f);return s&&{parent:o,...s};}};}
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
 function place(mesh,spec){spec.parent.add(mesh);mesh.position.set(...spec.pos);mesh.rotation.set(...spec.rot);mesh.scale.set(spec.scale[0],spec.scale[1],1);}
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
 const tintFaces=t=>S.mode?facesOn(t):pick?.owner===t.owner?t.allowed.filter(f=>pick.faces.has(f)):[];
 function drawTints(t){clear(t,'tint');for(const f of tintFaces(t)){const s=t.spec(f);if(!s)continue;const m=plane(0x2f7cf6,.24,-3);m.renderOrder=5;m.userData={tint:true,dk:{owner:t.owner,face:f}};place(m,s);}}
 function drawTarget(t){clear(t,'decal');for(const [f,d] of Object.entries(t.data.decals||{}))if(facesOn(t).includes(f))addDecal(t,f,d);drawTints(t);}
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
  const n=hit.face.normal,ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z);
  const face=az>=ax&&az>=ay?(n.z>0?'front':'back'):ax>=ay?(n.x>0?'right':'left'):(n.y>0?'top':null);
  return M.facesFor(o.userData.type).includes(face)?{owner:'obj:'+o.userData.id,face}:null;
 }
 const pickableAt=(x,y)=>{const f=pick&&faceAt(x,y);return f&&f.owner===pick.owner?f:null;};
 const litAt=(x,y)=>{const f=S.mode&&faceAt(x,y);return f&&facesOn(target(f.owner)).includes(f.face)?f:null;};

 // ---------- 常规模式：左栏「可贴图的面」+ 选面 ----------
 const faceBox=$('dkFaces'),wallBox=$('dkWalls');
 function renderBox(box,t,title){
  box.hidden=!t||!t.allowed.length;if(box.hidden){box.replaceChildren();return;}
  const picking=pick?.owner===t.owner,faces=picking?t.allowed.filter(f=>pick.faces.has(f)):facesOn(t);
  const chips=faces.map(f=>{const c=el('span',{class:'dk-chip'+(picking?' picking':'')},NAMES[f]);if(!picking){const x=el('button',{class:'icon-button',title:'删除「'+NAMES[f]+'」'+(decalOf(t,f)?'（连同贴图）':''),'aria-label':'删除'+NAMES[f],onclick:()=>removeFace(t.owner,f)});x.append(icon('x'));c.append(x);}return c;});
  const can=t.parents.some(p=>p.visible);
  box.replaceChildren(el('div',{class:'sub'},title),...(chips.length?[el('div',{class:'dk-chips'},...chips)]:[]),
   el('div',{class:'line'},...(picking?[el('button',{class:'primary',onclick:()=>endPick(true)},'保存'),el('button',{onclick:()=>endPick(false)},'取消')]:[Object.assign(el('button',{onclick:()=>startPick(t.owner),title:can?'在物体上点面选中或取消':'先让它显示出来'},'选面'),{disabled:!can})])));
 }
 function renderPickers(){renderBox(faceBox,selected&&objTarget(selected),'可贴图的面');renderBox(wallBox,roomTarget(),'可贴图的墙面');}
 function startPick(owner){
  if(S.mode)setMode(false);cancelPlacement();if(owner==='room')select(null);
  const t=target(owner);pick={owner,faces:new Set(facesOn(t))};hover=null;transform.detach();transform.enabled=false;drawTints(t);renderPickers();renderHint();
 }
 function endPick(save){
  if(!pick)return;const t=target(pick.owner),faces=t?t.allowed.filter(f=>pick.faces.has(f)):[];pick=null;hover=null;highlight(null);renderer.domElement.style.cursor='';
  transform.enabled=true;if(selected?.visible&&!walking)transform.attach(selected);
  if(t){if(save&&String(faces)!==String(facesOn(t))){checkpoint();setFaces(t,faces);drawTarget(t);persist();}else drawTints(t);}
  renderPickers();renderHint();
 }
 function removeFace(owner,f){const t=target(owner);if(!t)return;checkpoint();setFaces(t,facesOn(t).filter(x=>x!==f));drawTarget(t);persist();renderPickers();renderPanel();}

 // ---------- 贴图模式 ----------
 const modeBtn=$('decalMode');modeBtn.onclick=()=>setMode(!S.mode);
 const panel=el('div',{class:'dk-panel',hidden:''}),hint=el('div',{class:'dk-hint',role:'status',hidden:''});view.append(panel,hint);
 function setMode(on){
  if(on===S.mode)return;
  if(on){endPick(false);cancelPlacement();setWalking(false);showLibrary(false);}
  S.mode=on;if(on)select(null);Object.assign(S,{owner:null,face:null,error:'',relink:false,needToken:false});modeBtn.classList.toggle('active',on);
  highlight(null);renderer.domElement.style.cursor='';drawAllTints();renderPanel();
 }
 function renderHint(){
  if(pick){hint.hidden=false;hint.textContent=(pick.owner==='room'?'点 A / B 墙内侧选中或取消':'点这个物体的面选中或取消')+' · 保存生效 · Esc 取消';return;}
  hint.hidden=!S.mode||!!S.owner;if(hint.hidden)return;
  hint.textContent=allTargets().some(t=>facesOn(t).length)?'贴图模式 · 点亮着的面添加设计图 · Esc 退出':'还没有可贴图的面：退出贴图模式，选中物体后在左栏点「选面」';
 }

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
 let flashKey='',flashTimer=0;
 function flash(){const k=S.owner&&S.face?key(S.owner,S.face):'';if(k===flashKey)return;flashKey=k;clearTimeout(flashTimer);highlight(k?{owner:S.owner,face:S.face}:null);if(k)flashTimer=setTimeout(()=>{if(hlKey===k)highlight(null);},700);}
 function renderPanel(){
  const t=S.owner&&target(S.owner);
  if(S.owner&&(!t||!facesOn(t).includes(S.face)))Object.assign(S,{owner:null,face:null,error:''});
  flash();renderHint();
  panel.hidden=!S.mode||!S.owner;if(panel.hidden){panel.replaceChildren();return;}
  const {owner,face}=S,faces=panelFaces(t,face),d=decalOf(t,face);panel.replaceChildren();
  panel.append(el('div',{class:'dk-head'},el('strong',{},t.name(face)),el('small',{},M.sizeText(t.spec(face).size)),iconBtn('x','关闭（Esc）',close,'dk-x')));
  if(faces.length>1)panel.append(el('div',{class:'dk-faces'},...faces.map(f=>el('button',{class:'dk-face'+(f===face?' on':''),onclick:()=>open(owner,f)},...(decalOf(t,f)?[el('i')]:[]),NAMES[f]))));
  if(S.error)panel.append(el('div',{class:'dk-note err',role:'alert'},S.error));
  if(!d||S.relink||S.needToken){emptyState(t,face,d);return;}
  const [fw,fh]=t.spec(face).size,img=el('img',{alt:''});
  const thumb=el('div',{class:'dk-thumb',style:`height:${Math.round(Math.max(48,Math.min(150,276*fh/fw)))}px`},img);
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
 function emptyState(t,face,d){
  const {owner}=t;
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
  if(pick){const f=pickableAt(e.clientX,e.clientY),k=f&&key(f.owner,f.face);if(k!==hover){hover=k;highlight(f);}canvas.style.cursor=f?'pointer':'';}
  else if(S.mode)canvas.style.cursor=litAt(e.clientX,e.clientY)?'pointer':'';});
 canvas.addEventListener('pointerleave',()=>{if(pick){hover=null;highlight(null);}});
 // app.js 的 pointerup 在确认是「单击」后先问这里；返回 true 表示已处理，不再做选中
 function onCanvasClick(e){
  if(pick){const f=pickableAt(e.clientX,e.clientY);if(f){pick.faces.has(f.face)?pick.faces.delete(f.face):pick.faces.add(f.face);drawTints(target(pick.owner));renderPickers();}return true;}
  if(S.mode){const f=litAt(e.clientX,e.clientY);if(f)open(f.owner,f.face);else close();return true;}
  return false;
 }
 document.addEventListener('paste',e=>{if(!S.mode||['INPUT','TEXTAREA'].includes(e.target.tagName))return;const file=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(!file)return;
  const f=(lastPointer&&litAt(lastPointer.x,lastPointer.y))||(S.owner&&{owner:S.owner,face:S.face});if(f){e.preventDefault();applyFile(f.owner,f.face,file);}});
 // 捕获阶段先于 app.js 的快捷键：Esc 分层退出；选面时不让 Delete 删掉物体
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(pick){endPick(false);e.stopImmediatePropagation();}else if(S.mode){S.owner?close():setMode(false);e.stopImmediatePropagation();}}
  else if(pick&&(e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))e.stopImmediatePropagation();
 },true);

 renderPickers();
 return {
  drawObject:o=>drawTarget(objTarget(o)),drawRoom:()=>drawTarget(roomTarget()),
  afterSelect(o){if(pick&&pick.owner!=='room'&&pick.owner!=='obj:'+o?.userData.id)endPick(false);renderPickers();},
  blocksSelect:()=>S.mode,busy:()=>!!pick,onCanvasClick,
  exit(){endPick(false);setMode(false);},
  refresh(){if(pick&&!target(pick.owner))endPick(false);renderPickers();renderPanel();},
  exportAssets,importAssets,
  debug(){const meshes={},tints=[];for(const t of allTargets())for(const p of t.parents)for(const c of p.children){const k=key(c.userData.dk?.owner,c.userData.dk?.face);if(c.userData.decal)meshes[k]={image:!!c.material.map,canvasW:c.userData.size?.[0],canvasH:c.userData.size?.[1]};if(c.userData.tint)tints.push(k);}
   return {mode:S.mode,owner:S.owner,face:S.face,picking:pick&&{owner:pick.owner,faces:[...pick.faces]},hover,highlight:hlKey,pending,meshes,tints};}
 };
}
return {create};
})();
