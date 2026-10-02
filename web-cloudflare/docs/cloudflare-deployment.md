# Cloudflare 部署记录 · 2026-09-16

用户已授权将 MoneyTalk 发布到 Cloudflare，供手机和电脑网页登录。当前尚未完成公开使用验收。

**最新状态（2026-10-02）：已开放受保护的免费网址，桌面真实登录、保存、刷新读回、修改、删除和回收站恢复通过；真机与国内普通网络仍未验收。下方旧阶段状态保留为历史记录。**

## 已完成并验证

- 当前分支 codex/html-cloudflare-restart，原本地实现 760aa74；未覆盖旧代码或其他项目。
- 新建独立 D1：moneytalk-web-production（APAC），绑定 DB。
- 0001_ledger.sql、0002_restore_reuse.sql 已在真实远端应用成功。
- 远端只读核对：users=0、entries=0、migrations=2、validation_triggers=3。未上传本地账本。
- Worker moneytalk-web 已上传并回查当前版本 7e63f0c8-30c8-4d11-92fb-c12f0f8d1e1e。
- 生产 ENVIRONMENT=production；workers_dev=false、preview_urls=false；未设置本地身份绕过。
- 部署前 pnpm verify 通过，20/20 测试及构建通过；SQL 修正后再次运行 20/20 测试通过。

## 首次真实云端验证发现并修复的问题

本地 SQLite 可接受的触发器 SELECT CASE ... END 在 D1 远端迁移报 incomplete input。改为语义相同的 SELECT RAISE(...) WHERE 条件，并以独立大写 BEGIN/END 包围。保持金额类型与分类类型校验，未删除约束。此前远端迁移失败后只存在系统表；修正后两份迁移均成功，不存在部分建表残留。已有本地迁移不重置，现有触发器语义相同。

参考：https://github.com/cloudflare/workers-sdk/issues/4727

## 待完成

1. Cloudflare 控制台登录，检查现有 Zero Trust 组织与免费套餐。已有 Wrangler 授权可部署 Worker/D1，但未列出 Access 管理权限；独立 Ego Lite 任务空间 28 当前为控制台登录页。
2. 确认拥有者邮箱及公开网址；已向用户询问。默认建议本人邮箱白名单、邮箱验证码、优先免费网址，有已有域名可改用专门子域名。
3. 创建仅保护 MoneyTalk 的 Access 应用与本人允许策略，配置 ACCESS_TEAM_DOMAIN、ACCESS_AUD、OWNER_EMAIL，再开放目标网址。若启用 workers.dev，必须先确保同样受 Access 保护；预览网址保持关闭。
4. 核查当前账户套餐，不主动升级或购买。免费额度存在，不代表当前账户套餐已经核实。
5. 验证未登录拒绝访问、真实登录、手机页面、云端写入后刷新读回与可撤销操作，再完成真实手机/普通国内网络验收。

没有上线成功或跨设备同步验收结论；当前仅云端资源与代码准备完成。不要把本地测试结果视为正式登录或生产数据验证。

## 2026-10-02 接续

用户确认已在 Chrome 登录 Cloudflare，记账身份固定为 550754381zzx@gmail.com，并选择免费网址。无需重复询问身份或网址。

已复核 Wrangler 登录有效，Worker 当前版本仍为 7e63f0c8-30c8-4d11-92fb-c12f0f8d1e1e。Chrome 浏览器工具创建任务标签页超时，恢复连接与读取状态也超时；原生界面库存读取同样超时，尚未观察到控制台页面。之前 Ego Lite 空间 28 已不存在。用户登录成功与代理连接故障应分别处理，不应要求重新登录或宣布 Access 已配置。

当前继续点：恢复 Codex 浏览器连接后，在专用任务标签页读取控制台，检查 Zero Trust 套餐与组织，配置仅 MoneyTalk 的本人邮箱允许策略、Access 参数和免费网址，完成未登录拒绝访问及真实登录/云端读写验证。公网入口仍关闭。此接续未修改云端资源、未执行数据迁移。

### 2026-10-02 原生界面接续结果

