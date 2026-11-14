// Agent 统一入口 src/booth-agent.cjs 的测试。Run: node src/test-booth-agent.cjs（最后一项要 8876 服务在跑 + 先 build）
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const A=require('./booth-agent.cjs');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const SRC=path.join(__dirname,'../doc/Files/CES-02.json');
const ces=()=>JSON.parse(fs.readFileSync(SRC,'utf8'));
const lay=ws=>ws.plans.find(p=>p.id===ws.activeId).layout;
const apply=d=>A.applyDraft(ces(),d);

test('物品类型表和编辑器里的 definitions 完全一致（名字、默认尺寸）',()=>{
 const html=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
 const body=html.match(/const definitions=(\{.*\});/)[1];
 const defs=new Function('return '+body)();
 assert.deepEqual(Object.keys(A.CATALOG),Object.keys(defs));
 for(const k of Object.keys(defs)){assert.equal(A.CATALOG[k].name,defs[k].name,k);assert.deepEqual(A.CATALOG[k].size,defs[k].size,k);}
});
test('list：给类型表、坐标说明、现有物品（含尺寸/角度/高度）和路线信息',()=>{
 const r=A.list(ces());
 assert.equal(r.catalog.length,16);assert.match(r.axes,/x 向西为正/);
 const tv=r.objects.find(o=>o.id===5);assert.equal(tv.name,'平行宇宙');assert.equal(tv.y,1.3);assert.equal(tv.rotate,0);assert.equal(tv.visible,true);
 assert.ok(r.approaches.length===4&&r.walkArea.length===3);
});
test('新增物品：编号接着最大号；默认尺寸、电视默认离地 1.3；角度用度数',()=>{
 const before=lay(ces()).objects.length,max=Math.max(...lay(ces()).objects.map(o=>o.id));
 const {workspace:ws,report}=apply({objects:[{type:'desk',at:[1,2],rotate:90},{type:'tv',at:[0,-2.7],inches:55,purpose:'新屏'}]});
 const o=lay(ws).objects;assert.equal(o.length,before+2);
 const d=o.at(-2),t=o.at(-1);
 assert.equal(d.id,max+1);assert.deepEqual(d.size,[1.6,1,.65]);assert.deepEqual(d.position,[1,0,2]);assert.ok(Math.abs(d.rotation-Math.PI/2)<1e-9);
 assert.equal(t.id,max+2);assert.equal(t.position[1],1.3);assert.equal(t.inches,55);assert.equal(t.purpose,'新屏');
 assert.ok(Math.abs(Math.hypot(t.size[0],t.size[1])-55*.0254)<1e-3,'电视尺寸按英寸算');
 assert.deepEqual(report.added.map(a=>a.id),[max+1,max+2]);
});
test('修改 / 删除：按编号改位置；改类型、改不存在的、删路线用到的都明确报错；原对象不被改动',()=>{
 const src=ces(),orig=JSON.stringify(src);
 const {workspace:ws,report}=A.applyDraft(src,{objects:[{id:12,at:[0,1],visible:false}],remove:[15]});
 const o=lay(ws).objects;assert.deepEqual(o.find(x=>x.id===12).position.slice(0,3),[0,0,1]);assert.equal(o.find(x=>x.id===12).visible,false);assert.ok(!o.find(x=>x.id===15));
 assert.deepEqual(report.updated,[12]);assert.deepEqual(report.removed,[15]);assert.equal(JSON.stringify(src),orig);
 assert.throws(()=>apply({objects:[{id:12,type:'tv'}]}),/类型不能改/);
 assert.throws(()=>apply({objects:[{id:999,at:[0,0]}]}),/不存在/);
 const withTour=A.applyDraft(ces(),{routes:[{name:'x',stops:[5]}]}).workspace;
 assert.throws(()=>A.applyDraft(withTour,{remove:[5]}),/停留点/);
});
test('坏输入：未知类型、尺寸超范围、字段不支持、purpose 写给前台、空草稿',()=>{
 assert.throws(()=>apply({objects:[{type:'sofa'}]}),/不认识的物品类型/);
 assert.throws(()=>apply({objects:[{type:'desk',size:[20,1,1]}]}),/0.01–10/);
 assert.throws(()=>apply({objects:[{type:'desk',inches:5}]}),/不支持字段/);
 assert.throws(()=>apply({objects:[{type:'desk',purpose:'接待'}]}),/只有电视和闺蜜机/);
 assert.throws(()=>apply({objects:[{type:'desk',at:[1]}]}),/\[x, z\]/);
 assert.throws(()=>apply({}),/至少要有/);
});
test('改场地；超出场地只警告；物品和路线可同一份草稿，路线里按用途名引用刚加的物品',()=>{
 const {workspace:ws,report}=apply({room:{width:8,depth:6},objects:[{type:'tv',at:[3,0],purpose:'新屏'}]});
 assert.equal(lay(ws).room.width,8);const nid=lay(ws).objects.at(-1).id;assert.ok(!report.warnings.some(w=>w.includes('物品 '+nid+'（')),'场内的不报');
 const out=apply({objects:[{type:'tv',at:[0,-2.7],purpose:'新屏'}],routes:[{name:'试走',stops:['新屏',5]}]});
 assert.equal(out.report.routes.length,1);assert.equal(out.report.routes[0].ok,true);
 const far=apply({objects:[{type:'desk',at:[9,0]}]});assert.ok(far.report.warnings.some(w=>/场地外/.test(w)));
 assert.throws(()=>apply({room:{width:99}}),/1–30/);
});
test('replaceObjects 清空旧物品和路线再放新的',()=>{
 const {workspace:ws}=apply({replaceObjects:true,objects:[{type:'desk',at:[0,0]}]});
 assert.equal(lay(ws).objects.length,1);assert.equal(lay(ws).objects[0].id,1);assert.equal(lay(ws).tour,undefined);
});
test('命令行：list 出 JSON；apply 写新文件、拒绝覆盖原文件',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ba-')),d=path.join(tmp,'d.json'),o=path.join(tmp,'o.json');
 fs.writeFileSync(d,JSON.stringify({objects:[{type:'rollup',at:[2,2]}]}));
 const cli=(...a)=>execFileSync('node',[path.join(__dirname,'booth-agent.cjs'),...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.equal(JSON.parse(cli('list',SRC)).plan.name,'02');
 cli('apply',SRC,d,'-o',o);assert.ok(lay(JSON.parse(fs.readFileSync(o,'utf8'))).objects.some(x=>x.type==='rollup'));
 assert.throws(()=>cli('apply',SRC,d,'-o',SRC),/不覆盖原文件/);
});

(async()=>{
 let failed=0;for(const [name,fn] of tests){try{fn();console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,'\n ',e.message);}}
 // 产出的文件必须能被真实编辑器导入（物品和路线都在）
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules/playwright');
  const out=A.applyDraft(ces(),{objects:[{type:'desk',at:[1,1],rotate:45},{type:'tv',at:[0,-2.7],inches:55,purpose:'新屏'},{type:'staff',at:[2,2]}],routes:[{name:'试走',stops:['新屏',5]}]}).workspace;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/Users/mao/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
  const page=await (await browser.newContext()).newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:8876/?builtin');await page.waitForFunction(()=>window.editor);
  const r=await page.evaluate(w=>{const ws=editor.parseWorkspace(w);const l=ws.plans.find(p=>p.id===ws.activeId).layout;return {n:l.objects.length,tv:l.objects.find(o=>o.purpose==='新屏')?.inches,routes:(l.tour?.groups||[]).flatMap(g=>g.routes).length};},out);
  assert.equal(r.n,lay(out).objects.length);assert.equal(r.tv,55);assert.equal(r.routes,1);assert.deepEqual(errs,[]);
  await browser.close();console.log('PASS 产出的文件能被真实编辑器导入：物品数、电视英寸、路线都在');
 }catch(e){failed++;console.log('FAIL 真实编辑器导入','\n ',e.message);}
 console.log(`${tests.length+1-failed}/${tests.length+1} passed`);if(failed)process.exitCode=1;
})();
