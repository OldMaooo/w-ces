# Agent 入口：一份草稿，把物品和游客路线导进场景

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
- `objects[]`：现有物品的编号、名字、位置、尺寸、角度、是否可见，以及能不能当路线停留点。
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

顺序是：改场地 → 删 → 增改物品 → 路线。命名提醒：路线里按名字点停留点，只有电视和闺蜜机能起用途名，其他物品在路线里用编号。

## 输出和检查
- 终端打印报告：`added`（新编号）、`updated`、`removed`、`warnings`（超出场地的物品，只警告不拦）、`routes`（每条路线走不走得通、用时、被谁挡住）。
- 硬规则和编辑器导入一致：未知类型、尺寸不在 0.01–10 米、位置超 ±100 米、字段不支持，都会报错且不写文件。路线走不通默认也不写；`--allow-issues` 先写出再到界面里修。
- 写出的文件和编辑器「导出」同格式（`ces-booth-plans` 版本 2）。

## 做不了的事
- 不能贴图（图片要从 Figma / 本机进编辑器，见 `设计师上手.md`）。
- 不能直接操作正在开着的编辑器，只产出文件，人导入。
- 不检查物品之间互相重叠。

示例：`doc/Files/CES-02-展台草稿示例.json`。测试：`node src/test-booth-agent.cjs`（最后一项要 8876 服务在跑）。
