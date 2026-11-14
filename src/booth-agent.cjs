#!/usr/bin/env node
// Agent 统一入口：读方案文件 → 列出能放什么、已有什么 → 套用「展台草稿」（物品 + 游客路线）→ 另存新文件。
// 路线部分直接复用 tour-agent.cjs（同一套校验）；物品部分在这里按编辑器 validateLayout 的规则检查。
// 格式说明：doc/Agent入口.md。用法：
//   node src/booth-agent.cjs list  <plans.json> [--plan 名称或id]
//   node src/booth-agent.cjs apply <plans.json> <draft.json> -o <新文件.json> [--plan 名称或id] [--allow-issues]
// 物料（贴在屏幕/墙上的图片）：草稿里的 decals[]，规则全部来自 decal-model.js；图片路径相对草稿文件所在目录。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const T=require('./tour-agent.cjs');
const DM=require('./decal-model.js');

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

// ---------- 物料（贴图） ----------
const FITS=['contain','cover'],MAX_PX=4096,MAX_FILE=22e6; // 与 validateAssets 的上限一致（base64 ≤ 3e7 字符）
// 只认文件头（不看扩展名）。PNG / JPG 读出宽高；WebP 编辑器会转 PNG，这里没有图像库做不到，明确拒绝。
function readImage(buf,file){
 const name=path.basename(file);
 if(buf.length>=24&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buf.toString('latin1',12,16)==='IHDR')return {mime:'image/png',width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
 if(buf.length>=4&&buf[0]===0xff&&buf[1]===0xd8){
  let i=2;
  while(i+4<=buf.length){
   if(buf[i]!==0xff){i++;continue;}
   const m=buf[i+1];if(m===0xff){i++;continue;}
   if(m===0xd8||m===0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue;}
   const len=buf.readUInt16BE(i+2);if(len<2)break;
   if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m)){if(i+9>buf.length)break;return {mime:'image/jpeg',width:buf.readUInt16BE(i+7),height:buf.readUInt16BE(i+5)};}
   i+=2+len;
  }
  throw Error('图片「'+name+'」损坏，读不出尺寸。请重新导出一张 JPG。');
 }
 if(buf.toString('latin1',0,4)==='RIFF'&&buf.toString('latin1',8,12)==='WEBP')throw Error('图片「'+name+'」是 WebP，脚本读不了。请先转成 PNG 或 JPG 再贴。');
 throw Error('文件「'+name+'」不是 PNG 或 JPG 图片。Figma 里请导出 PNG 或 JPG。');
}
function loadImage(file,baseDir,cache){
 const full=path.resolve(baseDir,String(file));
 if(cache.has(full))return cache.get(full);
 if(!fs.existsSync(full)||!fs.statSync(full).isFile())throw Error('找不到图片文件：'+full);
 const buf=fs.readFileSync(full);
 if(buf.length>MAX_FILE)throw Error('图片「'+path.basename(full)+'」太大（'+Math.round(buf.length/1e6)+' MB），请压缩到 20 MB 以内。');
 const {mime,width,height}=readImage(buf,full);
 if(!(width>=1&&height>=1&&width<=MAX_PX&&height<=MAX_PX))throw Error('图片「'+path.basename(full)+'」是 '+width+' × '+height+' 像素，长和宽都要在 1–'+MAX_PX+' 之间（建议 2048 以内）。');
 const img={id:crypto.createHash('sha256').update(buf).digest('hex'),mime,width,height,base64:buf.toString('base64')}; // 和编辑器 decals.js 的 hash() 同一算法：对存进库的文件字节做 SHA-256
 cache.set(full,img);return img;
}
const objLabel=o=>CATALOG[o.type].name+' '+o.id;
function findObject(layout,ref){
 let hits;
 if(typeof ref==='number'||(typeof ref==='string'&&/^\d+$/.test(ref.trim())))hits=layout.objects.filter(o=>o.id===Number(ref));
 else if(typeof ref==='string'&&ref.trim()){
  hits=layout.objects.filter(o=>o.purpose===ref);
  if(!hits.length)hits=layout.objects.filter(o=>CATALOG[o.type].name===ref);
 }else throw Error('decals 里每项要写 object（编号或用途名）或 wall（A/B）');
 if(!hits.length)throw Error('找不到物品「'+ref+'」。用 list 看编号和用途名');
 if(hits.length>1)throw Error('物品名「'+ref+'」不止一个（编号 '+hits.map(o=>o.id).join('、')+'），请改写编号');
 return hits[0];
}
function decalMeta(spec){
 const m={};
 const pick=(k,ok,msg)=>{if(k in spec){if(!ok(spec[k]))throw Error('物料的 '+k+' '+msg);m[k]=spec[k];}};
 pick('fit',v=>FITS.includes(v),'只能写 contain 或 cover');
 pick('scale',v=>Number.isFinite(v)&&v>=.3&&v<=2,'要在 0.3–2 之间');
 pick('ox',v=>Number.isFinite(v)&&v>=-.5&&v<=.5,'要在 −0.5–0.5 之间');
 pick('oy',v=>Number.isFinite(v)&&v>=-.5&&v<=.5,'要在 −0.5–0.5 之间');
 pick('rot',v=>[0,90,180,270].includes(v),'只能写 0 / 90 / 180 / 270');
 return {...DM.defaults(),...m};
}
function applyDecals(ws,layout,list,baseDir,report){
 const cache=new Map(),seen=new Set(),assets=ws.assets&&typeof ws.assets==='object'?ws.assets:{};
 for(const spec of list){
  if(!spec||typeof spec!=='object')throw Error('decals 里每项要是对象');
  if(spec.image==null||spec.image==='')throw Error('物料要写 image（本地图片路径）');
  let owner,allowed,face,label;
  if('wall' in spec){
   if('object' in spec)throw Error('一条物料不能同时写 object 和 wall');
   if(!['A','B'].includes(spec.wall))throw Error('wall 只能写 A 或 B');
   owner=layout.room;allowed=['A','B'];face=spec.wall;label=spec.wall+' 墙';
  }else{
   owner=findObject(layout,spec.object);label=objLabel(owner);allowed=DM.facesFor(owner.type,owner);face=spec.face;
   if(!allowed.length)throw Error('物品 '+label+' 不支持贴图（能贴的有：前台、L 型台、方形吊楣、小圆桌、电视/闺蜜机/电脑屏幕、易拉宝、亚克力牌）');
   if(face==null)throw Error('物料要写 face（物品 '+label+' 可选：'+allowed.join(', ')+'）');
   if(!allowed.includes(face))throw Error('物品 '+label+' 没有「'+face+'」这个面，可选：'+allowed.join(', '));
  }
  const key=(owner===layout.room?'room':owner.id)+'|'+face;
  if(seen.has(key))throw Error(label+' 的「'+face+'」在草稿里写了两次（重复）');seen.add(key);
  const had=!!owner.decals?.[face];
  if(had&&spec.replace!==true)throw Error(label+' 的「'+face+'」已经贴了物料。要换掉请在这一条里写 "replace": true');
  const img=loadImage(spec.image,baseDir,cache),meta=decalMeta(spec);
  assets[img.id]={mime:img.mime,width:img.width,height:img.height,base64:img.base64};
  owner.decals={...(owner.decals||{}),[face]:{source:{kind:'file'},assetId:img.id,...meta}};
  owner.decalFaces=allowed.filter(f=>f===face||(owner.decalFaces||[]).includes(f));
  report.decals.push({target:label,face,assetId:img.id,width:img.width,height:img.height,replaced:had});
 }
 // 不再有人用的旧图丢掉（和编辑器导出一样只带用到的图）
 ws.assets=assets;const used=new Set(DM.usedAssetIds(ws.plans));
 for(const id of Object.keys(ws.assets))if(!used.has(id))delete ws.assets[id];
 if(!Object.keys(ws.assets).length)delete ws.assets;
 DM.validateAssets(ws.assets); // 和编辑器导入同一道关
 // 编辑器读文件时用 cleanDecals 清洗；清洗后要和我们写的一样，否则导入后物料会静默消失
 for(const o of new Set([layout.room,...layout.objects])){
  if(!o.decals)continue;
  const al=o===layout.room?['A','B']:DM.facesFor(o.type,o),c=DM.cleanDecals(o,al);
  if(JSON.stringify(c.decals)!==JSON.stringify(o.decals))throw Error('内部错误：'+(o===layout.room?'墙':objLabel(o))+' 的物料经编辑器规则清洗后不一致，没有写出');
 }
}

