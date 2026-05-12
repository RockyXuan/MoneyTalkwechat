import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader, PenLine, X, Pencil, Calendar, Plus, Search, MessageCircle, Smartphone, Check, Trash2, ChevronDown, Inbox } from 'lucide-react-taro'
import { useExpenseStore, ParsedExpense, PendingRecord } from '@/store/expense-store'

const IndexPage = () => {
  const [inputText, setInputText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedResults, setParsedResults] = useState<ParsedExpense[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  // Edit modal state (bills-style overlay)
  const [editNote, setEditNote] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editTag, setEditTag] = useState('')
  const [editDate, setEditDate] = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [showCatInput, setShowCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // Date mode: 'today' or 'month'
  const [dateMode, setDateMode] = useState<'today' | 'month'>('today')
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Inbox (pending records)
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([])
  const [showInbox, setShowInbox] = useState(false)

  const { addExpenses, categories, fetchCategories, createCategory, savePreference,
    fetchPendingRecords, confirmPendingRecord, rejectPendingRecord, createSubscription } = useExpenseStore()

  // Load categories on mount
  useEffect(() => {
    fetchCategories()
    loadPendingRecords()
  }, [])

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
      try {
        await handleConfirmPending(record)
      } catch (e) {
        console.error('confirm all error:', e)
      }
    }
    loadPendingRecords()
  }

  const handleClearInbox = async () => {
    for (const record of pendingRecords) {
      try {
        await rejectPendingRecord(record.id)
      } catch (e) {
        console.error('clear inbox error:', e)
      }
    }
    setPendingRecords([])
    Taro.showToast({ title: '已清空', icon: 'success' })
  }

  const getDefaultDate = () => {
    if (dateMode === 'month') {
      return `${selectedMonth}-01`
    }
    return selectedDate
  }

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
            if (dayMatch) {
              return { ...r, expense_date: `${selectedMonth}-${dayMatch[3]}` }
            }
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
        if (r._edited && r.category && r.note) {
          savePreference(r.note, r.category)
        }
      }
      Taro.showToast({ title: `成功保存 ${parsedResults.length} 笔`, icon: 'success' })
      setParsedResults([])
      setInputText('')
      setEditingIdx(null)
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

  const closeEditModal = () => {
    setEditingIdx(null)
  }

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

  const filteredCategories = categories.filter(c =>
    !catSearch || c.name.includes(catSearch)
  )

  const formatTime = (isoStr: string) => {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <View className="h-full bg-background flex flex-col">
      <ScrollView scrollY className="flex-1">
        {/* Header */}
        <View className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <Text className="block text-xl font-semibold text-foreground">记一笔</Text>
          {pendingRecords.length > 0 && (
            <View className="flex flex-row items-center gap-1" onClick={() => setShowInbox(!showInbox)}>
              <Badge className="bg-warning bg-opacity-15 text-warning text-xs">{pendingRecords.length} 条待确认</Badge>
              <ChevronDown size={14} color="var(--color-accent)" className={showInbox ? 'rotate-180' : ''} />
            </View>
          )}
        </View>

        {/* Inbox (收集箱) */}
        {showInbox && (
          <View className="px-4 mb-3">
            <View className="flex flex-row items-center gap-2 mb-2">
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
                    <Card key={record.id} className="border-outline-variant border-opacity-30 mb-2">
                      <CardContent className="p-3">
                        {/* Source + type */}
                        <View className="flex flex-row items-center gap-2 mb-2">
                          {isFromWechat ? (
                            <View className="flex flex-row items-center gap-1">
                              <MessageCircle size={12} color="var(--color-primary)" />
                              <Text className="text-xs text-primary">公众号</Text>
                            </View>
                          ) : (
                            <View className="flex flex-row items-center gap-1">
                              <Smartphone size={12} color="var(--color-chart-3)" />
                              <Text className="text-xs text-success">小程序</Text>
                            </View>
                          )}
                          <Badge className="bg-primary-container text-primary text-xs">
                            {isSub ? '订阅' : '支出'}
                          </Badge>
                          <Text className="block text-xs text-muted-foreground ml-auto">{formatTime(record.created_at)}</Text>
                        </View>
                        {/* Name + amount */}
                        <View className="flex flex-row items-center justify-between mb-2">
                          <Text className="block text-sm font-medium text-foreground truncate" style={{ maxWidth: '65%' }}>
                            {pd.note || pd.name || record.raw_text}
                          </Text>
                          <Text className="block text-base font-bold text-warning flex-shrink-0">
                            {pd.amount != null ? `¥${pd.amount}` : '金额待定'}
                          </Text>
                        </View>
                        {/* Raw text preview */}
                        {record.raw_text && (pd.note || pd.name) && record.raw_text !== (pd.note || pd.name) && (
                          <Text className="block text-xs text-muted-foreground mb-2 truncate">&ldquo;{record.raw_text}&rdquo;</Text>
                        )}
                        {/* Category badge */}
                        <View className="flex flex-row items-center gap-2 mb-2">
                          <Badge className="bg-primary-container text-primary text-xs">{pd.category || '未分类'}</Badge>
                          {isSub && <Badge className="bg-primary-container text-primary text-xs">{pd.cycle === 'monthly' ? '每月' : pd.cycle === 'quarterly' ? '每季度' : pd.cycle === 'yearly' ? '每年' : pd.cycle}</Badge>}
                        </View>
                        {/* Actions */}
                        <View className="flex flex-row gap-2">
                          <View style={{ flex: 1 }}>
                            <Button className="w-full bg-success text-white rounded-lg" onClick={() => handleConfirmPending(record)}>
                              <View className="flex flex-row items-center justify-center gap-1">
                                <Check size={12} color="#fff" />
                                <Text className="text-white text-xs">确认</Text>
                              </View>
                            </Button>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button className="w-full bg-surface border border-outline-variant text-muted-foreground rounded-lg" onClick={() => handleRejectPending(record.id)}>
                              <View className="flex flex-row items-center justify-center gap-1">
                                <X size={12} color="var(--color-muted-foreground)" />
                                <Text className="text-xs text-muted-foreground">删除</Text>
                              </View>
                            </Button>
                          </View>
                        </View>
                      </CardContent>
                    </Card>
                  )
                })}
                {/* Batch actions */}
                <View className="flex flex-row gap-2 mt-1">
                  <View style={{ flex: 1 }}>
                    <Button className="w-full bg-success text-white rounded-lg" onClick={handleConfirmAll}>
                      <View className="flex flex-row items-center justify-center gap-1">
                        <Check size={14} color="#fff" />
                        <Text className="text-white text-xs">全部确认</Text>
                      </View>
                    </Button>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button className="w-full bg-surface border border-outline-variant text-error rounded-lg" onClick={handleClearInbox}>
                      <View className="flex flex-row items-center justify-center gap-1">
                        <Trash2 size={14} color="var(--color-destructive)" />
                        <Text className="text-xs text-error">清空</Text>
                      </View>
                    </Button>
                  </View>
                </View>
              </>
            ) : (
              <View className="flex flex-col items-center justify-center py-8">
                <PenLine size={32} color="var(--color-border)" />
                <Text className="block text-sm text-muted-foreground mt-2">收集箱空空如也，快去记一笔吧</Text>
              </View>
            )}
          </View>
        )}

        {/* Date Selector */}
        <View className="px-4 mb-2">
          <Card className="border-outline-variant border-opacity-30">
            <CardContent className="p-3">
              <View className="flex flex-row items-center gap-3">
                <Calendar size={18} color="var(--color-primary)" />
                <View className="flex flex-row bg-surface-container rounded-lg p-1">
                  <View
                    className={`px-3 py-1 rounded-md ${dateMode === 'today' ? 'bg-primary' : ''}`}
                    onClick={() => setDateMode('today')}
                  >
                    <Text className={`block text-xs ${dateMode === 'today' ? 'text-on-primary' : 'text-muted-foreground'}`}>
                      按日期
                    </Text>
                  </View>
                  <View
                    className={`px-3 py-1 rounded-md ${dateMode === 'month' ? 'bg-primary' : ''}`}
                    onClick={() => setDateMode('month')}
                  >
                    <Text className={`block text-xs ${dateMode === 'month' ? 'text-on-primary' : 'text-muted-foreground'}`}>
                      按月份
                    </Text>
                  </View>
                </View>
                {dateMode === 'today' ? (
                  <Picker mode="date" value={selectedDate} onChange={(e) => setSelectedDate(e.detail.value)}>
                    <View className="px-3 py-1 bg-primary-container rounded-lg">
                      <Text className="block text-sm text-primary font-medium">{selectedDate}</Text>
                    </View>
                  </Picker>
                ) : (
                  <Picker
                    mode="date"
                    fields="month"
                    value={`${selectedMonth}-01`}
                    onChange={(e) => {
                      const val = e.detail.value as string
                      setSelectedMonth(val.slice(0, 7))
                    }}
                  >
                    <View className="px-3 py-1 bg-primary-container rounded-lg">
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
            </CardContent>
          </Card>
        </View>

        {/* Input Area */}
        <View className="px-4">
          <Card className="border-outline-variant border-opacity-30">
            <CardContent className="p-4">
              <View className="bg-surface-container rounded-xl p-3">
                <Textarea
                  style={{ width: '100%', minHeight: '64px', backgroundColor: 'transparent', fontSize: '15px', lineHeight: '22px' }}
                  placeholder="今天花了什么？说说看..."
                  value={inputText}
                  onInput={(e) => setInputText(e.detail.value)}
                  maxlength={500}
                />
              </View>
              <View className="mt-3">
                <Button
                  className="w-full bg-primary text-on-primary rounded-xl"
                  onClick={handleParse}
                  disabled={isParsing || !inputText.trim()}
                >
                  {isParsing ? (
                    <View className="flex flex-row items-center justify-center gap-2">
                      <Loader size={16} color="#fff" className="animate-spin" />
                      <Text className="text-on-primary">解析中</Text>
                    </View>
                  ) : (
                    <View className="flex flex-row items-center justify-center gap-2">
                      <Send size={16} color="#fff" />
                      <Text className="text-on-primary">智能记账</Text>
                    </View>
                  )}
                </Button>
              </View>
            </CardContent>
          </Card>
        </View>

        {/* Parsed Results */}
        {parsedResults.length > 0 && (
          <View className="px-4 mt-4 pb-36">
            <View className="flex flex-row items-center justify-between mb-2">
              <View className="flex flex-row items-center gap-2">
                <PenLine size={16} color="var(--color-primary)" />
                <Text className="block text-base font-semibold text-foreground">AI 解析结果</Text>
                <Badge className="bg-primary-container text-primary text-xs">{parsedResults.length} 笔</Badge>
              </View>
              <Text className="block text-lg font-bold text-warning">合计 ¥{totalParsedAmount.toFixed(2)}</Text>
            </View>

            {parsedResults.map((result, idx) => (
              <Card key={idx} className="border-outline-variant border-opacity-30 mb-2">
                <CardContent className="p-3">
                  <View className="flex flex-row items-center justify-between">
                    <View className="flex flex-col flex-1">
                      <View className="flex flex-row items-center gap-2">
                        <Text className="block text-base font-semibold text-foreground">
                          {result.note || '未命名'}
                        </Text>
                        <Text className="block text-lg font-bold text-warning">
                          {result.amount != null ? `¥${result.amount}` : '--'}
                        </Text>
                      </View>
                      <View className="flex flex-row items-center gap-2 mt-1">
                        <Badge className="bg-primary-container text-primary text-xs">{result.category}</Badge>
                        {result.tag && <Badge className="bg-warning bg-opacity-15 text-warning text-xs">{result.tag}</Badge>}
                      </View>
                    </View>
                    <View className="flex flex-row items-center gap-1">
                      <Button
                        className="bg-transparent p-0"
                        onClick={() => handleSaveToInbox(idx)}
                      >
                        <Inbox size={14} color="var(--color-primary)" />
                      </Button>
                      <Button
                        className="bg-transparent p-0"
                        onClick={() => openEditModal(idx)}
                      >
                        <Pencil size={14} color="var(--color-muted-foreground)" />
                      </Button>
                      <Button className="bg-transparent p-0" onClick={() => handleRemoveResult(idx)}>
                        <X size={14} color="var(--color-destructive)" />
                      </Button>
                    </View>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}

        {/* Empty State */}
        {parsedResults.length === 0 && (
          <View className="flex flex-col items-center justify-center mt-16">
            <PenLine size={48} color="var(--color-border)" />
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
            padding: '12px 16px', backgroundColor: 'var(--color-background)',
            borderTop: '1px solid var(--color-border)', zIndex: 100,
          }}
        >
          <View style={{ flex: 1 }}>
            <Button
              className="w-full rounded-xl bg-primary text-on-primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? '保存中...' : `确认记账（${parsedResults.length} 笔）`}
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              className="w-full rounded-xl bg-surface border border-outline-variant text-foreground"
              onClick={() => { setParsedResults([]); setEditingIdx(null) }}
            >
              清空结果
            </Button>
          </View>
        </View>
      )}

      {/* Edit Modal - same style as bills page */}
      {editingIdx !== null && (
        <View className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="w-full bg-background rounded-t-2xl" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <ScrollView scrollY className="flex-1 w-full">
              <View className="p-5 pb-4">
                {/* Header */}
                <View className="flex flex-row items-center justify-between mb-4">
                  <Text className="block text-lg font-semibold text-foreground">编辑记录</Text>
                  <Button className="bg-transparent p-0" onClick={closeEditModal}>
                    <X size={20} color="var(--color-muted-foreground)" />
                  </Button>
                </View>

                {/* Name + Amount on same line */}
                <View className="flex flex-row items-center gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-muted-foreground mb-1">名称</Text>
                    <View className="bg-surface rounded-lg px-3 py-2">
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
                    <View className="bg-surface rounded-lg px-3 py-2">
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
                  <ScrollView scrollY className="w-full bg-surface rounded-lg" style={{ maxHeight: '130px' }}>
                    <View className="flex flex-row flex-wrap gap-2 p-3">
                      {filteredCategories.map(cat => (
                        <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                          <Badge className={`${editCategory === cat.name ? 'bg-primary text-on-primary' : 'bg-surface-container text-muted-foreground'} text-xs px-3 py-1`}>
                            {cat.name}
                          </Badge>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  {/* Search + Custom in one row */}
                  <View className="flex flex-row items-center gap-2 mt-2">
                    <View className="flex-1 bg-surface rounded-lg px-3 py-2 flex flex-row items-center gap-2" style={{ minHeight: '36px' }}>
                      <Search size={12} color="var(--color-muted-foreground)" />
                      <Input
                        className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                        placeholder="搜索..."
                        value={catSearch}
                        onInput={(e) => setCatSearch(e.detail.value)}
                      />
                    </View>
                    {showCatInput ? (
                      <View className="flex-1 bg-surface rounded-lg px-3 py-2 flex flex-row items-center gap-1">
                        <Input
                          className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                          placeholder="新分类名"
                          value={newCatName}
                          onInput={(e) => setNewCatName(e.detail.value)}
                          onConfirm={() => handleCreateCategory()}
                        />
                        <View className="px-2 py-1 bg-primary rounded" onClick={handleCreateCategory}>
                          <Text className="text-on-primary text-xs">加</Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        className="flex-1 bg-warning bg-opacity-15 rounded-lg flex flex-row items-center justify-center gap-1 py-2"
                        onClick={() => setShowCatInput(true)}
                      >
                        <Plus size={14} color="var(--color-accent)" />
                        <Text className="text-xs text-warning font-medium">自定义分类</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Date + Save in one row */}
                <View className="flex flex-row items-end gap-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-muted-foreground mb-1">日期</Text>
                    <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                      <View className="bg-surface rounded-lg px-3 py-2 flex flex-row items-center gap-2">
                        <Calendar size={14} color="var(--color-primary)" />
                        <Text className="text-sm text-primary">{editDate}</Text>
                      </View>
                    </Picker>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      className="w-full bg-primary text-on-primary rounded-lg py-2"
                      onClick={handleSaveEdit}
                    >
                      <Text className="text-on-primary text-sm font-medium">完成编辑</Text>
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
