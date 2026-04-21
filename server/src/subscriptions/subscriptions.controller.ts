import { Controller, Get, Post, Patch, Delete, Body, Query, Param, HttpCode } from '@nestjs/common'
import { SubscriptionsService } from './subscriptions.service'

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subsService: SubscriptionsService) {}

  @Get()
  @HttpCode(200)
  async list(@Query('user_id') userId: string) {
    console.log('GET /api/subscriptions', { userId })
    const data = await this.subsService.list(userId)
    return { code: 200, msg: 'success', data }
  }

  @Get('stats')
  @HttpCode(200)
  async stats(@Query('user_id') userId: string) {
    console.log('GET /api/subscriptions/stats', { userId })
    const data = await this.subsService.getSubscriptionStats(userId)
    return { code: 200, msg: 'success', data }
  }

  @Get('billing-events')
  @HttpCode(200)
  async billingEvents(
    @Query('user_id') userId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    console.log('GET /api/subscriptions/billing-events', { userId, startDate, endDate })
    const data = await this.subsService.getBillingEvents(userId, startDate, endDate)
    return { code: 200, msg: 'success', data }
  }

  @Post()
  @HttpCode(200)
  async create(
    @Body() body: { user_id: string; name: string; amount: number; cycle: string; category?: string; start_date?: string; next_billing_date?: string; description?: string; billing_type?: string },
  ) {
    console.log('POST /api/subscriptions', body)
    const data = await this.subsService.create(body)
    return { code: 200, msg: 'success', data }
  }

  @Patch(':id')
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; amount?: number; cycle?: string; category?: string; start_date?: string; next_billing_date?: string; description?: string; is_active?: boolean; billing_type?: string },
  ) {
    console.log('PATCH /api/subscriptions/:id', { id, body })
    const data = await this.subsService.update(id, body)
    return { code: 200, msg: 'success', data }
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Query('user_id') userId: string) {
    console.log('DELETE /api/subscriptions/:id', { id, userId })
    const data = await this.subsService.remove(id, userId)
    return { code: 200, msg: 'success', data }
  }
}
