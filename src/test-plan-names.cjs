// 方案名：新建用序号 01/02/03；导入时重名自动加「-2」「-3」。Run: node src/test-plan-names.cjs（要 8876 服务在跑 + 先 build）
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');
const names=p=>p.locator('#tabs [role=tab]').allTextContents().then(a=>a.map(t=>t.trim()));
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
 let failed=0;const errs=[];
 try{
  const p=await (await b.newContext({acceptDownloads:true})).newPage();p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>{errs.push('dialog:'+d.message());d.dismiss();});
  await p.goto(process.env.TEST_URL||'http://127.0.0.1:8876/?builtin');await p.waitForFunction(()=>window.editor);
  assert.deepEqual(await names(p),['01']);
  await p.locator('#newPlan').click();await p.locator('#newPlan').click();
  assert.deepEqual(await names(p),['01','02','03']);console.log('PASS 新建方案依次叫 01 02 03');
  const ws=n=>path.join(os.tmpdir(),'pn-'+process.pid+'-'+n+'.json'),mk=(f,list)=>{fs.writeFileSync(f,JSON.stringify({version:2,activeId:'a',plans:list.map((name,i)=>({id:i?'b'+i:'a',name,layout:{room:{width:6,depth:5},objects:[]}}))}));return f;};
  await p.locator('#importFile').setInputFiles(mk(ws(1),['01','墙面修改','墙面修改']));await p.waitForFunction(()=>document.querySelectorAll('#tabs [role=tab]').length===6);
  assert.deepEqual(await names(p),['01','02','03','01-2','墙面修改','墙面修改-2']);
  await p.locator('#importFile').setInputFiles(mk(ws(2),['墙面修改']));await p.waitForFunction(()=>document.querySelectorAll('#tabs [role=tab]').length===7);
  assert.deepEqual((await names(p)).at(-1),'墙面修改-3');
  console.log('PASS 导入重名：和已有的重、导入文件内部互相重，都加 -2 / -3');
 }catch(e){failed++;console.log('FAIL',e.message);}
 await b.close();
 if(errs.length){failed++;console.log('FAIL 页面报错/弹窗',errs);}
 process.exitCode=failed?1:0;
})();
