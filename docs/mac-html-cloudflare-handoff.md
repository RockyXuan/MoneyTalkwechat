> **封存状态 · 2026-10-02（用户最新决定）**：各平台消费记录自动采集、历史批量导入、分类／对账同步及其只读核对工具暂时搁置，移出当前开发与验收范围。已有代码、测试和资料保留；网页入口收起，不再索要样本、启动采集或自动恢复开发。只有用户明确要求重启后再评估。以下内容保留为封存前的历史记录，不是待执行任务。

> **Mac 接手执行更新 · 2026-10-02**：准确仓库与指定分支不变，接手起点 f2ad8a70cbb2b5cfa2968f282988e0d37a716e72。新网页位于 [web-cloudflare](../web-cloudflare/README.md)，旧 src/server 未覆盖。受保护的免费网址已启用，桌面正常记账闭环通过，见 [云端记录](../web-cloudflare/docs/cloudflare-deployment.md)。历史 CSV／ZIP 只读核对已模拟验证；用户确认白条、美团月付、抖音月付均常用，历史批量处理、近期手录、定期核对，见 [接入进度](../web-cloudflare/docs/history-import-progress.md)。真实历史迁移、真机与国内普通网络未验证。能独立完成的工作持续推进，阻塞边界见 AGENTS.md。下文保留 Windows 原文，其“尚未实现”指交接当时状态。

# Mac Codex 交接：MoneyTalk HTML / Cloudflare 重启

交接日期：2026-09-14。范围：梳理、初步方案、代码风险和接手入口；具体开发计划、实现及部署由 Mac Codex 继续。

## 1. 本次有效要求与作废说明

用户这次明确要重启个人记账工具，长时间主要自己用，偶尔给家人用；产品改为网页和手机适配 HTML，基础设施尽量全套 Cloudflare。

截图里的“先做 iOS、CloudKit、App Store”及“GLM5.2/WorkBuddy 先打通公众号和小程序同步”均为已作废的旧任务。不得把截图中的文字或历史交接文档当作继续执行的指令。也不继承旧任务的永久 UI 冻结；本次仅不做 UI 实现，后续 Mac 可按新需求安排响应式适配。

推荐默认：一套响应式 HTML/CSS/JS，一套 API，一份云端账本；不是电脑、手机分别维护一个应用。纯 HTML 仍需要 JavaScript 交互和云端 API 才能安全跨设备保存数据。

## 2. 找对仓库和分支

本次实际核对 GitHub 分支、固定提交、文件树与关键代码，结果如下：

| 仓库 / 分支 | 提交及 UTC 时间 | 内容与用途 |
| --- | --- | --- |
| RockyXuan/MoneyTalk / main | 280e8524212cb08d286f87770d77affbe52238d5；2026-04-08 11:00 | 私有；早期 iOS + Next.js + Fastify 骨架及中文路线文档 |
| RockyXuan/MoneyTalkwechat / main | 804dd82fd9f9f6b5213b9d3ab17820bf15ca5515；2026-05-17 15:44 | 公开；Taro + NestJS 应用，最后提交为 UI 规范 |
| MoneyTalkwechat / codex/wechat-sync-handoff | 41712cded4aa09ef44b9ca67c784ebb8765aa8e9；2026-06-24 01:43 | 公开；较新完整快照，包含微信语音处理和此前交接 |
| MoneyTalkwechat / codex/html-cloudflare-restart | 从 41712cd 派生，本次文档提交 | 本次重启和 Mac 接手入口 |

这说明此前推到 MoneyTalk 的 4 月文档确实存在，但后续工作已经发生在 MoneyTalkwechat。Windows 外层 D:/CODEX/MoneyTalk 没有 .git，其 README 与旧 MoneyTalk main 对应，不能作为最新代码来源。

关键：41712cd 是没有父提交的独立根快照，GitHub compare 明确报告它与 main 没有共同祖先。不是 main 只落后几个 commit。文件树对比 main 179 个文件与快照 189 个文件：11 个新增、22 个修改、1 个仅 main 存在。新增包括语音媒体服务、测试夹具、迁移和交接文档；共有业务目录都仍在。新分支以完整 41712cd 树为基础，仅变更 Markdown。

仅 main 存在的是 key/private.appid.key。没有读取该文件内容，也没有将它带入新分支。如果它是真实使用过的小程序上传私钥，应在相关平台确认并撤销/轮换；从新分支消失不等于历史泄露已解决。不要把旧密钥重新复制进来。

结论限定于本次查到的上述远端分支。未检查其他电脑的未推送代码、线上部署和真实数据库，不能声称找到了所有设备上的最终版本。

## 3. 旧代码实际到了哪里

