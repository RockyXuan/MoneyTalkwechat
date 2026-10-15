# 2026-10-15 免费理解层续测

## 结论与范围

今天的自动续做已经执行。v8短题逐项通过，但41笔长题仍被Cloudflare超时终止。改用官方支持的流式传输后，v9成功接到长题的明确结束回执，消除了原来的整包120秒断开；模型却因重复输出公共字段而用满11264输出token，finish_reason=length，仍不是完整结果。**完整核心、杂乱长段及网站AI链路均未通过，不发布AI，不写真实账本。**

v10紧凑协议复用既有Zod的[固定位置数组校验](https://zod.dev/api#tuples)、原候选协议及整数分/date处理，已准备并做离线边界验证，但没有真实模型成绩。它把每笔字段名称改成固定数组位置，组内公共字段只声明一次；金额、原文引用、分类、日期、循环和顺序仍展开后交给原有严格校验，不用部分结果拼接通过。

正式网页仍是已有版本：[MoneyTalk](https://moneytalk-web.550754381zzx.workers.dev/record)。本轮没有部署、没有添加生产AI绑定、没有修改D1或读取真实账本给模型。

## 实际请求与逐笔复核

全部题目仍来自固定虚构文件，日期锚点保持2026-10-13用于可比测试，未按执行当天改答案。每版独立记录，不拼成绩。

| 组合 | 题目 | 实际结果 | 验收含义 |
| --- | --- | --- | --- |
| v8分组、非流式 | SEM01 | HTTP200；总耗时102.169秒；报告324.390899658 Neurons | 原分数及独立逐项复核均通过：2笔实付、淘宝、昨天及原序正确；只算1题 |
| v8 | SEM25 | HTTP408；120.649秒；code3046 | 服务器明确终止，无可评分输出；不计答对或答错，当日全额预留4100 |
| v9，相同v8提示和语义，只改流式传输 | SEM01 | HTTP200；16.806秒；完整stop和DONE；报告324.390894204 Neurons | 首次适配器因分段用量而拒绝；保留原错误，按原始流离线修正、逐项复核通过，没有重发 |
| v9 | SEM25 | HTTP200；283.518秒；完整流结束，但finish_reason=length；11264输出token；报告3447.963531524 Neurons | 模型内容截断；现有完成门禁拒绝，计真实模型容量/完整性失败，不拼补部分JSON |

脚本seconds包含网络、传输解码与本地评分，不宣称都是供应商纯推理耗时。长题原始流4,780,271字节；模型在每笔重复分类、日期、single循环空字段并缩进，截断证据已保留，未放宽语义校验或改预期答案。v8实际测1题通过1题，另1个服务器失败；v9实际测2题通过1题、SEM25未通过；v10实际测0题。机器报告见[morning-progress-20261015.json](morning-progress-20261015.json)。

## 流式复用与安全接收

复用eventsource-parser **4.1.2**（开发依赖、固定锁文件），MIT，0运行依赖，官方npm解包97,258字节，发布时间2026-10-12。检查官方仓库维护与Security页、许可证、npm公开安全公告接口：本次查询未列出该版本公告，不等于不存在所有安全问题。未运行安装脚本，不添加SDK/权重，不增加前端包。证据来源：[官方仓库](https://github.com/rexxars/eventsource-parser)、[许可证](https://github.com/rexxars/eventsource-parser/blob/main/LICENSE)、[Security页](https://github.com/rexxars/eventsource-parser/security)、[固定npm版本](https://registry.npmjs.org/eventsource-parser/4.1.2)。

Cloudflare该原生端点实际每个片段都返回增量usage，最后另有`response:""`的总用量回执；不是只在最后一片回报。首版适配假设最后一次usage而报“流用量重复”，首次停止文字还误写“模型身份不符”；原错误保留，已将后续停止原因改为流协议错误。真实模型身份从头到尾都是固定Qwen3.8，没有换模型。

适配器第二版逐事件验证同一模型/请求、单一候选、不含工具/拒绝信息；逐段token严格求和与最终总回执相等，Neurons允许0.001浮点容差。必须看到结束原因及DONE，不接收半份结果；length保留真实模型身份和用量，但原完成校验拒绝。原始流base64与SHA保留，独立复核重新解码并对比规范响应，不只相信后补字段。SEM01的`stream_validation_error`仍保留，并增加明确标记的offline_replay（含版本、时间、原因）。没有修改原始流/请求哈希，也没有再次花额度取得同题通过。

传输原始流上限8MiB（含每token的元数据），每事件缓冲64KiB、事件20000、模型正文仍1MiB/400项；360秒墙钟保护与网络超时不构成成功证明。错误/未知结果仍保留最坏预算，无自动重试。额外请求身份、结束标识、用量不符、断流、工具调用和篡改均有负面测试。官方基础：[Cloudflare Qwen流式参数](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/)、[兼容端点](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)。

## 免费预算与下一窗口

通过Ego Lite Space39重新实际观察本账户Workers Free / $0 / Current plan，私有证明保存在临时目录；没有使用过期证明。@Browser控制台调用先超时，按第二顺位使用Ego，始终p1，完成后closedSpace=true。没有用个人Chrome、Safari或@Computer。

今日4次模型请求，3次有用量报告合计 **4096.745325387 Neurons**；1次服务器超时用量未知，保留4100最坏预留，加每个完成请求的取整余量，评测预算占用 **8199.745325387**。9,500保护线仅余1300.254674613，v10最短待测SEM01的最坏预留为1319，不能安全再调用。这个数字不是整个账户实际使用量或账户剩余量；不加额度、不升级、不把未知超时假定免费。官方每日免费10,000、UTC00:00（北京时间08:00）重置见[定价](https://developers.cloudflare.com/workers-ai/platform/pricing/)。

下一UTC日重新观察Free，官方非交互登录健康检查成功后，在同一`v10/full-core`运行下先SEM01、SEM25再其余核心。v8超时保留，v9明确截断保留，不再重发旧版本难题。v10只准备未实测，不能用离线边界测试作模型成绩。

```sh
export PATH=/Users/rockyx/.nvm/versions/node/v22.23.2/bin:$PATH
PYTHONDONTWRITEBYTECODE=1 python3 scripts/evaluate-cloudflare-free.py --comparison --prompt v10 --run full-core SEM01 SEM25 SEM02 SEM03 SEM04 SEM05 SEM06 SEM07 SEM08 SEM09 SEM10 SEM11 SEM12 SEM13 SEM14 SEM15 SEM16 SEM17 SEM18 SEM19 SEM20 SEM21 SEM22 SEM23 SEM24
```

全核心通过后才跑MESSY01–04、容量及跨段改口；之后才是保护的网站候选接入、真实模型网站链路、集成/E2E、发布和独立合成账本写读清理。真实iPhone/国内网络另验。任务尚未完成，心跳继续，每天08:15恢复，无需用户重复说继续。

## 本机开发环境与保留的失败

本轮首次官方Wrangler健康检查报spawn ENOEXEC，根因阶段是本机可执行工具启动，不能当登录过期或让用户重新登录。完整读取已安装的arm64 esbuild后直接`--version`及官方whoami成功，不新建凭据、不改登录或依赖版本；认证命令始终禁凭据日志/度量、非交互，现加60秒截止和仅输出允许名单错误类别，本地评分子进程也有截止。

测试随后分别遇到workerd ENOEXEC、D1模块为空、undici计时器缺导出及picomatch构建缺导出。实际stat显示依赖代码标记dataless（Mac仅云端占位），完整读回后恢复；按标记只读取已安装依赖代码，458文件/14,371,593字节，没有重装整个项目或覆盖源码。临时诊断使用`node --input-type=module -`还会把参数传给测试库的CommonJS worker线程，造成同步等待；已结束仅本任务的诊断进程，改用原`node --test`入口，复制/保存/读回定向1/1通过。不是产品新bug，不修改vendor源码，不隐藏首次失败。

保留日志：`/private/tmp/moneytalk-20261015-verify.log`（首次37个启动连带失败）、`moneytalk-20261015-release.log`（缺失模块连带失败）、`moneytalk-20261015-release-after-hydration.log`（137测试通过，构建仍缺picomatch导出）、`moneytalk-20261015-build-probe.log`（补齐后构建通过）。协议定向26/26通过；最终完整门禁结果见文末；不以中间通过替代。

## 全量回归发现的日期漂移：不是订阅重复写入

`moneytalk-20261015-final-release.log`首次完整结果为142/142单元/接口集成、254/256 E2E；两个失败都是同一TEXT08在Chromium/WebKit的运行。原UI测试从2026-09开始、每月15日持续扣1分，却把成功回执固定写为1笔。执行日已经是上海2026-10-15，实际UI回执2笔、日期2026-09-15与2026-10-15、合计2分，正符合业务规则，不能把正常10月记录删掉来满足旧断言。

仅修UI测试期望：读取服务器的Shanghai today，用独立日历公式计算已到期月份，并在服务器读回逐个核对真实保存日期、笔数和整数分合计，未减少或移除断言。补充固定边界：2026-10-14只应有9月15日一笔，2026-10-15应有9月15日/10月15日两笔。12/12日期单元测试与2/2双浏览器定向流程已通过；运行代码及模型25道固定预期文件均未修改。失败JSON、两引擎截图及trace先另存`/private/tmp/moneytalk-20261015-first-e2e-failures/`，再复测，未覆盖原失败证据。

最终全量重跑日志为`/private/tmp/moneytalk-20261015-release-verified-clock.log`，正式结果见下节。此前26项新协议定向测试全通过；本轮网页运行4个JS/CSS资源SHA与前一验收版本一致，没有上线或生产写入。


## 最终验收与保存出口

- 最终完整`pnpm verify:release`退出0：142/142基础及接口集成、256/256 E2E（Chromium128、WebKit128），失败/重试/跳过0；49个主页面操作、33个文字操作两引擎均无缺口。日志`/private/tmp/moneytalk-20261015-release-verified-clock.log`。
- 随后仅补强未被网站导入的评测预算/独立审查：再次`pnpm check && pnpm test`为**143/143**，最终构建通过。预算现在只对成功、固定模型和有限规范用量结算；失败HTTP200、空结构、非整数token、NaN/Infinity保持满额未知预留。27项协议/预算定向测试通过。
- 独立审查版本v2新增循环服务名、原序和明确分类，原模型核心/杂乱文件的raw、expected、日期锚点和分类上下文与原提交逐项比较相同，没有给模型发送审查答案。v8/v9原始响应继续回放，v10依然0题未测；[机器进度](morning-progress-20261015.json)重生成，不能以审查补强冒充新调用。
- 最终构建4个JS/CSS的SHA全部与前轮已验收运行资源一致；src/和worker/没有导入任何semantic实验模块。当前已有页面回归通过，不代表网站AI链路通过。未部署、未生产写入，真实iPhone/国内网络仍未验证。
- [机器验收摘要](acceptance-summary-20261015.json)保留最终命令、计数、首次失败原因、资源摘要及未验证边界。已有心跳moneytalk仍ACTIVE，时间08:15、目标仍本聊天，已改为读取本记录并续测v10，不新建重复任务。
