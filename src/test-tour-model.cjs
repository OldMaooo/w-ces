// Pure-logic tests for tour-model.js (no browser). Run: node src/test-tour-model.cjs
const assert=require('node:assert/strict');
const M=require('./tour-model.js');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
const deg=d=>d*Math.PI/180;
const obj=(type,id,x,z,rotDeg=0,size=[1,1,1],extra={})=>({type,id,size,position:[x,0,z],rotation:deg(rotDeg),...extra});
const room={width:6.1,depth:5.5,wallA:true,wallB:true};
const venueFor=r=>{const sx=r.width/67,sz=r.depth/60,north=r.depth/2,west=r.width/2,aisleX=20*.3048,aisleZ=12*.3048,rightW=199*sx,rightD=133*sz,creatorD=368*sz,creatorSouth=north+aisleZ,creatorNorth=creatorSouth+creatorD,leftX=west+aisleX,leftW=269*sx;return {bounds:{minX:west-rightW,maxX:leftX+leftW,minZ:north-rightD,maxZ:creatorNorth+34*sz},aisleX,aisleZ};};
const poi=(id,objectId,num,extra={})=>({id,objectId,num,name:'展品'+num,dwell:5,stand:[0,1.5],...extra});
const goodTour=()=>({pois:[poi('p1',1,1),poi('p2',2,2)],groups:[{id:'g1',name:'北过道',approach:'north-ew',entry:[-6,5],exit:[6,5],routes:[{id:'r1',name:'子方案 1',speed:1,eyeHeight:1.75,stops:[{poiId:'p2'},{poiId:'p1',dwell:8}]}]}]});

// ---- 坐标：北 +Z，西 +X；旋转物料的 stand 本地↔世界 ----
test('坐标：未旋转物料，本地 +Z 就是世界北（+Z）',()=>{
 const [x,z]=M.localToWorld(obj('desk',1,2,3),[0,1]);near(x,2);near(z,4);
});
test('坐标：本地 +X 在未旋转时是世界西（+X）',()=>{
 const [x,z]=M.localToWorld(obj('desk',1,2,3),[1,0]);near(x,3);near(z,3);
});
test('坐标：转 90° 后，本地正面（+Z）指向世界西（+X）',()=>{
 const [x,z]=M.localToWorld(obj('desk',1,0,0,90),[0,1]);near(x,1);near(z,0);
});
test('坐标：转 180° 后，本地正面指向世界南（-Z）',()=>{
 const [x,z]=M.localToWorld(obj('desk',1,0,0,180),[0,1]);near(x,0);near(z,-1);
});
test('坐标：转 45° 的本地 (1,1) 在世界里落在正西偏…√2 处',()=>{
 const [x,z]=M.localToWorld(obj('desk',1,0,0,45),[1,1]);near(x,Math.SQRT2);near(z,0);
});
test('坐标：本地→世界→本地来回一致（任意旋转、平移）',()=>{
 for(const r of [0,30,45,90,135,200,-70]){const o=obj('desk',1,3.3,-2.2,r);const w=M.localToWorld(o,[.7,-1.3]);const l=M.worldToLocal(o,w);near(l[0],.7);near(l[1],-1.3);}
});
test('坐标：站位跟着物料走（物料平移后站位世界坐标同步平移）',()=>{
 const p=poi('p1',1,1,{stand:[0,1.5]});const a=M.poiWorldStand(p,obj('desk',1,0,0));const b=M.poiWorldStand(p,obj('desk',1,2,-1));
 near(b[0]-a[0],2);near(b[1]-a[1],-1);
});

