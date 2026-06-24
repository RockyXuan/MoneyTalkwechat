import { Injectable } from '@nestjs/common'
import { getSupabaseClient } from '../storage/database/supabase-client'

@Injectable()
export class PreferencesService {
  private get supabase() {
    return getSupabaseClient()
  }

  async list(userId: string) {
    const { data, error } = await this.supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .order('confidence', { ascending: false })

    if (error) {
      console.error('查询偏好失败:', error)
      throw new Error('查询失败')
    }
    return data
  }

  async create(body: {
    user_id: string
    preference_type?: string
    key_word: string
    mapped_value: string
    source?: string
    confidence?: number
  }) {
    // Upsert: if same user + key_word + preference_type exists, update it
    const { data: existing } = await this.supabase
      .from('user_preferences')
      .select('id, confidence')
      .eq('user_id', body.user_id)
      .eq('key_word', body.key_word)
      .eq('preference_type', body.preference_type || 'category_mapping')
      .maybeSingle()

    if (existing) {
      const newConfidence = body.source === 'user_correction' ? 100 : Math.min(existing.confidence + 10, 100)
      const { data, error } = await this.supabase
        .from('user_preferences')
        .update({
          mapped_value: body.mapped_value,
          source: body.source || 'user_correction',
          confidence: newConfidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('更新偏好失败:', error)
        throw new Error('更新失败')
      }
      return data
    }

    const { data, error } = await this.supabase
      .from('user_preferences')
      .insert({
        user_id: body.user_id,
        preference_type: body.preference_type || 'category_mapping',
        key_word: body.key_word,
        mapped_value: body.mapped_value,
        source: body.source || 'user_correction',
        confidence: body.confidence ?? 100,
      })
      .select()
      .single()

    if (error) {
      console.error('创建偏好失败:', error)
      throw new Error('创建失败')
    }
    return data
  }

  async remove(id: string, userId: string) {
    const { error } = await this.supabase
      .from('user_preferences')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('删除偏好失败:', error)
      throw new Error('删除失败')
    }
  }

  async getPreferenceContext(userId: string): Promise<string> {
    const { data } = await this.supabase
      .from('user_preferences')
      .select('key_word, mapped_value, preference_type')
      .eq('user_id', userId)
      .order('confidence', { ascending: false })
      .limit(20)

    if (!data || data.length === 0) return ''

    const lines = data.map((p) => {
      if (p.preference_type === 'category_mapping') {
        return `将"${p.key_word}"归为"${p.mapped_value}"`
      }
      return `"${p.key_word}"的标签为"${p.mapped_value}"`
    })
    return `该用户有以下分类偏好：${lines.join('；')}。请优先按此偏好分类。`
  }
}
