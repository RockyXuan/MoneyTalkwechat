import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader, PenLine, X, Pencil, Calendar, Plus, Search, MessageCircle, Check } from 'lucide-react-taro'
import { useExpenseStore, ParsedExpense, PendingRecord } from '@/store/expense-store'

const IndexPage = () => {
  const [inputText, setInputText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedResults, setParsedResults] = useState<ParsedExpense[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  // Date mode: 'today' or 'month'
  const [dateMode, setDateMode] = useState<'today' | 'month'>('today')
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Category selector state
  const [catSearch, setCatSearch] = useState('')
  const [showCatInput, setShowCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // Pending records from WeChat
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([])
  const [showPending, setShowPending] = useState(false)

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
      if (records.length > 0) setShowPending(true)
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
      Taro.showToast({ title: '已拒绝', icon: 'success' })
      loadPendingRecords()
    } catch (err) {
      console.error('rejectPending error:', err)
    }
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
      // Save preferences for any edited categories
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

  const handleUpdateResult = (idx: number, field: string, value: any) => {
    setParsedResults(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value, _edited: true } : item
    ))
  }

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    try {
      await createCategory(newCatName.trim())
      setNewCatName('')
      setShowCatInput(false)
      setCatSearch('')
      Taro.showToast({ title: '分类已添加', icon: 'success' })
    } catch (err) {
      console.error('创建分类失败', err)
    }
  }

  const totalParsedAmount = parsedResults.reduce((sum, r) => sum + (r.amount || 0), 0)

  // Filtered categories for the selector
  const filteredCategories = categories.filter(c =>
    !catSearch || c.name.includes(catSearch)
  )

  return (
    <View className="h-full bg-[#F7F5F0] flex flex-col">
      {/* Scrollable content area */}
      <ScrollView scrollY className="flex-1">
        {/* Header */}
        <View className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <Text className="block text-xl font-semibold text-[#1A1A1A]">记一笔</Text>
          {pendingRecords.length > 0 && (
            <View className="flex flex-row items-center gap-1" onClick={() => setShowPending(!showPending)}>
              <MessageCircle size={16} color="#E8913A" />
              <Badge className="bg-[#FFF7ED] text-[#E8913A] text-xs">{pendingRecords.length} 条待确认</Badge>
            </View>
          )}
        </View>

        {/* Pending Records from WeChat */}
        {showPending && pendingRecords.length > 0 && (
          <View className="px-4 mb-2">
            <View className="flex flex-row items-center gap-2 mb-2">
              <MessageCircle size={16} color="#E8913A" />
              <Text className="block text-sm font-semibold text-[#1A1A1A]">微信待确认</Text>
              <Text className="block text-xs text-gray-400">来自公众号的消息</Text>
            </View>
            {pendingRecords.map(record => {
              const pd = record.parsed_data || {}
              const isSub = record.record_type === 'subscription'
              return (
                <Card key={record.id} className="border-[#FFF0E0] mb-2">
                  <CardContent className="p-3">
                    <View className="flex flex-row items-center gap-2 mb-1">
                      <Badge className="bg-[#FFF7ED] text-[#E8913A] text-xs">
                        {isSub ? '订阅' : '支出'}
                      </Badge>
                      <Text className="block text-xs text-gray-400">来自微信</Text>
                    </View>
                    <View className="flex flex-row items-center justify-between mb-2">
                      <Text className="block text-sm font-medium text-[#1A1A1A]">
                        {pd.note || pd.name || record.raw_text}
                      </Text>
                      <Text className="block text-base font-bold text-[#E8913A]">
                        {pd.amount != null ? `¥${pd.amount}` : '金额待定'}
                      </Text>
                    </View>
                    <View className="flex flex-row items-center gap-2 mb-2">
                      <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{pd.category || '未分类'}</Badge>
                      {isSub && <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{pd.cycle === 'monthly' ? '每月' : pd.cycle === 'quarterly' ? '每季度' : pd.cycle === 'yearly' ? '每年' : pd.cycle}</Badge>}
                    </View>
                    <View className="flex flex-row gap-2">
                      <View style={{ flex: 1 }}>
                        <Button className="w-full bg-[#3D7C5F] text-white rounded-lg" onClick={() => handleConfirmPending(record)}>
                          <View className="flex flex-row items-center justify-center gap-1">
                            <Check size={12} color="#fff" />
                            <Text className="text-white text-xs">确认</Text>
                          </View>
                        </Button>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button className="w-full bg-white border border-[#E5E1D8] text-gray-500 rounded-lg" onClick={() => handleRejectPending(record.id)}>
                          <Text className="text-xs text-gray-500">忽略</Text>
                        </Button>
                      </View>
                    </View>
                  </CardContent>
                </Card>
              )
            })}
          </View>
        )}

        {/* Date Selector */}
        <View className="px-4 mb-2">
          <Card className="border-[#E5E1D8]">
            <CardContent className="p-3">
              <View className="flex flex-row items-center gap-3">
                <Calendar size={18} color="#3D7C5F" />
                <View className="flex flex-row bg-[#F7F5F0] rounded-lg p-1">
                  <View
                    className={`px-3 py-1 rounded-md ${dateMode === 'today' ? 'bg-[#3D7C5F]' : ''}`}
                    onClick={() => setDateMode('today')}
                  >
                    <Text className={`block text-xs ${dateMode === 'today' ? 'text-white' : 'text-gray-500'}`}>
                      按日期
                    </Text>
                  </View>
                  <View
                    className={`px-3 py-1 rounded-md ${dateMode === 'month' ? 'bg-[#3D7C5F]' : ''}`}
                    onClick={() => setDateMode('month')}
                  >
                    <Text className={`block text-xs ${dateMode === 'month' ? 'text-white' : 'text-gray-500'}`}>
                      按月份
                    </Text>
                  </View>
                </View>
                {dateMode === 'today' ? (
                  <Picker mode="date" value={selectedDate} onChange={(e) => setSelectedDate(e.detail.value)}>
                    <View className="px-3 py-1 bg-[#E8F0EB] rounded-lg">
                      <Text className="block text-sm text-[#3D7C5F] font-medium">{selectedDate}</Text>
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
                    <View className="px-3 py-1 bg-[#E8F0EB] rounded-lg">
                      <Text className="block text-sm text-[#3D7C5F] font-medium">{selectedMonth}</Text>
                    </View>
                  </Picker>
                )}
              </View>
              {dateMode === 'month' && (
                <Text className="block text-xs text-gray-400 mt-2">
                  按月模式：所有记录将记入 {selectedMonth}，无需重复说日期
                </Text>
              )}
            </CardContent>
          </Card>
        </View>

        {/* Input Area */}
        <View className="px-4">
          <Card className="border-[#E5E1D8]">
            <CardContent className="p-4">
              <View className="bg-[#F7F5F0] rounded-xl p-3">
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
                  className="w-full bg-[#3D7C5F] text-white rounded-xl"
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
            </CardContent>
          </Card>
        </View>

        {/* Parsed Results */}
        {parsedResults.length > 0 && (
          <View className="px-4 mt-4 pb-36">
            <View className="flex flex-row items-center justify-between mb-2">
              <View className="flex flex-row items-center gap-2">
                <PenLine size={16} color="#3D7C5F" />
                <Text className="block text-base font-semibold text-[#1A1A1A]">AI 解析结果</Text>
                <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{parsedResults.length} 笔</Badge>
              </View>
              <Text className="block text-lg font-bold text-[#E8913A]">合计 ¥{totalParsedAmount.toFixed(2)}</Text>
            </View>

            {parsedResults.map((result, idx) => (
              <Card key={idx} className="border-[#E5E1D8] mb-2">
                <CardContent className="p-3">
                  {editingIdx === idx ? (
                    /* ===== EDIT MODE: compact vertical layout ===== */
                    <View className="flex flex-col gap-2">
                      {/* Row 1: Name + Amount */}
                      <View className="flex flex-row items-center gap-2">
                        <View className="flex-1 bg-[#F7F5F0] rounded-lg px-2 py-1">
                          <Input
                            className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0"
                            value={result.note}
                            onInput={(e) => handleUpdateResult(idx, 'note', e.detail.value)}
                            placeholder="名称"
                          />
                        </View>
                        <View className="bg-[#F7F5F0] rounded-lg px-2 py-1" style={{ width: '90px' }}>
                          <Input
                            className="border-0 bg-transparent text-[#E8913A] font-bold ring-0 focus-within:ring-0"
                            type="digit"
                            value={result.amount != null ? String(result.amount) : ''}
                            onInput={(e) => handleUpdateResult(idx, 'amount', e.detail.value ? Number(e.detail.value) : null)}
                            placeholder="金额"
                          />
                        </View>
                      </View>

                      {/* Row 2: Category horizontal scroll */}
                      <ScrollView scrollX className="w-full">
                        <View className="flex flex-row gap-1 flex-nowrap">
                          {filteredCategories.map(cat => (
                            <View key={cat.id} onClick={() => { handleUpdateResult(idx, 'category', cat.name); setCatSearch('') }} className="flex-shrink-0">
                              <Badge className={`${result.category === cat.name ? 'bg-[#3D7C5F] text-white' : 'bg-[#F7F5F0] text-gray-500'} text-xs`}>
                                {cat.name}
                              </Badge>
                            </View>
                          ))}
                        </View>
                      </ScrollView>

                      {/* Row 3: Search + Add custom (collapsed by default) */}
                      <View className="flex flex-row items-center gap-2">
                        <View className="flex-1 bg-[#F7F5F0] rounded-lg px-2 py-1 flex flex-row items-center gap-1">
                          <Search size={12} color="#999" />
                          <Input
                            className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                            placeholder="搜索分类..."
                            value={catSearch}
                            onInput={(e) => setCatSearch(e.detail.value)}
                          />
                        </View>
                        {showCatInput ? (
                          <View className="flex flex-row items-center gap-1">
                            <View className="bg-[#F7F5F0] rounded-lg px-2 py-1" style={{ width: '80px' }}>
                              <Input
                                className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0"
                                placeholder="新分类"
                                value={newCatName}
                                onInput={(e) => setNewCatName(e.detail.value)}
                                onConfirm={() => handleCreateCategory()}
                              />
                            </View>
                            <Button className="bg-[#3D7C5F] text-white px-2 py-0 rounded-lg" style={{ minHeight: '28px' }} onClick={handleCreateCategory}>
                              <Text className="text-white text-xs">添加</Text>
                            </Button>
                          </View>
                        ) : (
                          <View
                            className="flex flex-row items-center gap-1 px-2 py-1 bg-[#FFF7ED] rounded-lg flex-shrink-0"
                            onClick={() => setShowCatInput(true)}
                          >
                            <Plus size={10} color="#E8913A" />
                            <Text className="text-xs text-[#E8913A]">自定义</Text>
                          </View>
                        )}
                      </View>

                      {/* Row 4: Date */}
                      <Picker mode="date" value={result.expense_date} onChange={(e) => handleUpdateResult(idx, 'expense_date', e.detail.value)}>
                        <View className="bg-[#F7F5F0] rounded-lg px-2 py-1 flex flex-row items-center gap-1 self-start">
                          <Calendar size={12} color="#3D7C5F" />
                          <Text className="text-xs text-[#3D7C5F]">{result.expense_date}</Text>
                        </View>
                      </Picker>

                      {/* Done editing */}
                      <Button
                        className="bg-[#E8F0EB] text-[#3D7C5F] text-xs rounded-lg self-start"
                        onClick={() => { setEditingIdx(null); setCatSearch(''); setShowCatInput(false) }}
                      >
                        <Text className="text-xs text-[#3D7C5F]">完成编辑</Text>
                      </Button>
                    </View>
                  ) : (
                    /* ===== VIEW MODE: name+amount line 1, category line 2 ===== */
                    <View className="flex flex-row items-center justify-between">
                      <View className="flex flex-col flex-1">
                        <View className="flex flex-row items-center gap-2">
                          <Text className="block text-base font-semibold text-[#1A1A1A]">
                            {result.note || '未命名'}
                          </Text>
                          <Text className="block text-lg font-bold text-[#E8913A]">
                            {result.amount != null ? `¥${result.amount}` : '--'}
                          </Text>
                        </View>
                        <View className="flex flex-row items-center gap-2 mt-1">
                          <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{result.category}</Badge>
                          {result.tag && <Badge className="bg-[#FFF7ED] text-[#E8913A] text-xs">{result.tag}</Badge>}
                        </View>
                      </View>
                      <View className="flex flex-row items-center gap-1">
                        <Button
                          className="bg-transparent p-0"
                          onClick={() => { setEditingIdx(idx); setCatSearch(''); setShowCatInput(false) }}
                        >
                          <Pencil size={14} color="#999" />
                        </Button>
                        <Button className="bg-transparent p-0" onClick={() => handleRemoveResult(idx)}>
                          <X size={14} color="#EF4444" />
                        </Button>
                      </View>
                    </View>
                  )}
                </CardContent>
              </Card>
            ))}
          </View>
        )}

        {/* Empty State */}
        {parsedResults.length === 0 && (
          <View className="flex flex-col items-center justify-center mt-16">
            <PenLine size={48} color="#E5E1D8" />
            <Text className="block text-gray-400 mt-4 text-sm">说点什么开始记账吧</Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom save bar - only shows when there are parsed results */}
      {parsedResults.length > 0 && (
        <View
          style={{
            position: 'fixed', bottom: 50, left: 0, right: 0,
            display: 'flex', flexDirection: 'row', gap: '12px',
            padding: '12px 16px', backgroundColor: '#F7F5F0',
            borderTop: '1px solid #E5E1D8', zIndex: 100,
          }}
        >
          <View style={{ flex: 1 }}>
            <Button
              className="w-full rounded-xl bg-[#3D7C5F] text-white"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? '保存中...' : `确认记账（${parsedResults.length} 笔）`}
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              className="w-full rounded-xl bg-white border border-[#E5E1D8] text-[#1A1A1A]"
              onClick={() => { setParsedResults([]); setEditingIdx(null) }}
            >
              清空结果
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}

export default IndexPage
