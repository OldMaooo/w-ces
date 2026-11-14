// Figma 贴图草样 v2（mock）：注入到已构建的编辑器里，只演示交互，不保存、不真连 Figma。
// 用户 2026-11-14 定：Figma 链接为主、上传图片为辅；先在左栏勾「哪些面可贴图」，进「贴图模式」才能贴。
(()=>{
'use strict';
const el=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k.startsWith('on'))e[k]=v;else e.setAttribute(k,v);}for(const k of kids)e.append(k);return e;};
const DEFAULTS=()=>({mode:false,owner:null,face:null,linkState:'ready',error:'',scenario:'start'});
let S=DEFAULTS();
const enabled=new Map(); // owner -> Set(face)：哪些面可贴图（常规模式下在左栏勾）
const decals=new Map();  // owner|face -> {img,iw,ih,fit,scale,ox,oy,rot,fromFigma}
const meshes=new Map(),tints=new Map();
const key=(o,f)=>o+'|'+f;
const isOn=(o,f)=>!!enabled.get(o)?.has(f);

// ---------- 面 ----------
const NAMES={front:'正面',back:'背面',left:'左侧',right:'右侧',top:'台面',inner:'内侧'};
function ownerObject(owner){if(!owner.startsWith('obj:'))return null;const id=+owner.slice(4);return objects.find(o=>o.userData.id===id)||null;}
function ownerName(owner){if(owner==='wall:A')return 'A 左墙';if(owner==='wall:B')return 'B 后墙';const o=ownerObject(owner);if(!o)return '';const t=o.userData.type;return (t.startsWith('acrylic')?'亚克力立牌':definitions[t].name)+' '+o.userData.id;}
function facesOf(owner){
 if(owner==='wall:A'||owner==='wall:B')return ['inner'];
 const o=ownerObject(owner);if(!o)return [];const t=o.userData.type;
 if(t==='desk')return ['front','back','left','right','top'];
 if(t==='rollup'||t.startsWith('acrylic'))return ['front'];
 return [];
}
function faceSpec(owner,face){
 if(owner==='wall:A')return {parent:roomGroup,size:[room.depth,2.8],pos:[-room.width/2+.006,1.4,0],rot:[0,Math.PI/2,0],scale:[room.depth,2.8]};
 if(owner==='wall:B')return {parent:roomGroup,size:[room.width,2.8],pos:[0,1.4,-room.depth/2+.006],rot:[0,0,0],scale:[room.width,2.8]};
 const o=ownerObject(owner),[w,h,d]=o.userData.size,t=o.userData.type,e=a=>.005/a;
 if(t==='desk')return {parent:o,scale:[1,1],...{
  front:{size:[w,h],pos:[0,.5,.5+e(d)],rot:[0,0,0]},
  back:{size:[w,h],pos:[0,.5,-.5-e(d)],rot:[0,Math.PI,0]},
  left:{size:[d,h],pos:[-.5-e(w),.5,0],rot:[0,-Math.PI/2,0]},
  right:{size:[d,h],pos:[.5+e(w),.5,0],rot:[0,Math.PI/2,0]},
  top:{size:[w,d],pos:[0,1+e(h),0],rot:[-Math.PI/2,0,0]}}[face]};
 if(t==='rollup')return {parent:o,size:[.9524*w,.9615*h],pos:[0,.51925,.016+e(d)],rot:[0,0,0],scale:[.9524,.9615]};
 if(t.startsWith('acrylic')){const ph=Math.min(.94,.86*w*Math.SQRT2/h);return {parent:o,size:[.86*w,ph*h],pos:[0,.5275,.052+e(d)],rot:[0,0,0],scale:[.86,ph]};}
}
const fmt=n=>(Math.round(n*100)/100).toString();
const sizeText=(o,f)=>{const s=faceSpec(o,f).size;return fmt(s[0])+' × '+fmt(s[1])+' 米';};

