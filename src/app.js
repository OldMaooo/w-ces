'use strict';
const $=id=>document.getElementById(id);
// Capture the editor shell before any user layout is rendered.
const editorTemplate=document.documentElement.cloneNode(true);
editorTemplate.querySelector('#seed').textContent='null';
for(const id of ['objects','tabs','saveStatus','title','status'])editorTemplate.querySelector('#'+id).replaceChildren();
editorTemplate.querySelectorAll('canvas').forEach(c=>c.remove());
editorTemplate.querySelector('aside').removeAttribute('style');
editorTemplate.querySelectorAll('input').forEach(e=>e.removeAttribute('value'));
editorTemplate.querySelector('#inspector').hidden=true;editorTemplate.querySelector('#empty').hidden=false;
const scene=new THREE.Scene();scene.background=new THREE.Color('#eef0ed');
const view=$('view');view.querySelectorAll('canvas').forEach(c=>c.remove());
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;view.prepend(renderer.domElement);
const camera=new THREE.PerspectiveCamera(40,1,.1,350);camera.position.set(7.5,9.5,9.5);
const orbit=new THREE.OrbitControls(camera,renderer.domElement);orbit.target.set(0,.8,0);orbit.maxPolarAngle=Math.PI/2-.01;orbit.minDistance=3;orbit.maxDistance=180;orbit.update();
const transform=new THREE.TransformControls(camera,renderer.domElement);transform.setSize(.85);transform.setTranslationSnap(.1);scene.add(transform);
scene.add(new THREE.HemisphereLight(0xffffff,0x99a897,1));const sun=new THREE.DirectionalLight(0xffffff,.85);sun.position.set(3,9,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7});sun.shadow.bias=-.0004;scene.add(sun);
function box(parent,w,h,d,x,y,z,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.75}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const roomDefault=()=>({width:6.1,depth:5.5,wallA:true,wallB:true});
let room=roomDefault(),roomGroup=new THREE.Group();scene.add(roomGroup);
const venueGroup=new THREE.Group();scene.add(venueGroup);let creatorFlipped=false;
function setCreatorSelected(on){$('creatorPanel').hidden=!on;if(on)$('empty').hidden=true;const floor=venueGroup.getObjectByName('creator-floor');if(floor)floor.material.color.set(on?'#c3dcd3':'#d8e3df').convertSRGBToLinear();}
function release(o){o.traverse(c=>{if(c.isSkinnedMesh)c.skeleton.dispose?.();if(c.geometry)c.geometry.dispose();if(c.material){for(const m of [].concat(c.material)){if(m.map)m.map.dispose();m.dispose();}}});}
function dimensionLabel(text,x,z){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.font='400 64px sans-serif';ctx.textAlign='center';ctx.fillStyle='#688176';ctx.fillText(text,256,86);const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.62,depthTest:false,toneMapped:false}));sprite.name='booth-dimension';sprite.position.set(x,.025,z);sprite.scale.set(1.4,.35,1);roomGroup.add(sprite);}
function buildRoom(){
 release(roomGroup);roomGroup.clear();const {width:w,depth:d}=room;
 box(roomGroup,w,.12,d,0,-.06,0,'#cdd8cb');
 const a=box(roomGroup,.12,2.8,d,-w/2-.06,1.4,0,'#e2e8e0');a.name='wallA';a.visible=room.wallA;
 const b=box(roomGroup,w+.12,2.8,.12,0,1.4,-d/2-.06,'#f9faf7');b.name='wallB';b.visible=room.wallB;
 const grid=[];for(let x=Math.ceil(-w);x<=w;x++)grid.push(x/2,.006,-d/2,x/2,.006,d/2);for(let z=Math.ceil(-d);z<=d;z++)grid.push(-w/2,.006,z/2,w/2,.006,z/2);
 roomGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(grid,3)),new THREE.LineBasicMaterial({color:0x93aa98,transparent:true,opacity:.35})));
 dimensionLabel(w.toFixed(1)+' m',0,d/2+.37);dimensionLabel(d.toFixed(1)+' m',w/2+.5,0);
 $('roomSize').textContent=w.toFixed(1)+' × '+d.toFixed(1)+' 米 / '+(w*d).toFixed(2)+' m²';$('badgeSize').textContent=w.toFixed(1)+' × '+d.toFixed(1)+' m';
 $('wallA').checked=room.wallA;$('wallB').checked=room.wallB;$('wallAText').textContent='A 左墙 '+d.toFixed(1)+'m';$('wallBText').textContent='B 后墙 '+w.toFixed(1)+'m';
 buildVenue();
}
const definitions={tv:{name:'电视',size:[1.218,.685,.09]},desk:{name:'前台',size:[1.6,1,.65]},robot:{name:'机器人',size:[.65,1.5,.5]},display:{name:'闺蜜机',size:[.6,1.5,.45]},table:{name:'小圆桌',size:[.65,.75,.65]},ldesk:{name:'L 型台',size:[2.2,1,1.6]},fascia:{name:'悬空吊楣',size:[3,.6,3]},laptop:{name:'笔记本电脑',size:[.34,.24,.25]},webcam:{name:'电脑摄像头',size:[.10,.08,.06]},acrylic:{name:'桌面亚克力牌',size:[.21,.15,.07]},acrylicA4:{name:'A4 竖版亚克力牌',size:[.21,.297,.07]},acrylicA5:{name:'A5 竖版亚克力牌',size:[.1485,.21,.07]},rollup:{name:'易拉宝',size:[.84,2.08,.35]},chair:{name:'听讲椅',size:[.46,.82,.50]},staff:{name:'工作人员',size:[.55,1.75,.35]},visitor:{name:'游客',size:[.55,1.75,.35]}};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const clone=v=>JSON.parse(JSON.stringify(v));
const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
let objects=[],selected=null,nextId=1,history=[],plans=[],activeId='',workspaceId='default',saveBlocked=false,walking=false,tour=TourModel.emptyTour(),tourNotice='',tourPlan=null,tourPlayer=null;
const histories=new Map(),redos=new Map();let redoHistory=[];
function cylinder(g,r,h,x,y,z,color,metal=false){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,40),new THREE.MeshStandardMaterial({color,metalness:metal?.75:0,roughness:metal?.28:.6}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function screenSize(inches,portrait=false){const w=inches*.0254*16/Math.sqrt(337),h=w*9/16;return portrait?[h,w]:[w,h];}
function geometry(g){
 people.dispose(g);
 for(const child of [...g.children]){release(child);g.remove(child);}g.scale.set(1,1,1);
 const p=g.userData,type=p.type;
 if(people.types.has(type)){people.build(g);
 }else if(type==='chair'){
  box(g,1,.07,.9,0,.54,0,'#eee8dd');box(g,1,.36,.07,0,.82,-.415,'#eee8dd');
  for(const x of [-.39,.39]){for(const z of [-.34,.34])box(g,.055,.505,.055,x,.2525,z,'#9ca9a9');box(g,.045,.4,.045,x,.69,-.415,'#9ca9a9');}
  g.scale.set(...p.size);
 }else if(type==='tv'){
  const [w,h,d]=p.size,border=.018;
  box(g,w,h,d,0,h/2,0,'#202e32');box(g,w-border*2,h-border*2,.004,0,h/2,d/2+.002,'#277b83');
 }else if(type==='display'){
  const [w,h]=screenSize(p.inches,p.portrait),cy=1.22,base=.46;
  cylinder(g,base/2,.055,0,.0275,0,'#eeefea');cylinder(g,.025,1.16,0,.63,-.025,'#eeefea');cylinder(g,.032,.18,0,.83,-.025,'#a6aaa4',true);
  box(g,w+.025,h+.025,.045,0,cy,0,'#f9faf4');box(g,w,h,.004,0,cy,.025,'#93aaa6');
  box(g,w*.82,h*.2,.002,0,cy-h*.18,.028,'#d7dfd5');box(g,w*.35,h*.12,.002,-w*.23,cy+h*.17,.028,'#c6b8a4');
  p.size=[Math.max(base,w+.025),cy+(h+.025)/2,base];
 }else if(type==='ldesk'){
  const {lengthA:a,widthA:wa,lengthB:b,widthB:wb}=p,high=p.size[1],thick=.06;
  const shape=new THREE.Shape();shape.moveTo(-a/2,-b/2);shape.lineTo(a/2,-b/2);shape.lineTo(a/2,-b/2+wa);shape.lineTo(-a/2+wb,-b/2+wa);shape.lineTo(-a/2+wb,b/2);shape.lineTo(-a/2,b/2);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:thick,bevelEnabled:false});geo.rotateX(Math.PI/2);const top=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#eee8d8',roughness:.7}));top.position.y=high;top.castShadow=true;top.receiveShadow=true;g.add(top);
  box(g,a,high-thick,wa,0,(high-thick)/2,-b/2+wa/2,'#eee8d8');
  box(g,wb,high-thick,b-wa,-a/2+wb/2,(high-thick)/2,wa/2,'#eee8d8');
  p.size=[a,high,b];
 }else if(type==='fascia'){
  const [w,h]=p.size,thick=.10;
  if(p.shape==='round'){
   const shape=new THREE.Shape();shape.absarc(0,0,w/2,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,Math.max(.05,w/2-thick),0,Math.PI*2,true);shape.holes.push(hole);
   const geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false});geo.rotateX(-Math.PI/2);g.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#eee8d8',side:THREE.DoubleSide})));
  }else{for(const z of [-1,1])box(g,w,h,thick,0,h/2,z*(w-thick)/2,'#eee8d8');for(const x of [-1,1])box(g,thick,h,w-thick*2,x*(w-thick)/2,h/2,0,'#eee8d8');}
  p.size[2]=w;
 }else if(type==='laptop'){
  box(g,1,.065,1,0,.0325,0,'#aab2b5');
  box(g,.88,.008,.42,0,.069,-.04,'#354349');
  for(let row=0;row<4;row++)for(let col=0;col<10;col++)box(g,.066,.008,.065,(col-4.5)*.081,.077,-.19+row*.09,'#657177');
  box(g,.30,.008,.19,0,.071,.32,'#c7ced0');
  box(g,1,.935,.045,0,.5325,-.4775,'#6f7c83');
  box(g,.91,.82,.008,0,.53,-.451,'#397887');
  box(g,.55,.035,.005,-.10,.68,-.445,'#b5dce0');
  g.scale.set(...p.size);
 }else if(type==='webcam'){
  box(g,.68,.18,.86,0,.09,-.07,'#38434a');
  box(g,.18,.30,.18,0,.32,-.15,'#657177');
  box(g,1,.52,.52,0,.74,.08,'#303c43');
  const lens=cylinder(g,.19,.04,0,.74,.36,'#102b3a');lens.rotation.x=Math.PI/2;
  const glass=cylinder(g,.105,.045,0,.74,.365,'#418b9b');glass.rotation.x=Math.PI/2;
  box(g,.05,.045,.012,.36,.74,.35,'#8dd5ab');
  g.scale.set(...p.size);
 }else if(['acrylic','acrylicA4','acrylicA5'].includes(type)){
  const base=box(g,1,.055,1,0,.0275,0,'#c8e1e4');
  const pane=box(g,.96,.945,.065,0,.5275,0,'#c7e7ec');
  for(const mesh of [base,pane]){mesh.material.transparent=true;mesh.material.opacity=.40;mesh.material.depthWrite=false;mesh.material.roughness=.15;}
  const paperW=.86,paperH=Math.min(.94,paperW*p.size[0]*Math.SQRT2/p.size[1]);box(g,paperW,paperH,.012,0,.5275,.039,'#fffdf5');
  box(g,.52,.038,.006,0,.67,.048,'#48746e');
  for(const y of [.51,.43,.35])box(g,.59,.018,.006,0,y,.048,'#a2b4ab');
  g.scale.set(...p.size);
 }else if(type==='rollup'){
  box(g,1,.0385,.40,0,.01925,0,'#a9b4b7');
  for(const x of [-.33,.33])box(g,.08,.018,1,x,.009,0,'#819196');
  box(g,.9524,.9615,.016,0,.51925,0,'#f7f5e9');
  box(g,.9524,.012,.055,0,.994,0,'#b1bcbf');
  box(g,.018,.95,.018,0,.51,-.04,'#8d9b9d');
  box(g,.9524,.23,.006,0,.80,.012,'#367c75');
  box(g,.65,.025,.005,0,.58,.012,'#65877e');
  for(const y of [.48,.43,.38])box(g,.65,.009,.005,0,y,.012,'#a4b2a6');
  g.scale.set(...p.size);
 }else if(type==='table'){
  cylinder(g,.5,.06,0,.97,0,'#eee8d8');cylinder(g,.04,.88,0,.5,0,'#8a9691',true);cylinder(g,.29,.06,0,.03,0,'#9ba49f',true);g.scale.set(...p.size);
 }else{
  if(type==='desk'){box(g,1,1,1,0,.5,0,'#eee8d8');box(g,.65,.18,.002,0,.55,.501,'#296d57');}
  else{box(g,.54,.39,.65,0,.51,0,'#e2e9e7');box(g,.63,.23,.72,0,.885,0,'#f8faf8');box(g,.5,.1,.04,0,.89,.38,'#264149');box(g,.09,.035,.02,-.13,.9,.41,'#77e9be');box(g,.09,.035,.02,.13,.9,.41,'#77e9be');for(const s of [-1,1]){box(g,.19,.3,.72,s*.19,.15,0,'#d4ddda');box(g,.25,.08,1,s*.19,.04,0,'#344b47');box(g,.16,.36,.48,s*.42,.49,0,'#c1d0c9');}box(g,.25,.1,.4,0,.735,0,'#344b47');}
  g.scale.set(...p.size);
 }
 if(['tv','display'].includes(type)&&p.purpose){
  const dims=type==='tv'?[p.size[0]-.036,p.size[1]-.036]:screenSize(p.inches,p.portrait);
  // Equal pixels per metre on both axes: never stretch a fixed-aspect texture.
  const c=document.createElement('canvas');const density=1024/Math.max(...dims);c.width=Math.round(dims[0]*density);c.height=Math.round(dims[1]*density);
  const ctx=c.getContext('2d');ctx.fillStyle='#174f57';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';
  const chars=Array.from(p.purpose),padding=Math.min(c.width,c.height)*.08;let font=Math.min(c.width,c.height)*.12,lines=[];
  for(;;){ctx.font=`500 ${font}px sans-serif`;lines=[''];for(const char of chars){const i=lines.length-1;if(ctx.measureText(lines[i]+char).width>c.width-padding*2&&lines[i])lines.push(char);else lines[i]+=char;}if(lines.length*font*1.3<=c.height-padding*2||font<=8)break;font*=.9;}
  lines.forEach((line,i)=>ctx.fillText(line,c.width/2,c.height/2+(i-(lines.length-1)/2)*font*1.3));
  const material=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.FrontSide});const face=new THREE.Mesh(new THREE.PlaneGeometry(...dims),material);face.position.set(0,type==='tv'?p.size[1]/2:1.22,type==='tv'?p.size[2]/2+.005:.03);face.name='screen-purpose';g.add(face);
 }
 if(type==='fascia')g.traverse(child=>{if(child.isMesh)child.castShadow=false;});
 g.updateMatrixWorld(true);
}
function make(type,id,extra={}){const g=new THREE.Group(),def=definitions[type];g.userData={type,id:id||nextId++,size:[...def.size],wallSnap:false,...(people.types.has(type)?{personScale:1,animation:'Idle',clothesColor:type==='staff'?'#165DFF':'#f3f3ef'}:{}),...(type==='fascia'?{shape:'square'}:{}),...(type==='tv'?{inches:55}:{}),...(type==='display'?{inches:27,portrait:false}:{}),...(type==='ldesk'?{lengthA:2.2,widthA:.6,lengthB:1.6,widthB:.55}:{}),...clone(extra)};geometry(g);g.visible=g.userData.visible!==false;scene.add(g);objects.push(g);return g;}
function snapshot(){return objects.map(o=>({...clone(o.userData),position:o.position.toArray(),rotation:o.rotation.y}));}
function layout(){return {room:clone(room),objects:snapshot(),...(tour.pois.length||tour.groups.length?{tour:TourModel.cloneTour(tour)}:{})};}
function checkpoint(){redoHistory=[];$('redo').disabled=true;history.push(layout());if(history.length>40)history.shift();$('undo').disabled=false;}
function dispose(o){people.dispose(o);release(o);scene.remove(o);}
function restore(data){select(null);objects.forEach(dispose);objects=[];room={...roomDefault(),...data.room};buildRoom();for(const r of data.objects){const o=make(r.type,r.id,r);o.position.fromArray(r.position);o.rotation.y=r.rotation;}nextId=Math.max(0,...objects.map(o=>o.userData.id))+1;tour=data.tour?TourModel.cloneTour(data.tour):TourModel.emptyTour();renderList();tourPlan?.refresh();}
function nearestWall(o){return Math.abs(o.position.x+room.width/2)<Math.abs(o.position.z+room.depth/2)?'A':'B';}
function attachWall(o,wall=o.userData.wall||nearestWall(o)){
 o.userData.wall=wall;o.rotation.y=wall==='A'?Math.PI/2:0;o.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(o),p=o.position;
 if(wall==='A'){p.x+=-room.width/2+.015-bounds.min.x;const half=(bounds.max.z-bounds.min.z)/2;p.z=clamp(p.z,-Math.max(0,room.depth/2-half),Math.max(0,room.depth/2-half));}
 else{p.z+=-room.depth/2+.015-bounds.min.z;const half=(bounds.max.x-bounds.min.x)/2;p.x=clamp(p.x,-Math.max(0,room.width/2-half),Math.max(0,room.width/2-half));}
 o.updateMatrixWorld(true);
}
function renderList(){
 $('objects').replaceChildren();for(const o of objects){
  const b=document.createElement('button'),name=definitions[o.userData.type].name+' '+o.userData.id;
  const title=document.createElement('span');title.className='layer-name';title.textContent=(['acrylicA4','acrylicA5'].includes(o.userData.type)?'亚克力立牌':definitions[o.userData.type].name)+' '+o.userData.id;b.append(title);b.title=name;b.classList.toggle('active',o===selected);
  const n=document.createElement('small');const spec=o.userData.inches?Number(o.userData.inches.toFixed(1))+' 寸':o.userData.type==='acrylicA4'?'A4':o.userData.type==='acrylicA5'?'A5':'';if(spec){n.textContent=spec;b.append(n);}b.onclick=()=>select(o);
  const row=document.createElement('div');row.style.cssText='display:flex;gap:4px';b.style.flex='1';const visibility=document.createElement('button');visibility.className='icon-button';visibility.append(icon(o.visible?'eye':'eye-off'));visibility.title=(o.visible?'隐藏':'显示')+name;visibility.setAttribute('aria-label',visibility.title);visibility.setAttribute('aria-pressed',String(o.visible));visibility.onclick=()=>{checkpoint();o.visible=!o.visible;o.userData.visible=o.visible;if(selected===o)select(o);persist();renderList();};row.append(b,visibility);$('objects').append(row);
 }
}
function sync(){if(!selected)return;$('place').disabled=!selected.visible;const p=selected.position,d=selected.userData,screen=['tv','display'].includes(d.type),isL=d.type==='ldesk',isPerson=people.types.has(d.type);
 $('personFields').hidden=!isPerson;if(isPerson){if(document.activeElement!==$('personScale'))$('personScale').value=d.personScale||1;$('clothesColor').value=d.clothesColor||'#f3f3ef';$('personAnimation').value=d.animation||'Idle';}
 if(document.activeElement!==$('purpose'))$('purpose').value=d.purpose||'';$('screenFields').hidden=!screen;$('orientationLabel').hidden=d.type!=='display';$('lFields').hidden=!isL;$('orientation').value=d.portrait?'portrait':'landscape';
 for(const [id,value] of Object.entries({x:p.x,y:p.y,z:p.z,w:d.size[0],h:d.size[1],d:d.size[2],rotation:((THREE.MathUtils.radToDeg(selected.rotation.y)%360)+360)%360,inches:d.inches||27,lengthA:d.lengthA||2.2,widthA:d.widthA||.6,lengthB:d.lengthB||1.6,widthB:d.widthB||.55}))if(document.activeElement!==$(id))$(id).value=Number(value.toFixed(['w','h','d'].includes(id)?3:2));
 for(const id of ['w','h','d'])$(id).min=['laptop','webcam','acrylic','acrylicA4','acrylicA5'].includes(d.type)?'.01':'.1';
 $('fasciaFields').hidden=d.type!=='fascia';$('fasciaShape').value=d.shape||'square';if(document.activeElement!==$('fasciaSpan'))$('fasciaSpan').value=d.type==='fascia'?(d.shape==='round'?d.size[0]/2:d.size[0]):3;$('fasciaSpanLabel').firstChild.textContent=d.shape==='round'?'半径（米）':'边长（米）';const stand=['acrylicA4','acrylicA5'].includes(d.type);$('standFields').hidden=!stand;$('paper').value=d.type==='acrylicA5'?'A5':'A4';$('w').disabled=isPerson||screen||isL||d.type==='fascia'||stand;$('h').disabled=isPerson||screen||stand;$('d').disabled=isPerson||d.type==='display'||isL||d.type==='fascia';$('wallSnap').checked=!!d.wallSnap;$('snapNote').hidden=!d.wallSnap;
 document.querySelectorAll('[data-inches]').forEach(b=>b.classList.toggle('active',Number(b.dataset.inches)===d.inches));
 selected.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(selected);$('status').textContent=b.min.x< -room.width/2-.001||b.max.x>room.width/2+.001||b.min.z< -room.depth/2-.001||b.max.z>room.depth/2+.001?'物料超出地面边界':'';
}
function select(o){setCreatorSelected(false);cancelPlacement();if(selected!==o&&document.activeElement===$('purpose'))$('purpose').blur();selected=o;if(o)$('purpose').value=o.userData.purpose||'';transform.detach();$('inspector').hidden=!o;$('empty').hidden=!!o;if(o){if(!walking&&o.visible)transform.attach(o);$('title').textContent=definitions[o.userData.type].name+' '+o.userData.id;sync();}renderList();}
function commit(){if(selected?.userData.wallSnap)attachWall(selected);sync();renderList();persist();}
function storageKey(){return 'ces-workspace-v2:'+workspaceId;}
function collect(){const p=plans.find(p=>p.id===activeId);if(p)p.layout=layout();return {version:2,workspaceId,activeId,plans:clone(plans),panelWidth:document.querySelector('aside').offsetWidth,layerHeight:$('objects').offsetHeight};}
let autosaveTimer=null;
function schedulePersist(){if(autosaveTimer===null)autosaveTimer=setTimeout(persist,120);}
function persist(){clearTimeout(autosaveTimer);autosaveTimer=null;const data=collect();if(saveBlocked){$('saveStatus').textContent='此页保留独立副本，请导出 JSON 备份';return;}try{localStorage.setItem(storageKey(),JSON.stringify(data));$('saveStatus').textContent='已实时保存到本机';}catch(e){$('saveStatus').textContent='本机保存不可用，请导出 JSON';}}
function renderTabs(){$('tabs').replaceChildren();for(const p of plans){const b=document.createElement('button');b.textContent=p.name;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(p.id===activeId));b.classList.toggle('active',p.id===activeId);b.onclick=()=>switchPlan(p.id);$('tabs').append(b);}}
function switchPlan(id){if(id===activeId)return;tourPlan?.showPlan();setWalking(false);collect();histories.set(activeId,history);redos.set(activeId,redoHistory);activeId=id;history=histories.get(id)||[];redoHistory=redos.get(id)||[];$('redo').disabled=!redoHistory.length;restore(plans.find(p=>p.id===id).layout);select(objects[0]||null);$('undo').disabled=!history.length;renderTabs();persist();tourPlan?.refresh();}
$('newPlan').onclick=()=>{collect();const p={id:uid(),name:'方案 '+(plans.length+1),layout:layout()};plans.push(p);switchPlan(p.id);};
$('rename').onclick=()=>{const p=plans.find(p=>p.id===activeId),name=prompt('方案名称',p.name);if(name?.trim()){p.name=name.trim().slice(0,40);renderTabs();persist();}};
window.addEventListener('pagehide',()=>persist());
window.addEventListener('storage',e=>{if(e.key===storageKey()){saveBlocked=true;$('saveStatus').textContent='另一窗口已改动；此页请导出 JSON 备份';}});
transform.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value&&!walking;if(e.value){checkpoint();if(transform.mode==='rotate'&&selected){selected.userData.wallSnap=false;delete selected.userData.wall;}}else commit();});
transform.addEventListener('objectChange',()=>{if(selected){if(transform.mode==='rotate'){selected.rotation.x=0;selected.rotation.z=0;selected.rotation.y=Math.round(selected.rotation.y/(Math.PI/4))*Math.PI/4;}selected.position.y=Math.max(0,selected.position.y);if(selected.userData.wallSnap)attachWall(selected);sync();schedulePersist();}});
transform.setRotationSnap(Math.PI/4);transform.setMode('translate');transform.setSpace('local');
const rotationOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');rotationOverlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4';$('view').append(rotationOverlay);
const rotateHandle=document.createElementNS(rotationOverlay.namespaceURI,'path');rotateHandle.id='sceneRotate';rotateHandle.setAttribute('fill','none');rotateHandle.setAttribute('stroke','#218e70');rotateHandle.setAttribute('stroke-width','1.5');rotateHandle.style.cssText='pointer-events:stroke;cursor:grab;touch-action:none';rotateHandle.setAttribute('aria-label','拖动底部圆环旋转');const ringTitle=document.createElementNS(rotationOverlay.namespaceURI,'title');ringTitle.textContent='水平或竖直拖动旋转 · 每档 45°';rotateHandle.append(ringTitle);rotationOverlay.append(rotateHandle);
rotateHandle.onpointerenter=()=>rotateHandle.setAttribute('stroke-width','4');
rotateHandle.onpointerleave=()=>{if(!rotationDrag)rotateHandle.setAttribute('stroke-width','1.5');};
const compass=document.createElement('button');compass.type='button';compass.setAttribute('aria-label','双击朝北');compass.id='compass';compass.title='双击朝北';compass.style.cssText='position:absolute;right:18px;bottom:62px;width:76px;height:76px;background:#ffffffdf;border:1px solid #d5dfd8;border-radius:50%;padding:0;cursor:pointer;z-index:5';
compass.innerHTML='<div id="compassDial" style="position:absolute;inset:0;pointer-events:none"><span style="position:absolute;top:3px;left:29px;width:16px;height:16px;line-height:16px;text-align:center">南</span><span style="position:absolute;bottom:3px;left:29px;width:16px;height:16px;line-height:16px;text-align:center;color:#c45143;font-weight:600">北</span><span style="position:absolute;top:28px;left:4px;width:16px;height:16px;line-height:16px;text-align:center;font-size:11px">东</span><span style="position:absolute;top:28px;right:4px;width:16px;height:16px;line-height:16px;text-align:center;font-size:11px">西</span><svg viewBox="0 0 76 76" style="position:absolute;inset:0;width:100%;height:100%"><path d="M38 22 L43 39 L38 36 L33 39Z" fill="#80968a"/><path d="M38 54 L43 39 L38 36 L33 39Z" fill="#c45143"/></svg></div>';
compass.ondblclick=()=>{setWalking(false);const radius=Math.max(.001,Math.hypot(camera.position.x-orbit.target.x,camera.position.z-orbit.target.z));camera.position.x=orbit.target.x;camera.position.z=orbit.target.z-radius;orbit.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));};
view.append(compass);const compassLetters=compass.querySelectorAll('span');const compassEuler=new THREE.Euler(0,0,0,'YXZ');
let rotationDrag=null;
rotateHandle.onpointerdown=e=>{if(!selected||e.button!==0)return;e.preventDefault();e.stopPropagation();checkpoint();rotationDrag={x:e.clientX,y:e.clientY,axis:null,angle:selected.rotation.y};selected.userData.wallSnap=false;delete selected.userData.wall;orbit.enabled=false;rotateHandle.style.cursor='grabbing';rotateHandle.setPointerCapture(e.pointerId);};
rotateHandle.onpointermove=e=>{if(!rotationDrag||!selected)return;const dx=e.clientX-rotationDrag.x,dy=e.clientY-rotationDrag.y;if(!rotationDrag.axis&&Math.max(Math.abs(dx),Math.abs(dy))>4)rotationDrag.axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';const distance=rotationDrag.axis==='y'?dy:dx;selected.rotation.y=rotationDrag.angle+(rotationDrag.axis==='y'?-1:1)*Math.round(distance/28)*Math.PI/4;sync();schedulePersist();};
function finishRotation(){if(!rotationDrag)return;rotationDrag=null;orbit.enabled=!walking;rotateHandle.style.cursor='grab';rotateHandle.setAttribute('stroke-width',rotateHandle.matches(':hover')?'4':'1.5');commit();}
rotateHandle.onpointerup=finishRotation;rotateHandle.onpointercancel=finishRotation;
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null,lookDrag=null;
let placing=false;
const placementMarker=new THREE.Mesh(new THREE.RingGeometry(.065,.09,32),new THREE.MeshBasicMaterial({color:'#176b55',side:THREE.DoubleSide,depthTest:false}));
placementMarker.rotation.x=-Math.PI/2;placementMarker.renderOrder=10;placementMarker.visible=false;scene.add(placementMarker);
function cancelPlacement(){
 if(!placing)return;placing=false;placementMarker.visible=false;transform.enabled=true;
 $('place').classList.remove('active');$('place').textContent='放置';$('placementHint').hidden=true;renderer.domElement.style.cursor='';
 if(selected?.visible&&!walking)transform.attach(selected);
}
$('place').onclick=()=>{
 if(placing){cancelPlacement();return;}if(!selected?.visible)return;
 setWalking(false);placing=true;transform.detach();transform.enabled=false;down=null;
 $('place').classList.add('active');$('place').textContent='取消';$('placementHint').hidden=false;
 $('placementHint').textContent='点击桌面或台面放置 · Esc 取消';renderer.domElement.style.cursor='crosshair';
};
function surfaceHit(e,excluded=null){
 const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);camera.updateMatrixWorld();scene.updateMatrixWorld(true);ray.setFromCamera(pointer,camera);
 // Raycast only real visible surfaces; never pass through a side to a hidden top.
 const targets=[];for(const root of [...objects.filter(o=>o!==excluded&&o.visible),roomGroup])root.traverse(o=>{if(o.isMesh&&o.visible)targets.push(o);});
 const hit=ray.intersectObjects(targets,false)[0];if(!hit)return null;
 const normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
 return normal.y>.99?hit:null;
}
function placementHit(e){return surfaceHit(e,selected);}
renderer.domElement.addEventListener('pointermove',e=>{if(!placing)return;const hit=placementHit(e);placementMarker.visible=!!hit;if(hit)placementMarker.position.copy(hit.point).add(new THREE.Vector3(0,.003,0));$('placementHint').textContent=hit?'点击此处放置 · Esc 取消':'请选择朝上的桌面、台面或地面 · Esc 取消';});
renderer.domElement.addEventListener('pointerleave',()=>{placementMarker.visible=false;});

