// Figma 贴图草样（mock）：注入到已构建的编辑器里，只演示交互，不保存、不接 Figma。
(()=>{
'use strict';
const q=s=>document.querySelector(s);
const el=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k.startsWith('on'))e[k]=v;else e.setAttribute(k,v);}for(const k of kids)e.append(k);return e;};
const MODES={A:'A 拖到面上',B:'B 先点面再给图',C:'C 贴 Figma 链接'};
const DEFAULTS=()=>({mode:'A',owner:null,face:null,linkState:'ready',error:'',scenario:'start'});
let S=DEFAULTS();
const decals=new Map(); // key owner|face -> {img,iw,ih,fit,scale,ox,oy,rot,fromFigma}
const meshes=new Map();
const key=(o,f)=>o+'|'+f;

// ---------- 可贴的面 ----------
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
// 面在世界里的宽高（米）+ 贴片在父级里的摆放
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
const frameText=(o,f)=>{const s=faceSpec(o,f).size;return Math.round(s[0]*1000)+' × '+Math.round(s[1]*1000);};

// ---------- 鼠标下是哪个面 ----------
const caster=new THREE.Raycaster(),ndc=new THREE.Vector2();
function faceAt(x,y){
 const r=renderer.domElement.getBoundingClientRect();ndc.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);camera.updateMatrixWorld();scene.updateMatrixWorld(true);caster.setFromCamera(ndc,camera);
 const targets=[...objects.filter(o=>o.visible),...['wallA','wallB'].map(n=>roomGroup.getObjectByName(n)).filter(w=>w&&w.visible),...[...meshes.values()].filter(m=>m.parent===roomGroup)];
 const hit=caster.intersectObjects(targets,true).find(h=>h.object!==hl);if(!hit)return null;
 if(hit.object.userData.dk)return {...hit.object.userData.dk};
 if(hit.object.name==='wallA')return hit.face.normal.x>.5?{owner:'wall:A',face:'inner'}:null;
 if(hit.object.name==='wallB')return hit.face.normal.z>.5?{owner:'wall:B',face:'inner'}:null;
 let o=hit.object;while(o.parent&&!objects.includes(o))o=o.parent;if(!objects.includes(o))return null;
 const owner='obj:'+o.userData.id,faces=facesOf(owner);if(!faces.length)return {owner,face:null};
 const n=hit.face.normal,ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z);
 let face=az>=ax&&az>=ay?(n.z>0?'front':'back'):ax>=ay?(n.x>0?'right':'left'):(n.y>0?'top':null);
 return {owner,face:faces.includes(face)?face:null};
}

// ---------- 高亮 + 贴片渲染 ----------
const hl=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:0x2f7cf6,transparent:true,opacity:.28,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-4}));hl.visible=false;hl.renderOrder=5;
function place(mesh,spec){spec.parent.add(mesh);mesh.position.set(...spec.pos);mesh.rotation.set(...spec.rot);mesh.scale.set(spec.scale[0],spec.scale[1],1);}
function highlight(f){if(!f||!f.face){hl.visible=false;hl.parent?.remove(hl);return;}place(hl,faceSpec(f.owner,f.face));hl.visible=true;}
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
let flashKey='',flashTimer=0;
function flash(){const k=S.owner&&S.face?key(S.owner,S.face):'';if(k===flashKey)return;flashKey=k;clearTimeout(flashTimer);highlight(k?{owner:S.owner,face:S.face}:null);if(k)flashTimer=setTimeout(()=>highlight(null),700);}
function ratioOf(d){const turned=d.rot%180!==0;return turned?d.ih/d.iw:d.iw/d.ih;}

// ---------- 读图 ----------
function loadFile(file){return new Promise((ok,bad)=>{if(!file||!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)){bad(Error('这个文件不是图片。请从 Figma 导出 PNG、JPG 或 SVG 再拖进来。'));return;}const url=URL.createObjectURL(file),img=new Image();img.onload=()=>ok({img,iw:img.naturalWidth||1000,ih:img.naturalHeight||1000});img.onerror=()=>bad(Error('图片打不开，可能文件损坏了。'));img.src=url;});}
function loadUrl(url){return new Promise(ok=>{const img=new Image();img.onload=()=>ok({img,iw:img.naturalWidth,ih:img.naturalHeight});img.src=url;});}
function apply(owner,face,pic,extra={}){const old=decals.get(key(owner,face));decals.set(key(owner,face),{fit:'contain',scale:1,ox:0,oy:0,rot:0,...(old?{fit:old.fit,rot:0}:{}),...pic,...extra});drawDecal(owner,face);S.owner=owner;S.face=face;S.error='';renderPanel();}
async function applyFile(owner,face,file){try{apply(owner,face,await loadFile(file));}catch(err){S.owner=owner;S.face=face;S.error=err.message;renderPanel();}}

