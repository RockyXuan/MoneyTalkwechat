import { Injectable } from '@nestjs/common'
import { getSupabaseClient } from '../storage/database/supabase-client'

@Injectable()
export class SubscriptionsService {
  private get supabase() {
    return getSupabaseClient()
  }

  async list(userId: string) {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('next_billing_date', { ascending: true })

    if (error) {
      console.error('获取订阅列表失败:', error)
      throw new Error('获取订阅列表失败')
    }
    return data
  }

  async create(body: { user_id: string; name: string; amount: number; cycle: string; category?: string; start_date?: string; next_billing_date?: string; description?: string }) {
    const startDate = body.start_date || new Date().toISOString().slice(0, 10)
    const nextBilling = body.next_billing_date || this.calcNextBilling(startDate, body.cycle)

    const { data, error } = await this.supabase
      .from('subscriptions')
      .insert({
        user_id: body.user_id,
        name: body.name,
        amount: body.amount,
        cycle: body.cycle,
        category: body.category || '订阅',
        start_date: startDate,
        next_billing_date: nextBilling,
        description: body.description || '',
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('创建订阅失败:', error)
      throw new Error('创建订阅失败')
    }
    return data
  }

  async update(id: string, body: { name?: string; amount?: number; cycle?: string; category?: string; start_date?: string; next_billing_date?: string; description?: string; is_active?: boolean }) {
    const updates: any = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name
    if (body.amount !== undefined) updates.amount = body.amount
    if (body.cycle !== undefined) updates.cycle = body.cycle
    if (body.category !== undefined) updates.category = body.category
    if (body.start_date !== undefined) updates.start_date = body.start_date
    if (body.next_billing_date !== undefined) updates.next_billing_date = body.next_billing_date
    if (body.description !== undefined) updates.description = body.description
    if (body.is_active !== undefined) updates.is_active = body.is_active

    const { data, error } = await this.supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('更新订阅失败:', error)
      throw new Error('更新订阅失败')
    }
    return data
  }

  async remove(id: string, userId: string) {
    // Soft delete
    const { data, error } = await this.supabase
      .from('subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('删除订阅失败:', error)
      throw new Error('删除订阅失败')
    }
    return data
  }

  /** Calculate annual/monthly/daily cost for a subscription */
  calcCosts(amount: number, cycle: string) {
    let yearly = 0
    switch (cycle) {
      case 'yearly':
        yearly = amount
        break
      case 'quarterly':
        yearly = amount * 4
        break
      case 'monthly':
        yearly = amount * 12
        break
      case 'weekly':
        yearly = amount * 52
        break
      default:
        yearly = amount * 12
    }
    return {
      yearly: Math.round(yearly * 100) / 100,
      monthly: Math.round((yearly / 12) * 100) / 100,
      daily: Math.round((yearly / 365) * 100) / 100,
    }
  }

  /** Get subscription cost summary for stats */
  async getSubscriptionStats(userId: string) {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('amount, cycle, category, name')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (error) {
      console.error('获取订阅统计失败:', error)
      throw new Error('获取订阅统计失败')
    }

    let totalYearly = 0
    let totalMonthly = 0
    let totalDaily = 0
    const byCategory: Record<string, { total_yearly: number; total_monthly: number; count: number; items: { name: string; amount: number; cycle: string; yearly: number; monthly: number }[] }> = {}

    data.forEach((item) => {
      const costs = this.calcCosts(Number(item.amount), item.cycle)
      totalYearly += costs.yearly
      totalMonthly += costs.monthly
      totalDaily += costs.daily

      const cat = item.category || '订阅'
      if (!byCategory[cat]) {
        byCategory[cat] = { total_yearly: 0, total_monthly: 0, count: 0, items: [] }
      }
      byCategory[cat].total_yearly += costs.yearly
      byCategory[cat].total_monthly += costs.monthly
      byCategory[cat].count += 1
      byCategory[cat].items.push({
        name: item.name,
        amount: Number(item.amount),
        cycle: item.cycle,
        yearly: costs.yearly,
        monthly: costs.monthly,
      })
    })

    return {
      total_yearly: Math.round(totalYearly * 100) / 100,
      total_monthly: Math.round(totalMonthly * 100) / 100,
      total_daily: Math.round(totalDaily * 100) / 100,
      subscription_count: data.length,
      by_category: byCategory,
    }
  }

  /** Calculate next billing date from a start date and cycle */
  private calcNextBilling(startDate: string, cycle: string): string {
    const start = new Date(startDate)
    const now = new Date()
    let next = new Date(start)

    switch (cycle) {
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1)
        while (next <= now) {
          next.setFullYear(next.getFullYear() + 1)
        }
        break
      case 'quarterly':
        next.setMonth(next.getMonth() + 3)
        while (next <= now) {
          next.setMonth(next.getMonth() + 3)
        }
        break
      case 'monthly':
        next.setMonth(next.getMonth() + 1)
        while (next <= now) {
          next.setMonth(next.getMonth() + 1)
        }
        break
      case 'weekly':
        next.setDate(next.getDate() + 7)
        while (next <= now) {
          next.setDate(next.getDate() + 7)
        }
        break
      default:
        next.setMonth(next.getMonth() + 1)
        while (next <= now) {
          next.setMonth(next.getMonth() + 1)
        }
    }

    return next.toISOString().slice(0, 10)
  }
}
