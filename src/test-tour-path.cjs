// Pure-logic tests for tour-path.js (no browser). Run: node src/test-tour-path.cjs
const assert=require('node:assert/strict');
const P=require('./tour-path.js');
const M=require('./tour-model.js');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const deg=d=>d*Math.PI/180;
const R=.3;
const room={width:6.1,depth:5.5,wallA:true,wallB:true};
const W=room.width/2,N=room.depth/2;
const venueFor=r=>{const sx=r.width/67,sz=r.depth/60,north=r.depth/2,west=r.width/2,aisleX=20*.3048,aisleZ=12*.3048,rightW=199*sx,rightD=133*sz,creatorD=368*sz,creatorSouth=north+aisleZ,creatorNorth=creatorSouth+creatorD,leftX=west+aisleX,leftW=269*sx;return {bounds:{minX:west-rightW,maxX:leftX+leftW,minZ:north-rightD,maxZ:creatorNorth+34*sz},aisleX,aisleZ};};
const venue=venueFor(room);
const sizes={tv:[1.218,.685,.09],desk:[1.6,1,.65],robot:[.65,1.5,.5],display:[.6,1.5,.45],table:[.65,.75,.65],ldesk:[2.2,1,1.6],fascia:[3,.6,3],laptop:[.34,.24,.25],webcam:[.1,.08,.06],acrylic:[.21,.15,.07],acrylicA4:[.21,.297,.07],acrylicA5:[.1485,.21,.07],rollup:[.84,2.08,.35],chair:[.46,.82,.5],staff:[.55,1.75,.35],visitor:[.55,1.75,.35]};
let nid=1;
const obj=(type,x,z,rotDeg=0,extra={})=>({type,id:nid++,size:[...sizes[type]],position:[x,0,z],rotation:deg(rotDeg),...(type==='ldesk'?{lengthA:2.2,widthA:.6,lengthB:1.6,widthB:.55}:{}),...extra});
const nav=(objects,r=room)=>P.buildNav(objects,r,venueFor(r));

// ---- independent checker (does not use tour-path) ----
function rectDist(px,pz,cx,cz,rot,hx,hz){ // distance from point to a rotated rectangle (0 inside)
 const c=Math.cos(rot),s=Math.sin(rot),dx=px-cx,dz=pz-cz,lx=dx*c-dz*s,lz=dx*s+dz*c;
 return Math.hypot(Math.max(Math.abs(lx)-hx,0),Math.max(Math.abs(lz)-hz,0));
}
function localRect(o,x0,x1,z0,z1,px,pz){const [wx,wz]=M.localToWorld(o,[(x0+x1)/2,(z0+z1)/2]);return rectDist(px,pz,wx,wz,o.rotation,(x1-x0)/2,(z1-z0)/2);}
const SKIP=new Set(['fascia','laptop','webcam','acrylic','acrylicA4','acrylicA5']);
function clearance(objects,r,px,pz){ // min distance from a point to any obstacle
 let m=Infinity;
 for(const o of objects){
  if(SKIP.has(o.type)||o.visible===false||o.hidden)continue;
  if(o.type==='table')m=Math.min(m,Math.max(0,Math.hypot(px-o.position[0],pz-o.position[2])-o.size[0]/2));
  else if(o.type==='staff'||o.type==='visitor')m=Math.min(m,Math.max(0,Math.hypot(px-o.position[0],pz-o.position[2])-.3));
  else if(o.type==='ldesk'){const a=o.lengthA,wa=o.widthA,b=o.lengthB,wb=o.widthB;
   m=Math.min(m,localRect(o,-a/2,a/2,-b/2,-b/2+wa,px,pz),localRect(o,-a/2,-a/2+wb,-b/2,b/2,px,pz));}
  else m=Math.min(m,localRect(o,-o.size[0]/2,o.size[0]/2,-o.size[2]/2,o.size[2]/2,px,pz));
 }
 const w=r.width/2,d=r.depth/2;
 if(r.wallA)m=Math.min(m,rectDist(px,pz,-w-.06,0,0,.06,d));
 if(r.wallB)m=Math.min(m,rectDist(px,pz,0,-d-.06,0,w+.06,.06));
 return m;
}
function inRegion(v,r,x,z){
 const w=r.width/2,n=r.depth/2,e=1e-9,b=v.bounds;
 const box=(x0,x1,z0,z1)=>x>=x0-e&&x<=x1+e&&z>=z0-e&&z<=z1+e;
 return box(-w,w,-n,n)||box(b.minX,w+v.aisleX,n,n+v.aisleZ)||box(w,w+v.aisleX,b.minZ,b.maxZ);
}
// every sample along the polyline must be ≥0.3 from every obstacle and inside the walkable region
function assertPathValid(points,objects,r=room,label=''){
 const v=venueFor(r);
 for(let i=0;i<points.length-1;i++){
  const [ax,az]=points[i],[bx,bz]=points[i+1],len=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(len/.02));
  for(let k=0;k<=n;k++){const x=ax+(bx-ax)*k/n,z=az+(bz-az)*k/n;
   const c=clearance(objects,r,x,z);assert.ok(c>=R-1e-6,`${label} 第${i}段 (${x.toFixed(2)},${z.toFixed(2)}) 离障碍只有 ${c.toFixed(3)}m`);
   assert.ok(inRegion(v,r,x,z),`${label} (${x.toFixed(2)},${z.toFixed(2)}) 走出了能走区域`);}
 }
}
const pathLen=pts=>pts.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1]),0);
const plan1=(objects,a,b,r=room)=>{const res=P.planRoute(nav(objects,r),a,[],b);assert.equal(res.segments.length,1);return res.segments[0];};

