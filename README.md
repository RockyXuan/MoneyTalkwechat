# 记一笔 — 极简智能记账小程序

> 用最自然的方式记录每一笔消费：说句话、打几个字、甚至直接在微信里跟公众号聊一句，AI 自动识别金额、分类、日期，一键确认入账。

## 产品概览

| 特性 | 说明 |
|------|------|
| 智能记账 | 输入自然语言（如"午饭28 出租车15"），AI 自动解析为结构化记录 |
| 订阅管理 | 追踪周期性扣费（月/季/年），自动计算下次扣费日、累计已扣、年月日成本 |
| 自动/手动续费 | 区分自动续费和手动购买（如闲鱼代充），图标一目了然 |
| 微信公众号通道 | 绑定公众号后，在微信聊天中直接发消息记账，小程序内确认即可 |
| 多维度统计 | 按年/季度/月查看支出趋势、分类占比，点击分类可钻取明细 |
| 周期筛选 | 订阅支持按月/季/年筛选，快速查看不同周期的订阅支出 |

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Taro 4 + React 18 |
| 样式方案 | Tailwind CSS 4 + weapp-tailwindcss（rpx 适配） |
| 组件库 | shadcn/ui Taro 版（`@/components/ui/*`） |
| 图标 | lucide-react-taro |
| 状态管理 | Zustand |
| 后端框架 | NestJS 10 |
| 数据库 | Supabase (PostgreSQL) |
| AI 解析 | Coze AI 大模型 |
| 部署 | Coze 平台托管（前端 + 后端 + 数据库） |

## 页面结构

```
src/pages/
├── index/              # 记一笔（首页）
│   └── index.tsx       # 文字输入 + AI 解析 + 编辑弹窗 + 微信待确认
├── subscriptions/      # 订阅
│   └── index.tsx       # 订阅列表 + 创建/编辑 + 累计扣费 + 周期筛选
├── bills/              # 账单
│   └── index.tsx       # 月度账单列表 + 订阅事件 + 编辑弹窗
├── stats/              # 统计
│   └── index.tsx       # 年/季度/月趋势图 + 分类占比 + 钻取入口
├── profile/            # 我的
│   └── index.tsx       # 偏好设置 + 微信公众号绑定
└── category-detail/    # 分类详情（非 TabBar）
    └── index.tsx       # 某分类下的明细列表 + 编辑弹窗
```

## 后端模块

```
server/src/
├── app.module.ts           # 根模块（注册所有子模块）
├── main.ts                 # 入口（全局前缀 /api + XML 中间件）
├── expenses/               # 支出模块
│   ├── expenses.controller.ts   # CRUD + 统计接口
│   ├── expenses.service.ts      # 支出业务逻辑
│   ├── categories.controller.ts # 分类 CRUD
│   ├── categories.service.ts    # 分类逻辑
│   ├── preferences.controller.ts # 分类偏好映射
│   └── preferences.service.ts   # 偏好逻辑
├── subscriptions/          # 订阅模块
│   ├── subscriptions.controller.ts  # CRUD + 统计 + 计费事件
│   ├── subscriptions.service.ts     # 订阅逻辑 + 回溯计费
│   └── subscriptions.module.ts
├── ai/                     # AI 解析模块
│   ├── ai.controller.ts         # 解析入口
│   ├── ai.service.ts            # 支出解析 + 订阅解析 + billing_type 识别
│   └── ai.module.ts
└── wechat/                 # 微信公众号模块
    ├── wechat.controller.ts     # Webhook + 绑定 + 待确认记录
    ├── wechat.service.ts        # 消息处理 + AI 解析 + 绑定码
    └── wechat.module.ts
```

## API 接口一览

### 支出 /expenses

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/expenses` | 查询支出列表（支持日期范围、分类、分页） |
| POST | `/api/expenses` | 批量创建支出 |
| PATCH | `/api/expenses/:id` | 更新单条支出 |
| DELETE | `/api/expenses/:id` | 删除单条支出 |
| GET | `/api/expenses/stats` | 月度统计（总额、分类汇总、日趋势） |
| GET | `/api/expenses/stats-v2` | 多维度统计（年/季度/月） |

### 分类 /categories

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories` | 获取分类列表 |
| POST | `/api/categories` | 创建自定义分类 |

### 偏好 /preferences

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/preferences` | 保存分类映射偏好（用户纠正） |

### 订阅 /subscriptions

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/subscriptions` | 获取订阅列表 |
| POST | `/api/subscriptions` | 创建订阅（含 billing_type） |
| PATCH | `/api/subscriptions/:id` | 更新订阅（start_date/cycle 变更自动重算下次扣费日） |
| DELETE | `/api/subscriptions/:id` | 软删除订阅 |
| GET | `/api/subscriptions/stats` | 订阅成本统计（年/月/日 + 按分类） |
| GET | `/api/subscriptions/billing-events` | 获取指定时间范围的计费事件（用于账单页展示） |