// ---------- 鼠标下的面 ----------
const caster=new THREE.Raycaster(),ndc=new THREE.Vector2();
function faceAt(x,y){
 const r=renderer.domElement.getBoundingClientRect();ndc.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);camera.updateMatrixWorld();scene.updateMatrixWorld(true);caster.setFromCamera(ndc,camera);
 const targets=[...objects.filter(o=>o.visible),...['wallA','wallB'].map(n=>roomGroup.getObjectByName(n)).filter(w=>w&&w.visible),...[...meshes.values(),...tints.values()].filter(m=>m.parent===roomGroup)];
 const hit=caster.intersectObjects(targets,true).find(h=>h.object!==hl);if(!hit)return null;
 if(hit.object.userData.dk)return {...hit.object.userData.dk};
 if(hit.object.name==='wallA')return hit.face.normal.x>.5?{owner:'wall:A',face:'inner'}:null;
 if(hit.object.name==='wallB')return hit.face.normal.z>.5?{owner:'wall:B',face:'inner'}:null;
 let o=hit.object;while(o.parent&&!objects.includes(o))o=o.parent;if(!objects.includes(o))return null;
 const owner='obj:'+o.userData.id,faces=facesOf(owner),n=hit.face.normal,ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z);
 const face=az>=ax&&az>=ay?(n.z>0?'front':'back'):ax>=ay?(n.x>0?'right':'left'):(n.y>0?'top':null);
 return faces.includes(face)?{owner,face}:null;
}
const onFaceAt=(x,y)=>{const f=faceAt(x,y);return f&&isOn(f.owner,f.face)?f:null;};

// ---------- 3D：高亮、可贴面底色、贴图 ----------
const plane=(color,opacity,offset)=>new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:offset}));
const hl=plane(0x2f7cf6,.32,-4);hl.renderOrder=6;
function place(mesh,spec){spec.parent.add(mesh);mesh.position.set(...spec.pos);mesh.rotation.set(...spec.rot);mesh.scale.set(spec.scale[0],spec.scale[1],1);}
function highlight(f){if(!f){hl.parent?.remove(hl);return;}place(hl,faceSpec(f.owner,f.face));}
function drawTints(){ // 贴图模式下，所有可贴面淡淡亮起
 for(const m of tints.values())m.parent?.remove(m);tints.clear();if(!S.mode)return;
 for(const [owner,set] of enabled)for(const face of set){if(owner.startsWith('obj:')&&!ownerObject(owner))continue;const m=plane(0x2f7cf6,.24,-3);m.renderOrder=5;m.userData.dk={owner,face};place(m,faceSpec(owner,face));tints.set(key(owner,face),m);}
}
function drawDecal(owner,face){
 const k=key(owner,face),d=decals.get(k);let m=meshes.get(k);
 if(!d){if(m){m.parent?.remove(m);m.material.map?.dispose();m.material.dispose();meshes.delete(k);}return;}
 const spec=faceSpec(owner,face),[fw,fh]=spec.size,den=2048/Math.max(fw,fh),c=document.createElement('canvas');c.width=Math.max(2,Math.round(fw*den));c.height=Math.max(2,Math.round(fh*den));
 const ctx=c.getContext('2d'),turned=d.rot%180!==0,iw=turned?d.ih:d.iw,ih=turned?d.iw:d.ih;
 const s=(d.fit==='cover'?Math.max(c.width/iw,c.height/ih):Math.min(c.width/iw,c.height/ih))*d.scale;
 ctx.translate(c.width/2+d.ox*c.width,c.height/2-d.oy*c.height);ctx.rotate(d.rot*Math.PI/180);ctx.drawImage(d.img,-d.iw*s/2,-d.ih*s/2,d.iw*s,d.ih*s);
 const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=8;
 if(!m){m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2}));m.userData.dk={owner,face};meshes.set(k,m);}
 m.material.map?.dispose();m.material.map=tex;m.material.needsUpdate=true;place(m,spec);
}