function list(ws,planSel){
 const inv=T.inventory(ws,planSel);
 return {plan:inv.plan,room:inv.room,
  axes:'原点在展台中心；x 向西为正（东 = −x），z 向北为正；单位米；rotate 是度数，0 = 正面朝北（+z）。',
  catalog:Object.entries(CATALOG).map(([type,c])=>({type,name:c.name,size:c.size,y:c.lift||0,extra:c.extra||[]})),
  decalNote:'物料 = 贴在物品面或墙上的图片。面的尺寸是米，1 米 = 1000 像素（pixels）；图片比例和面一致才不会留白或被裁。图片只收 PNG / JPG，长宽 ≤ 4096 像素。',
  objects:inv.objects.map(o=>({...o,...(()=>{const raw=pickLayout(ws,planSel).objects.find(x=>x.id===o.id);return {size:raw.size.map(r2),y:r2(raw.position[1]),rotate:r2(raw.rotation*180/Math.PI),visible:raw.visible!==false,faces:facesInfo(ws,raw.type,raw,raw.size,raw)};})()})),
  walls:['A','B'].map(w=>{const room=pickLayout(ws,planSel).room,sp=DM.wallSpec(room,w);return {wall:w,name:w+' 墙内侧',size:sp.size.map(r2),pixels:sp.size.map(v=>Math.round(v*1000)),decal:decalInfo(ws,room.decals?.[w])};}),
  approaches:inv.approaches,walkArea:inv.walkArea,existingRoutes:inv.existingRoutes};
}
const decalInfo=(ws,d)=>{if(!d)return null;const a=ws.assets?.[d.assetId];return {assetId:d.assetId,fit:d.fit,scale:d.scale,ox:d.ox,oy:d.oy,rot:d.rot,image:a?[a.width,a.height]:null};};
function facesInfo(ws,type,p,size,owner){
 return DM.facesFor(type,p).map(f=>{const sp=DM.faceSpec(type,size,f,p);return sp&&{face:f,name:DM.FACE_NAMES[f],size:sp.size.map(r2),pixels:sp.size.map(v=>Math.round(v*1000)),decal:decalInfo(ws,owner.decals?.[f])};}).filter(Boolean);
}
const pickLayout=(ws,sel)=>{const p=sel==null?ws.plans.find(x=>x.id===ws.activeId)||ws.plans[0]:ws.plans.find(x=>x.id===sel||x.name===sel);return p.layout;};