### AI 解析 /ai

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/parse` | 解析支出文本（支持多条、默认日期） |
| POST | `/api/ai/parse-subscription` | 解析订阅文本（含 billing_type 自动识别） |

### 微信公众号 /wechat

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/wechat/webhook` | 微信服务器验证（SHA1 签名） |
| POST | `/api/wechat/webhook` | 接收微信消息（XML 解析 + 自动回复） |
| POST | `/api/wechat/binding-code` | 生成 6 位绑定码 |
| GET | `/api/wechat/binding-status` | 查询绑定状态 |
| GET | `/api/wechat/pending-records` | 获取待确认记录列表 |
| POST | `/api/wechat/pending-records/:id/confirm` | 确认待确认记录 |
| POST | `/api/wechat/pending-records/:id/reject` | 拒绝待确认记录 |
| GET | `/api/wechat/pending-count` | 获取待确认记录数量 |

## 数据库表结构

### expenses（支出记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | TEXT | 用户 ID |
| amount | NUMERIC | 金额 |
| category | TEXT | 分类 |
| tag | TEXT | 标签 |
| note | TEXT | 备注 |
| source_type | TEXT | 来源（text/wechat） |
| raw_text | TEXT | 原始输入文本 |
| expense_date | DATE | 消费日期 |
| created_at | TIMESTAMPTZ | 创建时间 |

### subscriptions（订阅）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | TEXT | 用户 ID |
| name | TEXT | 订阅名称 |
| amount | NUMERIC | 金额 |
| cycle | TEXT | 周期（monthly/quarterly/yearly/weekly） |
| category | TEXT | 分类 |
| start_date | DATE | 起始日期 |
| next_billing_date | DATE | 下次扣费日（自动计算） |
| description | TEXT | 描述 |
| billing_type | VARCHAR(20) | 续费方式（auto/manual，默认 auto） |
| is_active | BOOLEAN | 是否活跃 |
| created_at / updated_at | TIMESTAMPTZ | 时间戳 |

### categories（分类）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | TEXT | 用户 ID（NULL 为默认分类） |
| name | TEXT | 分类名 |
| icon | TEXT | 图标 |
| is_default | BOOLEAN | 是否默认 |
| sort_order | INT | 排序 |

### preferences（分类偏好映射）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | TEXT | 用户 ID |
| preference_type | TEXT | 偏好类型（category_mapping） |
| key_word | TEXT | 关键词 |
| mapped_value | TEXT | 映射值 |
| source | TEXT | 来源（user_correction） |
| created_at | TIMESTAMPTZ | 创建时间 |

### wechat_bindings（微信绑定）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | TEXT | 小程序用户 ID |
| wechat_openid | TEXT UNIQUE | 微信 openid |
| binding_code | TEXT UNIQUE | 6 位绑定码 |
| is_active | BOOLEAN | 是否活跃 |
| created_at / updated_at | TIMESTAMPTZ | 时间戳 |

### pending_records（待确认记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | TEXT | 用户 ID |
| source | TEXT | 来源（wechat_oa） |
| raw_text | TEXT | 原始消息文本 |
| record_type | TEXT | 类型（expense/subscription） |
| parsed_data | JSONB | AI 解析结果 |
| status | TEXT | 状态（pending/confirmed/rejected） |
| created_at | TIMESTAMPTZ | 创建时间 |
| confirmed_at | TIMESTAMPTZ | 确认时间 |

## 核心业务逻辑

### AI 解析流程

1. 用户输入自然语言文本
2. 调用 `/api/ai/parse` 或 `/api/ai/parse-subscription`
3. AI 识别：金额、分类、标签、日期、周期（订阅）、billing_type（订阅）
4. billing_type 识别规则：包含"闲鱼买""代充""找人买"等关键词 → manual，其余 → auto
5. 返回结构化结果，用户可在编辑弹窗中修正

### 订阅回溯计费

1. 创建/编辑订阅时指定 start_date 和 cycle
2. 账单页加载时调用 `/api/subscriptions/billing-events`，后端根据 start_date 推算所有历史扣费日期
3. 前端将计费事件与支出记录合并展示
4. 修改 start_date 或 cycle 时，后端自动重算 next_billing_date

### 累计扣费计算（前端）

```
calcTotalCharged(amount, cycle, startDate)
→ 根据 cycle 推算从 startDate 到今天共扣了几次
→ 返回 { count: 已扣次数, total: 累计金额 }
```

### 微信公众号记账流程

1. 用户在"我的"页面获取 6 位绑定码
2. 在微信公众号发送"绑定 123456"完成绑定
3. 之后在公众号发消息（如"午饭28"）
4. 后端 AI 解析 → 创建 pending_record → 自动回复解析结果
5. 用户在小程序"记一笔"页面查看待确认记录 → 确认/忽略

## 开发与构建

```bash
# 安装依赖
pnpm install

# 开发模式（前端 :5000 + 后端 :3000，热更新）
coze dev

# 类型检查 + ESLint
pnpm validate

# 构建
pnpm build          # 全平台
pnpm build:weapp    # 微信小程序
pnpm build:tt       # 抖音小程序
pnpm build:web      # H5
```

## 发布说明

- **AppID**: `wxa8ec50265729065c`（已配置于 `project.config.json`）
- **后端域名**: Coze 平台自动托管，通过 `PROJECT_DOMAIN` 环境变量注入
- **数据库**: Supabase 实例由 Coze 平台托管
- 微信小程序发布前需完成：备案 → 配置服务器域名 → 构建上传 → 体验版/正式版
