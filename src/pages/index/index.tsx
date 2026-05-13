import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Loader, X, Pencil, Calendar, Plus, Search,
  MessageCircle, Smartphone, ChevronDown, Inbox,
  Sparkles, Clock, Lightbulb, ChevronRight
} from 'lucide-react-taro'
import { useExpenseStore, ParsedExpense, PendingRecord } from '@/store/expense-store'

// Category emoji map - matching the GPT5.5 template exactly
const CATEGORY_ICONS: Record<string, string> = {
  '餐饮': '🍜', '交通': '🚌', '购物': '🛍️', '娱乐': '🎮',
  '居住': '🏠', '医疗': '💊', '教育': '📚', '其他': '📦',
  '订阅': '📱', '通讯': '📞', '服饰': '👔', '美妆': '💄',
  '运动': '⚽', '旅行': '✈️', '宠物': '🐾', '礼物': '🎁',
  '工资': '💰', '理财': '📈', '红包': '🧧', '退款': '💳',
}

const getCategoryIcon = (name: string) => CATEGORY_ICONS[name] || '📦'

const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '教育', '其他']

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

  // Selected category chip
  const [selectedCategory, setSelectedCategory] = useState('餐饮')

  const { addExpenses, categories, fetchCategories, createCategory, savePreference,
    fetchPendingRecords, confirmPendingRecord, rejectPendingRecord, createSubscription } = useExpenseStore()

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

  // Merge user categories with defaults for chip display
  const allCategoryNames = [...new Set([...DEFAULT_CATEGORIES, ...categories.map(c => c.name)])]

  return (
    <View className="h-full flex flex-col" style={{ backgroundColor: '#F2F3F5' }}>
      <ScrollView scrollY className="flex-1" style={{ paddingBottom: '80px' }}>

        {/* === 日期切换条 === */}
        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <View style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
            <View
              onClick={() => setDateMode('today')}
              style={{
                padding: '6px 16px', borderRadius: '8px',
                backgroundColor: dateMode === 'today' ? '#0066FF' : '#F2F3F5',
              }}
            >
              <Text style={{ color: dateMode === 'today' ? '#FFFFFF' : '#4E5969', fontSize: '14px', fontWeight: dateMode === 'today' ? '500' : '400' }}>
                按日期
              </Text>
            </View>
            <View
              onClick={() => setDateMode('month')}
              style={{
                padding: '6px 16px', borderRadius: '8px',
                backgroundColor: dateMode === 'month' ? '#0066FF' : '#F2F3F5',
              }}
            >
              <Text style={{ color: dateMode === 'month' ? '#FFFFFF' : '#4E5969', fontSize: '14px', fontWeight: dateMode === 'month' ? '500' : '400' }}>
                按月份
              </Text>
            </View>
          </View>
          {dateMode === 'today' ? (
            <Picker mode="date" value={selectedDate} onChange={(e) => setSelectedDate(e.detail.value)}>
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px', padding: '6px 12px', backgroundColor: '#F2F3F5', borderRadius: '8px' }}>
                <Calendar size={14} color="#86909C" />
                <Text style={{ fontSize: '14px', color: '#1D2129' }}>{selectedDate}</Text>
                <ChevronDown size={12} color="#86909C" />
              </View>
            </Picker>
          ) : (
            <Picker mode="date" fields="month" value={`${selectedMonth}-01`}
              onChange={(e) => { const val = e.detail.value as string; setSelectedMonth(val.slice(0, 7)) }}
            >
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px', padding: '6px 12px', backgroundColor: '#F2F3F5', borderRadius: '8px' }}>
                <Calendar size={14} color="#86909C" />
                <Text style={{ fontSize: '14px', color: '#1D2129' }}>{selectedMonth}</Text>
                <ChevronDown size={12} color="#86909C" />
              </View>
            </Picker>
          )}
        </View>

        {/* === 输入区白色卡片 === */}
        <View style={{ margin: '0 16px', backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          {/* 备注输入框 */}
          <View style={{ backgroundColor: '#F7F8FA', borderRadius: '12px', padding: '12px', minHeight: '120px', position: 'relative' }}>
            <Textarea
              style={{ width: '100%', minHeight: '80px', backgroundColor: 'transparent', fontSize: '14px', lineHeight: '22px', color: '#1D2129' }}
              placeholder="今天花了什么？一句话记下来"
              placeholderStyle="color:#C9CDD4"
              value={inputText}
              onInput={(e) => setInputText(e.detail.value)}
              maxlength={200}
            />
            <Text style={{ position: 'absolute', bottom: '8px', right: '12px', fontSize: '12px', color: '#C9CDD4' }}>
              {inputText.length}/200
            </Text>
          </View>

          {/* 常用分类 */}
          <View style={{ marginTop: '16px' }}>
            <Text style={{ fontSize: '14px', color: '#86909C', marginBottom: '10px' }}>常用分类</Text>
            <ScrollView scrollX style={{ width: '100%', whiteSpace: 'nowrap' }}>
              <View style={{ display: 'flex', flexDirection: 'row', gap: '8px', paddingBottom: '4px' }}>
                {allCategoryNames.map(name => {
                  const isActive = selectedCategory === name
                  return (
                    <View
                      key={name}
                      onClick={() => setSelectedCategory(name)}
                      style={{
                        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px',
                        padding: '8px 16px', borderRadius: '24px',
                        backgroundColor: isActive ? '#E8F3FF' : '#F2F3F5',
                        flexShrink: 0,
                      }}
                    >
                      <Text style={{ fontSize: '14px' }}>{getCategoryIcon(name)}</Text>
                      <Text
                        style={{
                          fontSize: '14px', fontWeight: isActive ? '500' : '400',
                          color: isActive ? '#0066FF' : '#4E5969',
                        }}
                      >
                        {name}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </ScrollView>
          </View>

          {/* 智能记账按钮 */}
          <View style={{ marginTop: '16px' }}>
            <Button
              className="w-full rounded-full text-white"
              style={{ backgroundColor: '#0066FF', height: '48px', borderRadius: '24px' }}
              onClick={handleParse}
              disabled={isParsing || !inputText.trim()}
            >
              {isParsing ? (
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Loader size={16} color="#fff" className="animate-spin" />
                  <Text style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: '500' }}>解析中...</Text>
                </View>
              ) : (
                <Text style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: '500' }}>智能记账</Text>
              )}
            </Button>
            <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '8px' }}>
              <Sparkles size={12} color="#86909C" />
              <Text style={{ fontSize: '12px', color: '#86909C' }}>AI分析, 安全记账</Text>
            </View>
          </View>
        </View>

        {/* === 收集箱（如果有待确认记录） === */}
        {pendingRecords.length > 0 && (
          <View style={{ margin: '12px 16px 0' }}>
            <View onClick={() => setShowInbox(!showInbox)} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#FFFFFF', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                <Inbox size={16} color="#0066FF" />
                <Text style={{ fontSize: '16px', fontWeight: '500', color: '#1D2129' }}>收集箱</Text>
                <View style={{ backgroundColor: '#E8F3FF', borderRadius: '24px', padding: '2px 8px' }}>
                  <Text style={{ fontSize: '12px', color: '#0066FF' }}>{pendingRecords.length} 待确认</Text>
                </View>
              </View>
              <ChevronDown size={16} color="#86909C" style={{ transform: showInbox ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </View>
            {showInbox && (
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '16px', marginTop: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {pendingRecords.map(record => {
                  const pd = record.parsed_data || {}
                  const isSub = record.record_type === 'subscription'
                  const isFromWechat = record.source === 'wechat_oa'
                  return (
                    <View key={record.id} style={{ borderBottomWidth: '1px', borderBottomColor: '#F2F3F5', borderBottomStyle: 'solid', paddingBottom: '12px', marginBottom: '12px' }}>
                      {/* Source tag + type */}
                      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        {isFromWechat ? (
                          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2px', backgroundColor: '#E8F3FF', borderRadius: '24px', padding: '2px 8px' }}>
                            <MessageCircle size={10} color="#0066FF" />
                            <Text style={{ fontSize: '12px', color: '#0066FF' }}>公众号</Text>
                          </View>
                        ) : (
                          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2px', backgroundColor: '#E8F6EF', borderRadius: '24px', padding: '2px 8px' }}>
                            <Smartphone size={10} color="#00B42A" />
                            <Text style={{ fontSize: '12px', color: '#00B42A' }}>小程序</Text>
                          </View>
                        )}
                        <View style={{ backgroundColor: '#F2F3F5', borderRadius: '24px', padding: '2px 8px' }}>
                          <Text style={{ fontSize: '12px', color: '#4E5969' }}>{isSub ? '订阅' : '支出'}</Text>
                        </View>
                        <Text style={{ fontSize: '12px', color: '#86909C', marginLeft: 'auto' }}>{formatTime(record.created_at)}</Text>
                      </View>
                      {/* Name + amount */}
                      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <Text style={{ fontSize: '14px', fontWeight: '500', color: '#1D2129', maxWidth: '65%' }} numberOfLines={1}>
                          {pd.note || pd.name || record.raw_text}
                        </Text>
                        <Text style={{ fontSize: '16px', fontWeight: '700', color: '#FF7D00', flexShrink: 0 }}>
                          {pd.amount != null ? `¥${pd.amount}` : '金额待定'}
                        </Text>
                      </View>
                      {/* Category tag */}
                      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <View style={{ backgroundColor: '#F2F3F5', borderRadius: '24px', padding: '2px 8px' }}>
                          <Text style={{ fontSize: '12px', color: '#4E5969' }}>{pd.category || '未分类'}</Text>
                        </View>
                      </View>
                      {/* Confirm / Delete */}
                      <View style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
                        <View style={{ flex: 1 }}>
                          <Button style={{ backgroundColor: '#0066FF', borderRadius: '8px', height: '36px' }} onClick={() => handleConfirmPending(record)}>
                            <Text style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: '500' }}>确认</Text>
                          </Button>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button style={{ backgroundColor: '#FFFFFF', borderWidth: '1px', borderColor: '#E5E6EB', borderRadius: '8px', height: '36px' }} onClick={() => handleRejectPending(record.id)}>
                            <Text style={{ color: '#86909C', fontSize: '13px' }}>删除</Text>
                          </Button>
                        </View>
                      </View>
                    </View>
                  )
                })}
                {/* Batch actions */}
                <View style={{ display: 'flex', flexDirection: 'row', gap: '8px', marginTop: '4px' }}>
                  <View style={{ flex: 1 }}>
                    <Button style={{ backgroundColor: '#00B42A', borderRadius: '8px', height: '36px' }} onClick={handleConfirmAll}>
                      <Text style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: '500' }}>全部确认</Text>
                    </Button>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button style={{ backgroundColor: '#FFFFFF', borderWidth: '1px', borderColor: '#FF7D00', borderRadius: '8px', height: '36px' }} onClick={handleClearInbox}>
                      <Text style={{ color: '#FF7D00', fontSize: '13px' }}>清空</Text>
                    </Button>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* === 最近记录 === */}
        <View style={{ margin: '12px 16px 0', backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <View>
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} color="#86909C" />
                <Text style={{ fontSize: '16px', fontWeight: '500', color: '#1D2129' }}>最近记录</Text>
              </View>
              <Text style={{ fontSize: '12px', color: '#86909C', marginTop: '2px' }}>快速继续上次记录</Text>
            </View>
            {parsedResults.length > 0 && (
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px' }}>
                <Text style={{ fontSize: '14px', fontWeight: '700', color: '#FF7D00' }}>¥{totalParsedAmount.toFixed(2)}</Text>
              </View>
            )}
          </View>

          {parsedResults.length > 0 ? (
            <View>
              {parsedResults.map((result, idx) => (
                <View
                  key={idx}
                  style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'center',
                    padding: '10px 0',
                    borderBottomWidth: idx < parsedResults.length - 1 ? '1px' : '0',
                    borderBottomColor: '#F2F3F5', borderBottomStyle: 'solid',
                  }}
                >
                  {/* Icon */}
                  <View style={{ width: '36px', height: '36px', borderRadius: '18px', backgroundColor: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Text style={{ fontSize: '18px' }}>{getCategoryIcon(result.category || '其他')}</Text>
                  </View>
                  {/* Name + category */}
                  <View style={{ flex: 1, marginLeft: '10px' }}>
                    <Text style={{ fontSize: '14px', color: '#1D2129', fontWeight: '400' }} numberOfLines={1}>
                      {result.note || '未命名'}
                    </Text>
                    <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <View style={{ backgroundColor: '#F2F3F5', borderRadius: '4px', padding: '1px 6px' }}>
                        <Text style={{ fontSize: '11px', color: '#86909C' }}>{result.category || '其他'}</Text>
                      </View>
                    </View>
                  </View>
                  {/* Amount + actions */}
                  <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <Text style={{ fontSize: '16px', fontWeight: '700', color: '#1D2129' }}>
                      {result.amount != null ? `¥${result.amount}` : '--'}
                    </Text>
                    <Button style={{ backgroundColor: 'transparent', padding: '0', minWidth: 'auto' }} onClick={() => openEditModal(idx)}>
                      <Pencil size={14} color="#86909C" />
                    </Button>
                    <Button style={{ backgroundColor: 'transparent', padding: '0', minWidth: 'auto' }} onClick={() => handleRemoveResult(idx)}>
                      <X size={14} color="#C9CDD4" />
                    </Button>
                  </View>
                </View>
              ))}
              {/* Save all button */}
              <View style={{ marginTop: '12px' }}>
                <Button
                  style={{ backgroundColor: '#0066FF', borderRadius: '24px', height: '44px' }}
                  className="w-full text-white"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? '保存中...' : `确认记账（${parsedResults.length} 笔）`}
                </Button>
              </View>
            </View>
          ) : (
            <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px', paddingBottom: '24px' }}>
              <Inbox size={32} color="#E5E6EB" />
              <Text style={{ fontSize: '14px', color: '#86909C', marginTop: '8px' }}>暂无记录</Text>
              <Text style={{ fontSize: '14px', color: '#0066FF', marginTop: '4px' }}>去记一笔 {'>'} </Text>
            </View>
          )}
        </View>

        {/* === AI建议 === */}
        <View style={{ margin: '12px 16px 0', backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '6px', marginBottom: '12px' }}>
            <Sparkles size={16} color="#0066FF" />
            <View>
              <Text style={{ fontSize: '16px', fontWeight: '500', color: '#1D2129' }}>AI建议</Text>
              <Text style={{ fontSize: '12px', color: '#86909C', marginTop: '2px' }}>试试这样描述</Text>
            </View>
          </View>
          {['午餐花了28元', '打车去机场65元', '超市购物156元'].map((text, i) => (
            <View
              key={i}
              onClick={() => { setInputText(text); setSelectedCategory(text.includes('午餐') || text.includes('超市') ? '餐饮' : text.includes('打车') ? '交通' : '其他') }}
              style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: '#F7F8FA', borderRadius: '8px', height: '40px',
                padding: '0 16px', marginTop: i > 0 ? '8px' : '0',
              }}
            >
              <Text style={{ fontSize: '14px', color: '#1D2129' }}>{text}</Text>
              <ChevronRight size={14} color="#C9CDD4" />
            </View>
          ))}
        </View>

        {/* === 一句话记账提示 === */}
        <View style={{ margin: '12px 16px 16px', backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '12px 16px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <Lightbulb size={16} color="#FFC107" />
          <Text style={{ fontSize: '14px', color: '#4E5969' }}>
            一句话记账, 越简单越准
          </Text>
        </View>

        {dateMode === 'month' && (
          <View style={{ margin: '0 16px 16px', padding: '8px 12px', backgroundColor: '#E8F3FF', borderRadius: '8px' }}>
            <Text style={{ fontSize: '12px', color: '#0066FF' }}>
              按月模式：所有记录将记入 {selectedMonth}，无需重复说日期
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      {editingIdx !== null && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ width: '100%', backgroundColor: '#FFFFFF', borderRadius: '16px 16px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <ScrollView scrollY style={{ flex: 1, width: '100%' }}>
              <View style={{ padding: '20px' }}>
                {/* Header */}
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <Text style={{ fontSize: '18px', fontWeight: '600', color: '#1D2129' }}>编辑记录</Text>
                  <Button style={{ backgroundColor: 'transparent', padding: '0' }} onClick={closeEditModal}>
                    <X size={20} color="#86909C" />
                  </Button>
                </View>

                {/* Name + Amount */}
                <View style={{ display: 'flex', flexDirection: 'row', gap: '12px', marginBottom: '12px' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: '14px', color: '#86909C', marginBottom: '4px' }}>名称</Text>
                    <View style={{ backgroundColor: '#F7F8FA', borderRadius: '12px', padding: '8px 12px' }}>
                      <Input
                        style={{ width: '100%', fontSize: '14px', backgroundColor: 'transparent' }}
                        value={editNote}
                        onInput={(e) => setEditNote(e.detail.value)}
                        placeholder="消费名称"
                      />
                    </View>
                  </View>
                  <View style={{ width: '100px' }}>
                    <Text style={{ fontSize: '14px', color: '#86909C', marginBottom: '4px' }}>金额</Text>
                    <View style={{ backgroundColor: '#F7F8FA', borderRadius: '12px', padding: '8px 12px' }}>
                      <Input
                        style={{ width: '100%', fontSize: '14px', backgroundColor: 'transparent' }}
                        type="digit"
                        value={editAmount}
                        onInput={(e) => setEditAmount(e.detail.value)}
                        placeholder="金额"
                      />
                    </View>
                  </View>
                </View>

                {/* Category selector */}
                <View style={{ marginBottom: '12px' }}>
                  <Text style={{ fontSize: '14px', color: '#86909C', marginBottom: '4px' }}>分类</Text>
                  <ScrollView scrollY style={{ width: '100%', backgroundColor: '#F7F8FA', borderRadius: '12px', maxHeight: '130px' }}>
                    <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '8px', padding: '12px' }}>
                      {filteredCategories.map(cat => (
                        <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                          <View style={{
                            borderRadius: '24px', padding: '6px 14px',
                            backgroundColor: editCategory === cat.name ? '#0066FF' : '#FFFFFF',
                            borderWidth: '1px', borderStyle: 'solid',
                            borderColor: editCategory === cat.name ? '#0066FF' : '#E5E6EB',
                          }}
                          >
                            <Text style={{ fontSize: '13px', color: editCategory === cat.name ? '#FFFFFF' : '#4E5969' }}>
                              {cat.name}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <View style={{ flex: 1, backgroundColor: '#F7F8FA', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', minHeight: '36px' }}>
                      <Search size={12} color="#86909C" />
                      <Input
                        style={{ flex: 1, fontSize: '13px', backgroundColor: 'transparent' }}
                        placeholder="搜索..."
                        value={catSearch}
                        onInput={(e) => setCatSearch(e.detail.value)}
                      />
                    </View>
                    {showCatInput ? (
                      <View style={{ flex: 1, backgroundColor: '#F7F8FA', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px' }}>
                        <Input
                          style={{ flex: 1, fontSize: '13px', backgroundColor: 'transparent' }}
                          placeholder="新分类名"
                          value={newCatName}
                          onInput={(e) => setNewCatName(e.detail.value)}
                          onConfirm={() => handleCreateCategory()}
                        />
                        <View style={{ padding: '4px 10px', backgroundColor: '#0066FF', borderRadius: '8px' }} onClick={handleCreateCategory}>
                          <Text style={{ color: '#FFFFFF', fontSize: '13px' }}>加</Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        style={{ flex: 1, backgroundColor: '#FFF7E6', borderRadius: '12px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '4px', paddingTop: '8px', paddingBottom: '8px' }}
                        onClick={() => setShowCatInput(true)}
                      >
                        <Plus size={14} color="#FF7D00" />
                        <Text style={{ fontSize: '13px', color: '#FF7D00', fontWeight: '500' }}>自定义分类</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Date + Save */}
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: '12px' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: '14px', color: '#86909C', marginBottom: '4px' }}>日期</Text>
                    <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                      <View style={{ backgroundColor: '#F7F8FA', borderRadius: '12px', padding: '8px 12px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={14} color="#0066FF" />
                        <Text style={{ fontSize: '14px', color: '#0066FF' }}>{editDate}</Text>
                      </View>
                    </Picker>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      style={{ backgroundColor: '#0066FF', borderRadius: '12px', height: '36px' }}
                      className="w-full text-white"
                      onClick={handleSaveEdit}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: '500' }}>完成编辑</Text>
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
