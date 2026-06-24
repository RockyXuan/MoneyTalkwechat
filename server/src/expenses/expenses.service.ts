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

  async create(body: any) {
    // Batch create: body.items is an array
    if (body.items && Array.isArray(body.items)) {
      const rows = body.items.map((item: any) => ({
        user_id: body.user_id,
        amount: item.amount ?? 0,
        category: item.category || '其他',
        tag: item.tag || null,
        note: item.note || null,
        source_type: body.source_type || 'text',
        raw_text: body.raw_text || null,
        expense_date: item.expense_date,
      }))
      const { data, error } = await this.supabase
        .from('expenses')
        .insert(rows)
        .select()
      if (error) {
        console.error('批量创建记账记录失败:', error)
        throw new Error('创建失败')
      }
      return data
    }

    // Single create
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

  async update(id: string, body: {
    user_id: string
    amount?: number
    category?: string
    tag?: string
    note?: string
    expense_date?: string
  }) {
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.amount !== undefined) updates.amount = body.amount
    if (body.category !== undefined) updates.category = body.category
    if (body.tag !== undefined) updates.tag = body.tag
    if (body.note !== undefined) updates.note = body.note
    if (body.expense_date !== undefined) updates.expense_date = body.expense_date

    const { data, error } = await this.supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .eq('user_id', body.user_id)
      .select()
      .single()

    if (error) {
      console.error('更新记账记录失败:', error)
      throw new Error('更新失败')
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

  async statsV2(userId: string, period: 'year' | 'quarter' | 'month', year: number, quarter?: number, month?: string) {
    // Determine date range based on period
    let startDate: string
    let endDate: string

    if (period === 'year') {
      startDate = `${year}-01-01`
      endDate = `${year + 1}-01-01`
    } else if (period === 'quarter') {
      const q = quarter || 1
      const startMonth = (q - 1) * 3 + 1
      const endMonth = startMonth + 3
      const endYear = endMonth > 12 ? year + 1 : year
      const adjustedEndMonth = endMonth > 12 ? endMonth - 12 : endMonth
      startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`
      endDate = `${endYear}-${String(adjustedEndMonth).padStart(2, '0')}-01`
    } else {
      // month
      const m = month || `${year}-01`
      startDate = `${m}-01`
      const [my, mm] = m.split('-')
      const nextMonth = mm === '12' ? `${Number(my) + 1}-01` : `${my}-${String(Number(mm) + 1).padStart(2, '0')}`
      endDate = `${nextMonth}-01`
    }

    // Fetch all expenses in the date range
    const { data, error } = await this.supabase
      .from('expenses')
      .select('amount, category, expense_date')
      .eq('user_id', userId)
      .gte('expense_date', startDate)
      .lt('expense_date', endDate)

    if (error) {
      console.error('获取统计v2失败:', error)
      throw new Error('获取统计失败')
    }

    let totalExpense = 0
    const categoryMap: Record<string, { total: number; count: number }> = {}

    // For year view: quarterly data; for quarter view: monthly data; for month view: daily data
    const periodMap: Record<string, number> = {}

    data.forEach((item) => {
      const amount = Number(item.amount)
      totalExpense += amount

      // Category aggregation
      if (!categoryMap[item.category]) {
        categoryMap[item.category] = { total: 0, count: 0 }
      }
      categoryMap[item.category].total += amount
      categoryMap[item.category].count += 1

      // Period aggregation
      let periodKey: string
      if (period === 'year') {
        const m = Number(item.expense_date.slice(5, 7))
        periodKey = `Q${Math.ceil(m / 3)}`
      } else if (period === 'quarter') {
        periodKey = item.expense_date.slice(0, 7) // YYYY-MM
      } else {
        periodKey = item.expense_date // full date
      }
      if (!periodMap[periodKey]) {
        periodMap[periodKey] = 0
      }
      periodMap[periodKey] += amount
    })

    const categories = Object.entries(categoryMap)
      .map(([category, val]) => ({
        category,
        total: Math.round(val.total * 100) / 100,
        count: val.count,
        percent: totalExpense > 0 ? Math.round(val.total / totalExpense * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    let trends: { label: string; total: number }[] = []

    if (period === 'year') {
      // Always show all 4 quarters
      trends = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({
        label: q,
        total: Math.round((periodMap[q] || 0) * 100) / 100,
      }))
    } else if (period === 'quarter') {
      // Show 3 months of the quarter
      const q = quarter || 1
      const startMonth = (q - 1) * 3 + 1
      trends = [0, 1, 2].map(i => {
        const m = startMonth + i
        const key = `${year}-${String(m).padStart(2, '0')}`
        return {
          label: `${m}月`,
          total: Math.round((periodMap[key] || 0) * 100) / 100,
        }
      })
    } else {
      // Daily for month
      trends = Object.entries(periodMap)
        .map(([date, total]) => ({ label: date.slice(8), total: Math.round(total * 100) / 100 }))
        .sort((a, b) => Number(a.label) - Number(b.label))
    }

    return {
      total_expense: Math.round(totalExpense * 100) / 100,
      categories,
      trends,
    }
  }
}