// ---------- 读图 ----------
function loadFile(file){return new Promise((ok,bad)=>{if(!file||!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)){bad(Error('这个文件不是图片。请从 Figma 导出 PNG、JPG 或 SVG。'));return;}const img=new Image();img.onload=()=>ok({img,iw:img.naturalWidth||1000,ih:img.naturalHeight||1000});img.onerror=()=>bad(Error('图片打不开，可能文件损坏了。'));img.src=URL.createObjectURL(file);});}
function loadUrl(url){return new Promise(ok=>{const img=new Image();img.onload=()=>ok({img,iw:img.naturalWidth,ih:img.naturalHeight});img.src=url;});}
function apply(owner,face,pic,extra={}){decals.set(key(owner,face),{fit:'contain',scale:1,ox:0,oy:0,rot:0,fromFigma:false,...pic,...extra});drawDecal(owner,face);S.owner=owner;S.face=face;S.error='';renderPanel();}
async function applyFile(owner,face,file){try{apply(owner,face,await loadFile(file));}catch(err){S.owner=owner;S.face=face;S.error=err.message;renderPanel();}}
const SAMPLES={desk:'sample-desk.png'};
function makeSample(name,w,h,bg,fg,title,sub){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.globalAlpha=.16;x.beginPath();x.arc(w*.82,h*.3,Math.min(w,h)*.42,0,7);x.fill();x.globalAlpha=1;x.font=`600 ${Math.round(Math.min(w,h)*.13)}px -apple-system,PingFang SC,sans-serif`;x.textBaseline='middle';x.fillText(title,w*.07,h*.42);x.font=`400 ${Math.round(Math.min(w,h)*.06)}px -apple-system,PingFang SC,sans-serif`;x.globalAlpha=.8;x.fillText(sub,w*.07,h*.62);SAMPLES[name]=c.toDataURL('image/png');}
makeSample('wall',1220,560,'#0e2a47','#ffffff','CES 2027 · 智能生活','示例背墙 · 6100 × 2800');
makeSample('poster',400,1000,'#f4efe4','#18453b','新品','易拉宝 80 × 200');

// ---------- 左栏：选中物体后勾「可贴图的面」（常规模式） ----------
const pickBox=el('div',{id:'dkFaces'});
$('inspector').querySelector('.line').before(pickBox);
function renderFacePicker(){
 const o=selected,owner=o&&'obj:'+o.userData.id,faces=owner?facesOf(owner):[];pickBox.replaceChildren();if(!faces.length)return;
 pickBox.append(el('div',{class:'sub'},'可贴图的面'),el('div',{class:'dk-pick'},...faces.map(f=>{const cb=el('input',{type:'checkbox'});cb.checked=isOn(owner,f);cb.onchange=()=>toggleFace(owner,f,cb.checked);return el('label',{class:'check'},cb,NAMES[f]);})));
}
function toggleFace(owner,face,on){if(!enabled.has(owner))enabled.set(owner,new Set());on?enabled.get(owner).add(face):enabled.get(owner).delete(face);drawTints();renderWallPicker();}
const wallBox=el('div',{id:'dkWalls'});$('wallA').closest('.line').after(wallBox);
function renderWallPicker(){wallBox.replaceChildren(el('div',{class:'sub'},'可贴图的墙面'),el('div',{class:'dk-pick'},...[['wall:A','A 墙内侧'],['wall:B','B 墙内侧']].map(([o,t])=>{const cb=el('input',{type:'checkbox'});cb.checked=isOn(o,'inner');cb.onchange=()=>toggleFace(o,'inner',cb.checked);return el('label',{class:'check'},cb,t);})));}
const appSelect=select;select=function(o){if(S.mode&&o){appSelect(null);return;}appSelect(o);renderFacePicker();};

// ---------- 贴图模式开关 ----------
const modeBtn=el('button',{id:'decalMode',title:'进入后点亮着的面添加设计图 · Esc 退出',onclick:()=>setMode(!S.mode)},'贴图');$('walk').before(modeBtn);
const view=$('view'),panel=el('div',{class:'dk-panel',hidden:''}),hint=el('div',{class:'dk-hint',hidden:''});view.append(panel,hint);
function setMode(on){S.mode=on;modeBtn.classList.toggle('active',on);if(on)appSelect(null);else{S.owner=S.face=null;S.error='';}drawTints();renderPanel();}