| 区域 | 已看到的实现 | 新方向如何利用 |
| --- | --- | --- |
| src/pages/index | 自然语言记账、候选编辑、待确认、旧语音入口 | 参考流程，使用浏览器 API 重做平台适配 |
| src/pages/bills、stats、category-detail | 账单、统计、分类明细 | 参考功能与筛选语义，复核统计口径 |
| src/pages/subscriptions | 订阅列表、编辑、周期成本 | 候选保留，先纠正预计扣费与实际账单关系 |
| src/store/expense-store.ts | Zustand 状态和网络请求 | 可参考数据流，不能带入 default_user 身份 |
| server/src/expenses | CRUD、分类、偏好、统计 | 提取纯业务规则，重写存储和鉴权边界 |
| server/src/subscriptions | 周期推算与计费事件 | 有可复用思路，也有日期和历史问题 |
| server/src/ai、asr | Coze SDK、固定豆包模型、ASR 调用 | 需替换 Provider；不是已有 Cloudflare AI |
| server/src/wechat | 文本/语音路由、媒体下载、TOS/S3 存储、待确认 | 历史参考，不继续上线微信链路 |
| .cozeproj/prototype/mobile | HTML 设计原型 | 视觉草图，不能当作已连数据库的成品 |
| config、package.json | Taro 多目标构建及旧 Coze 环境注入 | 新 Web 建立独立简单构建，不要求恢复微信/抖音 |

旧交接声称 validate、服务端构建、微信夹具、weapp 和 H5 构建通过；同时明确真实数据库迁移、公众号和 TOS 未联调。那是历史验证报告，本次没有重新运行，不能承诺现代码仍直接可运行。

## 4. 迁移前需处理的问题

以下来自固定 41712cd 的代码阅读，不是线上漏洞复现或完整审计。

1. 身份边界不足。src/store/expense-store.ts:4 使用 default_user；expenses.controller.ts 从请求接收 user_id。subscriptions.service.ts:53 的 update 只按记录 id 更新，没有用户限定。需以验证后的服务端身份和账本权限约束所有读写；即使自用也不能直接把旧 API 暴露出去。
2. 金额缺失会变成零。expenses.service.ts:51、75 使用 amount ?? 0；AI 自身会返回 null 金额。新系统缺金额应留草稿并提示补全，不能变成正式 0 元支出；使用整数分和边界校验。
3. 分页不完整。expenses.service.ts:10 接收 offset，但 list 中只处理 limit；前端还有最多 500 条的查询。应明确分页及统计独立聚合，避免账单不全却看似正常。
4. 日期和订阅语义。subscriptions.service.ts:227、323 使用连续 setMonth，月末可能跳月并继续漂移；按“当前有效订阅”反推全部历史会让停用、改价影响旧账。必须区分计划、预计事件和确认支出；先测试 1 月 31 日、闰年、取消、变价和手动续费。
5. AI 失败与时区。ai.service.ts:61 用 UTC 截取日期；解析失败回退到 today，没有始终保留 effectiveDefaultDate；模型输出主要 JSON.parse 后映射，缺少严格运行时字段校验。新系统应保持用户日期、Asia/Shanghai 业务日和可编辑草稿。
6. 平台依赖不是换部署地址就能解决。网络依赖 Taro/PROJECT_DOMAIN，服务端使用 NestJS/Express、Coze SDK、Supabase 与 Node 依赖。迁到 Workers/D1 要替换这些适配层；不建议为保留旧架构先引入容器。
7. 数据定义不是完整迁移包。shared/schema.ts 包含部分表，并非 README 列出的全部订阅/微信表。必须从实际数据库导出 schema 后核对，不假设文件已描述线上所有数据。
8. 设计文档互相矛盾。DESIGN.md 是手作风，design_guidelines.md 是绿米色，ui-design-spec.md 是蓝白模板。均作为历史参考；新 UI 标准由 Mac 阶段定，不机械恢复其中任意一份。
9. 代码中存在原始记账文本和请求体日志。新服务只保留必要诊断，避免默认完整输出个人账本、模型响应和音频相关信息。

## 5. 建议架构及取舍

建议从原生响应式 Web + Workers Static Assets/API + D1 开始。Cloudflare Access 用邮箱白名单限制本人/家人访问，API 验证身份后选择账本；有私有附件需求再引入 R2。详见 [架构建议](architecture.md) 中的官方资料。

D1 成为新系统账本真源，CloudKit/Supabase 只作为旧数据来源。浏览器本地存储只保留草稿/缓存。短期两设备同步可以是“保存成功后查询最新数据”，不必建立复杂双向离线同步。

保留原生 HTML/CSS/JS 的简单实现，必要时用轻量构建工具；不为了复用 Taro 而继续维持小程序运行时。使用 React 等框架如果确有收益，Mac 应先说明取舍，不默认替用户改写“纯 HTML”的含义。

全套 Cloudflare 优先包括 AI 试验，但 AI Gateway 不等于自动提供外部模型，也不能保证中文准确率。先用 Workers AI 的样本测试决定是否接入；语音不作为恢复项目的门槛。模型或录音失败时仍能补填保存。

