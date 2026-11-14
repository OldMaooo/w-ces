# 让 Agent 批量写游客路线

Agent 不用算坐标、不用编 ID：写一份「路线草稿」，用物品编号或名字点停留点，脚本负责算站位、建兴趣点、用编辑器同一套规则校验寻路，然后**另存**成新方案文件。人在界面里「导入」这个文件继续改。

## 三步

```bash
node src/tour-agent.cjs list doc/Files/CES-02.json            # 1. 看能停哪些物品、来向、可走区域
node src/tour-agent.cjs apply doc/Files/CES-02.json 草稿.json -o 新文件.json   # 2. 套用草稿
```
3. 编辑器顶栏导入 `新文件.json`（追加为新标签，不覆盖原方案）→「路线」里查看、拖站位、改顺序。

- `--plan 名称或id`：文件里有多个方案时指定哪个（默认当前活动方案）。草稿里也可写 `"plan"`。
- `-o` 不能等于原文件，脚本拒绝覆盖。
- 有走不通的段时不写出、退出码 1，报告里写清「A → B 走不通，被『前台』挡住」。确实想先写出再到界面修，加 `--allow-issues`。

## list 输出要看的字段
- `objects[]`：`id`、`name`（有「用途」就是用途，否则「类型 + 编号」）、`usable`（隐藏物品、吊楣为 false，不能停）、`stand`（脚本会让游客站在哪，世界坐标 [x,z] 米）、`standOk`。
- `approaches[]`：四个来向 `north-ew / north-we / west-sn / west-ns` 和默认入口出口。
- `walkArea`：能走的三块矩形（展台本身、北过道、西过道）。
- 方向：北 = +Z，西 = +X（东 = −X），单位米，原点在展台中心。

## 草稿格式

```json
{
  "plan": "02",
  "replace": true,
  "pois": [ {"object": 5, "name": "平行宇宙", "dwell": 20, "side": "front"} ],
  "routes": [
    {"group": "北过道来", "approach": "north-ew", "name": "快速看亮点",
     "stops": [5, "虚拟大脑", {"name": "平行宇宙", "dwell": 10}, {"pos": [1.5, 1.0]}]}
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `routes[]` | 是 | 每项是一条子方案（一个游客的走法） |
| `routes[].stops` | 是 | 按顺序的停留点。数字 = 物品编号；文字 = 兴趣点名或物品名；`{"object":编号 或 "name":名字, "dwell":秒}` 可单独改这一站停留；`{"pos":[x,z]}` = 路径点（只为了引导绕路） |
| `routes[].approach` | 否 | 来向，默认 `north-ew`，决定入口出口 |
| `routes[].group` | 否 | 大方案名；同名的子方案归到同一个大方案（共用入口出口）。不写 = 自己一组 |
| `routes[].name` / `speed` / `eyeHeight` / `entry` / `exit` | 否 | 名字；走速倍数（默认 1，即 1.2 米/秒）；眼高（默认 1.75）；手动覆盖入口出口 [x,z] |
| `pois[]` | 否 | 预先定兴趣点：`object` 必填；`name`、`dwell`（默认停留秒，默认 5）、`side`（front/left/right/back）、`standAt`（站位世界坐标 [x,z]） |
| `replace` | 否 | true = 清掉该方案原有路线再写；默认追加（同一物品复用已有兴趣点） |

不需要写：兴趣点编号 ①②③、各种 id、物品自身坐标里的站位（脚本换算）、路线折线和总时长（编辑器随时现算，不存文件）。

## 写出的文件
和编辑器导出的一样（`format: ces-booth-plans`，版本 2），路线放在该方案的 `layout.tour`，结构说明见 `src/tour-model.js` 的 `validateTour`。脚本写出前已用同一个校验函数检查过，界面能直接打开。

## 例子
`doc/Files/CES-02-路线草稿.json` → `doc/Files/CES-02-导览路线.json`：在 CES-02 布局上生成的 5 条路线（快速看亮点、深度体验、VIP 接待、西过道路过引流、拍照打卡）。

测试：`node src/test-tour-agent.cjs`。
