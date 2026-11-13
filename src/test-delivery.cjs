// 交付回归（浏览器，真下载/真导入/真隔离）：先 python3 src/build.py，再 node src/test-delivery.cjs（需 8876 预览在跑；旧版编辑器取自 git 提交 dd303aa）
const {chromium}=require('/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');const assert=require('node:assert/strict');const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'../tmp/delivery');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'old-editor.html'),require('child_process').execSync('git show dd303aa:index.html',{cwd:__dirname,maxBuffer:1e9}));
const S={pois:[{id:'p1',objectId:1,num:1,name:'电视',dwell:5,stand:[-1.6,1.5]},{id:'p2',objectId:6,num:2,name:'试衣镜',dwell:8,stand:[-0.9,1]}],
 groups:[{id:'g1',name:'北过道·东→西',approach:'north-ew',entry:[-4,3.2],exit:[3,3.2],routes:[{id:'r1',name:'看两块屏',speed:1,eyeHeight:1.75,stops:[{poiId:'p1'},{poiId:'p2',dwell:12}]}]}]};
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const errors=[];const mk=async()=>{const c=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());return {c,p};};
 const ready=p=>p.waitForFunction(()=>window.editor&&window.editor.tourPlan);
 const download=async(p,sel,name)=>{const [d]=await Promise.all([p.waitForEvent('download'),p.locator(sel).click()]);const f=path.join(dir,name);await d.saveAs(f);return f;};
 // 甲：带路线的方案，真点按钮导出 JSON + 下载编辑器
 const A=await mk();await A.p.goto('http://127.0.0.1:8876/');await ready(A.p);
 await A.p.evaluate(s=>{editor.checkpoint();editor.setTour(s);editor.persist();},S);
 await A.p.selectOption('#exportScope','all');
 const newJson=await download(A.p,'#save','new-with-tour.json');const newHtml=await download(A.p,'#saveEditor','new-editor.html');
 const exported=JSON.parse(fs.readFileSync(newJson,'utf8'));assert.deepEqual(exported.plans[0].layout.tour,S);console.log('PASS 真点「导出 JSON」，文件里带路线');
 // 乙：隔离环境 + 断网，打开下载的离线编辑器，导入刚才的 JSON
 const B=await mk();await B.c.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());await B.c.setOffline(true);
 await B.p.goto('file://'+newHtml);await ready(B.p);
 assert.equal(await B.p.evaluate(()=>editor.tour().pois.length),0);
 await B.p.locator('#importFile').setInputFiles(newJson);await B.p.waitForFunction(()=>document.querySelectorAll('#tabs button').length>=2);
 assert.deepEqual(await B.p.evaluate(()=>editor.tour()),S);
 await B.p.locator('#routeBtn').click();await B.p.waitForSelector('#rtPlan rect.rt-booth');
 const ui=await B.p.evaluate(()=>({badges:document.querySelectorAll('#rtPlan g.rt-badge').length,left:document.querySelector('#rtLeft').textContent}));
 assert.equal(ui.badges,2);assert.ok(ui.left.includes('看两块屏'),ui.left);
 await B.p.locator('#rtLeft .rt-row.r',{hasText:'看两块屏'}).click();await B.p.locator('#rtRight button:has-text("在 3D 中预览")').click();await B.p.waitForSelector('#tpPlay');assert.equal(await B.p.evaluate(()=>editor.tourPlayer.isOpen()),true);
 await B.p.waitForTimeout(600);assert.ok(await B.p.evaluate(()=>editor.tourPlayer.debug().t)>0,'播放应在走');
 console.log('PASS 断网 + file:// 打开下载的编辑器，导入后图纸上两个兴趣点、路线在，3D 预览能播');
 await B.c.close();
 // 丙：另一个隔离浏览器配置（联网版）导入同一 JSON，界面看到同样的兴趣点和路线
 const C=await mk();await C.p.goto('http://127.0.0.1:8876/?builtin');await ready(C.p);
 await C.p.locator('#importFile').setInputFiles(newJson);await C.p.waitForFunction(()=>document.querySelectorAll('#tabs button').length>=2);
 await C.p.locator('#routeBtn').click();await C.p.waitForSelector('#rtPlan rect.rt-booth');
 assert.equal(await C.p.locator('#rtPlan g.rt-badge').count(),2);assert.ok((await C.p.locator('#rtLeft').textContent()).includes('看两块屏'));
 console.log('PASS 另一个隔离浏览器导入，兴趣点和路线与导出方一致');
 await C.c.close();
 // 丁：旧版（dd303aa）编辑器——真导出旧格式文件，再导入新版；新文件放进旧版：不报错、路线丢失
 const O=await mk();await O.p.goto('file://'+path.join(dir,'old-editor.html'));await O.p.waitForFunction(()=>window.editor);
 const oldJson=await download(O.p,'#save','old-export.json');assert.ok(!('tour' in JSON.parse(fs.readFileSync(oldJson,'utf8')).plans[0].layout));
 const N=await mk();await N.p.goto('http://127.0.0.1:8876/?builtin');await ready(N.p);const before=await N.p.locator('#tabs button').count();
 await N.p.locator('#importFile').setInputFiles(oldJson);await N.p.waitForFunction(n=>document.querySelectorAll('#tabs button').length>n,before);
 assert.equal(await N.p.evaluate(()=>editor.tour().pois.length),0);assert.ok(await N.p.evaluate(()=>editor.layout().objects.length)>=3);
 await N.p.locator('#routeBtn').click();await N.p.waitForSelector('#rtPlan rect.rt-booth');console.log('PASS 旧版导出的文件导入新版：物料在、没有路线、路线图纸能打开、无报错');
 await N.c.close();
 await O.p.locator('#importFile').setInputFiles(newJson);await O.p.waitForFunction(()=>document.querySelectorAll('#tabs button').length>=2);
 const lost=await O.p.evaluate(()=>({tour:editor.layout().tour,n:editor.layout().objects.length,exp:JSON.stringify(editor.exportData('all'))}));
 assert.equal(lost.tour,undefined);assert.ok(!lost.exp.includes('"tour"'));assert.ok(lost.n>=3);console.log('PASS 新文件在旧版编辑器打开：方案能开、路线丢失（已知代价）');
 await O.c.close();
 // 戊：多窗口保护（同一浏览器两个窗口）
 const W=await mk();await W.p.goto('http://127.0.0.1:8876/?builtin');await ready(W.p);
 const w2=await W.c.newPage();w2.on('dialog',d=>d.dismiss());await w2.goto('http://127.0.0.1:8876/?builtin');await w2.waitForFunction(()=>window.editor);
 await w2.evaluate(()=>{editor.checkpoint();editor.objects()[0].position.x=1.11;editor.persist();});
 await W.p.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('另一窗口'));
 await W.p.evaluate(()=>{editor.checkpoint();editor.objects()[0].position.x=2.22;editor.persist();});
 const kept=await w2.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('ces-workspace-v2'));return JSON.parse(localStorage[k]).plans[0].layout.objects[0].position[0];});
 assert.equal(kept,1.11);console.log('PASS 多窗口：旧窗口提示“另一窗口已改动”，且不覆盖新窗口的存档');
 assert.deepEqual(errors,[]);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