// ---------- 示例图 ----------
const SAMPLES={};
function makeSample(name,w,h,bg,fg,title,sub){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.globalAlpha=.16;x.beginPath();x.arc(w*.82,h*.3,Math.min(w,h)*.42,0,7);x.fill();x.globalAlpha=1;x.font=`600 ${Math.round(Math.min(w,h)*.13)}px -apple-system,PingFang SC,sans-serif`;x.textBaseline='middle';x.fillText(title,w*.07,h*.42);x.font=`400 ${Math.round(Math.min(w,h)*.06)}px -apple-system,PingFang SC,sans-serif`;x.globalAlpha=.8;x.fillText(sub,w*.07,h*.62);x.globalAlpha=1;x.fillRect(w*.07,h*.78,w*.18,Math.max(3,h*.012));SAMPLES[name]=c.toDataURL('image/png');}
makeSample('wall',1220,560,'#0e2a47','#ffffff','CES 2027 · 智能生活','示例背墙 · 6100 × 2800');
makeSample('poster',400,1000,'#f4efe4','#18453b','新品','易拉宝 80 × 200');
makeSample('portrait',600,900,'#3b2f6b','#ffffff','竖图','比例和前台不一样');
SAMPLES.desk='sample-desk.png';

// ---------- 面板 ----------
const view=$('view'),panel=el('div',{class:'dk-panel',hidden:''}),tip=el('div',{class:'dk-tip',hidden:''}),hint=el('div',{class:'dk-hint',hidden:''});
view.append(panel,hint);document.body.append(tip);
const picker=el('input',{type:'file',accept:'image/png,image/jpeg,image/svg+xml,image/webp',hidden:''});document.body.append(picker);
let pickFor=null;picker.onchange=()=>{const f=picker.files[0];if(f&&pickFor)applyFile(pickFor.owner,pickFor.face,f);picker.value='';};
function choose(owner,face){pickFor={owner,face};picker.click();}
function close(){S.owner=S.face=null;S.error='';renderPanel();}
function open(owner,face){S.owner=owner;S.face=face??facesOf(owner)[0]??null;S.error='';renderPanel();}
function dropTarget(node,owner,face){node.ondragover=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();node.classList.add('over');}};node.ondragleave=()=>node.classList.remove('over');node.ondrop=e=>{e.preventDefault();e.stopPropagation();node.classList.remove('over');applyFile(owner,face,e.dataTransfer.files[0]);};}
function seg(opts,val,on){return el('div',{class:'dk-seg'},...opts.map(([v,t])=>el('button',{class:v===val?'on':'',onclick:()=>on(v)},t)));}
function slider(label,min,max,val,on,show){const out=el('output',{},show(val));const r=el('input',{type:'range',min,max,step:1,value:val});r.oninput=()=>{out.textContent=show(+r.value);on(+r.value);};return el('div',{class:'dk-row'},el('label',{},label),r,out);}
function faceCamera(owner,face){const spec=faceSpec(owner,face),m=new THREE.Object3D();place(m,spec);m.updateMatrixWorld(true);const c=new THREE.Vector3().setFromMatrixPosition(m.matrixWorld),n=new THREE.Vector3(0,0,1).transformDirection(m.matrixWorld);spec.parent.remove(m);const tv=Math.tan(camera.fov*Math.PI/360),dist=Math.max(spec.size[0]/(2*tv*camera.aspect),spec.size[1]/(2*tv))*1.7+.1;orbit.minDistance=.3;camera.position.copy(c).addScaledVector(n,dist);if(face==='top')camera.position.add(new THREE.Vector3(0,0,.01));orbit.target.copy(c);orbit.update();}

