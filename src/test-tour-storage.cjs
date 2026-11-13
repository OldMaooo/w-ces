// tour 数据的保存 / 撤销 / 导入导出接入（浏览器）。先 python3 src/build.py，再 node src/test-tour-storage.cjs（需 8876 预览在跑）
const {chromium}=require('/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');const assert=require('node:assert/strict');
const sample=()=>({pois:[{id:'p1',objectId:1,num:1,name:'电视',dwell:5,stand:[0,1.045]},{id:'p2',objectId:2,num:3,name:'前台',dwell:8,stand:[0,1.325]}],
 groups:[{id:'g1',name:'北过道·东→西',approach:'north-ew',entry:[-6,5],exit:[9,5],routes:[{id:'r1',name:'只路过',speed:1,eyeHeight:1.75,stops:[]},{id:'r2',name:'看电视',speed:1,eyeHeight:1.75,stops:[{poiId:'p1'},{poiId:'p2',dwell:12}]}]}]});
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const p=await (await b.newContext({viewport:{width:1440,height:960}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 await p.goto('http://127.0.0.1:8876/');await p.waitForFunction(()=>window.editor&&window.editor.validateLayout);
 const S=sample();
 // 1 旧数据没有 tour：能读，layout 里也不多出 tour 字段
 const old=await p.evaluate(()=>{const l=editor.layout();const v=editor.validateLayout({room:l.room,objects:l.objects});return {hasKeyBefore:'tour' in l,hasKey:'tour' in v,n:v.objects.length};});
 assert.equal(old.hasKeyBefore,false);assert.equal(old.hasKey,false);assert.ok(old.n>=3);console.log('PASS 旧数据没有 tour 照常读，空 tour 不写进 layout');
 // 2 好 tour：校验后保留
 const good=await p.evaluate(s=>{const l=editor.layout();return editor.validateLayout({room:l.room,objects:l.objects,tour:s}).tour;},S);assert.deepEqual(good,S);console.log('PASS validateLayout 保留合法 tour');
 // 3 坏 tour：丢弃，物料不丢，有提示
 const bad=await p.evaluate(s=>{const l=editor.layout(),t=JSON.parse(JSON.stringify(s));t.groups[0].routes[1].speed=-1;const v=editor.validateLayout({room:l.room,objects:l.objects,tour:t});return {hasTour:'tour' in v,n:v.objects.length,want:l.objects.length,notice:editor.tourNotice()};},S);
 assert.equal(bad.hasTour,false);assert.equal(bad.n,bad.want);assert.ok(bad.notice.includes('路线'),'应提示路线数据无效：'+bad.notice);console.log('PASS 坏 tour 被丢弃、物料不丢、有提示');
 const evil=await p.evaluate(()=>{const l=editor.layout();return [null,'x',5,[],{pois:1,groups:[]},{pois:[],groups:[{}]}].map(t=>{try{const v=editor.validateLayout({room:l.room,objects:l.objects,tour:t});return !('tour' in v)&&v.objects.length===l.objects.length;}catch(e){return 'throw:'+e.message;}});});
 assert.deepEqual(evil,[true,true,true,true,true,true]);console.log('PASS 各种乱七八糟的 tour 都只是被丢弃，不抛错');
 // 4 restore：带 tour / 不带 tour 都对
 const rs=await p.evaluate(s=>{const l=editor.layout();editor.restore({...l,tour:s});const a=editor.layout().tour;editor.restore(l);return {withTour:a,after:'tour' in editor.layout()};},S);
 assert.deepEqual(rs.withTour,S);assert.equal(rs.after,false);console.log('PASS restore 带上 / 清掉 tour');
 // 5 保存：刷新后还在（用 persist 落盘）
 await p.evaluate(s=>{editor.setTour(s);editor.persist();},S);await p.reload();await p.waitForFunction(()=>window.editor&&window.editor.validateLayout);
 assert.deepEqual(await p.evaluate(()=>editor.layout().tour),S);console.log('PASS 刷新后 tour 还在');
 // 6 撤销 / 重做
 await p.evaluate(()=>{editor.checkpoint();const t=editor.tour();t.groups[0].name='改过的名字';editor.persist();});
 assert.equal(await p.evaluate(()=>editor.tour().groups[0].name),'改过的名字');
 await p.locator('#undo').click();assert.equal(await p.evaluate(()=>editor.tour().groups[0].name),'北过道·东→西');
 await p.locator('#redo').click();assert.equal(await p.evaluate(()=>editor.tour().groups[0].name),'改过的名字');
 await p.locator('#undo').click();console.log('PASS 撤销重做带 tour');
 // 7 删物料 → tour 原样（站变失效，不丢）→ 撤销恢复
 const del=await p.evaluate(()=>{const o=editor.objects().find(x=>x.userData.id===2);editor.checkpoint?.();return !!o;});
 assert.ok(del);
 await p.evaluate(()=>{window.__before=JSON.stringify(editor.tour());});
 await p.evaluate(()=>{const o=editor.objects().find(x=>x.userData.id===2);o&&editor.select(o);});await p.locator('#delete').click();
 assert.equal(await p.evaluate(()=>JSON.stringify(editor.tour())),await p.evaluate(()=>window.__before),'删物料不改 tour');
 await p.locator('#undo').click();assert.ok(await p.evaluate(()=>editor.objects().some(x=>x.userData.id===2)));assert.equal(await p.evaluate(()=>JSON.stringify(editor.tour())),await p.evaluate(()=>window.__before));console.log('PASS 删物料不丢 tour，撤销后物料回来');
 // 8 复制物料不带兴趣点
 const pc=await p.evaluate(()=>{const o=editor.objects().find(x=>x.userData.id===1);editor.select(o);return editor.tour().pois.length;});
 await p.locator('#copy').click();assert.equal(await p.evaluate(()=>editor.tour().pois.length),pc);console.log('PASS 复制物料不复制兴趣点');await p.locator('#undo').click();
 // 9 导出 → 导入：tour 还在，且是独立副本
 const exp=await p.evaluate(()=>JSON.stringify(editor.exportData('current')));
 assert.ok(JSON.parse(exp).plans[0].layout.tour,'导出文件里要有 tour');
 await p.locator('#importFile').setInputFiles({name:'a.json',mimeType:'application/json',buffer:Buffer.from(exp)});
 await p.waitForFunction(()=>document.querySelectorAll('#tabs button').length===2);
 assert.deepEqual(await p.evaluate(()=>editor.tour()),S);console.log('PASS 导出再导入 tour 还在');
 await p.evaluate(()=>{editor.checkpoint();editor.tour().groups[0].name='只改第二个方案';editor.persist();});
 await p.locator('#tabs button').first().click();assert.equal(await p.evaluate(()=>editor.tour().groups[0].name),'北过道·东→西');
 await p.locator('#tabs button').nth(1).click();assert.equal(await p.evaluate(()=>editor.tour().groups[0].name),'只改第二个方案');console.log('PASS 多方案切换，tour 互不串');
 // 10 另存方案：tour 深拷贝
 await p.locator('#newPlan').click();await p.waitForFunction(()=>document.querySelectorAll('#tabs button').length===3);
 assert.equal(await p.evaluate(()=>editor.tour().groups[0].name),'只改第二个方案');
 await p.evaluate(()=>{editor.checkpoint();editor.tour().groups[0].name='第三个';editor.persist();});
 await p.locator('#tabs button').nth(1).click();assert.equal(await p.evaluate(()=>editor.tour().groups[0].name),'只改第二个方案');console.log('PASS 另存方案带 tour 且互不串');
 // 11 导入一个带坏 tour 的文件：物料导入成功，提示路线被忽略
 const badFile=JSON.parse(exp);badFile.plans[0].layout.tour.groups[0].approach='乱写';
 let dialogText='';p.removeAllListeners('dialog');p.on('dialog',d=>{dialogText=d.message();d.dismiss();});
 await p.locator('#importFile').setInputFiles({name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(badFile))});
 await p.waitForFunction(()=>document.querySelectorAll('#tabs button').length===4);
 assert.ok(await p.evaluate(()=>editor.objects().length)>=3);assert.equal(await p.evaluate(()=>editor.tour().groups.length+editor.tour().pois.length),0);assert.ok(dialogText.includes('路线'),'导入时要提示路线被忽略：'+dialogText);console.log('PASS 导入坏 tour：物料照常进来，提示路线已忽略');
 assert.deepEqual(errors,[],'页面不应有报错：'+errors.join('\n'));console.log('PASS 全程无页面异常');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