// ---- 区域与坐标 ----
test('区域：北 +Z 的过道能走，南 -Z 的隔壁展位不能走',()=>{
 const n=nav([]);assert.equal(n.isWalkable(0,N+1.8),true);assert.equal(n.isWalkable(0,-N-1.5),false);
});
test('区域：西 +X 的过道能走，东 -X 的隔壁展位不能走',()=>{
 const n=nav([]);assert.equal(n.isWalkable(W+3,0),true);assert.equal(n.isWalkable(-W-1.5,0),false);
});
test('区域：展台里面能走，创客空间（过道对面）不能走',()=>{
 const n=nav([]);assert.equal(n.isWalkable(0,0),true);assert.equal(n.isWalkable(0,N+venue.aisleZ+2),false);
});
test('区域：离能走区域边缘不足 0.3m 的点不能走（人有身宽）',()=>{
 const n=nav([]);assert.equal(n.isWalkable(0,N+venue.aisleZ-.2),false);assert.equal(n.isWalkable(0,N+venue.aisleZ-.4),true);
});
test('区域：默认入口出口（4 种来向 × 几种展台尺寸）都落在能走区域内',()=>{
 for(const [w,d] of [[6.1,5.5],[3,3],[9,6],[12,8]]){const r={width:w,depth:d,wallA:true,wallB:true};const n=P.buildNav([],r,venueFor(r));
  for(const ap of M.APPROACHES){const {entry,exit}=M.defaultEntryExit(ap,r,venueFor(r));assert.equal(n.isWalkable(...entry),true,`${ap} ${w}x${d} 入口`);assert.equal(n.isWalkable(...exit),true,`${ap} ${w}x${d} 出口`);}}
});

