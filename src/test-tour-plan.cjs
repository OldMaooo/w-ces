// Pure-logic tests for the data operations in tour-plan.js (no browser, no DOM). Run: node src/test-tour-plan.cjs
const assert=require('node:assert/strict');
const Plan=require('./tour-plan.js');
const M=require('./tour-model.js');
const P=require('./tour-path.js');
const T=require('./tour-timeline.js');
const {ops}=Plan;
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
const room={width:6.1,depth:5.5,wallA:true,wallB:true};
const venueFor=r=>{const sx=r.width/67,sz=r.depth/60,north=r.depth/2,west=r.width/2,aisleX=20*.3048,aisleZ=12*.3048,rightW=199*sx,rightD=133*sz,creatorD=368*sz,creatorSouth=north+aisleZ,creatorNorth=creatorSouth+creatorD,leftX=west+aisleX,leftW=269*sx;return {bounds:{minX:west-rightW,maxX:leftX+leftW,minZ:north-rightD,maxZ:creatorNorth+34*sz},aisleX,aisleZ};};
const venue=venueFor(room);
const sizes={tv:[1.218,.685,.09],desk:[1.6,1,.65],robot:[.65,1.5,.5],laptop:[.34,.24,.25],table:[.65,.75,.65]};
let nid=1;
const obj=(type,x,z,rotDeg=0,extra={})=>({type,id:nid++,size:[...sizes[type]],position:[x,0,z],rotation:rotDeg*Math.PI/180,...extra});
const ctxFor=(tour,objects)=>({tour,objects,room,nav:P.buildNav(objects,room,venue)});
const freshTour=()=>M.emptyTour();

