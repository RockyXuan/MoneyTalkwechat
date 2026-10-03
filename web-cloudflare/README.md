# MoneyTalk Web

> **封存状态 · 2026-10-02（用户最新决定）**：各平台消费记录自动采集、历史批量导入、分类／对账同步及其只读核对工具暂时搁置，移出当前开发与验收范围。已有代码、测试和资料保留；网页入口收起，不再索要样本、启动采集或自动恢复开发。只有用户明确要求重启后再评估。其中涉及自动采集、历史导入的内容保留为历史记录，不是待执行任务；基础账本说明继续有效。

普通 HTML/CSS/JavaScript 页面 + Cloudflare Worker + D1。当前可运行的版本在此目录，与旧 Taro/NestJS 源码分开。

**2026-10-03：手机优先界面已发布到原云端网址。** 入口为 https://moneytalk-web.550754381zzx.workers.dev ，由 Cloudflare Access 保护，仅允许拥有者身份。用户已确认真实手机可打开；四页主要操作移到底部，文字草稿与正式入账明确区分，跨月结果可直接查看并刷新保留范围。实现、调研与剩余验收见 [手机打磨记录](docs/mobile-polish-plan.md)、[部署记录](docs/cloudflare-deployment.md)。真实 iPhone 键盘、操作手感和国内普通网络的完整流程仍待验收。

本轮全功能回归：Chromium/WebKit **70/70**、原有测试 **52/52** 通过，修复筛选刷新、手机筛选导出、日期清除与 WebKit 弹窗返回焦点。两引擎均覆盖现有 45 类页面操作和 15 类文字流程操作；详见 [验收计划](docs/ui-test-plan.md)、[结果与复测方式](docs/ui-test-results-2026-10-03.md)。工程和线上验证通过后交由用户做真实手机最终验收。

## 本地启动

固定 Node 22.23.2（`.nvmrc`）、pnpm 11.19.0（`packageManager`）。在当前目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

页面 http://127.0.0.1:5173 ，Worker 与构建后页面 http://127.0.0.1:8787 。`dev` 会先构建和应用本地迁移，再同时启动页面与 Worker；停止时只关闭自己启动的子进程。没有生产部署步骤。

在第二个终端、同一目录中可执行：

```sh
pnpm demo:seed
pnpm verify
```

演示脚本仅允许 127.0.0.1 的本地预览身份，通过恢复接口创建并切换虚构账本。基准为 2026 年 9 月的 61 笔记录、支出 3,248.00 元、收入 18,000.00 元。重复执行复用未变化的演示账本；演示账本被修改后重新创建候选账本，保留旧版本。初始空个人账本仍可在“我的”切换。

本机本轮使用 `/Users/rockyx/.nvm/versions/node/v22.23.2/bin` 和 Codex 已有的 pnpm 11.19.0。没有安装或改变全局工具。其他机器按项目版本准备工具即可。

## 脚本及数据位置

| 命令 | 做什么 |
|---|---|
| `pnpm dev` | 构建 → 本地数据库迁移 → Vite 与 Worker |
| `pnpm preview` | 仅启动本地 Worker，提供已构建页面 |
| `pnpm build` | 构建静态文件到 dist |
| `pnpm check` | JavaScript 语法与项目配置检查；不等同完整静态类型验证 |
| `pnpm test` | 单元测试与隔离 Miniflare D1 集成测试 |
| `pnpm test:ui` | Chromium/WebKit 全功能界面验收，自动使用独立本地测试账本 |
| `pnpm test:ui:coverage` | 对照页面事件检查按钮操作覆盖，两种引擎均须无遗漏 |
| `pnpm verify` | check、test、build |
| `pnpm db:local` | 只应用本地 D1 迁移 |
| `pnpm demo:seed` | 仅本地的虚构演示账本 |
| `pnpm deploy:check` | Wrangler dry-run，仅检查打包，不发布 |
| `pnpm legacy:convert` | 离线旧 expenses JSON 转换，不连接旧数据库 |
| `pnpm bills:review` | 原始 CSV／ZIP 批量离线核对，输出原件副本和候选报告，不写入账本 |

