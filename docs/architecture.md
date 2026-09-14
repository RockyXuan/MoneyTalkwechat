# HTML / Cloudflare 架构建议

状态：2026-09-14 交接草案，等待 Mac 详细设计；不是已部署架构。产品边界见 [PROJECT_BRIEF](../PROJECT_BRIEF.md)，代码问题见 [交接](mac-html-cloudflare-handoff.md)。

## 最小架构

电脑/手机浏览器 -> 同一响应式 HTML/CSS/JS -> 同域 /api -> Cloudflare Worker -> D1。

推荐 Workers Static Assets 托管静态页面，Worker 处理鉴权、校验和 API，D1 保存账本及分类。无需为了桌面和手机分别做后端。Cloudflare 官方支持同一 Worker 提供静态文件与 API；D1 使用 SQLite 语义：[Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[D1](https://developers.cloudflare.com/d1/)。

R2 只在需要保留音频、附件或私有导出备份时加入；普通静态资源可随应用托管。KV 不作为账本数据库，首轮不引入 Durable Objects、Queues 或 Vectorize。

## 身份与数据边界

建议个人/少量家人用 Cloudflare Access 的邮箱白名单和一次性验证码，避免自建短信或微信登录：[Access OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)。

API 仍需验证 Access JWT 的签名、issuer、audience、有效期；由验证后的身份映射用户和账本，不能信任客户端 user_id 或裸邮箱头。覆盖自定义域名及 API 路径，关闭或同样保护 workers.dev/预览旁路。参考 [JWT 校验](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)。

Access 负责谁能进入；谁能看哪个账本由应用负责。第一版建议单个拥有者，未来邀请家人再落地最小成员权限，不默认所有人共用 default_user。

## 数据草案

- entries：稳定 ID、ledger_id、amount_minor 整数分、currency、方向、category_id、发生日期、备注、状态、版本、创建/修改时间。
- categories：稳定 ID、账本归属、名称、排序、归档状态；改名不应割裂历史统计。
- drafts：来源文本和解析候选，与正式入账分开；缺金额/日期非法不能计入报表。
- 可选 preferences：可解释的分类纠错规则，先不做向量记忆。
- 可选 subscriptions / subscription_events：订阅计划、预计发生与已确认扣费要区分；不能每次打开报表重复入账。

金额转换、Asia/Shanghai 日期边界、重试幂等和编辑版本冲突应统一在服务端。小规模在线应用可先保存后重新查询；离线先支持草稿，暂不做离线自动合并。

## 从旧栈迁移

Taro 的 H5 输出是可参考的旧 Web 版本，不是原生 HTML 源码；DOM、输入框、导航和网络适配需要另行实现。建议新建独立 Web/Worker 目录，小步提取验证过的规则，目录名字由 Mac 决定。

NestJS 入口、Express 中间件和 Coze SDK 不应直接当作 Worker 可运行代码。将业务规则提取为普通函数，以 Worker 请求处理与 D1 查询替换旧适配层。Supabase 的 PostgreSQL schema、JSONB、默认 UUID、权限规则等需显式转换为 SQLite/D1 schema。

如果有真实旧账本，先导出和验证，再在测试 D1 导入；对照条数、金额、日期、分类和订阅，保留旧 ID 映射，禁止把订阅推算事件当作已支付记录直接导入。本次没访问旧数据库，不能假定数据为空或迁移已完成。

## AI 和可用性

优先在 Workers AI 试验中文文本解析；若恢复语音，可评估 [Whisper](https://developers.cloudflare.com/workers-ai/models/whisper/)。准确率、格式兼容、延迟、额度与费用需实测，不固定当前聊天模型为产品模型。若效果不足，先保留手动入口，外部模型作为后续需明确的例外。

浏览器录音需 HTTPS、权限处理和格式探测，Safari 与桌面浏览器不能假设使用同一编码；参见 [MediaRecorder.isTypeSupported](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)。

大陆实际网络应先测试站点、登录验证码、API 和 AI 的完整链路。普通 Cloudflare 部署不等于大陆节点服务；[China Network](https://developers.cloudflare.com/china-network/) 是独立的 Enterprise 订阅。这里不作连通性或永久免费保证。