// ---- 寻路 ----
test('直路：没有障碍时就是一条直线（2 个点）',()=>{
 const s=plan1([],[-2,0],[2,0]);assert.equal(s.ok,true);assert.deepEqual(s.points,[[-2,0],[2,0]]);
});
test('绕单个矩形：前台挡在正中，绕过去且保持 0.3m',()=>{
 const objs=[obj('desk',0,0)];const s=plan1(objs,[-2,0],[2,0]);
 assert.equal(s.ok,true);assert.ok(s.points.length>=3);assertPathValid(s.points,objs,room,'矩形');
 assert.ok(pathLen(s.points)<4+2,'绕路不该绕太远 '+pathLen(s.points));
});
test('绕旋转 45° 的矩形',()=>{
 const objs=[obj('desk',0,0,45,{size:[2.4,1,.5]})];const s=plan1(objs,[-2,-.6],[2,.6]);
 assert.equal(s.ok,true);assertPathValid(s.points,objs,room,'45°矩形');assert.ok(s.points.length>=3);
});
test('不切角：斜边物品的角，路径始终离它 ≥0.3m（逐点复检）',()=>{
 for(const rot of [20,45,70]){const objs=[obj('desk',0,0,rot,{size:[1.8,1,.7]})];const s=plan1(objs,[-2.2,-.9],[2.2,.9]);
  assert.equal(s.ok,true);assertPathValid(s.points,objs,room,'转'+rot+'°');}
});
test('绕圆桌：按真实圆形，不是方块',()=>{
 const objs=[obj('table',0,0,0,{size:[1.2,.75,1.2]})];
 const s=plan1(objs,[-2,0],[2,0]);assert.equal(s.ok,true);assertPathValid(s.points,objs,room,'圆桌');
 // 圆半径 .6 + 身宽 .3 = .9。(.7,.7) 离圆心 .99 → 能走；若当成方块(半宽 .6+.3=.9)就会被挡
 const n=nav(objs);assert.equal(n.isWalkable(.7,.7),true,'斜角处应能走（圆，不是方块）');
 assert.equal(n.isWalkable(.6,.6),false);assert.equal(n.isWalkable(0,.85),false);assert.equal(n.isWalkable(0,.95),true);
});
test('绕 L 台：按真实形状，缺角里可以站人',()=>{
 const l=obj('ldesk',0,0,0);const n=nav([l]);
 const inside=M.localToWorld(l,[.5,.6]);   // 缺角里：离两条边都 >0.3m
 assert.equal(n.isWalkable(...inside),true,'缺角里应能走');
 const onBar=M.localToWorld(l,[0,-.5]);assert.equal(n.isWalkable(...onBar),false);
 const s=plan1([l],M.localToWorld(l,[1.8,.6]),M.localToWorld(l,[-1.8,.6]));assert.equal(s.ok,true);assertPathValid(s.points,[l],room,'L台');
 const t=plan1([l],inside,M.localToWorld(l,[1.8,.6]));assert.equal(t.ok,true);assertPathValid(t.points,[l],room,'出缺角');
});
test('绕 L 台：旋转 90° 后依然按真实形状',()=>{
 const l=obj('ldesk',0,0,90);const n=nav([l]);
 assert.equal(n.isWalkable(...M.localToWorld(l,[.5,.6])),true);assert.equal(n.isWalkable(...M.localToWorld(l,[0,-.5])),false);
 const s=plan1([l],[-2.5,-.5],[2.5,.5]);assert.equal(s.ok,true);assertPathValid(s.points,[l],room,'L台90');
});
// 西过道里 z=10 处：两侧都是能走区域之外，只能从两个前台中间的缝过
const slit=gap=>{const x1=5.0,x2=x1+gap;return [obj('desk',(2.5+x1)/2,10,0,{size:[x1-2.5,1,.5]}),obj('desk',(x2+10)/2,10,0,{size:[10-x2,1,.5]})];};
test('窄缝 0.5m：人宽 0.6 走不过，报走不通，并指出挡住的物品',()=>{
 const objs=slit(.5);const s=plan1(objs,[5.3,8],[5.3,12]);
 assert.equal(s.ok,false);assert.equal(s.reason,'unreachable');assert.equal(s.blockedBy,'前台');assert.equal(s.points.length,2);
});
test('窄缝 0.7m：有 0.1m 余量，能过',()=>{
 const objs=slit(.7);const s=plan1(objs,[5.3,8],[5.3,12]);
 assert.equal(s.ok,true);assertPathValid(s.points,objs,room,'0.7缝');
});
test('窄缝：0.7m 的缝不在格子线上也要能过（斜着绕再回到缝中心）',()=>{
 const objs=slit(.7);const s=plan1(objs,[4.0,8],[6.5,12]);assert.equal(s.ok,true);assertPathValid(s.points,objs,room,'0.7缝斜');
});
test('站位在障碍里：单独报，指出是哪件物品；相邻两段都标走不通',()=>{
 const objs=[obj('desk',0,0)];const n=nav(objs);
 const res=P.planRoute(n,[-2,2],[[0,.1],[2,2]],[2,-2]);
 assert.equal(res.ok,false);assert.deepEqual(res.standIssues.map(s=>s.index),[0]);assert.equal(res.standIssues[0].blockedBy,'前台');
 assert.equal(res.segments[0].ok,false);assert.equal(res.segments[0].reason,'stand-blocked');assert.equal(res.segments[1].ok,false);assert.equal(res.segments[2].ok,true);
});
test('站位在能走区域外：单独报，blockedBy 为空',()=>{
 const res=P.planRoute(nav([]),[-2,2],[[-5,0]],[2,2]);
 assert.equal(res.standIssues.length,1);assert.equal(res.standIssues[0].blockedBy,null);
});
test('入口在能走区域外：报入口不可走',()=>{
 const res=P.planRoute(nav([]),[-W-2,-N-2],[],[0,N+1.8]);
 assert.equal(res.entryOk,false);assert.equal(res.ok,false);assert.equal(res.segments[0].reason,'entry-blocked');
});
test('出口在障碍里：报出口不可走',()=>{
 const res=P.planRoute(nav([obj('desk',0,0)]),[0,N+1.8],[],[0,0]);
 assert.equal(res.exitOk,false);assert.equal(res.segments[0].reason,'exit-blocked');
});
test('拉直：绕一个物品的路径只有几个拐点，没有多余的小折',()=>{
 const objs=[obj('desk',0,0)];const s=plan1(objs,[-2,0],[2,0]);assert.ok(s.points.length<=4,'点数 '+s.points.length);
});
test('拉直：相邻三点的首尾若能直连就不应该保留中间点',()=>{
 const objs=[obj('desk',0,0),obj('table',1.5,-1.5,0,{size:[.8,.75,.8]}),obj('ldesk',-1.5,1.5,30)];
 const s=plan1(objs,[-2.6,-2],[2.6,2]);assert.equal(s.ok,true);assertPathValid(s.points,objs,room,'多物品');
 const n=nav(objs);for(let i=1;i<s.points.length-1;i++)assert.equal(n.segmentClear(s.points[i-1],s.points[i+1]),false,`第 ${i} 个点是多余的`);
});
test('不挡路：悬空吊楣、桌上小件（笔记本/摄像头/亚克力牌）',()=>{
 const objs=[obj('fascia',0,0),obj('laptop',0,0),obj('webcam',.5,0),obj('acrylic',-.5,0),obj('acrylicA4',0,.3),obj('acrylicA5',0,-.3)];
 const s=plan1(objs,[-2,0],[2,0]);assert.deepEqual(s.points,[[-2,0],[2,0]]);
});
test('不挡路：隐藏的物品（visible:false 或 hidden:true）',()=>{
 for(const flag of [{visible:false},{hidden:true}]){const s=plan1([obj('desk',0,0,0,flag)],[-2,0],[2,0]);assert.deepEqual(s.points,[[-2,0],[2,0]]);}
});
test('墙：可见的 A/B 墙是障碍物（有名字），隐藏的不进障碍表',()=>{
 const names=r=>P.obstacleShapes([],r).map(s=>s.name);
 assert.deepEqual(names(room).sort(),['A 墙','B 墙']);
 assert.deepEqual(names({...room,wallA:false}),['B 墙']);assert.deepEqual(names({...room,wallA:false,wallB:false}),[]);
 const n=nav([]);assert.equal(n.isWalkable(-W+.1,0),false);   // 贴着 A 墙站不下
});
test('墙：寻路报“被墙挡住”时用墙的名字',()=>{
 const n=nav([obj('desk',0,0)]);const res=P.planRoute(n,[-2,0],[[-W+.1,0]],[2,0]);
 assert.equal(res.standIssues[0].blockedBy,'A 墙');
});
test('人物（工作人员/游客摆件）是半径 0.3 的圆，外加身宽 0.3',()=>{
 const n=nav([obj('staff',0,0)]);assert.equal(n.isWalkable(.55,0),false);assert.equal(n.isWalkable(.65,0),true);
});
test('物品很多时仍然正确：12 件随机摆放，所有成功的路线逐点复检',()=>{
 let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const types=['desk','table','tv','robot','chair','ldesk','rollup','staff'];
 const objs=Array.from({length:12},()=>obj(types[Math.floor(rnd()*types.length)],(rnd()-.5)*5,(rnd()-.5)*4.4,Math.floor(rnd()*8)*45));
 const n=nav(objs);let okCount=0,tried=0;
 for(let i=0;i<60&&okCount<20;i++){const a=[(rnd()-.5)*5,N+1.8],b=[(rnd()-.5)*5,(rnd()-.5)*4.4];if(!n.isWalkable(...b))continue;tried++;
  const res=P.planRoute(n,a,[],b);
  if(res.segments[0].ok){okCount++;assertPathValid(res.segments[0].points,objs,room,'随机'+i);}}
 assert.ok(okCount>=10,`成功条数 ${okCount}/${tried}`);
});
test('默认站位与寻路联动：正面朝墙的前台，站位自动换到别的面',()=>{
 const d=obj('desk',0,-N+.6,180);const n=nav([d]);   // 正面（本地+Z）朝南，被 B 墙挡
 const s=M.defaultStand(d,n.isWalkable);assert.notEqual(s.side,'front');assert.equal(s.blocked,false);
 const w=M.localToWorld(d,s.stand);assert.equal(n.isWalkable(...w),true);
});
test('segmentClear：穿过障碍的线段为 false，贴着但够 0.3m 的为 true',()=>{
 const n=nav([obj('desk',0,0)]);assert.equal(n.segmentClear([-2,0],[2,0]),false);
 assert.equal(n.segmentClear([-2,.33+.325],[2,.33+.325]),true);   // 前台半深 .325 + .3 = .625；.655 够
 assert.equal(n.segmentClear([-2,.5],[2,.5]),false);
});
test('零长度段（站位就在入口）：直接成功',()=>{
 const s=plan1([],[0,0],[0,0]);assert.equal(s.ok,true);assert.deepEqual(s.points,[[0,0]]);
});
test('整条路线：入口→站位→出口，各段首尾衔接，ok 才为真',()=>{
 const objs=[obj('desk',0,0)];const n=nav(objs);
 const entry=[-W-3,N+1.8],exit=[W+3,N+1.8],stands=[[-1.5,1.5],[1.5,-1.5]];
 const res=P.planRoute(n,entry,stands,exit);assert.equal(res.ok,true);assert.equal(res.segments.length,3);
 const nodes=[entry,...stands,exit];res.segments.forEach((s,i)=>{assert.deepEqual(s.points[0],nodes[i]);assert.deepEqual(s.points[s.points.length-1],nodes[i+1]);assertPathValid(s.points,objs,room,'整线'+i);});
});

