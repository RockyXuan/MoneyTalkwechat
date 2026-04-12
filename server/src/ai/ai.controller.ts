import { Controller, Post, Body, HttpCode } from '@nestjs/common'
import { AiService } from './ai.service'

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('parse')
  @HttpCode(200)
  async parseExpense(@Body() body: { text: string; user_id: string; default_date?: string }) {
    console.log('POST /api/ai/parse', { text: body.text, userId: body.user_id, defaultDate: body.default_date })
    const data = await this.aiService.parseExpense(body.text, body.user_id, body.default_date)
    return { code: 200, msg: 'success', data }
  }
}
