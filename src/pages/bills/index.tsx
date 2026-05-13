import { useState, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView, Picker } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight, Receipt, Trash2, Zap, Hand, X, Calendar, Search, Plus } from 'lucide-react-taro'
import { useExpenseStore, ExpenseRecord } from '@/store/expense-store'

interface GroupedExpenses {
  [date: string]: ExpenseRecord[]
}

const BillsPage = () => {
  const now = new Date()
  const [currentMonth, setCurrentMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [groupedExpenses, setGroupedExpenses] = useState<GroupedExpenses>({})
  const [monthTotal, setMonthTotal] = useState(0)
  const lastFetchedVersion = useRef(-1)
  const skipNextVersionBump = useRef(false)

  // Edit modal
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editDate, setEditDate] = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [showCatInput, setShowCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const { deleteExpense, dataVersion, updateExpense, categories, fetchCategories, createCategory, savePreference } = useExpenseStore()

  const loadData = async () => {
    const startDate = `${currentMonth}-01`
    const [year, month] = currentMonth.split('-')
    const nextMonth = month === '12' ? `${Number(year) + 1}-01` : `${year}-${String(Number(month) + 1).padStart(2, '0')}`
    const endDate = `${nextMonth}-01`

    const [data, subBillings] = await Promise.all([
      useExpenseStore.getState().fetchExpensesByMonth(startDate, endDate),
      useExpenseStore.getState().fetchSubscriptionBillings(startDate, endDate),
    ])

    const grouped: GroupedExpenses = {}
    let total = 0

    data.forEach((item) => {
      if (!grouped[item.expense_date]) grouped[item.expense_date] = []
      grouped[item.expense_date].push(item)
      total += Number(item.amount)
    })

    subBillings.forEach((item: any) => {
      const date = item.expense_date
      if (!grouped[date]) grouped[date] = []
      grouped[date].push({
        id: item.id, amount: item.amount, category: item.category, tag: '',
        note: item.name, raw_text: '', source_type: 'subscription',
        expense_date: date, created_at: '', is_subscription: true,
        cycle: item.cycle, subscription_id: item.subscription_id,
        billing_type: item.billing_type || 'auto',
      })
      total += Number(item.amount)
    })

    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => {
        if (a.is_subscription && !b.is_subscription) return -1
        if (!a.is_subscription && b.is_subscription) return 1
        return 0
      })
    })

    setGroupedExpenses(grouped)
    setMonthTotal(total)
    lastFetchedVersion.current = dataVersion
  }

  useDidShow(() => { loadData(); fetchCategories() })

  if (dataVersion !== lastFetchedVersion.current && dataVersion > 0) {
    if (skipNextVersionBump.current) {
      lastFetchedVersion.current = dataVersion
      skipNextVersionBump.current = false
    } else {
      lastFetchedVersion.current = dataVersion
      loadData()
    }
  }

  const handleDelete = async (id: string) => {
    const res = await Taro.showModal({ title: '确认删除', content: '删除后不可恢复，确定要删除这条记录吗？' })
    if (!res.confirm) return
    skipNextVersionBump.current = true
    await deleteExpense(id)
    setGroupedExpenses(prev => {
      const next: GroupedExpenses = {}
      let total = 0
      Object.entries(prev).forEach(([date, items]) => {
        const filtered = items.filter(item => item.id !== id)
        if (filtered.length > 0) {
          next[date] = filtered
          filtered.forEach(item => { total += Number(item.amount) })
        }
      })
      setMonthTotal(total)
      return next
    })
    Taro.showToast({ title: '已删除', icon: 'success' })
  }

  const openEditModal = (item: ExpenseRecord) => {
    setEditingRecord(item); setEditAmount(String(item.amount)); setEditCategory(item.category)
    setEditNote(item.note || ''); setEditDate(item.expense_date); setCatSearch(''); setShowCatInput(false); setNewCatName('')
  }

  const closeEditModal = () => { setEditingRecord(null); setCatSearch(''); setShowCatInput(false) }

  const handleSaveEdit = async () => {
    if (!editingRecord) return
    setIsUpdating(true)
    try {
      const updates: Partial<ExpenseRecord> = {}
      if (editAmount !== String(editingRecord.amount)) updates.amount = editAmount
      if (editCategory !== editingRecord.category) updates.category = editCategory
      if (editNote !== (editingRecord.note || '')) updates.note = editNote
      if (editDate !== editingRecord.expense_date) updates.expense_date = editDate
      if (Object.keys(updates).length > 0) {
        skipNextVersionBump.current = true
        await updateExpense(editingRecord.id, updates)
        if (editCategory !== editingRecord.category && editNote) savePreference(editNote, editCategory)
        setGroupedExpenses(prev => {
          const next: GroupedExpenses = {}
          let total = 0
          Object.entries(prev).forEach(([, items]) => {
            const updated = items.map(item => {
              if (item.id === editingRecord.id) return { ...item, amount: editAmount, category: editCategory, note: editNote, expense_date: editDate }
              return item
            })
            updated.forEach(item => {
              if (!next[item.expense_date]) next[item.expense_date] = []
              if (!next[item.expense_date].find(i => i.id === item.id)) { next[item.expense_date].push(item) }
              total += Number(item.amount)
            })
          })
          setMonthTotal(total)
          return next
        })
        Taro.showToast({ title: '已更新', icon: 'success' })
      }
      closeEditModal()
    } catch (err) {
      console.error('更新失败', err); Taro.showToast({ title: '更新失败', icon: 'none' })
    } finally { setIsUpdating(false) }
  }

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return
    try {
      await createCategory(newCatName.trim()); setNewCatName(''); setShowCatInput(false); setCatSearch('')
      Taro.showToast({ title: '分类已添加', icon: 'success' })
    } catch (err) { console.error('创建分类失败', err) }
  }

  const prevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number)
    setCurrentMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number)
    setCurrentMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`)
  }

  const sortedDates = Object.keys(groupedExpenses).sort().reverse()
  const filteredCategories = categories.filter(c => !catSearch || c.name.includes(catSearch))

  return (
    <View className="min-h-full" style={{ backgroundColor: '#F7F8FA' }}>
      {/* Month Selector */}
      <View className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
        <Button className="bg-transparent p-0" onClick={prevMonth}>
          <ChevronLeft size={24} color="#2563EB" />
        </Button>
        <Text className="block text-lg font-semibold text-foreground">{currentMonth}</Text>
        <Button className="bg-transparent p-0" onClick={nextMonth}>
          <ChevronRight size={24} color="#2563EB" />
        </Button>
      </View>

      {/* Month Total - Gradient Card */}
      <View className="mx-4 mb-3 rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}>
        <View className="flex flex-row items-center justify-between">
          <View>
            <Text className="block text-white text-sm opacity-80">本月支出</Text>
            <Text className="block text-white text-3xl font-bold mt-1">¥{monthTotal.toFixed(2)}</Text>
          </View>
          <View className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <Receipt size={24} color="#fff" />
          </View>
        </View>
      </View>

      {/* Expense List by Date */}
      {sortedDates.map((date) => {
        const dayTotal = groupedExpenses[date].reduce((sum, item) => sum + Number(item.amount), 0)
        return (
          <View key={date} className="mx-4 mb-3">
            <View className="flex flex-row items-center justify-between mb-2 px-1">
              <Text className="block text-sm font-medium text-slate-500">{date}</Text>
              <Text className="block text-sm font-semibold text-amber-500">-¥{dayTotal.toFixed(2)}</Text>
            </View>
            {groupedExpenses[date].map((item) => (
              <View key={item.id}
                className="bg-white rounded-2xl p-4 mb-2"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                onClick={() => !item.is_subscription && openEditModal(item)}
              >
                <View className="flex flex-row items-center justify-between">
                  <View className="flex flex-row items-center gap-3 flex-1 min-w-0">
                    <View className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.is_subscription ? 'bg-purple-50' : 'bg-blue-50'}`}>
                      {item.is_subscription
                        ? (item.billing_type === 'manual' ? <Hand size={18} color="#7C3AED" /> : <Zap size={18} color="#7C3AED" />)
                        : <Receipt size={18} color="#2563EB" />
                      }
                    </View>
                    <View className="flex flex-col flex-1 min-w-0">
                      <Text className="block text-base font-medium text-foreground truncate">{item.note || item.raw_text || '未命名'}</Text>
                      <View className="flex flex-row items-center gap-1.5 mt-1">
                        <View className="bg-slate-100 rounded-full px-2 py-1">
                          <Text className="text-xs text-slate-500">{item.category}</Text>
                        </View>
                        {item.is_subscription && (
                          <>
                            <View className="bg-purple-50 rounded-full px-2 py-1">
                              <Text className="text-xs text-purple-600">{item.cycle === 'monthly' ? '月' : item.cycle === 'quarterly' ? '季' : item.cycle === 'yearly' ? '年' : ''}订阅</Text>
                            </View>
                            <View className={`${item.billing_type === 'manual' ? 'bg-amber-50' : 'bg-blue-50'} rounded-full px-2 py-1`}>
                              <Text className={`text-xs ${item.billing_type === 'manual' ? 'text-amber-600' : 'text-blue-600'}`}>{item.billing_type === 'manual' ? '手动' : '自动'}</Text>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                  <View className="flex flex-col items-end flex-shrink-0 ml-3">
                    <Text className="block text-lg font-bold text-foreground">-¥{item.amount}</Text>
                    {!item.is_subscription && (
                      <Button className="bg-transparent p-0 mt-1" onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}>
                        <Trash2 size={14} color="#EF4444" />
                      </Button>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )
      })}

      {/* Empty State */}
      {sortedDates.length === 0 && (
        <View className="flex flex-col items-center justify-center mt-24">
          <View className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
            <Receipt size={28} color="#2563EB" />
          </View>
          <Text className="block text-slate-400 mt-4 text-sm">本月暂无记录</Text>
        </View>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <View className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="w-full bg-white rounded-t-2xl" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <ScrollView scrollY className="flex-1 w-full">
              <View className="p-5 pb-4">
                <View className="flex flex-row items-center justify-between mb-4">
                  <Text className="block text-lg font-semibold text-foreground">编辑记录</Text>
                  <Button className="bg-transparent p-0" onClick={closeEditModal}>
                    <X size={20} color="#94A3B8" />
                  </Button>
                </View>
                <View className="flex flex-row items-center gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-slate-500 mb-1">名称</Text>
                    <View className="bg-slate-50 rounded-xl px-3 py-2">
                      <Input className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0" value={editNote} onInput={(e) => setEditNote(e.detail.value)} placeholder="消费名称" />
                    </View>
                  </View>
                  <View style={{ width: '100px' }}>
                    <Text className="block text-sm text-slate-500 mb-1">金额</Text>
                    <View className="bg-slate-50 rounded-xl px-3 py-2">
                      <Input className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0" type="digit" value={editAmount} onInput={(e) => setEditAmount(e.detail.value)} placeholder="金额" />
                    </View>
                  </View>
                </View>
                <View className="mb-3">
                  <Text className="block text-sm text-slate-500 mb-1">分类</Text>
                  <ScrollView scrollY className="w-full bg-slate-50 rounded-xl" style={{ maxHeight: '130px' }}>
                    <View className="flex flex-row flex-wrap gap-2 p-3">
                      {filteredCategories.map(cat => (
                        <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                          <View className={`${editCategory === cat.name ? 'bg-blue-500 text-white' : 'bg-white text-slate-500'} rounded-full px-3 py-1`}>
                            <Text className={`text-xs ${editCategory === cat.name ? 'text-white' : 'text-slate-500'}`}>{cat.name}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  <View className="flex flex-row items-center gap-2 mt-2">
                    <View className="flex-1 bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-2" style={{ minHeight: '36px' }}>
                      <Search size={12} color="#94A3B8" />
                      <Input className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1" placeholder="搜索..." value={catSearch} onInput={(e) => setCatSearch(e.detail.value)} />
                    </View>
                    {showCatInput ? (
                      <View className="flex-1 bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-1">
                        <Input className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1" placeholder="新分类名" value={newCatName} onInput={(e) => setNewCatName(e.detail.value)} onConfirm={() => handleCreateCategory()} />
                        <View className="px-2 py-1 bg-blue-500 rounded" onClick={handleCreateCategory}>
                          <Text className="text-white text-xs">加</Text>
                        </View>
                      </View>
                    ) : (
                      <View className="flex-1 bg-blue-50 rounded-xl flex flex-row items-center justify-center gap-1 py-2" onClick={() => setShowCatInput(true)}>
                        <Plus size={14} color="#2563EB" />
                        <Text className="text-xs text-blue-600 font-medium">自定义分类</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View className="flex flex-row items-end gap-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-slate-500 mb-1">日期</Text>
                    <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                      <View className="bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-2">
                        <Calendar size={14} color="#2563EB" />
                        <Text className="text-sm text-blue-600">{editDate}</Text>
                      </View>
                    </Picker>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button className="w-full text-white rounded-xl py-2" style={{ background: '#2563EB' }} onClick={handleSaveEdit} disabled={isUpdating}>
                      <Text className="text-white text-sm font-medium">{isUpdating ? '保存中...' : '完成编辑'}</Text>
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

export default BillsPage
