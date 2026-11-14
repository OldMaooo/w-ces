#!/usr/bin/env node
// Agent 统一入口：读方案文件 → 列出能放什么、已有什么 → 套用「展台草稿」（物品 + 游客路线）→ 另存新文件。
// 路线部分直接复用 tour-agent.cjs（同一套校验）；物品部分在这里按编辑器 validateLayout 的规则检查。
// 格式说明：doc/Agent入口.md。用法：
//   node src/booth-agent.cjs list  <plans.json> [--plan 名称或id]
//   node src/booth-agent.cjs apply <plans.json> <draft.json> -o <新文件.json> [--plan 名称或id] [--allow-issues]
const fs=require('node:fs'),path=require('node:path');
const T=require('./tour-agent.cjs');

// 与 app.js 的 definitions 保持一致（test-booth-agent.cjs 会对照 index.html 检查）。lift = 默认离地高度（米）。
const CATALOG={
 tv:{name:'电视',size:[1.218,.685,.09],lift:1.3,extra:['inches','portrait','purpose']},
 desk:{name:'前台',size:[1.6,1,.65]},
 robot:{name:'机器人',size:[.65,1.5,.5]},
 display:{name:'闺蜜机',size:[.6,1.5,.45],extra:['inches','portrait','purpose']},
 table:{name:'小圆桌',size:[.65,.75,.65]},
 ldesk:{name:'L 型台',size:[2.2,1,1.6],extra:['lengthA','widthA','lengthB','widthB']},
 fascia:{name:'悬空吊楣',size:[3,.6,3],lift:3.8,extra:['shape']},
 laptop:{name:'笔记本电脑',size:[.34,.24,.25]},
 webcam:{name:'电脑摄像头',size:[.10,.08,.06]},
 acrylic:{name:'桌面亚克力牌',size:[.21,.15,.07]},
 acrylicA4:{name:'A4 竖版亚克力牌',size:[.21,.297,.07]},
 acrylicA5:{name:'A5 竖版亚克力牌',size:[.1485,.21,.07]},
 rollup:{name:'易拉宝',size:[.84,2.08,.35]},
 chair:{name:'听讲椅',size:[.46,.82,.50]},
 staff:{name:'工作人员',size:[.55,1.75,.35],extra:['personScale','animation','clothesColor']},
 visitor:{name:'游客',size:[.55,1.75,.35],extra:['personScale','animation','clothesColor']},
};
const ALLOWED=['type','id','at','y','rotate','size','visible','wallSnap','wall'];
const r2=n=>Math.round(n*100)/100;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(v,what)=>{if(!Number.isFinite(v))throw Error(what+' 要是数字');return v;};

// 电视按英寸算尺寸（和 app.js screenSize 同一个公式）
function screenSize(inches,portrait){const w=inches*.0254*16/Math.sqrt(337),h=w*9/16;return portrait?[h,w]:[w,h];}

