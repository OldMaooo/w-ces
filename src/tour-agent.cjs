#!/usr/bin/env node
// Agent entry point for visitor routes: read a plans JSON → list what can be visited → apply a route draft that names
// objects instead of coordinates → validate with the same code the editor uses → write a NEW plans JSON.
// Format guide: doc/路线草稿-Agent格式.md.  Usage:
//   node src/tour-agent.cjs list  <plans.json> [--plan 名称或id]
//   node src/tour-agent.cjs apply <plans.json> <draft.json> -o <out.json> [--plan 名称或id] [--allow-issues]
const fs=require('node:fs'),path=require('node:path');
const M=require('./tour-model.js'),P=require('./tour-path.js'),Plan=require('./tour-plan.js');
const {ops}=Plan;
const TYPE_NAMES={tv:'电视',desk:'前台',robot:'机器人',display:'闺蜜机',table:'小圆桌',ldesk:'L 型台',fascia:'悬空吊楣',laptop:'笔记本电脑',webcam:'电脑摄像头',acrylic:'桌面亚克力牌',acrylicA4:'A4 竖版亚克力牌',acrylicA5:'A5 竖版亚克力牌',rollup:'易拉宝',chair:'听讲椅',staff:'工作人员',visitor:'游客'};
const SIDES=['front','left','right','back'];
const r2=n=>Math.round(n*100)/100;

// Same numbers as venue.js buildVenue() (that file needs THREE, so the formula is repeated here; a test keeps them equal).
function venueFor(room){
 const sx=room.width/67,sz=room.depth/60,north=room.depth/2,west=room.width/2;
 const aisleX=20*.3048,aisleZ=12*.3048,rightW=199*sx,rightD=133*sz,creatorD=368*sz;
 const creatorSouth=north+aisleZ,creatorNorth=creatorSouth+creatorD,leftX=west+aisleX,leftW=269*sx;
 const minX=west-rightW,maxX=leftX+leftW,minZ=north-rightD,maxZ=creatorNorth+34*sz;
 return {bounds:{minX,maxX,minZ,maxZ},aisleX,aisleZ};
}
function pickPlan(ws,sel){
 if(!ws||!Array.isArray(ws.plans)||!ws.plans.length)throw Error('不是展台方案文件（缺 plans）');
 const p=sel==null?ws.plans.find(x=>x.id===ws.activeId)||ws.plans[0]:ws.plans.find(x=>x.id===sel||x.name===sel);
 if(!p)throw Error('找不到方案「'+sel+'」，可选：'+ws.plans.map(x=>x.name).join('、'));
 return p;
}
const objName=o=>o.purpose||((TYPE_NAMES[o.type]||o.type)+' '+o.id);
const hidden=o=>o.visible===false||o.hidden===true;
// editor passes this name to the path finder for "blocked by X"
const navObjects=objects=>objects.map(o=>({...o,name:o.type==='acrylicA4'||o.type==='acrylicA5'?'亚克力立牌':TYPE_NAMES[o.type]||o.type}));
function context(layout){
 const room={wallA:true,wallB:true,...layout.room},venue=venueFor(room),objects=layout.objects;
 return {room,venue,objects,nav:P.buildNav(navObjects(objects),room,venue)};
}
// Stand spot: the requested side (or front, left, right, back) at 1 m, then a little closer / farther. Local coords.
function findStand(o,nav,side){
 const [hx,hz]=M.footprintHalf(o),order=side?[side]:SIDES;
 for(const gap of [1,.7,1.3,1.6,2])for(const s of order){
  const st={front:[0,hz+gap],left:[-(hx+gap),0],right:[hx+gap,0],back:[0,-(hz+gap)]}[s],w=M.localToWorld(o,st);
  if(nav.isWalkable(w[0],w[1]))return st;
 }
 return null;
}

function inventory(ws,planSel){
 const plan=pickPlan(ws,planSel),c=context(plan.layout),tour=plan.layout.tour||M.emptyTour();
 const objects=c.objects.map(o=>{
  const usable=!hidden(o)&&o.type!=='fascia',st=usable?findStand(o,c.nav):null;
  return {id:o.id,type:o.type,typeName:TYPE_NAMES[o.type]||o.type,name:objName(o),usable,position:[r2(o.position[0]),r2(o.position[2])],
   stand:st?M.localToWorld(o,st).map(r2):null,standOk:!!st,poi:(tour.pois.find(p=>p.objectId===o.id)||{}).name||null};
 });
 return {plan:{id:plan.id,name:plan.name},room:c.room,
  approaches:M.APPROACHES.filter(a=>a!=='other').map(a=>({approach:a,name:M.APPROACH_NAMES[a],...M.defaultEntryExit(a,c.room,c.venue)})),
  walkArea:P.walkRegion(c.room,c.venue).rects.map(r=>({x:[r2(r.x0),r2(r.x1)],z:[r2(r.z0),r2(r.z1)]})),
  objects,existingRoutes:tour.groups.flatMap(g=>g.routes.map(r=>g.name+' / '+r.name))};
}