function renderPanel(){
 flash();
 panel.hidden=!S.owner;hint.hidden=true;
 if(!S.owner){if(S.mode==='A'&&!decals.size){hint.hidden=false;hint.textContent='把设计稿图片直接拖到展台的某一面上（前台、墙、易拉宝、立牌）';}else if(S.mode!=='A'&&!decals.size){hint.hidden=false;hint.textContent='点前台、墙、易拉宝或立牌，右侧出现贴图面板';}return;}
 const {owner,face}=S,faces=facesOf(owner),d=face&&decals.get(key(owner,face));panel.replaceChildren();
 panel.append(el('div',{class:'dk-head'},el('strong',{},ownerName(owner)),el('small',{},face?sizeText(owner,face):''),el('button',{class:'dk-x',title:'关闭（Esc）',onclick:close},'×')));
 if(!faces.length){panel.append(el('div',{class:'dk-note warn'},'这个物件暂时不能贴图。能贴的有：前台、A/B 墙、易拉宝、亚克力立牌。'));return;}
 if(faces.length>1)panel.append(el('div',{class:'dk-faces'},...faces.map(f=>el('button',{class:'dk-face'+(f===face?' on':''),onclick:()=>{S.face=f;S.error='';renderPanel();}},...(decals.has(key(owner,f))?[el('i')]:[]),NAMES[f]))));
 if(S.error)panel.append(el('div',{class:'dk-note err'},S.error));
 if(!d){emptyState(owner,face);return;}
 const thumb=el('div',{class:'dk-thumb',style:`height:${Math.round(Math.min(150,268/ (faceSpec(owner,face).size[0]/faceSpec(owner,face).size[1])))}px`,title:'点击换图，或把新图拖到这里',onclick:()=>choose(owner,face)},el('img',{src:d.img.src}),el('span',{},'换图'));dropTarget(thumb,owner,face);panel.append(thumb);
 const fr=faceSpec(owner,face).size,fa=fr[0]/fr[1],ia=ratioOf(d);
 if(Math.abs(ia-fa)/fa>.03&&!(d.fit==='cover'))panel.append(el('div',{class:'dk-note warn'},`图片比例 ${fmt(ia)}:1，这个面是 ${fmt(fa)}:1，两边会留空。Figma 里按 `,el('b',{},frameText(owner,face)),' 画框正好贴满（1 像素 = 1 毫米）。'));
 const set=(k,v)=>{d[k]=v;drawDecal(owner,face);};
 panel.append(el('div',{class:'dk-row'},el('label',{},'摆法'),seg([['contain','完整显示'],['cover','铺满（可能裁边）']],d.fit,v=>{d.fit=v;d.scale=1;d.ox=d.oy=0;drawDecal(owner,face);renderPanel();})));
 panel.append(slider('大小',30,200,Math.round(d.scale*100),v=>set('scale',v/100),v=>v+'%'));
 panel.append(slider('左右',-50,50,Math.round(d.ox*100),v=>set('ox',v/100),v=>(v>0?'+':'')+v));
 panel.append(slider('上下',-50,50,Math.round(d.oy*100),v=>set('oy',v/100),v=>(v>0?'+':'')+v));
 panel.append(el('div',{class:'dk-row'},el('label',{},'方向'),el('button',{class:'dk-btn',title:'逆时针转 90°',onclick:()=>{d.rot=(d.rot+270)%360;drawDecal(owner,face);renderPanel();}},'⟲ 90°'),el('button',{class:'dk-btn',title:'顺时针转 90°',onclick:()=>{d.rot=(d.rot+90)%360;drawDecal(owner,face);renderPanel();}},'⟳ 90°'),el('button',{class:'dk-btn',onclick:()=>{Object.assign(d,{scale:1,ox:0,oy:0,rot:0});drawDecal(owner,face);renderPanel();}},'复位')));
 if(faces.length>1){const sel=el('select',{},...faces.map(f=>{const o=el('option',{value:f},NAMES[f]+(f!==face&&decals.has(key(owner,f))?'（会替换那面的图）':''));if(f===face)o.selected=true;return o;}));sel.onchange=()=>{const to=sel.value;decals.delete(key(owner,face));drawDecal(owner,face);decals.set(key(owner,to),d);drawDecal(owner,to);S.face=to;renderPanel();};panel.append(el('div',{class:'dk-row'},el('label',{},'挪到'),sel));}
 if(S.mode==='C'&&d.fromFigma)panel.append(el('div',{class:'dk-row'},el('label',{},'原稿'),el('button',{class:'dk-btn',onclick:e=>{e.target.replaceChildren(el('span',{class:'dk-spin'}),'正在取最新…');setTimeout(()=>renderPanel(),900);}},'从 Figma 取最新'),el('button',{class:'dk-btn',onclick:()=>{decals.delete(key(owner,face));drawDecal(owner,face);renderPanel();}},'换链接')));
 panel.append(el('div',{class:'dk-foot'},el('button',{class:'dk-btn',onclick:()=>faceCamera(owner,face)},'正对这个面'),el('button',{class:'dk-btn danger',onclick:()=>{decals.delete(key(owner,face));drawDecal(owner,face);renderPanel();}},'删除贴图')));
}
function emptyState(owner,face){
 if(S.mode==='C'){
  if(S.linkState==='token'){panel.append(el('div',{class:'dk-note warn'},'第一次用要先连上 Figma：在 Figma「设置 → 安全 → 个人令牌」生成一串字，贴到下面。只存在这台电脑。'),el('div',{class:'dk-link',style:'margin-top:8px'},el('input',{placeholder:'figd_…',type:'password'}),el('button',{class:'dk-btn primary',onclick:()=>{S.linkState='ready';renderPanel();}},'连接')));return;}
  const inp=el('input',{placeholder:'粘贴 Figma 里某个画框的链接',value:''}),go=el('button',{class:'dk-btn primary'},'贴上');
  go.onclick=()=>{go.disabled=true;go.replaceChildren(el('span',{class:'dk-spin'}),'取图中');setTimeout(async()=>{if(S.linkState==='fail'){S.error='Figma 里找不到这个画框。请在 Figma 选中画框 → 右键「复制链接」再贴。';renderPanel();return;}const fa=faceSpec(owner,face).size;const src=owner==='obj:12'&&face==='front'?SAMPLES.desk:fa[0]>fa[1]?SAMPLES.wall:SAMPLES.poster;apply(owner,face,await loadUrl(src),{fromFigma:true});},1100);};
  panel.append(el('div',{class:'dk-link'},inp,go),el('div',{class:'dk-note ok'},'Figma 里选中画框 → 右键「复制链接」。改稿后点「从 Figma 取最新」即可同步。'));
  panel.append(el('div',{style:'margin-top:8px;color:var(--muted);font-size:12px'},'建议 Figma 画框 ',el('b',{},frameText(owner,face)),'（1 像素 = 1 毫米）'));
  return;
 }
 const drop=el('div',{class:'dk-drop',tabindex:'0',onclick:()=>choose(owner,face)},el('b',{},'拖图片到这里'),el('br'),'或 ⌘V 粘贴 · 点这里选文件');dropTarget(drop,owner,face);panel.append(drop);
 panel.append(el('div',{style:'margin-top:8px;color:var(--muted);font-size:12px;line-height:1.6'},'Figma 导出 PNG / SVG 都行。建议画框 ',el('b',{},frameText(owner,face)),'（1 像素 = 1 毫米），贴上去正好铺满。'));
}