function applyDraft(wsIn,draft,opts={}){
 if(!draft||typeof draft!=='object')throw Error('草稿要是一个 JSON 对象');
 const hasObjs=draft.objects||draft.remove||draft.room||draft.replaceObjects,hasRoutes=Array.isArray(draft.routes)&&draft.routes.length,hasDecals=Array.isArray(draft.decals)&&draft.decals.length;
 if(!hasObjs&&!hasRoutes&&!hasDecals)throw Error('草稿里至少要有 objects / remove / room / decals / routes 之一');
 if('decals' in draft&&!Array.isArray(draft.decals))throw Error('decals 要是一个数组');
 let ws=JSON.parse(JSON.stringify(wsIn));
 const sel=opts.plan??draft.plan,layout=pickLayout(ws,sel),report={ok:true,added:[],updated:[],removed:[],decals:[],warnings:[],routes:[]};
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
 if(hasDecals)applyDecals(ws,layout,draft.decals,opts.baseDir||process.cwd(),report);
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
  const {workspace,report}=applyDraft(read(src),read(draftPath),{plan:flags['--plan'],baseDir:path.dirname(path.resolve(draftPath))});
  console.log(JSON.stringify(report,null,1));
  if(!report.ok&&!flags['--allow-issues']){console.error('有走不通的路线，没有写出。改草稿，或加 --allow-issues 先写出再到界面里修');return 1;}
  fs.writeFileSync(out,JSON.stringify(workspace,null,2)+'\n');console.error('已写出 '+out+'。到编辑器顶栏「导入」选它。');return 0;
 }
 console.error('用法：\n  node src/booth-agent.cjs list <plans.json> [--plan 名称]\n  node src/booth-agent.cjs apply <plans.json> <draft.json> -o <新文件.json> [--plan 名称] [--allow-issues]');
 return 2;
}
if(require.main===module){try{process.exitCode=main(process.argv.slice(2));}catch(e){console.error('出错：'+e.message);process.exitCode=1;}}
module.exports={CATALOG,list,applyDraft,main};
