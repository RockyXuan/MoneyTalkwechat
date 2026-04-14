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
  _edited?: boolean
}

export interface CategoryItem {
  id: string
  user_id: string | null
  name: string
  icon: string | null
  is_default: boolean
  sort_order: number
}

interface ExpenseStore {
  // Data
  expenses: ExpenseRecord[]
  categories: CategoryItem[]
  isLoading: boolean
  // Bump this on every mutation (add/delete) so subscribers know to refresh
  dataVersion: number

  // Actions
  fetchExpenses: (limit?: number) => Promise<void>
  fetchExpensesByMonth: (startDate: string, endDate: string) => Promise<ExpenseRecord[]>
  addExpenses: (items: ParsedExpense[], rawText: string) => Promise<ExpenseRecord[]>
  updateExpense: (id: string, updates: Partial<ExpenseRecord>) => Promise<ExpenseRecord>
  deleteExpense: (id: string) => Promise<void>
  getStats: (month: string) => Promise<{
    month_total: number
    categories: { category: string; total: number; count: number }[]
    daily: { date: string; total: number }[]
  }>
  parseText: (text: string, defaultDate?: string) => Promise<ParsedExpense[]>
  fetchCategories: () => Promise<CategoryItem[]>
  createCategory: (name: string) => Promise<CategoryItem>
  savePreference: (keyWord: string, mappedValue: string) => Promise<void>
}

export const useExpenseStore = create<ExpenseStore>((set, get) => ({
  expenses: [],
  categories: [],
  isLoading: false,
  dataVersion: 0,

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
      // Bump version + refresh list
      set(state => ({ dataVersion: state.dataVersion + 1 }))
      get().fetchExpenses()
      return Array.isArray(data?.data) ? data.data : []
    } catch (err) {
      console.error('addExpenses error:', err)
      return []
    }
  },

  updateExpense: async (id: string, updates: Partial<ExpenseRecord>) => {
    try {
      const body: Record<string, any> = { user_id: DEFAULT_USER_ID }
      if (updates.amount !== undefined) body.amount = Number(updates.amount)
      if (updates.category !== undefined) body.category = updates.category
      if (updates.tag !== undefined) body.tag = updates.tag
      if (updates.note !== undefined) body.note = updates.note
      if (updates.expense_date !== undefined) body.expense_date = updates.expense_date

      const res = await Network.request({
        url: `/api/expenses/${id}`,
        method: 'PATCH',
        data: body,
      })
      console.log('store updateExpense:', res.data)
      const data = res.data as { code: number; msg: string; data: ExpenseRecord }
      set(state => ({ dataVersion: state.dataVersion + 1 }))
      return data?.data
    } catch (err) {
      console.error('updateExpense error:', err)
      throw err
    }
  },

  deleteExpense: async (id: string) => {
    try {
      await Network.request({
        url: `/api/expenses/${id}?user_id=${DEFAULT_USER_ID}`,
        method: 'DELETE',
      })
      console.log('store deleteExpense:', id)
      // Bump version + optimistically remove from local
      set(state => ({
        dataVersion: state.dataVersion + 1,
        expenses: state.expenses.filter(e => e.id !== id),
      }))
    } catch (err) {
      console.error('deleteExpense error:', err)
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

  parseText: async (text: string, defaultDate?: string) => {
    try {
      const res = await Network.request({
        url: '/api/ai/parse',
        method: 'POST',
        data: { text, user_id: DEFAULT_USER_ID, default_date: defaultDate },
      })
      console.log('store parseText:', res.data)
      const data = res.data as { code: number; msg: string; data: ParsedExpense[] }
      return Array.isArray(data?.data) ? data.data : []
    } catch (err) {
      console.error('parseText error:', err)
      return []
    }
  },

  fetchCategories: async () => {
    try {
      const res = await Network.request({
        url: `/api/categories?user_id=${DEFAULT_USER_ID}`,
      })
      console.log('store fetchCategories:', res.data)
      const data = res.data as { code: number; msg: string; data: CategoryItem[] }
      const cats = data?.data || []
      set({ categories: cats })
      return cats
    } catch (err) {
      console.error('fetchCategories error:', err)
      return []
    }
  },

  createCategory: async (name: string) => {
    try {
      const res = await Network.request({
        url: '/api/categories',
        method: 'POST',
        data: { user_id: DEFAULT_USER_ID, name },
      })
      console.log('store createCategory:', res.data)
      const data = res.data as { code: number; msg: string; data: CategoryItem }
      // Refresh categories list
      get().fetchCategories()
      return data?.data
    } catch (err) {
      console.error('createCategory error:', err)
      throw err
    }
  },

  savePreference: async (keyWord: string, mappedValue: string) => {
    try {
      await Network.request({
        url: '/api/preferences',
        method: 'POST',
        data: {
          user_id: DEFAULT_USER_ID,
          preference_type: 'category_mapping',
          key_word: keyWord,
          mapped_value: mappedValue,
          source: 'user_correction',
        },
      })
      console.log('store savePreference:', keyWord, '→', mappedValue)
    } catch (err) {
      console.error('savePreference error:', err)
    }
  },
}))