// ---------- 面板 ----------
const picker=el('input',{type:'file',accept:'image/png,image/jpeg,image/svg+xml,image/webp',hidden:''});document.body.append(picker);
let pickFor=null;picker.onchange=()=>{const f=picker.files[0];if(f&&pickFor)applyFile(pickFor.owner,pickFor.face,f);picker.value='';};
const choose=(owner,face)=>{pickFor={owner,face};picker.click();};
function close(){S.owner=S.face=null;S.error='';renderPanel();}
function open(owner,face){S.owner=owner;S.face=face;S.error='';renderPanel();}
function dropTarget(node,owner,face){node.ondragover=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();node.classList.add('over');}};node.ondragleave=()=>node.classList.remove('over');node.ondrop=e=>{e.preventDefault();e.stopPropagation();node.classList.remove('over');applyFile(owner,face,e.dataTransfer.files[0]);};}
const seg=(opts,val,on)=>el('div',{class:'dk-seg'},...opts.map(([v,t])=>el('button',{class:v===val?'on':'',onclick:()=>on(v)},t)));
function slider(label,min,max,val,on,show){const out=el('output',{},show(val));const r=el('input',{type:'range',min,max,step:1,value:val});r.oninput=()=>{out.textContent=show(+r.value);on(+r.value);};return el('div',{class:'dk-row'},el('label',{},label),r,out);}
const iconBtn=(name,title,fn,cls='')=>{const b=el('button',{class:'dk-btn dk-icon '+cls,title,'aria-label':title,onclick:fn});b.append(icon(name));return b;};
let flashKey='',flashTimer=0;
function flash(){const k=S.owner&&S.face?key(S.owner,S.face):'';if(k===flashKey)return;flashKey=k;clearTimeout(flashTimer);highlight(k?{owner:S.owner,face:S.face}:null);if(k)flashTimer=setTimeout(()=>highlight(null),700);}

