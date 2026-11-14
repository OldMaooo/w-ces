// Pure-logic tests for tour-timeline.js (no browser). Run: node src/test-tour-timeline.cjs
const assert=require('node:assert/strict');
const T=require('./tour-timeline.js');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
const V=T.WALK_SPEED;   // 米/秒（走速 1.0 时）
const deepFreeze=o=>{Object.values(o).forEach(v=>{if(v&&typeof v==='object')deepFreeze(v);});return Object.freeze(o);};
// yaw 约定：0 = 朝北(+Z)，π/2 = 朝西(+X)，-π/2 = 朝东(-X)
const straight=(len=10)=>[[[0,0],[0,len]]];

test('起止：位置、朝向、阶段、剩余时间',()=>{
 const c=T.compileRoute(straight(10),[],[],1);near(c.total,10/V);
 let s=T.sampleRoute(c,0);near(s.x,0);near(s.z,0);near(s.bodyYaw,0);assert.equal(s.phase,'walk');near(s.remaining,10/V);assert.equal(s.stopIndex,-1);
 s=T.sampleRoute(c,c.total/2);near(s.z,5);
 s=T.sampleRoute(c,c.total);near(s.z,10);assert.equal(s.phase,'done');near(s.remaining,0);
});
test('起止：时间越界会夹到 [0,total]',()=>{
 const c=T.compileRoute(straight(10),[],[],1);
 assert.deepEqual(T.sampleRoute(c,-5),T.sampleRoute(c,0));assert.deepEqual(T.sampleRoute(c,1e6),T.sampleRoute(c,c.total));
});
test('走向：往东（-X）走 yaw=-π/2，往西（+X）走 yaw=+π/2，往南（-Z）走 yaw=π',()=>{
 const yawOf=pts=>T.sampleRoute(T.compileRoute([pts],[],[],1),0).bodyYaw;
 near(yawOf([[0,0],[-5,0]]),-Math.PI/2);near(yawOf([[0,0],[5,0]]),Math.PI/2);near(Math.abs(yawOf([[0,0],[0,-5]])),Math.PI);
});
test('零长度：重复点、单点腿、空路线都不出 NaN',()=>{
 const c=T.compileRoute([[[0,0],[0,0],[0,4],[0,4]]],[],[],1);near(c.total,4/V);
 for(const t of [0,1,c.total]){const s=T.sampleRoute(c,t);assert.ok([s.x,s.z,s.bodyYaw,s.lookYaw,s.remaining].every(Number.isFinite));}
 const d=T.compileRoute([[[3,3]]],[],[],1);near(d.total,0);const s=T.sampleRoute(d,0);near(s.x,3);near(s.z,3);assert.equal(s.phase,'done');
 const e=T.compileRoute([[[0,0]],[[0,0]]],[2],[null],1);near(e.total,2);
});
test('停留：到站后原地不动 dwell 秒，阶段 hold，stopIndex 对',()=>{
 const legs=[[[0,0],[0,6]],[[0,6],[0,12]]];const c=T.compileRoute(legs,[5],[null],1);
 near(c.total,12/V+5);near(c.stops[0].t0,6/V);near(c.stops[0].t1,6/V+5);
 for(const dt of [0,2.5,4.99]){const s=T.sampleRoute(c,6/V+dt);near(s.z,6);assert.equal(s.phase,'hold');assert.equal(s.stopIndex,0);near(s.remaining,c.total-(6/V+dt));}
 let s=T.sampleRoute(c,6/V+5+1/V);near(s.z,7,1e-6);assert.equal(s.phase,'walk');assert.equal(s.stopIndex,-1);
});
test('停留 0 秒：站仍然记录，但没有 hold 段',()=>{
 const c=T.compileRoute([[[0,0],[0,6]],[[0,6],[0,12]]],[0],[null],1);near(c.total,12/V);assert.equal(c.stops.length,1);near(c.stops[0].t0,c.stops[0].t1);
});
test('停留时看向目标：身体和视线转向物品，俯仰按眼高算',()=>{
 const c=T.compileRoute([[[0,0],[0,6]],[[0,6],[0,12]]],[5],[{x:3,z:6,y:1.2}],1);
 const mid=c.stops[0].t1-2;const s=T.sampleRoute(c,mid,1.75);
 assert.equal(s.phase,'hold');near(s.lookYaw,Math.PI/2);near(s.bodyYaw,Math.PI/2);near(s.lookPitch,Math.atan2(1.2-1.75,3));
 const s2=T.sampleRoute(c,mid);near(s2.lookPitch,Math.atan2(1.2-T.DEFAULT_EYE_HEIGHT,3));
});
test('停留时看向目标：目标没有高度 → 俯仰为 0；不看目标 → 视线沿前进方向',()=>{
 const a=T.compileRoute([[[0,0],[0,6]],[[0,6],[0,12]]],[5],[{x:3,z:6}],1);near(T.sampleRoute(a,a.stops[0].t1-1).lookPitch,0);
 const b=T.compileRoute([[[0,0],[0,6]],[[0,6],[0,12]]],[5],[null],1);const s=T.sampleRoute(b,b.stops[0].t1-1);near(s.lookYaw,0);near(s.lookPitch,0);
});
test('到站转身：朝北走来、目标在东，先转 90°（约 0.4 秒）再停留，走时再转回去',()=>{
 const c=T.compileRoute([[[0,0],[0,6]],[[0,6],[0,12]]],[5],[{x:-3,z:6}],1);const a=c.stops[0].t0;
 let s=T.sampleRoute(c,a+.2);assert.equal(s.phase,'turn');assert.equal(s.stopIndex,0);near(s.x,0);near(s.z,6);near(s.bodyYaw,-Math.PI/4,1e-6);
 s=T.sampleRoute(c,a+.4+1);assert.equal(s.phase,'hold');near(s.bodyYaw,-Math.PI/2);
 s=T.sampleRoute(c,c.stops[0].t1+.2);assert.equal(s.phase,'turn');near(s.bodyYaw,-Math.PI/4,1e-6);
 s=T.sampleRoute(c,c.stops[0].t1+.4+.5);assert.equal(s.phase,'walk');near(s.bodyYaw,0);
});
test('拐角转身：90° 拐角原地转 0.4 秒；位置不动，朝向匀速转',()=>{
 const c=T.compileRoute([[[0,0],[0,5],[5,5]]],[],[],1);const t1=5/V;near(c.total,10/V+.4);
 let s=T.sampleRoute(c,t1+.2);assert.equal(s.phase,'turn');near(s.x,0);near(s.z,5);near(s.bodyYaw,Math.PI/4);
 s=T.sampleRoute(c,t1+.4+1/V);near(s.x,1);near(s.z,5);assert.equal(s.phase,'walk');near(s.bodyYaw,Math.PI/2);
});
test('拐角转身：时长和角度成正比（45° 约 0.2 秒，180° 约 0.8 秒），走最短的转法',()=>{
 const turnLen=pts=>{const c=T.compileRoute([pts],[],[],1);return c.total-c.walkTotal;};
 near(turnLen([[0,0],[0,5],[5,10]]),.2,1e-6);near(turnLen([[0,0],[0,5],[0,0]]),.8,1e-6);
 const c=T.compileRoute([[[0,0],[0,5],[-5,5]]],[],[],1);const s=T.sampleRoute(c,5/V+.2);near(s.bodyYaw,-Math.PI/4);   // 向东拐，yaw 往负方向转，不绕远路
});
test('往回拖：任意顺序采样，同一时刻结果完全一致',()=>{
 const c=T.compileRoute([[[0,0],[0,6],[4,6]],[[4,6],[4,12]]],[3],[{x:6,z:6,y:1}],1);
 const times=Array.from({length:60},(_,i)=>i*c.total/59);const fwd=times.map(t=>T.sampleRoute(c,t));
 const back=[...times].reverse().map(t=>T.sampleRoute(c,t)).reverse();assert.deepEqual(back,fwd);
 const shuffled=[...times.keys()].sort((a,b)=>(a*7919)%61-(b*7919)%61);for(const i of shuffled)assert.deepEqual(T.sampleRoute(c,times[i]),fwd[i]);
});
test('无副作用：采样前后 compiled 完全不变，冻结后也能采样',()=>{
 const c=T.compileRoute([[[0,0],[0,6]],[[0,6],[3,6]]],[2],[{x:3,z:9,y:1}],1);const before=JSON.stringify(c);
 for(let i=0;i<50;i++)T.sampleRoute(c,i*.37,1.7);assert.equal(JSON.stringify(c),before);
 deepFreeze(c);assert.doesNotThrow(()=>T.sampleRoute(c,3));
});
test('不改输入：compileRoute 不修改传入的折线和参数',()=>{
 const legs=[[[0,0],[0,6]],[[0,6],[0,12]]],look=[{x:3,z:6,y:1}];const before=JSON.stringify([legs,look]);T.compileRoute(legs,[5],look,1);assert.equal(JSON.stringify([legs,look]),before);
});
test('倍速（走速参数）：2 倍走速 → 走路时间减半，停留和转身时间不变',()=>{
 const legs=[[[0,0],[0,6]],[[0,6],[4,6]]];const a=T.compileRoute(legs,[5],[null],1),b=T.compileRoute(legs,[5],[null],2);
 near(b.walkTotal,a.walkTotal/2);near(b.total-b.walkTotal,a.total-a.walkTotal);near(b.stops[0].t1-b.stops[0].t0,5);
 const c=T.compileRoute(straight(10),[],[],.5);near(c.total,10/(V*.5));
});
test('倍速（播放速率）：advance 按 dt×rate 推进并夹在 [0,total]',()=>{
 near(T.advance(1,.5,2,100),2);near(T.advance(99.5,1,1,100),100);near(T.advance(1,1,.5,100),1.5);
});
test('连续：每 0.01 秒采样，位置变化不超过 走速×0.01（没有瞬移）',()=>{
 const c=T.compileRoute([[[0,0],[0,6],[4,6]],[[4,6],[4,12]]],[3],[{x:6,z:6,y:1}],1);let prev=T.sampleRoute(c,0);
 for(let t=.01;t<=c.total;t+=.01){const s=T.sampleRoute(c,t);assert.ok(Math.hypot(s.x-prev.x,s.z-prev.z)<=V*.01+1e-9,`t=${t} 瞬移`);prev=s;}
});
test('多站：站时间表递增，stops[i].index 与顺序一致，总时长 = 走 + 转 + 停',()=>{
 const legs=[[[0,0],[0,4]],[[0,4],[3,4]],[[3,4],[3,9]]];const c=T.compileRoute(legs,[2,3],[{x:5,z:4},{x:3,z:12}],1);
 assert.equal(c.stops.length,2);assert.deepEqual(c.stops.map(s=>s.index),[0,1]);assert.ok(c.stops[0].t1<=c.stops[1].t0);
 const items=c.items.reduce((s,i)=>s+(i.t1-i.t0),0);near(items,c.total);
 const holdSum=c.items.filter(i=>i.type==='hold').reduce((s,i)=>s+i.t1-i.t0,0);near(holdSum,5);
});
test('站数和停留数对不上时直接报错（调用方 bug），不静默吞掉',()=>{
 assert.throws(()=>T.compileRoute([[[0,0],[0,1]],[[0,1],[0,2]]],[],[],1),/停留/);
});

let failed=0;
for(const [name,fn] of tests){try{fn();console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,'\n   ',e.message.split('\n')[0]);}}
console.log(`\n${tests.length-failed}/${tests.length} 通过`);process.exit(failed?1:0);
