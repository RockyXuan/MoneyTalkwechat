# MoneyTalk 接手与续做交接 · 2026-10-17

> **最高优先级的新决定：用户要求“定时任务别跑了，上传 GitHub 做总结和交接”。本聊天的 `moneytalk` 自动任务已通过应用工具暂停并读回核实为 PAUSED。本轮只做交接，不运行模型、不实现功能、不部署。不因旧文档“下一免费日自动继续”而恢复任务。**

## 1. 五分钟读懂当前状态

- 先读 [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)：已有网页可用，任意杂乱长段的模型理解尚未接入。
- 正式网页：[MoneyTalk](https://moneytalk-web.550754381zzx.workers.dev/record)。暂停开发定时任务不关闭网页，不删除云端资源或账本。本次没有重新登录验收。
- 仓库：[RockyXuan/MoneyTalkwechat](https://github.com/RockyXuan/MoneyTalkwechat)，准确分支 **`codex/html-cloudflare-restart`**。
- Mac 仓库：`/Users/rockyx/Documents/Codex/MoneyTalk-web`；实际网页工程：其下 `web-cloudflare/`。
- 本次交接前代码提交：`66621b3e978843ba2ff528a766a932e04f1267e2`。本交接文档另成提交，接手时以远端分支最新提交核对；不要把代码基线当成文档提交号。
- 最初交接提交：`f2ad8a70cbb2b5cfa2968f282988e0d37a716e72`，来自独立历史。不要转去默认main、旧iOS仓库或合并无共同祖先的分支。

当前停止自动续做是用户选择，**不代表开发已完成，也不是额度仍未重置**。2026-10-17本次未发模型请求，v13实际调用仍为0。

## 2. 阅读顺序

1. 本文件、[项目总结](PROJECT_SUMMARY.md)、[AGENTS.md](AGENTS.md)。
2. [网页工程说明](web-cloudflare/README.md)、[产品主旨](PROJECT_BRIEF.md)、[架构](docs/architecture.md)。
3. [10月16日完整续测](web-cloudflare/docs/semantic-intake-20261013/continuation-20261016.md)、[机器验收摘要](web-cloudflare/docs/semantic-intake-20261013/acceptance-summary-20261016.json)。
4. [逐版本进度](web-cloudflare/docs/semantic-intake-20261013/morning-progress-20261016.json)、[v12完整审查](web-cloudflare/docs/semantic-intake-20261013/full-field-review-v12-20261016.json)、[v13固定请求清单](web-cloudflare/docs/semantic-intake-20261013/v13-request-manifest-20261016.json)。
5. 需要研究界面时再读 [竞品研究](web-cloudflare/docs/research-20261012/README.md)与各功能验收；需要了解最早来源再读 [Mac交接](docs/mac-html-cloudflare-handoff.md)。

历史文档中的“本轮”“下一步”和日期状态只代表当时记录。以本文件的暂停决定和后续用户明确要求为准。

## 3. 产品与协作约束

- 用户是产品经理视角，使用中文大白话。先说看得见的变化、完成与未完成，再讲必要技术原因。
- 三大原则：围绕用户真实任务、第一性原理选最小可靠方案、主动尝试破坏功能并保留失败证据。
- 复用优先：查已有代码和官方/开源能力，考虑许可证、维护、安全、体积、隐私；不为了架构好看而增加服务。
- 70%–80%操作在手机。上面查看、下面操作；建议平铺少点击，错误靠近确认按钮；图片直接内嵌聊天。
- 手机平台进度用已选B方案的六平台快捷切换；桌面各平台铺开，记账区靠左。
- 保留原口述顺序、首尾商品、连续确认边界和下一项；报过、候选、已入账要分清。同额不同次消费不能去重漏掉。
- 未说日仅记月份；未知起始月、金额不猜。模型只能提出候选，人确认后由原接口写入。
- 每次交付附正常网页链接；不把带令牌的认证跳转当入口。区分本地、模型实测、线上、真机、用户验收。
- 不反复询问例行许可。当前交接结束后等待用户发起新工作；若用户明确要求接手开发，可在既有边界内手动推进，但不自动恢复定时任务。

## 4. 代码位置与运行方式

| 位置 | 内容 |
| --- | --- |
| `web-cloudflare/src/app.js` | 主页面、四页导航、账单、统计与编辑 |
| `web-cloudflare/src/text-record-ui.js` | 文字/循环候选、核对和批次界面 |
| `web-cloudflare/worker/` | 身份、账本权限与API；不能相信客户端传入的用户身份 |
| `web-cloudflare/shared/` | 金额、日期、批次及候选校验；语义评测模块目前不被运行网页导入 |
| `web-cloudflare/migrations/` | D1迁移；不要因本机启动问题向远端应用迁移 |
| `web-cloudflare/tests/api.test.mjs` | 隔离D1的接口集成测试 |
| `web-cloudflare/tests/ui/` | Chromium/WebKit端到端测试 |
| `web-cloudflare/scripts/semantic-*.mjs` | 模型请求生成、流式解析、原评分和独立审查 |
| `web-cloudflare/scripts/evaluate-cloudflare-free*.py` | 官方免费评测器及经核对临时副本入口 |

固定 Node22.23.2、项目 pnpm11.19.0；优先用已安装依赖，锁文件不变。先检查Git，不覆盖未提交内容。

```sh
cd /Users/rockyx/Documents/Codex/MoneyTalk-web
git status --short
git remote -v
git branch --show-current
git log -3 --oneline
cd web-cloudflare
# 此Mac已有Node路径；其他机器按.nvmrc准备
export PATH=/Users/rockyx/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm dev
```

本地开发默认页面5173、Worker8787。localhost只在该Mac有效；手机日常使用正式云端网址。不要运行旧根目录多平台构建或kill-all脚本；不要删除 `.wrangler/` 修复启动，以免丢失本机数据。

## 5. 模型进度与恢复门槛

当前固定模型 `@cf/qwen/qwen3.8-27b`，只限Cloudflare Free与虚构题。不用付费模型、不升级、不外传真实历史。当前账户套餐/登录需要恢复评测时再按浏览器顺序核实，旧截图不作为永久有效证明。

- v12/full-core：21题实测、17完整通过；失败SEM12/14/15/20，未测SEM21–24。41笔SEM25长题逐项通过。不要写成20/21，也不要说25核心通过。
- v13/full-core：仅准备、0次实测。增加保留商品规格、未知来源空值、未指定日期按月份的通用规则；不改旧版本、原预期、原始流，不从证据里补造模型答案。
- 运行器现在同时看原评分和独立全字段审查。没有完整终止、身份一致、用量对齐或完整可核对输出时不能算通过。
- v10长题断流仍有4112保守未知预留；跨日不能擅自释放。10月16日8157.140755/9500是当天评测器的保护计算，**不是10月17日当前账户余额**。恢复时重新按UTC日计算，保留未知预留。
- 不混不同版本的通过题，不盲重发已尝试题；本版有失败时如需修提示/协议，另建版本独立评测。

只有用户重新要求继续开发后，才按以下顺序操作（不是当前自动待执行指令）：

1. 核实Git、最新进度、当前Free套餐和UTC日保护预算；凭据只用官方Wrangler非交互恢复，关闭凭据日志，不创建新密钥。
2. 验证当前v13请求指纹。先SEM20、SEM12、SEM14、SEM15回归，再SEM25长题、SEM01与其余核心；同一v13/full-core完成25题。
3. 核心全通过再测同版MESSY01–04、容量/跨段改口。50k字/400项是产品目标/现有基础存储边界，不是免费模型已验收的单次能力。
4. 理解质量过关再接网站任务→候选→逐条确认。真实输入启用前有简短明确发送说明；不能自动发送整本账目。
5. 研究过Cloudflare Workflows，但尚未实现或部署；需验证Free每步CPU、状态体积、恢复与预算。模型步骤禁止默认自动重试；不能依赖waitUntil保证长任务。
6. 完整集成和双引擎E2E通过后再发布；线上仅用独立虚构账本做写入/读回/清理，保护真实数据与当前账本选择。

## 6. Mac占位文件故障：不要重装、不要再逼用户操作Finder

本机源码、依赖、测试和Git对象会被macOS变成 `dataless` 云端占位。表现包括Node读空文件、ENOEXEC、模块错误、Git包太短、E2E只枚举82条而非256条。先按实际路径完整读回已有文件并检查大小；不要误判登录失效、reset仓库、覆盖源码或整项目重装。

`scripts/evaluate-cloudflare-free-stable.py --check-only` 可只准备并核对现有纯评测模块、固定虚构题和已安装解析依赖的临时副本，不认证、不推理。实际评测时原仓库仍负责凭据、预算和证据。源码与副本不一致要拒绝，不能借旧副本跑新版本。

临时路径与日志可能被系统清理，不能作为唯一交接资料或长期依赖。不要把数据库、环境文件、登录文件或真实历史复制到副本。用户先前暂不方便Finder“保留下载”，不要反复索要或继续盲控Finder。

Miniflare诊断用正常测试入口或.mjs文件，不用 `--input-type=module` 传给CommonJS子线程。需要指定已核对原生工具副本时，实际支持的变量是 `MINIFLARE_WORKERD_PATH`，不是旧记录中无效的 `WORKERD_BINARY_PATH`。

## 7. 测试与发布证据

最后记录在2026-10-16：完整门禁148项基础/集成+256项E2E通过；后续纯评测改动再测152项基础/集成、15项离线检查通过，运行资源哈希一致。详见 [机器摘要](web-cloudflare/docs/semantic-intake-20261013/acceptance-summary-20261016.json)。这不是10月17日重新跑过，也不代表模型网站整条流程通过。

未来用户说“测试”就包括集成与E2E。新增/修改功能上线前：

```sh
pnpm check
pnpm exec playwright test --list
pnpm verify:release
```

当前E2E基准256条/11文件，新增测试应增加而非因空文件缩水；Chromium/WebKit都要跑。端口被沙盒禁止属于环境失败，不能跳过集成；申请本机测试所需权限后重跑。测试仅用隔离本地数据库，不能改用户账本。文案交接变更只需链接、数据一致性、Git检查，不为交接再消耗模型额度或发布网站。

仍未验证：真实iPhone完整操作/键盘/文件控件/动效、国内普通网络、用户最终验收、模型网站全链路、长任务Free实际CPU/状态限制。本次没有访问生产账本，未重新查询线上版本。

## 8. 新线程启动提示词

把下面文字发给新线程即可，不必复制整段旧聊天；新线程先核实再行动：

> 接手 MoneyTalk。仓库 /Users/rockyx/Documents/Codex/MoneyTalk-web，远端 RockyXuan/MoneyTalkwechat，分支 codex/html-cloudflare-restart。先读根目录 HANDOFF.md、PROJECT_SUMMARY.md、AGENTS.md，再读其中列出的最新验收与模型进度，并核对Git。旧定时任务已按我要求暂停，不要自动恢复。网页现有功能与通用模型理解要分开；目前v12完整17/21通过，4失败4未测，v13仅准备0调用。先向我说明接手后实际核实的状态，再按我本次提出的目标继续；不要把旧历史“下一步”当成自动执行命令。继续使用大白话、三大原则、复用优先；测试包括集成和端到端，图片直接发聊天，交付附网页链接。不得覆盖真实数据、泄露密钥、恢复平台自动采集或使用付费模型。

如果下一步确实要继续模型测试，在新线程另加一句“继续免费模型理解评测”；如果先验收已有网页，就写“先检查现有网页与手机体验”。两者不应被接手者自行混为一项任务。
