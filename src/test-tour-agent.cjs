// Tests for the Agent entry point src/tour-agent.cjs (no browser). Run: node src/test-tour-agent.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const A=require('./tour-agent.cjs');
const M=require('./tour-model.js');
const Plan=require('./tour-plan.js');
const P=require('./tour-path.js');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const SRC=path.join(__dirname,'../doc/Files/CES-02.json');
const ces=()=>JSON.parse(fs.readFileSync(SRC,'utf8'));
const draft=(extra={})=>({routes:[{name:'快速亮点',approach:'north-ew',stops:[5,'虚拟大脑',{object:1,dwell:12}]}],...extra});

test('场馆尺寸公式和 venue.js 一致',()=>{
 const src=fs.readFileSync(path.join(__dirname,'venue.js'),'utf8');
 const body=src.split('\n').filter(l=>/const (sx|aisleX|creatorSouth|minX)=/.test(l)).join('\n');
 for(const room of [{width:6.1,depth:5.5},{width:9,depth:4}]){
  const ref=new Function('room',body+'\nreturn {bounds:{minX,maxX,minZ,maxZ},aisleX,aisleZ};')(room);
  assert.deepEqual(A.venueFor(room),ref);
 }
});
test('清单：列出可停留物品（名字、站位世界坐标、能不能站），隐藏的标不可用',()=>{
 const inv=A.inventory(ces());
 assert.equal(inv.plan.name,'02');
 const tv5=inv.objects.find(o=>o.id===5);
 assert.equal(tv5.name,'平行宇宙');assert.equal(tv5.usable,true);assert.equal(tv5.standOk,true);
 assert.ok(Array.isArray(tv5.stand)&&tv5.stand.length===2);
 const hidden=inv.objects.find(o=>o.id===2);assert.equal(hidden.usable,false);
 assert.ok(inv.approaches.find(a=>a.approach==='west-sn').entry.length===2);
 assert.ok(inv.walkArea.length===3);
});
test('套用草稿：按物品编号 / 名字指定停留点，自动建兴趣点、校验通过、能算出时长',()=>{
 const ws=ces(),{workspace,report}=A.applyDraft(ws,draft());
 assert.equal(report.ok,true,JSON.stringify(report));
 const tour=workspace.plans[0].layout.tour;
 assert.equal(M.validateTour(tour).ok,true);
 assert.deepEqual(tour.pois.map(p=>p.objectId),[5,4,1]);
 assert.deepEqual(tour.pois.map(p=>p.num),[1,2,3]);
 const g=tour.groups[0],r=g.routes[0];
 assert.equal(g.approach,'north-ew');assert.equal(r.stops[2].dwell,12);
 const objects=workspace.plans[0].layout.objects,room=workspace.plans[0].layout.room;
 const a=Plan.ops.analyzeRoute({tour,objects,nav:P.buildNav(objects,room,A.venueFor(room))},g,r);
 assert.equal(a.ok,true);assert.ok(report.routes[0].seconds>12);
 assert.equal(ws.plans[0].layout.tour,undefined,'不改传入的原对象');
});
test('同一大方案里的多条子方案：group 字段相同就归在一起',()=>{
 const {workspace,report}=A.applyDraft(ces(),{routes:[
  {name:'A',group:'北来',approach:'north-ew',stops:[5]},{name:'B',group:'北来',approach:'north-ew',stops:[4]},{name:'C',approach:'west-sn',stops:[8]}]});
 assert.equal(report.ok,true);const gs=workspace.plans[0].layout.tour.groups;
 assert.equal(gs.length,2);assert.deepEqual(gs[0].routes.map(r=>r.name),['A','B']);
});
test('引用隐藏物品 / 不存在 / 重名：报错说清楚，不写出',()=>{
 assert.throws(()=>A.applyDraft(ces(),{routes:[{name:'x',approach:'north-ew',stops:[2]}]}),/2.*隐藏/);
 assert.throws(()=>A.applyDraft(ces(),{routes:[{name:'x',approach:'north-ew',stops:['不存在的东西']}]}),/找不到/);
 assert.throws(()=>A.applyDraft(ces(),{routes:[{name:'x',approach:'nowhere',stops:[5]}]}),/来向/);
 const ws=ces();ws.plans[0].layout.objects.find(o=>o.id===1).purpose='虚拟大脑';
 assert.throws(()=>A.applyDraft(ws,{routes:[{name:'x',approach:'north-ew',stops:['虚拟大脑']}]}),/不止一个/);
});
test('走不通（路径点放在桌子里）：report.ok=false 并说明哪段',()=>{
 const {report}=A.applyDraft(ces(),{routes:[{name:'x',approach:'north-ew',stops:[5,{pos:[0.9,-2.3]}]}]});
 assert.equal(report.ok,false);assert.ok(report.routes[0].issues.length>0);
});
test('追加模式：保留已有路线，同一物品复用已有兴趣点；replace 才清空',()=>{
 const first=A.applyDraft(ces(),draft()).workspace;
 const {workspace}=A.applyDraft(first,{routes:[{name:'第二条',approach:'west-sn',stops:[5,8]}]});
 const tour=workspace.plans[0].layout.tour;
 assert.equal(tour.groups.length,2);assert.equal(tour.pois.filter(p=>p.objectId===5).length,1);
 const rep=A.applyDraft(first,{replace:true,routes:[{name:'只剩我',approach:'west-sn',stops:[8]}]}).workspace.plans[0].layout.tour;
 assert.equal(rep.groups.length,1);assert.deepEqual(rep.pois.map(p=>p.objectId),[8]);
});
test('兴趣点自定义：名字、默认停留、站在哪一侧、直接给站位坐标',()=>{
 const {workspace}=A.applyDraft(ces(),{pois:[{object:5,name:'平行宇宙大屏',dwell:30,side:'front'},{object:8,standAt:[3.6,-1.6]}],routes:[{name:'x',approach:'west-sn',stops:['平行宇宙大屏',8]}]});
 const tour=workspace.plans[0].layout.tour,o8=workspace.plans[0].layout.objects.find(o=>o.id===8);
 assert.equal(tour.pois[0].name,'平行宇宙大屏');assert.equal(tour.pois[0].dwell,30);
 const w=M.localToWorld(o8,tour.pois.find(p=>p.objectId===8).stand);
 assert.ok(Math.abs(w[0]-3.6)<1e-9&&Math.abs(w[1]+1.6)<1e-9);
});
test('命令行：list 打印清单；apply 写到新文件，不许覆盖原文件',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tour-agent-')),d=path.join(dir,'d.json'),out=path.join(dir,'out.json'),cli=path.join(__dirname,'tour-agent.cjs');
 fs.writeFileSync(d,JSON.stringify(draft()));
 assert.match(execFileSync('node',[cli,'list',SRC],{encoding:'utf8'}),/平行宇宙/);
 const before=fs.readFileSync(SRC,'utf8');
 execFileSync('node',[cli,'apply',SRC,d,'-o',out],{encoding:'utf8'});
 assert.equal(fs.readFileSync(SRC,'utf8'),before);
 const w=JSON.parse(fs.readFileSync(out,'utf8'));assert.equal(w.format,'ces-booth-plans');assert.equal(w.plans[0].layout.tour.groups.length,1);
 assert.throws(()=>execFileSync('node',[cli,'apply',SRC,d,'-o',SRC],{stdio:'pipe'}));
 assert.equal(fs.readFileSync(SRC,'utf8'),before);
});

let fail=0;
for(const [name,fn] of tests){try{fn();console.log('✓',name);}catch(e){fail++;console.log('✗',name,'\n ',e.message);}}
console.log(fail?`${fail} failed`:`all ${tests.length} passed`);process.exit(fail?1:0);