test('兴趣点：编号递增、默认名字、站位在物料正面外 1 米',()=>{
 const tour=freshTour(),a=obj('tv',0,-2),b=obj('robot',1,1);
 const p1=ops.addPoi(tour,a,{name:'电视'}),p2=ops.addPoi(tour,b,{name:'机器人'});
 assert.equal(p1.num,1);assert.equal(p2.num,2);assert.equal(tour.pois.length,2);assert.equal(p1.name,'电视');assert.equal(p1.objectId,a.id);
 near(p1.stand[1],.045+1);near(p1.stand[0],0);
});
test('兴趣点：同一物料不能重复标；取消后留下的站只是失效，不被删',()=>{
 const tour=freshTour(),a=obj('tv',0,-2);
 const p=ops.addPoi(tour,a,{name:'电视'});assert.equal(ops.addPoi(tour,a,{name:'电视'}),null);assert.equal(tour.pois.length,1);
 const g=ops.newGroup(tour,'g','north-ew',room,venue),r=ops.newRoute(g,'r');ops.addStop(r,p.id);
 ops.removePoi(tour,p.id);assert.equal(tour.pois.length,0);assert.equal(r.stops.length,1);
 assert.equal(M.staleReason(tour,r.stops[0],[a]),'poi-removed');
});
test('兴趣点：编号只增不重排，删掉中间的不动其他',()=>{
 const tour=freshTour(),os=[obj('tv',0,-2),obj('robot',1,1),obj('table',-1,1)];
 const ps=os.map(o=>ops.addPoi(tour,o,{name:'x'}));ops.removePoi(tour,ps[1].id);
 assert.deepEqual(tour.pois.map(p=>p.num),[1,3]);const o4=obj('desk',2,2);assert.equal(ops.addPoi(tour,o4,{name:'y'}).num,4);
});
test('兴趣点：上限 100 个',()=>{
 const tour=freshTour();for(let i=0;i<M.LIMITS.pois;i++)assert.ok(ops.addPoi(tour,obj('laptop',i%5,0),{name:'n'+i}));
 assert.equal(ops.addPoi(tour,obj('laptop',0,0),{name:'多'}),null);assert.equal(tour.pois.length,M.LIMITS.pois);
});
test('大方案：来向决定默认入口出口；改来向会重置；上限 20',()=>{
 const tour=freshTour(),g=ops.newGroup(tour,'北过道·东→西','north-ew',room,venue);
 const d=M.defaultEntryExit('north-ew',room,venue);assert.deepEqual(g.entry,d.entry);assert.deepEqual(g.exit,d.exit);
 ops.setApproach(g,'west-sn',room,venue);const d2=M.defaultEntryExit('west-sn',room,venue);assert.equal(g.approach,'west-sn');assert.deepEqual(g.entry,d2.entry);
 assert.equal(tour.groups.length,1);for(let i=1;i<M.LIMITS.groups;i++)assert.ok(ops.newGroup(tour,'g'+i,'other',room,venue));
 assert.equal(ops.newGroup(tour,'多','other',room,venue),null);
});
test('子方案：默认值、上限 30',()=>{
 const tour=freshTour(),g=ops.newGroup(tour,'g','other',room,venue),r=ops.newRoute(g,'新子方案');
 assert.deepEqual([r.name,r.speed,r.eyeHeight,r.stops.length],['新子方案',1,1.75,0]);
 for(let i=1;i<M.LIMITS.routes;i++)assert.ok(ops.newRoute(g,'r'+i));assert.equal(ops.newRoute(g,'多'),null);
 assert.equal(new Set(g.routes.map(x=>x.id)).size,M.LIMITS.routes);
});
test('复制大方案：深拷贝、新 id、改副本不影响原件，兴趣点共用',()=>{
 const tour=freshTour(),a=obj('tv',0,-2),p=ops.addPoi(tour,a,{name:'电视'});
 const g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r1');ops.addStop(r,p.id);
 const c=ops.copyGroup(tour,g.id);assert.ok(c);assert.notEqual(c.id,g.id);assert.equal(c.name,'A 副本');
 assert.notEqual(c.routes[0].id,g.routes[0].id);assert.equal(tour.groups.length,2);assert.equal(tour.groups[1],c);
 c.routes[0].stops[0].dwell=99;c.entry[0]=123;c.routes[0].name='改了';
 assert.equal(g.routes[0].stops[0].dwell,undefined);assert.notEqual(g.entry[0],123);assert.equal(g.routes[0].name,'r1');
 assert.equal(tour.pois.length,1);assert.ok(M.validateTour(tour).ok);
});
test('复制子方案：插在原件后面、深拷贝、新 id',()=>{
 const tour=freshTour(),g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r1'),r2=ops.newRoute(g,'r2');
 r.stops.push({poiId:'p1',dwell:3});const c=ops.copyRoute(g,r.id);
 assert.deepEqual(g.routes.map(x=>x.name),['r1','r1 副本','r2']);assert.notEqual(c.id,r.id);c.stops[0].dwell=9;assert.equal(r.stops[0].dwell,3);
 assert.equal(c,g.routes[1]);void r2;
});
test('删除大方案 / 子方案',()=>{
 const tour=freshTour(),g=ops.newGroup(tour,'A','other',room,venue),r=ops.newRoute(g,'r');
 ops.removeRoute(g,r.id);assert.equal(g.routes.length,0);ops.removeGroup(tour,g.id);assert.equal(tour.groups.length,0);
});
test('站顺序：加站（同一兴趣点可多次）、删站、挪站、上限 50',()=>{
 const tour=freshTour(),g=ops.newGroup(tour,'A','other',room,venue),r=ops.newRoute(g,'r');
 ops.addStop(r,'a');ops.addStop(r,'b');ops.addStop(r,'a');assert.deepEqual(r.stops.map(s=>s.poiId),['a','b','a']);
 ops.moveStop(r,2,0);assert.deepEqual(r.stops.map(s=>s.poiId),['a','a','b']);ops.moveStop(r,0,2);assert.deepEqual(r.stops.map(s=>s.poiId),['a','b','a']);
 ops.removeStop(r,1);assert.deepEqual(r.stops.map(s=>s.poiId),['a','a']);
 for(let i=r.stops.length;i<M.LIMITS.stops;i++)assert.ok(ops.addStop(r,'z'));assert.equal(ops.addStop(r,'z'),false);assert.equal(r.stops.length,M.LIMITS.stops);
 ops.moveStop(r,-1,0);ops.moveStop(r,0,999);assert.equal(r.stops.length,M.LIMITS.stops);
});
test('编号串：入口 → ③ → ① → 出口；失效的站显示「已失效」；没有站就是入口 → 出口',()=>{
 const tour=freshTour(),os=[obj('tv',0,-2),obj('robot',1,1),obj('table',-1,1)];
 const ps=os.map(o=>ops.addPoi(tour,o,{name:'x'}));const g=ops.newGroup(tour,'A','other',room,venue),r=ops.newRoute(g,'r');
 assert.equal(ops.routeLabel(tour,r,os),'入口 → 出口');
 ops.addStop(r,ps[2].id);ops.addStop(r,ps[0].id);assert.equal(ops.routeLabel(tour,r,os),'入口 → ③ → ① → 出口');
 ops.removePoi(tour,ps[0].id);assert.equal(ops.routeLabel(tour,r,os),'入口 → ③ → 已失效 → 出口');
 assert.equal(ops.numLabel(1),'①');assert.equal(ops.numLabel(20),'⑳');assert.equal(ops.numLabel(21),'21');
});
test('时长显示：mm:ss',()=>{assert.equal(ops.fmtDuration(65),'1:05');assert.equal(ops.fmtDuration(0),'0:00');assert.equal(ops.fmtDuration(59.6),'1:00');assert.equal(ops.fmtDuration(null),'—');});