function newObject(spec,id){
 const c=CATALOG[spec.type];if(!c)throw Error('不认识的物品类型「'+spec.type+'」，可选：'+Object.keys(CATALOG).join(', '));
 const o={type:spec.type,id,size:[...c.size],position:[0,c.lift||0,0],rotation:0,visible:true,wallSnap:false};
 if(spec.type==='tv'){o.inches=Math.hypot(c.size[0],c.size[1])/.0254;o.portrait=false;o.purpose='';}
 if(spec.type==='display'){o.inches=27;o.portrait=false;o.purpose='';}
 if(spec.type==='fascia')o.shape='square';
 if(spec.type==='ldesk')Object.assign(o,{lengthA:2.2,widthA:.6,lengthB:1.6,widthB:.55});
 if(spec.type==='staff'||spec.type==='visitor')Object.assign(o,{personScale:1,animation:'Idle',clothesColor:spec.type==='staff'?'#165DFF':'#f3f3ef'});
 return o;
}
function patch(o,spec){
 const c=CATALOG[o.type],ok=new Set([...ALLOWED,...(c.extra||[])]);
 for(const k of Object.keys(spec))if(!ok.has(k)&&k!=='purpose')throw Error('物品 '+o.id+'（'+c.name+'）不支持字段「'+k+'」，可用：'+[...ok].join(', '));
 if('purpose' in spec&&!(c.extra||[]).includes('purpose'))throw Error('只有电视和闺蜜机能写 purpose（用途名）；其他物品用编号当名字');
 if(spec.at){if(!Array.isArray(spec.at)||spec.at.length!==2)throw Error('at 要写 [x, z]（米）');o.position[0]=num(spec.at[0],'at[0]');o.position[2]=num(spec.at[1],'at[1]');}
 if('y' in spec)o.position[1]=num(spec.y,'y');
 if('rotate' in spec)o.rotation=num(spec.rotate,'rotate')*Math.PI/180;
 if(spec.size){if(!Array.isArray(spec.size)||spec.size.length!==3)throw Error('size 要写 [宽, 高, 深]（米）');o.size=spec.size.map((v,i)=>num(v,'size['+i+']'));}
 for(const k of ['visible','wallSnap','portrait'])if(k in spec)o[k]=!!spec[k];
 if(spec.wall)o.wall=spec.wall==='A'?'A':'B';
 if('purpose' in spec)o.purpose=String(spec.purpose).slice(0,40);
 if('shape' in spec)o.shape=spec.shape==='round'?'round':'square';
 for(const k of ['lengthA','widthA','lengthB','widthB','personScale'])if(k in spec)o[k]=num(spec[k],k);
 for(const k of ['animation','clothesColor'])if(k in spec)o[k]=String(spec[k]);
 if(o.type==='tv'||o.type==='display'){
  if('inches' in spec)o.inches=clamp(num(spec.inches,'inches'),10,120);
  if(o.type==='tv'&&!spec.size&&('inches' in spec||'portrait' in spec)){const [w,h]=screenSize(o.inches,o.portrait);o.size=[w,h,o.size[2]];}
 }
 return o;
}
// 和编辑器同样的硬规则：编辑器导入会因为这些整份拒绝，所以这里先挡住
function check(o){
 const bad=(m)=>{throw Error('物品 '+o.id+'（'+CATALOG[o.type].name+'）'+m);};
 if(!o.size.every(n=>Number.isFinite(n)&&n>=.01&&n<=10))bad('尺寸要在 0.01–10 米之间');
 if(!o.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=100))bad('位置超出 ±100 米');
 if(!Number.isFinite(o.rotation))bad('角度无效');
}
// 超出场地的只警告不拦（有人故意把物品放到场外）
function warnings(layout){
 const hw=layout.room.width/2,hd=layout.room.depth/2,out=[];
 for(const o of layout.objects){
  if(o.visible===false)continue;
  const [x,,z]=o.position,[sx,,sz]=o.size,c=Math.abs(Math.cos(o.rotation)),s=Math.abs(Math.sin(o.rotation)),ex=(sx*c+sz*s)/2,ez=(sx*s+sz*c)/2;
  if(x-ex<-hw-.01||x+ex>hw+.01||z-ez<-hd-.01||z+ez>hd+.01)out.push('物品 '+o.id+'（'+CATALOG[o.type].name+'）有一部分在场地外');
 }
 return out;
}

function list(ws,planSel){
 const inv=T.inventory(ws,planSel);
 return {plan:inv.plan,room:inv.room,
  axes:'原点在展台中心；x 向西为正（东 = −x），z 向北为正；单位米；rotate 是度数，0 = 正面朝北（+z）。',
  catalog:Object.entries(CATALOG).map(([type,c])=>({type,name:c.name,size:c.size,y:c.lift||0,extra:c.extra||[]})),
  objects:inv.objects.map(o=>({...o,...(()=>{const raw=pickLayout(ws,planSel).objects.find(x=>x.id===o.id);return {size:raw.size.map(r2),y:r2(raw.position[1]),rotate:r2(raw.rotation*180/Math.PI),visible:raw.visible!==false};})()})),
  approaches:inv.approaches,walkArea:inv.walkArea,existingRoutes:inv.existingRoutes};
}
const pickLayout=(ws,sel)=>{const p=sel==null?ws.plans.find(x=>x.id===ws.activeId)||ws.plans[0]:ws.plans.find(x=>x.id===sel||x.name===sel);return p.layout;};