// ---- 默认站位 ----
test('默认站位：正面（本地 +Z）外侧，距占地边缘 1.0m',()=>{
 const s=M.defaultStand(obj('desk',1,0,0,0,[1.6,1,.65]));
 assert.equal(s.side,'front');near(s.stand[0],0);near(s.stand[1],.65/2+1);assert.equal(s.blocked,false);
});
test('默认站位：正面不可走就依次试 左→右→背面',()=>{
 const o=obj('desk',1,0,0,0,[2,1,1]);
 const front=M.localToWorld(o,[0,1.5]);
 let s=M.defaultStand(o,(x,z)=>Math.hypot(x-front[0],z-front[1])>.2);assert.equal(s.side,'left');
 const left=M.localToWorld(o,[-2,0]);
 s=M.defaultStand(o,(x,z)=>Math.hypot(x-front[0],z-front[1])>.2&&Math.hypot(x-left[0],z-left[1])>.2);assert.equal(s.side,'right');
 const right=M.localToWorld(o,[2,0]);
 s=M.defaultStand(o,(x,z)=>[front,left,right].every(q=>Math.hypot(x-q[0],z-q[1])>.2));assert.equal(s.side,'back');near(s.stand[1],-1.5);
});
test('默认站位：四面都不行就放正面并标记 blocked',()=>{
 const s=M.defaultStand(obj('desk',1,0,0),()=>false);assert.equal(s.side,'front');assert.equal(s.blocked,true);
});
test('默认站位：旋转物料的站位按世界坐标判断可走',()=>{
 const o=obj('desk',1,0,0,90,[1,1,1]);const seen=[];M.defaultStand(o,(x,z)=>{seen.push([x,z]);return true;});
 near(seen[0][0],1.5);near(seen[0][1],0);
});

// ---- 编号与 id ----
test('编号：从 1 开始，取最大值 +1',()=>{
 assert.equal(M.nextNum(M.emptyTour()),1);
 assert.equal(M.nextNum({pois:[poi('a',1,1),poi('b',2,2)],groups:[]}),3);
});
test('编号：删除不重排（删了 2 号，新建拿 4 号，不是 2）',()=>{
 const t={pois:[poi('a',1,1),poi('b',2,2),poi('c',3,3)],groups:[]};
 t.pois=t.pois.filter(p=>p.num!==2);assert.deepEqual(t.pois.map(p=>p.num),[1,3]);assert.equal(M.nextNum(t),4);
 t.pois=t.pois.filter(p=>p.num!==3);assert.equal(M.nextNum(t),2);
});
test('id：新 id 不与已有重复，1000 个也不重',()=>{
 const taken=new Set();for(let i=0;i<1000;i++){const id=M.newId('p',taken);assert.ok(!taken.has(id));assert.equal(typeof id,'string');taken.add(id);}
 const t=new Set(['p1','p2']);assert.ok(!t.has(M.newId('p',t)));
});
test('兴趣点：makePoi 取新编号、默认停留 5 秒、默认名',()=>{
 const t={pois:[poi('a',1,7)],groups:[]};const p=M.makePoi(t,obj('desk',5,0,0),{name:'前台'});
 assert.equal(p.num,8);assert.equal(p.dwell,5);assert.equal(p.name,'前台');assert.equal(p.objectId,5);assert.deepEqual(p.stand,[0,.5+1]);
 assert.ok(!t.pois.some(q=>q.id===p.id));
});

// ---- 失效判断 ----
test('失效：物料被删除→站失效；撤销（物料回来）→恢复',()=>{
 const t=goodTour();const stop=t.groups[0].routes[0].stops[1];
 assert.equal(M.staleReason(t,stop,[obj('desk',1,0,0),obj('tv',2,1,1)]),null);
 assert.equal(M.staleReason(t,stop,[obj('tv',2,1,1)]),'object-missing');
 assert.equal(M.staleReason(t,stop,[obj('desk',1,0,0),obj('tv',2,1,1)]),null);
});
test('失效：物料隐藏→失效（hidden 或 visible:false 都算）',()=>{
 const t=goodTour();const stop=t.groups[0].routes[0].stops[1];
 assert.equal(M.staleReason(t,stop,[obj('desk',1,0,0,0,[1,1,1],{hidden:true})]),'object-hidden');
 assert.equal(M.staleReason(t,stop,[obj('desk',1,0,0,0,[1,1,1],{visible:false})]),'object-hidden');
});
test('失效：兴趣点被取消（从 pois 移除）→站失效，站本身不被删',()=>{
 const t=goodTour();const stop=t.groups[0].routes[0].stops[1];t.pois=t.pois.filter(p=>p.id!=='p1');
 assert.equal(M.staleReason(t,stop,[obj('desk',1,0,0)]),'poi-removed');assert.equal(t.groups[0].routes[0].stops.length,2);
});
test('停留：站自带 dwell 优先，否则取兴趣点默认',()=>{
 const t=goodTour();const [a,b]=t.groups[0].routes[0].stops;
 assert.equal(M.stopDwell(t,a),5);assert.equal(M.stopDwell(t,b),8);
 assert.equal(M.stopDwell(t,{poiId:'nope'}),0);
});
test('复制物料不带兴趣点：新物料 id 没有对应兴趣点',()=>{
 const t=goodTour();assert.ok(t.pois.some(p=>p.objectId===1));assert.ok(!t.pois.some(p=>p.objectId===99));
});
test('复制方案：cloneTour 深拷贝，改副本不串改原件',()=>{
 const t=goodTour();const c=M.cloneTour(t);c.pois[0].name='改了';c.groups[0].routes[0].stops.push({poiId:'p1'});c.groups[0].entry[0]=99;
 assert.equal(t.pois[0].name,'展品1');assert.equal(t.groups[0].routes[0].stops.length,2);assert.equal(t.groups[0].entry[0],-6);
});

