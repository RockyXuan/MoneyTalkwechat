import { Controller, Get, Post, Delete, Query, Body, Param, HttpCode } from '@nestjs/common'
import { CategoriesService } from './categories.service'

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @HttpCode(200)
  async list(@Query('user_id') userId: string) {
    console.log('GET /api/categories', { userId })
    const data = await this.categoriesService.list(userId)
    return { code: 200, msg: 'success', data }
  }

  @Post()
  @HttpCode(200)
  async create(@Body() body: { user_id: string; name: string; icon?: string }) {
    console.log('POST /api/categories', body)
    const data = await this.categoriesService.create(body)
    return { code: 200, msg: 'success', data }
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @Query('user_id') userId: string,
  ) {
    console.log('DELETE /api/categories/:id', { id, userId })
    await this.categoriesService.remove(id, userId)
    return { code: 200, msg: 'success', data: null }
  }
}