Chrome 扩展接口仍报 nodeRepl.fetch 请求失败，但原生 CUA getApp(com.google.Chrome) 成功读取了用户已登录的控制台。在专用 Chrome 辅助窗口（非个人主窗口）打开 MoneyTalk Worker，确认 workers.dev 目标为 moneytalk-web.550754381zzx.workers.dev，当前仍 Disabled。Access 页显示账号尚未启用 Zero Trust。

已选择 Zero Trust Free 方案，进入最终激活确认页。该页显示 $0/month、最多 50 用户，同时要求接受服务条款和隐私政策，以及授权超过免费额度的月度扣费。两个复选框均未选中，Activate 未点击。用户需要亲自确认或改选方案；此前免费部署授权不等同于超额扣费授权。

继续点：用户完成该激活步骤后，回到 MoneyTalk Worker 配置仅本人 Gmail 的 Access 允许策略与服务端参数，最后开启免费网址并验证登录/云端读写。没有新增云端身份、公开入口或数据写入。确认页保留在辅助窗口，截图位于本任务 outputs/screenshots/cloudflare-free-activation-20261002.png。

### 2026-10-02 用户激活免费版后的配置准备

用户已手动激活。控制台确认 Zero Trust Free，组织为 blue-morning-ce9f；现有登录提供者为 Cloudflare。Workers plans 页面另行确认当前为 Free / $0，未点击 Upgrade。

已保存未关联任何已发布应用的规则 MoneyTalk owner only，Allow / Emails 精确匹配用户指定邮箱。规则 ID：8e1dc4d6-a7b3-482e-896e-5aa349cc8eca。应用创建表单已填写 MoneyTalk、完整 workers.dev 主机名和该规则，默认会话 24 小时。应用最终 Create 尚未点击：浏览器操作规则要求在实际授予账本访问权限时确认。公网入口、服务端 Access 参数及真实登录验收仍待完成，不得报告已上线。

后续需检查 Cloudflare 是否接受 workers.dev 作为 public hostname；如不接受，应改用页面 Add Workers 的官方绑定方式并复核 JWT 传递。不要因表单可填写就假设保护已生效。

费用核对：50 seats 按组织内用户身份统计，多个设备不是多个用户。Workers Free 为账号共享每日 100,000 次请求；D1 Free 每日 500 万行读取、10 万行写入、总 5 GB。D1 官方说明免费版超额返回错误，付费版超额才按用量计费。未启用额外付费服务。此阶段未写入账目。

### 2026-10-02 正式保护与发布结果

用户确认仅本人身份访问及开放免费网址后，正式创建应用成功：913bc454-71d6-4a43-a111-256caf2cc163。Public hostname 已被 Cloudflare 接受，范围为完整 moneytalk-web.550754381zzx.workers.dev，精确邮箱规则与默认 24 小时会话已关联；当前身份提供者为 Cloudflare。

三项服务端身份参数已通过 secret bulk 写入，随后 secret list 只核对名称。生产 `workers_dev=true`、`preview_urls=false`。本轮 `pnpm verify` 首次受沙箱回环端口权限限制失败，授权运行后 check、20/20 测试及 build 全部通过。正式发布版本为 4ee13a4c-8540-40fa-b569-a8258c02142d。

验证结果：

- 匿名普通浏览器标识请求 `/` 与 `/api/session` 均返回 302，跳转组织 Access 登录页。默认 Python 请求标识被 Cloudflare 1010 拒绝，未把该结果误判为 Access 成功。
- Chrome 专用辅助窗口实际访问免费网址显示 Log in to MoneyTalk，点击 Cloudflare 后利用已登录本人身份进入 `/stats`。
- `/settings` 显示正确拥有者身份、个人账本、人民币及上海时区；完整刷新后仍可加载。`/bills` 返回零条账目和空状态，未显示加载失败为零的情况。
- 远端独立只读查询确认 users=1、ledgers=1、entries=0；本人首次登录已初始化账户、账本与默认分类，无本地数据导入。
- 拟进行测试账目写入被自动审批拒绝：部署与保护授权不包含私人生产账本测试写入。未绕过；未填写或保存测试记录。需单独获得测试写入授权后，完成保存、刷新、修改、删除、恢复及统计对账。