// ---- 默认入口出口 ----
test('入口出口：北过道·东→西 入口在东（-X）出口在西（+X），都在北过道里',()=>{
 const v=venueFor(room),n=room.depth/2;const {entry,exit}=M.defaultEntryExit('north-ew',room,v);
 assert.ok(entry[0]<-room.width/2);assert.ok(exit[0]>room.width/2);
 for(const p of [entry,exit]){assert.ok(p[1]>n&&p[1]<n+v.aisleZ);}
});
test('入口出口：北过道·西→东 与 东→西 方向相反',()=>{
 const a=M.defaultEntryExit('north-ew',room,venueFor(room)),b=M.defaultEntryExit('north-we',room,venueFor(room));
 assert.deepEqual(a.entry,b.exit);assert.deepEqual(a.exit,b.entry);
});
test('入口出口：西过道·南→北 入口在南（-Z）出口在北（+Z），都在西过道里',()=>{
 const v=venueFor(room),w=room.width/2;const {entry,exit}=M.defaultEntryExit('west-sn',room,v);
 assert.ok(entry[1]<exit[1]);for(const p of [entry,exit])assert.ok(p[0]>w&&p[0]<w+v.aisleX);
});
test('入口出口：西过道·北→南 反向；其他来向也给出有限数字',()=>{
 const a=M.defaultEntryExit('west-sn',room,venueFor(room)),b=M.defaultEntryExit('west-ns',room,venueFor(room));
 assert.deepEqual(a.entry,b.exit);
 const o=M.defaultEntryExit('other',room,venueFor(room));assert.ok([...o.entry,...o.exit].every(Number.isFinite));
});

