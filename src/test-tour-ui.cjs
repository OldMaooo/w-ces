// 路线图纸编辑模式的界面测试（浏览器）。先 python3 src/build.py，再 node src/test-tour-ui.cjs（需 8876 预览在跑）
const {chromium}=require('/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const ctx=await b.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
 const ready=()=>p.waitForFunction(()=>window.editor&&window.editor.tourPlan);
 await p.goto('http://127.0.0.1:8876/?builtin');await ready();
 const open=async()=>{if(!(await p.evaluate(()=>editor.tourPlan.isOpen())))await p.locator('#routeBtn').click();await p.waitForSelector('#rtPlan rect.rt-booth');};
 const seqs=()=>p.locator('#rtLeft .rt-row.r .rt-seq').allTextContents();
 const outside=async fn=>{await p.locator('#routeBtn').click();await fn();await open();};   // 路线模式里没有方案标签：要切方案先退出，再进来
 const clickObj=async id=>{await p.locator(`#rtPlan [data-o="${id}"]`).last().click();};
 const addRoute=async()=>{await p.locator('#rtLeft .rt-addroute').first().click();};

 // 1 进入 / 退出：图纸盖住 3D，退出后恢复
 await open();assert.equal(await p.locator('#routeBtn').textContent().then(t=>t.trim()),'退出路线');
 assert.ok(await p.locator('#rtPlan text.rt-vlabel').count()>=2);assert.ok(await p.locator('#rtPlan g.rt-compass').count()===1);assert.ok(await p.locator('#rtPlan g.rt-scale').count()===1);
 assert.equal(await p.locator('#rtPlan [data-o]').count()>=3,true,'图上应有物料轮廓');
 await p.locator('#routeBtn').click();assert.equal(await p.locator('#routeEdit').isHidden(),true);assert.equal((await p.locator('#routeBtn').textContent()).trim(),'路线');
 console.log('PASS 路线按钮进入 / 退出，图纸有过道、物料轮廓、指南针、比例尺');
 // 2 标兴趣点：电视(1)、前台(2)、机器人(3)
 await open();
 await clickObj(1);assert.ok(await p.locator('#rtRight button:has-text("设为兴趣点")').isVisible());
 for(const id of [1,3,2]){await clickObj(id);await p.locator('#rtRight button:has-text("设为兴趣点")').click();}
 const nums=await p.evaluate(()=>editor.tour().pois.map(x=>[x.objectId,x.num]));assert.deepEqual(nums,[[1,1],[3,2],[2,3]]);
 assert.equal(await p.locator('#rtPlan g.rt-badge').count(),3);assert.equal(await p.locator('#rtPlan circle.rt-stand').count(),3);assert.equal(await p.locator('#rtPlan line.rt-link').count(),3);
 console.log('PASS 点物料 → 设为兴趣点：编号圆标 + 站位点 + 虚线');
 // 3 改名 / 默认停留
 await clickObj(2);await p.locator('#rtRight input[type=text]').fill('前台洽谈');await p.locator('#rtRight input[type=text]').press('Enter');
 assert.equal(await p.evaluate(()=>editor.tour().pois.find(x=>x.objectId===2).name),'前台洽谈');
 await p.locator('#rtRight .rt-field:has-text("默认停留") input').fill('9');await p.locator('#rtRight .rt-field:has-text("默认停留") input').press('Enter');
 assert.equal(await p.evaluate(()=>editor.tour().pois.find(x=>x.objectId===2).dwell),9);
 console.log('PASS 兴趣点改名、改默认停留');
 // 4 大方案 + 3 个子方案
 await p.locator('#rtLeft h2 button').click();
 assert.equal(await p.evaluate(()=>editor.tour().groups.length),1);assert.equal(await p.evaluate(()=>editor.tour().groups[0].approach),'north-ew');
 assert.equal(await p.locator('#rtPlan g.rt-ep').count(),2);
 await addRoute();await p.keyboard.press('Enter');                                      // 只路过
 await addRoute();await p.locator('#rtPlan g.rt-badge[data-o="1"]').click();await p.locator('#rtPlan g.rt-badge[data-o="3"]').click();await p.keyboard.press('Enter');   // ①→②
 await addRoute();for(const id of [2,1,3])await p.locator(`#rtPlan g.rt-badge[data-o="${id}"]`).click();await p.locator('#rtRight button:has-text("完成")').click();   // 3 站
 assert.deepEqual(await seqs(),['入口 → 出口','入口 → ① → ② → 出口','入口 → ③ → ① → ② → 出口']);
 const lt=await p.locator('#rtLeft').textContent();assert.ok(!/\d+:\d\d/.test(lt),'列表里不显示时间：'+lt);assert.equal(await p.locator('#rtLeft .rt-meta').count(),0,'大方案右边没有统计项');
 console.log('PASS 大方案（北过道·东→西）+ 3 个子方案，编号串正确；列表不显示时间、大方案右边没有统计：',(await seqs()).join(' | '));
 // 5 路线不穿模：逐点量到每件障碍的距离 ≥ 0.3m
 const clearance=await p.evaluate(()=>{
  const objs=editor.snapshot(),r0=editor.tour().groups[0].routes;let worst=Infinity,bad=0;
  const dist=(o,px,pz)=>{if(['fascia','laptop','webcam','acrylicA4','acrylicA5'].includes(o.type))return Infinity;const c=Math.cos(o.rotation),s=Math.sin(o.rotation),dx=px-o.position[0],dz=pz-o.position[2],lx=dx*c-dz*s,lz=dx*s+dz*c;return Math.hypot(Math.max(Math.abs(lx)-o.size[0]/2,0),Math.max(Math.abs(lz)-o.size[2]/2,0));};
  for(const r of r0){const a=editor.tourPlan.analysisOf(r.id);if(!a.ok)bad++;for(const leg of a.legs)for(let i=1;i<leg.length;i++){const [x0,z0]=leg[i-1],[x1,z1]=leg[i],n=Math.max(1,Math.ceil(Math.hypot(x1-x0,z1-z0)/.05));for(let k=0;k<=n;k++){const px=x0+(x1-x0)*k/n,pz=z0+(z1-z0)*k/n;for(const o of objs)worst=Math.min(worst,dist(o,px,pz));}}}
  return {worst,bad};});
 assert.equal(clearance.bad,0);assert.ok(clearance.worst>=.29,'路线离物料最近 '+clearance.worst);console.log('PASS 3 条路线都通，离任何物料最近 '+clearance.worst.toFixed(2)+' 米（≥0.3 米人体半径）');
 // 6 站位点拖动：一次撤销就回去
 const standBefore=await p.evaluate(()=>JSON.stringify(editor.tour().pois[0].stand));
 const box=await p.locator('#rtPlan circle.rt-stand').first().boundingBox();
 await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2+40,box.y+box.height/2+8,{steps:6});await p.mouse.up();
 const standMoved=await p.evaluate(()=>JSON.stringify(editor.tour().pois[0].stand));assert.notEqual(standMoved,standBefore);
 await p.locator('#rtTools button[title="撤销"]').click();assert.equal(await p.evaluate(()=>JSON.stringify(editor.tour().pois[0].stand)),standBefore);
 await p.locator('#rtTools button[title="重做"]').click();assert.equal(await p.evaluate(()=>JSON.stringify(editor.tour().pois[0].stand)),standMoved);
 await p.locator('#rtTools button[title="撤销"]').click();   // 回到拖前，后面的断言按原位置
 console.log('PASS 拖站位点：松手记一步，撤销 / 重做各一次');
 // 没动就不记步
 // 7 右栏站列表：改单站停留、拖动排序、删站
 await p.locator('#rtLeft .rt-row.r').nth(2).click();
 const stopNames=()=>p.locator('#rtRight .rt-stop:not(.fixed) .rt-sname').allTextContents();
 assert.deepEqual((await stopNames()).map(t=>t.slice(0,1)),['③','①','②']);
 const d0=p.locator('#rtRight .rt-stop:not(.fixed) input.rt-dwell').first();await d0.fill('20');await d0.press('Enter');
 assert.equal(await p.evaluate(()=>editor.tour().groups[0].routes[2].stops[0].dwell),20);
 await p.locator('#rtRight .rt-stop:not(.fixed)').nth(0).locator('.rt-grip').dragTo(p.locator('#rtRight .rt-stop:not(.fixed)').nth(2));
 assert.deepEqual((await stopNames()).map(t=>t.slice(0,1)),['①','②','③']);assert.deepEqual(await seqs(),['入口 → 出口','入口 → ① → ② → 出口','入口 → ① → ② → ③ → 出口']);
 await p.locator('#rtRight .rt-stop:not(.fixed)').nth(1).hover();await p.locator('#rtRight .rt-stop:not(.fixed)').nth(1).locator('.rt-del').click();
 assert.deepEqual((await stopNames()).map(t=>t.slice(0,1)),['①','③']);
 await p.locator('#rtTools button[title="撤销"]').click();assert.deepEqual((await stopNames()).map(t=>t.slice(0,1)),['①','②','③']);
 console.log('PASS 单站停留、拖动排序、删站、撤销');
 // 8 走不通：造一圈前台围住笔记本，把它排进路线 → 红色虚线 + 文字提示
 await p.evaluate(()=>{editor.checkpoint();const l=editor.layout();const cx=-1.2,cz=-.2,mk=(type,id,x,z,rot,size)=>({type,id,size,position:[x,0,z],rotation:rot,visible:true,wallSnap:false});
  l.objects.push(mk('laptop',4,cx,cz,0,[.34,.24,.25]),mk('desk',5,cx,cz+.95,0,[1.6,1,.65]),mk('desk',6,cx,cz-.95,0,[1.6,1,.65]),mk('desk',7,cx+.95,cz,Math.PI/2,[1.6,1,.65]),mk('desk',8,cx-.95,cz,Math.PI/2,[1.6,1,.65]));
  l.tour.pois.push({id:'plap',objectId:4,num:4,name:'笔记本电脑',dwell:5,stand:[0,0]});l.tour.groups[0].routes[1].stops.splice(1,0,{poiId:'plap'});editor.restore(l);editor.persist();});
 await p.locator('#rtLeft .rt-row.r').nth(1).click();
 assert.ok(await p.locator('#rtPlan .rt-seg.bad').count()>=1,'图上要有红色虚线段');
 const warns=await p.locator('#rtRight .rt-warn').allTextContents();assert.ok(warns.some(t=>t.includes('① → ④ 走不通，被『前台』挡住')),'右栏要写清哪两站之间被谁挡住：'+warns.join('|'));
 assert.equal(await p.locator('#rtLeft .rt-row.r').nth(1).locator('.rt-flag').count(),1);
 console.log('PASS 走不通：红色虚线 + 右栏「'+warns[0].trim()+'」+ 左栏标「走不通」');
 await p.locator('#rtTools button[title="撤销"]').click();assert.equal(await p.locator('#rtPlan .rt-seg.bad').count(),0);assert.equal(await p.evaluate(()=>editor.objects().length),3);
 // 9 站位被挡：把兴趣点的站位拖进物料里 → 站位标红 + 提示
 await p.evaluate(()=>{editor.checkpoint();editor.tour().pois[1].stand=[0,0];editor.persist();editor.tourPlan.refresh();});
 assert.ok(await p.locator('#rtPlan circle.rt-stand.bad').count()>=1);
 const w2=await p.locator('#rtRight .rt-warn').allTextContents();assert.ok(w2.some(t=>t.includes('的站位被挡住了')),'站位被挡要提示：'+w2.join('|'));
 await p.locator('#rtTools button[title="撤销"]').click();assert.equal(await p.locator('#rtPlan circle.rt-stand.bad').count(),0);
 console.log('PASS 站位被挡：站位点标红 + 提示拖一下');
 // 10 失效：删掉电视（在 3D 里）→ 站变「已失效」，路线照算；撤销恢复
 await p.locator('#routeBtn').click();await p.evaluate(()=>editor.select(editor.objects().find(o=>o.userData.id===1)));await p.locator('#delete').click();await open();
 await p.locator('#rtLeft .rt-row.r').nth(1).click();
 assert.ok((await p.locator('#rtRight .rt-stop.stale').count())>=1);assert.ok((await p.locator('#rtRight .rt-stop.stale').first().textContent()).includes('已失效'));
 assert.equal(await p.locator('#rtLeft .rt-row.r').nth(1).locator('.rt-flag').count(),0,'失效的站跳过，路线照算');
 await p.locator('#routeBtn').click();await p.locator('#undo').click();await open();await p.locator('#rtLeft .rt-row.r').nth(1).click();
 assert.equal(await p.locator('#rtRight .rt-stop.stale').count(),0);console.log('PASS 物料被删 → 站「已失效」路线照算，撤销恢复');
 // 11 键盘：路线模式里空格 / WASD 不触发自由步行，Delete 不删物料
 await p.keyboard.press('Space');await p.keyboard.press('KeyW');await p.keyboard.press('Delete');
 assert.equal(await p.evaluate(()=>editor.walking()),false);assert.equal(await p.evaluate(()=>editor.objects().length),3);console.log('PASS 路线模式下空格 / W / Delete 不影响 3D 编辑');
 // 12 刷新后都在
 await p.reload();await ready();await open();assert.deepEqual(await seqs(),['入口 → 出口','入口 → ① → ② → 出口','入口 → ① → ② → ③ → 出口']);
 assert.equal((await seqs()).length,3);console.log('PASS 刷新后大方案、子方案、兴趣点都在：',(await seqs()).join(' | '));
 // 13 导出 → 导入：tour 在新方案里，且图纸能打开
 const exp=await p.evaluate(()=>JSON.stringify(editor.exportData('current')));await p.locator('#routeBtn').click();
 await p.locator('#importFile').setInputFiles({name:'x.json',mimeType:'application/json',buffer:Buffer.from(exp)});await p.waitForFunction(()=>document.querySelectorAll('#tabs button').length===2);
 await open();assert.equal((await seqs()).length,3);assert.equal(await p.locator('#rtPlan g.rt-badge').count(),3);console.log('PASS 导出再导入：新方案里图纸、子方案、编号圆标都在');
 // 14 复制方案 / 切换方案时图纸同步
 await outside(async()=>{await p.locator('#newPlan').click();await p.waitForFunction(()=>document.querySelectorAll('#tabs button').length===3);});assert.equal((await seqs()).length,3);
 await p.locator('#rtLeft .rt-row.g').hover();await p.locator('#rtLeft .rt-row.g button[title="删除"]').click();assert.equal((await seqs()).length,0);assert.ok(await p.locator('#rtLeft .rt-empty:has-text("还没有路线方案")').isVisible());assert.equal(await p.locator('#rtPlan g.rt-ep').count(),0);
 await outside(()=>p.locator('#tabs button').first().click());assert.equal((await seqs()).length,3,'删掉方案 3 的路线，不影响方案 1');
 await outside(()=>p.locator('#tabs button').nth(2).click());assert.equal((await seqs()).length,0,'回到方案 3 仍是空的');
 console.log('PASS 路线模式下切方案、另存方案，左栏随之刷新');
 // 15 复制 / 删除 / 重命名子方案与大方案
 await outside(()=>p.locator('#tabs button').nth(1).click());
 await p.locator('#rtLeft .rt-row.r').nth(0).hover();await p.locator('#rtLeft .rt-row.r').nth(0).locator('button[title="复制"]').click();assert.equal((await seqs()).length,4);
 await p.locator('#rtLeft .rt-row.r').nth(1).hover();await p.locator('#rtLeft .rt-row.r').nth(1).locator('button[title="删除"]').click();assert.equal((await seqs()).length,3);
 await p.locator('#rtLeft .rt-row.g').click();await p.locator('#rtRight select').selectOption('west-sn');
 assert.equal(await p.evaluate(()=>editor.tour().groups[0].approach),'west-sn');assert.equal((await p.locator('#rtLeft .rt-approach').textContent()).trim(),'西过道·南→北');
 console.log('PASS 复制 / 删除子方案、改来向');
 // 16 退出后自由步行、3D 编辑正常
 await p.locator('#routeBtn').click();await p.locator('#walk').click();assert.equal(await p.evaluate(()=>editor.walking()),true);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>editor.walking()),false);
 console.log('PASS 退出路线后自由步行、3D 编辑照常');
 // 17 所有能点的元素都有 hover 变化
 await p.locator('#tabs button').nth(1).click();await p.locator('#routeBtn').click();await p.waitForSelector('#rtPlan rect.rt-booth');await p.locator('#rtLeft .rt-row.r').nth(1).click();await p.locator('#rtPlan g.rt-badge').first().click();
 const probe=async(sel,props,pos)=>{const el=p.locator(sel).first();await p.mouse.move(2,2);const read=()=>el.evaluate((n,ps)=>ps.map(k=>getComputedStyle(n)[k]).join('|'),props);const a=await read();await el.hover(pos?{position:pos}:{});const b=await read();assert.notEqual(a,b,sel+' 悬停没有变化');};
 await probe('#rtTools button[title="适应画面"]',['backgroundColor']);await probe('#rtLeft .rt-row.g',['backgroundColor']);await probe('#rtLeft .rt-addroute',['backgroundColor']);
 await probe('#rtPlan .rt-obj[data-o="2"]',['fill'],{x:4,y:4});await probe('#rtPlan g.rt-badge circle',['fill']);await probe('#rtPlan circle.rt-stand:not(.sel)',['strokeWidth']);await probe('#rtPlan g.rt-ep circle',['stroke']);
 await probe('#rtRight .rt-stop:not(.fixed)',['backgroundColor']);await probe('#rtRight .rt-field input',['borderColor']);await probe('#rtRight .rt-foot button.primary',['backgroundColor']);
 console.log('PASS 工具条、列表行、虚线按钮、物料、编号圆标、站位点、入口出口点、站行、输入框、按钮悬停都有变化');

 // 18 进入路线编辑：顶栏只剩「退出路线」，没有方案标签条
 await p.evaluate(()=>{localStorage.removeItem('ces-route-panel-w');});
 const chrome=await p.evaluate(()=>{const vis=e=>e&&getComputedStyle(e).display!=='none'&&e.getClientRects().length>0;return {header:[...document.querySelectorAll('header .actions>*')].filter(vis).map(e=>e.id),planbar:vis(document.getElementById('planbar')),tabs:vis(document.getElementById('tabs')),aside:vis(document.querySelector('aside'))};});
 assert.deepEqual(chrome.header,['routeBtn']);assert.equal(chrome.planbar,false);assert.equal(chrome.tabs,false);assert.equal(chrome.aside,false);
 await p.locator('#routeBtn').click();const back=await p.evaluate(()=>[...document.querySelectorAll('header .actions>*')].filter(e=>getComputedStyle(e).display!=='none').length);assert.ok(back>=6,'退出路线后顶栏按钮回来');assert.equal(await p.locator('#planbar').isVisible(),true);await open();
 console.log('PASS 路线编辑里顶栏只剩「退出路线」，方案标签条和左侧栏收起，退出后都回来');
 // 19 左栏可拖宽，宽度记在本机
 const w0=await p.locator('#rtLeft').evaluate(e=>e.offsetWidth);const bar=await p.locator('#routeEdit .rt-split').boundingBox();
 await p.mouse.move(bar.x+3,300);await p.mouse.down();await p.mouse.move(bar.x+3+90,300,{steps:5});await p.mouse.up();
 const w1=await p.locator('#rtLeft').evaluate(e=>e.offsetWidth);assert.ok(Math.abs(w1-(w0+90))<=2,`宽度应变宽 90：${w0}→${w1}`);
 await p.mouse.move(bar.x+3+90,300);await p.mouse.down();await p.mouse.move(0,300,{steps:5});await p.mouse.up();assert.equal(await p.locator('#rtLeft').evaluate(e=>e.offsetWidth),240,'最窄 240');
 await p.mouse.move(240,300);await p.mouse.down();await p.mouse.move(1400,300,{steps:5});await p.mouse.up();assert.ok(await p.locator('#rtLeft').evaluate(e=>e.offsetWidth)<=1440*.7+1,'最宽不超过窗口 70%');
 await p.mouse.move(1000,300);await p.mouse.down();await p.mouse.move(bar.x+3+90-w0+w0,300);await p.mouse.up();const saved=await p.evaluate(()=>+localStorage.getItem('ces-route-panel-w'));assert.ok(saved>=240);
 await p.reload();await p.waitForFunction(()=>window.editor&&window.editor.tourPlan);await open();assert.equal(await p.locator('#rtLeft').evaluate(e=>e.offsetWidth),saved);
 console.log('PASS 左栏可拖宽（最窄 240、最宽 70%），刷新后宽度还在；方案数据里没有它：',saved);
 assert.ok(!JSON.stringify(await p.evaluate(()=>editor.layout())).includes('rt-'));
 // 20 选中行是浅底；只画选中子方案的路线；主按钮固定在右栏右下角
 const sel=await p.locator('#rtLeft .rt-row.r').first().click().then(()=>p.locator('#rtLeft .rt-row.r.sel').evaluate(e=>getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number)));assert.ok(sel.every(v=>v>=200),'选中行底色要浅：'+sel);
 const segsOf=()=>p.locator('#rtPlan polyline.rt-seg').count();const a1=await segsOf();
 const expect1=await p.evaluate(()=>{const id=editor.tourPlan.state().selRoute;return editor.tourPlan.analysisOf(id).segments.length;});assert.equal(a1,expect1,'只画选中子方案的路线');
 assert.equal(await p.locator('#rtPlan .rt-seg.dim').count(),0);
 await p.locator('#rtLeft .rt-row.r').nth(2).click();assert.equal(await segsOf(),await p.evaluate(()=>editor.tourPlan.analysisOf(editor.tourPlan.state().selRoute).segments.length));
 await p.locator('#rtLeft .rt-row.g').first().click();assert.equal(await segsOf(),0,'没选子方案就不画路线');
 const corner=async()=>{const r=await p.locator('#rtRight').boundingBox(),b=await p.locator('#rtRight .rt-foot button.primary').boundingBox();return [Math.round(r.x+r.width-(b.x+b.width)),Math.round(r.y+r.height-(b.y+b.height))];};
 await p.locator('#rtLeft .rt-row.r').first().click();const c1=await corner();assert.ok(c1[0]<=16&&c1[1]<=16,'主按钮在右下角：'+c1);
 await p.locator('#rtPlan [data-o="2"]').last().click();const c2=await corner();assert.deepEqual(c2,c1,'选物料后主按钮位置不变');
 assert.equal((await p.locator('#rtRight .rt-foot button.primary').textContent()).trim(),'在 3D 中预览');
 console.log('PASS 选中行浅底；只画选中子方案的路线；主按钮固定右下角：',c1);
 assert.deepEqual(errors,[],'页面不应有报错：'+errors.join('\n'));console.log('PASS 全程无页面异常');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
