# 复用与依赖决定

复核了旧 `src/components/app/finance-ui.tsx`、页面、费用接口及 `server/src/storage/database/shared/schema.ts`。复用蓝白视觉、胶囊分类、导航名称和 expenses 的字段含义；旧平台容器、客户端用户 ID、空金额兜底、订阅自动入账、Coze/Supabase 适配不适合新边界，保留原文件而不移植运行依赖。

新目录不采用完整前端框架。Vite 仅构建原生模块；金额、日期和备份验证为必要的账本规则，没有重造图表或签名库。

| 依赖 | 锁定版本 | 选择原因与边界 |
|---|---|---|
| Chart.js | 4.5.1 | MIT，维护中的图表库；按需注册三种图形。统计由服务器完成，画布另补金额表 |
| Lucide | 1.45.0 | ISC，部分继承 Feather MIT；只引入用到的 SVG，不使用远端 CDN |
| Hono | 4.13.7 | MIT，Worker 原生请求路由、中间件；不带原 NestJS 平台层 |
| jose | 6.2.12 | MIT，RS256/JWKS 验证，避免自行实现签名校验 |
| Zod | 4.6.4 | MIT，API 与备份输入校验；留在服务器，前端只加载金额/日期格式函数 |
| csv-parse | 7.0.3 | MIT，无新增运行依赖；复用成熟 CSV 引号／列解析，核对页面按需加载 |
| @zip.js/zip.js | 2.22.0 | BSD-3-Clause，无新增运行依赖；原生压缩入口解密 ZIP，额外限制文件路径、数量与实际大小；不引入 WASM／外部 worker |

依赖来自 npm 正式包源，精确锁版本、保留 pnpm-lock.yaml。安装时禁用生命周期脚本。本轮运行依赖审计报告为 0 项已知公告；不等于绝对安全或未来无需更新。许可证全文保存在 public/licenses.txt，并随构建产物提供。

本轮参考了官方能力及上游代码/维护与安全页面：

- [Chart.js 集成](https://www.chartjs.org/docs/latest/getting-started/integration.html)、[可访问性](https://www.chartjs.org/docs/latest/general/accessibility.html)、[上游](https://github.com/chartjs/Chart.js)
- [Lucide](https://github.com/lucide-icons/lucide)、[许可证](https://github.com/lucide-icons/lucide/blob/main/LICENSE)
- [Hono](https://github.com/honojs/hono)、[jose](https://github.com/panva/jose)、[Zod](https://github.com/colinhacks/zod)
- [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[D1 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[Access 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

页面只向同源账本 API 请求数据，没有分析埋点、远端字体或第三方 AI 调用。生产 Worker 获取 Access 公钥属于身份验证边界，不会把账单发送给第三方模型。