function renderPanel(){
 flash();
 const anyOn=[...enabled.values()].some(s=>s.size);
 hint.hidden=!S.mode||!!S.owner;hint.textContent=anyOn?'贴图模式 · 点亮着的面添加设计图 · Esc 退出':'还没有可贴图的面：退出贴图模式，选中物体后在左栏勾选';
 panel.hidden=!S.mode||!S.owner;if(panel.hidden)return;
 const {owner,face}=S,faces=facesOf(owner).filter(f=>isOn(owner,f)),d=decals.get(key(owner,face));panel.replaceChildren();
 panel.append(el('div',{class:'dk-head'},el('strong',{},ownerName(owner)),el('small',{},sizeText(owner,face)),iconBtn('x','关闭（Esc）',close,'dk-x')));
 if(faces.length>1)panel.append(el('div',{class:'dk-faces'},...faces.map(f=>el('button',{class:'dk-face'+(f===face?' on':''),onclick:()=>open(owner,f)},...(decals.has(key(owner,f))?[el('i')]:[]),NAMES[f]))));
 if(S.error)panel.append(el('div',{class:'dk-note err'},S.error));
 if(!d){emptyState(owner,face);return;}
 const [fw,fh]=faceSpec(owner,face).size;
 const thumb=el('div',{class:'dk-thumb',style:`height:${Math.round(Math.min(150,276*fh/fw))}px`},el('img',{src:d.img.src}));if(!d.fromFigma)dropTarget(thumb,owner,face);panel.append(thumb);
 const set=(k,v)=>{d[k]=v;drawDecal(owner,face);};
 panel.append(el('div',{class:'dk-row'},el('label',{},'摆法'),seg([['contain','完整显示'],['cover','铺满']],d.fit,v=>{d.fit=v;d.scale=1;d.ox=d.oy=0;drawDecal(owner,face);renderPanel();})));
 panel.append(slider('大小',30,200,Math.round(d.scale*100),v=>set('scale',v/100),v=>v+'%'));
 panel.append(slider('左右',-50,50,Math.round(d.ox*100),v=>set('ox',v/100),v=>(v>0?'+':'')+v));
 panel.append(slider('上下',-50,50,Math.round(d.oy*100),v=>set('oy',v/100),v=>(v>0?'+':'')+v));
 panel.append(el('div',{class:'dk-row'},el('label',{},'方向'),el('button',{class:'dk-btn',title:'逆时针转 90°',onclick:()=>{d.rot=(d.rot+270)%360;drawDecal(owner,face);}},'⟲ 90°'),el('button',{class:'dk-btn',title:'顺时针转 90°',onclick:()=>{d.rot=(d.rot+90)%360;drawDecal(owner,face);}},'⟳ 90°'),el('button',{class:'dk-btn',onclick:()=>{Object.assign(d,{scale:1,ox:0,oy:0,rot:0});drawDecal(owner,face);renderPanel();}},'复位')));
 if(faces.length>1){const sel=el('select',{},...faces.map(f=>{const o=el('option',{value:f},NAMES[f]+(f!==face&&decals.has(key(owner,f))?'（会替换那面的图）':''));if(f===face)o.selected=true;return o;}));sel.onchange=()=>{const to=sel.value;decals.delete(key(owner,face));drawDecal(owner,face);decals.set(key(owner,to),d);drawDecal(owner,to);open(owner,to);};panel.append(el('div',{class:'dk-row'},el('label',{},'挪到'),sel));}
 const del=iconBtn('trash','删除贴图',()=>{decals.delete(key(owner,face));drawDecal(owner,face);renderPanel();},'danger');
 if(d.fromFigma)panel.append(el('div',{class:'dk-row'},el('label',{},'原稿'),el('button',{class:'dk-btn',onclick:e=>{e.currentTarget.replaceChildren(el('span',{class:'dk-spin'}),'取最新…');setTimeout(renderPanel,900);}},'取最新'),el('button',{class:'dk-btn',onclick:()=>{decals.delete(key(owner,face));drawDecal(owner,face);renderPanel();}},'换链接'),del));
 else panel.append(el('div',{class:'dk-row'},el('label',{},'图片'),el('button',{class:'dk-btn',onclick:()=>choose(owner,face)},'换图'),del));
}
function emptyState(owner,face){
 if(S.linkState==='token'){panel.append(el('div',{class:'dk-note warn'},'第一次用要先连上 Figma：在 Figma「设置 → 安全 → 个人令牌」生成一串字，贴到下面。只存在这台电脑。'),el('div',{class:'dk-link',style:'margin-top:8px'},el('input',{placeholder:'figd_…',type:'password'}),el('button',{class:'dk-btn primary',onclick:()=>{S.linkState='ready';renderPanel();}},'连接')));return;}
 const inp=el('input',{placeholder:'粘贴 Figma 画框链接'}),go=el('button',{class:'dk-btn primary'},'贴上');
 go.onclick=()=>{go.disabled=true;go.replaceChildren(el('span',{class:'dk-spin'}),'取图中');setTimeout(async()=>{if(S.linkState==='fail'){S.error='Figma 里找不到这个画框。请在 Figma 选中画框 → 右键「复制链接」再贴。';renderPanel();return;}const [fw,fh]=faceSpec(owner,face).size;const src=owner==='obj:12'&&face==='front'?SAMPLES.desk:fw>fh?SAMPLES.wall:SAMPLES.poster;apply(owner,face,await loadUrl(src),{fromFigma:true});},1100);};
 inp.onkeydown=e=>{if(e.key==='Enter')go.click();};
 panel.append(el('div',{class:'dk-link'},inp,go));
 const drop=el('div',{class:'dk-drop small',tabindex:'0',onclick:()=>choose(owner,face)},'或拖图片到这里 · ⌘V · 选文件');dropTarget(drop,owner,face);panel.append(drop);
 setTimeout(()=>inp.focus(),0);
}

