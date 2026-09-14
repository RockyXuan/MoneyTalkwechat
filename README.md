# MoneyTalk / 记一笔：HTML + Cloudflare 重启

> 当前方向更新于 2026-09-14。本分支用于 Mac Codex 接手，当前仅整理文档，尚未实现或部署新的 HTML/Cloudflare 应用。

面向自己长期使用、偶尔邀请家人的轻量记账工具。目标是一套响应式 HTML/CSS/JavaScript 页面，同时适配电脑和手机，共用同一套 API 与账本。基础设施优先全部采用 Cloudflare。

## 从这里接手

先读 [Mac 重启交接](docs/mac-html-cloudflare-handoff.md)，再读 [产品主旨](PROJECT_BRIEF.md)、[架构建议](docs/architecture.md)、[阶段路线](DEVELOPMENT_PLAN.md) 和 [协作规则](AGENTS.md)。

```bash
git clone --branch codex/html-cloudflare-restart --single-branch https://github.com/RockyXuan/MoneyTalkwechat.git MoneyTalk-web
cd MoneyTalk-web
git status --short --branch
git log -3 --oneline
```

后续在 Mac 本地开发、验证、提交，再 push 到 GitHub。浏览器应用不需要 Xcode、iOS 签名或微信开发者工具。具体 Node/pnpm 版本和新启动脚本由 Mac 阶段确认，不能把旧构建脚本当作 Cloudflare 部署入口。

## 仓库核对结果

| 位置 | 核对到的提交 | 结论 |
| --- | --- | --- |
| RockyXuan/MoneyTalk main | 280e852，2026-04-08 | 早期 SwiftUI/Next.js/Fastify 骨架，本次 Windows 外层目录对应它 |
| RockyXuan/MoneyTalkwechat main | 804dd82，2026-05-17 | 后来的 Taro/NestJS 记账与订阅代码 |
| MoneyTalkwechat 的 codex/wechat-sync-handoff | 41712cd，2026-06-24 | 本次发现的较新完整代码快照，作为重启分支代码基线 |
| 当前 codex/html-cloudflare-restart | 从 41712cd 派生 | 新需求及交接文档入口；没有合并或覆盖旧 main |

微信仓库的 main 和旧交接分支没有共同祖先。不要普通合并、强推或仅按分支名称判断版本。仓库名暂时保留 MoneyTalkwechat 以保留来源，不代表继续开发微信产品。

## 已作废的开发方向

iOS-first、App Store 上架、CloudKit 主账本、微信公众号/小程序数据同步、GLM5.2/WorkBuddy 接微信的旧任务均不再作为待办。旧设计稿和“暂停 UI、先接微信”的要求也不能当作当前命令。

## 现有代码与新方案

现有 src/ 是 Taro 页面，server/ 是 NestJS + Supabase + Coze SDK；已有支出、分类、偏好、订阅、报表和微信语音相关实现。代码存在不等于真实服务已可用。历史交接报告构建通过，但本次没有重跑构建或连接生产数据库。

建议新方案为响应式原生 Web 页面 + Workers API + D1；Cloudflare Access 用于少量受邀用户，R2 按需，AI 先评估 Workers AI。这是方案建议，尚未配置云资源。详细实现由 Mac Codex继续制定。

本分支仅提交 Markdown，不修改现有 UI、运行时代码、数据库、密钥或部署配置。历史需求文件已加作废标识。
