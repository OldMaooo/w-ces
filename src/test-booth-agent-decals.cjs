// Agent 入口的「物料」部分测试。Run: node src/test-booth-agent-decals.cjs（最后一项要 8876 服务在跑 + 先 build）
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process');
const A=require('./booth-agent.cjs');
const DM=require('./decal-model.js');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const ROOT=path.join(__dirname,'..'),SRC=path.join(ROOT,'doc/Files/CES-02.json'),IMG=path.join(ROOT,'doc/Files/物料示例');
const ces=()=>JSON.parse(fs.readFileSync(SRC,'utf8'));
const lay=ws=>ws.plans.find(p=>p.id===ws.activeId).layout;
const obj=(ws,id)=>lay(ws).objects.find(o=>o.id===id);
const apply=(d,ws=ces())=>A.applyDraft(ws,d,{baseDir:IMG});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bad-'));
// 最小 PNG 生成器（不依赖任何库）
const crcT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]),c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
function png(w,h){const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;const row=Buffer.alloc(1+w*3,120);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(Buffer.concat(Array(h).fill(row)))),chunk('IEND',Buffer.alloc(0))]);}
const put=(name,buf)=>{const p=path.join(tmp,name);fs.writeFileSync(p,buf);return p;};
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('贴到前台 12 正面：assets / decals / decalFaces 都写对，默认摆法；原对象不被改',()=>{
 const src=ces(),orig=JSON.stringify(src);
 const {workspace:ws,report}=A.applyDraft(src,{decals:[{object:12,face:'front',image:'前台正面.png'}]},{baseDir:IMG});
 const f=path.join(IMG,'前台正面.png'),id=sha(f),o=obj(ws,12);
 assert.deepEqual(o.decalFaces,['front']);
 assert.deepEqual(o.decals.front,{source:{kind:'file'},assetId:id,fit:'contain',scale:1,ox:0,oy:0,rot:0});
 assert.deepEqual(Object.keys(ws.assets),[id]);assert.equal(ws.assets[id].mime,'image/png');assert.equal(ws.assets[id].width,800);assert.equal(ws.assets[id].height,500);
 assert.equal(ws.assets[id].base64,fs.readFileSync(f).toString('base64'));
 assert.deepEqual(report.decals[0],{target:'前台 12',face:'front',assetId:id,width:800,height:500,replaced:false});
 assert.equal(JSON.stringify(src),orig);
 assert.deepEqual(DM.validateAssets(ws.assets)[id].width,800);
});
test('贴到电视屏幕（用途名找物品）、JPG 读出宽高；摆法字段原样写入',()=>{
 const {workspace:ws}=apply({decals:[{object:'平行宇宙',face:'screen',image:'电视屏幕.jpg',fit:'cover',scale:1.2,ox:.1,oy:-.1,rot:90}]});
 const d=obj(ws,5).decals.screen,a=ws.assets[d.assetId];
 assert.deepEqual([d.fit,d.scale,d.ox,d.oy,d.rot],['cover',1.2,.1,-.1,90]);assert.deepEqual(obj(ws,5).decalFaces,['screen']);
 assert.equal(a.mime,'image/jpeg');assert.equal(a.width,591);assert.equal(a.height,325);
});
test('贴到墙 A / 墙 B：写进 room.decals + room.decalFaces',()=>{
 const {workspace:ws,report}=apply({decals:[{wall:'A',image:'A墙.png'},{wall:'B',image:'前台正面.png'}]});
 const r=lay(ws).room;assert.deepEqual(r.decalFaces,['A','B']);assert.equal(r.decals.A.assetId,sha(path.join(IMG,'A墙.png')));assert.equal(r.decals.B.fit,'contain');
 assert.equal(report.decals[0].target,'A 墙');
});
test('三张图一份草稿：前台 12 正面 + 电视屏幕 + A 墙；同一张图贴两处只存一份 assets',()=>{
 const {workspace:ws}=apply({decals:[{object:12,face:'front',image:'前台正面.png'},{object:'平行宇宙',face:'screen',image:'电视屏幕.jpg'},{wall:'A',image:'A墙.png'},{object:13,face:'front',image:'前台正面.png'}]});
 assert.equal(Object.keys(ws.assets).length,3);
 for(const d of [obj(ws,12).decals.front,obj(ws,5).decals.screen,lay(ws).room.decals.A,obj(ws,13).decals.front])assert.ok(ws.assets[d.assetId]);
});
test('不存在的面 / 不支持贴图的物品 / 找不到的物品 / 名字有歧义：中文报错',()=>{
 assert.throws(()=>apply({decals:[{object:12,face:'screen',image:'前台正面.png'}]}),/前台 12.*没有「screen」.*front, back, left, right, top/);
 assert.throws(()=>apply({decals:[{object:3,face:'front',image:'前台正面.png'}]}),/机器人 3.*不支持贴图/);
 assert.throws(()=>apply({decals:[{object:999,face:'front',image:'前台正面.png'}]}),/找不到物品/);
 assert.throws(()=>apply({decals:[{object:'前台',face:'front',image:'前台正面.png'}]}),/不止一个/);
 assert.throws(()=>apply({decals:[{wall:'C',image:'A墙.png'}]}),/wall 只能写 A 或 B/);
 assert.throws(()=>apply({decals:[{object:12,wall:'A',face:'front',image:'A墙.png'}]}),/不能同时写/);
 assert.throws(()=>apply({decals:[{object:12,image:'A墙.png'}]}),/要写 face/);
});
test('坏图片：不存在 / 不是图 / 扩展名骗人 / WebP / 太大 / 摆法超范围，都不写文件、报中文',()=>{
 const bad=(img,re,extra={})=>assert.throws(()=>A.applyDraft(ces(),{decals:[{object:12,face:'front',image:img,...extra}]},{baseDir:tmp}),re);
 bad('nope.png',/找不到图片文件/);
 bad(put('a.png',Buffer.from('not an image at all')),/不是 PNG 或 JPG/);
 bad(put('b.png',Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(20)])),/图片损坏|读不出尺寸/);
 bad(put('c.webp',Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPVP8 '),Buffer.alloc(30)])),/WebP.*先转成 PNG 或 JPG/);
 bad(put('big.png',png(4100,2)),/4096/);
 bad(put('ok.png',png(4,4)),/scale/,{scale:5});
 bad(put('ok2.png',png(4,4)),/rot/,{rot:45});
 bad(put('ok3.png',png(4,4)),/fit/,{fit:'stretch'});
});
test('已有物料默认不覆盖（报错、不写）；replace:true 才覆盖，并清掉不再用的旧图',()=>{
 const first=apply({decals:[{object:12,face:'front',image:'前台正面.png'}]}).workspace;
 assert.throws(()=>apply({decals:[{object:12,face:'front',image:'电视屏幕.jpg'}]},first),/已经贴了物料.*replace/);
 const {workspace:ws,report}=apply({decals:[{object:12,face:'front',image:'电视屏幕.jpg',replace:true}]},first);
 assert.equal(obj(ws,12).decals.front.assetId,sha(path.join(IMG,'电视屏幕.jpg')));assert.equal(report.decals[0].replaced,true);
 assert.deepEqual(Object.keys(ws.assets),[sha(path.join(IMG,'电视屏幕.jpg'))]);
 assert.deepEqual(obj(ws,12).decalFaces,['front']);
});
test('同一份草稿里同一个面写两次：报错（要覆盖请分两次或只写一条）',()=>{
 assert.throws(()=>apply({decals:[{object:12,face:'front',image:'前台正面.png'},{object:12,face:'front',image:'电视屏幕.jpg'}]}),/重复/);
});
test('hash 算法：和浏览器里的 SHA-256（crypto.subtle）一致，且对内容敏感',()=>{
 const f=path.join(IMG,'电视屏幕.jpg');
 const {workspace:ws}=apply({decals:[{object:5,face:'screen',image:'电视屏幕.jpg'}]});
 assert.equal(obj(ws,5).decals.screen.assetId,sha(f));assert.match(sha(f),/^[0-9a-f]{64}$/);
 const g=put('x1.png',png(8,8)),h=put('x2.png',png(9,8));
 const a=A.applyDraft(ces(),{decals:[{object:12,face:'front',image:g},{object:13,face:'front',image:h}]}).workspace;
 assert.notEqual(obj(a,12).decals.front.assetId,obj(a,13).decals.front.assetId);
});
test('list：每个物品列出能贴的面 + 尺寸（米、像素）+ 已贴什么；墙 A/B 也有',()=>{
 const ws=apply({decals:[{object:12,face:'front',image:'前台正面.png'}]}).workspace;
 const r=A.list(ws),d=r.objects.find(o=>o.id===12);
 assert.deepEqual(d.faces.map(f=>f.face),['front','back','left','right','top']);
 const fr=d.faces[0];const [dw,dh]=obj(ws,12).size;assert.deepEqual(fr.size,[Math.round(dw*100)/100,Math.round(dh*100)/100]);assert.deepEqual(fr.pixels,[Math.round(dw*1000),Math.round(dh*1000)]);assert.equal(fr.name,'正面');
 assert.equal(fr.decal.assetId,obj(ws,12).decals.front.assetId);assert.deepEqual(fr.decal.image,[800,500]);assert.equal(d.faces[1].decal,null);
 assert.deepEqual(r.objects.find(o=>o.id===3).faces,[]);
 assert.deepEqual(r.objects.find(o=>o.id===5).faces.map(f=>f.face),['screen']);
 assert.deepEqual(r.walls.map(w=>[w.wall,w.size]),[['A',[5.5,2.8]],['B',[6.1,2.8]]]);assert.equal(r.walls[0].decal,null);
 assert.match(r.decalNote,/1 米 = 1000 像素/);
});
test('同一份草稿里先加新物品、再给它贴图（用途名引用）',()=>{
 const {workspace:ws}=apply({objects:[{type:'tv',at:[0,-2.7],purpose:'新屏'}],decals:[{object:'新屏',face:'screen',image:'电视屏幕.jpg'}]});
 assert.ok(lay(ws).objects.at(-1).decals.screen);
});
test('命令行：一条命令把三张图贴到前台 12 / 电视屏幕 / A 墙；图片路径相对草稿所在目录；报错时不写文件',()=>{
 const o=path.join(tmp,'out.json'),d=path.join(tmp,'draft.json');
 fs.writeFileSync(d,JSON.stringify({decals:[{object:12,face:'front',image:path.join(IMG,'前台正面.png')},{object:'平行宇宙',face:'screen',image:path.join(IMG,'电视屏幕.jpg')},{wall:'A',image:path.join(IMG,'A墙.png')}]}));
 const cli=(...a)=>execFileSync('node',[path.join(__dirname,'booth-agent.cjs'),...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 cli('apply',SRC,d,'-o',o);const ws=JSON.parse(fs.readFileSync(o,'utf8'));assert.equal(Object.keys(ws.assets).length,3);assert.ok(lay(ws).room.decals.A);
 const rel=path.join(tmp,'sub');fs.mkdirSync(rel);fs.copyFileSync(path.join(IMG,'A墙.png'),path.join(rel,'w.png'));const d2=path.join(rel,'d.json');fs.writeFileSync(d2,JSON.stringify({decals:[{wall:'B',image:'w.png'}]}));
 cli('apply',SRC,d2,'-o',path.join(tmp,'o2.json'));assert.ok(fs.existsSync(path.join(tmp,'o2.json')));
 const d3=path.join(tmp,'d3.json'),o3=path.join(tmp,'o3.json');fs.writeFileSync(d3,JSON.stringify({decals:[{object:12,face:'front',image:'不存在.png'}]}));
 assert.throws(()=>cli('apply',SRC,d3,'-o',o3),/找不到图片文件/);assert.ok(!fs.existsSync(o3));
});

(async()=>{
 let failed=0;for(const [name,fn] of tests){try{fn();console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,'\n ',e.message);}}
 // 产出的文件必须能被真实编辑器导入：assetId 和 assets 都在，hash 和浏览器里算出来的一致，页面无报错
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');
  const out=apply({decals:[{object:12,face:'front',image:'前台正面.png'},{object:'平行宇宙',face:'screen',image:'电视屏幕.jpg'},{wall:'A',image:'A墙.png'}]}).workspace;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
  const page=await (await browser.newContext()).newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:8876/?builtin');await page.waitForFunction(()=>window.editor);
  const r=await page.evaluate(async w=>{
   const ws=editor.parseWorkspace(w),l=ws.plans.find(p=>p.id===ws.activeId).layout,assets=DecalModel.validateAssets(w.assets);
   const ids=[l.objects.find(o=>o.id===12).decals.front,l.objects.find(o=>o.id===5).decals.screen,l.room.decals.A].map(d=>d&&d.assetId);
   const bufHash=async b64=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',u))].map(b=>b.toString(16).padStart(2,'0')).join('');};
   const hashOk=await Promise.all(ids.map(async id=>id&&assets[id]&&await bufHash(assets[id].base64)===id));
   return {ids,inAssets:ids.map(id=>!!assets[id]),hashOk,faces:[l.objects.find(o=>o.id===12).decalFaces,l.room.decalFaces]};
  },out);
  assert.ok(r.ids.every(Boolean),'三处贴图的 assetId 都在');assert.deepEqual(r.inAssets,[true,true,true]);assert.deepEqual(r.hashOk,[true,true,true]);
  assert.deepEqual(r.faces,[['front'],['A']]);
  // 再走一遍真正的「导入」按钮：贴图要画出来（3 个面都有图），图片要进了编辑器的图片仓库
  const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
  const file=path.join(tmp,'import.json');fs.writeFileSync(file,JSON.stringify(out));
  await page.setInputFiles('#importFile',file);
  await page.waitForFunction(()=>Object.values(editor.decals.debug().meshes).filter(m=>m.image).length>=3,null,{timeout:15000});
  const dbg=await page.evaluate(()=>{const m=editor.decals.debug().meshes;return Object.keys(m).sort();});
  assert.deepEqual(dbg,['obj:12|front','obj:5|screen','room|A']);assert.deepEqual(dialogs,[]);
  assert.deepEqual(errs,[]);
  await browser.close();console.log('PASS 产出的文件能被真实编辑器导入：三处物料的 assetId、assets、hash 都对，页面无报错');
 }catch(e){failed++;console.log('FAIL 真实编辑器导入','\n ',e.message);}
 console.log(`${tests.length+1-failed}/${tests.length+1} passed`);if(failed)process.exitCode=1;
})();
