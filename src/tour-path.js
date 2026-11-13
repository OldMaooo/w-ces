// Visitor-route pathfinding: pure functions, no DOM / THREE / storage. Works in the browser (global TourPath) and in node (require).
// World axes: north = +Z, west = +X (east = -X). Points are [x, z] in metres. Object rotation is THREE's rotation.y.
// Walkable = (booth ∪ north aisle ∪ west aisle) minus every obstacle inflated by the body radius (0.3 m).
const TourPath=(()=>{
 const R=.3,CELL=.1,EPS=1e-9,NEAR=.12,SAMPLE=.05;
 const NON_OBSTACLE=new Set(['fascia','laptop','webcam','acrylic','acrylicA4','acrylicA5']); // overhead, or sitting on other items
 const PERSON=new Set(['staff','visitor']);
 // Fallback labels for the "blocked by X" message; callers may pass `name` on each object instead (same wording as app.js definitions).
 const TYPE_NAMES={tv:'电视',desk:'前台',robot:'机器人',display:'闺蜜机',table:'小圆桌',ldesk:'L 型台',rollup:'易拉宝',chair:'听讲椅',staff:'工作人员',visitor:'游客'};

 // ---- geometry ----
 function distPtSeg(px,pz,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;let t=l2?((px-ax)*dx+(pz-az)*dz)/l2:0;t=t<0?0:t>1?1:t;
  return Math.hypot(px-(ax+t*dx),pz-(az+t*dz));
 }
 const cross=(ox,oz,ax,az,bx,bz)=>(ax-ox)*(bz-oz)-(az-oz)*(bx-ox);
 function segsIntersect(ax,az,bx,bz,cx,cz,dx,dz){
  const d1=cross(cx,cz,dx,dz,ax,az),d2=cross(cx,cz,dx,dz,bx,bz),d3=cross(ax,az,bx,bz,cx,cz),d4=cross(ax,az,bx,bz,dx,dz);
  return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));
 }
 function pointInPoly(pts,x,z){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
   const [xi,zi]=pts[i],[xj,zj]=pts[j];
   if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;
  }
  return inside;
 }
 function shapeDistPt(s,x,z){
  if(s.kind==='circle')return Math.max(0,Math.hypot(x-s.cx,z-s.cz)-s.r);
  if(pointInPoly(s.pts,x,z))return 0;
  let m=Infinity;
  for(let i=0,j=s.pts.length-1;i<s.pts.length;j=i++)m=Math.min(m,distPtSeg(x,z,s.pts[j][0],s.pts[j][1],s.pts[i][0],s.pts[i][1]));
  return m;
 }
 function shapeDistSeg(s,ax,az,bx,bz){
  if(s.kind==='circle')return Math.max(0,distPtSeg(s.cx,s.cz,ax,az,bx,bz)-s.r);
  if(pointInPoly(s.pts,ax,az)||pointInPoly(s.pts,bx,bz))return 0;
  let m=Infinity;
  for(let i=0,j=s.pts.length-1;i<s.pts.length;j=i++){
   const [cx,cz]=s.pts[j],[dx,dz]=s.pts[i];
   if(segsIntersect(ax,az,bx,bz,cx,cz,dx,dz))return 0;
   m=Math.min(m,distPtSeg(ax,az,cx,cz,dx,dz),distPtSeg(bx,bz,cx,cz,dx,dz),distPtSeg(cx,cz,ax,az,bx,bz),distPtSeg(dx,dz,ax,az,bx,bz));
  }
  return m;
 }

 // ---- obstacles ----
 function polyShape(pts,name,id){
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
  for(const [x,z] of pts){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  return {kind:'poly',pts,bbox:[x0,z0,x1,z1],name,id};
 }
 function localRect(o,x0,x1,z0,z1,name){ // rectangle given in the object's local frame, rotated into the world
  const c=Math.cos(o.rotation),s=Math.sin(o.rotation),px=o.position[0],pz=o.position[2];
  return polyShape([[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([lx,lz])=>[px+lx*c+lz*s,pz-lx*s+lz*c]),name,o.id);
 }
 function obstacleShapes(objects,room){
  const shapes=[];
  for(const o of objects){
   if(!o||NON_OBSTACLE.has(o.type)||o.visible===false||o.hidden===true)continue;
   const name=o.name||TYPE_NAMES[o.type]||o.type,[sx,,sz]=o.size,px=o.position[0],pz=o.position[2];
   if(o.type==='table')shapes.push({kind:'circle',cx:px,cz:pz,r:sx/2,bbox:[px-sx/2,pz-sx/2,px+sx/2,pz+sx/2],name,id:o.id});
   else if(PERSON.has(o.type))shapes.push({kind:'circle',cx:px,cz:pz,r:R,bbox:[px-R,pz-R,px+R,pz+R],name,id:o.id});
   else if(o.type==='ldesk'){
    const a=o.lengthA||sx,b=o.lengthB||sz,wa=o.widthA||.6,wb=o.widthB||.55;
    shapes.push(localRect(o,-a/2,a/2,-b/2,-b/2+wa,name),localRect(o,-a/2,-a/2+wb,-b/2,b/2,name));
   }else shapes.push(localRect(o,-sx/2,sx/2,-sz/2,sz/2,name));
  }
  const w=room.width/2,d=room.depth/2;
  if(room.wallA!==false)shapes.push(polyShape([[-w-.12,-d],[-w,-d],[-w,d],[-w-.12,d]],'A 墙',null));
  if(room.wallB!==false)shapes.push(polyShape([[-w-.12,-d-.12],[w+.12,-d-.12],[w+.12,-d],[-w-.12,-d]],'B 墙',null));
  return shapes;
 }

 // ---- walkable region (union of rectangles) ----
 function walkRegion(room,venue){
  const w=room.width/2,n=room.depth/2,{bounds:b,aisleX,aisleZ}=venue;
  const rects=[{x0:-w,x1:w,z0:-n,z1:n},{x0:b.minX,x1:w+aisleX,z0:n,z1:n+aisleZ},{x0:w,x1:w+aisleX,z0:b.minZ,z1:b.maxZ}];
  return {rects,x0:Math.min(...rects.map(r=>r.x0)),x1:Math.max(...rects.map(r=>r.x1)),z0:Math.min(...rects.map(r=>r.z0)),z1:Math.max(...rects.map(r=>r.z1))};
 }
 const DISC=Array.from({length:16},(_,k)=>[Math.cos(k*Math.PI/8),Math.sin(k*Math.PI/8)]);

 function buildNav(objects,room,venue){
  const shapes=obstacleShapes(objects,room),region=walkRegion(room,venue),rects=region.rects;
  const inRegion=(x,z)=>{for(const r of rects)if(x>=r.x0-EPS&&x<=r.x1+EPS&&z>=r.z0-EPS&&z<=r.z1+EPS)return true;return false;};
  const discOK=(x,z,rad)=>{if(!inRegion(x,z))return false;for(const [c,s] of DISC)if(!inRegion(x+c*rad,z+s*rad))return false;return true;};
  const regionOK=(x,z)=>discOK(x,z,R);

  function blocker(x,z){ // the obstacle closest to a point (null when only the area edge is in the way)
   let best=null,bd=Infinity;
   for(const s of shapes){const d=shapeDistPt(s,x,z);if(d<bd){bd=d;best=s;}}
   return best&&bd<R-EPS?best.name:null;
  }
  function isWalkable(x,z){
   if(!regionOK(x,z))return false;
   for(const s of shapes){
    const bb=s.bbox;if(x<bb[0]-R||x>bb[2]+R||z<bb[1]-R||z>bb[3]+R)continue;
    if(shapeDistPt(s,x,z)<R-EPS)return false;
   }
   return true;
  }
  function segmentClear(a,b){
   const [ax,az]=a,[bx,bz]=b,len=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(len/SAMPLE));
   for(let k=0;k<=n;k++)if(!regionOK(ax+(bx-ax)*k/n,az+(bz-az)*k/n))return false;
   const x0=Math.min(ax,bx)-R,x1=Math.max(ax,bx)+R,z0=Math.min(az,bz)-R,z1=Math.max(az,bz)+R;
   for(const s of shapes){
    const bb=s.bbox;if(bb[2]<x0||bb[0]>x1||bb[3]<z0||bb[1]>z1)continue;
    if(shapeDistSeg(s,ax,az,bx,bz)<R-EPS)return false;
   }
   return true;
  }

  // ---- grid (0.1 m cells; centres sit on multiples of 0.1) ----
  const gx0=Math.floor(region.x0/CELL)-1,gz0=Math.floor(region.z0/CELL)-1;
  const nx=Math.ceil(region.x1/CELL)-gx0+2,nz=Math.ceil(region.z1/CELL)-gz0+2,N=nx*nz;
  const blocked=new Uint8Array(N).fill(1),near=new Uint8Array(N);
  const cx=i=>(gx0+i%nx)*CELL,cz=i=>(gz0+((i/nx)|0))*CELL;
  for(const r of rects){
   const i0=Math.max(0,Math.ceil(r.x0/CELL-1e-9)-gx0),i1=Math.min(nx-1,Math.floor(r.x1/CELL+1e-9)-gx0);
   const j0=Math.max(0,Math.ceil(r.z0/CELL-1e-9)-gz0),j1=Math.min(nz-1,Math.floor(r.z1/CELL+1e-9)-gz0);
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const idx=j*nx+i,x=(gx0+i)*CELL,z=(gz0+j)*CELL;
    if(!regionOK(x,z))continue;
    blocked[idx]=0;if(!discOK(x,z,R+NEAR))near[idx]=1;
   }
  }
  for(const s of shapes){
   const m=R+NEAR,bb=s.bbox;
   const i0=Math.max(0,Math.floor((bb[0]-m)/CELL)-gx0),i1=Math.min(nx-1,Math.ceil((bb[2]+m)/CELL)-gx0);
   const j0=Math.max(0,Math.floor((bb[1]-m)/CELL)-gz0),j1=Math.min(nz-1,Math.ceil((bb[3]+m)/CELL)-gz0);
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const idx=j*nx+i;if(blocked[idx])continue;
    const d=shapeDistPt(s,(gx0+i)*CELL,(gz0+j)*CELL);
    if(d<R-EPS)blocked[idx]=1;else if(d<R+NEAR)near[idx]=1;
   }
  }
  const cellOf=(x,z)=>{const i=Math.round(x/CELL)-gx0,j=Math.round(z/CELL)-gz0;return i<0||j<0||i>=nx||j>=nz?-1:j*nx+i;};

  // ---- A* over free cells: 8 directions, no corner cutting; moves next to obstacles/edges are re-checked exactly ----
  const g=new Float64Array(N),parent=new Int32Array(N),seen=new Uint32Array(N),closed=new Uint32Array(N),comp=new Uint32Array(N);let stamp=0,compId=0;
  const DX=[1,-1,0,0,1,1,-1,-1],DZ=[0,0,1,-1,1,-1,1,-1];
  function astar(si,ti){
   stamp++;const heapI=[],heapF=[];
   const push=(i,f)=>{let k=heapI.length;heapI.push(i);heapF.push(f);while(k>0){const p=(k-1)>>1;if(heapF[p]<=f)break;heapI[k]=heapI[p];heapF[k]=heapF[p];k=p;}heapI[k]=i;heapF[k]=f;};
   const pop=()=>{
    const top=heapI[0],li=heapI.pop(),lf=heapF.pop(),n=heapI.length;
    if(n){let k=0;for(;;){let c=2*k+1;if(c>=n)break;if(c+1<n&&heapF[c+1]<heapF[c])c++;if(heapF[c]>=lf)break;heapI[k]=heapI[c];heapF[k]=heapF[c];k=c;}heapI[k]=li;heapF[k]=lf;}
    return top;
   };
   const tx=ti%nx,tz=(ti/nx)|0,h=i=>{const dx=Math.abs(i%nx-tx),dz=Math.abs(((i/nx)|0)-tz);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
   g[si]=0;seen[si]=stamp;parent[si]=-1;push(si,h(si));
   while(heapI.length){
    const i=pop();if(closed[i]===stamp)continue;closed[i]=stamp;
    if(i===ti){const out=[];for(let k=ti;k!==-1;k=parent[k])out.push(k);return out.reverse();}
    const ix=i%nx,iz=(i/nx)|0;
    for(let d=0;d<8;d++){
     const jx=ix+DX[d],jz=iz+DZ[d];if(jx<0||jz<0||jx>=nx||jz>=nz)continue;
     const j=jz*nx+jx;if(blocked[j]||closed[j]===stamp)continue;
     if(d>3&&(blocked[iz*nx+jx]||blocked[jz*nx+ix]))continue;
     if((near[i]||near[j])&&!segmentClear([cx(i),cz(i)],[cx(j),cz(j)]))continue;
     const ng=g[i]+(d>3?Math.SQRT2:1);
     if(seen[j]!==stamp||ng<g[j]){seen[j]=stamp;g[j]=ng;parent[j]=i;push(j,ng+h(j));}
    }
   }
   // Failed: the search visited the whole connected area, so remember it. Later queries into a different area fail instantly.
   compId++;for(let k=0;k<N;k++)if(closed[k]===stamp)comp[k]=compId;
   return null;
  }
  function snap(p){ // nearest free cell that the exact point can reach in a straight line
   const ci=Math.round(p[0]/CELL)-gx0,cj=Math.round(p[1]/CELL)-gz0,cand=[];
   for(let dj=-2;dj<=2;dj++)for(let di=-2;di<=2;di++){
    const i=ci+di,j=cj+dj;if(i<0||j<0||i>=nx||j>=nz||blocked[j*nx+i])continue;
    cand.push([Math.hypot((gx0+i)*CELL-p[0],(gz0+j)*CELL-p[1]),j*nx+i]);
   }
   cand.sort((a,b)=>a[0]-b[0]);
   for(const [,idx] of cand)if(segmentClear(p,[cx(idx),cz(idx)]))return idx;
   return -1;
  }

  // Closest obstacle to the straight line a→b: used to say who is in the way.
  function blockerOnLine(a,b){
   let best=null,bd=Infinity;
   for(const s of shapes){const d=shapeDistSeg(s,a[0],a[1],b[0],b[1]);if(d<bd){bd=d;best=s;}}
   return best?best.name:null;
  }
  function planSegment(a,b){
   if(a[0]===b[0]&&a[1]===b[1])return {ok:true,points:[[a[0],a[1]]]};
   if(segmentClear(a,b))return {ok:true,points:[[a[0],a[1]],[b[0],b[1]]]};
   const si=snap(a),ti=snap(b),fail=()=>({ok:false,reason:'unreachable',blockedBy:blockerOnLine(a,b),points:[[a[0],a[1]],[b[0],b[1]]]});
   if(si<0||ti<0)return fail();
   if(comp[si]&&comp[ti]&&comp[si]!==comp[ti])return fail();
   const flip=comp[si]!==0&&comp[ti]===0;            // start from the not-yet-explored side (usually the small pocket)
   let cells=flip?astar(ti,si):astar(si,ti);if(!cells)return fail();
   if(flip)cells=cells.reverse();
   const nodes=[[a[0],a[1]]];
   for(const c of cells){const p=[cx(c),cz(c)];if(Math.hypot(p[0]-a[0],p[1]-a[1])>1e-9&&Math.hypot(p[0]-b[0],p[1]-b[1])>1e-9)nodes.push(p);}
   nodes.push([b[0],b[1]]);
   const out=[nodes[0]];let i=0;
   while(i<nodes.length-1){
    let j=nodes.length-1;
    while(j>i+1&&!segmentClear(nodes[i],nodes[j]))j--;
    out.push(nodes[j]);i=j;
   }
   return {ok:true,points:out};
  }
  return {shapes,region,isWalkable,segmentClear,planSegment,blocker,blockerOnLine,cellOf};
 }

 // entry → stands… → exit. segments[k] joins node k to node k+1 (nodes = [entry, ...stands, exit]).
 function planRoute(nav,entry,stands,exit){
  const nodes=[entry,...stands,exit],last=nodes.length-1;
  const walk=nodes.map(p=>nav.isWalkable(p[0],p[1]));
  const standIssues=[];
  stands.forEach((p,k)=>{if(!walk[k+1])standIssues.push({index:k,blockedBy:nav.blocker(p[0],p[1])});});
  const segments=[];
  for(let k=0;k<last;k++){
   const a=nodes[k],b=nodes[k+1];
   const why=!walk[k]?(k===0?'entry-blocked':'stand-blocked'):!walk[k+1]?(k+1===last?'exit-blocked':'stand-blocked'):null;
   if(why){
    const who=!walk[k]?a:b;
    segments.push({ok:false,reason:why,blockedBy:nav.blocker(who[0],who[1]),points:[[a[0],a[1]],[b[0],b[1]]]});
   }else segments.push(nav.planSegment(a,b));
  }
  return {ok:segments.every(s=>s.ok),entryOk:walk[0],exitOk:walk[last],standIssues,segments};
 }
 return {RADIUS:R,CELL,obstacleShapes,walkRegion,buildNav,planRoute};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TourPath;
