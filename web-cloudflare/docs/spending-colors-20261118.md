# 订阅合计和支出标记 · 2026-11-18

用户选择绿色＝健康或值得，白色＝必要支出，黄色＝有节约空间，红色＝想控制。订阅卡片的累计支出移到上方大字显示，卡片可独立选择或取消标记；分类管理可给分类独立设置支出标记，账单和统计分类显示对应说明。旧项目未标记，不自动推断。标记与原分类图表颜色分开，不改变账目金额或现有分类颜色。白色标记在白底上用深色文字保证可读。

参考 W3C 颜色使用说明 https://www.w3.org/WAI/WCAG20/Understanding/use-of-color.html 和 Actual Budget 设计原则 https://github.com/actualbudget/actual/blob/master/DESIGN.md ，采用颜色加文字，不引入外部依赖。复用现有分类和文字批次，标记保存在受身份保护账本，备份版本 7 包含标记，老备份可继续恢复；不发送给第三方。

## 验证及发布

- 167 项单元/接口测试与 282 项双引擎页面测试完整通过，操作覆盖无缺项，日志 `/private/tmp/moneytalk-spending-label-release-final.log`。包括分类与订阅标记独立保存、并发冲突、账户隔离、重试、刷新和备份恢复。
- @Browser 本机隔离数据库 `http://127.0.0.1:8793/subscriptions` 验证了虚构订阅确认、标红和刷新后保留；这次检查发现圆点与文字靠近，随后微调显示，最终完整复测见 `/private/tmp/moneytalk-spending-label-polished-release.log`。
- 云端执行无旧数据改写的 `0007_spending_labels.sql`，首次上线版本 `d90c9377-aeba-4470-99cd-36ffdc5361b0`。精修间距版本 `0c6ee53e-fb40-42ca-8799-5f90a117d6a4` 已发布，部署列表读回 100% 流量；匿名订阅页与 session 均返回 302 身份保护。精修后再次运行完整门禁，167 项基础/API 与 282 项双引擎页面测试通过，覆盖无缺项。
- Ego Lite Task Space 50 只读尝试正式订阅页，返回 Cloudflare Access 登录页，工作区已关闭；未读取真实账本。Chrome 现有订阅标签位于个人浏览窗口，未操作。真实账本登录后画面、真机、国内网络及用户验收未验证。
