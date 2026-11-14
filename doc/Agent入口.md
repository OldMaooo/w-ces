# Agent 入口：一份草稿，把物品、物料和游客路线导进场景

给 AI Agent（和帮它的人）看。Agent 不用开浏览器、不用算 3D 坐标：读方案文件 → 写一份「展台草稿」→ 脚本检查并**另存**成新方案文件 → 人在编辑器顶栏「导入」，作为新标签打开，不覆盖原方案。

```bash
node src/booth-agent.cjs list  doc/Files/CES-02.json                      # 1. 看有什么、能放什么
node src/booth-agent.cjs apply doc/Files/CES-02.json 草稿.json -o 新文件.json   # 2. 套用草稿
```
3. 编辑器顶栏「导入」选 `新文件.json`。

`--plan 名称或id` 指定方案（默认当前活动方案；草稿里也可写 `"plan"`）。`-o` 不能等于原文件。只需要 Node，不用装别的。只做路线时也可以用老入口 `src/tour-agent.cjs`，规则相同（见 `路线草稿-Agent格式.md`）。

## list 输出
- `axes`：坐标约定。原点在展台中心，**x 向西为正（东 = −x），z 向北为正**，单位米；角度用度，0 = 正面朝北。
- `catalog[]`：16 种物品的 `type`、中文名、默认尺寸 `[宽,高,深]`、默认离地高度 `y`、该类型额外能写的字段 `extra`。
- `objects[]`：现有物品的编号、名字、位置、尺寸、角度、是否可见，以及能不能当路线停留点；`faces[]`：这个物品**能贴物料的面**，每个面有 `face`（面名）、`name`（中文）、`size`（米）、`pixels`（按 1 米 = 1000 像素算的画框大小）、`decal`（已贴的物料：`assetId`、`fit`、`scale`、`ox`、`oy`、`rot`、`image` 图片宽高；没贴是 `null`）。不支持贴图的物品 `faces` 是空数组。
- `walls[]`：A 墙、B 墙内侧的 `size`、`pixels` 和 `decal`。
- `decalNote`：一句话提醒（1 米 = 1000 像素、只收 PNG/JPG）。
- `approaches` / `walkArea` / `existingRoutes`：路线用的来向、可走区域、已有路线。

## 草稿格式

```json
{
  "plan": "02",
  "room": {"width": 8, "depth": 6},
  "objects": [
    {"type": "desk", "at": [1, 2], "rotate": 90},
    {"type": "tv", "at": [0.3, -2.7], "inches": 55, "purpose": "新品轮播"},
    {"id": 12, "at": [0.9, -2.3], "visible": true}
  ],
  "remove": [15],
  "decals": [
    {"object": 12, "face": "front", "image": "物料示例/前台正面.png"},
    {"wall": "A", "image": "物料示例/A墙.png", "fit": "cover"}
  ],
  "routes": [{"name": "看新品", "stops": ["新品轮播", 5]}]
}
```

| 字段 | 说明 |
|---|---|
| `room` | 改场地 `width` / `depth`，1–30 米 |
| `objects[]` 没写 `id` | 新增。必填 `type`；`at:[x,z]`、`y`（离地）、`rotate`（度）、`size:[宽,高,深]` 都可选，不写用默认。编号自动接着最大号往后排 |
| `objects[]` 写了 `id` | 修改这个物品，只改你写的字段；类型不能改（删掉重加） |
| 各类型额外字段 | 电视 / 闺蜜机：`inches`、`portrait`、`purpose`（用途名）；L 型台：`lengthA/widthA/lengthB/widthB`；吊楣：`shape`（square/round）；工作人员 / 游客：`personScale`、`animation`、`clothesColor`。通用：`visible`、`wallSnap`、`wall`（A/B） |
| `remove[]` | 删物品编号。已是游客路线停留点的不让删（改成 `visible:false`，或先清路线） |
| `replaceObjects` | `true` = 先清空原有物品和路线再放新的 |
| `routes[]` | 游客路线，格式同 `路线草稿-Agent格式.md`；`stops` 里可以用**刚在同一份草稿里加的电视的 `purpose`** 当名字 |

| `decals[]` | 物料（贴在物品面或墙上的图片），见下一节 |

顺序是：改场地 → 删 → 增改物品 → 物料 → 路线。命名提醒：路线里按名字点停留点，只有电视和闺蜜机能起用途名，其他物品在路线里用编号。

