import { Injectable } from '@nestjs/common'
import { LLMClient, Config } from 'coze-coding-dev-sdk'
import { PreferencesService } from '../expenses/preferences.service'

const SYSTEM_PROMPT = `你是一个智能记账助手。用户会说出自己的消费内容，你需要将其解析为结构化的记账数据。

## 输出格式（严格 JSON 数组，不要输出其他内容）
[
  {
    "amount": 数字（元），如果未提及金额则为 null,
    "category": "分类名（必须是下面分类列表中的一个）",
    "tag": "标签，如午餐/晚餐/通勤等，没有则为空字符串",
    "note": "简短名称，2-6个字",
    "expense_date": "YYYY-MM-DD",
    "confidence": 0到1之间的置信度
  }
]

## 默认分类
餐饮、交通、购物、日用品、娱乐、医疗、教育、居住、通讯、其他

## 关键分类映射规则（必须严格遵守）
- 外卖、早饭、早餐、午饭、午餐、晚饭、晚餐、夜宵、奶茶、咖啡、饮料、零食、水果、点心、团餐、食堂、聚餐、烧烤、火锅 → 全部归为"餐饮"
- 打车、地铁、公交、加油、停车、骑行、高铁、机票、火车 → 归为"交通"
- 日用品、卫生纸、洗衣液、牙膏 → 归为"日用品"
- 电费、水费、燃气、房租、物业 → 归为"居住"

## note 命名规则（非常重要）
- note 必须是极短的名称，2-6个字
- 不要把用户的整段话放进 note
- 提取核心消费项即可
- 示例：
  - "外卖30元" → note: "外卖"
  - "早饭吃了包子15块" → note: "早饭"
  - "晚上点了个外卖25元" → note: "晚饭"
  - "买了件衣服200" → note: "衣服"
  - "打车去公司20元" → note: "打车"
  - "给手机充值50" → note: "话费"

## 注意事项
1. 如果用户说了多笔消费，必须拆分为数组中的多个条目，每笔消费单独一条
2. 仔细计算每笔的金额，不要算错
3. 日期若未说明，使用系统提供的默认日期
4. 金额若未明确，设为 null
5. 优先使用用户偏好上下文中的分类映射
6. 只输出 JSON 数组，不要有任何其他文字

{USER_PREFERENCE_CONTEXT}`

@Injectable()
export class AiService {
  private llmClient: LLMClient

  constructor(private readonly preferencesService: PreferencesService) {
    const config = new Config()
    this.llmClient = new LLMClient(config)
  }

  async parseExpense(text: string, userId: string, defaultDate?: string) {
    const preferenceContext = await this.preferencesService.getPreferenceContext(userId)
    const today = new Date().toISOString().slice(0, 10)
    const effectiveDefaultDate = defaultDate || today

    const systemPrompt = SYSTEM_PROMPT
      .replace('{USER_PREFERENCE_CONTEXT}', preferenceContext || '（暂无用户偏好）')
      + `\n\n今天是 ${today}。默认日期为 ${effectiveDefaultDate}（如果用户没有提及具体日期，请使用默认日期 ${effectiveDefaultDate}）。`

    console.log('AI parse - user text:', text)

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: text },
      ]

      const response = await this.llmClient.invoke(messages, {
        model: 'doubao-seed-1-6-lite-251015',
        temperature: 0.3,
      })

      console.log('AI parse - response content:', response.content)

      // Try to extract JSON array from the answer
      const arrMatch = response.content.match(/\[[\s\S]*\]/)
      if (arrMatch) {
        const parsed = JSON.parse(arrMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => ({
            amount: item.amount ?? null,
            category: item.category || '其他',
            tag: item.tag || '',
            note: item.note || '',
            expense_date: item.expense_date || today,
            confidence: item.confidence ?? 0.8,
          }))
        }
      }

      // Try single object fallback
      const objMatch = response.content.match(/\{[\s\S]*\}/)
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0])
        return [{
          amount: parsed.amount ?? null,
          category: parsed.category || '其他',
          tag: parsed.tag || '',
          note: parsed.note || '',
          expense_date: parsed.expense_date || today,
          confidence: parsed.confidence ?? 0.8,
        }]
      }

      // Final fallback
      console.warn('AI returned non-JSON, fallback:', response.content)
      return [{
        amount: null,
        category: '其他',
        tag: '',
        note: text,
        expense_date: today,
        confidence: 0.3,
      }]
    } catch (err) {
      console.error('AI parse error:', err)
      return [{
        amount: null,
        category: '其他',
        tag: '',
        note: text,
        expense_date: today,
        confidence: 0.1,
      }]
    }
  }
}
