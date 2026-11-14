// 方案标签放不下时：藏起来 + 下拉箭头。Run: node src/test-tab-overflow.cjs（要 8876 服务在跑 + 先 build）
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
 let failed=0;const errs=[];
 try{
  const p=await (await b.newContext({viewport:{width:1400,height:800}})).newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.goto(process.env.TEST_URL||'http://127.0.0.1:8876/?builtin');await p.waitForFunction(()=>window.editor);
  const more=p.locator('#tabMore'),state=()=>p.evaluate(()=>({total:document.querySelectorAll('#tabs .tab').length,shown:[...document.querySelectorAll('#tabs .tab')].filter(t=>!t.hidden).map(t=>t.textContent.trim()),active:document.querySelector('#tabs .tab.active').textContent.trim(),activeHidden:document.querySelector('#tabs .tab.active').hidden,more:!document.getElementById('tabMore').hidden}));
  assert.equal((await state()).more,false);console.log('PASS 方案少、放得下时没有下拉箭头');
  for(let i=0;i<11;i++)await p.locator('#newPlan').click();
  assert.equal((await state()).more,false,'宽屏 12 个还放得下');
  await p.setViewportSize({width:700,height:800});await p.waitForTimeout(150);
  let s=await state();assert.equal(s.total,12);assert.ok(s.more,'窄了出现箭头');assert.ok(s.shown.length<12&&s.shown.length>=1);assert.equal(s.active,'12');assert.equal(s.activeHidden,false,'当前方案在栏里');
  await more.click();const rows=p.locator('.tab-more .row');assert.equal(await rows.count(),12-s.shown.length);
  const names=await rows.locator('button:first-child').allTextContents();assert.ok(!names.includes('12'));assert.deepEqual(names,[...Array(12).keys()].map(i=>String(i+1).padStart(2,'0')).filter(n=>!s.shown.includes(n)));
  await p.screenshot({path:'tmp/tab-overflow.png'});
  console.log('PASS 窄屏：出现箭头，当前方案留在栏里，下拉列出的正好是被藏起来的');
  await p.keyboard.press('Escape');assert.equal(await p.locator('.tab-more').count(),0);
  await more.click();assert.equal(await p.locator('.tab-more').count(),1);await more.click();assert.equal(await p.locator('.tab-more').count(),0,'再点箭头关闭');
  await more.click();await p.mouse.click(300,500);assert.equal(await p.locator('.tab-more').count(),0,'点空白收起');
  console.log('PASS Esc、再点箭头、点空白都能收起');
  await more.click();const first=(await rows.locator('button:first-child').allTextContents())[0];await rows.first().locator('button:first-child').click();
  assert.equal(await p.locator('.tab-more').count(),0);s=await state();assert.equal(s.active,first);assert.equal(s.activeHidden,false,'切过去后它在栏里');
  console.log('PASS 点下拉里的方案：切过去、下拉收起、它出现在栏里');
  await more.click();const before=(await state()).total;const victim=(await rows.locator('button:first-child').allTextContents())[0];
  await rows.first().locator('.tab-x').click();assert.equal(await p.locator('.dk-dialog').count(),1,'删除先确认');await p.locator('.dk-dialog .danger-fill').click();
  s=await state();assert.equal(s.total,before-1);assert.ok(!(await p.locator('#tabs .tab').allTextContents()).some(t=>t.trim()===victim));
  console.log('PASS 下拉里的 ✕ 删除：先确认，确认后方案没了');
  await p.setViewportSize({width:1400,height:800});await p.waitForTimeout(150);assert.equal((await state()).more,false);
  console.log('PASS 窗口变宽后箭头消失');
 }catch(e){failed++;console.log('FAIL',e.message);}
 await b.close();if(errs.length){failed++;console.log('FAIL 页面报错',errs);}process.exitCode=failed?1:0;
})();
