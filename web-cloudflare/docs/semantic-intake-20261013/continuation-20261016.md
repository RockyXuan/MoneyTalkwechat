# 2026-10-16 免费理解层续测

## 范围与阶段结果

沿既有指定分支和 Cloudflare Free 继续，只发送固定虚构题目，不读取/上传真实账本，不升级、不使用付费模型、不创建凭据。正式网页仍为 [MoneyTalk](https://moneytalk-web.550754381zzx.workers.dev/record)。本次仅评测和准备，网站 AI 尚未启用，没有部署或生产写入。

本次开始时 Git 为干净的 `8f83a89ebd6ffee337aa1c6971c787923941f167`，origin 为 RockyXuan/MoneyTalkwechat，分支为 codex/html-cloudflare-restart。按要求读取 AGENTS 与 10 月 15 日交接。@Browser 再次超时，依第二顺位使用 Ego Lite 独立 Space126/p1，实际看到本账户 Free/$0/Current plan，留存当日截图和短期证明；未使用个人 Chrome。

## 真实尝试，逐版保留

| 版本与题 | 结果 | 验收解释 |
| --- | --- | --- |
| v10/full-core SEM01 | HTTP200、13.266秒，stop；JSON 括号错误；occurrence 错写字符串；原价减实付的金额含义也错误 | 拒绝，不补括号、不自动转类型、不修答案 |
| v10/full-core SEM25 | HTTP200、300.944秒，499277字节后 `$error: Error: Network connection lost.`；没有 finish/DONE/总用量 | 原始流与哈希保留，无可评分结果，满额保留未知预算，跨日也不擅自释放；未重发 |
| v11/full-core SEM01 | 官方 json_object 模式 + 独立虚构格式示范；HTTP200、54.534秒，有完整结束和用量；两笔实付与日期正确，但 ignored 少一层数组 | 原严格校验拒绝；仅格式正确不能算通过。短题已失败，不继续消耗该版长题；不混其他版本成绩 |
| v12/full-core SEM01 | 官方裸 json_schema、相同示范；HTTP200、122.395秒；原分和独立全字段复核通过 | 两笔金额4380/1990分、2026-10-12、淘宝和顺序正确；只算1题 |
| v12/full-core SEM25 | HTTP200、54.587秒；完整 stop/DONE/核对一致的用量；输出2510 token | 41笔逐项标题/整数分/分类/来源/日期/原序全部通过，首笔后文更正99分、总959分；不只核对合计 |

v12 最终完成21次核心调用；完整离线复核为17题通过、4题失败、4题未测，详见文末与机器进度。所有题仍使用固定 2026-10-13 日期锚点与原预期文件，没有按执行日改答案。SEM25 中第二件原名就是“商品丁”，没有把它改成“商品二”。

SEM01 仍有两条过度谨慎的问题文案（实付优惠差异、平台继承），事实正确但不是理想最终体验，作为体验质量观察保留，不能声称已达到网站输入体验。真实模型耗时是本地脚本全程，不冒充供应商纯推理时间。后续脚本增加响应头/首字节/末字节耗时与字节数，帮助区分等待与生成，不增加任何敏感日志；已经运行的请求不追填虚构时间。

## 官方能力与复用核实

继续复用已有 Zod、v10 固定数组协议、原整数分/日期/引用校验和 eventsource-parser。没有引入新 SDK、模型权重或供应商。v11/v12 只增加固定的虚构格式示范、官方输出参数；v12 把 schema 移到 response_format，避免在提示内外重复，同时预算计入 schema 全部字节。历史 v10/v11 请求逐项比对冻结文件相同，不改旧版本提示。

- [Cloudflare 当前价格](https://developers.cloudflare.com/workers-ai/platform/pricing/)仍为每日10000免费、UTC00:00重置；本脚本9500保护线不变，不代表整个账户真实剩余额度。
- [模型参数](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/)列出 response_format；[JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)的通用支持列表/流式限制与新模型页存在不同步，实际兼容性必须实测。本次 v11/v12 短题确实返回可核对 SSE，不把文档参数存在当质量保证。
- [Cloudflare 官方实现](https://github.com/cloudflare/ai/blob/main/packages/workers-ai-provider/src/utils.ts)明确原生 @cf 使用裸 JSON Schema，不能套合作模型的 name/schema/strict 外壳。本项目复用请求约定，未安装该 SDK，尤其不引入其自动非流式重发策略。
- [官方仓库问题16165](https://github.com/cloudflare/workers-sdk/issues/16165)有用户报告此 Qwen3.8 在部分 json_schema+low reasoning 组合超时，尚未完成官方复现；只是相关风险，不作为本次断流根因证明。本次仍明确请求非思考、不加low参数，未换模型或费用路线。

## 本机占位文件与漏测防护

Mac 本轮再次把源码、依赖、测试和 Git 对象标为 dataless。首次本地评测在 zod 配置读取失败，官方 Wrangler 预检在 undici 配置读取失败，均尚未发送推理；不能当成用户登录失效。完整读回已安装文件后，官方非交互 whoami/auth token 在内存恢复既有登录，始终禁凭据日志/度量，没有新建密钥。

按实际标记读回3411个现有依赖文件、256452006字节；另读回原生 TypeScript 工具/声明、83个评测脚本与虚构证据、31个测试/配置文件、Git对象（649个占位对象9798515字节及原包8844524字节）与1个网页静态资源。只是读取让系统下载，没有覆盖源文件、重装项目或更换依赖。初次 Git “pack太短”在完整读回现有 PACK 后恢复，未 reset/强行修复历史。

首次完整门禁前半通过147条基础/集成测试，但 E2E 只枚举82条：未读回的测试文件被工具当作空文件，不能验收。主动中断该轮，仅18条通过、1条被中断、63条未跑，清理未退出的本任务 CLI；日志 `/private/tmp/moneytalk-20261016-release.log` 和 `/private/tmp/moneytalk-20261016-incomplete-test-enumeration/` 保留。恢复后 `playwright test --list` 明确256条/11文件，不接受82条缩水成绩。随后从完整发布门禁重新执行，日志 `/private/tmp/moneytalk-20261016-release-complete-enumeration.log`，最终结果见文末。

## 继续条件

v12 已保留失败；下一免费日改测独立 v13/full-core，先验证已知回归，再长题，然后完成同一版本的25核心，不能借用 v12 成绩。已尝试不盲重发，未知预算不清零。核心全通过后继续 MESSY01–04、容量/跨段改口出口；之后才实现网站受保护候选确认链路。完整集成/Chromium/WebKit E2E 和发布后独立合成账本写读/清理通过才可发布 AI。真实输入启用需简短明确的数据发送说明，真实手机/国内网络另验。原自动心跳继续，无需用户重复说继续。

## 不消耗推理额度的下一步复用核查：手机可以离开页面

这轮真实短题4–122秒、长题约55秒（仅已测样本，不承诺延迟上限），网站不能让手机一直挂着白屏。继续沿原计划评估 Cloudflare Workflows，而非依靠 waitUntil：官方说明普通请求断开后只能额外执行约30秒，不能保证长模型完成。[Workers 执行限制](https://developers.cloudflare.com/workers/platform/limits/)

今日重新核实 [Workflows 价格](https://developers.cloudflare.com/workflows/reference/pricing/)和[限制](https://developers.cloudflare.com/workflows/reference/limits/)：Free 可用，共享100000请求/日、3000步骤/日、1GB-month状态；免费每步仍只有10ms CPU，非流式步骤返回上限1MiB，已完成状态默认保留3天。等待模型不计CPU，但解析/校验计入；不能因为桌面Node能解码就宣布免费Worker能跑。文档部分说明的10000并发是付费侧通用文字，采用表格明确Free100并发。未在本账户创建/部署Workflow，也没有确认本账户绑定开通能力。

后续质量通过后的最小接入应复用以下边界：入口只验身份并创建可恢复任务，手机可刷新后继续查看；模型只得到原文、日期锚点和必要分类。任务ID与账本/用户绑定，D1保存原文、请求版本与候选；最终账本仍通过已有绿色按钮确认产生。Free额度和未知结果统一预留，跨设备重复点击复用同一任务身份。完成结果长期留存在受保护D1草稿，不能把仅保留3天的Workflow状态当账本或用户唯一原文。

尤其注意 [官方重试默认值](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)是5次，不适合不确定是否执行过的模型调用：推理步骤必须显式不自动重试，持久记录“已发起”后再调用；进程恢复看到未知结果不能再次发送。只对已经确认完成、可重复读取/保存的步骤重试。还要实际验证流结果checkpoint、断线恢复、最多400项下的10ms CPU及状态体积，必要时拆有限步骤或保留明确容量出口，不悄悄升级付费、创建R2/队列或退回只适用于本机的方案。这些是研究与验收要求，尚未实现的网站能力。


## 最终全字段复核：v12 为17/21，不能按原金额评分算20/21

冻结25题原答案和完整审查文件，离线重放全部21份响应后：SEM01–11、SEM13、SEM16–19、SEM25通过；SEM12、SEM14、SEM15、SEM20失败；SEM21–24未调用。实际完整通过数 **17/21**，不是完整25题通过。早期日志里的PASS只来自原评分，遗漏以下字段，最终完整审查推翻该部分结论；原始模型数据/评分保持原样，不篡改为通过。

| 失败题 | 原评分 | 全字段实质问题 |
| --- | --- | --- |
| SEM12 | 通过 | 未说购买平台，source给了字符串unknown；协议应为null，不能让网站把unknown当一个平台名 |
| SEM14 | 通过 | 没说日期，三项却填了锚点当天2026-10-13；应保留2026-10月份，不能捏造日 |
| SEM15 | 通过 | 退回款项收入金额正确，但未说平台时同样给了字符串unknown，而非null |
| SEM20 | 失败 | 金额419900分正确，但标题只剩“手机”，把明确型号15与256GB放进问题，无法可靠接着看商品 |

因此不能只查金额，也不能拿本机校验加了疑问就视为正确。后续评测脚本已把独立完整审查纳入每次实际结果和PASS显示，缺少独立预期也不能显示完整通过。两个source失败属于空值协议错误，并非证实模型编造了某家购物平台；SEM14是未说日期时捏造当天，并非本轮检出跨平台月份继承失败。聊天中先前宽泛表述以此更正为准。

独立证据：[完整逐项复核](full-field-review-v12-20261016.json)、[各版本完整核心进度](morning-progress-20261016.json)。所有报告保留原请求/流SHA与同一组合，不拼版本。

SEM18 已收到完整HTTP200流、stop/DONE/用量，但本机模块再次变为空占位，首次本地解码TimeoutExpired。保留原transport_error，使用同一原始107801字节和SHA `5a3128b34f2a3ed294c50f0aef87425feb6771593af869bcc5409c8c67725182` 离线回放修正，增加offline_replay标记，没有重发推理。三项3500/2500/4000分及全字段通过。SEM19缺价杯子保持null，确定毛巾1000分，通过。不能把本机解码故障算模型答错，也不能把不完整v10网络流照此“修复”。

## v13仅离线准备，0次实测

继续同一固定Qwen3.8，保留v10–v12全部字节、严格校验和原预期，v13单独增加通用规则：标题保留型号/容量等规格；未说平台写null；未说日期用unspecified由程序仅取月份，不造当天；减少明确实付、继承平台等多余疑问。没有放入测试答案，没有自动从引文拼回遗漏标题，也没有更改已有数据。

25题请求已冻结指纹与最坏预留：[v13离线请求清单](v13-request-manifest-20261016.json)。这是0次模型调用的准备，不是证明修复成功。下一轮建议先SEM20，再SEM12/14/15已知失败，SEM25长题，然后SEM01和其余核心；全部使用v13/full-core同一组合。任何中断保留实际证据与预留，已尝试不盲重发。若版内失败，保留失败，继续安全修正时另建版本。

本日实际新增24次调用：v10两次、v11一次、v12二十一次。按现有保护计算 `8157.1407552063465 / 9500`，其中4112为v10长题未知用量的持续保守预留；剩余1342.8592，而v13最短核心请求最坏预留约1440，故没有发送第25次调用。此值是本评测器保守预算，不是账户实际账单或剩余免费额度。跨日保留未知预算，不通过改9500上限或释放未知预留强行续测。下一UTC日（上海08:00）重置后自动续做，无需用户继续口令。

## Mac文件仍占位：临时副本可继续，用户暂不用操作

Finder控制未正常返回且用户中断；未完成“保留下载”。用户明确暂不方便操作，后续不重复索要、不再控制Finder。采用项目已有纯评测模块、固定虚构题目与已安装zod/eventsource-parser的292文件临时副本，逐文件大小/SHA/读回检查，原仓库仍保存预算、证据、官方Wrangler认证。无数据库、凭据、环境文件、真实历史复制；不重装依赖，不换模型。不足磁盘空间只记录，不删除用户其他文件。

新增标准库封装 `scripts/evaluate-cloudflare-free-stable.py`：新建独立临时目录，完整读取现有模块和依赖，验证后只把本地生成请求/解码/评分放在副本执行。认证、模型URL、预算、固定运行标识、原响应仍由原评测器执行；check-only不读认证、不发网络。旧副本遇源码变化即拒绝，已实测；当前v13副本292文件校验通过，旧v12副本独立保留供历史回放。不能因临时副本存在就跳过源码一致性或借用旧提示。

下次从web-cloudflare执行（Node22 PATH已准备）：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -u scripts/evaluate-cloudflare-free-stable.py --check-only
# 先按浏览器顺序核实Free，保留一小时内证明，再使用同一版本；认证仅官方Wrangler
PYTHONDONTWRITEBYTECODE=1 python3 -u scripts/evaluate-cloudflare-free-stable.py --comparison --prompt v13 --run full-core SEM20 SEM12 SEM14 SEM15 SEM25 SEM01 SEM02 SEM03 SEM04 SEM05 SEM06 SEM07 SEM08 SEM09 SEM10 SEM11 SEM13 SEM16 SEM17 SEM18 SEM19 SEM21 SEM22 SEM23 SEM24
```

临时目录会清理/失效，路径不是永久依赖；封装默认生成并核实新副本。当前机器副本路径与SHA单独记录于execution-module-snapshot-v13-20261016.json，完整manifest在临时目录。切勿把临时副本的ROOT改作新的预算根目录，漏算其他版本调用。

## 本轮回归及发布边界

完整 `pnpm verify:release` 实际结束：检查/构建通过，148/148基础与接口集成、256/256 Chromium/WebKit E2E（各128）、49主操作/33文字操作覆盖均无缺项，失败/跳过/重试0；用时15.4分钟的E2E日志为 `/private/tmp/moneytalk-20261016-release-complete-enumeration.log`。首次82枚举的中断日志保留为未完成，不替代本轮。

之后仅评测工具与文档继续改动，新增型号/日期/来源失败回归、预算和原流协议测试在核实临时副本15/15通过（首次临时测试缺两份旧版本fixture失败，补回原文件并增加运行器原评分/完整审查差异回归后重跑15/15，未删测试）。最终源码检查与基础/集成复测另见acceptance-summary-20261016.json，不能把不同阶段计数混算。

4个运行JS/CSS的SHA与前次已验收版本相同；src/worker未导入语义评测模块，本次没有部署、迁移、生产账目读取/写入或模型网站链路。真实iPhone、国内普通网络、通用杂乱长段MESSY01–04、跨段修正与容量出口、Free后台CPU/状态均未验证。正式网页仍是原有已发布版本。Ego Lite复用Space126/p1核实Free；结束时finish已执行，随后只读listTaskSpaces返回[]，确认该Space关闭；未使用个人Chrome/Safari。


最终跟进：`pnpm check`通过；第一次全量测试受沙盒loopback EPERM阻挡，第二次允许端口后遇Workerd EPIPE，均保留失败日志，未宣称通过。完整读回156411272字节现有原生Workerd并核实临时副本SHA后，最终152/152基础及集成测试通过、0失败/跳过；日志 `/private/tmp/moneytalk-20261016-final-unit-integration-stable-workerd.log`。该次命令设置的WORKERD_BINARY_PATH并非Miniflare支持项（真正支持的是MINIFLARE_WORKERD_PATH）；成功来自原有工具已读回，不冒充环境变量生效，也不修改安装。复制原生工具SHA为 `3c3b245b344ea4b71b8f8e72fa9ae40eab25faae45b8daa55a06f358ad07ceaf`。后续使用副本路径时应使用实际支持项。

之后没有应用代码改变；4个dist运行资源实际重新SHA核对与完整E2E版本相同，因此未在纯评测脚本改动后重复256条UI。仍不能据此声称网站AI全链路通过或已上线。完整门禁148+256与后续152集成、15离线分层记录，不混计数。见 [机器验收摘要](acceptance-summary-20261016.json)。

测试完成后精确结束本任务额外的占位依赖读回Python进程（PID98649，先核实命令/cwd为当前web-cloudflare）；不继续无必要下载，没有结束其他项目进程。完成的模型调用、预算和测试记录均已保存。
