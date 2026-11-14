// 默认方案：浏览器里没存过 → 载入 doc/Files/CES-02.json；存过 → 载入上次的。先 python3 src/build.py，再 node src/test-default-plan.cjs（需 8876 预览在跑）
const {chromium}=require('/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');const assert=require('node:assert/strict');
const want=require('../doc/Files/CES-02.json');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const p=await (await b.newContext()).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8876/');await p.waitForFunction(()=>window.editor);
 const got=await p.evaluate(()=>({tabs:[...document.querySelectorAll('#tabs button')].map(x=>x.textContent),ids:editor.layout().objects.map(o=>o.id)}));
 assert.deepEqual(got.tabs,['02']);assert.deepEqual(got.ids,want.plans[0].layout.objects.map(o=>o.id));console.log('PASS 第一次打开载入 CES-02');
 await p.evaluate(()=>{document.querySelector('#rename');editor.checkpoint();editor.objects()[0].position.x=0.123;editor.persist();});
 await p.reload();await p.waitForFunction(()=>window.editor);
 assert.equal(await p.evaluate(()=>editor.layout().objects[0].position[0]),0.123);console.log('PASS 再打开载入上次的方案');
 assert.deepEqual(errors,[]);
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
