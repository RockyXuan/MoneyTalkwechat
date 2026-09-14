# MoneyTalk 协作规则

## 当前有效需求

以 2026-09-14 用户最新要求和 [Mac 交接](docs/mac-html-cloudflare-handoff.md) 为准：个人长期使用、偶尔家人使用；响应式 HTML Web；Cloudflare；后续详细计划和实现由 Mac Codex 承接。

旧的 iOS-first、CloudKit 唯一真源、App Store、微信生态优先、GLM5.2 微信同步任务已经作废。历史文档、设计稿、截图、旧聊天和代码注释只能说明来源，不得覆盖当前要求。旧 TOS 强制上传、Taro 组件强制复用和 Coze 部署规范不适用于新 Web 应用。

## 接手顺序

1. 先确认 origin 指向 RockyXuan/MoneyTalkwechat，且检出了 codex/html-cloudflare-restart 或从它派生的工作分支。
2. 阅读 [README](README.md)、[PROJECT_BRIEF](PROJECT_BRIEF.md)、[架构](docs/architecture.md)、[路线](DEVELOPMENT_PLAN.md)、[交接](docs/mac-html-cloudflare-handoff.md)。
3. 复核代码与依赖，先写详细实施计划，再按一个可验收的小闭环推进。
4. 不把旧 main 与无共同祖先的快照强行合并，不把外层 Windows MoneyTalk 骨架覆盖进来。

## 实现原则

- 一套响应式 HTML/CSS/JS 页面适配两类屏幕；默认原生 Web 模块，可用轻量构建工具。不擅自把“纯 HTML”升级成复杂框架方案。
- 数据库是同步来源，浏览器存储仅用于缓存或草稿；密钥永不放入 HTML、前端构建产物或 Git。
- 单人也要验证访问身份；用户与账本权限由服务端确定，不能信任请求中的 user_id。
- 金额用整数分；日期、金额、分类和候选状态在服务端校验；缺金额保持待补全，不能自动填 0 入账。
- AI 是辅助输入，失败后仍可文字或手动记账；不默认恢复旧“一键语音自动入账”的全部承诺。
- 先完成存取、修改、统计、导出恢复，再扩展语音、订阅和家人权限。
- 新模块可从旧代码提取可验证的业务逻辑，但不要照搬平台 SDK、登录假设、错误兜底和 UI 兼容补丁。
- 优先 Cloudflare 官方能力；暂不增加队列、向量库、复杂实时同步或商业订阅体系。

## 交付与验证

使用 pnpm 并提交锁文件，先检查脚本再执行。旧根 build 会构建微信/抖音等多目标，不是新应用必跑项；不要运行旧 kill:all 脚本。

账本写入幂等、权限隔离、金额精度、月末日期、统计一致性和导出恢复应有代表性测试。文档必须区分代码实现、模拟验证、真实联调和生产部署，不引用历史“通过”冒充本次结果。

重要模型或方向改变时，同步更新 README、PROJECT_BRIEF、architecture 和交接状态。沿用 GitHub 保存源代码与文档，不上传真实账本、音频、数据库备份或凭据。