`.wrangler/` 为本机开发数据库。`dist/`、`node_modules/`、`.wrangler/`、`.dev.vars*` 和日志不进入 Git。`.dev.vars.example` 仅有占位符。不要删除 `.wrangler/` 来修复页面错误，以免丢失本地账目；先从页面下载备份。

## 页面与数据行为

`/record` 记一笔，`/bills` 完整账单，`/stats` 统计，`/settings` 数据管理。根路径首次访问按屏幕选择默认页，明确链接不因断点变化跳页。

服务器确认前不显示保存成功。金额以整数分保存，范围 0.01–99,999,999.99 元。日期使用上海时区的日历日，非 UTC 日期截断。笔数和金额汇总来自完整数据库查询。结余只表示期间收入减支出。

删除进入回收站；10 秒内可在提示中撤销，之后可在回收站恢复。修改冲突显示明确提示，不静默覆盖。分类可改名、换预设颜色、排序、停用；有历史记录时不改变类型。

浏览器会话保存未提交草稿；退出和切换账本会清除草稿。显示偏好保存在当前设备。未实现离线自动记账、后台同步或家庭共享。

## 备份与旧数据

历史账单核对工具已按用户决定封存，网页无入口；不执行外部平台采集、导入或同步。保留的说明和代码仅作历史参考，见 [封存记录](docs/history-import-progress.md)。

“我的 → 备份与恢复”可下载完整 JSON，包括回收站；CSV 仅包含有效账目。桌面账单页可导出当前筛选结果。备份校验展示日期、条数、收支、分类和异常，再写入独立候选账本；未校验完成不允许切换。

旧数据转换必须明确指定文件、全新输出目录和原 user_id：

```sh
pnpm legacy:convert /absolute/expenses.json /absolute/new-review-directory OLD_USER_ID
```

输出原文件副本、`candidate-backup.json` 和 `review-report.json`，不覆盖已有目录，不上传或写入账本。异常行保留在原文件，报告标注原因。旧 expenses 被明确解释为支出，不处理订阅推算事件、音频或微信身份绑定。新分类默认灰色，之后可以手动调整。真实数据必须保存在 Git 外，核对完成前不宣布迁移成功。

## 云端部署与剩余验收

2026-10-02 已在独立生产 D1 应用前三份迁移（第三份新增文字与循环表），为完整 workers.dev 主机名创建 Access 应用与精确拥有者邮箱规则。服务端通过 Cloudflare secret 配置 `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`OWNER_EMAIL`；这些值不放入源码。`workers_dev=true`，`preview_urls=false`，生产未设置本地绕过开关。没有导入本地演示或真实账目。当前版本与验证证据见 [部署记录](docs/cloudflare-deployment.md)。

后续完成步骤：

1. 已获测试写入授权，生产保存、刷新读回、修改、删除与回收站恢复通过；测试账目保留在回收站，不影响有效收支。
2. 用户已确认手机可打开；继续验收真实手机四页操作、键盘、日期控件及国内普通网络下的加载和保存。
3. 验证错误身份、重试去重、双设备冲突和真实服务导出恢复。不要用本地通过代替生产结果。
4. 如增加域名或预览入口，先为新增入口配置同等保护并检查 API；不得直接开放无保护入口。

不默认创建 R2、KV、队列或 AI 服务。详细身份及数据模型见 [架构说明](../docs/architecture.md)。

## 设计与复用

[设计规范](docs/design.md)、[设计基准](docs/design-reference/)、[接口契约](docs/api.md)、[依赖说明](docs/reuse.md)。许可证全文随静态资源提供在 `/licenses.txt`。

## 文字录入与循环记录

从“记一笔 → 文字记账”或“我的 → 文字与循环记录”进入。先解析和编辑，保存云端候选不计入收支；逐笔预览确认才入账。未知起始月、扣款日保留疑问，未来不提前记账，打开网页显示待处理提醒。备份 v2 同时保存规则与已记周期，兼容旧 v1。见 [详细说明](docs/text-recurring-records.md)。
