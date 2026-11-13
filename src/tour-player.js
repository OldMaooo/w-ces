// Visitor-route 3D playback: temporary visitor, ground path, playbar, overview / first-person camera, mouse look.
// Owns no storage and no undo. app.js decides when it opens and closes (one mode at a time) and restores the editor view.
const TourPlayer=(()=>{
 const T=TourTimeline,ops=TourPlan.ops;
 const LOOK_SPEED=.003,PITCH_OFF_MAX=1.2,PITCH_MAX=1.45,FP_FOV=65;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 // Dwell ticks on the progress bar: start of each stand-still, so clicking one lands on "停留".
 const ticks=c=>c.items.filter(it=>it.type==='hold').map(it=>({t:it.t0,stopIndex:it.stopIndex}));
 function phaseText(c,s,t,live){
  if(t>=c.total-.01)return '已走完';
  if(s.phase==='hold'){const stop=c.stops.find(x=>x.index===s.stopIndex),name=live[s.stopIndex]?.name||'前方';return `第 ${s.stopIndex+1} 站 · 停留 · 看「${name}」· 还剩 ${Math.max(1,Math.ceil(stop.t1-t-1e-6))} 秒`;}
  return s.phase==='turn'?'转身':'行走中';
 }
 const isTextField=e=>e.target.isContentEditable||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT'||(e.target.tagName==='INPUT'&&!['range','checkbox','radio','button'].includes(e.target.type));

 // host: {view, actions, scene, camera, orbit, canvas, icon(name), routes() → [{group, route, analysis}], onBack(routeId), onExit(), onGone()}
 function create(host){
  const {scene,camera,orbit,canvas}=host;
  let open=false,routeId=null,compiled=null,live=[],eye=1.75,t=0,playing=false,rate=1,cam='orbit',yawOff=0,pitchOff=0,locked=false,dragLook=null,overview=null,lastAnim=null,lastBar='';
  let visitor=null,path=null;
  const h=(tag,props,...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v==null||v===false)continue;if(k==='class')e.className=v;else if(k.startsWith('on'))e[k]=v;else e.setAttribute(k,v===true?'':v);}for(const c of kids.flat())if(c!=null)e.append(c);return e;};
  const btn=(props,ic,text)=>h('button',props,ic?host.icon(ic):null,text||null);

  // ----- DOM -----
  const back=btn({id:'tourBack',class:'tour-top',onclick:()=>host.onBack(routeId)},'map','回到路线图');
  const exit=btn({id:'tourExit',class:'tour-top',onclick:()=>host.onExit()},'x','退出');
  host.actions.prepend(back,exit);
  const pick=h('select',{id:'tpPick','aria-label':'选择子方案'});
  const seek=h('input',{type:'range',id:'tpSeek',min:'0',step:'0.01','aria-label':'进度'});
  const tickBox=h('div',{class:'tp-ticks'});
  const play=btn({id:'tpPlay',class:'primary',title:'播放 / 暂停（空格）'});
  const time=h('span',{class:'tp-time',id:'tpTime'});
  const rates=h('div',{class:'tp-seg'},...[.5,1,2].map(v=>btn({'data-rate':String(v),onclick:()=>{rate=v;syncButtons();}},null,v+'×')));
  const cams=h('div',{class:'tp-seg'},btn({'data-cam':'orbit',onclick:()=>setCam('orbit')},'box','总览'),btn({'data-cam':'fp',onclick:()=>setCam('fp')},'eye','第一人称'));
  const recenter=btn({id:'tpRecenter',class:'ghost',title:'视线归位','aria-label':'视线归位',onclick:()=>{yawOff=pitchOff=0;apply();}},'rotate-ccw');
  const restart=btn({id:'tpRestart',class:'ghost',title:'从头','aria-label':'从头',onclick:()=>{t=0;yawOff=pitchOff=0;apply();}},'skip-back');
  const phase=h('div',{class:'tp-phase',id:'tpPhase'}),hint=h('div',{class:'tp-hint',id:'tpHint'}),cross=h('div',{class:'tp-cross',id:'tpCross'});
  const root=h('div',{id:'tourPlay',hidden:true},phase,hint,cross,h('div',{class:'tp-bar'},pick,restart,play,h('div',{class:'tp-track'},seek,tickBox),time,rates,cams,recenter));
  host.view.append(root);
  play.onclick=()=>toggle();
  pick.onchange=()=>load(pick.value,false);
  seek.onpointerdown=()=>{playing=false;syncButtons();};
  seek.oninput=()=>{t=Number(seek.value);yawOff=pitchOff=0;apply();};

  // ----- scene objects -----
  const mat=c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  function disc(r,c,x,z){const m=new THREE.Mesh(new THREE.CircleGeometry(r,28),mat(c));m.rotation.x=-Math.PI/2;m.position.set(x,.014,z);return m;}
  function buildPath(a){
   const g=new THREE.Group();g.name='tour-path';
   for(const leg of a.legs)for(let i=1;i<leg.length;i++){
    const [x0,z0]=leg[i-1],[x1,z1]=leg[i],len=Math.hypot(x1-x0,z1-z0);if(len<1e-6)continue;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(.08,len),mat('#176b55'));m.rotation.order='YXZ';m.rotation.set(-Math.PI/2,Math.atan2(x1-x0,z1-z0),0);m.position.set((x0+x1)/2,.012,(z0+z1)/2);g.add(m);
   }
   for(const s of a.compiled.stops)g.add(disc(.2,'#176b55',s.x,s.z));
   g.add(disc(.16,'#16a34a',...a.compiled.start),disc(.16,'#dc2626',...a.compiled.end));
   return g;
  }
  function placeholder(){
   const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:'#3b82f6',roughness:.7});
   const body=new THREE.Mesh(new THREE.CylinderGeometry(.18,.2,1.4,16),m);body.position.y=.7;const head=new THREE.Mesh(new THREE.SphereGeometry(.14,16,12),m);head.position.y=1.6;
   const nose=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.14),new THREE.MeshStandardMaterial({color:'#176b55'}));nose.position.set(0,1.6,.17);g.add(body,head,nose);g.name='tour-placeholder';return g;
  }
  function makeVisitor(){
   const g=new THREE.Group();g.name='tour-visitor';g.userData={type:'visitor',driven:true,personScale:1,animation:'Idle',clothesColor:'#3b82f6',size:[.55,1.75,.35]};
   if(people.ready())people.build(g);else g.add(placeholder());return g;
  }
  function release(o){o.traverse(c=>{c.geometry?.dispose();for(const m of [].concat(c.material||[]))m.dispose();});}
  function clearScene(){
   if(path){scene.remove(path);release(path);path=null;}
   if(visitor){people.dispose(visitor);scene.remove(visitor);release(visitor);visitor=null;}
  }

  // ----- routes -----
  function find(id){return host.routes().find(x=>x.route.id===id)||null;}
  function fillPick(list){
   pick.replaceChildren();const groups=new Map();
   for(const x of list){if(!groups.has(x.group.id))groups.set(x.group.id,h('optgroup',{label:x.group.name}));groups.get(x.group.id).append(h('option',{value:x.route.id,disabled:!x.analysis.ok},x.route.name));}
   pick.append(...groups.values());pick.value=routeId;
  }
  function load(id,keepTime){
   const list=host.routes(),x=list.find(y=>y.route.id===id);if(!x||!x.analysis.ok)return false;
   routeId=id;compiled=x.analysis.compiled;live=x.analysis.live;eye=x.route.eyeHeight;
   if(keepTime)t=clamp(t,0,compiled.total);else{t=0;playing=false;yawOff=pitchOff=0;}
   fillPick(list);
   if(path){scene.remove(path);release(path);}path=buildPath(x.analysis);scene.add(path);
   tickBox.replaceChildren(...ticks(compiled).map(k=>{const e=h('span',{class:'tp-tick',title:'第 '+(k.stopIndex+1)+' 站停留',style:`left:calc(7px + (100% - 14px) * ${compiled.total?k.t/compiled.total:0})`});e.onclick=()=>{playing=false;t=Math.min(k.t+.01,compiled.total);yawOff=pitchOff=0;apply();};return e;}));
   seek.max=String(compiled.total);lastBar='';apply();return true;
  }

  // ----- camera / pose -----
  function setCam(next){
   if(next===cam){syncButtons();return;}
   if(next==='fp'){overview={position:camera.position.clone(),target:orbit.target.clone(),fov:camera.fov};orbit.enabled=false;camera.fov=FP_FOV;camera.updateProjectionMatrix();}
   else{unlock();camera.position.copy(overview.position);orbit.target.copy(overview.target);camera.fov=overview.fov;camera.updateProjectionMatrix();orbit.enabled=true;orbit.update();}
   cam=next;dragLook=null;apply();
  }
  function apply(){
   if(!compiled)return;
   if(visitor&&people.ready()&&visitor.getObjectByName('tour-placeholder')){const ph=visitor.getObjectByName('tour-placeholder');visitor.remove(ph);release(ph);people.build(visitor);}
   const s=T.sampleRoute(compiled,t,eye);
   visitor.position.set(s.x,0,s.z);visitor.rotation.y=s.bodyYaw;visitor.visible=cam!=='fp';
   lastAnim=people.pose(visitor,s.phase==='walk'?'Walk':'Idle',t);
   if(cam==='fp'){camera.position.set(s.x,eye,s.z);camera.rotation.set(clamp(s.lookPitch+pitchOff,-PITCH_MAX,PITCH_MAX),s.lookYaw+Math.PI+yawOff,0,'YXZ');camera.updateMatrixWorld();}
   syncBar(s);
  }
  function syncBar(s){
   const total=compiled.total;seek.value=String(t);
   const text=ops.fmtDuration(t)+' / '+ops.fmtDuration(total);if(time.textContent!==text)time.textContent=text;
   const ph=phaseText(compiled,s,t,live);if(phase.textContent!==ph)phase.textContent=ph;
   const sig=[playing,t>=total-.01&&total>0,cam,locked,rate].join();if(sig!==lastBar){lastBar=sig;syncButtons();}
  }
  function syncButtons(){
   const done=compiled&&t>=compiled.total-.01&&compiled.total>0;
   play.replaceChildren(host.icon(playing?'pause':'play'),playing?'暂停':done?'重播':'播放');
   root.querySelectorAll('[data-rate]').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)===rate));
   root.querySelectorAll('[data-cam]').forEach(b=>b.classList.toggle('active',b.dataset.cam===cam));
   const fp=cam==='fp';hint.hidden=cross.hidden=recenter.hidden=!fp;
   hint.textContent=locked?'移动鼠标转头 · Esc 释放鼠标并暂停':'点画面锁定鼠标后转头（或按住拖动）';
  }
  function toggle(){if(!compiled)return;if(playing)playing=false;else{if(t>=compiled.total-.01)t=0;playing=true;}syncButtons();apply();}
  function pause(){if(playing){playing=false;syncButtons();}}

  // ----- input -----
  function unlock(){if(document.pointerLockElement===canvas)document.exitPointerLock();locked=false;}
  canvas.addEventListener('pointerdown',e=>{
   if(!open||cam!=='fp'||e.button!==0)return;dragLook={x:e.clientX,y:e.clientY};
   if(!locked){try{const r=canvas.requestPointerLock();if(r?.catch)r.catch(()=>{});}catch(_){/* drag still turns the head */}}
  });
  window.addEventListener('pointerup',()=>{dragLook=null;});
  document.addEventListener('pointermove',e=>{
   if(!open||cam!=='fp')return;let mx=0,my=0;
   if(locked){mx=e.movementX;my=e.movementY;}else if(dragLook&&e.buttons&1){mx=e.clientX-dragLook.x;my=e.clientY-dragLook.y;dragLook={x:e.clientX,y:e.clientY};}else return;
   yawOff-=mx*LOOK_SPEED;pitchOff=clamp(pitchOff-my*LOOK_SPEED,-PITCH_OFF_MAX,PITCH_OFF_MAX);apply();
  });
  document.addEventListener('pointerlockchange',()=>{const was=locked;locked=open&&document.pointerLockElement===canvas;if(was&&!locked)pause();if(open)syncButtons();});
  window.addEventListener('keydown',e=>{
   if(!open||e.code!=='Space'||isTextField(e)||e.isComposing||e.metaKey||e.ctrlKey||e.altKey)return;
   e.preventDefault();if(!e.repeat)toggle();
  });
  // A focused button would also "click" on Space keyup; the keydown above already toggled.
  window.addEventListener('keyup',e=>{if(open&&e.code==='Space'&&e.target.tagName==='BUTTON')e.preventDefault();});
  window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});

  return {
   // Show route `id` (must be playable). The caller has already put the editor into a neutral state.
   open(id){
    if(open)this.close();
    visitor=makeVisitor();scene.add(visitor);open=true;cam='orbit';rate=1;root.hidden=false;
    if(!load(id,false)){this.close();return false;}
    playing=true;syncButtons();return true;
   },
   close(){
    if(!open&&!visitor)return;
    unlock();playing=false;dragLook=null;
    if(cam==='fp'&&overview){camera.position.copy(overview.position);orbit.target.copy(overview.target);camera.fov=overview.fov;camera.updateProjectionMatrix();}
    cam='orbit';open=false;root.hidden=true;clearScene();compiled=null;routeId=null;
   },
   isOpen:()=>open,
   // Data changed (undo, restore…): follow the route, or report that it is gone / no longer playable.
   refresh(){if(!open)return;const x=find(routeId);if(!x||!x.analysis.ok){host.onGone();return;}load(routeId,true);},
   update(dt){if(!open||!compiled)return;if(playing){t=T.advance(t,dt,rate,compiled.total);if(t>=compiled.total)playing=false;}if(playing||(people.ready()&&visitor.getObjectByName('tour-placeholder')))apply();},
   debug(){
    const s=compiled?T.sampleRoute(compiled,t,eye):null;
    return {routeId,t,total:compiled?.total??0,playing,rate,cam,yawOff,pitchOff,eyeHeight:eye,phase:s?.phase,visitor:visitor?{x:visitor.position.x,z:visitor.position.z,rotY:visitor.rotation.y,visible:visitor.visible}:null,anim:lastAnim?{...lastAnim}:{}};
   },
  };
 }
 return {ticks,phaseText,create};
})();
