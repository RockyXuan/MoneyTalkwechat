# 接口契约

所有路径以 `/api` 开始。同源 JSON；由 Access 身份及服务器账本权限保护。本地显式开发模式只服务回环地址。

| 路径 | 行为 |
|---|---|
| GET /session | 当前身份、当前账本、拥有且 ready 的账本、上海今天 |
| POST /ledgers/:id/activate | 切换拥有且已完成校验的账本 |
| GET/POST /categories | 分类列表 / 创建分类 |
| PATCH /categories/:id | 以 version 更新分类 |
| GET /entries | 分页、全范围收支及按日小计 |
| GET /entries/:id | 单条详情 |
| POST /entries | 创建账目 |
| PATCH /entries/:id | 以 version 修改 |
| POST /entries/:id/delete、/restore | 以 version 软删除、恢复 |
| GET /operations/:key | 查询同一次提交是否已完成及原结果 |
| GET /stats | 完整期间收支、分类合计、时间桶×分类金额 |
| GET /export.csv | 当前筛选有效账目，忽略分页参数 |
| GET /backup | 完整 JSON 备份，含回收站 |
| POST /restores/preview | 只校验备份、返回摘要与汇总 |
| POST /restores | 建立/复用独立候选账本 |
| POST /restores/:id/entries | 每批至多 50 条，重复批次去重 |
| POST /restores/:id/finish | 核对完整内容并标记 ready，不自动切换 |

账目写入体：`type` 为 expense/income，`amount_minor` 为正整数分，`category_id`，`occurred_on` 为 YYYY-MM-DD，`note` 最长 200 字。修改另带 `version`。创建/修改/删除/恢复及分类写入携带 `Idempotency-Key`，16–100 位字母、数字、下划线或连字符。

`X-Ledger-Id` 只选择当前身份拥有的账本。禁止发送 user_id 作为权限依据。只返回属于所选账本的记录；无权访问账本 403，不存在/不属于账本的单条记录 404。版本冲突或复用提交标识但改变内容为 409。格式错误 400，未登录 401，未配置 503。错误形状为 `{error:{code,message}}`。

列表支持 `from/to/type/category_id/q/deleted/limit/offset`。limit 最大 100，页面每次 50。stats 支持 from/to 与 bucket=day/month，最长两年。statistics 汇总始终不受账单分页影响。

备份格式 moneytalk-backup v1，人民币和上海时区；分类包含稳定颜色、图标与停用状态，记录包含 ID、版本、创建/修改/删除时间。恢复完整摘要忽略 exported_at 与数组排序，保留每一条记录的内容。上限 20 MB、50,000 条、100 分类；大规模边界尚需压测。