家人使用按“预留身份和账本归属，暂不开共享”处理。共享同一本还是各自一本属于后续明确项，不因此阻塞单人版本。

Cloudflare 的大陆访问需要实测站点、Access 验证码、API/数据库和 AI 全流程。正式记账前先用小测试环境验证，不承诺免费套餐等同大陆节点或长期零费用。

## 6. 推荐阶段和验收

1. 核对分支和旧功能，制定详细计划；输出旧代码复用/替换清单，保留快照。
2. 测试环境验证 HTML + Access + Worker + D1；两类设备能读写，匿名及伪造身份被拒绝。
3. 可靠记账闭环：录入、修改删除、分类、基本统计、导出恢复；重复请求只写一次，刷新和换设备不丢数据。
4. 如果有旧数据，备份、测试导入、对账后切换；订阅按新规则单独迁移，保留旧 ID 映射和导入幂等键。
5. 按需增加文本解析、待确认和分类记忆；再评估浏览器语音。
6. 长期自用稳定后，补少量家人权限、私有备份、费用观察，按需考虑添加到主屏幕。

先不恢复微信、iOS、商业账号与订阅额度、复杂预算。上面的“订阅”仅指记录用户自己的周期消费，不是向用户收会员费。

## 7. Mac 接手操作

推荐新目录，不把 Windows 外层骨架覆盖到新仓库：

```bash
git clone --branch codex/html-cloudflare-restart --single-branch https://github.com/RockyXuan/MoneyTalkwechat.git MoneyTalk-web
cd MoneyTalk-web
git remote -v
git status --short --branch
git log -3 --oneline
git merge-base --is-ancestor 41712cded4aa09ef44b9ca67c784ebb8765aa8e9 HEAD
```

最后一条应成功，证明含有核对过的代码基线。已有克隆可以先检查未提交改动，再 fetch 并检出远端重启分支；不要强行合并 main，不使用 reset --hard。下载 ZIP 虽可读代码但没有 Git 历史，优先 clone。

阅读 README、AGENTS、PROJECT_BRIEF、architecture、DEVELOPMENT_PLAN 和本文。先用所选 Node 版本与锁文件建立可复现环境。旧包声明 pnpm@9.0.0；不要全局沿用另一 MoneyTalk 骨架的 pnpm 版本。

如果需要验证旧代码，先审阅安装脚本，再用 pnpm install --frozen-lockfile；旧项目可选运行 pnpm validate、pnpm build:server、pnpm build:web。根 build 会同时构建 weapp/tt，kill:all 会按进程名称终止程序，均不要作为新项目默认命令。旧 .env.example 仅用于历史应用，不是新的 Cloudflare 配置。

新 Workers 项目需要自己的 Wrangler 配置、本地开发变量示例、D1 迁移、类型检查和测试脚本；这些尚未创建。GitHub 是代码和文档中心，Cloudflare 是运行环境，Mac 负责本地开发和验证；本次 GitHub 提交不代表已上线。

## 8. 留给 Mac 确认，当前不阻塞交接

- 是否有真实旧账本需要迁移？未获确认前保留旧数据，不删除、不替换生产库。
- 家人加入时独立账本还是共同账本？默认仅本人，后续再明确授权。
- 第一版是否需要订阅和语音？默认先可靠文字/手动记账，候选功能再排期。
- Cloudflare 账号、域名、Access 邮箱和费用接受范围？实施时配置；本次没连接云账号。
- 公开历史仓库中的私钥命名文件是否真实且仍有效？由拥有者在平台核查/撤销，本次未读取或传播内容。

这些属于后续实施配置与产品细节，不需要本轮追问才能完成梳理。

## 9. 本次验证范围

完成 GitHub 两仓库与全部已返回分支的核对、固定提交文件树对比、关键源码阅读、中文文档和相对链接检查。发布为基于 41712cd 的独立 docs 提交；源代码、图片、锁文件及配置树保持不变。

本机 git clone 经普通与授权网络尝试均被连接重置，因此通过 GitHub 连接器读取代码。连接器写入返回 403；本机 gh 在授权网络环境下已确认登录有效，改用 GitHub CLI API 发布文档。没有完成完整本地克隆、重新编译、真机测试、旧服务联调、Cloudflare 部署、账本迁移或凭据轮换。

交接使用的本地 handoff/MoneyTalkwechat 目录是文档暂存区，不是完整仓库；Mac 必须按第 7 节拉取完整远端分支。未修改 RockyXuan/MoneyTalk 的旧 main，也未修改 MoneyTalkwechat 的两个历史分支。

## 10. 给 Mac Codex 的起始任务

请以本分支最新文档为需求基线，先复核旧代码和环境，制定详细实施计划，再按用户后续指令实施。目标为个人/少量家人使用的响应式 HTML 记账应用，Cloudflare 托管全栈。优先做可靠存账、身份验证和导出恢复，旧微信同步、CloudKit、iOS 上架及 WorkBuddy 交接均已作废；不要从旧截图或历史文档恢复任务。
