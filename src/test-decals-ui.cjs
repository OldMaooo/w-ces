// Figma 贴图界面测试（浏览器）。先 python3 src/build.py，再 node src/test-decals-ui.cjs（需「验收-悬浮物料栏与人物」8876 在跑）
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('fs'),path=require('path');
const BASE=process.env.TEST_URL||'http://127.0.0.1:8876/?builtin';
const dir=path.join(__dirname,'../tmp/decals');fs.mkdirSync(dir,{recursive:true});
const texts=loc=>loc.allTextContents().then(a=>a.map(x=>x.trim()));
const near=(a,b,t=.01)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
const TOKEN='figd_test_TOKEN_123';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});try{
 const errors=[],alerts=[];
 const ctx=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{alerts.push(d.message());d.dismiss();});
 await page.goto(BASE);await page.waitForFunction(()=>window.editor&&editor.decals);
 // 测试图：红 / 蓝两张 PNG
 const png=await page.evaluate(()=>['#d33','#36c'].map((c,i)=>{const k=document.createElement('canvas');k.width=400;k.height=200;const x=k.getContext('2d');x.fillStyle=c;x.fillRect(0,0,400,200);x.fillStyle='#fff';x.font='80px sans-serif';x.fillText(i?'BLUE':'RED',40,130);return k.toDataURL('image/png').split(',')[1];}));
 const redFile=path.join(dir,'red.png'),blueFile=path.join(dir,'blue.png');fs.writeFileSync(redFile,Buffer.from(png[0],'base64'));fs.writeFileSync(blueFile,Buffer.from(png[1],'base64'));
 // 场景：前台 1（正中）、易拉宝 2、电视 3；透视
 await page.evaluate(()=>{restore({room:roomDefault(),objects:[]});make('desk').position.set(0,0,0);make('rollup').position.set(-1.6,0,-.8);make('tv').position.set(1.8,1.2,-1);select(objects[0]);});
 await page.locator('[data-view=perspective]').click();
 const point=(x,y,z)=>page.evaluate(([x,y,z])=>{camera.updateMatrixWorld();const p=new THREE.Vector3(x,y,z).project(camera),r=renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},[x,y,z]);
 const clickAt=async(x,y,z)=>{const p=await point(x,y,z);await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);};
 const dbg=()=>page.evaluate(()=>editor.decals.debug());
 const desk=()=>page.evaluate(()=>{const d=editor.objects()[0].userData;return {faces:d.decalFaces,decals:d.decals};});
 const settle=()=>page.waitForFunction(()=>editor.decals.debug().pending===0);
 const FRONT=[0,.45,.33],TOP=[0,1,.05],ROLLUP=[-1.6,1.1,-.62],TV=[1.8,1.55,-.95];
 async function drag(xyz,b64,{name='red.png',type='image/png',drop=true}={}){const p=await point(...xyz);return page.evaluate(([x,y,b64,name,type,drop])=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const dt=new DataTransfer();dt.items.add(new File([u],name,{type}));let eff='unset';Object.defineProperty(dt,'dropEffect',{get:()=>eff,set:v=>{eff=v;}}); /* 手造的 DataTransfer 不认 dropEffect，记下代码设的值 */const o={clientX:x,clientY:y,dataTransfer:dt,bubbles:true,cancelable:true},c=renderer.domElement;const over=new DragEvent('dragover',o);c.dispatchEvent(over);const effect=dt.dropEffect;if(drop)c.dispatchEvent(new DragEvent('drop',o));return {prevented:over.defaultPrevented,effect};},[p.x,p.y,b64,name,type,drop]);}

 // ---- 1 选面只在贴图模式里：「管理贴面」点一下加、再点一下去掉 ----
 const manageBtn=()=>page.locator('#decalSide .dk-top button',{hasText:'管理贴面'}),doneBtn=()=>page.locator('#decalSide .dk-top button',{hasText:'保存并退出管理模式'}),listed=()=>page.locator('#decalSide .dk-top').count();
 assert.equal(await page.locator('#dkFaces,#dkWalls').count(),0,'左栏没有选面');assert.equal(await page.locator('#decalSide').isVisible(),false);
 await page.locator('#decalMode').click();assert.equal(await page.locator('#viewbar').isVisible(),false);assert.equal(await page.locator('#layers').isVisible(),false,'物料模式左栏不显示图层');assert.equal(await page.locator('#roomPanel').isVisible(),false);assert.ok((await page.locator('#decalSide .dk-explain').first().textContent()).includes('先选面'));assert.equal(await page.locator('.dk-hint').count(),0,'画布里没有管理贴面按钮');
 await manageBtn().click();assert.equal((await dbg()).manage,true);assert.equal((await page.locator('#decalSide .dk-top button').textContent()).trim(),'保存并退出管理模式');
 let p=await point(...FRONT);await page.mouse.move(p.x,p.y);assert.equal((await dbg()).hover,'obj:1|front');
 p=await point(...ROLLUP);await page.mouse.move(p.x,p.y);assert.equal((await dbg()).hover,'obj:2|front','任何物体的面都能点');
 await clickAt(...FRONT);await clickAt(...TOP);assert.deepEqual((await desk()).faces,['front','top']);
 await clickAt(...TV);assert.deepEqual(await page.evaluate(()=>editor.objects()[2].userData.decalFaces),['screen']);await clickAt(...TV);assert.equal(await page.evaluate(()=>editor.objects()[2].userData.decalFaces),undefined,'再点一下去掉');
 assert.deepEqual((await dbg()).tints.sort(),['obj:1|front','obj:1|top']);assert.equal(await page.evaluate(()=>editor.selected()),null,'管理贴面时点物体不选中');
 await clickAt(...TOP);assert.deepEqual((await desk()).faces,['front'],'没贴图的面直接去掉');assert.equal((await dbg()).asking,false);await clickAt(...TOP);
 await page.evaluate(()=>editor.undo());assert.deepEqual((await desk()).faces,['front']);await page.evaluate(()=>editor.redo());assert.deepEqual((await desk()).faces,['front','top']);
 let r=await drag(FRONT,png[0]);assert.equal(r.effect,'none','管理贴面时不接图片');
 await page.keyboard.press('Escape');assert.deepEqual([(await dbg()).manage,(await dbg()).mode],[false,true],'Esc 先退出管理贴面');
 await manageBtn().click();await doneBtn().click();assert.equal((await dbg()).manage,false,'「完成」也能退出');
 await page.keyboard.press('Escape');assert.equal((await dbg()).mode,false);
 console.log('PASS 选面只在贴图模式里：管理贴面点一下加 / 再点去掉、任何物体都能点、撤销重做、Esc / 完成退出');

 // ---- 2 常规模式下拖图片：没反应 ----
 r=await drag(FRONT,png[0]);assert.equal(r.effect,'none');assert.equal((await desk()).decals,undefined);assert.equal(await page.locator('#decalSide .dk-head').isVisible(),false);
 console.log('PASS 常规模式拖图片到画布：不接受、不贴');

 // ---- 3 贴图模式：只认亮面；拖入贴图；面板调整 ----
 await page.locator('#decalMode').click();assert.equal(await page.evaluate(()=>editor.selected()),null);
 assert.deepEqual((await dbg()).tints.sort(),['obj:1|front','obj:1|top']);assert.equal((await page.locator('#decalSide .dk-top button').textContent()).trim(),'管理贴面');
 await clickAt(...TV);assert.equal(await page.evaluate(()=>editor.selected()),null,'贴图模式点物体不选中');assert.equal(await page.locator('#decalSide .dk-head').isVisible(),false);
 r=await drag(ROLLUP,png[0]);assert.equal(r.effect,'none');assert.equal(await page.locator('#decalSide .dk-head').isVisible(),false);
 r=await drag(FRONT,png[0],{drop:false});assert.equal(r.effect,'copy');assert.equal((await dbg()).highlight,'obj:1|front');
 await drag(FRONT,png[0]);await settle();
 let d=await desk();assert.match(d.decals.front.assetId,/^[0-9a-f]{64}$/);assert.deepEqual(d.decals.front.source,{kind:'file'});
 const redId=d.decals.front.assetId;
 assert.equal(await page.locator('.dk-head strong').textContent(),'前台 1');assert.equal(await page.locator('.dk-head small').textContent(),'1.6 × 1 米');
 const copyBtn=page.locator('.dk-head button').first();assert.equal(await copyBtn.getAttribute('title'),'复制为 Figma 画框（1600 × 1000），到 Figma 里 ⌘V');await copyBtn.click();
 const clip=await page.evaluate(()=>navigator.clipboard.readText());assert.match(clip,/^<svg [^>]*width="1600" height="1000"/);assert.match(clip,/<title>前台 1 正面<\/title>/);
 assert.equal(await copyBtn.getAttribute('title'),'已复制，到 Figma 里 ⌘V');
 console.log('PASS 面板复制为 Figma 画框：剪贴板里是 1600×1000 的 SVG、带面名、按钮显示已复制');
 let m=(await dbg()).meshes['obj:1|front'];assert.ok(m&&m.image,'3D 里有贴图');near(m.canvasW/m.canvasH,1.6);
 assert.equal((await dbg()).current,'obj:1|front','选中的面亮着');await page.waitForTimeout(1000);assert.equal((await dbg()).current,'obj:1|front','过一秒还亮着');
 assert.deepEqual(await texts(page.locator('.dk-face')),['正面','台面']);assert.equal(await page.locator('.dk-face i').count(),1,'有图的面带小圆点');
 await page.locator('.dk-seg button',{hasText:'铺满'}).click();assert.equal((await desk()).decals.front.fit,'cover');
 await page.locator('.dk-row:has-text("大小") input[type=range]').fill('150');await page.locator('.dk-row:has-text("左右") input[type=range]').fill('20');await page.locator('.dk-row:has-text("上下") input[type=range]').fill('-10');
 d=await desk();near(d.decals.front.scale,1.5);near(d.decals.front.ox,.2);near(d.decals.front.oy,-.1);
 await page.locator('button[title="顺时针转 90°"]').click();assert.equal((await desk()).decals.front.rot,90);await page.locator('button[title="逆时针转 90°"]').click();await page.locator('button[title="逆时针转 90°"]').click();assert.equal((await desk()).decals.front.rot,270);
 await page.locator('.dk-row button',{hasText:'复位'}).click();d=await desk();assert.deepEqual([d.decals.front.scale,d.decals.front.ox,d.decals.front.oy,d.decals.front.rot],[1,0,0,0]);
 // 一次拖动滑块只记一次撤销
 await page.locator('.dk-row:has-text("大小") input[type=range]').fill('120');await page.evaluate(()=>editor.undo());d=await desk();near(d.decals.front.scale,1);
 assert.equal(await page.locator('#decalSide .dk-head').isVisible(),true,'撤销后面板还在');
 // 挪到台面
 await page.locator('.dk-row:has-text("挪到") select').selectOption('top');await settle();d=await desk();assert.equal(d.decals.front,undefined);assert.equal(d.decals.top.assetId,redId);
 m=(await dbg()).meshes;assert.equal(m['obj:1|front'],undefined);assert.ok(m['obj:1|top'].image);near(m['obj:1|top'].canvasW/m['obj:1|top'].canvasH,1.6/.65);
 assert.equal(await page.locator('.dk-face.on').textContent(),'台面');
 assert.equal((await dbg()).current,'obj:1|top','亮框跟着换到台面');
 // 换图
 const fc=page.waitForEvent('filechooser');await page.locator('.dk-row button',{hasText:'换图'}).click();await (await fc).setFiles(blueFile);await page.waitForFunction(id=>editor.objects()[0].userData.decals.top.assetId!==id,redId);await settle();
 d=await desk();assert.notEqual(d.decals.top.assetId,redId);const blueId=d.decals.top.assetId;
 // 删除，撤销回来
 await page.locator('button[title="删除贴图"]').click();assert.equal((await desk()).decals?.top,undefined);assert.ok(await page.locator('.dk-link input').isVisible(),'删除后回到空面板');
 await page.evaluate(()=>editor.undo());await settle();assert.equal((await desk()).decals.top.assetId,blueId);
 // 空面：选文件上传 + 坏文件报错
 await page.locator('.dk-face',{hasText:'正面'}).click();assert.ok(await page.locator('.dk-link input').isVisible());
 const fc2=page.waitForEvent('filechooser');await page.locator('.dk-drop').click();await (await fc2).setFiles(redFile);await page.waitForFunction(()=>editor.objects()[0].userData.decals.front);await settle();assert.equal((await desk()).decals.front.assetId,redId,'同一张图按内容去重');
 await page.locator('.dk-face',{hasText:'台面'}).click();await drag(TOP,Buffer.from('hello').toString('base64'),{name:'a.txt',type:'text/plain'});
 assert.ok((await page.locator('.dk-note.err').textContent()).includes('不是图片'));assert.equal((await desk()).decals.top.assetId,blueId);
 // 点没亮的地方关面板；Esc 先关面板再退出
 await clickAt(...TV);assert.equal(await page.locator('#decalSide .dk-head').isVisible(),false);
 await clickAt(...FRONT);assert.equal(await page.locator('#decalSide .dk-head').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#decalSide .dk-head').isVisible(),false);assert.equal((await dbg()).mode,true);assert.equal((await dbg()).current,null,'关面板后不再亮');
 await page.keyboard.press('Escape');assert.equal((await dbg()).mode,false);assert.deepEqual((await dbg()).tints,[]);
 console.log('PASS 贴图模式：只认亮面、拖入贴上、摆法 / 大小 / 位置 / 方向 / 复位、挪面、换图、删除可撤销、去重、坏文件报错、Esc 两段退出');

 // ---- 4 墙面选面 + ⌘V 粘贴 ----
 const WALLB=[.8,2.2,-2.74];
 await page.locator('#decalMode').click();await manageBtn().click();await clickAt(...WALLB);await doneBtn().click();assert.deepEqual(await page.evaluate(()=>editor.layout().room.decalFaces),['B']);
 assert.equal((await dbg()).tints.length,3);
 p=await point(...WALLB);await page.mouse.move(p.x,p.y);
 await page.evaluate(b64=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const dt=new DataTransfer();dt.items.add(new File([u],'x.png',{type:'image/png'}));document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},png[1]);await settle();
 assert.equal(await page.evaluate(()=>editor.layout().room.decals.B.assetId),blueId);assert.equal(await page.locator('.dk-head strong').textContent(),'B 后墙');assert.equal(await page.locator('.dk-head small').textContent(),'6.1 × 2.8 米');
 // 墙长互换后贴图跟着重画
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.locator('#swapWalls').click();await settle();m=(await dbg()).meshes['room|B'];near(m.canvasW/m.canvasH,5.5/2.8);
 await page.evaluate(()=>editor.undo());await settle();
 console.log('PASS 墙面只认 A/B 内侧、⌘V 粘贴到鼠标下的亮面、墙长互换贴图跟着重画');

 // ---- 5 改尺寸、复制、隐藏：贴图跟着走 ----
 await page.evaluate(()=>select(objects[0]));await page.locator('#w').fill('2.4');await page.locator('#w').press('Tab');await settle();
 m=(await dbg()).meshes['obj:1|front'];near(m.canvasW/m.canvasH,2.4);
 await page.locator('#copy').click();await settle();const copyId=await page.evaluate(()=>editor.selected().userData.id);
 m=(await dbg()).meshes;assert.ok(m[`obj:${copyId}|front`]?.image&&m[`obj:${copyId}|top`]?.image,'复制出来的物体带着贴图');
 const world=await page.evaluate(id=>{const o=editor.objects().find(o=>o.userData.id===id);o.rotation.y=Math.PI/2;o.updateMatrixWorld(true);const mesh=o.children.find(c=>c.userData.dk?.face==='front'&&c.userData.decal);return new THREE.Vector3(0,0,1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion())).toArray().map(v=>Math.round(v));},copyId);
 assert.deepEqual(world,[1,0,0],'物体转 90° 后正面贴图朝 +X');
 await page.locator('#delete').click();
 // 删除一个已贴图的面：先问，确认后贴图一起删，可撤销
 await page.locator('#decalMode').click();await manageBtn().click();
 await clickAt(...FRONT);assert.equal((await dbg()).asking,true);assert.ok((await page.locator('.dk-dialog').textContent()).includes('已经贴了图'));
 await page.locator('.dk-dialog button',{hasText:'取消'}).click();assert.deepEqual((await desk()).faces,['front','top'],'取消不删');
 await clickAt(...FRONT);await page.keyboard.press('Escape');assert.equal((await dbg()).asking,false);assert.equal((await dbg()).manage,true,'Esc 只关确认窗');assert.deepEqual((await desk()).faces,['front','top']);
 await clickAt(...FRONT);await page.locator('.dk-dialog button',{hasText:'删除'}).click();
 d=await desk();assert.deepEqual(d.faces,['top']);assert.equal(d.decals.front,undefined);assert.equal((await dbg()).meshes['obj:1|front'],undefined);
 await page.evaluate(()=>editor.undo());await settle();d=await desk();assert.deepEqual(d.faces,['front','top']);assert.equal(d.decals.front.assetId,redId);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.equal((await dbg()).mode,false);
 console.log('PASS 改尺寸重画、复制带贴图、转向后朝向正确、去掉已贴图的面先确认（取消 / Esc 不删）、确认后连图一起删且可撤销');

 // ---- 6 Figma 链接（接口用假数据，真令牌没验）----
 let figmaCalls=0;const seenTokens=[];
 await ctx.route('https://api.figma.com/**',async route=>{figmaCalls++;const t=route.request().headers()['x-figma-token'];seenTokens.push(t);const h={'access-control-allow-origin':'*','content-type':'application/json'};
  if(t!==TOKEN)return route.fulfill({status:403,headers:h,body:JSON.stringify({status:403,err:'Invalid token'})});
  const ids=new URL(route.request().url()).searchParams.get('ids');return route.fulfill({status:200,headers:h,body:JSON.stringify({err:null,images:{[ids]:ids==='9:9'?null:'https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/test.png'}})});});
 await ctx.route('https://figma-alpha-api.s3.us-west-2.amazonaws.com/**',route=>route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'image/png'},body:Buffer.from(png[1],'base64')}));
 await page.evaluate(()=>{const o=editor.objects()[0];editor.checkpoint();delete o.userData.decals.top;geometry(o);});
 await page.locator('#decalMode').click();await clickAt(...TOP);
 const link=page.locator('.dk-link input');await link.fill('https://www.figma.com/design/AbCdEf123/CES?node-id=1-3');await link.press('Enter');
 assert.ok((await page.locator('.dk-note.warn').textContent()).includes('个人令牌'));assert.equal(figmaCalls,0,'没令牌不发请求');
 await page.locator('.dk-panel input[type=password]').fill('figd_wrong');await page.locator('.dk-panel button',{hasText:'连接'}).click();
 await page.waitForSelector('.dk-note.err');assert.ok((await page.locator('.dk-note.err').textContent()).includes('令牌'));
 await page.locator('.dk-panel input[type=password]').fill(TOKEN);await page.locator('.dk-panel button',{hasText:'连接'}).click();
 await page.waitForFunction(()=>editor.objects()[0].userData.decals?.top);await settle();d=await desk();
 assert.deepEqual(d.decals.top.source,{kind:'figma',url:'https://www.figma.com/design/AbCdEf123/CES?node-id=1-3',fileKey:'AbCdEf123',nodeId:'1:3'});assert.equal(d.decals.top.assetId,blueId);
 const calls=figmaCalls;await page.locator('.dk-row button',{hasText:'取最新'}).click();await page.waitForFunction(()=>!document.querySelector('.dk-spin'));assert.equal(figmaCalls,calls+1);
 await page.locator('.dk-row button',{hasText:'换链接'}).click();await link.fill('https://www.figma.com/design/AbCdEf123/CES?node-id=9-9');await link.press('Enter');
 await page.waitForSelector('.dk-note.err');assert.ok((await page.locator('.dk-note.err').textContent()).includes('找不到这个画框'));assert.equal((await desk()).decals.top.source.nodeId,'1:3','取不到时原图不动');
 await link.fill('不是链接');await link.press('Enter');assert.ok((await page.locator('.dk-note.err').textContent()).includes('Figma'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('ces-figma-token')),TOKEN);
 console.log('PASS Figma：没令牌先提示连接、错令牌报错、对令牌贴上、取最新重新取、找不到画框 / 不是链接写人话');
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');

 // ---- 7 数据：validateLayout 不丢；令牌不进导出和下载编辑器 ----
 const kept=await page.evaluate(()=>{const l=editor.layout(),v=editor.validateLayout(JSON.parse(JSON.stringify(l))),pick=x=>({faces:x.decalFaces,decals:x.decals});return [[pick(l.room),...l.objects.map(pick)],[pick(v.room),...v.objects.map(pick)]];});
 assert.deepEqual(kept[1],kept[0],'validateLayout 原样保留贴图字段');assert.ok(kept[0].filter(x=>x.decals).length>=2);
 const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click().then(()=>page.locator('.ctx-menu [data-key=current]').click())]);const jsonFile=path.join(dir,'export.json');await dl.saveAs(jsonFile);
 const text=fs.readFileSync(jsonFile,'utf8'),exp=JSON.parse(text);
 assert.deepEqual(Object.keys(exp.assets).sort(),[redId,blueId].sort());assert.equal(exp.assets[redId].mime,'image/png');assert.equal(exp.assets[redId].base64,png[0]);
 assert.ok(!text.includes(TOKEN)&&!text.includes('figd_'),'导出不带令牌');
 const html=await page.evaluate(()=>editor.editorHTML());assert.ok(!html.includes(TOKEN)&&!html.includes(png[0].slice(0,200)),'下载编辑器不带令牌和用户图片');
 console.log('PASS validateLayout 保留贴图；导出带用到的图、不带令牌；下载编辑器不带图和令牌');

 // ---- 8 另一个干净浏览器导入：图片还在；坏文件不污染 ----
 const other=await (await browser.newContext({viewport:{width:1440,height:960}})).newPage();other.on('pageerror',e=>errors.push(e.message));other.on('dialog',dd=>{alerts.push(dd.message());dd.dismiss();});
 await other.goto(BASE);await other.waitForFunction(()=>window.editor&&editor.decals);
 const badFile=path.join(dir,'bad.json');fs.writeFileSync(badFile,JSON.stringify({...exp,assets:{[redId]:{mime:'text/html',width:1,height:1,base64:'AA=='}}}));
 const tabs=await other.locator('#tabs [role=tab]').count();await other.locator('#importFile').setInputFiles(badFile);await other.waitForFunction(()=>true);await other.waitForTimeout(300);
 assert.equal(await other.locator('#tabs [role=tab]').count(),tabs,'坏图片数据：不追加方案');assert.ok(alerts.some(a=>a.includes('导入失败')));
 await other.locator('#importFile').setInputFiles(jsonFile);await other.waitForFunction(n=>document.querySelectorAll('#tabs [role=tab]').length>n,tabs);
 await other.waitForFunction(()=>editor.decals.debug().pending===0);const om=await other.evaluate(()=>editor.decals.debug().meshes);
 assert.ok(om['obj:1|front']?.image&&om['obj:1|top']?.image&&om['room|B']?.image,'导入后 3D 里图片都在');
 assert.equal(await other.evaluate(()=>localStorage.getItem('ces-figma-token')),null);
 await other.locator('#decalMode').click();await other.evaluate(()=>{camera.position.set(4,4,5);orbit.target.set(0,.7,0);orbit.update();});
 await other.reload();await other.waitForFunction(()=>window.editor&&editor.decals);await other.waitForFunction(()=>editor.decals.debug().pending===0);
 assert.ok((await other.evaluate(()=>editor.decals.debug().meshes))['obj:1|front']?.image,'刷新后图片从本机仓库读回');
 console.log('PASS 干净浏览器导入后图片都在、刷新还在；坏图片数据整份拒绝、不追加方案');

 // ---- 9 更多物件能选面：L 台 6 个立面（两个朝前的面分得开）、方吊楣 4 面、圆桌台面、电视 / 闺蜜机屏幕；人、电脑等没有。选中物件时左栏不显示「场地」 ----
 const cases={ldesk:['front','back','left','right','endA','endB'],fascia:['front','back','left','right'],table:['top'],tv:['screen'],display:['screen'],laptop:['screen'],visitor:[]};
 const aimAt=f=>page.evaluate(f=>{const o=editor.objects()[0],d=o.userData;let w,n;
  if(f){const sp=DecalModel.faceSpec(d.type,d.size,f,d);const q=new THREE.Object3D();q.position.set(...sp.pos);q.rotation.set(...sp.rot);o.add(q);o.updateMatrixWorld(true);w=q.getWorldPosition(new THREE.Vector3());n=new THREE.Vector3(0,0,1).transformDirection(q.matrixWorld);o.remove(q);}
  else{w=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());n=new THREE.Vector3(0,0,1);}
  camera.position.copy(w).addScaledVector(n,3).add(new THREE.Vector3(0,.4,0));orbit.target.copy(w);orbit.update();return [w.x,w.y,w.z];},f);
 for(const [type,faces] of Object.entries(cases)){
  await page.evaluate(t=>{editor.decals.exit();restore({room:{...roomDefault(),wallA:false,wallB:false},objects:[]});const o=make(t);o.position.set(0,t==='fascia'?1:0,0);o.rotation.y=Math.PI/4;o.updateMatrixWorld(true);select(o);},type);
  assert.equal(await page.locator('#roomPanel').isVisible(),false,type+'：选中时不显示场地');
  await page.locator('#decalMode').click();await manageBtn().click();
  if(!faces.length){p=await point(...await aimAt(null));await page.mouse.move(p.x,p.y);assert.equal((await dbg()).hover,null,type+' 没有可贴面');continue;}
  for(const f of faces){p=await point(...await aimAt(f));await page.mouse.move(p.x,p.y);assert.equal((await dbg()).hover,'obj:1|'+f,type+' 悬停 '+f);await page.mouse.click(p.x,p.y);}
  assert.deepEqual(await page.evaluate(()=>editor.objects()[0].userData.decalFaces),faces,type+' 点出来的面');
  if(type==='fascia'){await page.evaluate(()=>{const o=editor.objects()[0];o.userData.shape='round';geometry(o);camera.position.set(0,1.7,4);orbit.target.set(0,1.3,0);orbit.update();});p=await point(0,1.3,1.5);await page.mouse.move(p.x,p.y);assert.equal((await dbg()).hover,null,'圆形吊楣：曲面不能贴');}
 }
 await page.evaluate(()=>{editor.decals.exit();select(null);});assert.equal(await page.locator('#roomPanel').isVisible(),true,'啥都没选：显示场地');
 console.log('PASS L 台 / 方吊楣 / 圆桌 / 电视 / 闺蜜机都能点出面（含转 45° 后）；圆形吊楣、游客没有（笔记本屏幕可以）；选中物件时左栏隐藏场地');

 assert.deepEqual(errors,[]);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
