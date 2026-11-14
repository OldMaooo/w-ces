// Visitor-route data model: pure functions, no DOM / THREE / storage. Works in the browser (global TourModel) and in node (require).
// World axes: north = +Z, west = +X (east = -X). Object rotation is THREE's rotation.y.
const TourModel=(()=>{
 const LIMITS={pois:100,groups:20,routes:30,stops:50};
 const APPROACHES=['north-ew','north-we','west-sn','west-ns','other'];
 const APPROACH_NAMES={'north-ew':'北过道·东→西','north-we':'北过道·西→东','west-sn':'西过道·南→北','west-ns':'西过道·北→南',other:'其他'};
 const DEFAULT_DWELL=5,STAND_GAP=1.0,ENTRY_MARGIN=3;
 const fin=n=>typeof n==='number'&&Number.isFinite(n);
 const emptyTour=()=>({pois:[],groups:[]});
 const cloneTour=t=>JSON.parse(JSON.stringify(t));
 function newId(prefix,taken){
  const has=id=>taken instanceof Set?taken.has(id):(taken||[]).includes(id);
  for(;;){const id=prefix+Math.random().toString(36).slice(2,8);if(!has(id))return id;}
 }
 const nextNum=tour=>tour.pois.reduce((m,p)=>Math.max(m,p.num),0)+1;
 // Local (x right-of-front, z front) <-> world, matching THREE rotation.y = θ.
 function localToWorld(o,[lx,lz]){const t=o.rotation,c=Math.cos(t),s=Math.sin(t);return [o.position[0]+lx*c+lz*s,o.position[2]-lx*s+lz*c];}
 function worldToLocal(o,[wx,wz]){const t=o.rotation,c=Math.cos(t),s=Math.sin(t),dx=wx-o.position[0],dz=wz-o.position[2];return [dx*c-dz*s,dx*s+dz*c];}
 const footprintHalf=o=>[o.size[0]/2,o.size[2]/2];
 const poiWorldStand=(poi,o)=>localToWorld(o,poi.stand);
 // Front (local +Z) first, then left, right, back; 1.0 m outside the footprint's bounding edge.
 function defaultStand(o,isWalkable){
  const [hx,hz]=footprintHalf(o);
  const tries=[['front',[0,hz+STAND_GAP]],['left',[-(hx+STAND_GAP),0]],['right',[hx+STAND_GAP,0]],['back',[0,-(hz+STAND_GAP)]]];
  if(typeof isWalkable==='function'){
   for(const [side,stand] of tries){const w=localToWorld(o,stand);if(isWalkable(w[0],w[1]))return {stand,side,blocked:false};}
   return {stand:tries[0][1],side:'front',blocked:true};
  }
  return {stand:tries[0][1],side:'front',blocked:false};
 }
 function makePoi(tour,o,opts={}){
  const {stand}=defaultStand(o,opts.isWalkable);
  const taken=new Set(tour.pois.map(p=>p.id));
  return {id:newId('p',taken),objectId:o.id,num:nextNum(tour),name:typeof opts.name==='string'&&opts.name?opts.name:'物料 '+o.id,dwell:fin(opts.dwell)&&opts.dwell>=0?opts.dwell:DEFAULT_DWELL,stand};
 }
 // null = fine; otherwise why the stop can't be used right now.
 function staleReason(tour,stop,objects){
  if(stop.pos)return null;   // 路径点（不挂在兴趣点上）永远可用
  const poi=tour.pois.find(p=>p.id===stop.poiId);if(!poi)return 'poi-removed';
  const o=objects.find(x=>x.id===poi.objectId);if(!o)return 'object-missing';
  return o.hidden===true||o.visible===false?'object-hidden':null;
 }
 function stopDwell(tour,stop){
  if(fin(stop.dwell))return stop.dwell;
  const poi=tour.pois.find(p=>p.id===stop.poiId);return poi?poi.dwell:0;
 }
 function defaultEntryExit(approach,room,venue){
  const w=room.width/2,n=room.depth/2,{bounds:b,aisleX,aisleZ}=venue;
  const cx=x=>Math.min(b.maxX-.5,Math.max(b.minX+.5,x)),cz=z=>Math.min(b.maxZ-.5,Math.max(b.minZ+.5,z));
  const northY=n+aisleZ/2,westX=w+aisleX/2;
  const ew={entry:[cx(-w-ENTRY_MARGIN),northY],exit:[cx(w+ENTRY_MARGIN),northY]};
  const sn={entry:[westX,cz(-n-ENTRY_MARGIN)],exit:[westX,cz(n+ENTRY_MARGIN)]};
  if(approach==='north-we')return {entry:ew.exit,exit:ew.entry};
  if(approach==='west-sn')return sn;
  if(approach==='west-ns')return {entry:sn.exit,exit:sn.entry};
  return ew;
 }

 // ---- validation: returns {ok:true,tour:<fresh copy>} or {ok:false,error}; never throws, never returns a half-built tour ----
 class Bad extends Error{}
 const fail=m=>{throw new Bad(m);};
 const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const str=(v,what,max=64)=>{if(typeof v!=='string')fail(what+'必须是文字');return v.slice(0,max);};
 const id=(v,what)=>{if(typeof v!=='string'||!v||v.length>64)fail(what+'编号无效');return v;};
 const num=(v,what,min,max)=>{if(!fin(v)||v<min||v>max)fail(what+'数值无效');return v;};
 const pair=(v,what,lim)=>{if(!Array.isArray(v)||v.length!==2||!v.every(n=>fin(n)&&Math.abs(n)<=lim))fail(what+'坐标无效');return [v[0],v[1]];};
 function parse(raw){
  if(!isObj(raw)||!Array.isArray(raw.pois)||!Array.isArray(raw.groups))fail('路线数据格式不对');
  if(raw.pois.length>LIMITS.pois)fail('兴趣点太多（最多 '+LIMITS.pois+' 个）');
  if(raw.groups.length>LIMITS.groups)fail('大方案太多（最多 '+LIMITS.groups+' 个）');
  const poiIds=new Set(),nums=new Set(),groupIds=new Set(),routeIds=new Set();
  const pois=raw.pois.map(p=>{
   if(!isObj(p))fail('兴趣点格式不对');
   const pid=id(p.id,'兴趣点');if(poiIds.has(pid))fail('兴趣点编号重复');poiIds.add(pid);
   if(!Number.isInteger(p.objectId)||p.objectId<1)fail('兴趣点对应的物料编号无效');
   if(!Number.isInteger(p.num)||p.num<1)fail('兴趣点序号无效');if(nums.has(p.num))fail('兴趣点序号重复');nums.add(p.num);
   return {id:pid,objectId:p.objectId,num:p.num,name:str(p.name,'兴趣点名称',40),dwell:p.dwell===undefined?DEFAULT_DWELL:num(p.dwell,'停留时间',0,3600),stand:pair(p.stand,'站位',100)};
  });
  const groups=raw.groups.map(g=>{
   if(!isObj(g)||!Array.isArray(g.routes))fail('大方案格式不对');
   const gid=id(g.id,'大方案');if(groupIds.has(gid))fail('大方案编号重复');groupIds.add(gid);
   if(!APPROACHES.includes(g.approach))fail('来向无效');
   if(g.routes.length>LIMITS.routes)fail('子方案太多（每个大方案最多 '+LIMITS.routes+' 条）');
   const routes=g.routes.map(r=>{
    if(!isObj(r)||!Array.isArray(r.stops))fail('子方案格式不对');
    const rid=id(r.id,'子方案');if(routeIds.has(rid))fail('子方案编号重复');routeIds.add(rid);
    if(r.stops.length>LIMITS.stops)fail('站太多（每条路线最多 '+LIMITS.stops+' 站）');
    const stops=r.stops.map(s=>{
     if(!isObj(s))fail('站格式不对');
     const out=s.poiId===undefined?{pos:pair(s.pos,'路径点',1000)}:{poiId:id(s.poiId,'站')};if(s.dwell!==undefined)out.dwell=num(s.dwell,'站停留时间',0,3600);return out;
    });
    return {id:rid,name:str(r.name,'子方案名称',40),speed:r.speed===undefined?1:num(r.speed,'走速',1e-3,10),eyeHeight:r.eyeHeight===undefined?1.75:num(r.eyeHeight,'眼高',.5,3),stops};
   });
   return {id:gid,name:str(g.name,'大方案名称',40),approach:g.approach,entry:pair(g.entry,'入口',1000),exit:pair(g.exit,'出口',1000),routes};
  });
  return {pois,groups};
 }
 function validateTour(raw){
  try{return {ok:true,tour:parse(raw)};}catch(e){if(e instanceof Bad)return {ok:false,error:e.message};throw e;}
 }
 return {LIMITS,APPROACHES,APPROACH_NAMES,DEFAULT_DWELL,emptyTour,cloneTour,newId,nextNum,localToWorld,worldToLocal,footprintHalf,poiWorldStand,defaultStand,makePoi,staleReason,stopDwell,defaultEntryExit,validateTour};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TourModel;
