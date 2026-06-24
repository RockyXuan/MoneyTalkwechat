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
  is_subscription?: boolean
  cycle?: string
  subscription_id?: string
  billing_type?: string
}

export interface ParsedSubscription {
  name: string
  amount: number | null
  cycle: 'monthly' | 'quarterly' | 'yearly'
  category: string
  description: string
  start_date?: string
  billing_type?: 'auto' | 'manual'
  _edited?: boolean
}

export interface SubscriptionRecord {
  id: string
  user_id: string
  name: string
  amount: number
  cycle: string
  category: string
  start_date: string
  next_billing_date: string
  description: string
  billing_type: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PendingRecord {
  id: string
  user_id: string
  source: string
  raw_text: string
  record_type: 'expense' | 'subscription'
  parsed_data: Record<string, any>
  status: 'pending' | 'confirmed' | 'rejected'
  created_at: string
  confirmed_at: string | null
  source_message_type?: 'text' | 'voice' | null
  source_openid?: string | null
  wechat_msg_id?: string | null
  wechat_media_id?: string | null
  media_format?: string | null
  media_object_key?: string | null
  media_content_type?: string | null
  media_size?: number | null
  transcription_source?: 'text' | 'wechat_recognition' | 'asr' | 'unavailable' | null
  source_payload?: Record<string, any> | null
  media_expires_at?: string | null
}

const normalizePendingRecord = (record: PendingRecord): PendingRecord => {
  const sourceMedia = record.parsed_data?._source_media || {}
  return {
    ...record,
    source_message_type: record.source_message_type ?? sourceMedia.source_message_type ?? null,
    source_openid: record.source_openid ?? sourceMedia.source_openid ?? null,
    wechat_msg_id: record.wechat_msg_id ?? sourceMedia.wechat_msg_id ?? null,
    wechat_media_id: record.wechat_media_id ?? sourceMedia.wechat_media_id ?? null,
    media_format: record.media_format ?? sourceMedia.media_format ?? null,
    media_object_key: record.media_object_key ?? sourceMedia.media_object_key ?? null,
    media_content_type: record.media_content_type ?? sourceMedia.media_content_type ?? null,
    media_size: record.media_size ?? sourceMedia.media_size ?? null,
    transcription_source: record.transcription_source ?? sourceMedia.transcription_source ?? null,
    source_payload: record.source_payload ?? sourceMedia.source_payload ?? null,
    media_expires_at: record.media_expires_at ?? sourceMedia.media_expires_at ?? null,
  }
}

interface WechatBindingStatus {
  bound: boolean
  openid?: string
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
  getStatsV2: (period: 'year' | 'quarter' | 'month', year: number, quarter?: number, month?: string) => Promise<{
    total_expense: number
    categories: { category: string; total: number; count: number; percent: number }[]
    trends: { label: string; total: number }[]
  }>
  parseText: (text: string, defaultDate?: string) => Promise<ParsedExpense[]>
  fetchCategories: () => Promise<CategoryItem[]>
  createCategory: (name: string) => Promise<CategoryItem>
  savePreference: (keyWord: string, mappedValue: string) => Promise<void>
  // Subscriptions
  fetchSubscriptions: () => Promise<SubscriptionRecord[]>
  createSubscription: (body: { name: string; amount: number; cycle: string; category?: string; start_date?: string; description?: string; billing_type?: string }) => Promise<SubscriptionRecord>
  updateSubscription: (id: string, body: Partial<SubscriptionRecord>) => Promise<SubscriptionRecord>
  deleteSubscription: (id: string) => Promise<void>
  parseSubscription: (text: string) => Promise<ParsedSubscription[]>
  getSubscriptionStats: () => Promise<{
    total_yearly: number
    total_monthly: number
    total_daily: number
    subscription_count: number
    by_category: Record<string, { total_yearly: number; total_monthly: number; count: number; items: { name: string; amount: number; cycle: string; yearly: number; monthly: number }[] }>
  }>
  fetchSubscriptionBillings: (startDate: string, endDate: string) => Promise<any[]>
  // WeChat binding & pending records
  generateBindingCode: () => Promise<{ binding_code?: string; bound?: boolean }>
  getWechatBindingStatus: () => Promise<WechatBindingStatus>
  fetchPendingRecords: () => Promise<PendingRecord[]>
  confirmPendingRecord: (id: string) => Promise<PendingRecord>
  rejectPendingRecord: (id: string) => Promise<void>
  getPendingCount: () => Promise<number>
  saveToInbox: (rawText: string, recordType: string, parsedData: Record<string, unknown>) => Promise<unknown>
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

