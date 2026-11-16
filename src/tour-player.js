// Visitor-route 3D view: temporary visitor, ground path, perspective / first-person camera, mouse look.
// Owns no clock, no bar, no storage, no undo: TourPlan drives time (setTime) and decides when 3D is shown (show / hide).
const TourPlayer=(()=>{
 const T=TourTimeline;
 const LOOK_SPEED=.003,PITCH_OFF_MAX=1.2,PITCH_MAX=1.45,FP_FOV=65;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // host: {view, scene, camera, orbit, canvas, onOpen(), onClose(), onPause()}
 function create(host){
  const {view,scene,camera,orbit,canvas}=host;
  let open=false,compiled=null,live=[],eye=1.75,t=0,cam='orbit',yawOff=0,pitchOff=0,locked=false,dragLook=null,overview=null,lastAnim=null,home=null;
  let visitor=null,path=null;
  const h=(tag,props,...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v==null||v===false)continue;if(k==='class')e.className=v;else e.setAttribute(k,v===true?'':v);}for(const c of kids.flat())if(c!=null)e.append(c);return e;};

  // ----- overlays on the 3D picture (phase text, mouse-look hint, crosshair) -----
  const hint=h('div',{class:'tp-hint',id:'tpHint'}),cross=h('div',{class:'tp-cross',id:'tpCross'});
  const root=h('div',{id:'tourPlay',hidden:true},hint,cross);
  view.append(root);

  // ----- scene objects -----
  const mat=c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  function disc(r,c,x,z){const m=new THREE.Mesh(new THREE.CircleGeometry(r,28),mat(c));m.rotation.x=-Math.PI/2;m.position.set(x,.014,z);return m;}
  function buildPath(legs,comp){
   const g=new THREE.Group();g.name='tour-path';
   for(const leg of legs)for(let i=1;i<leg.length;i++){
    const [x0,z0]=leg[i-1],[x1,z1]=leg[i],len=Math.hypot(x1-x0,z1-z0);if(len<1e-6)continue;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(.08,len),mat('#176b55'));m.rotation.order='YXZ';m.rotation.set(-Math.PI/2,Math.atan2(x1-x0,z1-z0),0);m.position.set((x0+x1)/2,.012,(z0+z1)/2);g.add(m);
   }
   for(const s of comp.stops)g.add(disc(.2,'#176b55',s.x,s.z));
   g.add(disc(.16,'#16a34a',...comp.start),disc(.16,'#dc2626',...comp.end));
   return g;
  }
  function placeholder(){
   const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:'#3b82f6',roughness:.7});
   const body=new THREE.Mesh(new THREE.CylinderGeometry(.18,.2,1.4,16),m);body.position.y=.7;const head=new THREE.Mesh(new THREE.SphereGeometry(.14,16,12),m);head.position.y=1.6;
   const nose=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.14),new THREE.MeshStandardMaterial({color:'#176b55'}));nose.position.set(0,1.6,.17);g.add(body,head,nose);g.name='tour-placeholder';return g;
  }
  function makeVisitor(){
   const g=new THREE.Group();g.name='tour-visitor';g.userData={type:'visitor',driven:true,personScale:1,animation:'Idle',clothesColor:'#f3f3ef',size:[.55,1.75,.35]};
   if(people.ready())people.build(g);else g.add(placeholder());return g;
  }
  function release(o){o.traverse(c=>{c.geometry?.dispose();for(const m of [].concat(c.material||[]))m.dispose();});}
  function clearScene(){
   if(path){scene.remove(path);release(path);path=null;}
   if(visitor){people.dispose(visitor);scene.remove(visitor);release(visitor);visitor=null;}
  }

  // ----- camera / pose -----
  function setCam(next){
   if(next===cam){syncHint();return;}
   if(next==='fp'){overview={position:camera.position.clone(),target:orbit.target.clone(),fov:camera.fov};orbit.enabled=false;camera.fov=FP_FOV;camera.updateProjectionMatrix();}
   else{unlock();backToOverview();}
   cam=next;dragLook=null;apply();
  }
  function backToOverview(){camera.position.copy(overview.position);orbit.target.copy(overview.target);camera.fov=overview.fov;camera.updateProjectionMatrix();orbit.enabled=true;orbit.update();}
  function apply(){
   if(!open||!compiled)return;
   if(visitor&&people.ready()&&visitor.getObjectByName('tour-placeholder')){const ph=visitor.getObjectByName('tour-placeholder');visitor.remove(ph);release(ph);people.build(visitor);}
   const s=T.sampleRoute(compiled,t,eye);
   visitor.position.set(s.x,0,s.z);visitor.rotation.y=s.bodyYaw;visitor.visible=cam!=='fp';
   lastAnim=people.pose(visitor,s.phase==='walk'?'Walk':'Idle',t);
   if(cam==='fp'){camera.position.set(s.x,eye,s.z);camera.rotation.set(clamp(s.lookPitch+pitchOff,-PITCH_MAX,PITCH_MAX),s.lookYaw+Math.PI+yawOff,0,'YXZ');camera.updateMatrixWorld();}
  }
  function syncHint(){
   const fp=cam==='fp';hint.hidden=cross.hidden=!fp;
   hint.textContent=locked?'移动鼠标转头 · Esc 释放鼠标并暂停':'按住 Cmd 移动鼠标转头，松开恢复原视角（也可按住拖动）';
  }

  // ----- mouse look -----
  function unlock(){if(document.pointerLockElement===canvas)document.exitPointerLock();locked=false;}
  canvas.addEventListener('pointerdown',e=>{
   if(!open||cam!=='fp'||e.button!==0)return;dragLook={x:e.clientX,y:e.clientY};
   
  });
  window.addEventListener('pointerup',()=>{dragLook=null;});
  document.addEventListener('pointermove',e=>{
   if(!open||cam!=='fp')return;let mx=0,my=0;
   if(metaDown||locked){mx=e.movementX;my=e.movementY;}else if(dragLook&&e.buttons&1){mx=e.clientX-dragLook.x;my=e.clientY-dragLook.y;dragLook={x:e.clientX,y:e.clientY};}else return;
   yawOff-=mx*LOOK_SPEED;pitchOff=clamp(pitchOff-my*LOOK_SPEED,-PITCH_OFF_MAX,PITCH_OFF_MAX);apply();
  });
  // 按住 Cmd 随鼠标转头，松开回到路径设定的视角
  let metaDown=false;
  const metaSet=v=>{if(v===metaDown)return;metaDown=v;if(!v&&open&&cam==='fp'){yawOff=pitchOff=0;apply();}};
  window.addEventListener('keydown',e=>{if(e.key==='Meta')metaSet(true);});
  window.addEventListener('keyup',e=>{if(e.key==='Meta')metaSet(false);});
  window.addEventListener('blur',()=>metaSet(false));
  document.addEventListener('pointerlockchange',()=>{const was=locked;locked=open&&document.pointerLockElement===canvas;if(was&&!locked)host.onPause();if(open)syncHint();});

  return {
   // Show the 3D picture in `mount` with camera 'orbit' (透视) or 'fp' (第一人称). Data arrives through load().
   show(mode,mount){
    if(!open){
     home={parent:view.parentNode,next:view.nextSibling};mount.append(view);host.onOpen();
     visitor=makeVisitor();scene.add(visitor);open=true;cam='orbit';root.hidden=false;yawOff=pitchOff=0;
    }
    setCam(mode);syncHint();
   },
   // {compiled, legs, live, eye}: the route to show (a new object whenever the route or its timing changed).
   load(d){
    compiled=d.compiled;live=d.live;eye=d.eye;t=clamp(t,0,compiled.total);
    if(path){scene.remove(path);release(path);}path=buildPath(d.legs,compiled);scene.add(path);apply();
   },
   setTime(v){t=v;apply();},
   recenter(){yawOff=pitchOff=0;apply();},
   hide(){
    if(!open)return;
    unlock();dragLook=null;if(cam==='fp'&&overview)backToOverview();
    cam='orbit';open=false;root.hidden=true;clearScene();compiled=null;
    home.parent.insertBefore(view,home.next);home=null;host.onClose();
   },
   isOpen:()=>open,
   // Called every frame: swaps the placeholder body for the real model once it has loaded.
   update(){if(open&&compiled&&visitor&&people.ready()&&visitor.getObjectByName('tour-placeholder'))apply();},
   debug(){
    const s=compiled?T.sampleRoute(compiled,t,eye):null;
    return {t,total:compiled?.total??0,cam,yawOff,pitchOff,eyeHeight:eye,phase:s?.phase,visitor:visitor?{x:visitor.position.x,z:visitor.position.z,rotY:visitor.rotation.y,visible:visitor.visible}:null,anim:lastAnim?{...lastAnim}:{}};
   },
  };
 }
 return {create};
})();
