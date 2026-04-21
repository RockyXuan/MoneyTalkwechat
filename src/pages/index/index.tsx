import { useState, useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Loader, Calendar, Plus, Search, X, MessageCircle, Check } from 'lucide-react-taro'
import { useExpenseStore, ParsedExpense, PendingRecord } from '@/store/expense-store'

export default function IndexPage() {
  const {
    addExpenses, categories, fetchCategories, createCategory, savePreference,
    fetchPendingRecords, confirmPendingRecord, rejectPendingRecord, createSubscription,
  } = useExpenseStore()

  const [input, setInput] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedResults, setParsedResults] = useState<ParsedExpense[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  // Edit modal state (bills-style)
  const [editNote, setEditNote] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editTag, setEditTag] = useState('')
  const [editDate, setEditDate] = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [showCatInput, setShowCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // Pending records from WeChat
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([])
  const [showPending, setShowPending] = useState(false)

  // Swipe state for parsed result cards
  const [swipeX, setSwipeX] = useState<Record<number, number>>({})
  const touchStartX = useRef<Record<number, number>>({})
  const touchStartY = useRef<Record<number, number>>({})

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

  const handleParse = async () => {
    if (!input.trim()) return
    setIsParsing(true)
    try {
      const result = await useExpenseStore.getState().parseText(input.trim())
      if (result && result.length > 0) {
        setParsedResults(result.map(r => ({ ...r, _edited: false })))
      } else {
        Taro.showToast({ title: '未能识别', icon: 'none' })
      }
    } catch (err) {
      console.error('parseText error:', err)
      Taro.showToast({ title: '识别失败', icon: 'none' })
    } finally {
      setIsParsing(false)
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

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    try {
      await createCategory(newCatName.trim())
      setEditCategory(newCatName.trim())
      setNewCatName('')
      setShowCatInput(false)
    } catch (err) {
      console.error('createCategory error:', err)
    }
  }

  const handleSaveSingle = async (idx: number) => {
    const item = parsedResults[idx]
    if (item.amount == null) {
      Taro.showToast({ title: '请先填写金额', icon: 'none' })
      return
    }
    try {
      await addExpenses([item], input.trim())
      savePreference(input.trim(), JSON.stringify(item))
      // Remove saved item
      const updated = parsedResults.filter((_, i) => i !== idx)
      setParsedResults(updated)
      // Reset swipe
      const newSwipe = { ...swipeX }
      delete newSwipe[idx]
      setSwipeX(newSwipe)
      if (updated.length === 0) {
        setInput('')
        Taro.showToast({ title: '已保存', icon: 'success' })
      } else {
        Taro.showToast({ title: '已保存', icon: 'success' })
      }
    } catch (err) {
      console.error('saveSingle error:', err)
    }
  }

  const handleDeleteParsed = (idx: number) => {
    const updated = parsedResults.filter((_, i) => i !== idx)
    setParsedResults(updated)
    const newSwipe = { ...swipeX }
    delete newSwipe[idx]
    setSwipeX(newSwipe)
    if (updated.length === 0) setInput('')
  }

  const handleSaveAll = async () => {
    const items = parsedResults.filter(r => r.amount != null)
    if (items.length === 0) {
      Taro.showToast({ title: '没有可保存的记录', icon: 'none' })
      return
    }
    try {
      await addExpenses(items, input.trim())
      for (const item of items) {
        savePreference(input.trim(), JSON.stringify(item))
      }
      setParsedResults([])
      setInput('')
      Taro.showToast({ title: '全部保存成功', icon: 'success' })
    } catch (err) {
      console.error('saveAll error:', err)
    }
  }

  // Swipe handlers
  const handleTouchStart = (idx: number, e: any) => {
    const touch = e.touches[0]
    touchStartX.current[idx] = touch.clientX
    touchStartY.current[idx] = touch.clientY
  }

  const handleTouchMove = (idx: number, e: any) => {
    const touch = e.touches[0]
    const startX = touchStartX.current[idx] || 0
    const startY = touchStartY.current[idx] || 0
    const diffX = touch.clientX - startX
    const diffY = touch.clientY - startY

    // Only handle horizontal swipes
    if (Math.abs(diffY) > Math.abs(diffX)) return

    const offset = Math.max(-80, Math.min(80, diffX * 0.6))
    setSwipeX(prev => ({ ...prev, [idx]: offset }))
  }

  const handleTouchEnd = (idx: number) => {
    const offset = swipeX[idx] || 0
    // Snap to full position or back
    if (offset > 30) {
      setSwipeX(prev => ({ ...prev, [idx]: 80 })) // right swipe → delete (red, left side)
    } else if (offset < -30) {
      setSwipeX(prev => ({ ...prev, [idx]: -80 })) // left swipe → save (green, right side)
    } else {
      setSwipeX(prev => ({ ...prev, [idx]: 0 }))
    }
  }

  const resetSwipe = (idx: number) => {
    setSwipeX(prev => ({ ...prev, [idx]: 0 }))
  }

  const filteredCategories = categories.filter(c =>
    !catSearch || c.name.includes(catSearch)
  )

  return (
    <View className="min-h-full bg-[#F7F5F0] pb-20">
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
                    <Badge className="bg-[#FFF7ED] text-[#E8913A] text-xs">{isSub ? '订阅' : '支出'}</Badge>
                    <Text className="block text-xs text-gray-400">来自微信</Text>
                  </View>
                  <View className="flex flex-row items-center justify-between mb-2">
                    <Text className="block text-sm font-medium text-[#1A1A1A]">{pd.note || pd.name || record.raw_text}</Text>
                    <Text className="block text-base font-bold text-[#E8913A]">{pd.amount != null ? `¥${pd.amount}` : '金额待定'}</Text>
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

      {/* Input Area */}
      <View className="px-4 mb-3">
        <View className="bg-white rounded-2xl p-4" style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
          <View style={{ flex: 1, backgroundColor: '#F7F5F0', borderRadius: '20px', padding: '8px 12px' }}>
            <Input
              style={{ width: '100%', fontSize: '14px' }}
              placeholder="说一句话记一笔，如：午饭30 咖啡15"
              value={input}
              onInput={(e) => setInput(e.detail.value)}
              onConfirm={() => handleParse()}
              confirmType="send"
            />
          </View>
          <View style={{ flexShrink: 0 }}>
            <Button
              className="bg-[#3D7C5F] text-white rounded-full px-4 py-2"
              onClick={handleParse}
              disabled={isParsing || !input.trim()}
            >
              {isParsing ? <Loader size={16} color="#fff" /> : <Send size={16} color="#fff" />}
            </Button>
          </View>
        </View>
      </View>

      {/* Parsed Results - Swipeable Cards */}
      {parsedResults.length > 0 && (
        <View className="px-4 mb-3">
          <View className="flex flex-row items-center justify-between mb-2">
            <Text className="block text-sm font-semibold text-[#1A1A1A]">识别结果</Text>
            <Text className="block text-xs text-gray-400">←左滑保存 | 右滑删除→</Text>
          </View>

          {parsedResults.map((item, idx) => {
            const offset = swipeX[idx] || 0
            return (
              <View key={idx} className="mb-2" style={{ overflow: 'hidden', borderRadius: '12px', position: 'relative' }}>
                {/* Background actions (revealed by swipe) */}
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'row' }}>
                  {/* Left action: Delete (red) - revealed when swiping right */}
                  <View
                    className="flex items-center justify-center"
                    style={{ width: '50%', backgroundColor: '#EF4444' }}
                    onClick={() => { handleDeleteParsed(idx); resetSwipe(idx) }}
                  >
                    <View className="flex flex-col items-center">
                      <X size={20} color="#fff" />
                      <Text className="text-white text-xs mt-1">删除</Text>
                    </View>
                  </View>
                  {/* Right action: Save (green) - revealed when swiping left */}
                  <View
                    className="flex items-center justify-center"
                    style={{ width: '50%', backgroundColor: '#3D7C5F' }}
                    onClick={() => { handleSaveSingle(idx); resetSwipe(idx) }}
                  >
                    <View className="flex flex-col items-center">
                      <Check size={20} color="#fff" />
                      <Text className="text-white text-xs mt-1">保存</Text>
                    </View>
                  </View>
                </View>

                {/* Foreground card */}
                <View
                  style={{
                    transform: `translateX(${offset}px)`,
                    transition: offset === 0 ? 'transform 0.2s ease' : 'none',
                    position: 'relative',
                    zIndex: 1,
                  }}
                  onTouchStart={(e) => handleTouchStart(idx, e)}
                  onTouchMove={(e) => handleTouchMove(idx, e)}
                  onTouchEnd={() => handleTouchEnd(idx)}
                  onClick={() => {
                    if (Math.abs(offset) < 5) {
                      openEditModal(idx)
                    }
                  }}
                >
                  <Card className="border-[#E5E1D8]">
                    <CardContent className="p-3">
                      <View className="flex flex-row items-center justify-between">
                        <View className="flex flex-col flex-1">
                          <View className="flex flex-row items-center gap-2">
                            <Text className="block text-base font-semibold text-[#1A1A1A]">{item.note || '未命名'}</Text>
                            <Text className="block text-lg font-bold text-[#E8913A]">
                              {item.amount != null ? `¥${item.amount}` : '待定'}
                            </Text>
                          </View>
                          <View className="flex flex-row items-center gap-2 mt-1">
                            <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{item.category || '其他'}</Badge>
                            {item.tag && <Text className="text-xs text-[#E8913A]">{item.tag}</Text>}
                          </View>
                        </View>
                      </View>
                    </CardContent>
                  </Card>
                </View>
              </View>
            )
          })}

          {/* Save All button */}
          <Button className="w-full bg-[#3D7C5F] text-white rounded-xl mt-2" onClick={handleSaveAll}>
            <Text className="text-white text-sm font-medium">全部保存</Text>
          </Button>
        </View>
      )}

      {/* Edit Modal - same style as bills page */}
      {editingIdx !== null && (
        <View className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="w-full bg-[#F7F5F0] rounded-t-2xl" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <ScrollView scrollY className="flex-1 w-full">
              <View className="p-5 pb-4">
                {/* Header */}
                <View className="flex flex-row items-center justify-between mb-4">
                  <Text className="block text-lg font-semibold text-[#1A1A1A]">编辑记录</Text>
                  <Button className="bg-transparent p-0" onClick={closeEditModal}>
                    <X size={20} color="#999" />
                  </Button>
                </View>

                {/* Name + Amount on same line */}
                <View className="flex flex-row items-center gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-gray-500 mb-1">名称</Text>
                    <View className="bg-white rounded-lg px-3 py-2">
                      <Input
                        className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0"
                        value={editNote}
                        onInput={(e) => setEditNote(e.detail.value)}
                        placeholder="消费名称"
                      />
                    </View>
                  </View>
                  <View style={{ width: '100px' }}>
                    <Text className="block text-sm text-gray-500 mb-1">金额</Text>
                    <View className="bg-white rounded-lg px-3 py-2">
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
                  <Text className="block text-sm text-gray-500 mb-1">分类</Text>
                  <ScrollView scrollY className="w-full bg-white rounded-lg" style={{ maxHeight: '130px' }}>
                    <View className="flex flex-row flex-wrap gap-2 p-3">
                      {filteredCategories.map(cat => (
                        <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                          <Badge className={`${editCategory === cat.name ? 'bg-[#3D7C5F] text-white' : 'bg-[#F7F5F0] text-gray-500'} text-xs px-3 py-1`}>
                            {cat.name}
                          </Badge>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  {/* Search + Custom in one row */}
                  <View className="flex flex-row items-center gap-2 mt-2">
                    <View className="flex-1 bg-white rounded-lg px-3 py-2 flex flex-row items-center gap-2" style={{ minHeight: '36px' }}>
                      <Search size={12} color="#999" />
                      <Input
                        className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                        placeholder="搜索..."
                        value={catSearch}
                        onInput={(e) => setCatSearch(e.detail.value)}
                      />
                    </View>
                    {showCatInput ? (
                      <View className="flex-1 bg-white rounded-lg px-3 py-2 flex flex-row items-center gap-1">
                        <Input
                          className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                          placeholder="新分类名"
                          value={newCatName}
                          onInput={(e) => setNewCatName(e.detail.value)}
                          onConfirm={() => handleCreateCategory()}
                        />
                        <View className="px-2 py-1 bg-[#3D7C5F] rounded" onClick={handleCreateCategory}>
                          <Text className="text-white text-xs">加</Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        className="flex-1 bg-[#FFF7ED] rounded-lg flex flex-row items-center justify-center gap-1 py-2"
                        onClick={() => setShowCatInput(true)}
                      >
                        <Plus size={14} color="#E8913A" />
                        <Text className="text-xs text-[#E8913A] font-medium">自定义分类</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Date + Save in one row */}
                <View className="flex flex-row items-end gap-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-gray-500 mb-1">日期</Text>
                    <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                      <View className="bg-white rounded-lg px-3 py-2 flex flex-row items-center gap-2">
                        <Calendar size={14} color="#3D7C5F" />
                        <Text className="text-sm text-[#3D7C5F]">{editDate}</Text>
                      </View>
                    </Picker>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      className="w-full bg-[#3D7C5F] text-white rounded-lg py-2"
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
