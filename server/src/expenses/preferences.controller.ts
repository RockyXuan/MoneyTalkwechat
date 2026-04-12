import { Controller, Get, Post, Delete, Query, Body, Param, HttpCode } from '@nestjs/common'
import { PreferencesService } from './preferences.service'

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  @HttpCode(200)
  async list(@Query('user_id') userId: string) {
    console.log('GET /api/preferences', { userId })
    const data = await this.preferencesService.list(userId)
    return { code: 200, msg: 'success', data }
  }

  @Post()
  @HttpCode(200)
  async create(@Body() body: {
    user_id: string
    preference_type?: string
    key_word: string
    mapped_value: string
    source?: string
    confidence?: number
  }) {
    console.log('POST /api/preferences', body)
    const data = await this.preferencesService.create(body)
    return { code: 200, msg: 'success', data }
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @Body() body: { user_id: string },
  ) {
    console.log('DELETE /api/preferences/:id', { id, userId: body.user_id })
    await this.preferencesService.remove(id, body.user_id)
    return { code: 200, msg: 'success', data: null }
  }
}
