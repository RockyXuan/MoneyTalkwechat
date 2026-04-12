import { create } from 'zustand'
import { Network } from '@/network'

const DEFAULT_USER_ID = 'default_user'

export interface ExpenseRecord {
  id: string
  amount: string
  category: string
  tag: string | null
  note: string | null
  source_type: string
  raw_text: string | null
  expense_date: string
  created_at: string
}

export interface ParsedExpense {
  amount: number | null
  category: string
  tag: string
  note: string
  expense_date: string
  confidence: number
  // Front-end editable fields
  _edited?: boolean
}

interface ExpenseStore {
  // Data
  expenses: ExpenseRecord[]
  isLoading: boolean

  // Actions
  fetchExpenses: (limit?: number) => Promise<void>
  fetchExpensesByMonth: (startDate: string, endDate: string) => Promise<ExpenseRecord[]>
  addExpenses: (items: ParsedExpense[], rawText: string) => Promise<ExpenseRecord[]>
  deleteExpense: (id: string) => Promise<void>
  getStats: (month: string) => Promise<{
    month_total: number
    categories: { category: string; total: number; count: number }[]
    daily: { date: string; total: number }[]
  }>
  parseText: (text: string) => Promise<ParsedExpense[]>
}

export const useExpenseStore = create<ExpenseStore>((set, get) => ({
  expenses: [],
  isLoading: false,

  fetchExpenses: async (limit = 20) => {
    set({ isLoading: true })
    try {
      const res = await Network.request({
        url: `/api/expenses?user_id=${DEFAULT_USER_ID}&limit=${limit}`,
      })
      console.log('store fetchExpenses:', res.data)
      const data = res.data as { code: number; msg: string; data: ExpenseRecord[] }
      if (data?.data) {
        set({ expenses: data.data })
      }
    } catch (err) {
      console.error('fetchExpenses error:', err)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchExpensesByMonth: async (startDate: string, endDate: string) => {
    try {
      const res = await Network.request({
        url: `/api/expenses?user_id=${DEFAULT_USER_ID}&start_date=${startDate}&end_date=${endDate}&limit=500`,
      })
      console.log('store fetchExpensesByMonth:', res.data)
      const data = res.data as { code: number; msg: string; data: ExpenseRecord[] }
      return data?.data || []
    } catch (err) {
      console.error('fetchExpensesByMonth error:', err)
      return []
    }
  },

  addExpenses: async (items: ParsedExpense[], rawText: string) => {
    try {
      const res = await Network.request({
        url: '/api/expenses',
        method: 'POST',
        data: {
          user_id: DEFAULT_USER_ID,
          items: items.map(item => ({
            amount: item.amount,
            category: item.category,
            tag: item.tag,
            note: item.note,
            expense_date: item.expense_date,
          })),
          source_type: 'text',
          raw_text: rawText,
        },
      })
      console.log('store addExpenses:', res.data)
      const data = res.data as { code: number; msg: string; data: ExpenseRecord[] }
      // Refresh list after add
      get().fetchExpenses()
      return Array.isArray(data?.data) ? data.data : []
    } catch (err) {
      console.error('addExpenses error:', err)
      return []
    }
  },

  deleteExpense: async (id: string) => {
    try {
      await Network.request({
        url: `/api/expenses/${id}`,
        method: 'DELETE',
        data: { user_id: DEFAULT_USER_ID },
      })
      console.log('store deleteExpense:', id)
      // Optimistic update: remove from local state immediately
      set(state => ({
        expenses: state.expenses.filter(e => e.id !== id),
      }))
    } catch (err) {
      console.error('deleteExpense error:', err)
      // Re-fetch on error to ensure consistency
      get().fetchExpenses()
    }
  },

  getStats: async (month: string) => {
    try {
      const res = await Network.request({
        url: `/api/expenses/stats?user_id=${DEFAULT_USER_ID}&month=${month}`,
      })
      console.log('store getStats:', res.data)
      const data = res.data as { code: number; msg: string; data: any }
      return data?.data || { month_total: 0, categories: [], daily: [] }
    } catch (err) {
      console.error('getStats error:', err)
      return { month_total: 0, categories: [], daily: [] }
    }
  },

  parseText: async (text: string) => {
    try {
      const res = await Network.request({
        url: '/api/ai/parse',
        method: 'POST',
        data: { text, user_id: DEFAULT_USER_ID },
      })
      console.log('store parseText:', res.data)
      const data = res.data as { code: number; msg: string; data: ParsedExpense[] }
      return Array.isArray(data?.data) ? data.data : []
    } catch (err) {
      console.error('parseText error:', err)
      return []
    }
  },
}))
