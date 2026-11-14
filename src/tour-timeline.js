// Visitor-route timeline: pure functions, no DOM / THREE / storage. Works in the browser (global TourTimeline) and in node (require).
// Points are [x, z] metres; yaw 0 faces north (+Z), +π/2 faces west (+X), -π/2 faces east (-X).
const TourTimeline=(()=>{
 const WALK_SPEED=1.2,TURN_SECONDS_PER_90=.4,DEFAULT_EYE_HEIGHT=1.75,MIN_LEN=1e-9,MIN_TURN=1e-6;
 const heading=(dx,dz)=>Math.atan2(dx,dz);
 const wrap=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;   // [-π, π)

 // legs[k]: polyline from the previous stop (or entry) to the next stop (or exit); legs.length = stops + 1.
 // dwells[k]: seconds to stand at stop k. looks[k]: {x,z,y?} to face while standing, or null. speed: multiplier on WALK_SPEED.
 function compileRoute(legs,dwells,looks,speed=1){
  if(!Array.isArray(legs)||!legs.length||!legs.every(Array.isArray))throw Error('路线折线无效');
  if(dwells.length!==legs.length-1||looks.length!==legs.length-1)throw Error('站的停留时间或看向目标数量和折线段数对不上');
  const v=WALK_SPEED*speed,items=[],stops=[];
  let t=0,walkTotal=0,yaw=null;
  const start=legs[0][0]?[legs[0][0][0],legs[0][0][1]]:[0,0];
  let x=start[0],z=start[1];
  const turnTo=(target,stopIndex)=>{
   if(yaw===null){yaw=target;return;}
   const d=wrap(target-yaw);if(Math.abs(d)<MIN_TURN){yaw=target;return;}
   const dur=Math.abs(d)/(Math.PI/2)*TURN_SECONDS_PER_90;
   items.push({type:'turn',t0:t,t1:t+dur,x,z,yaw0:yaw,yaw1:yaw+d,stopIndex});t+=dur;yaw=target;
  };
  legs.forEach((leg,k)=>{
   for(let i=0;i<leg.length;i++){
    const [px,pz]=leg[i];
    if(i===0){if(Math.hypot(px-x,pz-z)>MIN_LEN){x=px;z=pz;}continue;}   // legs join end to start; only follow a gap if there is one
    const dx=px-x,dz=pz-z,len=Math.hypot(dx,dz);if(len<MIN_LEN)continue;
    turnTo(heading(dx,dz),-1);
    const dur=len/v;items.push({type:'walk',t0:t,t1:t+dur,x0:x,z0:z,x1:px,z1:pz,yaw});t+=dur;walkTotal+=dur;x=px;z=pz;
   }
   if(k>=legs.length-1)return;
   const look=looks[k],arrive=t;let lookYaw=yaw??0;
   if(look&&Math.hypot(look.x-x,look.z-z)>MIN_LEN){lookYaw=heading(look.x-x,look.z-z);turnTo(lookYaw,k);}
   else if(yaw===null)yaw=0;
   const dwell=Math.max(0,dwells[k]||0);
   if(dwell>0){items.push({type:'hold',t0:t,t1:t+dwell,x,z,yaw,lookYaw,look:look?{x:look.x,z:look.z,y:look.y}:null,stopIndex:k});t+=dwell;}
   stops.push({index:k,t0:arrive,t1:t,x,z});
  });
  return {start,end:[x,z],endYaw:yaw??0,items,stops,total:t,walkTotal};
 }

 // Pure function of (compiled, t): safe to call in any order, never mutates `compiled`.
 function sampleRoute(c,t,eyeHeight=DEFAULT_EYE_HEIGHT){
  t=Math.min(Math.max(Number.isFinite(t)?t:0,0),c.total);
  if(!c.items.length||t>=c.total){
   const yaw=c.endYaw;
   return {x:c.end[0],z:c.end[1],bodyYaw:yaw,lookYaw:yaw,lookPitch:0,phase:'done',stopIndex:-1,remaining:Math.max(0,c.total-t)};
  }
  let lo=0,hi=c.items.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(c.items[mid].t1>t)hi=mid;else lo=mid+1;}
  const it=c.items[lo],u=it.t1>it.t0?(t-it.t0)/(it.t1-it.t0):0,remaining=c.total-t;
  if(it.type==='walk')return {x:it.x0+(it.x1-it.x0)*u,z:it.z0+(it.z1-it.z0)*u,bodyYaw:it.yaw,lookYaw:it.yaw,lookPitch:0,phase:'walk',stopIndex:-1,remaining};
  if(it.type==='turn'){const yaw=it.yaw0+(it.yaw1-it.yaw0)*u;return {x:it.x,z:it.z,bodyYaw:yaw,lookYaw:yaw,lookPitch:0,phase:'turn',stopIndex:it.stopIndex,remaining};}
  let pitch=0;
  if(it.look&&Number.isFinite(it.look.y)){const d=Math.hypot(it.look.x-it.x,it.look.z-it.z);if(d>MIN_LEN)pitch=Math.atan2(it.look.y-eyeHeight,d);}
  return {x:it.x,z:it.z,bodyYaw:it.yaw,lookYaw:it.lookYaw,lookPitch:pitch,phase:'hold',stopIndex:it.stopIndex,remaining};
 }
 const advance=(t,dt,rate,total)=>Math.min(Math.max(t+dt*rate,0),total);
 return {WALK_SPEED,TURN_SECONDS_PER_90,DEFAULT_EYE_HEIGHT,compileRoute,sampleRoute,advance};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TourTimeline;