function applyDraft(wsIn,draft,opts={}){
 if(!draft||!Array.isArray(draft.routes)||!draft.routes.length)throw Error('草稿里要有 routes 数组');
 const ws=JSON.parse(JSON.stringify(wsIn)),plan=pickPlan(ws,opts.plan??draft.plan),layout=plan.layout,c=context(layout);
 const tour=draft.replace||!layout.tour?M.emptyTour():M.cloneTour(layout.tour);
 const objById=id=>{
  const o=c.objects.find(x=>x.id===id);if(!o)throw Error('找不到物料编号 '+id);
  if(hidden(o))throw Error('物料 '+id+'（'+objName(o)+'）是隐藏的，不能当停留点');
  if(o.type==='fascia')throw Error('物料 '+id+' 是吊楣，不能当停留点');return o;
 };
 const poiFor=(o,spec={})=>{
  let p=tour.pois.find(x=>x.objectId===o.id);
  if(!p){
   const st=spec.standAt?M.worldToLocal(o,spec.standAt):findStand(o,c.nav,spec.side);
   if(!st)throw Error('物料 '+o.id+'（'+objName(o)+'）四周找不到能站的位置，请在 pois 里给 standAt:[x,z]');
   p=ops.addPoi(tour,o,{name:spec.name||objName(o),dwell:spec.dwell});if(!p)throw Error('兴趣点太多');p.stand=st;
  }else{
   if(spec.name)p.name=spec.name;if(spec.dwell!=null)p.dwell=spec.dwell;
   if(spec.standAt)p.stand=M.worldToLocal(o,spec.standAt);else if(spec.side){const st=findStand(o,c.nav,spec.side);if(st)p.stand=st;}
  }
  return p;
 };
 for(const spec of draft.pois||[])poiFor(objById(spec.object),spec);
 const resolve=ref=>{ // number = object id; text = 兴趣点名字 or 物料用途名
  if(typeof ref==='number')return poiFor(objById(ref));
  const byPoi=tour.pois.filter(p=>p.name===ref);if(byPoi.length===1)return byPoi[0];
  const byObj=c.objects.filter(o=>!hidden(o)&&objName(o)===ref);
  if(byPoi.length>1||byObj.length>1)throw Error('「'+ref+'」不止一个，请改用物料编号');
  if(!byObj.length)throw Error('找不到「'+ref+'」，用 list 看可用的名字和编号');
  return poiFor(byObj[0]);
 };
 const groups=new Map(),report={ok:true,plan:plan.name,routes:[]},made=[];
 for(const rd of draft.routes){
  const approach=rd.approach||'north-ew';if(!M.APPROACHES.includes(approach))throw Error('来向「'+approach+'」无效，可选：'+M.APPROACHES.join(', '));
  const gname=String(rd.group||rd.name||'大方案');
  let g=groups.get(gname);
  if(!g){g=ops.newGroup(tour,gname,approach,c.room,c.venue);if(!g)throw Error('大方案太多');groups.set(gname,g);}
  if(rd.entry)g.entry=[rd.entry[0],rd.entry[1]];if(rd.exit)g.exit=[rd.exit[0],rd.exit[1]];
  const r=ops.newRoute(g,String(rd.name||'子方案'),tour);if(!r)throw Error('子方案太多');
  if(rd.speed!=null)r.speed=rd.speed;if(rd.eyeHeight!=null)r.eyeHeight=rd.eyeHeight;
  if(!Array.isArray(rd.stops))throw Error('子方案「'+r.name+'」缺 stops');
  for(const s of rd.stops){
   const isObj=s&&typeof s==='object';
   if(isObj&&s.pos){ops.addWaypoint(r,s.pos);if(s.dwell!=null)r.stops[r.stops.length-1].dwell=s.dwell;continue;}
   const p=resolve(isObj?(s.object??s.name):s);
   if(!ops.addStop(r,p.id))throw Error('站太多');if(isObj&&s.dwell!=null)r.stops[r.stops.length-1].dwell=s.dwell;
  }
  made.push([g,r]);
 }
 const v=M.validateTour(tour);if(!v.ok)throw Error('生成的路线没通过编辑器校验：'+v.error);
 layout.tour=v.tour;
 const ctx={tour:v.tour,objects:navObjects(c.objects),nav:c.nav};
 for(const [g0,r0] of made){
  const g=v.tour.groups.find(x=>x.id===g0.id),r=g.routes.find(x=>x.id===r0.id),a=ops.analyzeRoute(ctx,g,r);
  const metres=a.legs.reduce((s,leg)=>s+leg.slice(1).reduce((t,p,i)=>t+Math.hypot(p[0]-leg[i][0],p[1]-leg[i][1]),0),0);
  report.routes.push({group:g.name,name:r.name,label:a.label,ok:a.ok,seconds:a.ok?Math.round(a.total):null,metres:Math.round(metres*10)/10,issues:a.issues.map(i=>i.text)});
  if(!a.ok)report.ok=false;
 }
 return {workspace:ws,report};
}

function main(argv){
 const args=[],flags={};
 for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='-o'||a==='--plan')flags[a]=argv[++i];else if(a.startsWith('--'))flags[a]=true;else args.push(a);}
 const [cmd,src,draftPath]=args,read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
 if(cmd==='list'&&src){console.log(JSON.stringify(inventory(read(src),flags['--plan']),null,1));return 0;}
 if(cmd==='apply'&&src&&draftPath&&flags['-o']){
  const out=path.resolve(flags['-o']);
  if(out===path.resolve(src))throw Error('不覆盖原文件：-o 请写一个新文件名');
  const {workspace,report}=applyDraft(read(src),read(draftPath),{plan:flags['--plan']});
  console.log(JSON.stringify(report,null,1));
  if(!report.ok&&!flags['--allow-issues']){console.error('有走不通的路线，没有写出。改草稿，或加 --allow-issues 先写出再到界面里修');return 1;}
  fs.writeFileSync(out,JSON.stringify(workspace,null,2)+'\n');console.error('已写出 '+out);return 0;
 }
 console.error('用法：\n  node src/tour-agent.cjs list <plans.json> [--plan 名称]\n  node src/tour-agent.cjs apply <plans.json> <draft.json> -o <新文件.json> [--plan 名称] [--allow-issues]');
 return 2;
}
if(require.main===module){try{process.exitCode=main(process.argv.slice(2));}catch(e){console.error('出错：'+e.message);process.exitCode=1;}}
module.exports={venueFor,inventory,applyDraft,main};
