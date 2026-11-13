// 游客路线 3D 播放测试（浏览器）。先 python3 src/build.py，再 node src/test-tour-player.cjs（需 8876 预览在跑）
const {chromium}=require('/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');const assert=require('node:assert/strict');
const near=(a,b,eps=1e-3)=>Math.abs(a-b)<=eps;
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 await p.goto('http://127.0.0.1:8876/?builtin');await p.waitForFunction(()=>window.editor&&window.editor.tourPlan&&window.editor.tourPlayer);
 // 准备：电视①、机器人②、前台③；1 个大方案 + 3 个子方案 + 1 条走不通（站位塞在前台里）
 await p.evaluate(()=>{
  const objs=editor.snapshot(),t=TourModel.emptyTour(),poi=(id,name)=>{const x=TourModel.makePoi(t,objs.find(o=>o.id===id),{name});t.pois.push(x);return x;};
  const tv=poi(1,'电视'),robot=poi(3,'机器人'),desk=poi(2,'前台'),bad=poi(2,'前台背后');bad.stand=[0,0];
  const ee=TourModel.defaultEntryExit('north-ew',editor.layout().room,editor.venue());
  t.groups.push({id:'g1',name:'北过道·东→西',approach:'north-ew',entry:ee.entry,exit:ee.exit,routes:[
   {id:'r1',name:'只路过',speed:1,eyeHeight:1.75,stops:[]},
   {id:'r2',name:'两站',speed:1,eyeHeight:1.75,stops:[{poiId:tv.id},{poiId:robot.id}]},
   {id:'r3',name:'三站',speed:1,eyeHeight:1.6,stops:[{poiId:desk.id},{poiId:tv.id,dwell:3},{poiId:robot.id}]},
   {id:'r4',name:'走不通',speed:1,eyeHeight:1.75,stops:[{poiId:bad.id}]}]});
  editor.setTour(t);editor.persist();
  editor.select(editor.objects().find(o=>o.userData.id===3));
  window.__before={pos:editor.camera.position.toArray(),fov:editor.camera.fov,sel:editor.selected()?.userData.id};
 });
 const st=()=>p.evaluate(()=>editor.tourPlayer.debug());
 const routeRow=name=>p.locator('#rtLeft .rt-row.r',{hasText:name});
 const preview=()=>p.locator('#rtRight button:has-text("在 3D 中预览")');
 const seek=t=>p.evaluate(t=>{const s=document.querySelector('#tpSeek');s.value=String(t);s.dispatchEvent(new Event('input',{bubbles:true}));},t);
 const sampleAt=t=>p.evaluate(t=>{const d=editor.tourPlayer.debug(),a=editor.tourPlan.analysisOf(d.routeId);return TourTimeline.sampleRoute(a.compiled,t,d.eyeHeight);},t);

 // 1 走不通的不能预览；能走的可以
 await p.locator('#routeBtn').click();await routeRow('走不通').click();assert.equal(await preview().isDisabled(),true,'走不通的子方案不能预览');
 await routeRow('三站').click();assert.equal(await preview().isDisabled(),false);
 console.log('PASS 走不通的子方案预览按钮不可点，能走的可点');
 // 2 进入播放：图纸收起、顶栏只剩回到路线图 / 退出、播放条齐全、自动开始播
 await preview().click();
 assert.equal(await p.evaluate(()=>document.body.classList.contains('touring')),true);
 assert.equal(await p.locator('#routeEdit').isHidden(),true);assert.equal(await p.locator('aside').isHidden(),true);
 assert.equal(await p.locator('#tourBack').isVisible(),true);assert.equal(await p.locator('#tourExit').isVisible(),true);
 for(const id of ['#undo','#import','#save','#routeBtn','#viewbar','#libraryToggle'])assert.equal(await p.locator(id).isHidden(),true,id+' 播放时应收起');
 for(const id of ['#tpPick','#tpRestart','#tpPlay','#tpSeek','#tpTime','#tpRecenter'])assert.equal(await p.locator(id).count(),1,id);
 assert.equal(await p.locator('#tourPlay [data-rate]').count(),3);assert.equal(await p.locator('#tourPlay [data-cam]').count(),2);
 const opts=await p.locator('#tpPick option').evaluateAll(os=>os.map(o=>[o.value,o.disabled]));
 assert.deepEqual(opts,[['r1',false],['r2',false],['r3',false],['r4',true]]);assert.equal(await p.locator('#tpPick').inputValue(),'r3');
 assert.equal(await p.locator('#tpPick optgroup').getAttribute('label'),'北过道·东→西');
 assert.equal((await st()).playing,true,'进来就开始播');
 await p.waitForTimeout(500);const t1=(await st()).t;assert.ok(t1>.2,'时间在走：'+t1);
 console.log('PASS 进入 3D 预览：顶栏、播放条、路线下拉（走不通的灰掉），自动开播');
 // 3 暂停
 await p.locator('#tpPlay').click();const t2=(await st()).t;await p.waitForTimeout(300);assert.equal((await st()).t,t2,'暂停后时间不动');assert.equal((await st()).playing,false);
 assert.ok((await p.locator('#tpPlay').textContent()).includes('播放'));
 console.log('PASS 暂停');
 // 4 拖进度：位置 = 时间轴采样；往回拖结果一样
 const total=(await st()).total;assert.ok(total>10);
 await seek(total*.6);let d=await st();let s=await sampleAt(d.t);
 assert.ok(near(d.t,total*.6,.02));assert.ok(near(d.visitor.x,s.x)&&near(d.visitor.z,s.z),'游客在采样位置');assert.ok(near(d.visitor.rotY,s.bodyYaw),'身体朝向 = 采样朝向');
 const at6=d.visitor;await seek(total*.2);await seek(total*.6);d=await st();assert.ok(near(d.visitor.x,at6.x)&&near(d.visitor.z,at6.z)&&near(d.visitor.rotY,at6.rotY),'往回拖再拖回来，结果一致');
 assert.equal(await p.locator('#tpTime').textContent(),`${Math.floor(Math.round(d.t)/60)}:${String(Math.round(d.t)%60).padStart(2,'0')} / ${Math.floor(Math.round(total)/60)}:${String(Math.round(total)%60).padStart(2,'0')}`);
 console.log('PASS 拖进度条：游客位置、朝向跟时间轴一致，往回拖结果相同');
 // 5 停留刻度：3 站都有停留 → 3 个点，点了跳到到站时刻
 const ticks=p.locator('#tourPlay .tp-tick');assert.equal(await ticks.count(),3);
 await ticks.nth(1).click();d=await st();const stops=await p.evaluate(()=>editor.tourPlan.analysisOf('r3').compiled.stops);
 assert.ok(d.t>=stops[1].t0&&d.t<stops[1].t1,'点刻度跳到第 2 站');assert.equal(d.phase,'hold');
 const phase=await p.locator('#tpPhase').textContent();assert.ok(/第 2 站 · 停留 · 看「电视」· 还剩 \d+ 秒/.test(phase),'阶段提示：'+phase);
 console.log('PASS 停留刻度可点，阶段提示「第 2 站 · 停留 · 看「电视」· 还剩 N 秒」');
 // 6 人物动画只跟时间轴走：暂停时 people.update 不推它；停留放 Idle，走路放 Walk
 const a1=(await st()).anim;await p.waitForTimeout(300);const a2=(await st()).anim;assert.deepEqual(a2,a1,'暂停时动画不动（people.update 跳过了游客）');
 if(a1.name)assert.equal(a1.name,'Idle');
 await seek(.5);d=await st();assert.equal(d.phase,'walk');if(d.anim.name)assert.equal(d.anim.name,'Walk');
 assert.equal(await p.evaluate(()=>editor.layout().objects.length),3,'游客不进方案数据');
 console.log('PASS 游客停留放 Idle、走路放 Walk，暂停不动；不写进方案');
 // 7 倍速
 await p.locator('#tourPlay [data-rate="2"]').click();assert.equal((await st()).rate,2);assert.ok(await p.locator('#tourPlay [data-rate="2"]').evaluate(e=>e.classList.contains('active')));
 console.log('PASS 倍速切换');
 // 8 总览下点画面不会选中物料
 await p.mouse.click(720,400);assert.equal(await p.evaluate(()=>editor.selected()),null);
 // 9 第一人称：相机在眼高、隐藏游客、FOV 65；拖动转头；视线归位 / 拖进度清零
 await p.locator('#tourPlay [data-cam="fp"]').click();d=await st();s=await sampleAt(d.t);
 assert.equal(d.visitor.visible,false);const cam=await p.evaluate(()=>({p:editor.camera.position.toArray(),fov:editor.camera.fov}));
 assert.ok(near(cam.p[1],1.6)&&near(cam.p[0],s.x)&&near(cam.p[2],s.z),'相机 = 游客位置 + 眼高 1.6');assert.equal(cam.fov,65);
 assert.equal(await p.locator('#tpHint').isVisible(),true);assert.equal(await p.locator('#tpCross').isVisible(),true);assert.equal(await p.locator('#tpRecenter').isVisible(),true);
 const dirBefore=await p.evaluate(()=>{const v=new THREE.Vector3();editor.camera.getWorldDirection(v);return v.toArray();});
 await p.mouse.move(700,400);await p.mouse.down();await p.mouse.move(780,380,{steps:4});await p.mouse.up();
 d=await st();assert.ok(Math.abs(d.yawOff)>.05,'鼠标转头：'+d.yawOff);
 const dirAfter=await p.evaluate(()=>{const v=new THREE.Vector3();editor.camera.getWorldDirection(v);return v.toArray();});assert.ok(Math.hypot(dirAfter[0]-dirBefore[0],dirAfter[2]-dirBefore[2])>.05,'视线变了');
 await p.locator('#tpRecenter').click();d=await st();assert.equal(d.yawOff,0);assert.equal(d.pitchOff,0);
 await p.mouse.move(700,400);await p.mouse.down();await p.mouse.move(640,450,{steps:4});await p.mouse.up();assert.ok((await st()).yawOff!==0);
 await seek(total*.3);d=await st();assert.equal(d.yawOff,0);assert.equal(d.pitchOff,0);
 // 停留时自动看物料（有俯仰），走路看前方
 await ticks.nth(1).click();s=await sampleAt((await st()).t);
 const e=await p.evaluate(()=>{const r=new THREE.Euler().setFromQuaternion(editor.camera.quaternion,'YXZ');return [r.x,r.y];});
 assert.ok(near(e[0],s.lookPitch,1e-3),'停留时俯仰看向物料');
 const look=await p.evaluate(()=>{const v=new THREE.Vector3();editor.camera.getWorldDirection(v);return v.toArray();});assert.ok(near(Math.atan2(look[0],look[2]),s.lookYaw,1e-3),'停留时朝向物料');
 console.log('PASS 第一人称：眼高、隐藏游客、拖动转头、视线归位和拖进度清零、停留看物料');
 // 10 键盘：空格播放 / 暂停（按钮有焦点也只切一次）；WASD 无效
 await p.locator('#tpPlay').focus();const before=(await st()).playing;await p.keyboard.press('Space');await p.waitForTimeout(50);assert.equal((await st()).playing,!before,'空格只切一次');
 await p.keyboard.press('Space');assert.equal((await st()).playing,before);
 const camW=await p.evaluate(()=>editor.camera.position.toArray());await p.keyboard.down('KeyW');await p.waitForTimeout(200);await p.keyboard.up('KeyW');
 assert.equal(await p.evaluate(()=>editor.walking()),false);assert.deepEqual(await p.evaluate(()=>editor.camera.position.toArray()),camW,'WASD 不移动');
 console.log('PASS 空格播放暂停只切一次，WASD 无效');
 // 11 窗口失焦就暂停
 await p.locator('#tpPlay').click();assert.equal((await st()).playing,true);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await st()).playing,false);
 console.log('PASS 失焦暂停');
 // 12 切路线：从头、暂停、清转头
 await p.locator('#tpPick').selectOption('r2');d=await st();assert.equal(d.routeId,'r2');assert.equal(d.t,0);assert.equal(d.playing,false);assert.equal(d.yawOff,0);
 assert.equal(await p.locator('#tourPlay .tp-tick').count(),2);
 console.log('PASS 切路线后从头开始');
 // 13 回到路线图：选中刚才那条
 await p.locator('#tourBack').click();assert.equal(await p.evaluate(()=>document.body.classList.contains('touring')),false);
 assert.equal(await p.locator('#routeEdit').isVisible(),true);assert.equal(await p.evaluate(()=>editor.tourPlan.state().selRoute),'r2');
 assert.equal(await p.evaluate(()=>document.pointerLockElement),null);
 console.log('PASS 回到路线图，选中刚才播的子方案');
 // 14 退出：相机、FOV、选中物料都恢复
 await preview().click();await p.locator('#tourPlay [data-cam="fp"]').click();await p.locator('#tourExit').click();
 const after=await p.evaluate(()=>({pos:editor.camera.position.toArray(),fov:editor.camera.fov,sel:editor.selected()?.userData.id,touring:document.body.classList.contains('touring'),plan:editor.tourPlan.isOpen(),aside:!document.querySelector('aside').hidden&&getComputedStyle(document.querySelector('aside')).display!=='none'}));
 const bf=await p.evaluate(()=>window.__before);
 assert.equal(after.touring,false);assert.equal(after.plan,false);assert.equal(after.aside,true);
 assert.ok(after.pos.every((v,i)=>near(v,bf.pos[i])),'相机位置恢复');assert.equal(after.fov,bf.fov);assert.equal(after.sel,bf.sel,'选中物料恢复');
 assert.equal(await p.evaluate(()=>editor.scene.children.some(o=>o.name==='tour-visitor'||o.name==='tour-path')),false,'游客和地面路线退出后清掉');
 console.log('PASS 退出：相机、FOV、选中物料恢复，游客和地面路线清掉');
 // 15 正在播的路线没了（撤销 / 恢复数据）→ 先退出播放
 await p.locator('#routeBtn').click();await routeRow('三站').click();await preview().click();
 await p.evaluate(()=>{const l=editor.layout();l.tour.groups[0].routes=l.tour.groups[0].routes.filter(r=>r.id!=='r3');editor.restore(l);});
 assert.equal(await p.evaluate(()=>document.body.classList.contains('touring')),false,'路线被删就退出播放');
 assert.ok(near((await p.evaluate(()=>editor.camera.fov)),bf.fov));
 console.log('PASS 正在播的路线被删 → 退出播放');
 // 16 切方案 → 先退出播放
 await p.locator('#routeBtn').click();await routeRow('两站').click();await preview().click();
 await p.locator('#newPlan').click();assert.equal(await p.evaluate(()=>document.body.classList.contains('touring')),false,'切方案退出播放');
 console.log('PASS 切方案先退出播放');
 // 17 悬停：播放条按钮都有变化
 await p.locator('#routeBtn').click();await routeRow('两站').click();await preview().click();await p.locator('#tpPlay').click();
 for(const sel of ['#tpRestart','#tpPlay','#tourPlay [data-rate="1"]','#tourPlay [data-cam="fp"]','#tourBack','#tourExit','#tpPick']){
  const loc=p.locator(sel).first();await p.mouse.move(5,890);const s0=await loc.evaluate(e=>{const c=getComputedStyle(e);return c.backgroundColor+c.borderColor;});
  await loc.hover();const s1=await loc.evaluate(e=>{const c=getComputedStyle(e);return c.backgroundColor+c.borderColor;});assert.notEqual(s1,s0,sel+' 悬停无变化');
 }
 await p.mouse.move(5,890);const tk=p.locator('#tourPlay .tp-tick').first();const k0=await tk.evaluate(e=>getComputedStyle(e).transform);await tk.hover();assert.notEqual(await tk.evaluate(e=>getComputedStyle(e).transform),k0,'刻度悬停');
 console.log('PASS 播放条所有按钮、刻度悬停有变化');
 assert.deepEqual(errors,[],'页面不应有报错：'+errors.join('\n'));console.log('PASS 全程无页面异常');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