  getStatsV2: async (period: 'year' | 'quarter' | 'month', year: number, quarter?: number, month?: string) => {
    try {
      let url = `/api/expenses/stats-v2?user_id=${DEFAULT_USER_ID}&period=${period}&year=${year}`
      if (quarter) url += `&quarter=${quarter}`
      if (month) url += `&month=${month}`
      const res = await Network.request({ url })
      console.log('store getStatsV2:', res.data)
      const data = res.data as { code: number; msg: string; data: any }
      return data?.data || { total_expense: 0, categories: [], trends: [] }
    } catch (err) {
      console.error('getStatsV2 error:', err)
      return { total_expense: 0, categories: [], trends: [] }
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

  // ─── Subscriptions ────────────────────────────────────
  fetchSubscriptions: async () => {
    try {
      const res = await Network.request({
        url: `/api/subscriptions?user_id=${DEFAULT_USER_ID}`,
      })
      console.log('store fetchSubscriptions:', res.data)
      const data = res.data as { code: number; msg: string; data: SubscriptionRecord[] }
      return data?.data || []
    } catch (err) {
      console.error('fetchSubscriptions error:', err)
      return []
    }
  },

  createSubscription: async (body) => {
    try {
      const res = await Network.request({
        url: '/api/subscriptions',
        method: 'POST',
        data: { user_id: DEFAULT_USER_ID, ...body },
      })
      console.log('store createSubscription:', res.data)
      const data = res.data as { code: number; msg: string; data: SubscriptionRecord }
      set(s => ({ dataVersion: s.dataVersion + 1 }))
      return data?.data
    } catch (err) {
      console.error('createSubscription error:', err)
      throw err
    }
  },

  updateSubscription: async (id, body) => {
    try {
      const res = await Network.request({
        url: `/api/subscriptions/${id}`,
        method: 'PATCH',
        data: body,
      })
      console.log('store updateSubscription:', res.data)
      const data = res.data as { code: number; msg: string; data: SubscriptionRecord }
      set(s => ({ dataVersion: s.dataVersion + 1 }))
      return data?.data
    } catch (err) {
      console.error('updateSubscription error:', err)
      throw err
    }
  },

  deleteSubscription: async (id) => {
    try {
      await Network.request({
        url: `/api/subscriptions/${id}?user_id=${DEFAULT_USER_ID}`,
        method: 'DELETE',
      })
      console.log('store deleteSubscription:', id)
      set(s => ({ dataVersion: s.dataVersion + 1 }))
    } catch (err) {
      console.error('deleteSubscription error:', err)
      throw err
    }
  },

  parseSubscription: async (text: string) => {
    try {
      const res = await Network.request({
        url: '/api/ai/parse-subscription',
        method: 'POST',
        data: { text, user_id: DEFAULT_USER_ID },
      })
      console.log('store parseSubscription:', res.data)
      const data = res.data as { code: number; msg: string; data: ParsedSubscription[] }
      return Array.isArray(data?.data) ? data.data : []
    } catch (err) {
      console.error('parseSubscription error:', err)
      return []
    }
  },

  getSubscriptionStats: async () => {
    try {
      const res = await Network.request({
        url: `/api/subscriptions/stats?user_id=${DEFAULT_USER_ID}`,
      })
      console.log('store getSubscriptionStats:', res.data)
      const data = res.data as { code: number; msg: string; data: any }
      return data?.data || { total_yearly: 0, total_monthly: 0, total_daily: 0, subscription_count: 0, by_category: {} }
    } catch (err) {
      console.error('getSubscriptionStats error:', err)
      return { total_yearly: 0, total_monthly: 0, total_daily: 0, subscription_count: 0, by_category: {} }
    }
  },

  fetchSubscriptionBillings: async (startDate: string, endDate: string) => {
    try {
      const res = await Network.request({
        url: `/api/subscriptions/billing-events?user_id=${DEFAULT_USER_ID}&start_date=${startDate}&end_date=${endDate}`,
      })
      console.log('store fetchSubscriptionBillings:', res.data)
      const data = res.data as { code: number; msg: string; data: any[] }
      return data?.data || []
    } catch (err) {
      console.error('fetchSubscriptionBillings error:', err)
      return []
    }
  },

  generateBindingCode: async () => {
    try {
      const res = await Network.request({
        url: '/api/wechat/binding-code',
        method: 'POST',
        data: { user_id: DEFAULT_USER_ID },
      })
      console.log('store generateBindingCode:', res.data)
      const data = res.data as { code: number; msg: string; data: { binding_code?: string; bound?: boolean } }
      return data?.data || {}
    } catch (err) {
      console.error('generateBindingCode error:', err)
      throw err
    }
  },

  getWechatBindingStatus: async () => {
    try {
      const res = await Network.request({
        url: `/api/wechat/binding-status?user_id=${DEFAULT_USER_ID}`,
      })
      console.log('store getWechatBindingStatus:', res.data)
      const data = res.data as { code: number; msg: string; data: WechatBindingStatus }
      return data?.data || { bound: false }
    } catch (err) {
      console.error('getWechatBindingStatus error:', err)
      return { bound: false }
    }
  },

  fetchPendingRecords: async () => {
    try {
      const res = await Network.request({
        url: `/api/wechat/pending-records?user_id=${DEFAULT_USER_ID}`,
      })
      console.log('store fetchPendingRecords:', res.data)
      const data = res.data as { code: number; msg: string; data: PendingRecord[] }
      return (data?.data || []).map(normalizePendingRecord)
    } catch (err) {
      console.error('fetchPendingRecords error:', err)
      return []
    }
  },

  confirmPendingRecord: async (id: string) => {
    try {
      const res = await Network.request({
        url: `/api/wechat/pending-records/${id}/confirm`,
        method: 'POST',
        data: { user_id: DEFAULT_USER_ID },
      })
      console.log('store confirmPendingRecord:', res.data)
      const data = res.data as { code: number; msg: string; data: PendingRecord }
      set(s => ({ dataVersion: s.dataVersion + 1 }))
      return data?.data
    } catch (err) {
      console.error('confirmPendingRecord error:', err)
      throw err
    }
  },

  rejectPendingRecord: async (id: string) => {
    try {
      await Network.request({
        url: `/api/wechat/pending-records/${id}/reject`,
        method: 'POST',
        data: { user_id: DEFAULT_USER_ID },
      })
      console.log('store rejectPendingRecord:', id)
    } catch (err) {
      console.error('rejectPendingRecord error:', err)
      throw err
    }
  },

  getPendingCount: async () => {
    try {
      const res = await Network.request({
        url: `/api/wechat/pending-count?user_id=${DEFAULT_USER_ID}`,
      })
      console.log('store getPendingCount:', res.data)
      const data = res.data as { code: number; msg: string; data: { count: number } }
      return data?.data?.count || 0
    } catch (err) {
      console.error('getPendingCount error:', err)
      return 0
    }
  },

  saveToInbox: async (rawText: string, recordType: string, parsedData: Record<string, unknown>) => {
    try {
      const res = await Network.request({
        url: '/api/wechat/save-to-inbox',
        method: 'POST',
        data: {
          user_id: DEFAULT_USER_ID,
          raw_text: rawText,
          record_type: recordType,
          parsed_data: parsedData,
        },
      })
      console.log('store saveToInbox:', res.data)
      return res.data
    } catch (err) {
      console.error('saveToInbox error:', err)
      throw err
    }
  },
}))