## 物料（贴图）

叫法：**物品** = 3D 的东西（前台、电视……）；**物料** = 贴在屏幕或墙上的图片。

```json
{"decals": [
  {"object": 12, "face": "front", "image": "物料示例/前台正面.png"},
  {"object": "平行宇宙", "face": "screen", "image": "电视屏幕.jpg", "fit": "cover", "scale": 1, "ox": 0, "oy": 0, "rot": 0},
  {"wall": "A", "image": "A墙.png", "replace": true}
]}
```

| 字段 | 说明 |
|---|---|
| `object` | 物品编号，或电视 / 闺蜜机的用途名（也可写类型中文名，但有多个同名时报错，改写编号）。新加的物品（同一份草稿 `objects` 里）也能直接引用 |
| `face` | 面名：`front` 正面 / `back` 背面 / `left` 左侧 / `right` 右侧 / `top` 台面 / `endA` `endB` L 台端头 / `screen` 屏幕。每个物品能贴哪些面看 `list` 的 `faces` |
| `wall` | `"A"` 或 `"B"`，贴墙内侧（A = 左墙，B = 后墙）。和 `object` 二选一 |
| `image` | 本地 PNG / JPG 路径，**相对草稿文件所在目录**（也可写绝对路径）。长宽都 ≤ 4096 像素，文件 ≤ 20 MB。按文件头认格式，不看扩展名；WebP 不收（请先转 PNG / JPG） |
| `fit` | `contain` 完整显示（默认）/ `cover` 铺满 |
| `scale` `ox` `oy` `rot` | 大小 0.3–2（默认 1）、左右 / 上下偏移 −0.5–0.5（默认 0）、旋转 0/90/180/270（默认 0），和编辑器面板里的滑块一一对应 |
| `replace` | `true` = 这一面已有物料时覆盖。不写就报错、不写文件 |

- 图片比例最好和面一致（`list` 的 `pixels` 就是画框大小），否则 `contain` 会留白、`cover` 会裁掉。
- 脚本会：算图片内容的 SHA-256 当 `assetId`（和编辑器同一算法）、把图片 base64 放进文件顶层 `assets`、把物料写进物品的 `decals` / `decalFaces`（墙在 `layout.room`）。同一张图贴多处只存一份；被覆盖后没人用的旧图会清掉。**不要手改 `assets`。**
- 同一个面在一份草稿里写两次、面不存在、物品不支持贴图（机器人、椅子、圆形吊楣等）、图片坏了 / 太大，都会用中文报错且**不写文件**。
- 贴图的校验用编辑器同一套规则（`decal-model.js`），写出的文件用顶栏「导入」打开就能看到图。

### Figma 稿怎么接
脚本不碰 Figma，也不要碰 Figma 令牌。做法：Agent 先用**自己的 Figma 连接器**把画框导出成 PNG 存到本地（`list` 里的 `pixels` 就是画框该有的大小），再把本地路径写进 `image`。要改稿就重新导出、写 `"replace": true` 再跑一遍。

## 输出和检查
- 终端打印报告：`added`（新编号）、`updated`、`removed`、`decals`（每条物料贴到哪、图片大小、是不是覆盖）、`warnings`（超出场地的物品，只警告不拦）、`routes`（每条路线走不走得通、用时、被谁挡住）。
- 硬规则和编辑器导入一致：未知类型、尺寸不在 0.01–10 米、位置超 ±100 米、字段不支持，都会报错且不写文件。路线走不通默认也不写；`--allow-issues` 先写出再到界面里修。
- 写出的文件和编辑器「导出」同格式（`ces-booth-plans` 版本 2）。

## 做不了的事
- 不能直接取 Figma 稿（要先自己导出成本地 PNG / JPG）；不收 WebP / SVG。
- 物料只能整面贴一张图，摆法就是 `fit/scale/ox/oy/rot`；圆形吊楣不支持贴图。
- 不能直接操作正在开着的编辑器，只产出文件，人导入。
- 不检查物品之间互相重叠。

示例：`doc/Files/CES-02-展台草稿示例.json`（物品 + 路线）、`doc/Files/CES-02-物料草稿示例.json`（三张图贴到前台 12 正面 / 电视屏幕 / A 墙，图在 `doc/Files/物料示例/`）。测试：`node src/test-booth-agent.cjs`、`node src/test-booth-agent-decals.cjs`（最后一项要 8876 服务在跑，先 build）。
