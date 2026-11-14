// Figma 贴图数据规则（node，无浏览器）。Run: node src/test-decal-model.cjs
const assert=require('node:assert/strict');
const M=require('./decal-model.js');
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
const nearArr=(a,b,t=1e-6)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>near(v,b[i],t));};
const ID='a'.repeat(64),ID2='b'.repeat(64);
// 单轴旋转后的平面法线（plane 默认朝 +Z）；够用：faceSpec 只用单轴旋转
function normalOf(rot){let [x,y,z]=[0,0,1];const [rx,ry]=rot;
 if(rx){const c=Math.cos(rx),s=Math.sin(rx);[y,z]=[y*c-z*s,y*s+z*c];}
 if(ry){const c=Math.cos(ry),s=Math.sin(ry);[x,z]=[x*c+z*s,-x*s+z*c];}
 return [x,y,z].map(v=>Math.round(v*1e6)/1e6+0);}

test('哪些物件能贴：前台 5 面，易拉宝 / 立牌只有正面，其他没有',()=>{
 assert.deepEqual(M.facesFor('desk'),['front','back','left','right','top']);
 for(const t of ['rollup','acrylic','acrylicA4','acrylicA5'])assert.deepEqual(M.facesFor(t),['front']);
 for(const t of ['tv','display','table','ldesk','fascia','laptop','chair','staff','robot'])assert.deepEqual(M.facesFor(t),[]);
});
test('前台各面实际尺寸（米）：正背 宽×高，左右 深×高，台面 宽×深',()=>{
 const s=[1.6,1,.65];
 for(const [f,want] of [['front',[1.6,1]],['back',[1.6,1]],['left',[.65,1]],['right',[.65,1]],['top',[1.6,.65]]])nearArr(M.faceSpec('desk',s,f).size,want);
 assert.equal(M.sizeText(M.faceSpec('desk',[2.7,1,.6],'front').size),'2.7 × 1 米');
});
test('前台各面朝外：正面 +Z、背面 −Z、左 −X、右 +X、台面 +Y',()=>{
 for(const [f,n] of [['front',[0,0,1]],['back',[0,0,-1]],['left',[-1,0,0]],['right',[1,0,0]],['top',[0,1,0]]])assert.deepEqual(normalOf(M.faceSpec('desk',[1.6,1,.65],f).rot),n,f);
});
test('前台贴图离面约 3 毫米（在单位方块里按尺寸折算）',()=>{
 const sp=M.faceSpec('desk',[1.6,1,.5],'front');near((sp.pos[2]-.5)*.5,.003);
 near((M.faceSpec('desk',[2,1,.5],'right').pos[0]-.5)*2,.003);
});
test('易拉宝画面 80×200cm（整体 84×208）；A4 立牌插纸保持 A 纸比例',()=>{
 nearArr(M.faceSpec('rollup',[.84,2.08,.35],'front').size,[.8,2],.002);
 const a4=M.faceSpec('acrylicA4',[.21,.297,.07],'front').size;near(a4[1]/a4[0],Math.SQRT2,.001);
 assert.deepEqual(normalOf(M.faceSpec('rollup',[.84,2.08,.35],'front').rot),[0,0,1]);
 assert.equal(M.faceSpec('rollup',[.84,2.08,.35],'back'),null);
});
test('墙内侧：A 墙长=场地深、朝 +X；B 墙长=场地宽、朝 +Z；高 2.8',()=>{
 const room={width:6.1,depth:5.5};
 const a=M.wallSpec(room,'A'),b=M.wallSpec(room,'B');
 nearArr(a.size,[5.5,2.8]);nearArr(b.size,[6.1,2.8]);
 assert.deepEqual(normalOf(a.rot),[1,0,0]);assert.deepEqual(normalOf(b.rot),[0,0,1]);
 near(a.pos[0],.063);near(b.pos[2],.063);
 nearArr(M.wallSpec({width:5.5,depth:6.1},'A').size,[6.1,2.8]);
});
test('读方案：只留允许的面、坏贴图丢掉、数值夹到范围内',()=>{
 const out=M.cleanDecals({decalFaces:['top','front','bogus','front'],decals:{front:{assetId:ID,fit:'cover',scale:9,ox:-3,oy:.2,rot:90,source:{kind:'figma',url:'https://www.figma.com/design/K/x?node-id=1-3',fileKey:'K',nodeId:'1:3'}},top:{assetId:'not-a-hash'},back:{assetId:ID}}},M.facesFor('desk'));
 assert.deepEqual(out.decalFaces,['front','top']);
 assert.deepEqual(out.decals,{front:{source:{kind:'figma',url:'https://www.figma.com/design/K/x?node-id=1-3',fileKey:'K',nodeId:'1:3'},assetId:ID,fit:'cover',scale:2,ox:-.5,oy:.2,rot:90}});
});
test('读方案：没有可贴面就不写字段；有面没图只留 decalFaces；来源不认识当作上传',()=>{
 assert.deepEqual(M.cleanDecals({},['front']),{});
 assert.deepEqual(M.cleanDecals({decalFaces:['top']},['front']),{});
 assert.deepEqual(M.cleanDecals({decalFaces:['front']},['front']),{decalFaces:['front']});
 assert.deepEqual(M.cleanDecals({decalFaces:['A'],decals:{A:{assetId:ID,source:{kind:'http',url:'x'}}}},['A','B']).decals.A.source,{kind:'file'});
 assert.equal(M.cleanDecals({decalFaces:['A'],decals:{A:{assetId:ID,rot:45}}},['A']).decals.A.rot,0);
});
test('图片摆法：完整显示按短边放下、铺满按长边盖住，旋转 90° 交换宽高',()=>{
 let p=M.placeImage(2000,1000,1000,1000,M.defaults());near(p.w,1000);near(p.h,1000);near(p.cx,1000);near(p.cy,500);
 p=M.placeImage(2000,1000,1000,1000,{...M.defaults(),fit:'cover'});near(p.w,2000);
 p=M.placeImage(2000,1000,400,1000,{...M.defaults(),rot:90});near(p.w,800);near(p.h,2000);near(p.angle,Math.PI/2);
 p=M.placeImage(2000,1000,1000,1000,{...M.defaults(),scale:.5,ox:.25,oy:.1});near(p.w,500);near(p.cx,1500);near(p.cy,400);
});
test('Figma 链接：design/file/proto 都认，node-id 1-3 → 1:3；缺画框或不是 Figma 返回空',()=>{
 assert.deepEqual(M.parseFigmaUrl('https://www.figma.com/design/hkThqgj7sjrkV0aBRmHYEm/CES?node-id=2-12&t=abc'),{fileKey:'hkThqgj7sjrkV0aBRmHYEm',nodeId:'2:12'});
 assert.deepEqual(M.parseFigmaUrl(' https://figma.com/file/AbC/x?node-id=1%3A3 '),{fileKey:'AbC',nodeId:'1:3'});
 assert.equal(M.parseFigmaUrl('https://www.figma.com/design/AbC/x'),null);
 assert.equal(M.parseFigmaUrl('https://evil.com/design/AbC/x?node-id=1-3'),null);
 assert.equal(M.parseFigmaUrl('figma 画框'),null);
});
test('导出范围用到的图：墙和物体都算、去重',()=>{
 const plans=[{layout:{room:{decals:{A:{assetId:ID}}},objects:[{decals:{front:{assetId:ID2},top:{assetId:ID}}},{type:'tv'}]}},{layout:{room:{},objects:[]}}];
 assert.deepEqual(M.usedAssetIds(plans).sort(),[ID,ID2]);
});
test('导入图片数据：格式对才收；任何一项坏了整体拒绝；没有就是空',()=>{
 assert.deepEqual(M.validateAssets(undefined),{});
 const ok={[ID]:{mime:'image/png',width:2,height:3,base64:'iVBORw0KGgo=',extra:1}};
 assert.deepEqual(M.validateAssets(ok),{[ID]:{mime:'image/png',width:2,height:3,base64:'iVBORw0KGgo='}});
 for(const bad of [[],{x:ok[ID]},{[ID]:{...ok[ID],mime:'text/html'}},{[ID]:{...ok[ID],width:0}},{[ID]:{...ok[ID],base64:'<script>'}}])assert.throws(()=>M.validateAssets(bad),/贴图图片数据无效/);
});

let failed=0;for(const [name,fn] of tests){try{fn();console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,'\n ',e.message);}}
console.log(`${tests.length-failed}/${tests.length} passed`);if(failed)process.exitCode=1;
