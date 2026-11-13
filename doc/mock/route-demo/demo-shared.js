// 假数据 + 小工具：主 demo 和全景页共用。只为演示，不是正式实现。
const P = d => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
const ICON = {
  play: P('<polygon points="6 3 20 12 6 21 6 3"/>'),
  pause: P('<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'),
  plus: P('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  copy: P('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  trash: P('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'),
  pencil: P('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>'),
  undo: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: P('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  pointer: P('<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>'),
  route: P('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
  fit: P('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  box: P('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'),
  map: P('<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>'),
  x: P('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  eye: P('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'),
  target: P('<circle cx="12" cy="12" r="10"/><path d="M22 12h-4"/><path d="M6 12H2"/><path d="M12 6V2"/><path d="M12 22v-4"/>'),
  reset: P('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
  back: P('<polygon points="19 20 9 12 19 4 19 20"/><path d="M5 19V5"/>'),
  chev: P('<path d="m6 9 6 6 6-6"/>'),
  alert: P('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
};

// 展台 6.1 × 5.5 m（取自你本机当前方案）。北 +Z、东 -X、西 +X。A 墙在东(-X)，B 墙在南(-Z)。
const ROOM = { w: 6.1, d: 5.5 };
const AISLE_N = 3.66, AISLE_W = 6.1; // 北过道 12ft，西过道 20ft
// 前三件是你方案里真有的；后三件是演示补的假物料
const OBJECTS0 = [
  { id: 1, name: '电视', x: .4, z: -2.61, w: 1.218, d: .09, h: .685, y: 1.2, shape: 'rect' },
  { id: 2, name: '前台', x: -.8, z: 1.75, w: 1.6, d: .65, h: 1, y: 0, shape: 'rect' },
  { id: 3, name: '机器人', x: 1.4, z: .3, w: .65, d: .5, h: 1.5, y: 0, shape: 'rect' },
  { id: 4, name: 'L 型台', x: -2.1, z: -1.3, shape: 'L', h: 1, y: 0,
    parts: [{ x: 0, z: -.5, w: 1.6, d: .6 }, { x: -.5, z: .3, w: .6, d: 1.0 }] },
  { id: 5, name: '小圆桌', x: 2.0, z: -1.7, r: .325, h: .75, y: 0, shape: 'circle' },
  { id: 6, name: '易拉宝', x: 2.6, z: 2.45, w: .84, d: .35, h: 2.08, y: 0, shape: 'rect' },
];
const WALLS = [
  { name: 'A 墙', x: -ROOM.w / 2 - .06, z: 0, w: .12, d: ROOM.d },
  { name: 'B 墙', x: 0, z: -ROOM.d / 2 - .06, w: ROOM.w + .12, d: .12 },
];
const APPROACH = { 'north-e2w': '北过道 · 东→西', 'north-w2e': '北过道 · 西→东', 'west-s2n': '西过道 · 南→北', 'west-n2s': '西过道 · 北→南', other: '其他' };
const AZ = ROOM.d / 2 + AISLE_N / 2; // 北过道中线
const pt = (x, z, dwell = 0, lookAt = null) => ({ x, z, dwell, lookAt });
const GROUPS0 = [
  { id: 'g1', name: '北过道 · 东→西', approach: 'north-e2w', open: true, routes: [
    { id: 'r1', name: '只路过，瞄一眼电视', speed: 1, eye: 1.75,
      points: [pt(-7, AZ), pt(.4, AZ, 3, 1), pt(9, AZ)] },
    { id: 'r2', name: '看电视 → 前台洽谈', speed: 1, eye: 1.75,
      points: [pt(-7, AZ), pt(-1, AZ), pt(.6, 3.0), pt(.6, -1.5, 8, 1), pt(-.8, .9, 10, 2), pt(.5, 1.0), pt(.9, 3.0), pt(4.5, AZ), pt(9, AZ)] },
    { id: 'r3', name: '机器人体验 → 圆桌', speed: 1, eye: 1.75,
      points: [pt(-7, AZ), pt(-.8, 4.0), pt(-.8, 2.6), pt(1.4, -.4, 15, 3), pt(1.2, -1.6, 6, 5), pt(2.8, .8), pt(4.5, 3.2), pt(9, AZ)] },
  ] },
  { id: 'g2', name: '西过道 · 南→北', approach: 'west-s2n', open: true, routes: [] },
];
const clone = v => JSON.parse(JSON.stringify(v));

// —— 穿模检查（演示用简化版：沿线每 5cm 取点，人按 0.25m 半径算）——
const BODY_R = .25;
function footprints(objects) {
  const out = [];
  for (const o of objects) {
    if (o.shape === 'circle') out.push({ name: o.name, c: true, x: o.x, z: o.z, r: o.r });
    else if (o.shape === 'L') o.parts.forEach(p => out.push({ name: o.name, x: o.x + p.x, z: o.z + p.z, w: p.w, d: p.d }));
    else out.push({ name: o.name, x: o.x, z: o.z, w: o.w, d: o.d });
  }
  WALLS.forEach(w => out.push(w));
  return out;
}
function hitAt(x, z, fps) {
  for (const f of fps) {
    if (f.c ? Math.hypot(x - f.x, z - f.z) < f.r + BODY_R
      : Math.abs(x - f.x) < f.w / 2 + BODY_R && Math.abs(z - f.z) < f.d / 2 + BODY_R) return f.name;
  }
  return null;
}
function checkRoute(route, objects) {
  const fps = footprints(objects), bad = [];
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i], b = route.points[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / .05));
    for (let k = 1; k < n; k++) { const h = hitAt(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, fps); if (h) { bad.push({ i, name: h }); break; } }
  }
  return bad;
}

// —— 时间轴：走 / 转身 / 停留 —— 纯函数，往回拖到同一时刻结果一样
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function targetPos(lookAt, objects) {
  if (!lookAt) return null;
  const o = objects.find(o => o.id === lookAt); if (!o) return null;
  return { x: o.x, y: o.y + o.h * .6, z: o.z, name: o.name };
}
function compileRoute(route, objects) {
  const segs = [], ps = route.points; let t = 0;
  if (ps.length < 2) return { segs, total: 0, ticks: [] };
  let yaw = yawOf(ps[1].x - ps[0].x, ps[1].z - ps[0].z); const ticks = []; let stop = 0;
  const push = s => { s.t0 = t; t += s.dur; s.t1 = t; segs.push(s); };
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p.dwell > 0) {
      stop++;
      const tg = targetPos(p.lookAt, objects); const toYaw = tg ? yawOf(tg.x - p.x, tg.z - p.z) : yaw;
      ticks.push({ t, stop, i });
      push({ kind: 'dwell', i, stop, x: p.x, z: p.z, fromYaw: yaw, toYaw, tg, dur: p.dwell }); yaw = toYaw;
    }
    if (i === ps.length - 1) break;
    const q = ps[i + 1], ny = yawOf(q.x - p.x, q.z - p.z), turn = Math.abs(angDiff(yaw, ny));
    if (turn > .05) push({ kind: 'turn', i, x: p.x, z: p.z, fromYaw: yaw, toYaw: ny, dur: .4 * turn / (Math.PI / 2) });
    yaw = ny;
    const L = Math.hypot(q.x - p.x, q.z - p.z);
    if (L > 0) push({ kind: 'walk', i, a: p, b: q, yaw: ny, dur: L / route.speed });
  }
  return { segs, total: t, ticks };
}
function sampleRoute(c, t) {
  if (!c.segs.length) return null;
  t = Math.max(0, Math.min(c.total, t));
  const s = c.segs.find(s => t <= s.t1) || c.segs[c.segs.length - 1];
  const u = s.dur ? (t - s.t0) / s.dur : 1;
  if (s.kind === 'walk') return { x: s.a.x + (s.b.x - s.a.x) * u, z: s.a.z + (s.b.z - s.a.z) * u, yaw: s.yaw, pitch: 0, phase: 'walk', seg: s };
  if (s.kind === 'turn') return { x: s.x, z: s.z, yaw: s.fromYaw + angDiff(s.fromYaw, s.toYaw) * u, pitch: 0, phase: 'turn', seg: s };
  const blend = Math.min(1, (t - s.t0) / Math.min(.6, s.dur / 2));
  return { x: s.x, z: s.z, yaw: s.fromYaw + angDiff(s.fromYaw, s.toYaw) * blend, pitch: 0, phase: 'dwell', seg: s, left: s.t1 - t };
}
const routeLength = r => r.points.reduce((s, p, i) => i ? s + Math.hypot(p.x - r.points[i - 1].x, p.z - r.points[i - 1].z) : 0, 0);
const fmt = s => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
