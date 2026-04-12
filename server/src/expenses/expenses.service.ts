import { Injectable } from '@nestjs/common'
import { getSupabaseClient } from '../storage/database/supabase-client'

@Injectable()
export class ExpensesService {
  private get supabase() {
    return getSupabaseClient()
  }

  async list(params: {
    userId: string
    startDate?: string
    endDate?: string
    category?: string
    limit: number
    offset: number
  }) {
    let query = this.supabase
      .from('expenses')
      .select('*')
      .eq('user_id', params.userId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (params.startDate) {
      query = query.gte('expense_date', params.startDate)
    }
    if (params.endDate) {
      query = query.lt('expense_date', params.endDate)
    }
    if (params.category) {
      query = query.eq('category', params.category)
    }
    if (params.limit) {
      query = query.limit(params.limit)
    }

    const { data, error } = await query
    if (error) {
      console.error('查询记账记录失败:', error)
      throw new Error('查询失败')
    }
    return data
  }

  async create(body: {
    user_id: string
    amount: number | null
    category: string
    tag?: string
    note?: string
    source_type?: string
    raw_text?: string
    expense_date: string
  }) {
    const { data, error } = await this.supabase
      .from('expenses')
      .insert({
        user_id: body.user_id,
        amount: body.amount ?? 0,
        category: body.category || '其他',
        tag: body.tag || null,
        note: body.note || null,
        source_type: body.source_type || 'text',
        raw_text: body.raw_text || null,
        expense_date: body.expense_date,
      })
      .select()
      .single()

    if (error) {
      console.error('创建记账记录失败:', error)
      throw new Error('创建失败')
    }
    return data
  }

  async remove(id: string, userId: string) {
    const { error } = await this.supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      console.error('删除记账记录失败:', error)
      throw new Error('删除失败')
    }
  }

  async stats(userId: string, month: string) {
    const startDate = `${month}-01`
    const [year, m] = month.split('-')
    const nextMonth = m === '12' ? `${Number(year) + 1}-01` : `${year}-${String(Number(m) + 1).padStart(2, '0')}`
    const endDate = `${nextMonth}-01`

    const { data, error } = await this.supabase
      .from('expenses')
      .select('amount, category, expense_date')
      .eq('user_id', userId)
      .gte('expense_date', startDate)
      .lt('expense_date', endDate)

    if (error) {
      console.error('获取统计失败:', error)
      throw new Error('获取统计失败')
    }

    let monthTotal = 0
    const categoryMap: Record<string, { total: number; count: number }> = {}
    const dailyMap: Record<string, number> = {}

    data.forEach((item) => {
      const amount = Number(item.amount)
      monthTotal += amount

      if (!categoryMap[item.category]) {
        categoryMap[item.category] = { total: 0, count: 0 }
      }
      categoryMap[item.category].total += amount
      categoryMap[item.category].count += 1

      if (!dailyMap[item.expense_date]) {
        dailyMap[item.expense_date] = 0
      }
      dailyMap[item.expense_date] += amount
    })

    const categories = Object.entries(categoryMap).map(([category, val]) => ({
      category,
      total: Math.round(val.total * 100) / 100,
      count: val.count,
    }))

    const daily = Object.entries(dailyMap)
      .map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      month_total: Math.round(monthTotal * 100) / 100,
      categories,
      daily,
    }
  }
}
