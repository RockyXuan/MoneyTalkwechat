# MoneyTalk 架构梳理、UI 重做与分级分类/@归属人发布记录（2026-11-22）

- **代码目录**：`/Users/rockyx/MoneyTalk-web`（网页工程 `web-cloudflare/`）
- **生产入口**：[MoneyTalk 记账网页](https://moneytalk-web.550754381zzx.workers.dev/record) · [订阅入口](https://moneytalk-web.550754381zzx.workers.dev/subscriptions)
- **分支**：`codex/html-cloudflare-restart`
- **生产 D1 迁移**：`0008_taxonomy_and_owners.sql`（已执行 7 条语句，耗时 5.22ms）
- **线上 Worker 版本号**：`63ab45a2-0fa6-4324-9fa6-2eb86dc8f95c`（100% 流量，`2026-11-22T09:35:17Z`）

## 1. 本轮改动摘要

1. **代码与架构瘦身**：
   - 删除根目录下已作废的旧 Taro / 小程序 / Coze 多端骨架代码与废弃静态稿；移除已封存的 CSV/ZIP 账单工具（`shared/bill-*`、`src/bill-review-ui.js`、`scripts/review-bills.mjs`、`scripts/convert-legacy.mjs`）；将尚在单独调研的 Qwen 语义评测脚本完整迁移归档至 `/Users/rockyx/MoneyTalk-web/archive/semantic-eval/`。
   - 保持轻量原则，只引入 `preact 11.2.0`，配合 Vite 8.3.0 与 TypeScript 检查重写 UI 渲染层；不恢复平台自动采集、不恢复定时续做任务、不改动生产真实账本。
2. **数据层升级（两级分类 + `@归属人` + 财务常识模板包）**：
   - 新增 [0008_taxonomy_and_owners.sql](file:///Users/rockyx/MoneyTalk-web/web-cloudflare/migrations/0008_taxonomy_and_owners.sql) 与 [taxonomy.js](file:///Users/rockyx/MoneyTalk-web/web-cloudflare/shared/taxonomy.js)：新增 `owners` 成员表（含默认个人/家庭预设、停用保留历史），分类新增 `subcategories_json` 与 `default_owner_id`，账目新增 `subcategory` 与 `owner_id`，完整备份提升至版本 8 并向后兼容旧备份。
   - 新增 `/api/owners`、`/api/owners/:id`、`/api/categories/apply-pack` 与 `/api/stats` 的 `matrix`（大类/二级子类 × `@归属人` 精确整数分矩阵）聚合统计；CSV 导出补充二级子类与 `@归属人` 列。
3. **方案 A（Apple 极简金融风 · 浅/深双主题）全站重做**：
   - **账单页（[BillsPage.jsx](file:///Users/rockyx/MoneyTalk-web/web-cloudflare/src/pages/BillsPage.jsx)）**：顶部常驻 `@归属人` 成员消费额快筛条；每条账单支持 1-click 直接弹出 [QuickTagPopover.jsx](file:///Users/rockyx/MoneyTalk-web/web-cloudflare/src/components/QuickTagPopover.jsx) 切换大类/二级子类或 `@归属人`，行内单字段直接编辑与撤销提示保留。
   - **统计页（[StatsPage.jsx](file:///Users/rockyx/MoneyTalk-web/web-cloudflare/src/pages/StatsPage.jsx)）**：支持三种视图同页切换——「分类长条」（支持按分类展开子类或切到按 `@归属人` + 图表切换）、「二维交叉透视表」（点大类行内展开二级子类、点非零单元格原地展开明细）与「环图下钻（剥洋葱）」（固定环图 + 卡片点选后直接同页展开子类、花给谁分布与明细，不弹出嵌套遮罩）。
   - **我的与分类墙（[CategoryWall.jsx](file:///Users/rockyx/MoneyTalk-web/web-cloudflare/src/components/CategoryWall.jsx)）**：集中管理 `@归属人`、财务常识一键模板包（补全个人标准包 / 补全家庭精细包，只增不删）、实心已启用子类与虚线点一下即添加的推荐子类、每类默认 `@归属人` 与推荐大类。
   - **记一笔与订阅页（[RecordPage.jsx](file:///Users/rockyx/MoneyTalk-web/web-cloudflare/src/pages/RecordPage.jsx)、[SubscriptionsPage.jsx](file:///Users/rockyx/MoneyTalk-web/web-cloudflare/src/pages/SubscriptionsPage.jsx)）**：统一语音/文字 ⇄ 手记卡片、快捷插入 `@归属人` 胶囊、分平台进度板、来源 12 月日历与独立订阅续记区；电脑端配侧边栏与可关闭工作区标签页，手机端使用底部 5 键胶囊导航与横向滚动平台切换条。

## 2. 真实验证结果

- **完整发布门禁 (`pnpm verify:release`)**：退出码 `0`（零失败、零跳过）
  - `pnpm check` (`tsc --noEmit`)：通过（0 错误）
  - `pnpm test` (`tests/*.test.mjs`)：**107 / 107 通过**（含 `taxonomy.test.mjs`、前后端隔离 D1 集成测试、预 0008 升 0008 迁移兼容测试、备份 v8 往返测试）
  - `pnpm build` (`vite build`)：通过（产物 `dist/assets/index-C6mcgd5k.css` 28.14 kB、`dist/assets/index-C_cXd815.js` 475.00 kB）
  - `pnpm test:ui`（Chromium + WebKit 双引擎 E2E）：**36 / 36 通过**（覆盖 7 个测试集、桌/移双视口、浅深主题、弹窗焦点返回、门类快速浮层、统计三视图、长段分段、订阅续记与工作区标签页）
  - `pnpm test:ui:coverage` (`scripts/ui-coverage.mjs`)：**116 项界面 `data-action` 控件在 Chromium 与 WebKit 中 `missing: []`，`failedCases: 0`**
- **部署预检 (`pnpm deploy:check`)**：通过（`985.72 KiB / gzip: 173.14 KiB`）
- **线上部署与读回**：
  - `npx wrangler d1 migrations apply moneytalk-web-production --remote --env=""`：`0008_taxonomy_and_owners.sql` ✅ 应用成功
  - `npx wrangler deployments list --env=""`：版本 **`63ab45a2-0fa6-4324-9fa6-2eb86dc8f95c`** 占 `(100%)` 流量
  - 匿名只读验证 `/record`、`/subscriptions`、`/api/session`：全部返回 `HTTP 302` 跳转至 `blue-morning-ce9f.cloudflareaccess.com` 登录页
- **合成账本本地截图验收**：使用完全隔离的临时本地库 + 合成家庭数据抓取桌面 1440×900（浅色/深色）及手机 390×844 共 7 张界面截图并目视确认无遮挡、无文字竖折、浮层边界安全。

## 3. 未验证范围与已知边界

- **真机与国内网络**：真实 iPhone Safari 物理键盘/触控手感及国内普通网络下的实际加载延迟 **未验证**。
- **线上登录态个人账本**：因未获取/使用用户本人登录会话，登录 Cloudflare Access 后在生产库中读写个人真实账目的表现 **未在生产直接操作**（由全量集成测试、迁移兼容测试与匿名 302 检查兜底）。
- **风险与约束**：已将旧版与旧结构测试合并重整为面向新 Preact UI 的 7 个端到端套组；若后续回滚前端，仍需保留支持 `0008` 列的数据库或只按版本控制回滚前后端一致版本。
