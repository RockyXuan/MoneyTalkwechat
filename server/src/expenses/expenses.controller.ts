import { Controller, Get, Post, Patch, Delete, Query, Body, Param, HttpCode } from '@nestjs/common'
import { ExpensesService } from './expenses.service'

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @HttpCode(200)
  async list(
    @Query('user_id') userId: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    console.log('GET /api/expenses', { userId, startDate, endDate, category, limit, offset })
    const data = await this.expensesService.list({
      userId,
      startDate,
      endDate,
      category,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    })
    return { code: 200, msg: 'success', data }
  }

  @Get('stats')
  @HttpCode(200)
  async stats(
    @Query('user_id') userId: string,
    @Query('month') month: string,
  ) {
    console.log('GET /api/expenses/stats', { userId, month })
    const data = await this.expensesService.stats(userId, month)
    return { code: 200, msg: 'success', data }
  }

  @Get('stats-v2')
  @HttpCode(200)
  async statsV2(
    @Query('user_id') userId: string,
    @Query('period') period: 'year' | 'quarter' | 'month',
    @Query('year') year: string,
    @Query('quarter') quarter?: string,
    @Query('month') month?: string,
  ) {
    console.log('GET /api/expenses/stats-v2', { userId, period, year, quarter, month })
    const data = await this.expensesService.statsV2(userId, period, Number(year), quarter ? Number(quarter) : undefined, month)
    return { code: 200, msg: 'success', data }
  }

  @Post()
  @HttpCode(200)
  async create(@Body() body: {
    user_id: string
    amount: number | null
    category: string
    tag?: string
    note?: string
    source_type?: string
    raw_text?: string
    expense_date: string
  } | {
    user_id: string
    items: Array<{
      amount: number | null
      category: string
      tag?: string
      note?: string
      expense_date: string
    }>
    source_type?: string
    raw_text?: string
  }) {
    console.log('POST /api/expenses', body)
    const data = await this.expensesService.create(body)
    return { code: 200, msg: 'success', data }
  }

  @Patch(':id')
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @Body() body: {
      user_id: string
      amount?: number
      category?: string
      tag?: string
      note?: string
      expense_date?: string
    },
  ) {
    console.log('PATCH /api/expenses/:id', { id, ...body })
    const data = await this.expensesService.update(id, body)
    return { code: 200, msg: 'success', data }
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @Query('user_id') userId: string,
  ) {
    console.log('DELETE /api/expenses/:id', { id, userId })
    await this.expensesService.remove(id, userId)
    return { code: 200, msg: 'success', data: null }
  }
}
