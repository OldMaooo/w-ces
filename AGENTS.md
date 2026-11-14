# CES 展台草图

- 叫法（用户 2026-11-14 定）：**物品** = 3D 的东西（前台、电视、电脑、人物……，物品库、`objects`）；**物料** = 贴在屏幕或墙上的图片（顶栏「物料」标签、贴图模式、`decals`）。写文档、界面、报告都按这个叫。
- **Agent 入口（批量放物品、生成游客路线；物料入口还没做）**：先读 `doc/Agent入口.md`，用 `node src/booth-agent.cjs list|apply`；只做路线的细节见 `doc/路线草稿-Agent格式.md`；设计师贴图见 `doc/设计师上手.md`。不要手改 `index.html` 或方案 JSON 里的 `assets`。
- 构建：`python3 src/build.py` 从 `src/` 生成 `index.html`（只改 src，不手改 index.html）。
- 参照屏：透视视图（会场里点「透视」后的默认角度，用户 2026-11-13 发的截图）
- 看效果：用 preview_start（launch.json「验收-悬浮物料栏与人物」，端口 8876）在内置浏览器截图