// ---------- 画布事件（只在贴图模式下生效） ----------
let lastPointer=null;const canvas=renderer.domElement;
window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
window.addEventListener('drop',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
canvas.addEventListener('dragover',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();const f=S.mode&&onFaceAt(e.clientX,e.clientY);e.dataTransfer.dropEffect=f?'copy':'none';highlight(f||null);});
canvas.addEventListener('dragleave',()=>highlight(null));
canvas.addEventListener('drop',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();highlight(null);const f=S.mode&&onFaceAt(e.clientX,e.clientY);if(f)applyFile(f.owner,f.face,e.dataTransfer.files[0]);});
canvas.addEventListener('pointermove',e=>{lastPointer={x:e.clientX,y:e.clientY};if(!S.mode||e.buttons)return;const f=onFaceAt(e.clientX,e.clientY);canvas.style.cursor=f?'pointer':'';});
let downAt=null;canvas.addEventListener('pointerdown',e=>{downAt={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{if(!S.mode||!downAt||Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y)>4||e.button!==0)return;const f=onFaceAt(e.clientX,e.clientY);if(f)open(f.owner,f.face);else close();});
document.addEventListener('paste',e=>{if(!S.mode||e.target.tagName==='INPUT')return;const file=[...e.clipboardData.files].find(f=>f.type.startsWith('image/'));if(!file)return;const f=(lastPointer&&onFaceAt(lastPointer.x,lastPointer.y))||(S.owner&&{owner:S.owner,face:S.face});if(f){e.preventDefault();applyFile(f.owner,f.face,file);}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!S.mode)return;if(S.owner)close();else setMode(false);});

// ---------- 演示控制条（正式版没有） ----------
const bar=el('div',{id:'demobar'});document.body.prepend(bar);document.body.classList.add('has-demobar');
async function scenario(name){
 for(const k of [...decals.keys()]){decals.delete(k);const [o,f]=k.split('|');drawDecal(o,f);}
 enabled.clear();S=DEFAULTS();S.scenario=name;
 if(name!=='start')for(const [o,f] of [['obj:12','front'],['obj:12','back'],['wall:B','inner'],['obj:22','front'],['obj:2','front']])toggleFace(o,f,true);
 if(name==='token')S.linkState='token';
 if(name==='fail')S.linkState='fail';
 setMode(['ready','token','fail','done','bad'].includes(name));
 if(name==='done'){apply('obj:12','front',await loadUrl(SAMPLES.desk),{fromFigma:true});apply('wall:B','inner',await loadUrl(SAMPLES.wall),{fromFigma:true});apply('obj:22','front',await loadUrl(SAMPLES.poster));open('obj:12','front');}
 if(name==='bad'){open('obj:12','front');S.error='这个文件不是图片。请从 Figma 导出 PNG、JPG 或 SVG。';}
 if(name==='pick')appSelect(objects.find(o=>o.userData.id===12));
 renderFacePicker();renderWallPicker();renderBar();renderPanel();
}
function renderBar(){
 const btn=(on,t,f)=>el('button',{class:on?'on':'',onclick:f},t);
 const scen=[['start','起点：没勾可贴面'],['pick','常规模式：左栏勾面'],['ready','贴图模式：面已亮'],['done','已贴 3 张'],['token','第一次连 Figma'],['fail','链接取不到'],['bad','坏文件']];
 bar.replaceChildren(el('b',{},'🎛 演示控制条（正式版没有）'),
  el('div',{class:'g'},el('span',{},'场景'),...scen.map(([k,t])=>btn(S.scenario===k,t,()=>scenario(k)))),
  el('div',{class:'g'},el('span',{},'示例图'),...[['desk','前台正面·Figma实图'],['wall','背墙'],['poster','易拉宝']].map(([k,t])=>el('a',{href:SAMPLES[k],download:'示例-'+t+'.png'},t))),
  el('a',{href:'mock-gallery.html',target:'_blank'},'组件全景页 ↗'));
}
window.__dk={faceAt,onFaceAt,state:()=>S,scenario};
new ResizeObserver(()=>{document.body.style.paddingTop=bar.offsetHeight+'px';dispatchEvent(new Event('resize'));}).observe(bar);
renderBar();renderWallPicker();setTimeout(()=>{dispatchEvent(new Event('resize'));renderPanel();},50);
})();
