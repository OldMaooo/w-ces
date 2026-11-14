// Visitor-route plan editor ("路线" mode): pure data operations (TourPlan.ops, usable in node) + the SVG plan UI (browser only).
// The UI never touches localStorage or keeps its own undo: it mutates the tour held by app.js after host.checkpoint(), then calls host.persist().
// World axes: north = +Z, west = +X (east = -X); the plan is drawn north-up, east-right.
const TourPlan=(()=>{
 const M=typeof TourModel!=='undefined'?TourModel:require('./tour-model.js');
 const P=typeof TourPath!=='undefined'?TourPath:require('./tour-path.js');
 const T=typeof TourTimeline!=='undefined'?TourTimeline:require('./tour-timeline.js');

 // ---------------- pure data operations ----------------
 const CIRCLED='①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
 const numLabel=n=>n>=1&&n<=20?CIRCLED[n-1]:String(n);
 const fmtDuration=s=>{if(!Number.isFinite(s))return '—';const t=Math.round(s);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};
 const clone=v=>JSON.parse(JSON.stringify(v));
 const find=(list,id)=>list.find(x=>x.id===id);
 const routeIds=tour=>new Set(tour.groups.flatMap(g=>g.routes.map(r=>r.id)));
 const STALE_TEXT={'poi-removed':'兴趣点已取消','object-missing':'物料已删除','object-hidden':'物料已隐藏'};

 const ops={
  numLabel,fmtDuration,
  addPoi(tour,o,opts={}){
   if(tour.pois.length>=M.LIMITS.pois||tour.pois.some(p=>p.objectId===o.id))return null;
   const poi=M.makePoi(tour,o,opts);tour.pois.push(poi);return poi;
  },
  removePoi(tour,id){tour.pois=tour.pois.filter(p=>p.id!==id);},
  newGroup(tour,name,approach,room,venue){
   if(tour.groups.length>=M.LIMITS.groups)return null;
   const e=M.defaultEntryExit(approach,room,venue);
   const g={id:M.newId('g',new Set(tour.groups.map(x=>x.id))),name:name.slice(0,40),approach,entry:[...e.entry],exit:[...e.exit],routes:[]};
   tour.groups.push(g);return g;
  },
  setApproach(g,approach,room,venue){
   if(!M.APPROACHES.includes(approach))return;
   const e=M.defaultEntryExit(approach,room,venue);g.approach=approach;g.entry=[...e.entry];g.exit=[...e.exit];
  },
  newRoute(g,name,tour){
   if(g.routes.length>=M.LIMITS.routes)return null;
   const r={id:M.newId('r',tour?routeIds(tour):new Set(g.routes.map(x=>x.id))),name:name.slice(0,40),speed:1,eyeHeight:1.75,stops:[]};
   g.routes.push(r);return r;
  },
  copyGroup(tour,id){
   const src=find(tour.groups,id);if(!src||tour.groups.length>=M.LIMITS.groups)return null;
   const c=clone(src),taken=routeIds(tour);
   c.id=M.newId('g',new Set(tour.groups.map(x=>x.id)));c.name=(src.name+' 副本').slice(0,40);
   for(const r of c.routes){r.id=M.newId('r',taken);taken.add(r.id);}
   tour.groups.splice(tour.groups.indexOf(src)+1,0,c);return c;
  },
  copyRoute(g,id,tour){
   const src=find(g.routes,id);if(!src||g.routes.length>=M.LIMITS.routes)return null;
   const c=clone(src);c.id=M.newId('r',tour?routeIds(tour):new Set(g.routes.map(x=>x.id)));c.name=(src.name+' 副本').slice(0,40);
   g.routes.splice(g.routes.indexOf(src)+1,0,c);return c;
  },
  removeGroup(tour,id){tour.groups=tour.groups.filter(g=>g.id!==id);},
  removeRoute(g,id){g.routes=g.routes.filter(r=>r.id!==id);},
  // at = 插在第几个位置（默认末尾）；路径点 = 不挂在兴趣点上、直接站在地图某处
  addStop(r,poiId,at=r.stops.length){if(r.stops.length>=M.LIMITS.stops)return false;r.stops.splice(at,0,{poiId});return true;},
  addWaypoint(r,pos,at=r.stops.length){if(r.stops.length>=M.LIMITS.stops)return false;r.stops.splice(at,0,{pos:[pos[0],pos[1]]});return true;},
  removeStop(r,i){if(i>=0&&i<r.stops.length)r.stops.splice(i,1);},
  moveStop(r,from,to){
   const n=r.stops.length;if(!(from>=0&&from<n&&to>=0&&to<n)||from===to)return;
   const [s]=r.stops.splice(from,1);r.stops.splice(to,0,s);
  },
  // "入口 → ③ → ① → 出口"; stops that can't be used right now read 已失效. `objects` is optional (without it only removed 兴趣点 count as stale).
  routeLabel(tour,r,objects){
   const mid=r.stops.map(s=>{if(s.pos)return '路径点';const poi=find(tour.pois,s.poiId);return !poi||(objects&&M.staleReason(tour,s,objects))?'已失效':poi.name;});
   return ['入口',...mid,'出口'].join(' → ');
  },
  // ctx = {tour, objects, nav}. Never mutates its inputs.
  analyzeRoute(ctx,g,r){
   const {tour,objects,nav}=ctx;
   let wpN=0;
   const stops=r.stops.map((s,index)=>{
    if(s.pos)return {index,poiId:null,waypoint:true,num:null,name:'路径点 '+(++wpN),stale:null,dwell:M.stopDwell(tour,s),customDwell:s.dwell!==undefined,stand:[s.pos[0],s.pos[1]],standBlocked:false,obj:null};
    const poi=find(tour.pois,s.poiId),o=poi?objects.find(x=>x.id===poi.objectId):null;
    return {index,poiId:s.poiId,waypoint:false,num:poi?poi.num:null,name:poi?poi.name:'',stale:M.staleReason(tour,s,objects),dwell:M.stopDwell(tour,s),customDwell:s.dwell!==undefined,
     stand:poi&&o?M.poiWorldStand(poi,o):null,standBlocked:false,obj:o||null};
   });
   const live=stops.filter(s=>!s.stale);
   const res=P.planRoute(nav,g.entry,live.map(s=>s.stand),g.exit);
   for(const i of res.standIssues)live[i.index].standBlocked=true;
   const issues=[];
   if(!res.entryOk)issues.push({kind:'entry',text:'入口位置走不了，拖一下入口点'});
   if(!res.exitOk)issues.push({kind:'exit',text:'出口位置走不了，拖一下出口点'});
   for(const s of live)if(s.standBlocked)issues.push({kind:'stand',stopIndex:s.index,objectId:s.obj?s.obj.id:undefined,text:s.waypoint?s.name+' 的位置走不了，拖一下它':s.name+' 的站位被挡住了，拖一下站位点'});
   res.segments.forEach((seg,k)=>{
    if(seg.reason!=='unreachable')return;
    const from=k===0?'入口':live[k-1].name,to=k===live.length?'出口':live[k].name;
    issues.push({kind:'unreachable',segment:k,text:`${from} → ${to} 走不通`+(seg.blockedBy?`，被『${seg.blockedBy}』挡住`:'')});
   });
   const legs=res.segments.map(s=>s.points);
   let compiled=null,total=null;
   if(res.ok){
    const looks=live.map(s=>s.obj?{x:s.obj.position[0],z:s.obj.position[2],y:s.obj.position[1]+s.obj.size[1]/2}:null);
    compiled=T.compileRoute(legs,live.map(s=>s.dwell),looks,r.speed);total=compiled.total;
   }
   return {ok:res.ok,issues,stops,live,segments:res.segments,legs,compiled,total,label:ops.routeLabel(tour,r,objects)};
  },
 };

 // ---------------- plan UI (browser) ----------------
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 function h(tag,props,...kids){
  const e=document.createElement(tag);
  for(const [k,v] of Object.entries(props||{})){
   if(v==null||v===false)continue;
   if(k==='class')e.className=v;else if(k.startsWith('on'))e[k]=v;else if(k==='value')e.value=v;else if(v===true)e.setAttribute(k,'');else e.setAttribute(k,v);
  }
  for(const c of kids.flat())if(c!=null&&c!==false)e.append(c);
  return e;
 }

 // 面板宽度可左右拖（存本机，不进方案）；图纸左栏和 3D 预览左栏共用一个宽度
 const PANEL_KEY='ces-route-panel-w';
 function setPanelWidth(w,v='--rt-left-w'){const max=Math.max(240,innerWidth*.7);document.documentElement.style.setProperty(v,Math.round(Math.max(240,Math.min(max,w)))+'px');}
 try{const w=parseFloat(localStorage.getItem(PANEL_KEY));if(w>0)setPanelWidth(w);const rw=parseFloat(localStorage.getItem(PANEL_KEY+'-right'));if(rw>0)setPanelWidth(rw,'--rt-right-w');}catch(e){}
 // right=true：面板在右边，把手放它左侧，往左拖变宽
 function attachResize(panel,right=false){
  const bar=h('div',{class:'rt-split',role:'separator','aria-orientation':'vertical',title:'左右拖动调整宽度'}),key=right?PANEL_KEY+'-right':PANEL_KEY,vr=right?'--rt-right-w':'--rt-left-w';
  if(right)panel.before(bar);else panel.after(bar);let st=null;
  bar.onpointerdown=e=>{st={x:e.clientX,w:panel.offsetWidth};bar.setPointerCapture(e.pointerId);bar.classList.add('drag');document.body.style.userSelect='none';};
  bar.onpointermove=e=>{if(st)setPanelWidth(st.w+(right?st.x-e.clientX:e.clientX-st.x),vr);};
  const end=()=>{if(!st)return;st=null;bar.classList.remove('drag');document.body.style.userSelect='';try{localStorage.setItem(key,String(panel.offsetWidth));}catch(e){}};
  bar.onpointerup=end;bar.onpointercancel=end;return bar;
 }
 // host: {root, icon(name), getObjects(), getRoom(), getVenue(), getTour(), checkpoint(), persist(), undo(), redo(), undoState()}
 function create(host){
  const root=host.root,q=s=>root.querySelector(s);
  let open=false,selGroup=null,selRoute=null,selObj=null,selWp=null,selStop=null,lastRoute=null,insAt=0,ordering=false,view=null,drag=null,pan=null,dragFrom=null,dragGap=null,raf=0,hintTimer=0,flashText='';
  let navSig='',nav=null;const memo=new Map();
  const RATES=[.5,1,2],VIEWS=[['plan','map','平面'],['orbit','box','透视'],['fp','user','游客']],SET_KEY='ces-route-settings';
  const settings=(()=>{try{return {skipDwell:JSON.parse(localStorage.getItem(SET_KEY)||'{}').skipDwell===true};}catch(e){return {skipDwell:false};}})();
  const pb={t:0,total:0,comp:null,src:null,skip:null,routeId:null,started:false,paused:true,rate:1,raf:0,last:0,why:'先在左边选一个子方案',legs:null,live:null,eye:1.75};
  let vw='plan',bar=null;
  let W=0,H=0;
  const toS=(x,z)=>[W/2+(view.cx-x)*view.k,H/2+(view.cz-z)*view.k];
  const toW=(sx,sy)=>[view.cx-(sx-W/2)/view.k,view.cz-(sy-H/2)/view.k];

  const barEl=playBarEl();
  root.append(h('div',{class:'rt-side',id:'rtLeft'}),h('div',{id:'rtStage'},h('div',{class:'rt-canvas',id:'rtCanvas'},(()=>{const e=document.createElementNS('http://www.w3.org/2000/svg','svg');e.id='rtPlan';return e;})(),h('div',{class:'rt-toolbar',id:'rtTools'}),h('div',{class:'rt-hint',id:'rtHint',hidden:true})),barEl),h('div',{class:'rt-side right',id:'rtRight'}));
  attachResize(q('#rtLeft'));attachResize(q('#rtRight'),true);

  // ----- context / analysis (nav rebuilt only when objects or room change) -----
  function ctx(){
   const objects=host.getObjects(),room=host.getRoom(),venue=host.getVenue(),sig=JSON.stringify([objects,room,venue.bounds]);
   if(sig!==navSig){navSig=sig;nav=P.buildNav(objects,room,venue);memo.clear();}
   return {tour:host.getTour(),objects,room,venue,nav};
  }
  function analysis(c,g,r){
   const sig=JSON.stringify([g.entry,g.exit,r,c.tour.pois]),hit=memo.get(r.id);
   if(hit&&hit.sig===sig)return hit.res;
   const res=ops.analyzeRoute(c,g,r);memo.set(r.id,{sig,res});return res;
  }
  const curGroup=c=>c.tour.groups.find(g=>g.id===selGroup)||null;
  const curRoute=g=>g?g.routes.find(r=>r.id===selRoute)||null:null;
  const objLabel=(c,o)=>c.objects.filter(x=>x.name===o.name).length>1?o.name+' '+o.id:o.name;
  function fixSelection(c){
   if(!c.tour.groups.some(g=>g.id===selGroup))selGroup=c.tour.groups[0]?.id??null;
   const g=curGroup(c);if(!g||!g.routes.some(r=>r.id===selRoute)){selRoute=null;ordering=false;}
   if(selRoute!==lastRoute){lastRoute=selRoute;selStop=null;selWp=null;}
   const rr=curRoute(g);if(selStop!=null&&!(rr&&rr.stops[selStop]))selStop=null;if(selWp!=null&&(!rr||!rr.stops[selWp]||!rr.stops[selWp].pos))selWp=null;
   if(selObj!=null&&!c.objects.some(o=>o.id===selObj))selObj=null;
  }
  function mutate(fn){host.checkpoint();fn();host.persist();render();}
  function flash(text){flashText=text;clearTimeout(hintTimer);hintTimer=setTimeout(()=>{flashText='';updateHint();},2800);updateHint();}
  function updateHint(){
   const el=q('#rtHint'),text=flashText||(ordering?'点平面图上的位置或兴趣点，加到路线 · Esc 取消':'');
   el.hidden=!text;el.textContent=text;
  }

  // ----- toolbar -----
  function renderTools(){
   const el=q('#rtTools'),u=host.undoState();el.replaceChildren();
   const btn=(ic,title,on,dis,extra)=>h('button',{class:'rt-tool'+(extra?' '+extra:''),title,'aria-label':title,disabled:dis,onclick:on},host.icon(ic));
   el.append(btn('undo-2','撤销',()=>host.undo(),!u.undo),btn('redo-2','重做',()=>host.redo(),!u.redo));
   if(vw==='plan')el.append(h('span',{class:'rt-sep'}),btn('maximize','适应画面',()=>{view=null;drawPlan();}),h('span',{class:'rt-zoom',id:'rtZoom'}));
  }

  // ----- 播放：一条时间线，「透视 / 第一人称 / 平面」三种视角共用（画面在画布上直接切换）-----
  function playBarEl(){
   const bh=(props,ic,text)=>h('button',props,ic?host.icon(ic):null,text||null);
   bar={
    restart:bh({id:'tpRestart',class:'ghost',title:'从头','aria-label':'从头',onclick:()=>{pb.t=0;frame(true);}},'skip-back'),
    play:bh({id:'tpPlay',class:'primary',onclick:togglePlay}),
    seek:h('input',{type:'range',id:'tpSeek',min:'0',step:'0.01','aria-label':'进度'}),
    ticks:h('div',{class:'tp-ticks'}),
    time:h('span',{class:'tp-time',id:'tpTime'}),
    dwell:h('label',{class:'tp-dwell',title:'取消勾选则播放时不在兴趣点停留'},(()=>{const c=h('input',{type:'checkbox',id:'tpDwell'});c.checked=!settings.skipDwell;c.onchange=()=>{settings.skipDwell=!c.checked;try{localStorage.setItem(SET_KEY,JSON.stringify(settings));}catch(e){}if(open)render();};return c;})(),'停留'),
    rate:bh({id:'tpRate',title:'切换播放速度','aria-label':'切换播放速度',onclick:()=>{pb.rate=RATES[(RATES.indexOf(pb.rate)+1)%RATES.length];syncBar();}}),
    recenter:bh({id:'tpRecenter',class:'ghost',title:'视线归位','aria-label':'视线归位',onclick:()=>host.view3d.recenter()},'rotate-ccw'),
   };
   bar.cams=h('div',{class:'tp-seg'},...VIEWS.map(([k,ic,txt])=>bh({'data-cam':k,'aria-label':txt,onclick:()=>setView(k)},ic)));
   bar.seek.onpointerdown=pausePlay;
   bar.seek.oninput=()=>{pb.t=Number(bar.seek.value);frame(true);};
   return h('div',{id:'rtBar',class:'tp-bar'},bar.restart,bar.play,h('div',{class:'tp-track'},bar.seek,bar.ticks),bar.time,bar.rate,bar.dwell,bar.recenter,bar.cams);
  }
  // 停留刻度画在进度条里面：每次停留的起点，点一下跳到那一站
  function refreshTicks(){
   bar.ticks.replaceChildren(...(pb.comp?pb.src.compiled.items.filter(it=>it.type==='hold').map(it=>{
    const t0=pb.comp.stops[it.stopIndex].t0,e=h('span',{class:'tp-tick',title:'第 '+(it.stopIndex+1)+' 站','data-t':t0,style:`left:calc(7px + (100% - 14px) * ${pb.total?t0/pb.total:0})`});
    e.onclick=()=>{pausePlay();pb.t=Math.min(t0+.01,pb.total);frame(true);};return e;}):[]));
  }
  let barSig='';
  function syncBar(){
   const can=!!pb.comp,done=can&&pb.t>=pb.total-.01&&pb.total>0;
   bar.seek.max=String(pb.total);bar.seek.value=String(pb.t);
   const text=fmtDuration(pb.t)+' / '+fmtDuration(pb.total);if(bar.time.textContent!==text)bar.time.textContent=text;
   bar.ticks.childNodes.forEach(e=>e.classList.toggle('passed',+e.dataset.t<=pb.t+.001));
   const sig=[can,done,pb.paused,vw,pb.rate,pb.why].join();if(sig===barSig)return;barSig=sig;
   bar.play.replaceChildren(host.icon(pb.paused?'play':'pause'),pb.paused?(done?'重播':'播放'):'暂停');
   bar.play.title=can?'播放 / 暂停（空格）':pb.why;
   for(const b of [bar.play,bar.restart,bar.rate,bar.seek])b.disabled=!can;
   bar.rate.textContent=pb.rate+'×';
   bar.cams.querySelectorAll('[data-cam]').forEach(b=>{b.classList.toggle('active',b.dataset.cam===vw);b.disabled=!can&&b.dataset.cam!=='plan';b.title=b.disabled?pb.why:b.getAttribute('aria-label');b.replaceChildren(host.icon(VIEWS.find(v=>v[0]===b.dataset.cam)[1]),...(b.dataset.cam===vw?[VIEWS.find(v=>v[0]===b.dataset.cam)[2]]:[]));});
   bar.recenter.style.visibility=vw==='fp'?'':'hidden';
  }
  function frame(touched){
   if(touched){pb.started=true;if(vw!=='plan')host.view3d.recenter();}
   syncBar();if(vw==='plan')drawPlan();else host.view3d.setTime(pb.t);
  }
  function tick(){
   cancelAnimationFrame(pb.raf);if(pb.paused||!pb.comp)return;
   pb.raf=requestAnimationFrame(now=>{if(pb.paused||!pb.comp)return;pb.t=T.advance(pb.t,(now-pb.last)/1000,pb.rate,pb.total);pb.last=now;if(pb.t>=pb.total)pb.paused=true;frame();tick();});
  }
  function togglePlay(){
   if(!pb.comp)return;
   if(pb.paused){if(pb.t>=pb.total-.01)pb.t=0;pb.paused=false;pb.started=true;pb.last=performance.now();if(vw!=='plan')host.view3d.recenter();syncBar();tick();}
   else pausePlay();
  }
  function pausePlay(){if(pb.paused)return;pb.paused=true;cancelAnimationFrame(pb.raf);syncBar();}
  // 选中的子方案 → 时间线。没变就不动（点选兴趣点之类不打断播放）；换了子方案从头；走不通就没有时间线。
  function syncPlayback(c){
   const g=curGroup(c),r=curRoute(g),a=r?analysis(c,g,r):null;
   if(!a||!a.ok||!a.compiled){
    pausePlay();Object.assign(pb,{comp:null,total:0,t:0,src:null,skip:null,routeId:r?r.id:null,started:false,why:r?'有走不通的地方，先修好再播放':'先在左边选一个子方案'});
    if(vw!=='plan')vw='plan';refreshTicks();return;
   }
   if(pb.src===a&&pb.skip===settings.skipDwell)return;
   const same=pb.routeId===r.id,skipFlip=pb.skip!==null&&pb.skip!==settings.skipDwell,frac=pb.total?pb.t/pb.total:0;
   pb.comp=settings.skipDwell?T.compileRoute(a.legs,a.live.map(()=>0),a.live.map(()=>null),r.speed):a.compiled;
   pb.total=pb.comp.total;pb.t=!same?0:skipFlip?frac*pb.total:Math.min(pb.t,pb.total);
   if(!same){pausePlay();pb.started=false;}
   Object.assign(pb,{src:a,skip:settings.skipDwell,routeId:r.id,why:'',legs:a.legs,live:a.live,eye:r.eyeHeight});
   refreshTicks();if(vw!=='plan')load3d();
  }
  function load3d(){host.view3d.load({compiled:pb.comp,legs:pb.legs,live:pb.live,eye:pb.eye});host.view3d.setTime(pb.t);}
  // 画布上换视角：平面 = 图纸（可编辑）；透视 / 第一人称 = 3D 画面
  function applyView(){
   const plan=vw==='plan';q('#rtPlan').style.display=plan?'':'none';
   if(plan){if(host.view3d.isOpen())host.view3d.hide();}
   else{host.view3d.show(vw,q('#rtCanvas'));load3d();}
   renderTools();syncBar();updateHint();if(plan)drawPlan();
  }
  function setView(next){if(next===vw||(next!=='plan'&&!pb.comp))return;vw=next;applyView();}

  // ----- left: 大方案 / 子方案（图纸模式可编辑；3D 预览里 readonly，只能点选能走通的子方案）-----
  function renderList(el,c){
   const {tour}=c,cur=selRoute;el.replaceChildren();
   el.append(h('h2',null,'路线方案',h('button',{class:'ghost',title:'新建大方案','aria-label':'新建大方案',onclick:newGroup},host.icon('plus'))));
   if(!tour.groups.length)el.append(h('div',{class:'rt-empty'},'还没有路线方案'));
   for(const g of tour.groups){
    const row=h('div',{class:'rt-row g'+(selGroup===g.id&&!selRoute?' sel':''),onclick:()=>{selGroup=g.id;selRoute=null;ordering=false;render();}},
      host.icon('folder'),h('span',{class:'rt-name'},M.APPROACH_NAMES[g.approach]),
      h('span',{class:'rt-tools'},toolBtn('copy','复制',()=>{if(tour.groups.length>=M.LIMITS.groups){flash('大方案最多 20 个');return;}mutate(()=>{const n=ops.copyGroup(tour,g.id);selGroup=n.id;selRoute=null;});}),toolBtn('trash','删除',()=>mutate(()=>{ops.removeGroup(tour,g.id);}))),
      toolBtn('plus','新建子方案',()=>newRoute(g),'rt-addroute'));
    const subs=h('div',{class:'rt-subs'});
    for(const r of g.routes){
     const a=analysis(c,g,r);
     subs.append(h('div',{class:'rt-row r'+(cur===r.id?' sel':''),onclick:()=>{selGroup=g.id;selRoute=r.id;ordering=false;render();}},
      h('span',{class:'rt-main'},h('span',{class:'rt-name'},r.name),h('span',{class:'rt-seq',title:a.label},a.label)),
      a.ok?null:h('span',{class:'rt-flag',title:'走不通'},host.icon('triangle-alert')),
      h('span',{class:'rt-tools'},toolBtn('copy','复制',()=>{if(g.routes.length>=M.LIMITS.routes){flash('子方案最多 30 个');return;}mutate(()=>{const n=ops.copyRoute(g,r.id,tour);selGroup=g.id;selRoute=n.id;});}),toolBtn('trash','删除',()=>mutate(()=>{ops.removeRoute(g,r.id);})))));
    }
    if(!g.routes.length)subs.append(h('div',{class:'rt-empty'},'还没有子方案'));
    el.append(h('div',{class:'rt-group'},row,subs));
   }
  }
  function toolBtn(ic,title,on,cls=''){return h('button',{class:'ghost '+cls,title,'aria-label':title,onclick:e=>{e.stopPropagation();on();}},host.icon(ic));}
  function newGroup(){
   const c=ctx();
   if(c.tour.groups.length>=M.LIMITS.groups){flash('大方案最多 20 个');return;}
   mutate(()=>{const made=ops.newGroup(c.tour,'大方案 '+(c.tour.groups.length+1),'north-ew',c.room,c.venue);selGroup=made.id;selRoute=null;ordering=false;});
  }
  function newRoute(g){
   const c=ctx();if(g.routes.length>=M.LIMITS.routes){flash('子方案最多 30 个');return;}
   mutate(()=>{const r=ops.newRoute(g,'子方案 '+(g.routes.length+1),c.tour);selGroup=g.id;selRoute=r.id;ordering=true;insAt=0;});
  }

  // ----- right: 物料 / 子方案 / 大方案 -----
  const field=(label,input,unit)=>h('div',{class:'rt-field'},h('label',null,label),h('span',null,input,unit?' '+unit:''));
  const numberInput=(value,min,max,step,on)=>{
   const i=h('input',{type:'number',min,max,step,value});
   i.onchange=()=>{const v=parseFloat(i.value);if(Number.isFinite(v)&&v>=min&&v<=max){if(v!==value)on(v);}else i.value=value;};return i;
  };
  const textInput=(value,on)=>{
   const i=h('input',{type:'text',maxlength:40,value});
   i.onchange=()=>{const v=i.value.trim();if(v&&v!==value)on(v);else i.value=value;};return i;
  };
  function renderRight(c){
   const el=q('#rtRight'),body=h('div',{class:'rt-scroll'}),foot=h('div',{class:'rt-foot'});el.replaceChildren(body,foot);
   const g=curGroup(c),r=curRoute(g),o=selObj!=null?c.objects.find(x=>x.id===selObj):null,acts=[];
   if(g&&r)body.append(routeSection(c,g,r,acts));else if(g)body.append(groupSection(c,g));
   if(o)body.append(objectSection(c,o,acts));
   if(!body.children.length)body.append(h('div',{class:'rt-empty'},'点图上的物料，设为兴趣点'));
   // 最主要的按钮固定在右下角，最右边的那个是主按钮
   const main=acts.find(x=>x.key==='poi');
   for(const x of acts)foot.append(h('button',{class:x===main?'primary':'',disabled:x.disabled,title:x.title,onclick:x.on},host.icon(x.icon),x.text));
  }
  function objectSection(c,o,acts){
   const {tour}=c,poi=tour.pois.find(p=>p.objectId===o.id),sec=h('section',null);
   sec.append(h('h2',null,poi?'兴趣点 · '+poi.name:objLabel(c,o)));
   if(!poi){
    acts.push({key:'poi',icon:'map-pin',text:'设为兴趣点',on:()=>{
     if(tour.pois.length>=M.LIMITS.pois){flash('兴趣点最多 100 个');return;}
     mutate(()=>{ops.addPoi(tour,o,{name:objLabel(c,o),isWalkable:(x,z)=>c.nav.isWalkable(x,z)});});
    }});
    return sec;
   }
   sec.append(field('名称',textInput(poi.name,v=>mutate(()=>{poi.name=v;}))),field('默认停留',numberInput(poi.dwell,0,3600,1,v=>mutate(()=>{poi.dwell=v;})),'秒'));
   const w=M.poiWorldStand(poi,o);
   if(!c.nav.isWalkable(w[0],w[1]))sec.append(h('div',{class:'rt-warn'},host.icon('triangle-alert'),h('span',null,'站位被挡住了，拖一下图上的站位点')));
   sec.append(h('div',{class:'rt-btnrow'},
    h('button',{onclick:()=>mutate(()=>{ops.removePoi(tour,poi.id);})},'取消兴趣点')));
   return sec;
  }
  function groupSection(c,g){
   const sec=h('section',null,h('h2',null,'大方案'));
   sec.append(field('名称',textInput(g.name,v=>mutate(()=>{g.name=v.slice(0,40);}))));
   const sel=h('select',null,...M.APPROACHES.map(k=>h('option',{value:k,selected:g.approach===k},M.APPROACH_NAMES[k])));
   sel.onchange=()=>mutate(()=>{ops.setApproach(g,sel.value,c.room,c.venue);});
   sec.append(field('来向',sel),h('div',{class:'rt-btnrow'},h('button',{title:'入口和出口点放回默认位置',onclick:()=>mutate(()=>{ops.setApproach(g,g.approach,c.room,c.venue);})},'还原入口出口')));
   return sec;
  }
  function routeSection(c,g,r,acts){
   const a=analysis(c,g,r),sec=h('section',null);
   sec.append(h('h2',null,'子方案'));
   sec.append(field('名称',textInput(r.name,v=>mutate(()=>{r.name=v.slice(0,40);}))));
   const list=h('div',{class:'rt-stops'});
   const edge=(row,pos,after)=>{row.ondragover=e=>{if(gapLine(row,pos,after))e.preventDefault();};row.ondrop=e=>{e.preventDefault();const from=dragFrom;dragFrom=null;dragGap=null;const to=pos>from?pos-1:pos;if(from!=null&&to!==from)mutate(()=>ops.moveStop(r,from,to));else render();};return row;};
   const holder=()=>h('div',{class:'rt-stop hold'},h('span',{class:'rt-sname'},'点图上位置或兴趣点'));
   list.append(edge(h('div',{class:'rt-stop fixed'},h('span',{class:'rt-end start'},'入'),h('span',{class:'rt-sname'},'入口'),addBtn(0)),0,true));
   a.stops.forEach((s,i)=>{if(ordering&&insAt===i)list.append(holder());list.append(stopRow(c,r,s,i));});
   if(ordering&&insAt>=a.stops.length)list.append(holder());
   list.append(edge(h('div',{class:'rt-stop fixed'},h('span',{class:'rt-end'},'出'),h('span',{class:'rt-sname'},'出口')),r.stops.length,false));
   sec.append(list);
   if(!r.stops.length)sec.append(h('div',{class:'rt-note'},'没有站点 = 只路过'));
   for(const is of a.issues){
    const node=is.objectId!=null?h('button',{class:'rt-warn click',onclick:()=>{selObj=is.objectId;render();}},host.icon('triangle-alert'),h('span',null,is.text)):h('div',{class:'rt-warn'},host.icon('triangle-alert'),h('span',null,is.text));
    sec.append(node);
   }
   return sec;
  }
  // 拖动排序：按鼠标在行的上/下半部分决定插到哪两站之间，用一条横线标出（pos = 插入缝隙 0..n）
  function gapLine(row,pos,after){
   if(dragFrom==null)return false;
   for(const x of root.querySelectorAll('.ins-before,.ins-after'))x.classList.remove('ins-before','ins-after');
   row.classList.add(after?'ins-after':'ins-before');dragGap=pos;return true;
  }
  // 每个路径点右边的加号：在它下面再加一个路径点（再点一次取消）
  function addBtn(pos){return h('button',{class:'ghost rt-add',title:'在下面加一个路径点','aria-label':'在下面加一个路径点',onclick:e=>{e.stopPropagation();if(ordering&&insAt===pos)ordering=false;else{ordering=true;insAt=pos;}render();}},host.icon('plus'));}
  function stopRow(c,r,s,i){
   const stale=s.stale?STALE_TEXT[s.stale]:'',row=h('div',{class:'rt-stop'+(stale?' stale':'')+(!stale&&(s.waypoint?selWp===i:selObj!=null&&c.tour.pois.some(p=>p.id===s.poiId&&p.objectId===selObj))?' sel':'')});
   const grip=h('span',{class:'rt-grip',title:'拖动排序'},host.icon('grip-vertical'));
   grip.onpointerdown=()=>{row.draggable=true;};
   row.ondragstart=e=>{dragFrom=i;dragGap=null;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));row.classList.add('dragging');};
   row.ondragover=e=>{const b=row.getBoundingClientRect(),after=e.clientY>b.top+b.height/2;if(gapLine(row,after?i+1:i,after))e.preventDefault();};
   row.ondrop=e=>{e.preventDefault();const from=dragFrom,gap=dragGap;dragFrom=null;dragGap=null;if(from!=null&&gap!=null){const to=gap>from?gap-1:gap;if(to!==from)mutate(()=>ops.moveStop(r,from,to));else render();}};
   row.ondragend=()=>{dragFrom=null;dragGap=null;row.draggable=false;render();};
   row.onclick=e=>{if(e.target.closest('input,button,.rt-grip'))return;selStop=i;if(stale){render();return;}const poi=c.tour.pois.find(p=>p.id===s.poiId);if(s.waypoint){selWp=i;selObj=null;render();}else if(poi){selObj=poi.objectId;selWp=null;render();}};
   const name=stale?h('span',{class:'rt-sname warn',title:stale},'已失效'):h('span',{class:'rt-sname',title:s.name},s.name);
   const dwell=h('input',{type:'number',min:0,max:3600,step:1,class:'rt-dwell',title:'停留秒数（清空 = 用兴趣点默认值）',value:s.customDwell?s.dwell:'',placeholder:stale?'':String(s.dwell)});
   dwell.onchange=()=>{
    const raw=dwell.value.trim(),st=r.stops[i];
    if(raw===''){if(st.dwell!==undefined)mutate(()=>{delete st.dwell;});return;}
    const v=parseFloat(raw);if(Number.isFinite(v)&&v>=0&&v<=3600){if(v!==st.dwell)mutate(()=>{st.dwell=v;});}else dwell.value=st.dwell??'';
   };
   row.append(grip,name,stale?null:h('span',{class:'rt-dwell-wrap'},dwell,'秒'),addBtn(i+1),h('button',{class:'ghost rt-del',title:'删除这一站','aria-label':'删除这一站',onclick:()=>mutate(()=>ops.removeStop(r,i))},host.icon('x')));
   return row;
  }

  // ----- plan drawing -----
  function fit(c){
   const w=c.room.width/2,d=c.room.depth/2,{aisleZ}=c.venue,x0=-w-3.6,x1=w+3.6,z0=-d-1.2,z1=d+aisleZ*.6;
   view={cx:(x0+x1)/2,cz:(z0+z1)/2,k:Math.min(W/(x1-x0),H/(z1-z0))*.94};
  }
  function drawPlan(){
   const svg=q('#rtPlan');W=svg.clientWidth;H=svg.clientHeight;if(!W||!H)return;
   const c=ctx();if(!view)fit(c);
   const {room,venue,tour}=c,k=view.k,w=room.width/2,d=room.depth/2,{bounds:b,aisleX,aisleZ}=venue,f=n=>Math.round(n*10)/10;
   const rect=(x0,x1,z0,z1,cls,extra='')=>{const [a,bb]=toS(x1,z1),[cc,dd]=toS(x0,z0);return `<rect class="${cls}" x="${f(a)}" y="${f(bb)}" width="${f(cc-a)}" height="${f(dd-bb)}" ${extra}/>`;};
   const poly=pts=>pts.map(p=>toS(p[0],p[1]).map(f).join(',')).join(' ');
   const label=(x,z,s,cls,dy=0)=>{const [a,bb]=toS(x,z);return `<text class="${cls}" x="${f(a)}" y="${f(bb+dy)}">${esc(s)}</text>`;};
   const g=curGroup(c),r=curRoute(g);
   let s=rect(b.minX,b.maxX,b.minZ,b.maxZ,'rt-block')+rect(b.minX,w+aisleX,d,d+aisleZ,'rt-aisle')+rect(w,w+aisleX,b.minZ,b.maxZ,'rt-aisle')+rect(-w,w,-d,d,'rt-booth');
   for(let x=-w+.5;x<w-1e-6;x+=.5){const [a,y0]=toS(x,d),[,y1]=toS(x,-d);s+=`<line class="rt-grid" x1="${f(a)}" y1="${f(y0)}" x2="${f(a)}" y2="${f(y1)}"/>`;}
   for(let z=-d+.5;z<d-1e-6;z+=.5){const [x0,bb]=toS(w,z),[x1]=toS(-w,z);s+=`<line class="rt-grid" x1="${f(x0)}" y1="${f(bb)}" x2="${f(x1)}" y2="${f(bb)}"/>`;}
   s+=label(-w-1.6,d+aisleZ-.45,'北过道','rt-vlabel')+label(w+aisleX/2,-d-.9,'西过道','rt-vlabel')+label(-w-1.5,0,'隔壁展位','rt-vlabel')+label(0,-d-1.1,'隔壁展位','rt-vlabel');
   if(room.wallA!==false)s+=rect(-w-.12,-w,-d,d,'rt-wall');
   if(room.wallB!==false)s+=rect(-w-.12,w+.12,-d-.12,-d,'rt-wall');
   const vis=c.objects.filter(o=>o.visible!==false),poiOf=new Map(tour.pois.map(p=>[p.objectId,p]));
   const shapes=P.obstacleShapes(vis,{...room,wallA:false,wallB:false}),solid=new Set(shapes.map(x=>x.id));
   const cls=id=>'rt-obj'+(selObj===id?' sel':'')+(ordering&&poiOf.has(id)?' pick':'');
   const soft=o=>{
    const hx=o.size[0]/2,hz=o.size[2]/2,round=o.type==='fascia'&&o.shape==='round',big=o.type==='fascia';
    if(round){const [a,bb]=toS(o.position[0],o.position[2]);return `<circle class="${cls(o.id)} soft${big?' big':''}" data-o="${o.id}" cx="${f(a)}" cy="${f(bb)}" r="${f(hx*k)}"/>`;}
    return `<polygon class="${cls(o.id)} soft${big?' big':''}" data-o="${o.id}" points="${poly([[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(l=>M.localToWorld(o,l)))}"/>`;
   };
   for(const o of vis)if(!solid.has(o.id)&&o.type==='fascia')s+=soft(o);
   for(const sh of shapes){
    if(sh.kind==='circle'){const [a,bb]=toS(sh.cx,sh.cz);s+=`<circle class="${cls(sh.id)}" data-o="${sh.id}" cx="${f(a)}" cy="${f(bb)}" r="${f(sh.r*k)}"/>`;}
    else s+=`<polygon class="${cls(sh.id)}" data-o="${sh.id}" points="${poly(sh.pts)}"/>`;
   }
   for(const o of vis)if(!solid.has(o.id)&&o.type!=='fascia')s+=soft(o);
   if(g){
    if(r){
     const a=analysis(c,g,r);
     a.segments.forEach(seg=>{
      const pts=seg.points;s+=`<polyline class="rt-seg${seg.ok?'':' bad'}" points="${poly(pts)}"/>`;
      for(let i=1;i<pts.length;i++){
       const [x0,y0]=toS(pts[i-1][0],pts[i-1][1]),[x1,y1]=toS(pts[i][0],pts[i][1]);
       if(Math.hypot(x1-x0,y1-y0)>46)s+=`<path class="rt-arrow${seg.ok?'':' bad'}" transform="translate(${f((x0+x1)/2)},${f((y0+y1)/2)}) rotate(${f(Math.atan2(y1-y0,x1-x0)*180/Math.PI)})" d="M5 0 L-4 -4.5 L-4 4.5Z"/>`;
      }
     });
    }
   }
   // 兴趣点：站位点（虚线连到物料）+ 编号圆标
   const inRoute=new Set(r?r.stops.map(x=>x.poiId):[]);
   for(const poi of tour.pois){
    const o=vis.find(x=>x.id===poi.objectId);if(!o)continue;
    const [bx,by]=toS(o.position[0],o.position[2]),st=M.poiWorldStand(poi,o),[sx,sy]=toS(st[0],st[1]),bad=!c.nav.isWalkable(st[0],st[1]);
    s+=`<line class="rt-link" x1="${f(bx)}" y1="${f(by)}" x2="${f(sx)}" y2="${f(sy)}"/><circle class="rt-stand${inRoute.has(poi.id)?' on':''}${bad?' bad':''}${selObj===o.id?' sel':''}" data-stand="${poi.id}" cx="${f(sx)}" cy="${f(sy)}" r="${selObj===o.id?11:7}"/>`;
   }
   if(g&&r)for(const st of analysis(c,g,r).stops)if(st.waypoint){const [wx,wy]=toS(st.stand[0],st.stand[1]),bad=!c.nav.isWalkable(st.stand[0],st.stand[1]);s+=`<circle class="rt-stand on wp${bad?' bad':''}${selWp===st.index?' sel':''}" data-wp="${st.index}" cx="${f(wx)}" cy="${f(wy)}" r="${selWp===st.index?11:7}"/>`;}
   for(const poi of tour.pois){
    const o=vis.find(x=>x.id===poi.objectId);if(!o)continue;
    const [bx,by]=toS(o.position[0],o.position[2]);
    s+=`<g class="rt-badge${selObj===o.id?' sel':''}${ordering?' pick':''}" data-o="${o.id}"><text x="${f(bx)}" y="${f(by)}">${esc(poi.name)}</text></g>`;
   }
   if(g){
    const a=r?analysis(c,g,r):null,bad=kind=>a&&a.issues.some(i=>i.kind===kind);
    const mark=(which,pt,txt)=>{const [x,y]=toS(pt[0],pt[1]);return `<g class="rt-ep ${which}${bad(which)?' bad':''}" data-ep="${which}"><circle cx="${f(x)}" cy="${f(y)}" r="11"/><text x="${f(x)}" y="${f(y)}">${txt}</text></g>`;};
    s+=mark('entry',g.entry,'入')+mark('exit',g.exit,'出');
   }
   if(pb.comp&&pb.started&&vw==='plan'){const p=T.sampleRoute(pb.comp,pb.t),[px,py]=toS(p.x,p.z),dx=-Math.sin(p.lookYaw),dy=-Math.cos(p.lookYaw);const R=1.5*k,ang=Math.atan2(dy,dx),pts=Array.from({length:9},(_,i)=>{const a=ang-Math.PI/4+i*Math.PI/18;return f(px+R*Math.cos(a))+','+f(py+R*Math.sin(a));});s+=`<g class="rt-walker"><path class="fov" d="M${f(px)},${f(py)} L${pts.join(' L')}Z"/><circle cx="${f(px)}" cy="${f(py)}" r="7"/></g>`;}
   s+=`<g class="rt-compass" transform="translate(${W-52},52)"><circle r="38"/><path d="M0 -22 L5 -5 L0 -8 L-5 -5Z" fill="#c45143"/><path d="M0 22 L5 5 L0 8 L-5 5Z" fill="#80968a"/><text y="-30" class="n">北</text><text y="30">南</text><text x="29" font-size="11">东</text><text x="-29" font-size="11">西</text></g>`;
   s+=`<g class="rt-scale" transform="translate(${f(W-24-k)},${H-24})"><line x1="0" x2="${f(k)}" /><line x1="0" x2="0" y1="-4" y2="4"/><line x1="${f(k)}" x2="${f(k)}" y1="-4" y2="4"/><text x="${f(k/2)}" y="-8">1 米</text></g>`;
   svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.classList.toggle('picking',ordering);svg.innerHTML=s;
   const z=q('#rtZoom');if(z)z.textContent=Math.round(k/40*100)+'%';
  }
  const scheduleDraw=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;if(open)drawPlan();});};

  // ----- interaction -----
  const local=e=>{const b=q('#rtPlan').getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top];};
  function onDown(e){
   const c=ctx();
   if(e.button===1||e.button===2){pan={x:e.clientX,y:e.clientY,cx:view.cx,cz:view.cz,moved:false,blank:false};e.preventDefault();return;}
   if(e.button!==0)return;
   const wp=e.target.closest('[data-wp]');
   if(wp){selWp=+wp.dataset.wp;selStop=selWp;selObj=null;drag={type:'wp',index:selWp,x:e.clientX,y:e.clientY,moved:false};render();return;}
   const st=e.target.closest('[data-stand]'),ep=e.target.closest('[data-ep]'),ob=e.target.closest('[data-o]');
   if(st){const poi=c.tour.pois.find(p=>p.id===st.dataset.stand);if(!poi)return;selObj=poi.objectId;selWp=null;drag={type:'stand',poiId:poi.id,x:e.clientX,y:e.clientY,moved:false};render();return;}
   if(ep){drag={type:'ep',which:ep.dataset.ep,x:e.clientX,y:e.clientY,moved:false};return;}
   if(ob){
    const id=+ob.dataset.o;
    if(ordering){addStopFor(c,id);return;}
    selObj=id;selWp=null;selStop=null;render();return;
   }
   const [sx,sy]=local(e),[wx,wz]=toW(sx,sy);
   pan={x:e.clientX,y:e.clientY,cx:view.cx,cz:view.cz,moved:false,blank:true,wx,wz};
  }
  function addStopFor(c,id){
   const g=curGroup(c),r=curRoute(g),poi=c.tour.pois.find(p=>p.objectId===id);if(!r)return;
   if(!poi){selObj=id;renderRight(c);drawPlan();flash('这个物料还不是兴趣点：右栏点「设为兴趣点」');return;}
   if(r.stops.length>=M.LIMITS.stops){flash('一条路线最多 50 站');return;}
   mutate(()=>{ops.addStop(r,poi.id,insAt);ordering=false;});
  }
  function addWaypointAt(pt){
   const c=ctx(),r=curRoute(curGroup(c));if(!r)return;
   if(r.stops.length>=M.LIMITS.stops){flash('一条路线最多 50 站');return;}
   const rd=n=>Math.round(n*100)/100;
   mutate(()=>{ops.addWaypoint(r,[rd(pt[0]),rd(pt[1])],insAt);ordering=false;selWp=null;});
  }
  function onMove(e){
   if(!open)return;
   if(drag){
    if(!drag.moved){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<3)return;host.checkpoint();drag.moved=true;}
    const c=ctx(),[sx,sy]=local(e),[wx,wz]=toW(sx,sy),rd=n=>Math.round(n*100)/100;
    if(drag.type==='stand'){
     const poi=c.tour.pois.find(p=>p.id===drag.poiId),o=poi&&c.objects.find(x=>x.id===poi.objectId);
     if(poi&&o){const l=M.worldToLocal(o,[wx,wz]);poi.stand=[Math.max(-99,Math.min(99,rd(l[0]))),Math.max(-99,Math.min(99,rd(l[1])))];}
    }else if(drag.type==='wp'){const r=curRoute(curGroup(c)),st=r&&r.stops[drag.index];if(st&&st.pos)st.pos=[rd(wx),rd(wz)];}
    else{const g=curGroup(c);if(g)g[drag.which]=[rd(wx),rd(wz)];}
    scheduleDraw();return;
   }
   if(pan){
    const dx=e.clientX-pan.x,dy=e.clientY-pan.y;if(!pan.moved&&Math.hypot(dx,dy)<4)return;
    pan.moved=true;view.cx=pan.cx+dx/view.k;view.cz=pan.cz+dy/view.k;q('#rtPlan').classList.add('panning');scheduleDraw();
   }
  }
  function onUp(){
   if(drag){const moved=drag.moved;drag=null;if(moved){host.persist();render();}return;}
   if(pan){const click=pan.blank&&!pan.moved,wp0=[pan.wx,pan.wz];pan=null;q('#rtPlan').classList.remove('panning');if(click&&ordering){addWaypointAt(wp0);}else if(click&&(selObj!=null||selWp!=null||selStop!=null)){selObj=null;selWp=null;selStop=null;render();}}
  }
  function onWheel(e){
   e.preventDefault();const [sx,sy]=local(e),[wx,wz]=toW(sx,sy);
   view.k=Math.max(12,Math.min(260,view.k*Math.exp(-e.deltaY*.0015)));
   const [nx,nz]=toW(sx,sy);view.cx+=wx-nx;view.cz+=wz-nz;scheduleDraw();
  }
  function onKey(e){
   if(!open||e.isComposing||e.target.matches?.('input,select,textarea'))return;
   if((e.key==='Delete'||e.key==='Backspace')&&selStop!=null){const r=curRoute(curGroup(ctx()));if(r&&r.stops[selStop]){e.preventDefault();const i=selStop;selStop=null;selWp=null;mutate(()=>ops.removeStop(r,i));}return;}
   if(e.code==='Space'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();if(!e.repeat)togglePlay();return;}
   if(e.key==='Enter'&&ordering){ordering=false;render();}
   else if(e.key==='Escape'){if(ordering)ordering=false;else if(selObj!=null)selObj=null;else return;render();}
  }
  q('#rtPlan').addEventListener('pointerdown',onDown);
  q('#rtPlan').addEventListener('wheel',onWheel,{passive:false});
  q('#rtPlan').addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',onUp);document.addEventListener('keydown',onKey);
  new ResizeObserver(()=>{if(open)drawPlan();}).observe(q('#rtCanvas'));
  // 点设置面板以外的地方就收起；窗口失焦 / 切走标签页就暂停
  window.addEventListener('blur',pausePlay);document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlay();});
  window.addEventListener('keyup',e=>{if(open&&e.code==='Space'&&e.target.tagName==='BUTTON')e.preventDefault();});

  function render(){
   if(!open)return;
   const c=ctx();fixSelection(c);
   const was=vw;if(ordering)vw='plan';   // 加路径点要在平面图上点，自动回到平面
   syncPlayback(c);
   if(vw!==was&&(vw==='plan'||was==='plan'))applyView();
   renderTools();renderList(q('#rtLeft'),c);renderRight(c);syncBar();updateHint();drawPlan();
  }
  return {
   // routeId: reopen on that sub-plan (e.g. coming back from 3D preview); otherwise the first one.
   open(routeId){open=true;root.hidden=false;view=null;vw='plan';q('#rtPlan').style.display='';const c=ctx();selGroup=null;selRoute=null;selObj=null;selWp=null;ordering=false;insAt=0;
    const home=routeId&&c.tour.groups.find(g=>g.routes.some(r=>r.id===routeId));
    if(home){selGroup=home.id;selRoute=routeId;}else{fixSelection(c);const g=curGroup(c);if(g&&g.routes[0])selRoute=g.routes[0].id;}render();},
   close(){pausePlay();if(host.view3d.isOpen())host.view3d.hide();vw='plan';open=false;root.hidden=true;ordering=false;drag=null;pan=null;},
   // 切方案等场合：先回到平面（3D 画面收掉、编辑视角恢复）
   showPlan(){if(vw==='plan')return;vw='plan';if(open)applyView();else if(host.view3d.isOpen())host.view3d.hide();},
   pause:pausePlay,
   isOpen:()=>open,
   refresh:render,
   state:()=>({selGroup,selRoute,selObj,ordering,view:vw,t:pb.t,total:pb.total,playing:!pb.paused,rate:pb.rate,skipDwell:settings.skipDwell}),
   analysisOf(id){const c=ctx();for(const g of c.tour.groups){const r=g.routes.find(x=>x.id===id);if(r)return analysis(c,g,r);}return null;},
  };
 }
 return {ops,create,numLabel,fmtDuration,attachResize};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TourPlan;
