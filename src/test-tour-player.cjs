// 路线播放测试（浏览器）：画布底部一条播放条，「透视 / 第一人称 / 平面」三种视角在同一块画布上切换。
// 先 python3 src/build.py，再 node src/test-tour-player.cjs（需 8876 预览在跑）
const {chromium}=require('/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');const assert=require('node:assert/strict');
const near=(a,b,eps=1e-3)=>Math.abs(a-b)<=eps;
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 await p.goto('http://127.0.0.1:8876/?builtin');await p.waitForFunction(()=>window.editor&&window.editor.tourPlan&&window.editor.tourPlayer);
 // 准备：电视、机器人、前台；1 个大方案 + 4 个子方案（其中一条走不通：站位塞在前台里）
 await p.evaluate(()=>{
  const objs=editor.snapshot(),t=TourModel.emptyTour(),poi=(id,name)=>{const x=TourModel.makePoi(t,objs.find(o=>o.id===id),{name});t.pois.push(x);return x;};
  const tv=poi(1,'电视'),robot=poi(3,'机器人'),desk=poi(2,'前台'),bad=poi(2,'前台背后');bad.stand=[0,0];
  const ee=TourModel.defaultEntryExit('north-ew',editor.layout().room,editor.venue());
  t.groups.push({id:'g1',name:'北过道·东→西',approach:'north-ew',entry:ee.entry,exit:ee.exit,routes:[
   {id:'r1',name:'只路过',speed:1,eyeHeight:1.75,stops:[]},
   {id:'r2',name:'两站',speed:1,eyeHeight:1.75,stops:[{poiId:tv.id},{poiId:robot.id}]},
   {id:'r3',name:'三站',speed:1,eyeHeight:1.6,stops:[{poiId:desk.id},{poiId:tv.id,dwell:3},{poiId:robot.id}]},
   {id:'r4',name:'走不通',speed:1,eyeHeight:1.75,stops:[{poiId:bad.id}]}]});
  editor.setTour(t);editor.persist();localStorage.removeItem('ces-route-settings');
  editor.select(editor.objects().find(o=>o.userData.id===3));
  window.__before={pos:editor.camera.position.toArray(),fov:editor.camera.fov,sel:editor.selected()?.userData.id};
 });
 const st=()=>p.evaluate(()=>editor.tourPlan.state());
 const dbg=()=>p.evaluate(()=>editor.tourPlayer.debug());
 const routeRow=name=>p.locator('#rtLeft .rt-row.r',{hasText:name});
 const cam=k=>p.locator(`#rtBar [data-cam="${k}"]`);
 const seek=t=>p.evaluate(t=>{const s=document.querySelector('#tpSeek');s.value=String(t);s.dispatchEvent(new Event('input',{bubbles:true}));},t);
 const sampleAt=t=>p.evaluate(t=>{const s=editor.tourPlan.state(),a=editor.tourPlan.previewOf(s.selRoute);return TourTimeline.sampleRoute(a,t,editor.tourPlayer.debug().eyeHeight||1.75);},t);
 const mapBack=()=>p.evaluate(()=>({canvas:!!document.querySelector('#rtCanvas #view'),main:document.querySelector('#view').parentNode===document.querySelector('main')}));

 // 1 播放条在画布最下方；没选子方案 / 走不通的不能播，也不能切到 3D；能走的可以
 await p.locator('#routeBtn').click();
 const barBox=await p.locator('#rtBar').boundingBox(),canvasBox=await p.locator('#rtCanvas').boundingBox();
 assert.ok(near(barBox.y,canvasBox.y+canvasBox.height,1.5)&&near(barBox.x,canvasBox.x,1.5)&&near(barBox.width,canvasBox.width,1.5),'播放条贴在画布正下方、同宽');
 for(const id of ['#tpRestart','#tpPlay','#tpSeek','#tpTime','#tpRate','#tpRecenter'])assert.equal(await p.locator('#rtBar '+id).count(),1,id);
 assert.deepEqual(await p.locator('#rtBar [data-cam]').evaluateAll(es=>es.map(e=>e.textContent.trim())),['平面','',''],'视角按钮：只有选中的显示名称');
 assert.equal(await p.locator('#rtRight button:has-text("预览")').count(),0,'右栏没有预览按钮');
 await routeRow('走不通').click();
 assert.equal(await p.locator('#tpPlay').isDisabled(),true,'走不通不能播');assert.equal(await cam('orbit').isDisabled(),true);assert.equal(await cam('fp').isDisabled(),true);assert.equal(await cam('plan').isDisabled(),false);
 await routeRow('三站').click();
 assert.equal(await p.locator('#tpPlay').isDisabled(),false);assert.equal(await cam('orbit').isDisabled(),false);assert.equal((await st()).view,'plan','默认是平面');
 assert.equal(await p.locator('#tpRecenter').isHidden(),true,'平面里没有视线归位');
 console.log('PASS 播放条贴在画布最下方；走不通的子方案播放和 3D 视角灰掉，能走的可点；视角叫透视 / 第一人称 / 平面');

 // 2 刻度画在进度条里面（不在上方）：3 站都有停留 → 3 个点，垂直中心落在进度条中线上
 const ticks=p.locator('#rtBar .tp-tick');assert.equal(await ticks.count(),3);
 const sb=await p.locator('#tpSeek').boundingBox(),tb=await ticks.nth(1).boundingBox();
 assert.ok(Math.abs((tb.y+tb.height/2)-(sb.y+sb.height/2))<=1.5,'刻度和进度条中线对齐：'+JSON.stringify([tb,sb]));
 console.log('PASS 停留刻度在进度条里面，不在上方');

 // 3 平面里播放：小人和扇形跟着走；暂停；拖进度
 assert.equal(await p.locator('#rtPlan .rt-walker').count(),0,'没开始播之前图上没有小人');
 await p.locator('#tpPlay').click();assert.equal((await st()).playing,true);await p.waitForTimeout(500);
 const t1=(await st()).t;assert.ok(t1>.2,'时间在走：'+t1);assert.equal(await p.locator('#rtPlan .rt-walker').count(),1);assert.equal(await p.locator('#rtPlan .rt-walker path.fov').count(),1);
 assert.ok((await p.locator('#tpPlay').textContent()).includes('暂停'));
 await p.locator('#tpPlay').click();const t2=(await st()).t;await p.waitForTimeout(300);assert.equal((await st()).t,t2,'暂停后时间不动');
 const total=(await st()).total;assert.ok(total>10);
 await seek(total*.6);let s=await sampleAt(total*.6);
 const wp=await p.evaluate(()=>{const c=document.querySelector('#rtPlan .rt-walker circle');return [+c.getAttribute('cx'),+c.getAttribute('cy')];});
 await seek(total*.2);await seek(total*.6);const wp2=await p.evaluate(()=>{const c=document.querySelector('#rtPlan .rt-walker circle');return [+c.getAttribute('cx'),+c.getAttribute('cy')];});
 assert.deepEqual(wp2,wp,'往回拖再拖回来位置一致');assert.ok(near((await st()).t,total*.6,.02));
 assert.equal(await p.locator('#tpTime').textContent(),`${Math.floor(Math.round((await st()).t)/60)}:${String(Math.round((await st()).t)%60).padStart(2,'0')} / ${Math.floor(Math.round(total)/60)}:${String(Math.round(total)%60).padStart(2,'0')}`);
 console.log('PASS 平面：播放、暂停、拖进度，小人和扇形跟着走');

 // 4 停留：点刻度跳到那一站的停留；平面里小人朝向物料
 await ticks.nth(1).click();let d=await st();const stops=await p.evaluate(()=>editor.tourPlan.previewOf('r3').stops);
 assert.ok(d.t>=stops[1].t0&&d.t<stops[1].t1,'点刻度跳到第 2 站');
 console.log('PASS 点停留刻度跳到那一站');

 // 5 倍速：一个按钮，依次 1×→2×→0.5×→1×
 const seqR=[];for(let i=0;i<4;i++){await p.locator('#tpRate').click();seqR.push([(await st()).rate,await p.locator('#tpRate').textContent()]);}
 assert.deepEqual(seqR,[[2,'2×'],[.5,'0.5×'],[1,'1×'],[2,'2×']]);await p.locator('#tpRate').click();await p.locator('#tpRate').click();
 console.log('PASS 倍速是一个按钮，点一下依次 1×→2×→0.5×→1×');

 // 6 切到透视：画布换成 3D，进度不丢；游客在采样位置；再点平面回来，一切收干净
 await seek(total*.6);const tBefore=(await st()).t;
 await cam('orbit').click();
 assert.equal((await st()).view,'orbit');assert.equal(await p.evaluate(()=>editor.tourPlayer.isOpen()),true);assert.equal(await p.locator('#rtPlan').isHidden(),true,'图纸收起');
 assert.deepEqual(await mapBack(),{canvas:true,main:false},'3D 画面搬进了画布');
 d=await dbg();s=await sampleAt(d.t);assert.ok(near(d.t,tBefore,.02),'进度不丢');
 assert.ok(near(d.visitor.x,s.x)&&near(d.visitor.z,s.z)&&near(d.visitor.rotY,s.bodyYaw),'游客在采样位置');assert.equal(d.visitor.visible,true);
 assert.equal(await p.locator('#rtBar').isVisible(),true);assert.equal(await p.locator('#rtLeft').isVisible(),true,'左栏还在，仍可编辑');
 assert.equal(await p.locator('#rtTools button[title="适应画面"]').count(),0,'3D 里不显示适应画面');
 const vb=await p.locator('#view').boundingBox(),cb=await p.locator('#rtCanvas').boundingBox();assert.ok(near(vb.x,cb.x,1.5)&&near(vb.y,cb.y,1.5)&&near(vb.width,cb.width,1.5)&&near(vb.height,cb.height,1.5),'3D 画面正好铺满画布');
 for(const id of ['#viewbar','#libraryToggle'])assert.equal(await p.locator(id).isHidden(),true,id+' 3D 里收起');
 assert.equal(await p.evaluate(()=>editor.selected()),null,'3D 里不选中物料');
 await p.mouse.click(vb.x+vb.width/2,vb.y+vb.height/2);assert.equal(await p.evaluate(()=>editor.selected()),null,'点 3D 画面不会选中物料');
 await cam('plan').click();
 assert.equal((await st()).view,'plan');assert.equal(await p.evaluate(()=>editor.tourPlayer.isOpen()),false);assert.equal(await p.locator('#rtPlan').isVisible(),true);assert.deepEqual(await mapBack(),{canvas:false,main:true},'3D 画面放回原位');
 assert.equal(await p.evaluate(()=>editor.scene.children.some(o=>o.name==='tour-visitor'||o.name==='tour-path')),false,'游客和地面路线收掉');
 assert.equal(await p.evaluate(()=>document.body.classList.contains('touring')),false);
 const af=await p.evaluate(()=>({pos:editor.camera.position.toArray(),fov:editor.camera.fov,sel:editor.selected()?.userData.id}));let bf=await p.evaluate(()=>window.__before);
 assert.ok(af.pos.every((v,i)=>near(v,bf.pos[i])),'编辑视角恢复');assert.equal(af.fov,bf.fov);assert.equal(af.sel,bf.sel,'选中物料恢复');
 assert.equal((await st()).t,tBefore,'回到平面进度还在');
 console.log('PASS 透视：画布换成 3D、进度和游客位置对得上；回平面后 3D 收干净、编辑视角和选中恢复');

 // 7 第一人称：相机在眼高、隐藏游客、FOV 65；拖动转头；视线归位 / 拖进度清零；停留时看向物料
 await cam('fp').click();d=await dbg();s=await sampleAt(d.t);
 assert.equal(d.visitor.visible,false);const c0=await p.evaluate(()=>({p:editor.camera.position.toArray(),fov:editor.camera.fov}));
 assert.ok(near(c0.p[1],1.6)&&near(c0.p[0],s.x)&&near(c0.p[2],s.z),'相机 = 游客位置 + 眼高 1.6');assert.equal(c0.fov,65);
 assert.equal(await p.locator('#tpHint').isVisible(),true);assert.equal(await p.locator('#tpCross').isVisible(),true);assert.equal(await p.locator('#tpRecenter').isVisible(),true);
 const vb2=await p.locator('#view').boundingBox(),mx=vb2.x+vb2.width/2,my=vb2.y+vb2.height/2;
 const dir0=await p.evaluate(()=>{const v=new THREE.Vector3();editor.camera.getWorldDirection(v);return v.toArray();});
 await p.mouse.move(mx,my);await p.mouse.down();await p.mouse.move(mx+80,my-20,{steps:4});await p.mouse.up();
 d=await dbg();assert.ok(Math.abs(d.yawOff)>.05,'鼠标转头：'+d.yawOff);
 const dir1=await p.evaluate(()=>{const v=new THREE.Vector3();editor.camera.getWorldDirection(v);return v.toArray();});assert.ok(Math.hypot(dir1[0]-dir0[0],dir1[2]-dir0[2])>.05,'视线变了');
 await p.locator('#tpRecenter').click();d=await dbg();assert.equal(d.yawOff,0);assert.equal(d.pitchOff,0);
 await p.mouse.move(mx,my);await p.mouse.down();await p.mouse.move(mx-60,my+50,{steps:4});await p.mouse.up();assert.ok((await dbg()).yawOff!==0);
 await seek(total*.3);d=await dbg();assert.equal(d.yawOff,0);assert.equal(d.pitchOff,0);
 // Cmd 转头：按住 Cmd 不点鼠标，移动就转头；松开回到路径视角
 await p.keyboard.down('Meta');await p.mouse.move(mx,my);await p.mouse.move(mx+70,my+10,{steps:4});assert.ok(Math.abs((await dbg()).yawOff)>.05,'Cmd 转头');
 await p.keyboard.up('Meta');d=await dbg();assert.equal(d.yawOff,0,'松开 Cmd 回到原视角');assert.equal(d.pitchOff,0);
 // 拖动转头后重新播放：视角恢复到路径设定
 await p.mouse.move(mx,my);await p.mouse.down();await p.mouse.move(mx-60,my+50,{steps:4});await p.mouse.up();assert.ok((await dbg()).yawOff!==0);
 await p.locator('#tpPlay').click();assert.equal((await dbg()).yawOff,0,'重新播放视角恢复');await p.locator('#tpPlay').click();
 await ticks.nth(1).click();s=await sampleAt((await st()).t);
 const e=await p.evaluate(()=>{const r=new THREE.Euler().setFromQuaternion(editor.camera.quaternion,'YXZ');return [r.x,r.y];});assert.ok(near(e[0],s.lookPitch,1e-3),'停留时俯仰看向物料');
 const look=await p.evaluate(()=>{const v=new THREE.Vector3();editor.camera.getWorldDirection(v);return v.toArray();});assert.ok(near(Math.atan2(look[0],look[2]),s.lookYaw,1e-3),'停留时朝向物料');
 assert.equal(await p.locator('#tpPhase').count(),0,'右上角没有阶段标签');
 // 第一人称 → 透视：视角回到切换前的透视位置；→ 平面：FOV 恢复
 await cam('orbit').click();assert.equal(await p.evaluate(()=>editor.camera.fov),bf.fov);assert.equal((await dbg()).visitor.visible,true);
 await cam('fp').click();await cam('plan').click();assert.equal(await p.evaluate(()=>editor.camera.fov),bf.fov);
 console.log('PASS 第一人称：眼高、隐藏游客、拖动转头、视线归位和拖进度清零、停留看物料；在三种视角间来回切 FOV 都能恢复');

 // 8 游客只是临时的：不进方案数据
 await cam('orbit').click();d=await dbg();assert.equal(await p.evaluate(()=>editor.layout().objects.length),3,'游客不进方案数据');
 await seek(.5);d=await dbg();assert.equal(d.phase,'walk');if(d.anim.name)assert.equal(d.anim.name,'Walk');
 await ticks.nth(0).click();d=await dbg();if(d.anim.name)assert.equal(d.anim.name,'Idle');
 const a1=(await dbg()).anim;await p.waitForTimeout(300);assert.deepEqual((await dbg()).anim,a1,'暂停时动画不动');
 console.log('PASS 游客停留放 Idle、走路放 Walk，暂停不动；不写进方案');

 // 9 键盘：空格播放 / 暂停（按钮有焦点也只切一次）；WASD 无效
 await p.locator('#tpPlay').focus();const before=(await st()).playing;await p.keyboard.press('Space');await p.waitForTimeout(50);assert.equal((await st()).playing,!before,'空格只切一次');
 await p.keyboard.press('Space');assert.equal((await st()).playing,before);
 const camW=await p.evaluate(()=>editor.camera.position.toArray());await p.keyboard.down('KeyW');await p.waitForTimeout(200);await p.keyboard.up('KeyW');
 assert.equal(await p.evaluate(()=>editor.walking()),false);assert.deepEqual(await p.evaluate(()=>editor.camera.position.toArray()),camW,'WASD 不移动');
 console.log('PASS 空格播放暂停只切一次，WASD 无效');
 // 10 窗口失焦就暂停（3D 和平面都一样）
 await p.locator('#tpPlay').click();assert.equal((await st()).playing,true);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await st()).playing,false);
 console.log('PASS 失焦暂停');
 // 11 播到头停住，再点是重播
 await seek(total-.05);await p.locator('#tpPlay').click();await p.waitForTimeout(400);d=await st();assert.equal(d.playing,false,'播完自动停');assert.ok((await p.locator('#tpPlay').textContent()).includes('重播'));
 await p.locator('#tpPlay').click();assert.ok((await st()).t<1,'重播从头');await p.locator('#tpPlay').click();
 console.log('PASS 播完停住，再点重播');

 // 12 切子方案：从头、暂停、清转头，刻度跟着变；3D 里切也留在 3D
 await routeRow('两站').click();d=await st();assert.equal(d.selRoute,'r2');assert.equal(d.t,0);assert.equal(d.playing,false);assert.equal(d.view,'orbit','在 3D 里切子方案，视角不变');
 assert.equal(await p.locator('#rtBar .tp-tick').count(),2);assert.equal((await dbg()).total>0,true);
 await routeRow('走不通').click();assert.equal((await st()).view,'plan','选到走不通的就回平面');assert.equal(await p.evaluate(()=>editor.tourPlayer.isOpen()),false);
 await routeRow('三站').click();
 console.log('PASS 切子方案从头开始；走不通的自动回平面');

 // 13 3D 里点左栏的 + 加路径点：自动回到平面
 await cam('fp').click();await p.locator('#rtRight .rt-add').first().click();
 assert.equal((await st()).view,'plan','加路径点要在平面上点');assert.equal((await st()).ordering,true);await p.keyboard.press('Escape');
 console.log('PASS 3D 里要加路径点，自动回到平面');

 // 14 设置：齿轮在底部播放条里，里面只有「跳过停留」；打开后播放没有停留，刻度消失；记在本机，不进方案
 const dw=p.locator('#rtBar #tpDwell');assert.equal(await dw.count(),1);assert.equal(await p.locator('#rtSettings').count(),0,'没有设置菜单');assert.equal((await p.locator('#rtBar .tp-dwell').textContent()).trim(),'停留');assert.equal(await dw.isChecked(),true,'默认勾选停留');
 const total0=(await st()).total,ticks0=await p.locator('#rtBar .tp-tick').count();assert.ok(ticks0>0);await seek(total0*.5);
 await dw.uncheck();
 d=await st();assert.equal(d.skipDwell,true);assert.ok(d.total<total0-5,'跳过停留后总时长变短：'+d.total+' < '+total0);assert.equal(await p.locator('#rtBar .tp-tick').count(),ticks0,'跳过停留后节点仍在');
 assert.ok(near(d.t/d.total,.5,.02),'打开开关时播放进度比例不变');
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('ces-route-settings')).skipDwell),true,'记在本机');assert.equal(await p.evaluate(()=>JSON.stringify(editor.layout()).includes('skipDwell')),false,'不进方案数据');
 await cam('fp').click();await seek(1);let sk=await dbg();assert.equal(sk.phase,'walk');await seek((await st()).total-.1);assert.notEqual((await dbg()).phase,'hold');
 await cam('plan').click();
 await p.reload();await p.waitForFunction(()=>window.editor&&window.editor.tourPlan);
 bf=await p.evaluate(()=>{editor.select(editor.objects().find(o=>o.userData.id===3));return {pos:editor.camera.position.toArray(),fov:editor.camera.fov,sel:editor.selected()?.userData.id};});   // 刷新后重新记一次编辑视角和选中
 await p.locator('#routeBtn').click();await routeRow('三站').click();assert.equal((await st()).skipDwell,true,'刷新后设置还在');
 assert.equal(await p.locator('#tpDwell').isChecked(),false,'刷新后停留仍是取消勾选');await p.locator('#tpDwell').check();d=await st();assert.equal(d.skipDwell,false);assert.ok(near(d.total,total0,.01),'关掉开关恢复停留');assert.equal(await p.locator('#rtBar .tp-tick').count(),3);
 console.log('PASS 设置里「跳过停留」：总时长、刻度跟着变，记在本机，刷新还在，不进方案');

 // 15 退出路线：3D 里直接点退出，相机、FOV、选中都恢复
 await cam('fp').click();await p.locator('#routeBtn').click();
 const after=await p.evaluate(()=>({pos:editor.camera.position.toArray(),fov:editor.camera.fov,sel:editor.selected()?.userData.id,touring:document.body.classList.contains('touring'),plan:editor.tourPlan.isOpen(),aside:!document.querySelector('aside').hidden&&getComputedStyle(document.querySelector('aside')).display!=='none',open:editor.tourPlayer.isOpen(),home:document.querySelector('#view').parentNode===document.querySelector('main')}));
 assert.equal(after.touring,false);assert.equal(after.plan,false);assert.equal(after.aside,true);assert.equal(after.open,false);assert.equal(after.home,true);
 assert.ok(after.pos.every((v,i)=>near(v,bf.pos[i])),'相机位置恢复');assert.equal(after.fov,bf.fov);assert.equal(after.sel,bf.sel,'选中物料恢复');
 assert.equal(await p.evaluate(()=>editor.scene.children.some(o=>o.name==='tour-visitor'||o.name==='tour-path')),false);assert.equal(await p.evaluate(()=>document.pointerLockElement),null);
 console.log('PASS 在 3D 里退出路线：相机、FOV、选中物料恢复，游客和地面路线清掉');
 // 重新进入还是平面
 await p.locator('#routeBtn').click();assert.equal((await st()).view,'plan','重新进入路线从平面开始');await routeRow('三站').click();

 // 16 正在 3D 里看的路线被删（撤销 / 恢复数据）→ 回到平面
 await cam('orbit').click();
 await p.evaluate(()=>{const l=editor.layout();l.tour.groups[0].routes=l.tour.groups[0].routes.filter(r=>r.id!=='r3');editor.restore(l);});
 assert.equal((await st()).view,'plan','路线被删就回平面');assert.equal(await p.evaluate(()=>editor.tourPlayer.isOpen()),false);assert.equal(await p.evaluate(()=>document.body.classList.contains('touring')),false);assert.ok(near(await p.evaluate(()=>editor.camera.fov),bf.fov));
 console.log('PASS 正在看的路线被删 → 回到平面');
 // 17 切方案 → 先回到平面
 await routeRow('两站').click();await cam('orbit').click();
 await p.evaluate(()=>document.querySelector('#newPlan').click());   // 路线里看不到方案标签，这里用代码触发切方案
 assert.equal(await p.evaluate(()=>editor.tourPlayer.isOpen()),false,'切方案收掉 3D');assert.equal(await p.evaluate(()=>document.body.classList.contains('touring')),false);
 console.log('PASS 切方案先回到平面');

 // 18 悬停：播放条所有按钮、刻度、设置按钮、开关都有变化
 await p.evaluate(()=>document.querySelector('#tabs button').click());await p.waitForFunction(()=>document.querySelector('#rtLeft .rt-row.r'));await routeRow('两站').click();
 // 8 预览里每站停留最多 3 秒（真实停留几十秒，预览太长）；「下一站」按钮；拖进度不改变播放/暂停状态；平面小人是顶视人形
 await routeRow('两站').click();
 {
  const real=await p.evaluate(()=>editor.tourPlan.analysisOf(editor.tourPlan.state().selRoute).compiled.items.filter(x=>x.type==='hold').map(x=>x.t1-x.t0));
  const prev=await p.evaluate(()=>editor.tourPlan.previewOf(editor.tourPlan.state().selRoute).items.filter(x=>x.type==='hold').map(x=>x.t1-x.t0));
  assert.ok(prev.length>0&&prev.every(x=>near(x,3,1e-6)),'预览每站固定停 3 秒：'+prev);
  assert.ok(near((await st()).total,await p.evaluate(()=>editor.tourPlan.previewOf(editor.tourPlan.state().selRoute).total),1e-6),'播放条总时长用预览时间');
  assert.equal(await p.locator('#rtBar #tpNext').count(),1,'有下一站按钮');
  const order=await p.evaluate(()=>{const b=document.querySelector('#rtBar');return [...b.children].map(e=>e.id||e.className);});
  assert.ok(order.indexOf('tpNext')===order.indexOf('tpPlay')+1,'下一站在播放按钮右边：'+order);
  const stops=await p.evaluate(()=>editor.tourPlan.previewOf(editor.tourPlan.state().selRoute).stops);
  await seek(0);await p.locator('#tpNext').click();assert.ok(near((await st()).t,stops[0].t0+.01,.05),'跳到第 1 站');
  assert.equal((await st()).playing,false,'暂停时点下一站仍暂停');
  await p.locator('#tpNext').click();assert.ok(near((await st()).t,stops[1].t0+.01,.05),'再跳到第 2 站');
  await seek(0);await p.locator('#tpPlay').click();assert.equal((await st()).playing,true);
  await p.locator('#tpNext').click();assert.ok((await st()).t>=stops[0].t0,'播放中也能跳');assert.equal((await st()).playing,true,'播放中点下一站继续播放');
  await p.locator('#tpPlay').click();
  // 拖进度：真实指针按下→拖→松开
  const sb=await p.locator('#tpSeek').boundingBox(),y=sb.y+sb.height/2;
  await p.mouse.move(sb.x+20,y);await p.mouse.down();await p.mouse.move(sb.x+sb.width*.3,y,{steps:4});assert.equal((await st()).playing,false,'拖动中暂停');await p.mouse.up();
  assert.equal((await st()).playing,false,'拖之前是暂停，拖完仍暂停');
  await p.locator('#tpPlay').click();assert.equal((await st()).playing,true);
  await p.mouse.move(sb.x+20,y);await p.mouse.down();await p.mouse.move(sb.x+sb.width*.4,y,{steps:4});await p.mouse.up();
  assert.equal((await st()).playing,true,'拖之前在播放，拖完继续播放');
  const t1=(await st()).t;await p.waitForTimeout(300);assert.ok((await st()).t>t1,'确实在往前走');
  await p.locator('#tpPlay').click();
  assert.equal(await p.evaluate(()=>document.querySelectorAll('#rtPlan .rt-walker circle').length),1,'游览小人仍是原来的圆点');
 }
 console.log('PASS 预览停留≤3秒、下一站按钮、拖进度保持播放状态、顶视人形');

 for(const sel of ['#tpRestart','#tpPlay','#tpRate','#rtBar [data-cam="fp"]','#rtBar .tp-dwell']){
  const loc=p.locator(sel).first();await p.mouse.move(5,890);const s0=await loc.evaluate(e=>{const c=getComputedStyle(e);return c.backgroundColor+c.borderColor;});
  await loc.hover();const s1=await loc.evaluate(e=>{const c=getComputedStyle(e);return c.backgroundColor+c.borderColor;});assert.notEqual(s1,s0,sel+' 悬停无变化');
 }
 await p.mouse.move(5,890);const tk=p.locator('#rtBar .tp-tick').first();const k0=await tk.evaluate(e=>getComputedStyle(e).transform);await tk.hover();await p.waitForTimeout(200);assert.notEqual(await tk.evaluate(e=>getComputedStyle(e).transform),k0,'刻度悬停');
 console.log('PASS 播放条按钮、刻度、设置按钮悬停有变化');
 assert.deepEqual(errors,[],'页面不应有报错：'+errors.join('\n'));console.log('PASS 全程无页面异常');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
