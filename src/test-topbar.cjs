// 顶导改版测试（浏览器）：方案标签的改名 / 复制 / 删除 / 拖动排序、三模式标签、导出菜单、画布浮层清理。
// 先 python3 src/build.py，再 node src/test-topbar.cjs（需 8876 预览在跑）
const {chromium}=require('/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const ctx=await b.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8876/?builtin');await p.waitForFunction(()=>window.editor&&window.editor.tourPlan);
 const names=()=>p.locator('#tabs .tab .name').allTextContents();
 const tab=i=>p.locator('#tabs .tab').nth(i);
 const modeOn=()=>p.evaluate(()=>['routeBtn','modeBooth','decalMode'].filter(id=>document.getElementById(id).getAttribute('aria-selected')==='true'));

 // 1 顶导只剩：左方案标签、中三模式、右导入导出；旧东西都没了
 const bar=await p.evaluate(()=>({strong:!!document.querySelector('header strong'),small:!!document.querySelector('header small'),undo:!!document.getElementById('undo'),redo:!!document.getElementById('redo'),planbar:!!document.getElementById('planbar'),scope:!!document.getElementById('exportScope'),badge:!!document.querySelector('.badge'),rename:!!document.getElementById('rename'),
  modes:[...document.querySelectorAll('#modes button')].map(e=>e.textContent),actions:[...document.querySelectorAll('header .actions>*')].filter(e=>!e.hidden).map(e=>e.id),viewbar:[...document.querySelectorAll('#viewbar button')].map(e=>e.textContent),editorTitle:document.getElementById('saveEditor').title,editorText:document.getElementById('saveEditor').textContent.trim(),editorSvg:!!document.querySelector('#saveEditor svg'),status:document.getElementById('saveStatus').hidden}));
 assert.deepEqual([bar.strong,bar.small,bar.undo,bar.redo,bar.planbar,bar.scope,bar.badge,bar.rename],[false,false,false,false,false,false,false,false]);
 assert.deepEqual(bar.modes,['展台','路线','物料']);assert.deepEqual(bar.actions,['import','save','saveEditor']);{const g=await p.evaluate(()=>{const t=document.getElementById('tabs').getBoundingClientRect(),m=document.getElementById('modes').getBoundingClientRect();return {gap:t.left-m.right,left:m.left,hint:getComputedStyle(document.querySelector('#helpText')).backgroundColor,helpBorder:getComputedStyle(document.querySelector('#helpText')).borderTopWidth,help:document.getElementById('helpText').textContent};});assert.ok(g.gap>=8&&g.gap<=24,'组间距 '+g.gap);assert.ok(g.left<=16,'三标签在最左 '+g.left);assert.equal(g.helpBorder,'0px');assert.equal(g.help,'WASD 行走 · 空格切换视角');}
 assert.deepEqual(bar.viewbar,['会场全景','透视','俯视','正视','游客视图']);
 assert.equal(bar.editorTitle,'下载编辑器');assert.equal(bar.editorText,'');assert.equal(bar.editorSvg,true);assert.equal(bar.status,true,'状态栏平时不显示');
 assert.equal((await p.locator('#import').textContent()),'导入');assert.equal((await p.locator('#save').textContent()),'导出');
 const order=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect();return {import:r('import'),save:r('save'),gap:r('save').left-r('import').right};});assert.ok(order.gap>=0&&order.gap<=12,'导入导出左右相邻：'+order.gap);
 console.log('PASS 顶导：左方案标签、中间 路线/展台/贴图、右边 导入 导出 + 下载图标；标题、撤销重做、导出范围下拉、尺寸角标都没了');

 // 2 画布：指南针在右上角，没有尺寸文字，视图栏里没有贴图
 const cv=await p.evaluate(()=>{const v=document.getElementById('view').getBoundingClientRect(),c=document.getElementById('compass').getBoundingClientRect();return {top:c.top-v.top,right:v.right-c.right};});
 assert.ok(cv.top<=20&&cv.right<=20,'指南针贴右上角 '+JSON.stringify(cv));
 console.log('PASS 指南针在画布右上角');

 // 3 三模式互斥切换
 assert.deepEqual(await modeOn(),['modeBooth']);
 await p.locator('#routeBtn').click();await p.waitForSelector('#rtPlan rect.rt-booth');assert.deepEqual(await modeOn(),['routeBtn']);
 await p.locator('#decalMode').click();assert.deepEqual(await modeOn(),['decalMode']);assert.equal(await p.evaluate(()=>editor.tourPlan.isOpen()),false);assert.equal(await p.evaluate(()=>editor.decals.debug().mode),true);
 await p.locator('#routeBtn').click();assert.deepEqual(await modeOn(),['routeBtn']);assert.equal(await p.evaluate(()=>editor.decals.debug().mode),false);
 await p.locator('#modeBooth').click();assert.deepEqual(await modeOn(),['modeBooth']);assert.equal(await p.evaluate(()=>editor.tourPlan.isOpen()),false);
 await p.locator('#decalMode').click();await p.keyboard.press('Escape');assert.deepEqual(await modeOn(),['modeBooth'],'Esc 退出贴图后「展台」亮起');
 await p.locator('#modeBooth').click();assert.deepEqual(await modeOn(),['modeBooth'],'点已选中的标签不会切走');
 console.log('PASS 路线 / 展台 / 贴图 互相切换，当前的高亮，Esc 退出贴图回到展台');

 // 4 快捷键撤销 / 重做
 const n0=await p.evaluate(()=>editor.objects().length);
 await p.evaluate(()=>{editor.checkpoint();});await p.evaluate(()=>document.querySelector('#libraryToggle').click());await p.locator('[data-add=chair]').click();assert.equal(await p.evaluate(()=>editor.objects().length),n0+1);
 await p.keyboard.press('Control+z');assert.equal(await p.evaluate(()=>editor.objects().length),n0);await p.keyboard.press('Control+Shift+z');assert.equal(await p.evaluate(()=>editor.objects().length),n0+1);
 console.log('PASS 没有按钮，⌘/Ctrl+Z、Shift+Z 仍可撤销重做');

 // 5 方案标签：只剩一个时没有删除；另存；改名（双击）不改标签高度
 assert.equal(await p.locator('#tabs .tab-x').count(),0,'只有一个方案时不给删');
 await p.locator('#newPlan').click();assert.equal(await p.locator('#tabs .tab').count(),2);assert.equal(await tab(1).getAttribute('aria-selected'),'true');
 const h0=(await tab(1).boundingBox()).height;await tab(1).dblclick();const inp=p.locator('#tabs input.tab-edit');await inp.waitFor();const h1=(await tab(1).boundingBox()).height;assert.equal(h0,h1,'改名时标签高度不变');
 await inp.fill('展区 A');await inp.press('Enter');assert.deepEqual((await names())[1],'展区 A');assert.equal(await p.locator('#tabs input').count(),0);
 await tab(1).dblclick();await p.locator('#tabs input.tab-edit').fill('不要改');await p.keyboard.press('Escape');assert.equal((await names())[1],'展区 A','Esc 放弃改名');
 await tab(0).dblclick();await p.locator('#tabs input.tab-edit').fill('');await p.keyboard.press('Enter');assert.notEqual((await names())[0],'','空名字不保存');
 console.log('PASS 单个方案没有 ×；另存；双击改名（高度不跳、Esc 放弃、空名不存）');

 // 6 右键复制：复制品紧挨着原标签、带同样的物品
 const objs=await p.evaluate(()=>editor.objects().length);
 await tab(1).click({button:'right'});assert.deepEqual(await p.locator('.ctx-menu button').allTextContents(),['复制','重命名','删除']);await p.locator('.ctx-menu [data-key=copy]').click();
 assert.deepEqual((await names()).slice(1,3),['展区 A','展区 A 副本']);assert.equal(await tab(2).getAttribute('aria-selected'),'true');assert.equal(await p.evaluate(()=>editor.objects().length),objs);
 await p.evaluate(()=>{editor.checkpoint();editor.objects()[0].position.x=1.23;editor.persist();});await tab(1).click();assert.notEqual(await p.evaluate(()=>editor.objects()[0].position.x),1.23,'复制品和原方案互不影响');
 await tab(1).click({button:'right'});await p.keyboard.press('Escape');assert.equal(await p.locator('.ctx-menu').count(),0,'Esc 收起菜单');
 console.log('PASS 右键「复制」：副本紧跟原标签、物品一样、互不影响');

 // 7 拖动排序：把第一个标签拖到最后；点击不误触发切换；刷新后顺序还在
 const before=await names();const a=await tab(0).boundingBox(),z=await tab(before.length-1).boundingBox();
 await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(z.x+z.width-4,z.y+z.height/2,{steps:8});assert.equal(await p.locator('#tabs .ins-after').count(),1,'拖动时有插入位置的竖线');await p.mouse.up();
 assert.deepEqual(await names(),[...before.slice(1),before[0]]);assert.equal(await p.locator('#tabs .ins-after,#tabs .ins-before,#tabs .dragging').count(),0);
 const activeBefore=await p.evaluate(()=>document.querySelector('#tabs .tab.active .name').textContent);await p.reload();await p.waitForFunction(()=>window.editor&&window.editor.tourPlan);assert.deepEqual(await names(),[...before.slice(1),before[0]],'刷新后顺序还在');
 console.log('PASS 拖动排序：有插入线，松手后换位，刷新还在');

 // 8 删除：先弹确认；取消不删；删中间的、删当前的；最后一个删不了
 const nm=await names();const x=tab(0).locator('.tab-x');await tab(0).hover();await x.click();assert.ok((await p.locator('.dk-dialog p').textContent()).includes(nm[0]));await p.locator('.dk-dialog .dk-btn:has-text("取消")').click();assert.equal((await names()).length,nm.length,'取消不删');
 await tab(0).hover();await tab(0).locator('.tab-x').click();await p.keyboard.press('Escape');assert.equal(await p.locator('.dk-modal').count(),0);assert.equal((await names()).length,nm.length,'Esc 也是取消');
 const act=await p.evaluate(()=>document.querySelector('#tabs .tab.active .name').textContent);const other=nm.findIndex(n=>n!==act);
 await tab(other).hover();await tab(other).locator('.tab-x').click();await p.locator('.dk-dialog .dk-btn:has-text("删除")').click();assert.equal((await names()).length,nm.length-1);assert.equal(await p.evaluate(()=>document.querySelector('#tabs .tab.active .name').textContent),act,'删别的方案，当前方案不变');
 const cur=await p.evaluate(()=>document.querySelector('#tabs .tab.active .name').textContent);const keep=(await names()).filter(n=>n!==cur);
 await p.locator('#tabs .tab.active').click({button:'right'});await p.locator('.ctx-menu [data-key=delete]').click();await p.locator('.dk-dialog .dk-btn:has-text("删除")').click();
 const left=await names();assert.equal(left.length,nm.length-2);assert.ok(!left.includes(cur));assert.equal(await p.locator('#tabs .tab.active').count(),1,'删当前的，自动切到相邻方案');assert.ok(await p.evaluate(()=>editor.objects().length)>0);
 while((await names()).length>1){await p.locator('#tabs .tab').last().click({button:'right'});await p.locator('.ctx-menu [data-key=delete]').click();await p.locator('.dk-dialog .dk-btn:has-text("删除")').click();}
 assert.equal(await p.locator('#tabs .tab-x').count(),0);await p.locator('#tabs .tab').first().click({button:'right'});assert.equal(await p.locator('.ctx-menu [data-key=delete]').isDisabled(),true);await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>window.editor&&window.editor.tourPlan);assert.equal((await names()).length,1,'删除后刷新也是删掉的');
 console.log('PASS 删除：弹确认（取消 / Esc 不删）、删非当前、删当前自动切走、最后一个不能删、刷新仍是删掉的');

 // 9 路线模式里也能切方案、另存
 await p.locator('#newPlan').click();await p.locator('#routeBtn').click();await p.waitForSelector('#rtPlan rect.rt-booth');
 await tab(0).click();assert.equal(await tab(0).getAttribute('aria-selected'),'true');assert.deepEqual(await modeOn(),['routeBtn']);assert.equal(await p.locator('#rtPlan').isVisible(),true);
 console.log('PASS 路线模式里方案标签照常能用');await p.locator('#modeBooth').click();

 // 10 导出菜单：点开、再点收起、点外面收起、Esc 收起
 await p.locator('#save').click();assert.deepEqual(await p.locator('.ctx-menu button').allTextContents(),['导出当前方案','导出全部方案']);
 await p.locator('#save').click();assert.equal(await p.locator('.ctx-menu').count(),0,'再点导出按钮收起，不会马上又弹出');
 await p.locator('#save').click();await p.mouse.click(700,500);assert.equal(await p.locator('.ctx-menu').count(),0,'点空白收起');
 await p.locator('#save').click();await p.keyboard.press('Escape');assert.equal(await p.locator('.ctx-menu').count(),0,'Esc 收起');
 const [dl]=await Promise.all([p.waitForEvent('download'),(async()=>{await p.locator('#save').click();await p.locator('.ctx-menu [data-key=all]').click();})()]);assert.ok(dl.suggestedFilename().includes('全部方案'));
 console.log('PASS 导出：点开出现「当前方案 / 全部方案」，点空白 / Esc / 再点按钮都收起，选「全部」下载全部方案');

 // 11 图层里的显隐按钮颜色比文字淡
 const col=await p.evaluate(()=>{const e=document.querySelector('#objects button.icon-button'),t=document.querySelector('#objects button:not(.icon-button)');return [getComputedStyle(e).color,getComputedStyle(t).color];});
 const lum=c=>c.match(/\d+/g).slice(0,3).reduce((s,v)=>s+Number(v),0);assert.ok(lum(col[0])>lum(col[1])+150,'显隐图标比图层名字淡：'+col);
 console.log('PASS 图层的显示 / 隐藏按钮是弱灰色');

 // 12 游客视图按钮
 await p.locator('#walk').click();assert.equal((await p.locator('#walk').textContent()).trim(),'退出游客视图');await p.keyboard.press('Escape');assert.equal((await p.locator('#walk').textContent()).trim(),'游客视图');
 console.log('PASS 「步行浏览」改名为「游客视图」');
 // 13 游客视图里别的视图按钮照常能点：点了就退出游客视图并切过去；不锁鼠标
 for(const v of ['venue','perspective','top','front']){await p.locator('#walk').click();assert.deepEqual(await p.evaluate(()=>[editor.walking(),!!document.pointerLockElement]),[true,false]);
  await p.locator('[data-view='+v+']').click();assert.deepEqual(await p.evaluate(()=>[editor.walking(),document.querySelector('#walk').textContent]),[false,'游客视图']);assert.equal(await p.locator('[data-view='+v+']').evaluate(e=>e.classList.contains('active')),true);}
 console.log('PASS 游客视图下点会场全景 / 透视 / 俯视 / 正视都能切回并高亮');
 // 14 物料模式：没有物品入口；左栏换成贴面面板（无图层 / 场地），画布里没有「管理贴面」按钮
 await p.locator('#modeBooth').click();assert.equal(await p.locator('#libraryToggle').isVisible(),true);assert.equal(await p.locator('#layers').isVisible(),true);
 await p.locator('#decalMode').click();assert.equal(await p.locator('#libraryToggle').isVisible(),false);assert.equal(await p.locator('#library').isVisible(),false);
 assert.equal(await p.locator('#layers').isVisible(),false);assert.equal(await p.locator('#roomPanel').isVisible(),false);assert.equal(await p.locator('#decalSide').isVisible(),true);
 assert.equal(await p.locator('#view .dk-hint,#view button:has-text("管理贴面")').count(),0);assert.ok(await p.locator('aside button:has-text("管理贴面")').isVisible());
 // 左栏清单：只列已标出的可贴面，写明具体是哪个面；点一行 → 左栏换成这一面的编辑，3D 里这一面亮起；Esc 回清单
 await p.evaluate(()=>{const o=editor.objects().find(o=>o.userData.type==='desk');o.userData.decalFaces=['front','top'];editor.decals.drawObject(o);editor.decals.refresh();});
 const rows=await p.locator('#decalSide .dk-item').allTextContents();assert.ok(rows.some(t=>t.includes('正面'))&&rows.some(t=>t.includes('台面')),'清单写明具体的面：'+rows);
 assert.ok(await p.locator('#decalSide').evaluate(e=>e.scrollHeight>e.clientHeight?getComputedStyle(e).overflowY==='auto':true),'清单超长时能滚动');await p.locator('#decalSide .dk-item',{hasText:'台面'}).click();assert.equal(await p.locator('#decalSide .dk-head').isVisible(),true);assert.ok((await p.evaluate(()=>editor.decals.debug().current)||'').endsWith('|top'),'3D 里该面亮起');
 await p.keyboard.press('Escape');assert.equal(await p.locator('#decalSide .dk-item').count(),rows.length);assert.equal(await p.evaluate(()=>editor.decals.debug().current),null);
 console.log('  左栏说明：',(await p.locator('#decalSide .dk-explain').first().textContent()));
 await p.locator('#modeBooth').click();assert.equal(await p.locator('#libraryToggle').isVisible(),true);assert.equal(await p.locator('#layers').isVisible(),true);
 console.log('PASS 物料模式：无物品入口，左栏换成贴面面板，切回展台恢复');
 assert.deepEqual(errors,[]);console.log('PASS 全程无页面异常');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