尚未验证：生产写入流程、错误身份实际登录、双设备冲突、真机、国内普通网络、真实服务导出与恢复。云端上线与这些验收必须分开报告。

### 测试写入授权已补齐

用户明确回复“允许测试记账”，授权上述标注测试记录的新增、修改、删除与恢复，要求同类已授权简单操作不再重复确认。该授权继续有效。测试前远端只读核对 entries 总数仍为 0。

浏览器接续时，精确 MoneyTalk 标签页连接与浏览器库存接口均超时，CUA 会话重置。尚未写入测试记录。已请求用户仅将 MoneyTalk 辅助窗口切到前台，以便原生界面定位；这不是再次请求写入授权。不得读取无关私人项目或以数据库直接写入冒充完整页面验收。

### 2026-10-02 真实云端记账闭环验收

Chrome 后台连接持续超时后，改用 Ego Lite 独立空间。原空间 16 丢失，用户确认在 Ego Lite 登录并明确同意重建。重建空间 4「MoneyTalk 后台云端验收恢复」通过正常 Cloudflare 登录入口沿用现有身份，未再次输入凭据。整个记账验收复用 p1，未用 Mac 原生界面控制个人 Chrome。

- 页面保存「云端验收测试，可删除」餐饮支出 0.01 元，显示保存成功；刷新后账目与支出统计仍为 0.01 元。独立远端只读查询确认一条记录，amount_minor=1、version=1。
- 页面编辑为 0.02 元，刷新后账目及统计更新为 0.02 元。
- 页面确认移入回收站后，支出与有效账目归零。设置中的回收站显示同一条 0.02 元记录。
- 页面恢复后，统计重新显示 0.02 元；随后再次移入回收站，刷新确认空统计。
- 最终远端只读核对测试记录总数=1、有效数=0、amount_minor=2、version=5、in_trash=1；未产生重复记录，未永久清空回收站，未改动真实账目。

证据截图保存于本任务 outputs/screenshots/moneytalk-cloud-restored-20261002.png 与 moneytalk-cloud-clean-20261002.png。独立空间验收完成后关闭。没有修改应用功能或再次部署。

本次仅验证正常联网下的桌面单设备云端闭环。真机、国内普通网络、断网重试、连点提交、两设备冲突、错误身份实际登录、生产导出及备份恢复仍未验证。

### 2026-10-02 历史核对工具发布与只读验收

在现有 Worker、D1 和 Access 保护下发布只读核对入口，版本 `0bf64842-0880-4cd0-9549-e3a043fdbec0`；独立 `wrangler deployments list` 回读为 100% 当前版本。没有执行数据库迁移、新建账本、写入候选记录、修改访问名单或启用付费服务。

- 发布前完整 `pnpm verify` 通过：检查、33/33 测试及构建；`deploy:check` 指向现有 production D1，无本地身份绕过。
- 匿名 `/` 和 `/api/session` 均为 302，仍转到现有 Access 登录入口。
- Ego Lite 独立任务空间 11「MoneyTalk 历史核对与发布」复用 p1，利用现有已登录本人身份读取线上 `/settings`，新入口和虚构演示正常显示。
- 在页面实际选择虚构 AES ZIP、填写测试解压码并解压，候选消费为 1,231.50 元、退款证据 200 元、未拆清还款 245 元；故意坏金额标为文件异常。页面处理结束后解压码输入已清空。
- 线上实际下载并读取 JSON，格式 `moneytalk-bill-review`、`read_only=true` 和金额一致。此核对报告不是 MoneyTalk 恢复备份，不能从备份入口恢复。
- 未观察到运行异常；没有操作个人 Chrome、原生 Computer Use 或支付平台。截图为虚构数据，保存于本任务 `outputs/screenshots/moneytalk-cloud-history-review-20261002.png`。

已发布、桌面线上可操作，不等于真实历史同步完成。真实支付宝／微信文件变体、白条与两种月付消费明细、与既有手录匹配、自动取得附件、正式历史写入、真实 iPhone 文件选择与下载、国内网络仍未验证。