// ---------- 画布事件 ----------
let lastPointer=null;
const canvas=renderer.domElement;
window.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
window.addEventListener('drop',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
canvas.addEventListener('dragover',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();
 if(S.mode!=='A'){e.dataTransfer.dropEffect='none';showTip(e,'请先点要贴的面，在右侧面板里放图',true);return;}
 const f=faceAt(e.clientX,e.clientY);highlight(f);
 if(f&&f.face){e.dataTransfer.dropEffect='copy';showTip(e,ownerName(f.owner)+' · '+NAMES[f.face],false,sizeText(f.owner,f.face)+(decals.has(key(f.owner,f.face))?' · 松手替换':''));}
 else{e.dataTransfer.dropEffect='none';showTip(e,f?'这个物件暂不能贴图':'移到前台、墙、易拉宝或立牌上',true);}
});
canvas.addEventListener('dragleave',()=>{tip.hidden=true;highlight(null);});
canvas.addEventListener('drop',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();tip.hidden=true;highlight(null);if(S.mode!=='A')return;const f=faceAt(e.clientX,e.clientY);if(f&&f.face)applyFile(f.owner,f.face,e.dataTransfer.files[0]);else renderPanel();});
function showTip(e,text,no,small){tip.hidden=false;tip.className='dk-tip'+(no?' no':'');tip.replaceChildren(text,...(small?[el('small',{},small)]:[]));tip.style.left=e.clientX+14+'px';tip.style.top=e.clientY+16+'px';}
canvas.addEventListener('pointermove',e=>{lastPointer={x:e.clientX,y:e.clientY};});
let downAt=null;canvas.addEventListener('pointerdown',e=>{downAt={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{if(!downAt||Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y)>4||e.button!==0)return;const f=faceAt(e.clientX,e.clientY);
 if(S.mode==='A'){if(f&&f.face&&decals.has(key(f.owner,f.face)))open(f.owner,f.face);else if(S.owner&&(!f||f.owner!==S.owner))close();return;}
 if(f)open(f.owner,f.face);else close();
});
document.addEventListener('paste',e=>{const file=[...e.clipboardData.files].find(f=>f.type.startsWith('image/'));if(!file)return;
 let target=S.owner&&S.face?{owner:S.owner,face:S.face}:null;
 if(S.mode==='A'&&lastPointer){const f=faceAt(lastPointer.x,lastPointer.y);if(f&&f.face)target=f;}
 if(S.mode==='C')return;
 if(target){e.preventDefault();applyFile(target.owner,target.face,file);}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.owner)close();});

