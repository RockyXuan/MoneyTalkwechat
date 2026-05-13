import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Button } from '@/components/ui/button'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader, PenLine, X, Pencil, Calendar, Plus, Search, MessageCircle, Smartphone, Check, Trash2, ChevronDown, Inbox, Sparkles, TrendingUp } from 'lucide-react-taro'
import { useExpenseStore, ParsedExpense, PendingRecord } from '@/store/expense-store'

const IndexPage = () => {
  const [inputText, setInputText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedResults, setParsedResults] = useState<ParsedExpense[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  // Edit modal state
  const [editNote, setEditNote] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editTag, setEditTag] = useState('')
  const [editDate, setEditDate] = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [showCatInput, setShowCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // Date mode
  const [dateMode, setDateMode] = useState<'today' | 'month'>('today')
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Inbox
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([])
  const [showInbox, setShowInbox] = useState(false)

  // Today's summary
  const [todayTotal, setTodayTotal] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)

  const { addExpenses, categories, fetchCategories, createCategory, savePreference,
    fetchPendingRecords, confirmPendingRecord, rejectPendingRecord, createSubscription } = useExpenseStore()

  useEffect(() => {
    fetchCategories()
    loadPendingRecords()
    loadTodaySummary()
  }, [])

  const loadTodaySummary = async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10)
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonth = now.getMonth() === 11
        ? `${now.getFullYear() + 1}-01-01`
        : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`

      const [todayData, monthData] = await Promise.all([
        useExpenseStore.getState().fetchExpensesByMonth(todayStr, `${todayStr}T23:59:59`),
        useExpenseStore.getState().fetchExpensesByMonth(monthStart, nextMonth),
      ])
      const todaySum = todayData.reduce((s, e) => s + (Number(e.amount) || 0), 0)
      const monthSum = monthData.reduce((s, e) => s + (Number(e.amount) || 0), 0)
      setTodayTotal(todaySum)
      setMonthTotal(monthSum)
    } catch (err) {
      console.error('loadTodaySummary error:', err)
    }
  }

  const loadPendingRecords = async () => {
    try {
      const records = await fetchPendingRecords()
      setPendingRecords(records)
      if (records.length > 0) setShowInbox(true)
    } catch (err) {
      console.error('loadPendingRecords error:', err)
    }
  }

  const handleConfirmPending = async (record: PendingRecord) => {
    try {
      const confirmed = await confirmPendingRecord(record.id)
      if (record.record_type === 'subscription') {
        const pd = confirmed.parsed_data || {}
        await createSubscription({
          name: pd.name || record.raw_text,
          amount: pd.amount || 0,
          cycle: pd.cycle || 'monthly',
          category: pd.category || '订阅',
          start_date: pd.start_date || new Date().toISOString().slice(0, 10),
          description: pd.description || '',
          billing_type: pd.billing_type || 'auto',
        })
      } else {
        const pd = confirmed.parsed_data || {}
        await addExpenses([{
          note: pd.note || record.raw_text,
          amount: pd.amount || 0,
          category: pd.category || '其他',
          tag: pd.tag || null,
          expense_date: pd.expense_date || new Date().toISOString().slice(0, 10),
          confidence: pd.confidence || 0.5,
        }], record.raw_text)
      }
      Taro.showToast({ title: '已确认', icon: 'success' })
      loadPendingRecords()
      loadTodaySummary()
    } catch (err) {
      console.error('confirmPending error:', err)
      Taro.showToast({ title: '确认失败', icon: 'none' })
    }
  }

  const handleRejectPending = async (id: string) => {
    try {
      await rejectPendingRecord(id)
      Taro.showToast({ title: '已删除', icon: 'success' })
      loadPendingRecords()
    } catch (err) {
      console.error('rejectPending error:', err)
    }
  }

  const handleConfirmAll = async () => {
    for (const record of pendingRecords) {
      try { await handleConfirmPending(record) } catch (e) { console.error('confirm all error:', e) }
    }
    loadPendingRecords()
  }

  const handleClearInbox = async () => {
    for (const record of pendingRecords) {
      try { await rejectPendingRecord(record.id) } catch (e) { console.error('clear inbox error:', e) }
    }
    setPendingRecords([])
    Taro.showToast({ title: '已清空', icon: 'success' })
  }

  const getDefaultDate = () => dateMode === 'month' ? `${selectedMonth}-01` : selectedDate

  const handleParse = async () => {
    if (!inputText.trim()) {
      Taro.showToast({ title: '请输入消费内容', icon: 'none' })
      return
    }
    setIsParsing(true)
    try {
      const defaultDate = getDefaultDate()
      const results = await useExpenseStore.getState().parseText(inputText, defaultDate)
      if (results.length > 0) {
        const adjusted = results.map(r => {
          if (dateMode === 'month') {
            const dayMatch = r.expense_date?.match(/(\d{4})-(\d{2})-(\d{2})/)
            if (dayMatch) return { ...r, expense_date: `${selectedMonth}-${dayMatch[3]}` }
            return { ...r, expense_date: `${selectedMonth}-01` }
          }
          return r
        })
        setParsedResults(prev => [...prev, ...adjusted])
      } else {
        Taro.showToast({ title: '未识别到消费信息', icon: 'none' })
      }
    } catch (err) {
      console.error('解析失败', err)
      Taro.showToast({ title: '解析失败，请重试', icon: 'none' })
    } finally {
      setIsParsing(false)
    }
  }

  const handleSave = async () => {
    if (parsedResults.length === 0) return
    setIsSaving(true)
    try {
      await addExpenses(parsedResults, inputText)
      for (const r of parsedResults) {
        if (r._edited && r.category && r.note) savePreference(r.note, r.category)
      }
      Taro.showToast({ title: `成功保存 ${parsedResults.length} 笔`, icon: 'success' })
      setParsedResults([])
      setInputText('')
      setEditingIdx(null)
      loadTodaySummary()
    } catch (err) {
      console.error('保存失败', err)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveResult = (idx: number) => {
    setParsedResults(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSaveToInbox = async (idx: number) => {
    const item = parsedResults[idx]
    if (!item) return
    try {
      const rawText = `${item.note || item.category} ${item.amount || 0}`
      await useExpenseStore.getState().saveToInbox(rawText, 'expense', item as unknown as Record<string, unknown>)
      handleRemoveResult(idx)
      Taro.showToast({ title: '已存入收集箱', icon: 'success' })
      fetchPendingRecords()
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'error' })
    }
  }

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    try {
      await createCategory(newCatName.trim())
      setEditCategory(newCatName.trim())
      setNewCatName('')
      setShowCatInput(false)
      Taro.showToast({ title: '分类已添加', icon: 'success' })
    } catch (err) {
      console.error('创建分类失败', err)
    }
  }

  const openEditModal = (idx: number) => {
    const item = parsedResults[idx]
    setEditingIdx(idx)
    setEditNote(item.note || '')
    setEditAmount(item.amount != null ? String(item.amount) : '')
    setEditCategory(item.category || '其他')
    setEditTag(item.tag || '')
    setEditDate(item.expense_date || new Date().toISOString().slice(0, 10))
    setCatSearch('')
    setShowCatInput(false)
    setNewCatName('')
  }

  const closeEditModal = () => setEditingIdx(null)

  const handleSaveEdit = () => {
    if (editingIdx === null) return
    const updated = [...parsedResults]
    updated[editingIdx] = {
      ...updated[editingIdx],
      note: editNote,
      amount: editAmount ? Number(editAmount) : null,
      category: editCategory,
      tag: editTag,
      expense_date: editDate,
      _edited: true,
    }
    setParsedResults(updated)
    setEditingIdx(null)
    Taro.showToast({ title: '已更新', icon: 'success' })
  }

  const totalParsedAmount = parsedResults.reduce((sum, r) => sum + (r.amount || 0), 0)
  const filteredCategories = categories.filter(c => !catSearch || c.name.includes(catSearch))

  const formatTime = (isoStr: string) => {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const todayLabel = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })

  return (
    <View className="h-full flex flex-col" style={{ backgroundColor: '#F7F8FA' }}>
      <ScrollView scrollY className="flex-1">
        {/* Gradient Header Card */}
        <View
          className="mx-4 mt-4 rounded-2xl p-5"
          style={{
            background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
          }}
        >
          <View className="flex flex-row items-center justify-between mb-4">
            <View>
              <Text className="block text-white text-lg font-semibold opacity-90">{todayLabel}</Text>
              <Text className="block text-white text-2xl font-bold mt-1">记一笔</Text>
            </View>
            {pendingRecords.length > 0 && (
              <View
                className="flex flex-row items-center gap-1 bg-white bg-opacity-20 rounded-full px-3 py-1"
                onClick={() => setShowInbox(!showInbox)}
              >
                <Inbox size={14} color="#fff" />
                <Text className="text-white text-xs">{pendingRecords.length} 待确认</Text>
                <ChevronDown size={12} color="#fff" className={showInbox ? 'rotate-180' : ''} />
              </View>
            )}
          </View>
          <View className="flex flex-row gap-4">
            <View className="flex-1 bg-white bg-opacity-15 rounded-xl p-3">
              <Text className="block text-white text-xs opacity-75">今日支出</Text>
              <Text className="block text-white text-xl font-bold mt-1">¥{todayTotal.toFixed(2)}</Text>
            </View>
            <View className="flex-1 bg-white bg-opacity-15 rounded-xl p-3">
              <Text className="block text-white text-xs opacity-75">本月支出</Text>
              <Text className="block text-white text-xl font-bold mt-1">¥{monthTotal.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Inbox (收集箱) */}
        {showInbox && (
          <View className="mx-4 mt-3">
            <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <View className="flex flex-row items-center gap-2 mb-3">
                <Inbox size={16} color="#2563EB" />
                <Text className="block text-sm font-semibold text-foreground">收集箱</Text>
                <Text className="block text-xs text-muted-foreground">来自公众号和小程序的待确认记录</Text>
              </View>
              {pendingRecords.length > 0 ? (
                <>
                  {pendingRecords.map(record => {
                    const pd = record.parsed_data || {}
                    const isSub = record.record_type === 'subscription'
                    const isFromWechat = record.source === 'wechat_oa'
                    return (
                      <View key={record.id} className="border-b border-border pb-3 mb-3 last:border-b-0 last:mb-0 last:pb-0">
                        {/* Source + type */}
                        <View className="flex flex-row items-center gap-2 mb-2">
                          {isFromWechat ? (
                            <View className="flex flex-row items-center gap-1 bg-blue-50 rounded-full px-2 py-1">
                              <MessageCircle size={10} color="#2563EB" />
                              <Text className="text-xs text-primary">公众号</Text>
                            </View>
                          ) : (
                            <View className="flex flex-row items-center gap-1 bg-green-50 rounded-full px-2 py-1">
                              <Smartphone size={10} color="#22C55E" />
                              <Text className="text-xs text-green-600">小程序</Text>
                            </View>
                          )}
                          <View className="bg-purple-50 rounded-full px-2 py-1">
                            <Text className="text-xs text-purple-600">{isSub ? '订阅' : '支出'}</Text>
                          </View>
                          <Text className="block text-xs text-muted-foreground ml-auto">{formatTime(record.created_at)}</Text>
                        </View>
                        {/* Name + amount */}
                        <View className="flex flex-row items-center justify-between mb-2">
                          <Text className="block text-sm font-medium text-foreground truncate" style={{ maxWidth: '65%' }}>
                            {pd.note || pd.name || record.raw_text}
                          </Text>
                          <Text className="block text-base font-bold text-amber-500 flex-shrink-0">
                            {pd.amount != null ? `¥${pd.amount}` : '金额待定'}
                          </Text>
                        </View>
                        {record.raw_text && (pd.note || pd.name) && record.raw_text !== (pd.note || pd.name) && (
                          <Text className="block text-xs text-muted-foreground mb-2 truncate">&ldquo;{record.raw_text}&rdquo;</Text>
                        )}
                        <View className="flex flex-row items-center gap-2 mb-2">
                          <View className="bg-slate-100 rounded-full px-2 py-1">
                            <Text className="text-xs text-slate-600">{pd.category || '未分类'}</Text>
                          </View>
                          {isSub && (
                            <View className="bg-slate-100 rounded-full px-2 py-1">
                              <Text className="text-xs text-slate-600">{pd.cycle === 'monthly' ? '每月' : pd.cycle === 'quarterly' ? '每季度' : pd.cycle === 'yearly' ? '每年' : pd.cycle}</Text>
                            </View>
                          )}
                        </View>
                        <View className="flex flex-row gap-2">
                          <View style={{ flex: 1 }}>
                            <Button className="w-full bg-green-500 text-white rounded-xl text-xs" onClick={() => handleConfirmPending(record)}>
                              <View className="flex flex-row items-center justify-center gap-1">
                                <Check size={12} color="#fff" />
                                <Text className="text-white text-xs">确认</Text>
                              </View>
                            </Button>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button className="w-full bg-white border border-slate-200 text-slate-500 rounded-xl text-xs" onClick={() => handleRejectPending(record.id)}>
                              <View className="flex flex-row items-center justify-center gap-1">
                                <X size={12} color="#94A3B8" />
                                <Text className="text-xs text-slate-500">删除</Text>
                              </View>
                            </Button>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                  <View className="flex flex-row gap-2 mt-3">
                    <View style={{ flex: 1 }}>
                      <Button className="w-full bg-green-500 text-white rounded-xl" onClick={handleConfirmAll}>
                        <View className="flex flex-row items-center justify-center gap-1">
                          <Check size={14} color="#fff" />
                          <Text className="text-white text-xs">全部确认</Text>
                        </View>
                      </Button>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button className="w-full bg-white border border-red-200 text-red-500 rounded-xl" onClick={handleClearInbox}>
                        <View className="flex flex-row items-center justify-center gap-1">
                          <Trash2 size={14} color="#EF4444" />
                          <Text className="text-xs text-red-500">清空</Text>
                        </View>
                      </Button>
                    </View>
                  </View>
                </>
              ) : (
                <View className="flex flex-col items-center justify-center py-6">
                  <Inbox size={28} color="#CBD5E1" />
                  <Text className="block text-sm text-muted-foreground mt-2">收集箱空空如也</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Date Selector */}
        <View className="mx-4 mt-3">
          <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <View className="flex flex-row items-center gap-3">
              <Calendar size={18} color="#2563EB" />
              <View className="flex flex-row bg-slate-100 rounded-xl p-1">
                <View
                  className={`px-3 py-1 rounded-lg ${dateMode === 'today' ? 'bg-white' : ''}`}
                  style={dateMode === 'today' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } : {}}
                  onClick={() => setDateMode('today')}
                >
                  <Text className={`block text-xs ${dateMode === 'today' ? 'text-primary font-medium' : 'text-slate-400'}`}>
                    按日期
                  </Text>
                </View>
                <View
                  className={`px-3 py-1 rounded-lg ${dateMode === 'month' ? 'bg-white' : ''}`}
                  style={dateMode === 'month' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } : {}}
                  onClick={() => setDateMode('month')}
                >
                  <Text className={`block text-xs ${dateMode === 'month' ? 'text-primary font-medium' : 'text-slate-400'}`}>
                    按月份
                  </Text>
                </View>
              </View>
              {dateMode === 'today' ? (
                <Picker mode="date" value={selectedDate} onChange={(e) => setSelectedDate(e.detail.value)}>
                  <View className="px-3 py-1 bg-blue-50 rounded-lg">
                    <Text className="block text-sm text-primary font-medium">{selectedDate}</Text>
                  </View>
                </Picker>
              ) : (
                <Picker
                  mode="date" fields="month" value={`${selectedMonth}-01`}
                  onChange={(e) => { const val = e.detail.value as string; setSelectedMonth(val.slice(0, 7)) }}
                >
                  <View className="px-3 py-1 bg-blue-50 rounded-lg">
                    <Text className="block text-sm text-primary font-medium">{selectedMonth}</Text>
                  </View>
                </Picker>
              )}
            </View>
            {dateMode === 'month' && (
              <Text className="block text-xs text-muted-foreground mt-2">
                按月模式：所有记录将记入 {selectedMonth}，无需重复说日期
              </Text>
            )}
          </View>
        </View>

        {/* Input Area */}
        <View className="mx-4 mt-3">
          <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <View className="flex flex-row items-center gap-2 mb-3">
              <Sparkles size={16} color="#2563EB" />
              <Text className="block text-sm font-semibold text-foreground">智能记账</Text>
            </View>
            <View className="bg-slate-50 rounded-xl p-3">
              <Textarea
                style={{ width: '100%', minHeight: '72px', backgroundColor: 'transparent', fontSize: '15px', lineHeight: '22px', color: '#1E293B' }}
                placeholder="今天花了什么？说说看..."
                placeholderStyle="color:#94A3B8"
                value={inputText}
                onInput={(e) => setInputText(e.detail.value)}
                maxlength={500}
              />
            </View>
            <View className="mt-3">
              <Button
                className="w-full text-white rounded-xl"
                style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}
                onClick={handleParse}
                disabled={isParsing || !inputText.trim()}
              >
                {isParsing ? (
                  <View className="flex flex-row items-center justify-center gap-2">
                    <Loader size={16} color="#fff" className="animate-spin" />
                    <Text className="text-white">解析中</Text>
                  </View>
                ) : (
                  <View className="flex flex-row items-center justify-center gap-2">
                    <Send size={16} color="#fff" />
                    <Text className="text-white">智能记账</Text>
                  </View>
                )}
              </Button>
            </View>
          </View>
        </View>

        {/* Parsed Results */}
        {parsedResults.length > 0 && (
          <View className="mx-4 mt-4 pb-36">
            <View className="flex flex-row items-center justify-between mb-3">
              <View className="flex flex-row items-center gap-2">
                <PenLine size={16} color="#2563EB" />
                <Text className="block text-base font-semibold text-foreground">AI 解析结果</Text>
                <View className="bg-blue-50 rounded-full px-2 py-1">
                  <Text className="text-xs text-primary">{parsedResults.length} 笔</Text>
                </View>
              </View>
              <Text className="block text-lg font-bold text-amber-500">合计 ¥{totalParsedAmount.toFixed(2)}</Text>
            </View>

            {parsedResults.map((result, idx) => (
              <View key={idx} className="bg-white rounded-2xl p-4 mb-2" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <View className="flex flex-row items-center justify-between">
                  <View className="flex flex-col flex-1">
                    <View className="flex flex-row items-center gap-2">
                      <Text className="block text-base font-semibold text-foreground">
                        {result.note || '未命名'}
                      </Text>
                      <Text className="block text-lg font-bold text-amber-500">
                        {result.amount != null ? `¥${result.amount}` : '--'}
                      </Text>
                    </View>
                    <View className="flex flex-row items-center gap-2 mt-2">
                      <View className="bg-blue-50 rounded-full px-2 py-1">
                        <Text className="text-xs text-primary">{result.category}</Text>
                      </View>
                      {result.tag && (
                        <View className="bg-amber-50 rounded-full px-2 py-1">
                          <Text className="text-xs text-amber-600">{result.tag}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View className="flex flex-row items-center gap-1">
                    <Button className="bg-transparent p-0" onClick={() => handleSaveToInbox(idx)}>
                      <Inbox size={14} color="#2563EB" />
                    </Button>
                    <Button className="bg-transparent p-0" onClick={() => openEditModal(idx)}>
                      <Pencil size={14} color="#94A3B8" />
                    </Button>
                    <Button className="bg-transparent p-0" onClick={() => handleRemoveResult(idx)}>
                      <X size={14} color="#EF4444" />
                    </Button>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Empty State */}
        {parsedResults.length === 0 && (
          <View className="flex flex-col items-center justify-center mt-16 mb-8">
            <View className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <TrendingUp size={28} color="#94A3B8" />
            </View>
            <Text className="block text-muted-foreground mt-4 text-sm">说点什么开始记账吧</Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom save bar */}
      {parsedResults.length > 0 && (
        <View
          style={{
            position: 'fixed', bottom: 50, left: 0, right: 0,
            display: 'flex', flexDirection: 'row', gap: '12px',
            padding: '12px 16px', backgroundColor: '#FFFFFF',
            borderTop: '1px solid #E2E8F0', zIndex: 100,
          }}
        >
          <View style={{ flex: 1 }}>
            <Button
              className="w-full rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? '保存中...' : `确认记账（${parsedResults.length} 笔）`}
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              className="w-full rounded-xl bg-white border border-slate-200 text-foreground"
              onClick={() => { setParsedResults([]); setEditingIdx(null) }}
            >
              清空结果
            </Button>
          </View>
        </View>
      )}

      {/* Edit Modal */}
      {editingIdx !== null && (
        <View className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="w-full bg-white rounded-t-2xl" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <ScrollView scrollY className="flex-1 w-full">
              <View className="p-5 pb-4">
                {/* Header */}
                <View className="flex flex-row items-center justify-between mb-4">
                  <Text className="block text-lg font-semibold text-foreground">编辑记录</Text>
                  <Button className="bg-transparent p-0" onClick={closeEditModal}>
                    <X size={20} color="#94A3B8" />
                  </Button>
                </View>

                {/* Name + Amount */}
                <View className="flex flex-row items-center gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-muted-foreground mb-1">名称</Text>
                    <View className="bg-slate-50 rounded-xl px-3 py-2">
                      <Input
                        className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0"
                        value={editNote}
                        onInput={(e) => setEditNote(e.detail.value)}
                        placeholder="消费名称"
                      />
                    </View>
                  </View>
                  <View style={{ width: '100px' }}>
                    <Text className="block text-sm text-muted-foreground mb-1">金额</Text>
                    <View className="bg-slate-50 rounded-xl px-3 py-2">
                      <Input
                        className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0"
                        type="digit"
                        value={editAmount}
                        onInput={(e) => setEditAmount(e.detail.value)}
                        placeholder="金额"
                      />
                    </View>
                  </View>
                </View>

                {/* Category selector */}
                <View className="mb-3">
                  <Text className="block text-sm text-muted-foreground mb-1">分类</Text>
                  <ScrollView scrollY className="w-full bg-slate-50 rounded-xl" style={{ maxHeight: '130px' }}>
                    <View className="flex flex-row flex-wrap gap-2 p-3">
                      {filteredCategories.map(cat => (
                        <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                          <View className={`${editCategory === cat.name ? 'bg-blue-500' : 'bg-white border border-slate-200'} rounded-full px-3 py-1`}>
                            <Text className={`text-xs ${editCategory === cat.name ? 'text-white' : 'text-slate-600'}`}>
                              {cat.name}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  <View className="flex flex-row items-center gap-2 mt-2">
                    <View className="flex-1 bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-2" style={{ minHeight: '36px' }}>
                      <Search size={12} color="#94A3B8" />
                      <Input
                        className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                        placeholder="搜索..."
                        value={catSearch}
                        onInput={(e) => setCatSearch(e.detail.value)}
                      />
                    </View>
                    {showCatInput ? (
                      <View className="flex-1 bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-1">
                        <Input
                          className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                          placeholder="新分类名"
                          value={newCatName}
                          onInput={(e) => setNewCatName(e.detail.value)}
                          onConfirm={() => handleCreateCategory()}
                        />
                        <View className="px-2 py-1 bg-blue-500 rounded-lg" onClick={handleCreateCategory}>
                          <Text className="text-white text-xs">加</Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        className="flex-1 bg-amber-50 rounded-xl flex flex-row items-center justify-center gap-1 py-2"
                        onClick={() => setShowCatInput(true)}
                      >
                        <Plus size={14} color="#F59E0B" />
                        <Text className="text-xs text-amber-600 font-medium">自定义分类</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Date + Save */}
                <View className="flex flex-row items-end gap-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-muted-foreground mb-1">日期</Text>
                    <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                      <View className="bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-2">
                        <Calendar size={14} color="#2563EB" />
                        <Text className="text-sm text-primary">{editDate}</Text>
                      </View>
                    </Picker>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      className="w-full text-white rounded-xl py-2"
                      style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}
                      onClick={handleSaveEdit}
                    >
                      <Text className="text-white text-sm font-medium">完成编辑</Text>
                    </Button>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  )
}

export default IndexPage
