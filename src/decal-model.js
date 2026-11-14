// Figma 贴图的数据规则：纯函数，不碰 DOM / THREE / 存储。浏览器里是全局 DecalModel，node 里 require。
// 面的位置都在「物体组」的本地坐标里：前台、易拉宝、立牌的组按 size 缩放，所以它们的 pos 是单位方块里的比例；墙则在墙体自身坐标里（米）。
const DecalModel=(()=>{
 const FACE_NAMES={front:'正面',back:'背面',left:'左侧',right:'右侧',top:'台面',endA:'横边端头',endB:'纵边端头',screen:'屏幕',A:'A 墙内侧',B:'B 墙内侧'};
 const WALL_H=2.8,GAP=.003; // 贴图离面 3 毫米，避免和面打架
 const FITS=['contain','cover'];
 const MIMES=['image/png','image/jpeg'];
 const ID=/^[0-9a-f]{64}$/;
 const SIDES=['front','back','left','right'];
 // p 是物体自身数据（吊楣形状、L 台各边、屏幕英寸），只有少数物件用得到。
 function facesFor(type,p={}){
  if(type==='desk')return [...SIDES,'top'];
  if(type==='ldesk')return [...SIDES,'endA','endB'];
  if(type==='fascia')return p.shape==='round'?[]:SIDES; // 圆形吊楣是曲面，不做
  if(type==='table')return ['top'];
  if(type==='tv'||type==='display'||type==='laptop')return ['screen'];
  if(type==='rollup'||type==='acrylic'||type==='acrylicA4'||type==='acrylicA5')return ['front'];
  return [];
 }
 const flat=(size,pos,rot)=>({size,pos,rot,scale:size}); // 物体组不缩放时：位置按米，平面直接放大到面尺寸
 const screenSize=(inches,portrait)=>{const w=inches*.0254*16/Math.sqrt(337),h=w*9/16;return portrait?[h,w]:[w,h];};
 // 物体面：size 是物体整体尺寸 [宽,高,深]（米）。返回 {size:[面宽,面高]（米）,pos,rot,scale,round?}，plane 是 1×1（round 时是直径 1 的圆）。
 function faceSpec(type,size,face,p={}){
  if(!facesFor(type,p).includes(face))return null;
  const [w,h,d]=size,e=a=>GAP/a,H=Math.PI/2;
  if(type==='ldesk'){const {lengthA:a,widthA:wa,lengthB:b,widthB:wb}=p,y=h/2;return {
   back:flat([a,h],[0,y,-b/2-GAP],[0,Math.PI,0]),left:flat([b,h],[-a/2-GAP,y,0],[0,-H,0]),
   front:flat([a-wb,h],[wb/2,y,-b/2+wa+GAP],[0,0,0]),right:flat([b-wa,h],[-a/2+wb+GAP,y,wa/2],[0,H,0]),
   endA:flat([wa,h],[a/2+GAP,y,-b/2+wa/2],[0,H,0]),endB:flat([wb,h],[-a/2+wb/2,y,b/2+GAP],[0,0,0])}[face];}
  if(type==='fascia'){const r=w/2+GAP,y=h/2;return {front:flat([w,h],[0,y,r],[0,0,0]),back:flat([w,h],[0,y,-r],[0,Math.PI,0]),left:flat([w,h],[-r,y,0],[0,-H,0]),right:flat([w,h],[r,y,0],[0,H,0])}[face];}
  if(type==='table')return {size:[w,d],pos:[0,1+e(h),0],rot:[-H,0,0],scale:[1,1],round:true};
  if(type==='laptop')return {size:[.91*w,.82*h],pos:[0,.53,-.447+e(d)],rot:[0,0,0],scale:[.91,.82]};
  if(type==='tv')return flat([w-.036,h-.036],[0,h/2,d/2+.005+GAP],[0,0,0]);
  if(type==='display'){const s=screenSize(p.inches||27,!!p.portrait);return flat(s,[0,1.22,.03+GAP],[0,0,0]);}
  if(type==='desk')return {scale:[1,1],...{
   front:{size:[w,h],pos:[0,.5,.5+e(d)],rot:[0,0,0]},
   back:{size:[w,h],pos:[0,.5,-.5-e(d)],rot:[0,Math.PI,0]},
   left:{size:[d,h],pos:[-.5-e(w),.5,0],rot:[0,-Math.PI/2,0]},
   right:{size:[d,h],pos:[.5+e(w),.5,0],rot:[0,Math.PI/2,0]},
   top:{size:[w,d],pos:[0,1+e(h),0],rot:[-Math.PI/2,0,0]}}[face]};
  if(type==='rollup'&&face==='front')return {size:[.9524*w,.9615*h],pos:[0,.51925,.016+e(d)],rot:[0,0,0],scale:[.9524,.9615]};
  if(type.startsWith('acrylic')){const ph=Math.min(.94,.86*w*Math.SQRT2/h);return {size:[.86*w,ph*h],pos:[0,.5275,.052+e(d)],rot:[0,0,0],scale:[.86,ph]};}
  return null;
 }
 // 墙内侧：坐标在墙体自身（墙厚 .12，中心在墙中间）。A 墙长 = 场地深，B 墙长 = 场地宽。
 function wallSpec(room,wall){
  const size=wall==='A'?[room.depth,WALL_H]:[room.width,WALL_H];
  return wall==='A'?{size,pos:[.06+GAP,0,0],rot:[0,Math.PI/2,0],scale:size}:{size,pos:[0,0,.06+GAP],rot:[0,0,0],scale:size};
 }
 const fmt=n=>String(Math.round(n*100)/100);
 const sizeText=size=>fmt(size[0])+' × '+fmt(size[1])+' 米';
 const defaults=()=>({fit:'contain',scale:1,ox:0,oy:0,rot:0});
 const num=(v,min,max,dflt)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):dflt;
 function cleanSource(s){
  if(s&&s.kind==='figma'&&typeof s.url==='string'&&s.url.length<=2000&&typeof s.fileKey==='string'&&/^[A-Za-z0-9]{1,64}$/.test(s.fileKey)&&typeof s.nodeId==='string'&&/^[0-9A-Za-z:;_-]{1,64}$/.test(s.nodeId))return {kind:'figma',url:s.url,fileKey:s.fileKey,nodeId:s.nodeId};
  return {kind:'file'};
 }
 function cleanDecal(d){
  if(!d||typeof d.assetId!=='string'||!ID.test(d.assetId))return null;
  return {source:cleanSource(d.source),assetId:d.assetId,fit:FITS.includes(d.fit)?d.fit:'contain',scale:num(d.scale,.3,2,1),ox:num(d.ox,-.5,.5,0),oy:num(d.oy,-.5,.5,0),rot:[0,90,180,270].includes(d.rot)?d.rot:0};
 }
 // 读方案文件里的贴图字段：只认 allowed 里的面；坏的单张贴图丢掉，不连累整份方案。没有可贴面时返回 {}（不写空字段）。
 function cleanDecals(raw,allowed){
  if(!raw||!Array.isArray(raw.decalFaces))return {};
  const faces=allowed.filter(f=>raw.decalFaces.includes(f));if(!faces.length)return {};
  const decals={};const src=raw.decals&&typeof raw.decals==='object'?raw.decals:{};
  for(const f of faces){const d=cleanDecal(src[f]);if(d)decals[f]=d;}
  return Object.keys(decals).length?{decalFaces:faces,decals}:{decalFaces:faces};
 }
 // 图片在画布里怎么摆：画布 cw×ch 像素，图片 iw×ih。返回中心点、旋转角（弧度）和图片绘制宽高（旋转前）。
 function placeImage(cw,ch,iw,ih,d){
  const turned=d.rot%180!==0,bw=turned?ih:iw,bh=turned?iw:ih;
  const s=(d.fit==='cover'?Math.max(cw/bw,ch/bh):Math.min(cw/bw,ch/bh))*d.scale;
  return {cx:cw/2+d.ox*cw,cy:ch/2-d.oy*ch,angle:d.rot*Math.PI/180,w:iw*s,h:ih*s};
 }
 // Figma 画框链接 → {fileKey,nodeId}；node-id 在链接里写成 1-3，接口要 1:3。
 function parseFigmaUrl(text){
  let u;try{u=new URL(String(text).trim());}catch(e){return null;}
  if(!/(^|\.)figma\.com$/.test(u.hostname))return null;
  const m=u.pathname.match(/^\/(?:design|file|proto|board)\/([A-Za-z0-9]+)/);if(!m)return null;
  const raw=u.searchParams.get('node-id');if(!raw)return null;
  const nodeId=raw.replace(/-/g,':');if(!/^[0-9A-Za-z:;_]+$/.test(nodeId))return null;
  return {fileKey:m[1],nodeId};
 }
 function ownersOf(layout){return [layout.room||{},...(layout.objects||[])];}
 function usedAssetIds(plans){const ids=new Set();for(const p of plans)for(const o of ownersOf(p.layout||{}))for(const d of Object.values(o.decals||{}))if(d&&d.assetId)ids.add(d.assetId);return [...ids];}
 // 导出文件里的 assets：{id:{mime,width,height,base64}}。有一项不对就整体拒绝（导入失败不污染现有方案）。
 function validateAssets(raw){
  if(raw===undefined)return {};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>500)throw Error('贴图图片数据无效');
  const out={};
  for(const [id,a] of Object.entries(raw)){
   if(!ID.test(id)||!a||!MIMES.includes(a.mime)||![a.width,a.height].every(n=>Number.isInteger(n)&&n>=1&&n<=4096)||typeof a.base64!=='string'||!a.base64.length||a.base64.length>3e7||!/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64))throw Error('贴图图片数据无效');
   out[id]={mime:a.mime,width:a.width,height:a.height,base64:a.base64};
  }
  return out;
 }
 return {FACE_NAMES,WALL_H,facesFor,faceSpec,wallSpec,sizeText,defaults,cleanDecal,cleanDecals,placeImage,parseFigmaUrl,usedAssetIds,validateAssets};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=DecalModel;