renderer.domElement.addEventListener('pointerdown',e=>{if(walking){if(e.button===0){lookDrag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);}return;}down={x:e.clientX,y:e.clientY,axis:transform.axis};});
document.addEventListener('mousemove',e=>{if(!walking)return;if(document.pointerLockElement!==renderer.domElement&&e.target!==renderer.domElement)return;yaw-=e.movementX*.003;pitch=clamp(pitch-e.movementY*.003,-1.15,1.15);look();});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&walking)setWalking(false);});
renderer.domElement.addEventListener('click',()=>{if(walking&&!document.pointerLockElement)lockMouse();});
function lockMouse(){try{const result=renderer.domElement.requestPointerLock();if(result?.catch)result.catch(()=>{});}catch(e){/* Mouse movement still works over the canvas. */}}
renderer.domElement.addEventListener('pointerup',e=>{
 lookDrag=null;const start=down;down=null;if(e.button!==0||walking||tourPlayer?.isOpen()||!start||start.axis||transform.dragging||Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)return;
 if(placing){const hit=placementHit(e);if(!hit){$('placementHint').textContent='请选择朝上的桌面、台面或地面 · Esc 取消';return;}
  checkpoint();selected.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(selected),bottomOffset=bounds.min.y-selected.position.y;
  selected.position.set(hit.point.x,hit.point.y-bottomOffset,hit.point.z);selected.userData.wallSnap=false;delete selected.userData.wall;
  cancelPlacement();commit();return;
 }
 const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(objects.filter(o=>o.visible),true)[0];if(hit){let o=hit.object;while(o.parent&&!objects.includes(o))o=o.parent;select(o);}else{select(null);const c=ray.intersectObjects(venueGroup.children,true).find(h=>{for(let o=h.object;o;o=o.parent)if(o.name==='creator-set'||o.name==='creator-floor')return true;});if(c){$('empty').hidden=true;setCreatorSelected(true);}}
});
renderer.domElement.addEventListener('pointercancel',()=>{lookDrag=null;down=null;});
$('libraryIcon').append(icon('box'));$('libraryClose').append(icon('x'));
function showLibrary(show){$('library').hidden=!show;$('libraryToggle').setAttribute('aria-expanded',String(show));$('libraryToggle').classList.toggle('active',show);}
$('libraryToggle').onclick=()=>showLibrary($('library').hidden);$('libraryClose').onclick=()=>showLibrary(false);
const categories={tv:'设备',desk:'展台',robot:'设备',display:'设备',table:'展台',ldesk:'展台',fascia:'展台',laptop:'设备',webcam:'设备',acrylicA4:'展示',acrylicA5:'展示',rollup:'展示',chair:'展台',staff:'人物',visitor:'人物'};
const catalog=$('library').querySelector('.add'),cards=[...catalog.children];catalog.replaceChildren();
for(const group of ['展台','设备','展示','人物']){const label=document.createElement('div');label.className='catalog-group';label.textContent=group;catalog.append(label);for(const b of cards.filter(b=>categories[b.dataset.add]===group))catalog.append(b);}
function addMaterial(type,hit=null){
 if(!Object.hasOwn(definitions,type)||(people.types.has(type)&&!people.ready()))return;
 cancelPlacement();setWalking(false);checkpoint();const o=make(type);
 if(hit){o.updateMatrixWorld(true);const minY=new THREE.Box3().setFromObject(o).min.y;o.position.set(hit.point.x,hit.point.y-minY,hit.point.z);}
 else o.position.set((objects.length%4-1.5)*.55,type==='tv'?1.2:type==='fascia'?3:['laptop','webcam','acrylicA4','acrylicA5'].includes(type)?1:0,0);
 select(o);commit();
}
for(const b of document.querySelectorAll('[data-add]')){
 b.draggable=true;b.onclick=()=>addMaterial(b.dataset.add);
 b.ondragstart=e=>{if(b.disabled){e.preventDefault();return;}cancelPlacement();setWalking(false);e.dataTransfer.setData('application/x-ces-material',b.dataset.add);e.dataTransfer.effectAllowed='copy';};
}
renderer.domElement.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-ces-material')){e.preventDefault();e.dataTransfer.dropEffect=surfaceHit(e)?'copy':'none';}});
renderer.domElement.addEventListener('drop',e=>{const type=e.dataTransfer.getData('application/x-ces-material');if(!Object.hasOwn(definitions,type))return;e.preventDefault();const hit=surfaceHit(e);if(hit)addMaterial(type,hit);});
for(const name of people.animations){const option=document.createElement('option');option.value=name;option.textContent=people.labels[name]||name;$('personAnimation').append(option);}
const editedFields=new WeakMap();
function checkpointField(id){const field=$(id);if(editedFields.get(field)!==selected){checkpoint();editedFields.set(field,selected);}}
for(const id of ['personScale','personAnimation','clothesColor'])$(id).onchange=e=>{const live=e?.type==='input';if(!selected||!people.types.has(selected.userData.type))return;const d=selected.userData;if(id==='personScale'){const value=Number($(id).value);if(!Number.isFinite(value)||!$(id).value.trim()){sync();return;}checkpointField(id);d.personScale=clamp(value,.25,3);}else{checkpointField(id);if(id==='personAnimation')d.animation=$(id).value;else d.clothesColor=$(id).value;}geometry(selected);if(!live)$(id).blur();commit();};
let layerStart=null;
const layerKey='ces-layer-height';
function setLayerHeight(value){const h=clamp(value,80,Math.min(560,innerHeight*.6));document.documentElement.style.setProperty('--layer-height',h+'px');$('layerResize').setAttribute('aria-valuenow',String(Math.round(h)));}
$('layerResize').onpointerdown=e=>{layerStart={y:e.clientY,h:$('objects').offsetHeight};$('layerResize').setPointerCapture(e.pointerId);document.body.style.userSelect='none';};
$('layerResize').onpointermove=e=>{if(layerStart)setLayerHeight(layerStart.h+e.clientY-layerStart.y);};
function saveLayerHeight(){try{localStorage.setItem(layerKey,String(Math.round($('objects').offsetHeight)));}catch(e){}}
function endLayerResize(){if(!layerStart)return;layerStart=null;document.body.style.userSelect='';saveLayerHeight();persist();}
$('layerResize').onpointerup=endLayerResize;$('layerResize').onpointercancel=endLayerResize;
$('layerResize').onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setLayerHeight($('objects').offsetHeight+(e.key==='ArrowUp'?-20:20));saveLayerHeight();persist();}};
function setInches(v){const d=selected.userData;d.inches=clamp(v,10,120);if(d.type==='tv'){const [w,h]=screenSize(d.inches);d.size=[w,h,d.size[2]];}geometry(selected);}
for(const id of ['x','y','z','w','h','d','rotation','inches','lengthA','widthA','lengthB','widthB'])$(id).onchange=e=>{
 const live=e?.type==='input';
 if(!selected)return;const v=Number($(id).value);if(!Number.isFinite(v)||$(id).value.trim()===''){if(!live){$(id).blur();sync();}return;}checkpointField(id);const d=selected.userData;
 if(['x','y','z'].includes(id))selected.position[id]=clamp(v,id==='y'?0:-20,20);
 else if(id==='rotation'){d.wallSnap=false;delete d.wall;selected.rotation.y=THREE.MathUtils.degToRad(Math.round(v/45)*45%360);}
 else if(id==='inches')setInches(v);
 else if(['lengthA','widthA','lengthB','widthB'].includes(id)){d[id]=clamp(v,id.startsWith('length')?.2:.1,id.startsWith('length')?10:5);d.widthA=Math.min(d.widthA,d.lengthB-.05);d.widthB=Math.min(d.widthB,d.lengthA-.05);geometry(selected);}
 else{const i={w:0,h:1,d:2}[id];d.size[i]=clamp(v,['laptop','webcam','acrylic','acrylicA4','acrylicA5'].includes(d.type)?.01:.1,10);if(d.type==='table'&&(id==='w'||id==='d'))d.size[0]=d.size[2]=d.size[i];geometry(selected);}
 if(!live)$(id).blur();commit();
};
for(const b of document.querySelectorAll('[data-inches]'))b.onclick=()=>{if(!selected)return;checkpoint();setInches(Number(b.dataset.inches));commit();};
$('fasciaShape').onchange=()=>{if(!selected)return;checkpoint();selected.userData.shape=$('fasciaShape').value;geometry(selected);commit();};
$('fasciaSpan').onchange=()=>{if(!selected)return;const v=Number($('fasciaSpan').value);if(!Number.isFinite(v)||v<=0){sync();return;}checkpointField('fasciaSpan');selected.userData.size[0]=selected.userData.size[2]=clamp(v*(selected.userData.shape==='round'?2:1),.3,10);geometry(selected);commit();};
$('purpose').onchange=e=>{if(!selected||e?.isComposing)return;checkpointField('purpose');selected.userData.purpose=$('purpose').value.trim().slice(0,40);geometry(selected);commit();};
for(const id of ['x','y','z','w','h','d','rotation','inches','lengthA','widthA','lengthB','widthB','purpose','personScale','clothesColor','fasciaSpan']){const field=$(id);field.onfocus=()=>editedFields.delete(field);field.oninput=field.onchange;field.addEventListener('blur',()=>sync());}
$('purpose').addEventListener('compositionend',()=>$('purpose').oninput({type:'input'}));
$('paper').onchange=()=>{if(!selected)return;checkpoint();const type=$('paper').value==='A5'?'acrylicA5':'acrylicA4';selected.userData.type=type;selected.userData.size=[...definitions[type].size];geometry(selected);$('title').textContent=definitions[type].name+' '+selected.userData.id;renderList();sync();commit();};
$('orientation').onchange=()=>{if(!selected)return;checkpoint();selected.userData.portrait=$('orientation').value==='portrait';geometry(selected);commit();};
$('wallSnap').onchange=()=>{if(!selected)return;checkpoint();selected.userData.wallSnap=$('wallSnap').checked;if(selected.userData.wallSnap)attachWall(selected,nearestWall(selected));else delete selected.userData.wall;commit();};
for(const b of document.querySelectorAll('[data-axis]'))b.onclick=()=>{if(!selected)return;checkpoint();selected.position[b.dataset.axis]+=Number(b.dataset.delta);selected.position.y=Math.max(0,selected.position.y);commit();};
function rotate(delta){if(!selected)return;checkpoint();selected.userData.wallSnap=false;delete selected.userData.wall;selected.rotation.y=THREE.MathUtils.degToRad(Math.round(THREE.MathUtils.radToDeg(selected.rotation.y)/45)*45+delta);commit();}
$('rotate').onclick=()=>rotate(45);$('rotateLeft').onclick=()=>rotate(-45);$('ground').onclick=()=>{if(selected){checkpoint();selected.position.y=0;commit();}};
$('copy').onclick=()=>{if(!selected)return;checkpoint();const original=selected,data=clone(original.userData);delete data.id;const o=make(original.userData.type,null,data);o.position.copy(original.position).add(new THREE.Vector3(.3,0,.3));o.rotation.copy(original.rotation);select(o);commit();};
$('delete').onclick=()=>{if(!selected)return;checkpoint();const o=selected;select(null);objects=objects.filter(x=>x!==o);dispose(o);commit();};
function travelHistory(from,to){if(!from.length)return;to.push(layout());const id=selected?.userData.id;restore(from.pop());if(!playSaved)select(objects.find(o=>o.userData.id===id)||objects[0]||null);persist();$('undo').disabled=!history.length;$('redo').disabled=!redoHistory.length;tourPlan?.refresh();}
$('undo').onclick=()=>travelHistory(history,redoHistory);$('redo').onclick=()=>travelHistory(redoHistory,history);$('undo').disabled=true;$('redo').disabled=true;
window.addEventListener('keydown',e=>{if(typing(e)||e.isComposing||!(e.metaKey||e.ctrlKey))return;if(e.code==='KeyZ'||e.code==='KeyY'){e.preventDefault();if(e.shiftKey||e.code==='KeyY')$('redo').click();else $('undo').click();}});
for(const key of ['wallA','wallB'])$(key).onchange=()=>{checkpoint();room[key]=$(key).checked;buildRoom();commit();};
$('snap').checked=true;$('snap').onchange=()=>transform.setTranslationSnap($('snap').checked?.1:null);
$('swapWalls').onclick=()=>{
 checkpoint();const old=clone(room);room.width=old.depth;room.depth=old.width;
 for(const o of objects){
  // Preserve the wall and wall clearance for existing near-wall objects too.
  o.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(o);
  const nearA=Math.abs(b.min.x+old.width/2)<.3,nearB=Math.abs(b.min.z+old.depth/2)<.3;
  const mounted=o.userData.wallSnap||(o.userData.type==='tv'&&(nearA||nearB));
  if(!mounted){const x=o.position.x,z=o.position.z;const direction=old.width>old.depth?1:-1;o.position.x=-direction*z/old.depth*room.width;o.position.z=direction*x/old.width*room.depth;o.rotation.y-=direction*Math.PI/2;continue;}
  o.position.x*=room.width/old.width;o.position.z*=room.depth/old.depth;
  if(o.userData.wallSnap)attachWall(o);
  else{if(nearA)o.position.x+=-(room.width-old.width)/2-(o.position.x-o.position.x*old.width/room.width);if(nearB)o.position.z+=-(room.depth-old.depth)/2-(o.position.z-o.position.z*old.depth/room.depth);}
 }
 buildRoom();commit();
};
let yaw=0,pitch=0,editView=null;const keys=new Set();
function look(){camera.rotation.set(pitch,yaw,0,'YXZ');}
function setWalking(value){cancelPlacement();if(value===walking)return;walking=value;keys.clear();lookDrag=null;down=null;
 if(value){lockMouse();editView={position:camera.position.clone(),target:orbit.target.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov};const direction=new THREE.Vector3();camera.getWorldDirection(direction);yaw=Math.atan2(-direction.x,-direction.z);pitch=0;camera.position.set(clamp(camera.position.x,-room.width/2+.35,room.width/2-.35),1.75,clamp(camera.position.z,-room.depth/2+.35,room.depth/2-.35));camera.fov=65;camera.updateProjectionMatrix();look();orbit.enabled=false;transform.detach();transform.enabled=false;}
 else{if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();camera.position.copy(editView.position);camera.quaternion.copy(editView.quaternion);camera.fov=editView.fov;camera.updateProjectionMatrix();orbit.target.copy(editView.target);orbit.enabled=true;orbit.update();transform.enabled=true;if(selected?.visible)transform.attach(selected);}
 $('walk').classList.toggle('active',value);$('walk').textContent=value?'退出浏览':'步行浏览';$('helpText').textContent=value?'人眼高度 1.75 米 · WASD 行走 · 移动鼠标看方向 · 空格 / Esc 退出':'拖空白转视角 · 滚轮缩放 · WASD 行走 · 空格切换浏览';
}
$('walk').onclick=()=>setWalking(!walking);
const typing=e=>e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
window.addEventListener('keydown',e=>{if(typing(e)||e.isComposing||e.metaKey||e.ctrlKey||e.altKey||tourPlan?.isOpen()||tourPlayer?.isOpen())return;if(e.key==='Delete'||e.key==='Backspace'){if(selected&&!walking&&!e.repeat){e.preventDefault();$('delete').click();}}else if(e.code==='Space'){e.preventDefault();if(!e.repeat)setWalking(!walking);}else if(e.code==='Escape'){showLibrary(false);cancelPlacement();setWalking(false);}else if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();if(!walking)setWalking(true);keys.add(e.code);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();lookDrag=null;});document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});document.addEventListener('focusin',e=>{if(typing(e))keys.clear();});
document.getElementById('flipCreator').onclick=()=>{creatorFlipped=!creatorFlipped;venueGroup.getObjectByName('creator-set').rotation.y=creatorFlipped?Math.PI:0;};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{setWalking(false);const mode=b.dataset.view;if(mode==='venue'){select(null);venueView();}else{camera.position.set(...({perspective:[7.5,9.5,9.5],top:[0,15,.001],front:[0,3,15]}[mode]));orbit.target.set(0,mode==='top'?0:.8,0);orbit.update();}document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));};
function exportData(scope='current'){collect();return {format:'ces-booth-plans',version:2,activeId,plans:clone(scope==='all'?plans:plans.filter(p=>p.id===activeId))};}
function editorHTML(){return '<!doctype html>\n'+editorTemplate.outerHTML;}
function downloadFile(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('save').onclick=()=>{const scope=$('exportScope').value,p=plans.find(p=>p.id===activeId),name=scope==='all'?'全部方案':p.name;downloadFile(JSON.stringify(exportData(scope),null,2),'application/json;charset=utf-8','CES-'+name.replace(/[\\/:*?"<>|]/g,'-')+'.json');};
$('saveEditor').onclick=()=>downloadFile(editorHTML(),'text/html;charset=utf-8','CES-3D编辑器.html');
// Treat imported HTML strictly as data; never execute its scripts.
function readTour(raw){if(raw===undefined)return {};const v=TourModel.validateTour(raw);if(!v.ok){tourNotice='路线数据无效，已忽略（物料不受影响）';return {};}return v.tour.pois.length||v.tour.groups.length?{tour:v.tour}:{};}
function validateLayout(raw){const data=Array.isArray(raw)?{room:roomDefault(),objects:raw}:raw;if(!data||!Array.isArray(data.objects)||data.objects.length>500)throw Error('方案物料数据无效');const r={...roomDefault(),...data.room};if(![r.width,r.depth].every(n=>Number.isFinite(n)&&n>=1&&n<=30))throw Error('场地尺寸无效');const ids=new Set(),tr=readTour(data.tour);return {room:{width:r.width,depth:r.depth,wallA:r.wallA!==false,wallB:r.wallB!==false},...tr,objects:data.objects.map(o=>{if(!o||!Object.hasOwn(definitions,o.type)||!Number.isInteger(o.id)||o.id<1||ids.has(o.id)||!Array.isArray(o.size)||o.size.length!==3||!o.size.every(n=>Number.isFinite(n)&&n>=.01&&n<=10)||!Array.isArray(o.position)||o.position.length!==3||!o.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=100)||!Number.isFinite(o.rotation))throw Error('物料尺寸或位置无效');ids.add(o.id);const p={type:o.type,id:o.id,size:[...o.size],position:[...o.position],rotation:o.rotation,visible:o.visible!==false,wallSnap:!!o.wallSnap};if(p.wallSnap)p.wall=o.wall==='A'?'A':'B';if(o.type==='tv'||o.type==='display'){p.inches=clamp(Number.isFinite(o.inches)?o.inches:o.type==='display'?27:Math.hypot(o.size[0],o.size[1])/.0254,10,120);p.portrait=!!o.portrait;p.purpose=typeof o.purpose==='string'?o.purpose.slice(0,40):'';}if(people.types.has(o.type)){p.personScale=clamp(Number.isFinite(o.personScale)?o.personScale:1,.25,3);p.animation=people.animations.includes(o.animation)?o.animation:'Idle';p.clothesColor=typeof o.clothesColor==='string'&&/^#[0-9a-f]{6}$/i.test(o.clothesColor)?o.clothesColor:o.type==='staff'?'#165DFF':'#f3f3ef';}if(o.type==='fascia')p.shape=o.shape==='round'?'round':'square';if(o.type==='ldesk'){for(const [k,v] of Object.entries({lengthA:2.2,widthA:.6,lengthB:1.6,widthB:.55}))p[k]=clamp(Number.isFinite(o[k])?o[k]:v,k.startsWith('length')?.2:.1,10);p.widthA=Math.min(p.widthA,p.lengthB-.05);p.widthB=Math.min(p.widthB,p.lengthA-.05);}return p;})};}
function parseWorkspace(data){if(Array.isArray(data))return {version:2,workspaceId:uid(),activeId:'legacy',plans:[{id:'legacy',name:'导入方案',layout:validateLayout(data)}]};if(!data||data.version!==2||!Array.isArray(data.plans)||!data.plans.length||data.plans.length>100)throw Error('不是有效的展台方案');const ids=new Set();const list=data.plans.map(p=>{if(!p||typeof p.id!=='string'||ids.has(p.id))throw Error('方案编号无效');ids.add(p.id);return {id:p.id,name:String(p.name||'方案').slice(0,40),layout:validateLayout(p.layout)};});return {version:2,workspaceId:typeof data.workspaceId==='string'?data.workspaceId:uid(),activeId:list.some(p=>p.id===data.activeId)?data.activeId:list[0].id,plans:list,panelWidth:clamp(Number(data.panelWidth)||264,238,600),layerHeight:clamp(Number(data.layerHeight)||180,80,560)};}
$('import').onclick=()=>$('importFile').click();
$('importFile').onchange=async()=>{const file=$('importFile').files[0];if(!file)return;try{if(file.size>12e6)throw Error('文件太大，请选择下载的展台方案');const text=await file.text();const raw=text.trim().startsWith('<')?new DOMParser().parseFromString(text,'text/html').querySelector('#seed')?.textContent:text;tourNotice='';const data=parseWorkspace(JSON.parse(raw));if(tourNotice)alert('已导入方案；'+tourNotice);collect();const incoming=data.plans.map(p=>({...p,id:uid()}));plans.push(...incoming);switchPlan(incoming[Math.max(0,data.plans.findIndex(p=>p.id===data.activeId))].id);}catch(e){alert('导入失败：'+e.message);}finally{$('importFile').value='';}};
let resizeStart=null;$('resize').onpointerdown=e=>{resizeStart={x:e.clientX,w:document.querySelector('aside').offsetWidth};$('resize').setPointerCapture(e.pointerId);document.body.style.userSelect='none';};$('resize').onpointermove=e=>{if(resizeStart)document.querySelector('aside').style.width=Math.max(238,Math.min(innerWidth*.55,resizeStart.w+e.clientX-resizeStart.x))+'px';};function endResize(){if(resizeStart){resizeStart=null;document.body.style.userSelect='';persist();}}$('resize').onpointerup=endResize;$('resize').onpointercancel=endResize;
const routeBtn=$('routeBtn');routeBtn.append(icon('route'),document.createTextNode('路线'));
tourPlan=TourPlan.create({root:$('routeEdit'),icon,
 getObjects:()=>snapshot().map(o=>({...o,name:o.type==='acrylicA4'||o.type==='acrylicA5'?'亚克力立牌':definitions[o.type].name})),
 getRoom:()=>room,getVenue:()=>venueGroup.userData,getTour:()=>tour,checkpoint,persist,
 undo:()=>$('undo').click(),redo:()=>$('redo').click(),undoState:()=>({undo:!$('undo').disabled,redo:!$('redo').disabled}),
 view3d:{show:(m,el)=>tourPlayer.show(m,el),hide:()=>tourPlayer.hide(),load:d=>tourPlayer.load(d),setTime:t=>tourPlayer.setTime(t),recenter:()=>tourPlayer.recenter(),isOpen:()=>tourPlayer.isOpen()}});
function setRouteMode(on,routeId){if(on===tourPlan.isOpen())return;if(on){cancelPlacement();setWalking(false);showLibrary(false);tourPlan.open(routeId);}else tourPlan.close();document.body.classList.toggle('routing',on);routeBtn.classList.toggle('active',on);routeBtn.lastChild.textContent=on?'退出路线':'路线';}
routeBtn.onclick=()=>setRouteMode(!tourPlan.isOpen());
// Modes: editor / freeWalk / routeEdit — one at a time. Inside routeEdit the canvas shows 平面 (SVG) or 透视 / 第一人称 (3D); TourPlan decides which.
tourPlayer=TourPlayer.create({view,scene,camera,orbit,canvas:renderer.domElement,onOpen:()=>route3dOpen(),onClose:()=>route3dClose(),onPause:()=>tourPlan.pause()});
let playSaved=null;
// 路线里切到「透视 / 第一人称」时画面换成 3D：先记下编辑视角和选中物料，回到「平面」或退出路线时原样恢复。
function route3dOpen(){
 if(playSaved)return;const sel=selected?.userData.id??null;
 cancelPlacement();setWalking(false);showLibrary(false);
 playSaved={position:camera.position.clone(),target:orbit.target.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,sel};
 select(null);transform.enabled=false;document.body.classList.add('touring');
}
function route3dClose(){
 if(!playSaved)return;const saved=playSaved;playSaved=null;document.body.classList.remove('touring');
 camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.fov=saved.fov;camera.updateProjectionMatrix();orbit.target.copy(saved.target);orbit.enabled=true;orbit.update();transform.enabled=true;
 select(objects.find(o=>o.userData.id===saved.sel)||null);
}
new ResizeObserver(()=>{renderer.setSize(view.clientWidth,view.clientHeight);camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix();}).observe(view);
let initial=null,startError='';try{const seed=JSON.parse($('seed').textContent);if(seed)initial=parseWorkspace(seed);}catch(e){startError='内嵌方案无法读取，请保留文件并导入备份';saveBlocked=true;}
workspaceId=initial?.workspaceId||'default';
try{const local=localStorage.getItem(storageKey());if(local)initial=parseWorkspace(JSON.parse(local));}catch(e){startError='本机方案无法读取，请导出 JSON 备份';saveBlocked=true;}
if(initial){plans=initial.plans;activeId=initial.activeId;restore(plans.find(p=>p.id===activeId).layout);document.querySelector('aside').style.width=(initial.panelWidth||264)+'px';setLayerHeight(Number(localStorage.getItem(layerKey))||initial.layerHeight||180);}
// Nothing saved in this browser yet: start from the bundled default (doc/Files/CES-02.json). ?builtin keeps the old 3-item start (tests).
if(!initial&&!new URLSearchParams(location.search).has('builtin')){try{const d=parseWorkspace(JSON.parse($('defaultPlans')?.textContent||'null'));plans=d.plans;activeId=d.activeId;restore(plans.find(p=>p.id===activeId).layout);initial=d;}catch(e){}}
if(!initial){buildRoom();make('tv').position.set(.4,1.2,-2.61);make('desk').position.set(-.8,0,1.75);make('robot').position.set(1.4,0,.3);activeId=uid();plans=[{id:activeId,name:'方案 1',layout:layout()}];}
select(objects[1]||objects[0]||null);renderTabs();$('walk').textContent='步行浏览';$('walk').classList.remove('active');$('helpText').textContent='拖空白转视角 · 滚轮缩放 · WASD 行走 · 空格切换浏览';persist();if(!startError&&tourNotice)startError=tourNotice;if(startError)$('saveStatus').textContent=startError;
let lastTime=performance.now();function animate(now){requestAnimationFrame(animate);const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;people.update(dt);tourPlayer.update();if(walking&&keys.size){let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));const length=Math.hypot(forward,right)||1;forward=forward/length*dt*1.6;right=right/length*dt*1.6;camera.position.x+=-Math.sin(yaw)*forward+Math.cos(yaw)*right;camera.position.z+=-Math.cos(yaw)*forward-Math.sin(yaw)*right;camera.position.y=1.75;const bounds=venueGroup.userData.bounds;camera.position.x=clamp(camera.position.x,bounds.minX-1,bounds.maxX+1);camera.position.z=clamp(camera.position.z,bounds.minZ-1,bounds.maxZ+1);}rotationOverlay.style.display=!selected||!selected.visible||walking||placing?'none':'';
if(selected&&selected.visible&&!walking&&!placing){
 // Project with the same current camera matrix used by the 3D renderer.
 camera.updateMatrixWorld(true);
 const radius=Math.max(.45,Math.min(1.2,Math.max(selected.userData.size[0],selected.userData.size[2])*.65)),points=[];let inFront=true;
 for(let i=0;i<=64;i++){const angle=i/64*Math.PI*2;const point=selected.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,.025,Math.sin(angle)*radius)).project(camera);if(point.z>1)inFront=false;points.push(`${i?'L':'M'}${(point.x+1)*renderer.domElement.clientWidth/2},${(1-point.y)*renderer.domElement.clientHeight/2}`);}
 rotateHandle.setAttribute('d',points.join(' ')+' Z');rotationOverlay.style.display=inFront?'':'none';
}
compassEuler.setFromQuaternion(camera.quaternion,'YXZ');$('compassDial').style.transform=`rotate(${compassEuler.y}rad)`;for(const letter of compassLetters)letter.style.transform=`rotate(${-compassEuler.y}rad)`;
renderer.render(scene,camera);}requestAnimationFrame(animate);
window.editor={snapshot,layout,scene,objects:()=>objects,selected:()=>selected,select,camera,transform,walking:()=>walking,exportData,editorHTML,validateLayout,parseWorkspace,restore,persist,checkpoint,tour:()=>tour,setTour:t=>{tour=t;},tourNotice:()=>tourNotice,tourPlan,setRouteMode,tourPlayer,venue:()=>venueGroup.userData};

people.load();