function applyDraft(wsIn,draft,opts={}){
 if(!draft||typeof draft!=='object')throw Error('草稿要是一个 JSON 对象');
 const hasObjs=draft.objects||draft.remove||draft.room||draft.replaceObjects,hasRoutes=Array.isArray(draft.routes)&&draft.routes.length;
 if(!hasObjs&&!hasRoutes)throw Error('草稿里至少要有 objects / remove / room / routes 之一');
 let ws=JSON.parse(JSON.stringify(wsIn));
 const sel=opts.plan??draft.plan,layout=pickLayout(ws,sel),report={ok:true,added:[],updated:[],removed:[],warnings:[],routes:[]};
 if(draft.room){
  for(const k of ['width','depth']){if(k in draft.room){const v=num(draft.room[k],'room.'+k);if(v<1||v>30)throw Error('场地 '+k+' 要在 1–30 米之间');layout.room[k]=v;}}
 }
 if(draft.replaceObjects){layout.objects=[];delete layout.tour;}
 const used=new Set((layout.tour?.pois||[]).map(p=>p.objectId));
 for(const id of draft.remove||[]){
  const i=layout.objects.findIndex(o=>o.id===id);if(i<0)throw Error('要删的物品 '+id+' 不存在');
  if(used.has(id))throw Error('物品 '+id+' 已是游客路线的停留点，不能直接删；先用 replaceObjects/去掉路线，或改成 visible:false');
  layout.objects.splice(i,1);report.removed.push(id);
 }
 let nextId=Math.max(0,...layout.objects.map(o=>o.id))+1;
 for(const spec of draft.objects||[]){
  if(!spec||typeof spec!=='object')throw Error('objects 里每项要是对象');
  if(spec.id!=null){
   const o=layout.objects.find(x=>x.id===spec.id);if(!o)throw Error('要改的物品 '+spec.id+' 不存在');
   if(spec.type&&spec.type!==o.type)throw Error('物品 '+spec.id+' 的类型不能改（删掉重加）');
   patch(o,spec);check(o);report.updated.push(o.id);
  }else{
   if(!spec.type)throw Error('新增物品要写 type');
   const o=newObject(spec,nextId++);patch(o,spec);check(o);layout.objects.push(o);report.added.push({id:o.id,type:o.type,name:CATALOG[o.type].name,...(o.purpose?{purpose:o.purpose}:{})});
  }
 }
 if(layout.objects.length>500)throw Error('物品超过 500 个');
 report.warnings=warnings(layout);
 if(hasRoutes){
  const planKey=ws.plans.find(p=>p.layout===layout);
  const r=T.applyDraft(ws,{...draft,plan:planKey.id},{plan:planKey.id});
  ws=r.workspace;report.routes=r.report.routes;report.ok=r.report.ok;
 }
 return {workspace:ws,report};
}

function main(argv){
 const args=[],flags={};
 for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='-o'||a==='--plan')flags[a]=argv[++i];else if(a.startsWith('--'))flags[a]=true;else args.push(a);}
 const [cmd,src,draftPath]=args,read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
 if(cmd==='list'&&src){console.log(JSON.stringify(list(read(src),flags['--plan']),null,1));return 0;}
 if(cmd==='apply'&&src&&draftPath&&flags['-o']){
  const out=path.resolve(flags['-o']);
  if(out===path.resolve(src))throw Error('不覆盖原文件：-o 请写一个新文件名');
  const {workspace,report}=applyDraft(read(src),read(draftPath),{plan:flags['--plan']});
  console.log(JSON.stringify(report,null,1));
  if(!report.ok&&!flags['--allow-issues']){console.error('有走不通的路线，没有写出。改草稿，或加 --allow-issues 先写出再到界面里修');return 1;}
  fs.writeFileSync(out,JSON.stringify(workspace,null,2)+'\n');console.error('已写出 '+out+'。到编辑器顶栏「导入」选它。');return 0;
 }
 console.error('用法：\n  node src/booth-agent.cjs list <plans.json> [--plan 名称]\n  node src/booth-agent.cjs apply <plans.json> <draft.json> -o <新文件.json> [--plan 名称] [--allow-issues]');
 return 2;
}
if(require.main===module){try{process.exitCode=main(process.argv.slice(2));}catch(e){console.error('出错：'+e.message);process.exitCode=1;}}
module.exports={CATALOG,list,applyDraft,main};
