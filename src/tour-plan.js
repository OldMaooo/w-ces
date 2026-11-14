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
  addStop(r,poiId){if(r.stops.length>=M.LIMITS.stops)return false;r.stops.push({poiId});return true;},
  removeStop(r,i){if(i>=0&&i<r.stops.length)r.stops.splice(i,1);},
  moveStop(r,from,to){
   const n=r.stops.length;if(!(from>=0&&from<n&&to>=0&&to<n)||from===to)return;
   const [s]=r.stops.splice(from,1);r.stops.splice(to,0,s);
  },
  // "入口 → ③ → ① → 出口"; stops that can't be used right now read 已失效. `objects` is optional (without it only removed 兴趣点 count as stale).
  routeLabel(tour,r,objects){
   const mid=r.stops.map(s=>{const poi=find(tour.pois,s.poiId);return !poi||(objects&&M.staleReason(tour,s,objects))?'已失效':numLabel(poi.num);});
   return ['入口',...mid,'出口'].join(' → ');
  },
  // ctx = {tour, objects, nav}. Never mutates its inputs.
  analyzeRoute(ctx,g,r){
   const {tour,objects,nav}=ctx;
   const stops=r.stops.map((s,index)=>{
    const poi=find(tour.pois,s.poiId),o=poi?objects.find(x=>x.id===poi.objectId):null;
    return {index,poiId:s.poiId,num:poi?poi.num:null,name:poi?poi.name:'',stale:M.staleReason(tour,s,objects),dwell:M.stopDwell(tour,s),customDwell:s.dwell!==undefined,
     stand:poi&&o?M.poiWorldStand(poi,o):null,standBlocked:false,obj:o||null};
   });
   const live=stops.filter(s=>!s.stale);
   const res=P.planRoute(nav,g.entry,live.map(s=>s.stand),g.exit);
   for(const i of res.standIssues)live[i.index].standBlocked=true;
   const issues=[];
   if(!res.entryOk)issues.push({kind:'entry',text:'入口位置走不了，拖一下入口点'});
   if(!res.exitOk)issues.push({kind:'exit',text:'出口位置走不了，拖一下出口点'});
   for(const s of live)if(s.standBlocked)issues.push({kind:'stand',stopIndex:s.index,objectId:s.obj.id,text:numLabel(s.num)+' 的站位被挡住了，拖一下站位点'});
   res.segments.forEach((seg,k)=>{
    if(seg.reason!=='unreachable')return;
    const from=k===0?'入口':numLabel(live[k-1].num),to=k===live.length?'出口':numLabel(live[k].num);
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
 function setPanelWidth(w){const max=Math.max(240,innerWidth*.7);document.documentElement.style.setProperty('--rt-left-w',Math.round(Math.max(240,Math.min(max,w)))+'px');}
 try{const w=parseFloat(localStorage.getItem(PANEL_KEY));if(w>0)setPanelWidth(w);}catch(e){}
 function attachResize(panel){
  const bar=h('div',{class:'rt-split',role:'separator','aria-orientation':'vertical',title:'左右拖动调整宽度'});panel.after(bar);let st=null;
  bar.onpointerdown=e=>{st={x:e.clientX,w:panel.offsetWidth};bar.setPointerCapture(e.pointerId);bar.classList.add('drag');document.body.style.userSelect='none';};
  bar.onpointermove=e=>{if(st)setPanelWidth(st.w+e.clientX-st.x);};
  const end=()=>{if(!st)return;st=null;bar.classList.remove('drag');document.body.style.userSelect='';try{localStorage.setItem(PANEL_KEY,String(panel.offsetWidth));}catch(e){}};
  bar.onpointerup=end;bar.onpointercancel=end;return bar;
 }
 // host: {root, icon(name), getObjects(), getRoom(), getVenue(), getTour(), checkpoint(), persist(), undo(), redo(), undoState()}
 function create(host){
  const root=host.root,q=s=>root.querySelector(s);
  let open=false,selGroup=null,selRoute=null,selObj=null,ordering=false,view=null,drag=null,pan=null,dragFrom=null,raf=0,hintTimer=0,flashText='';
  let navSig='',nav=null;const memo=new Map();
  let W=0,H=0;
  const toS=(x,z)=>[W/2+(view.cx-x)*view.k,H/2+(view.cz-z)*view.k];
  const toW=(sx,sy)=>[view.cx-(sx-W/2)/view.k,view.cz-(sy-H/2)/view.k];

  root.append(h('div',{class:'rt-side',id:'rtLeft'}),h('div',{id:'rtStage'},(()=>{const e=document.createElementNS('http://www.w3.org/2000/svg','svg');e.id='rtPlan';return e;})(),h('div',{class:'rt-toolbar',id:'rtTools'}),h('div',{class:'rt-hint',id:'rtHint',hidden:true})),h('div',{class:'rt-side right',id:'rtRight'}));
  attachResize(q('#rtLeft'));

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
   if(selObj!=null&&!c.objects.some(o=>o.id===selObj))selObj=null;
  }
  function mutate(fn){host.checkpoint();fn();host.persist();render();}
  function flash(text){flashText=text;clearTimeout(hintTimer);hintTimer=setTimeout(()=>{flashText='';updateHint();},2800);updateHint();}
  function updateHint(){
   const el=q('#rtHint'),text=flashText||(ordering?'依次点兴趣点加入顺序 · Enter 或「完成」结束 · Esc 退出':'');
   el.hidden=!text;el.textContent=text;
  }

  // ----- toolbar -----
  function renderTools(){
   const el=q('#rtTools'),u=host.undoState();el.replaceChildren();
   const btn=(ic,title,on,dis)=>h('button',{class:'rt-tool',title,'aria-label':title,disabled:dis,onclick:on},host.icon(ic));
   el.append(btn('undo-2','撤销',()=>host.undo(),!u.undo),btn('redo-2','重做',()=>host.redo(),!u.redo),h('span',{class:'rt-sep'}),btn('maximize','适应画面',()=>{view=null;drawPlan();}),h('span',{class:'rt-zoom',id:'rtZoom'}));
  }

  // ----- left: 大方案 / 子方案（图纸模式可编辑；3D 预览里 readonly，只能点选能走通的子方案）-----
  function renderList(el,c,opts={}){
   const {tour}=c,ro=!!opts.readonly,cur=ro?opts.selRoute:selRoute;el.replaceChildren();
   el.append(h('h2',null,'路线方案',ro?null:h('button',{class:'ghost',title:'新建大方案','aria-label':'新建大方案',onclick:newGroup},host.icon('plus'))));
   if(!tour.groups.length)el.append(h('div',{class:'rt-empty'},'还没有路线方案'));
   for(const g of tour.groups){
    const row=ro?h('div',{class:'rt-row g static'},h('span',{class:'rt-name'},g.name))
     :h('div',{class:'rt-row g'+(selGroup===g.id&&!selRoute?' sel':''),onclick:()=>{selGroup=g.id;selRoute=null;ordering=false;render();}},
      h('span',{class:'rt-name'},g.name),
      h('span',{class:'rt-tools'},toolBtn('copy','复制',()=>{if(tour.groups.length>=M.LIMITS.groups){flash('大方案最多 20 个');return;}mutate(()=>{const n=ops.copyGroup(tour,g.id);selGroup=n.id;selRoute=null;});}),toolBtn('trash','删除',()=>mutate(()=>{ops.removeGroup(tour,g.id);}))),
      toolBtn('plus','新建子方案',()=>newRoute(g),'rt-addroute'));
    const subs=h('div',{class:'rt-subs'});
    for(const r of g.routes){
     const a=analysis(c,g,r),off=ro&&!a.ok;
     subs.append(h('div',{class:'rt-row r'+(cur===r.id?' sel':'')+(off?' off':''),title:off?'有走不通的地方，不能预览':null,onclick:ro?()=>{if(a.ok)opts.onPick(r.id);}:()=>{selGroup=g.id;selRoute=r.id;ordering=false;render();}},
      h('span',{class:'rt-main'},h('span',{class:'rt-name'},r.name),h('span',{class:'rt-seq',title:a.label},a.label)),
      a.ok?null:h('span',{class:'rt-flag',title:'走不通'},host.icon('triangle-alert')),
      ro?null:h('span',{class:'rt-tools'},toolBtn('copy','复制',()=>{if(g.routes.length>=M.LIMITS.routes){flash('子方案最多 30 个');return;}mutate(()=>{const n=ops.copyRoute(g,r.id,tour);selGroup=g.id;selRoute=n.id;});}),toolBtn('trash','删除',()=>mutate(()=>{ops.removeRoute(g,r.id);})))));
    }
    if(!g.routes.length)subs.append(h('div',{class:'rt-empty'},'还没有子方案'));
    el.append(h('div',{class:'rt-group'},row,h('div',{class:'rt-approach'},M.APPROACH_NAMES[g.approach]),subs));
   }
  }
  const renderLeft=c=>renderList(q('#rtLeft'),c);
  function toolBtn(ic,title,on,cls=''){return h('button',{class:'ghost '+cls,title,'aria-label':title,onclick:e=>{e.stopPropagation();on();}},host.icon(ic));}
  function newGroup(){
   const c=ctx();
   if(c.tour.groups.length>=M.LIMITS.groups){flash('大方案最多 20 个');return;}
   mutate(()=>{const made=ops.newGroup(c.tour,'大方案 '+(c.tour.groups.length+1),'north-ew',c.room,c.venue);selGroup=made.id;selRoute=null;ordering=false;});
  }
  function newRoute(g){
   const c=ctx();if(g.routes.length>=M.LIMITS.routes){flash('子方案最多 30 个');return;}
   mutate(()=>{const r=ops.newRoute(g,'子方案 '+(g.routes.length+1),c.tour);selGroup=g.id;selRoute=r.id;ordering=true;});
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
   if(o)body.append(objectSection(c,o,acts));
   if(g&&r)body.append(routeSection(c,g,r,acts));else if(g)body.append(groupSection(c,g));
   if(!body.children.length)body.append(h('div',{class:'rt-empty'},'点图上的物料，设为兴趣点'));
   // 最主要的按钮固定在右下角，最右边的那个是主按钮
   const main=acts.find(x=>x.key==='finish')||acts.find(x=>x.key==='preview')||acts.find(x=>x.key==='poi');
   for(const x of acts)foot.append(h('button',{class:x===main?'primary':'',disabled:x.disabled,title:x.title,onclick:x.on},host.icon(x.icon),x.text));
  }
  function objectSection(c,o,acts){
   const {tour}=c,poi=tour.pois.find(p=>p.objectId===o.id),sec=h('section',null);
   sec.append(h('h2',null,poi?'兴趣点 '+numLabel(poi.num)+' · '+objLabel(c,o):objLabel(c,o)));
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
    h('button',{title:'把站位点放回物料前面',onclick:()=>mutate(()=>{poi.stand=M.defaultStand(o,(x,z)=>c.nav.isWalkable(x,z)).stand;})},'重置站位'),
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
   acts.push({key:ordering?'finish':'order',icon:ordering?'check':'list-ordered',text:ordering?'完成':'排顺序',on:()=>{ordering=!ordering;render();}});
   sec.append(field('名称',textInput(r.name,v=>mutate(()=>{r.name=v.slice(0,40);}))),
    field('走速',numberInput(r.speed,.1,5,.1,v=>mutate(()=>{r.speed=v;})),'倍'),field('眼高',numberInput(r.eyeHeight,1,2.2,.05,v=>mutate(()=>{r.eyeHeight=v;})),'米'));
   sec.append(h('div',{class:'rt-stat'},h('div',null,h('small',null,'时长'),a.ok?fmtDuration(a.total):'—'),h('div',null,h('small',null,'站点'),String(r.stops.length))));
   if(host.onPreview&&!ordering)acts.push({key:'preview',icon:'play',text:'在 3D 中预览',disabled:!a.ok,title:a.ok?'回到 3D 看游客走一遍':'有走不通的地方，先修好再预览',on:()=>{ordering=false;host.onPreview(r.id);}});
   const list=h('div',{class:'rt-stops'});
   list.append(h('div',{class:'rt-stop fixed'},h('span',{class:'rt-end start'},'入'),h('span',{class:'rt-sname'},'入口')));
   a.stops.forEach((s,i)=>list.append(stopRow(c,r,s,i)));
   list.append(h('div',{class:'rt-stop fixed'},h('span',{class:'rt-end'},'出'),h('span',{class:'rt-sname'},'出口')));
   sec.append(list);
   if(!r.stops.length)sec.append(h('div',{class:'rt-note'},'没有站点 = 只路过'));
   for(const is of a.issues){
    const node=is.objectId!=null?h('button',{class:'rt-warn click',onclick:()=>{selObj=is.objectId;render();}},host.icon('triangle-alert'),h('span',null,is.text)):h('div',{class:'rt-warn'},host.icon('triangle-alert'),h('span',null,is.text));
    sec.append(node);
   }
   return sec;
  }
  function stopRow(c,r,s,i){
   const stale=s.stale?STALE_TEXT[s.stale]:'',row=h('div',{class:'rt-stop'+(stale?' stale':'')});
   const grip=h('span',{class:'rt-grip',title:'拖动排序'},host.icon('grip-vertical'));
   grip.onpointerdown=()=>{row.draggable=true;};
   row.ondragstart=e=>{dragFrom=i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));row.classList.add('dragging');};
   row.ondragover=e=>{if(dragFrom!=null){e.preventDefault();row.classList.add('over');}};
   row.ondragleave=()=>row.classList.remove('over');
   row.ondrop=e=>{e.preventDefault();const from=dragFrom;dragFrom=null;if(from!=null&&from!==i)mutate(()=>ops.moveStop(r,from,i));};
   row.ondragend=()=>{dragFrom=null;row.draggable=false;render();};
   const name=stale?h('span',{class:'rt-sname warn',title:stale},'已失效'):h('span',{class:'rt-sname',title:s.name},numLabel(s.num)+' '+s.name);
   const dwell=h('input',{type:'number',min:0,max:3600,step:1,class:'rt-dwell',title:'停留秒数（清空 = 用兴趣点默认值）',value:s.customDwell?s.dwell:'',placeholder:stale?'':String(s.dwell)});
   dwell.onchange=()=>{
    const raw=dwell.value.trim(),st=r.stops[i];
    if(raw===''){if(st.dwell!==undefined)mutate(()=>{delete st.dwell;});return;}
    const v=parseFloat(raw);if(Number.isFinite(v)&&v>=0&&v<=3600){if(v!==st.dwell)mutate(()=>{st.dwell=v;});}else dwell.value=st.dwell??'';
   };
   row.append(grip,h('span',{class:'rt-order'},String(i+1)),name,stale?null:h('span',{class:'rt-dwell-wrap'},dwell,'秒'),h('button',{class:'ghost rt-del',title:'删除这一站','aria-label':'删除这一站',onclick:()=>mutate(()=>ops.removeStop(r,i))},host.icon('x')));
   return row;
  }

  // ----- plan drawing -----
  function fit(c){
   const w=c.room.width/2,d=c.room.depth/2,{aisleX,aisleZ}=c.venue,x0=-w-4.5,x1=w+aisleX+1.5,z0=-d-1.2,z1=d+aisleZ+1.2;
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
   for(const o of vis){if(!solid.has(o.id)&&o.type!=='fascia'&&!poiOf.has(o.id)&&selObj!==o.id)continue;const [a,bb]=toS(o.position[0],o.position[2]);s+=`<text class="rt-olabel" x="${f(a)}" y="${f(bb+(poiOf.has(o.id)?24:0))}">${esc(objLabel(c,o))}</text>`;}
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
   for(const poi of tour.pois){
    const o=vis.find(x=>x.id===poi.objectId);if(!o)continue;
    const [bx,by]=toS(o.position[0],o.position[2]),st=M.poiWorldStand(poi,o),[sx,sy]=toS(st[0],st[1]),bad=!c.nav.isWalkable(st[0],st[1]);
    s+=`<line class="rt-link" x1="${f(bx)}" y1="${f(by)}" x2="${f(sx)}" y2="${f(sy)}"/><circle class="rt-stand${bad?' bad':''}${selObj===o.id?' sel':''}" data-stand="${poi.id}" cx="${f(sx)}" cy="${f(sy)}" r="7"/>`;
   }
   for(const poi of tour.pois){
    const o=vis.find(x=>x.id===poi.objectId);if(!o)continue;
    const [bx,by]=toS(o.position[0],o.position[2]);
    s+=`<g class="rt-badge${selObj===o.id?' sel':''}${ordering?' pick':''}" data-o="${o.id}"><circle cx="${f(bx)}" cy="${f(by)}" r="11"/><text x="${f(bx)}" y="${f(by)}">${poi.num}</text></g>`;
   }
   if(g&&r){
    const a=analysis(c,g,r);
    for(const st of a.live){if(!st.stand)continue;const [sx,sy]=toS(st.stand[0],st.stand[1]);s+=`<g class="rt-tag"><rect x="${f(sx+6)}" y="${f(sy-20)}" width="16" height="16" rx="3"/><text x="${f(sx+14)}" y="${f(sy-12)}">${st.index+1}</text></g>`;}
   }
   if(g){
    const a=r?analysis(c,g,r):null,bad=kind=>a&&a.issues.some(i=>i.kind===kind);
    const mark=(which,pt,txt)=>{const [x,y]=toS(pt[0],pt[1]);return `<g class="rt-ep ${which}${bad(which)?' bad':''}" data-ep="${which}"><circle cx="${f(x)}" cy="${f(y)}" r="11"/><text x="${f(x)}" y="${f(y)}">${txt}</text></g>`;};
    s+=mark('entry',g.entry,'入')+mark('exit',g.exit,'出');
   }
   s+=`<g class="rt-compass" transform="translate(${W-44},58)"><circle r="20"/><path d="M0 -15 L5 0 L-5 0Z" fill="#c2410c"/><path d="M0 15 L5 0 L-5 0Z" fill="#9aa79f"/><text y="-28">北</text><text x="29">东</text><text x="-29">西</text></g>`;
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
   const st=e.target.closest('[data-stand]'),ep=e.target.closest('[data-ep]'),ob=e.target.closest('[data-o]');
   if(st){const poi=c.tour.pois.find(p=>p.id===st.dataset.stand);if(!poi)return;selObj=poi.objectId;drag={type:'stand',poiId:poi.id,x:e.clientX,y:e.clientY,moved:false};render();return;}
   if(ep){drag={type:'ep',which:ep.dataset.ep,x:e.clientX,y:e.clientY,moved:false};return;}
   if(ob){
    const id=+ob.dataset.o;
    if(ordering){addStopFor(c,id);return;}
    selObj=id;renderRight(c);drawPlan();return;
   }
   pan={x:e.clientX,y:e.clientY,cx:view.cx,cz:view.cz,moved:false,blank:true};
  }
  function addStopFor(c,id){
   const g=curGroup(c),r=curRoute(g),poi=c.tour.pois.find(p=>p.objectId===id);if(!r)return;
   if(!poi){selObj=id;renderRight(c);drawPlan();flash('这个物料还不是兴趣点：右栏点「设为兴趣点」');return;}
   if(r.stops.length>=M.LIMITS.stops){flash('一条路线最多 50 站');return;}
   mutate(()=>{ops.addStop(r,poi.id);});
  }
  function onMove(e){
   if(!open)return;
   if(drag){
    if(!drag.moved){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<3)return;host.checkpoint();drag.moved=true;}
    const c=ctx(),[sx,sy]=local(e),[wx,wz]=toW(sx,sy),rd=n=>Math.round(n*100)/100;
    if(drag.type==='stand'){
     const poi=c.tour.pois.find(p=>p.id===drag.poiId),o=poi&&c.objects.find(x=>x.id===poi.objectId);
     if(poi&&o){const l=M.worldToLocal(o,[wx,wz]);poi.stand=[Math.max(-99,Math.min(99,rd(l[0]))),Math.max(-99,Math.min(99,rd(l[1])))];}
    }else{const g=curGroup(c);if(g)g[drag.which]=[rd(wx),rd(wz)];}
    scheduleDraw();return;
   }
   if(pan){
    const dx=e.clientX-pan.x,dy=e.clientY-pan.y;if(!pan.moved&&Math.hypot(dx,dy)<4)return;
    pan.moved=true;view.cx=pan.cx+dx/view.k;view.cz=pan.cz+dy/view.k;q('#rtPlan').classList.add('panning');scheduleDraw();
   }
  }
  function onUp(){
   if(drag){const moved=drag.moved;drag=null;if(moved){host.persist();render();}return;}
   if(pan){const click=pan.blank&&!pan.moved;pan=null;q('#rtPlan').classList.remove('panning');if(click&&selObj!=null){selObj=null;render();}}
  }
  function onWheel(e){
   e.preventDefault();const [sx,sy]=local(e),[wx,wz]=toW(sx,sy);
   view.k=Math.max(12,Math.min(260,view.k*Math.exp(-e.deltaY*.0015)));
   const [nx,nz]=toW(sx,sy);view.cx+=wx-nx;view.cz+=wz-nz;scheduleDraw();
  }
  function onKey(e){
   if(!open||e.isComposing||e.target.matches?.('input,select,textarea'))return;
   if(e.key==='Enter'&&ordering){ordering=false;render();}
   else if(e.key==='Escape'){if(ordering)ordering=false;else if(selObj!=null)selObj=null;else return;render();}
  }
  q('#rtPlan').addEventListener('pointerdown',onDown);
  q('#rtPlan').addEventListener('wheel',onWheel,{passive:false});
  q('#rtPlan').addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',onUp);document.addEventListener('keydown',onKey);
  new ResizeObserver(()=>{if(open)drawPlan();}).observe(q('#rtStage'));

  function render(){
   if(!open)return;
   const c=ctx();fixSelection(c);renderTools();renderLeft(c);renderRight(c);updateHint();drawPlan();
  }
  return {
   // routeId: reopen on that sub-plan (e.g. coming back from 3D preview); otherwise the first one.
   open(routeId){open=true;root.hidden=false;view=null;const c=ctx();selGroup=null;selRoute=null;selObj=null;ordering=false;
    const home=routeId&&c.tour.groups.find(g=>g.routes.some(r=>r.id===routeId));
    if(home){selGroup=home.id;selRoute=routeId;}else{fixSelection(c);const g=curGroup(c);if(g&&g.routes[0])selRoute=g.routes[0].id;}render();},
   close(){open=false;root.hidden=true;ordering=false;drag=null;pan=null;},
   isOpen:()=>open,
   refresh:render,
   // 3D 预览左栏复用同一套方案列表（只读）
   renderList:(el,opts)=>renderList(el,ctx(),opts),
   state:()=>({selGroup,selRoute,selObj,ordering}),
   analysisOf(id){const c=ctx();for(const g of c.tour.groups){const r=g.routes.find(x=>x.id===id);if(r)return analysis(c,g,r);}return null;},
  };
 }
 return {ops,create,numLabel,fmtDuration,attachResize};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TourPlan;
