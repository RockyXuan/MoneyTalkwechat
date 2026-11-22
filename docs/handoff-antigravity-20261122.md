# MoneyTalk 交接与需求复核 · 2026-11-22（北京时间）

## 接手位置与当前状态

- Mac 工程根目录 `/Users/rockyx/MoneyTalk-web`。实际运行目录是 `web-cloudflare/`。
- Git 远端是 [RockyXuan/MoneyTalkwechat](https://github.com/RockyXuan/MoneyTalkwechat)，当前分支 `codex/html-cloudflare-restart`。11 月 17–22 日的改动已完成新目录门禁与线上发布，准备统一提交并推送到该分支。保留现有目录，不 reset、clean、stash、切旧 main 或覆盖文件。GitHub 是否同步以远端实际读回为准。
- [正式记账入口](https://moneytalk-web.550754381zzx.workers.dev/record)和[订阅入口](https://moneytalk-web.550754381zzx.workers.dev/subscriptions)。**2026-11-22 北京时间 14:49 已上线版本 `b448910e-0681-4467-a3d3-4079984d350c`**（替换 11 月 19 日 `f3817144-d834-4997-b04c-3cfd7e451986`），`wrangler deployments list` 读回 **100% 流量**，保留触发器 `5 16 * * *`；生产 D1 `moneytalk-web-production` 读回 `No migrations to apply!`（`0006`/`0007` 已应用）；匿名请求 `/record`、`/subscriptions`、`/api/session` 均返回 `HTTP/2 302` 跳转至 Access 登录页。未写入生产账本。
- 技术栈是原生响应式 HTML/CSS/JS、Vite、Cloudflare Worker/D1/Access。D1 是账本真源，浏览器保存会话缓存/草稿。旧小程序、iOS、CloudKit、旧根构建、GLM/WorkBuddy 都是历史来源。
- 交接依据是当前线程、用户提供的测试截图、仓库内需求/验收及可读日志。未能逐字读取所有其他聊天原文。后来从旧聊天发现变更时，保留出处，按用户最后一次明确决定修订。

## 需求逐项对照

| 当前要求 | 代码或验收线索 | 接手时重点核对 |
| --- | --- | --- |
| 手工收支、分类、最近及完整账单、统计、导出、备份恢复 | [架构](architecture.md)、[全站复审](../web-cloudflare/docs/review-20261118/README.md) | 金额整数分，权限由服务端判断。单字段点按直改并保留其余字段，删除/恢复、统计与导出一致。只说月份就保留月份精度。 |
| 口述或语音转文字直接在记一笔录入，刷新／断网恢复 | [主输入与标签](../web-cloudflare/docs/workspace-tabs-ongoing-20261117.md) | 入口直接显示大输入框。原文按身份与账本隔离，保存并解析后为云端待核对，逐项按绿色按钮才入账。退出清理缓存，失败可重试并反馈。 |
| 淘宝等结构化清单 | [11 月 22 日记录](../web-cloudflare/docs/structured-review-20261122.md)、`tests/structured-text-review.test.mjs` | 标题提供平台和分组分类，逐项分类优先，并列候选待选。保存原文、顺序、规格和独立同名消费。可就地确认删除未入账候选，已入账项受保护；重试使用原请求身份，新批次获得新身份。现有新版本地通过，线上待发。 |
| 消费对象续记 | [续记方案](../web-cloudflare/docs/consumption-workspace-plan-20261117.md)、[来源日历验收](../web-cloudflare/docs/calendar-subscriptions-acceptance-20261117.md) | 消费对象是正在核对的来源，支付渠道不必填。分开来源和实际消费归属以免 App Store、游戏和订阅重复记。保留抖音各账号，最近优先、其余放更多，停用不删历史。已说到、已确认到、下一项和缺口各有含义。转账用途未知就待核对。 |
| 进度卡与日期日历 | [11 月 19 日交付](../HANDOFF.md)、[月份着色](../web-cloudflare/docs/calendar-color-20261118.md) | 电脑左侧记账、宽屏右侧等高卡片；手机版 B 固定快捷切换。按最新决定首页日历下方只留最近一批日期和操作；首尾、分类、明细或缺口仍能在相应核对/历史入口找到，核实轻量首页与完整续记同时成立。范围标记不等同全部平台消费已入账。 |
| 订阅与历史循环 | [订阅入口和总额](../web-cloudflare/docs/subscription-total-default-20261118.md)、[确认发布](../HANDOFF.md) | 默认金额是真填的 30 元，可改。下一步先预览范围、笔数及总额，绿色确认后保存。新持续订阅默认无截止；已停止才填末月，未知起始月待补，现有循环不可静默启用。支持暂停，删掉单期不自动补回。产品订阅续记与 Codex 开发定时任务分开。 |
| 分类、颜色、渐进展示 | [分类验收](../web-cloudflare/docs/category-suggestions-acceptance-20261011.md)、[支出颜色](../web-cloudflare/docs/spending-colors-20261118.md) | 平铺已有与新增，尊重同名，依据不足让用户选。分类与订阅合计可独立选色。更多说明按需展开，金额、错误和下一步靠近按钮。 |
| 多页与弹框 | [站内标签](../web-cloudflare/docs/workspace-tabs-ongoing-20261117.md)、[关闭方案](../web-cloudflare/docs/dialog-dismiss-plan-20261011.md) | 站内标签可关，保留未保存保护。无修改时点外部关闭，避免误触背景；改回原值视为未改，保存中保持面板。手机底部核对、电脑右侧核对，键盘/触摸也能访问帮助。 |
| 长段与 AI 理解 | [长段验收](../web-cloudflare/docs/continuation-workspace-acceptance-20261013.md)、[模型评测](../web-cloudflare/docs/semantic-intake-20261013/continuation-20261016.md) | 结构化拆分保留顺序、日期锚点、分段与备份。产品约束为 50,000 字/400 项，单段 10,000 字/40 项，500 批，云端跑最大负载仍需实测。通用模型未接生产，Qwen v12 17/21 实测通过、4 失败、4 未测，v13 只准备。切换开发助手不等于网站使用 Gemini。 |

## 用户偏好与边界

- 中文、大白话、先给结果。交付说清做了什么、测了什么、是否上线、卡在哪、用户具体要做哪一步。比较优先用表，界面验收图片直接嵌聊天，每次交付附正常网页入口。
- 从目标、约束和事实出发，主动找反例和回归场景，先复用现有实现及成熟方案。可逆工作自行推进。方向、费用、真实数据写入或外传、用户身份验证需要真实授权。盘点时区分事实、推测和缺证据。
- 少点几次、手机优先、保留桌面效率。默认值要能直接用，示例明确标识；真实消费缺金额或日期不可编造。结果、错误和未保存状态直接显示。辅助内容可悬停，也要能点击、聚焦、轻触和关闭。
- 只用虚构账本做自动化，保护真实账目、原文和凭据。真实新一轮批量写入须有可核对候选。用户未要求恢复平台采集、自动导入/对账、退款专项或开发定时任务。旧研究仅作参考。接手工具迁移不授权付费、模型评测或把消费数据发给 Google。

## 最近测试和排障

- 11 月 22 日首轮 Mac 日志明确为 172 项基础/接口通过，网页 284 通过、8 失败。之后修复绿色确认按钮定位、等待初次自动保存再测试阻塞、先打开核对并验证失败重试复用同一提交身份，增加删除前保留路径。
- 新目录 `/Users/rockyx/MoneyTalk-web/web-cloudflare` 已于 11 月 22 日下午在 Node `v22.23.2` / pnpm `11.19.0` 下重跑完整门禁 `pnpm verify:release`：`tsc --noEmit` 通过、**172 项**基础与隔离 D1 接口测试全过、`vite build` 通过、Chromium + WebKit 共 **292 项 E2E 全过**（用时 12.1 分钟，0 失败、0 跳过），覆盖检查 **58 主操作 + 37 文字操作**双引擎 0 缺项；`pnpm deploy:check` 退出 0（968.82 KiB / gzip 169.61 KiB），发布前核对 `dist/` 与 `worker/*.js` SHA-256 指纹与门禁构建一致。
- 已完成 Cloudflare 正式发布：线上版本 **`b448910e-0681-4467-a3d3-4079984d350c`**（100% 流量读回，前版 `f3817144-d834-4997-b04c-3cfd7e451986`），生产 D1 无待应用迁移，匿名 `/record`、`/subscriptions`、`/api/session` 均为 `302` Access 保护。未写生产账本；**未验证项**：真实 iPhone 键盘/手感、国内普通网络、线上登录后实际业务操作。
- Node 22.23.2 及 Corepack 的 pnpm 11.19.0 已存在。Mac 终端报 pnpm 找不到时，用下方命令。会话内换对 Node 后独立监听随机回环端口仍报 EPERM，错误先于浏览器启动。用正常授权的本机终端或允许开本地端口的开发环境跑既有门禁。
- Playwright 测试会开隔离 Worker，避免同时启动多个共用端口的测试。出现测试数量缩水、空文件、ENOEXEC 时，先核实 macOS 云端占位文件是否实际读到。保留失败证据，不靠跳测试或删断言。临时目录里的日志可能被清掉。

```sh
cd "/Users/rockyx/MoneyTalk-web/web-cloudflare"
export PATH="/Users/rockyx/.nvm/versions/node/v22.23.2/bin:$PATH"
node --version && pnpm --version && pnpm verify:release
```

## 接手规划

1. 先打开这个本机工作区，核对 Git 和未跟踪源码。按发布基线核对运行文件、构建和测试记录。需要保存 Git 时，先审阅待提交文件和敏感信息，保持近期功能完整，并核对远端分支。当前未提交或推送这份交接。
2. 若继续上次发布，先在有既有 Cloudflare 身份的环境读部署列表和 D1 迁移状态，核对最终源码/构建与通过门禁的版本一致。无把握就用该工作区重跑完整门禁。核对 0006/0007 是否已应用以及订阅 Cron 的生产状态，再按 [部署记录](../web-cloudflare/docs/cloudflare-deployment.md) 发布。发布后读回版本、流量和匿名保护；业务回归用隔离合成账本，并清理。凭据只保留在授权环境，禁止粘贴到聊天。
3. 优先完成真机和受影响流程验收。淘宝清单的核对、部分确认后删除待核对项、跨设备刷新，以及日历缺口和订阅预览是优先场景。跨设备同步按相同身份、账本、同一云版本逐步验证，当前没有本轮真实 Mac/Windows 端到端证据。
4. 后续优先继续打磨口述→核对→续记。模型接入另由用户决定产品供应商、费用和输入范围。现有 Cloudflare Worker 无法直接执行 Mac 上的 CLI。分开评估开发助手与生产服务，评测用虚构数据，模型只提出候选，逐项语义核对通过再考虑接入。

复制给下一位开发助手的文本见 [ANTIGRAVITY_PROMPT.md](../ANTIGRAVITY_PROMPT.md)。