// ---- 校验 ----
test('校验：合法数据通过，且返回的是新对象（不是原引用）',()=>{
 const raw=goodTour();const r=M.validateTour(raw);assert.equal(r.ok,true);assert.deepEqual(r.tour,raw);assert.notEqual(r.tour,raw);assert.notEqual(r.tour.pois[0],raw.pois[0]);
});
test('校验：空 tour 合法',()=>{assert.equal(M.validateTour(M.emptyTour()).ok,true);});
test('校验：未知多余字段被丢弃，缺省 dwell/speed/eyeHeight 补默认',()=>{
 const raw=goodTour();raw.junk=1;raw.pois[0].evil='x';delete raw.groups[0].routes[0].speed;delete raw.groups[0].routes[0].eyeHeight;
 const r=M.validateTour(raw);assert.equal(r.ok,true);assert.equal(r.tour.junk,undefined);assert.equal(r.tour.pois[0].evil,undefined);assert.equal(r.tour.groups[0].routes[0].speed,1);assert.equal(r.tour.groups[0].routes[0].eyeHeight,1.75);
});
test('校验：坏数据一律返回 {ok:false,error}，不抛异常，也不带半成品',()=>{
 const bad=[null,undefined,5,'x',[],{},{pois:'a',groups:[]},{pois:[],groups:null}];
 const mut=fn=>{const t=goodTour();fn(t);return t;};
 bad.push(
  mut(t=>t.pois[0].id=7),mut(t=>t.pois[1].id='p1'),mut(t=>t.pois[0].objectId=0),mut(t=>t.pois[0].objectId=1.5),
  mut(t=>t.pois[0].num=0),mut(t=>t.pois[0].dwell=-1),mut(t=>t.pois[0].dwell=NaN),mut(t=>t.pois[0].dwell=Infinity),
  mut(t=>t.pois[0].stand=[1]),mut(t=>t.pois[0].stand=[NaN,0]),mut(t=>t.pois[0].stand=['a','b']),mut(t=>t.pois[0].name=5),
  mut(t=>t.groups[0].approach='moon'),mut(t=>t.groups[0].entry=[0]),mut(t=>t.groups[0].exit=[0,Infinity]),mut(t=>t.groups[0].id=''),
  mut(t=>t.groups.push({...t.groups[0]})),
  mut(t=>t.groups[0].routes[0].speed=0),mut(t=>t.groups[0].routes[0].speed=-1),mut(t=>t.groups[0].routes[0].eyeHeight=NaN),
  mut(t=>t.groups[0].routes[0].stops=[{}]),mut(t=>t.groups[0].routes[0].stops=[{poiId:'p1',dwell:-2}]),mut(t=>t.groups[0].routes[0].stops='x'),
  mut(t=>t.groups[0].routes.push({...t.groups[0].routes[0]})));
 for(const b of bad){let r;assert.doesNotThrow(()=>{r=M.validateTour(b);},JSON.stringify(b));assert.equal(r.ok,false,JSON.stringify(b));assert.equal(typeof r.error,'string');assert.equal(r.tour,undefined);}
});
test('校验：数量上限 pois≤100 groups≤20 routes≤30 stops≤50（恰好上限通过，超一个被拒）',()=>{
 const mkPois=n=>Array.from({length:n},(_,i)=>poi('p'+i,i+1,i+1));
 const mkGroup=(i,routes)=>({id:'g'+i,name:'g',approach:'other',entry:[0,0],exit:[1,1],routes});
 const mkRoute=(i,stops)=>({id:'r'+i,name:'r',speed:1,eyeHeight:1.75,stops});
 assert.equal(M.validateTour({pois:mkPois(100),groups:[]}).ok,true);assert.equal(M.validateTour({pois:mkPois(101),groups:[]}).ok,false);
 const gs=n=>Array.from({length:n},(_,i)=>mkGroup(i,[]));
 assert.equal(M.validateTour({pois:[],groups:gs(20)}).ok,true);assert.equal(M.validateTour({pois:[],groups:gs(21)}).ok,false);
 const rs=n=>Array.from({length:n},(_,i)=>mkRoute(i,[]));
 assert.equal(M.validateTour({pois:[],groups:[mkGroup(0,rs(30))]}).ok,true);assert.equal(M.validateTour({pois:[],groups:[mkGroup(0,rs(31))]}).ok,false);
 const ss=n=>Array.from({length:n},()=>({poiId:'x'}));
 assert.equal(M.validateTour({pois:[],groups:[mkGroup(0,[mkRoute(0,ss(50))])]}).ok,true);assert.equal(M.validateTour({pois:[],groups:[mkGroup(0,[mkRoute(0,ss(51))])]}).ok,false);
});
test('校验：站引用已不存在的兴趣点是允许的（标失效，不拒绝）',()=>{
 const t=goodTour();t.groups[0].routes[0].stops.push({poiId:'已删除'});assert.equal(M.validateTour(t).ok,true);
});
test('校验：JSON 来回一次后仍合法且相等',()=>{
 const raw=goodTour();const r=M.validateTour(JSON.parse(JSON.stringify(raw)));assert.equal(r.ok,true);assert.deepEqual(r.tour,raw);
});

let failed=0;
for(const [name,fn] of tests){try{fn();console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,'\n   ',e.message.split('\n')[0]);}}
console.log(`\n${tests.length-failed}/${tests.length} 通过`);process.exit(failed?1:0);