// ---------- 演示控制条 ----------
const bar=el('div',{id:'demobar'});document.body.prepend(bar);document.body.classList.add('has-demobar');
async function scenario(name){
 for(const k of [...decals.keys()]){decals.delete(k);const [o,f]=k.split('|');drawDecal(o,f);}
 const mode=S.mode;S=DEFAULTS();S.mode=mode;S.scenario=name;orbit.minDistance=3;
 if(S.mode==='C'&&name==='token')S.linkState='token';
 if(name==='fail')S.linkState='fail';
 if(name==='done'){apply('obj:12','front',await loadUrl(SAMPLES.desk),{fromFigma:true});apply('wall:B','inner',await loadUrl(SAMPLES.wall),{fromFigma:true});apply('obj:22','front',await loadUrl(SAMPLES.poster),{fromFigma:true});open('obj:12','front');}
 if(name==='ratio'){apply('obj:12','front',await loadUrl(SAMPLES.portrait));}
 if(name==='bad'){S.owner='obj:12';S.face='front';S.error='这个文件不是图片。请从 Figma 导出 PNG、JPG 或 SVG 再拖进来。';}
 if(name==='blocked'){const robot=objects.find(o=>o.userData.type==='robot'||o.userData.type==='tv');if(robot)open('obj:'+robot.userData.id);}
 renderBar();renderPanel();
}
function renderBar(){
 const btn=(on,t,f)=>el('button',{class:on?'on':'',onclick:f},t);
 const scen=[['start','起点：还没贴'],['done','已贴 3 张'],['ratio','比例不对'],['bad','坏文件'],['blocked','不能贴的物件'],...(S.mode==='C'?[['token','第一次连 Figma'],['fail','链接取不到']]:[])];
 bar.replaceChildren(el('b',{},'🎛 演示控制条（正式版没有）'),
  el('div',{class:'g'},el('span',{},'导入方式'),...Object.entries(MODES).map(([k,t])=>btn(S.mode===k,t,()=>{S.mode=k;scenario('start');}))),
  el('div',{class:'g'},el('span',{},'场景'),...scen.map(([k,t])=>btn(S.scenario===k,t,()=>scenario(k)))),
  el('div',{class:'g'},el('span',{},'示例图（拖到桌面后再拖进来）'),...[['desk','前台正面·Figma实图'],['wall','背墙'],['poster','易拉宝'],['portrait','竖图']].map(([k,t])=>el('a',{href:SAMPLES[k],download:'示例-'+t+'.png'},t))),
  el('a',{href:'mock-gallery.html',target:'_blank'},'组件全景页 ↗'));
}
const pad=()=>{document.body.style.paddingTop=bar.offsetHeight+'px';dispatchEvent(new Event('resize'));};new ResizeObserver(pad).observe(bar);
window.__dk={faceAt,state:()=>S};
renderBar();setTimeout(()=>{dispatchEvent(new Event('resize'));renderPanel();},50);
})();