test('分析：只路过（没有站）也能算出路线和时长',()=>{
 const tour=freshTour(),g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'只路过');
 const res=ops.analyzeRoute(ctxFor(tour,[obj('tv',0,-2)]),g,r);
 assert.equal(res.ok,true);assert.equal(res.issues.length,0);assert.equal(res.legs.length,1);
 const len=Math.hypot(g.exit[0]-g.entry[0],g.exit[1]-g.entry[1]);near(res.total,len/T.WALK_SPEED,.05);
});
test('分析：两站路线 = 走 + 转身 + 停留，和时间轴编译结果一致，停留可被单站覆盖',()=>{
 const tour=freshTour(),a=obj('tv',0,-2),b=obj('robot',1.5,1),os=[a,b];
 const p1=ops.addPoi(tour,a,{name:'电视'}),p2=ops.addPoi(tour,b,{name:'机器人'});
 const g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r');ops.addStop(r,p1.id);ops.addStop(r,p2.id);
 const res=ops.analyzeRoute(ctxFor(tour,os),g,r);assert.equal(res.ok,true,JSON.stringify(res.issues));assert.equal(res.legs.length,3);
 const looks=[{x:0,z:-2,y:.3425},{x:1.5,z:1,y:.75}];
 const c=T.compileRoute(res.legs,[5,5],looks,1);near(res.total,c.total,1e-6);
 r.stops[0].dwell=20;const res2=ops.analyzeRoute(ctxFor(tour,os),g,r);near(res2.total-res.total,15,1e-6);
 assert.deepEqual(res.stops.map(s=>s.num),[1,2]);assert.deepEqual(res.stops.map(s=>s.stale),[null,null]);
 for(const leg of res.legs)for(let i=1;i<leg.length;i++)assert.ok(ctxFor(tour,os).nav.segmentClear(leg[i-1],leg[i]),'路线逐段不碰障碍');
});
test('分析：走速参数缩短走路时间，不改停留',()=>{
 const tour=freshTour(),a=obj('tv',0,-2),p=ops.addPoi(tour,a,{name:'电视'});
 const g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r');ops.addStop(r,p.id);
 const t1=ops.analyzeRoute(ctxFor(tour,[a]),g,r);r.speed=2;const t2=ops.analyzeRoute(ctxFor(tour,[a]),g,r);
 assert.ok(t2.total<t1.total&&t2.total>5);
});
test('分析：失效的站被跳过，路线照算，stops 里标出原因',()=>{
 const tour=freshTour(),a=obj('tv',0,-2),b=obj('robot',1.5,1);
 const p1=ops.addPoi(tour,a,{name:'电视'}),p2=ops.addPoi(tour,b,{name:'机器人'});
 const g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r');ops.addStop(r,p1.id);ops.addStop(r,p2.id);
 ops.removePoi(tour,p1.id);const res=ops.analyzeRoute(ctxFor(tour,[a,b]),g,r);
 assert.equal(res.ok,true);assert.equal(res.legs.length,2);assert.deepEqual(res.stops.map(s=>s.stale),['poi-removed',null]);
 const hidden=ops.analyzeRoute(ctxFor(tour,[a,{...b,visible:false}]),g,r);assert.equal(hidden.stops[1].stale,'object-hidden');assert.equal(hidden.legs.length,1);
 const gone=ops.analyzeRoute(ctxFor(tour,[a]),g,r);assert.equal(gone.stops[1].stale,'object-missing');
});
test('分析：站位在障碍里 → 「② 的站位被挡住了，拖一下站位点」',()=>{
 const tour=freshTour(),a=obj('tv',0,-2),d=obj('desk',-1,1.5),b=obj('laptop',-1,1.5);
 const p1=ops.addPoi(tour,a,{name:'电视'}),p2=ops.addPoi(tour,b,{name:'电脑'});p2.stand=[0,0];
 const g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r');ops.addStop(r,p1.id);ops.addStop(r,p2.id);
 const res=ops.analyzeRoute(ctxFor(tour,[a,d,b]),g,r);assert.equal(res.ok,false);
 assert.ok(res.issues.some(i=>i.text==='② 的站位被挡住了，拖一下站位点'),JSON.stringify(res.issues));
 assert.equal(res.stops[1].standBlocked,true);assert.equal(res.stops[0].standBlocked,false);
});
test('分析：入口在走不了的地方 → 提示拖入口；出口同理',()=>{
 const tour=freshTour(),g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r');
 g.entry=[60,60];let res=ops.analyzeRoute(ctxFor(tour,[]),g,r);assert.equal(res.ok,false);assert.ok(res.issues.some(i=>i.text==='入口位置走不了，拖一下入口点'),JSON.stringify(res.issues));
 g.entry=M.defaultEntryExit('north-ew',room,venue).entry;g.exit=[60,60];res=ops.analyzeRoute(ctxFor(tour,[]),g,r);assert.ok(res.issues.some(i=>i.text==='出口位置走不了，拖一下出口点'),JSON.stringify(res.issues));
 assert.equal(res.total,null);
});
test('分析：完全走不通 → 「① → ② 走不通，被『前台』挡住」，红色段保留直连点，总时长为空',()=>{
 const tour=freshTour(),a=obj('tv',2,-2),b=obj('laptop',0,0);
 const ring=[obj('desk',0,.95,0,{name:'前台'}),obj('desk',0,-.95,0,{name:'前台'}),obj('desk',.95,0,90,{name:'前台'}),obj('desk',-.95,0,90,{name:'前台'})];
 const os=[a,b,...ring];const p1=ops.addPoi(tour,a,{name:'电视'}),p2=ops.addPoi(tour,b,{name:'电脑'});p2.stand=[0,0];
 const g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r');ops.addStop(r,p1.id);ops.addStop(r,p2.id);
 const res=ops.analyzeRoute(ctxFor(tour,os),g,r);assert.equal(res.ok,false);assert.equal(res.total,null);
 assert.ok(res.issues.some(i=>i.text==='① → ② 走不通，被『前台』挡住'),JSON.stringify(res.issues));
 const bad=res.segments.filter(s=>!s.ok);assert.equal(bad.length>=1,true);assert.equal(bad[0].points.length,2);
});
test('分析不改入参（tour、objects 原样）',()=>{
 const tour=freshTour(),a=obj('tv',0,-2),p=ops.addPoi(tour,a,{name:'电视'});const g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r');ops.addStop(r,p.id);
 const before=JSON.stringify([tour,[a]]);ops.analyzeRoute(ctxFor(tour,[a]),g,r);assert.equal(JSON.stringify([tour,[a]]),before);
});
test('改后的 tour 仍能通过 validateTour（所有操作产出的数据合法）',()=>{
 const tour=freshTour(),a=obj('tv',0,-2),p=ops.addPoi(tour,a,{name:'电视'});const g=ops.newGroup(tour,'A','north-ew',room,venue),r=ops.newRoute(g,'r');ops.addStop(r,p.id);ops.addStop(r,p.id);
 ops.copyGroup(tour,g.id);ops.copyRoute(g,r.id);ops.moveStop(r,0,1);assert.deepEqual(M.validateTour(tour).ok,true,JSON.stringify(M.validateTour(tour)));
});

let failed=0;
for(const [name,fn] of tests){try{fn();console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,'\n   ',e.message.split('\n')[0]);}}
console.log(`\n${tests.length-failed}/${tests.length} 通过`);process.exit(failed?1:0);
