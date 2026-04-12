import { Injectable } from '@nestjs/common'
import { LLMClient, Config } from 'coze-coding-dev-sdk'
import { PreferencesService } from '../expenses/preferences.service'

const SYSTEM_PROMPT = `你是一个智能记账助手。用户会说出自己的消费内容，你需要将其解析为结构化的记账数据。

## 输出格式（严格 JSON，不要输出其他内容）
{
  "amount": 数字（元），如果未提及金额则为 null,
  "category": "分类名",
  "tag": "标签，如午餐/晚餐/通勤等，没有则为空字符串",
  "note": "简短备注",
  "expense_date": "YYYY-MM-DD",
  "confidence": 0到1之间的置信度
}

## 默认分类
餐饮、交通、购物、日用品、娱乐、医疗、教育、居住、通讯、其他

## 注意事项
1. 如果用户说了多个消费，只解析第一个，其余放在 note 中
2. 日期若未说明，默认为今天
3. 金额若未明确，设为 null
4. 优先使用用户偏好上下文中的分类映射

{USER_PREFERENCE_CONTEXT}`

@Injectable()
export class AiService {
  private llmClient: LLMClient

  constructor(private readonly preferencesService: PreferencesService) {
    const config = new Config()
    this.llmClient = new LLMClient(config)
  }

  async parseExpense(text: string, userId: string) {
    const preferenceContext = await this.preferencesService.getPreferenceContext(userId)
    const today = new Date().toISOString().slice(0, 10)

    const systemPrompt = SYSTEM_PROMPT
      .replace('{USER_PREFERENCE_CONTEXT}', preferenceContext || '（暂无用户偏好）')
      + `\n\n今天是 ${today}。`

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

      // Try to extract JSON from the answer
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          amount: parsed.amount ?? null,
          category: parsed.category || '其他',
          tag: parsed.tag || '',
          note: parsed.note || '',
          expense_date: parsed.expense_date || today,
          confidence: parsed.confidence ?? 0.8,
        }
      }

      // Fallback if JSON parsing fails
      console.warn('AI returned non-JSON, fallback:', response.content)
      return {
        amount: null,
        category: '其他',
        tag: '',
        note: text,
        expense_date: today,
        confidence: 0.3,
      }
    } catch (err) {
      console.error('AI parse error:', err)
      return {
        amount: null,
        category: '其他',
        tag: '',
        note: text,
        expense_date: today,
        confidence: 0.1,
      }
    }
  }
}
