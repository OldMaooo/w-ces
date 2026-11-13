const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');
const assert=require('node:assert/strict');
const near=(a,b,t=.001)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});try{
 const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8876/?builtin');await page.waitForFunction(()=>window.editor);if(await page.locator('#libraryToggle').count())await page.locator('#libraryToggle').click();
 assert.equal(await page.locator('[data-add=acrylicA4]').count(),1,'A4 add button');
 for(const [type,size] of [['acrylicA4',[.21,.297,.07]],['acrylicA5',[.1485,.21,.07]],['rollup',[.84,2.08,.35]]]){
  if(type==='acrylicA5'){await page.locator('#paper').selectOption('A5');}else await page.locator(`[data-add=${type==='acrylicA4'?'acrylicA4':type}]`).click();for(const [i,k] of ['w','h','d'].entries())near(Number(await page.locator('#'+k).inputValue()),size[i]);
 }
 // Isolated scene fixture; operations below use the actual UI and canvas events.
 await page.evaluate(()=>{restore({room:roomDefault(),objects:[]});const desk=make('desk');desk.position.set(0,0,0);const laptop=make('laptop');laptop.position.set(1.8,1,0);select(laptop);camera.position.set(3,4,5);orbit.target.set(0,.7,0);orbit.update();});
 async function point(x,y,z){return page.evaluate(([x,y,z])=>{camera.updateMatrixWorld();const p=new THREE.Vector3(x,y,z).project(camera),r=renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},[x,y,z]);}
 async function place(x,y,z){await page.locator('#place').click();const p=await point(x,y,z);await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);}
 const original=await page.locator('#x').inputValue();await place(.23,1,.12);
 assert.equal(await page.locator('#placementHint').isHidden(),true);near(Number(await page.locator('#x').inputValue()),.23,.011);near(Number(await page.locator('#y').inputValue()),1);near(Number(await page.locator('#z').inputValue()),.12,.011);
 near(await page.evaluate(()=>new THREE.Box3().setFromObject(editor.selected()).min.y),1);assert.equal(await page.locator('#wallSnap').isChecked(),false);
 await page.locator('#undo').click();assert.equal(await page.locator('#x').inputValue(),original);await page.locator('#redo').click();near(Number(await page.locator('#x').inputValue()),.23,.011);
 console.log('PASS 点击桌面精确放置、底部贴合、撤销重做');
 const before=await page.evaluate(()=>editor.snapshot());await page.locator('#place').click();await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>editor.snapshot()),before);assert.equal(await page.locator('#place').innerText(),'放置');
 await page.locator('#place').click();await page.locator('#place').click();assert.deepEqual(await page.evaluate(()=>editor.snapshot()),before);
 // A vertical front face must not be accepted or raycast through.
 await page.locator('#place').click();let p=await point(0,.55,.325);await page.mouse.click(p.x,p.y);assert.equal(await page.locator('#placementHint').isVisible(),true);assert.deepEqual(await page.evaluate(()=>editor.snapshot()),before);await page.keyboard.press('Escape');
 // Source itself is not a valid support. Use its exposed screen with no top beneath.
 await page.locator('#x').fill('2');await page.locator('#x').press('Tab');await page.locator('#place').click();p=await point(2,1.12,-.113);await page.mouse.click(p.x,p.y);const pos=await page.evaluate(()=>editor.selected().position.toArray());assert.ok(pos[1]<1||await page.locator('#placementHint').isVisible());await page.keyboard.press('Escape');
 console.log('PASS Esc/按钮取消、垂直表面拒绝、排除自身');
 // Real circle and L concavity: hit test against meshes rather than boxes.
 await page.evaluate(()=>{restore({room:roomDefault(),objects:[]});const table=make('table');const laptop=make('laptop');laptop.position.set(1.6,1,0);select(laptop);camera.position.set(0,6,.001);orbit.target.set(0,0,0);orbit.update();});
 await place(.1,.75,.1);near(Number(await page.locator('#y').inputValue()),.75);await place(.30,.75,.30);near(Number(await page.locator('#y').inputValue()),0); // outside circle, on floor
 await page.evaluate(()=>{restore({room:roomDefault(),objects:[]});make('ldesk');const laptop=make('laptop');laptop.position.set(1.6,1,0);select(laptop);});
 await place(-.8,1,.4);near(Number(await page.locator('#y').inputValue()),1);await place(.6,1,.5);near(Number(await page.locator('#y').inputValue()),0);
 console.log('PASS 圆桌弧边与 L 台空缺按真实表面放置');
 await page.locator('#place').click();p=await point(-.8,1,-.5);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+40,p.y+20,{steps:6});await page.mouse.up();assert.equal(await page.locator('#placementHint').isVisible(),true);await page.keyboard.press('Escape');
 // Persist all new catalogue entries + a legacy acrylic, preserving old dimensions.
 if(await page.locator('#library').isHidden())await page.locator('#libraryToggle').click();for(const type of ['acrylicA4','rollup'])await page.locator(`[data-add=${type}]`).click();
 await page.evaluate(()=>{make('acrylic');renderList();persist();});
 const entries=await page.locator('#objects > div > button:first-child').allTextContents();await page.reload();await page.waitForFunction(()=>window.editor);assert.deepEqual(await page.locator('#objects > div > button:first-child').allTextContents(),entries);
 const dp=page.waitForEvent('download');await page.locator('#save').click();await (await dp).saveAs('tmp/placement-export.json');const other=await (await browser.newContext()).newPage();await other.goto('http://127.0.0.1:8876/?builtin');await other.waitForFunction(()=>window.editor);await other.locator('#importFile').setInputFiles('tmp/placement-export.json');await other.waitForFunction(()=>document.querySelectorAll('#tabs button').length===2);assert.deepEqual(await other.locator('#objects > div > button:first-child').allTextContents(),entries);
 await other.locator('#objects > div > button:first-child').filter({hasText:'笔记本电脑'}).click();near(Number(await other.locator('#y').inputValue()),0);await other.locator('#objects > div > button:first-child').filter({hasText:'桌面亚克力牌'}).click();near(Number(await other.locator('#h').inputValue()),.15);
 assert.deepEqual(errors,[]);console.log('PASS 拖动视角不误放置、刷新恢复、隔离浏览器导入导出、旧立牌兼容、无页面错误');
 // Visual fixture: actual material meshes arranged on a desk, plus full-size roll-up.
 await page.evaluate(()=>{restore({room:roomDefault(),objects:[]});const desk=make('desk');desk.position.set(0,0,0);const laptop=make('laptop');laptop.position.set(-.35,1,.08);make('acrylicA4').position.set(.25,1,0);make('acrylicA5').position.set(.57,1,0);make('rollup').position.set(-1.35,0,-.75);select(laptop);camera.position.set(3.2,3,4.2);orbit.target.set(0,1,0);orbit.update();});await page.waitForTimeout(150);await page.screenshot({path:'tmp/placement-preview.png'});
 await page.locator('#place').click();p=await point(.1,1,.2);await page.mouse.move(p.x,p.y);await page.waitForTimeout(100);await page.screenshot({path:'tmp/placement-mode.png'});
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
