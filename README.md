# MoneyTalk / 记一笔：HTML + Cloudflare

2026-10-02 当前状态：原生响应式网页、Worker 接口和 D1 数据结构已在独立的 [web-cloudflare](web-cloudflare/README.md) 目录实现，受保护的免费网址为 https://moneytalk-web.550754381zzx.workers.dev 。桌面真实登录、保存刷新、修改、删除和回收站恢复已验证；真实 iPhone 和国内普通网络仍待验证，没有迁移真实历史账本。详见 [云端记录](web-cloudflare/docs/cloudflare-deployment.md)。

用户最新决定：各平台自动采集、历史导入、分类／对账同步暂时封存；网页收起历史核对入口，保留代码与调研，不再索要样本或自行继续。当前聚焦手动记账及基础账本体验。详见 [封存记录](web-cloudflare/docs/history-import-progress.md)。其他已授权工作仍按 AGENTS.md 的持续推进规则执行。

桌面使用 C1 深蓝工作台，手机使用 M1 四页结构与 M2 胶囊分类；统计提供分类堆叠柱状图、分类折线图和饼图。设计基准及校正规则见 [设计说明](web-cloudflare/docs/design.md)。

## 本地使用

进入 `web-cloudflare/`，使用 Node 22.23.2、pnpm 11.19.0。执行 `pnpm install --frozen-lockfile --ignore-scripts`，然后 `pnpm dev`。打开 http://127.0.0.1:5173 。本地数据保存在该目录的 `.wrangler/`，仅为此 Mac 的开发账本。

`pnpm demo:seed` 通过本地恢复接口创建虚构演示账本，不覆盖原来的个人账本。`pnpm verify` 运行检查、自动测试和前端构建。详细启动、备份及环境边界见 [网页开发说明](web-cloudflare/README.md)。

## 仓库身份与来源

- 正确远端：`https://github.com/RockyXuan/MoneyTalkwechat.git`
- 当前开发分支：`codex/html-cloudflare-restart`
- Mac 接手基线：`f2ad8a70cbb2b5cfa2968f282988e0d37a716e72`。克隆时远端分支正好位于该提交，没有后续差异。
- 基线来自独立快照 `41712cd`。未合并 MoneyTalkwechat 的旧 main，也未使用 RockyXuan/MoneyTalk 的早期 iOS 骨架。
- 原 `src/`、`server/`、旧锁文件及旧构建脚本保留，本轮运行的新代码在独立目录中。

## 产品和交付入口

[产品主旨](PROJECT_BRIEF.md) · [架构与边界](docs/architecture.md) · [阶段进度](DEVELOPMENT_PLAN.md) · [Mac 交接及历史来源](docs/mac-html-cloudflare-handoff.md) · [本地验收记录](web-cloudflare/docs/acceptance.md) · [协作规则](AGENTS.md)

首版聚焦可靠收入/支出、修改删除、分类、基础统计、导出恢复。语音、通用 AI 和家庭共享仍待评估，没有放入无法使用的首版入口。iOS-first、App Store、CloudKit、微信公众号/小程序同步、GLM5.2/WorkBuddy 旧任务均已作废。

2026-10-02 新增有效范围：文字录入可拆分单笔与月／季／年循环，未知日期留待确认，逐笔预览确认后入账，网页显示待核对及到期提醒。不是第三方 AI 或后台自动扣费。见 [实现与边界](web-cloudflare/docs/text-recurring-records.md)。