// ---- 性能：20 个兴趣点、10 条路线全部重算 ----
test('性能：20 个兴趣点、10 条路线（含建图）全部重算 < 200ms',()=>{
 let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const types=['desk','table','tv','robot','chair','ldesk','rollup','staff','visitor','display'];
 const objs=Array.from({length:24},()=>obj(types[Math.floor(rnd()*types.length)],(rnd()-.5)*5.2,(rnd()-.5)*4.6,Math.floor(rnd()*8)*45));
 const {entry,exit}=M.defaultEntryExit('north-ew',room,venue);
 const run=()=>{
  const n=nav(objs);const stands=[];
  for(const o of objs){if(stands.length>=20)break;const s=M.defaultStand(o,n.isWalkable);if(!s.blocked)stands.push(M.localToWorld(o,s.stand));}
  while(stands.length<20){const p=[(rnd()-.5)*5,(rnd()-.5)*4.4];if(n.isWalkable(...p))stands.push(p);}
  let segs=0,bad=0;
  for(let r=0;r<10;r++){const order=[];for(let i=0;i<8;i++)order.push(stands[Math.floor(rnd()*20)]);const res=P.planRoute(n,entry,order,exit);segs+=res.segments.length;bad+=res.segments.filter(s=>!s.ok).length;}
  return {segs,bad};
 };
 const times=[];let info;for(let k=0;k<5;k++){const t0=process.hrtime.bigint();info=run();times.push(Number(process.hrtime.bigint()-t0)/1e6);}
 const cold=times[0],worst=Math.max(...times),med=[...times].sort((a,b)=>a-b)[2];
 const t1=process.hrtime.bigint();nav(objs);const build=Number(process.hrtime.bigint()-t1)/1e6;
 console.log(`    实测：20 兴趣点 / 10 条路线 / ${info.segs} 段（其中 ${info.bad} 段走不通）全部重算（含建图）：首次 ${cold.toFixed(1)} ms，5 次最慢 ${worst.toFixed(1)} ms，中位 ${med.toFixed(1)} ms；单独建图约 ${build.toFixed(1)} ms`);
 assert.ok(worst<200,'最慢 '+worst.toFixed(1)+'ms');
 assert.ok(info.segs-info.bad>=30,'要有足够多的真实寻路段：成功 '+(info.segs-info.bad));
});

let failed=0;
for(const [name,fn] of tests){try{fn();console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,'\n   ',e.message.split('\n')[0]);}}
console.log(`\n${tests.length-failed}/${tests.length} 通过`);process.exit(failed?1:0);
