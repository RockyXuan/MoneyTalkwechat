import { Injectable } from '@nestjs/common'
import { getSupabaseClient } from '../storage/database/supabase-client'

@Injectable()
export class CategoriesService {
  private get supabase() {
    return getSupabaseClient()
  }

  async list(userId: string) {
    // Get default categories (user_id is null) + user's custom categories
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('查询分类失败:', error)
      throw new Error('查询失败')
    }
    return data
  }

  async create(body: { user_id: string; name: string; icon?: string }) {
    // Check if category already exists for this user
    const { data: existing } = await this.supabase
      .from('categories')
      .select('id')
      .eq('user_id', body.user_id)
      .eq('name', body.name)
      .maybeSingle()

    if (existing) {
      return existing
    }

    // Get max sort_order for this user's categories
    const { data: userCats } = await this.supabase
      .from('categories')
      .select('sort_order')
      .eq('user_id', body.user_id)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = (userCats?.[0]?.sort_order ?? 0) + 1

    const { data, error } = await this.supabase
      .from('categories')
      .insert({
        user_id: body.user_id,
        name: body.name,
        icon: body.icon || null,
        is_default: false,
        sort_order: nextOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('创建分类失败:', error)
      throw new Error('创建失败')
    }
    return data
  }

  async remove(id: string, userId: string) {
    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('删除分类失败:', error)
      throw new Error('删除失败')
    }
  }
}
