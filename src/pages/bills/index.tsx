import { useState, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView, Picker } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Receipt, Trash2, Zap, Hand, X, Calendar, Search, Plus } from 'lucide-react-taro'
import { useExpenseStore, ExpenseRecord } from '@/store/expense-store'
import { AppTabBar, BLUE, PageHeader, RoundIconButton, SegmentControl, TEXT_SECONDARY } from '@/components/app/finance-ui'

interface GroupedExpenses {
  [date: string]: ExpenseRecord[]
}

type BillFilter = 'all' | 'expense' | 'subscription'

const BillsPage = () => {
  const now = new Date()
  const [currentMonth, setCurrentMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [groupedExpenses, setGroupedExpenses] = useState<GroupedExpenses>({})
  const [monthTotal, setMonthTotal] = useState(0)
  const lastFetchedVersion = useRef(-1)
  const skipNextVersionBump = useRef(false)

  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editDate, setEditDate] = useState('')
  const [catSearch, setCatSearch] = useState('')
  const [showCatInput, setShowCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [billFilter, setBillFilter] = useState<BillFilter>('all')

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

  const displayGroupedExpenses = Object.entries(groupedExpenses).reduce<GroupedExpenses>((acc, [date, items]) => {
    const filtered = items.filter(item => {
      if (billFilter === 'subscription') return item.is_subscription
      if (billFilter === 'expense') return !item.is_subscription
      return true
    })
    if (filtered.length > 0) acc[date] = filtered
    return acc
  }, {})
  const sortedDates = Object.keys(displayGroupedExpenses).sort().reverse()
  const filteredCategories = categories.filter(c => !catSearch || c.name.includes(catSearch))

  const monthExpense = monthTotal
  const subscriptionTotal = Object.values(groupedExpenses).flat().filter(item => item.is_subscription).reduce((sum, item) => sum + Number(item.amount), 0)
  const dailyTotal = monthExpense - subscriptionTotal

  return (
    <View className="min-h-full pb-36" style={{ backgroundColor: '#F8F9FC' }}>
      <PageHeader
        title="账单"
        subtitle="按月查看消费、订阅扣费和编辑记录"
        left={<RoundIconButton icon={Receipt} color={BLUE} />}
        right={<RoundIconButton icon={Calendar} color={TEXT_SECONDARY} />}
      />

      {/* Month Selector */}
      <View className="px-4 pb-2 flex flex-row items-center justify-between">
        <View onClick={prevMonth}>
          <ChevronLeft size={24} color="#2F7BFF" />
        </View>
        <Text className="block text-lg font-semibold text-[#151B2D]">{currentMonth}</Text>
        <View onClick={nextMonth}>
          <ChevronRight size={24} color="#2F7BFF" />
        </View>
      </View>

      {/* Month Total - Gradient Card */}
      <View className="mx-4 mb-3 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #2F7BFF, #65A0FF)', boxShadow: '0 16px 34px rgba(47,123,255,0.22)' }}>
        <View className="flex flex-row items-center justify-between">
          <View>
            <Text className="block text-white text-sm opacity-80">本月支出</Text>
            <Text className="block text-white text-3xl font-bold mt-1">¥{monthExpense.toFixed(2)}</Text>
          </View>
          <View className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <Receipt size={24} color="#fff" />
          </View>
        </View>
        <View className="flex flex-row gap-4 mt-3">
          <View className="flex-1 bg-white bg-opacity-15 rounded-xl p-2">
            <Text className="block text-white text-xs opacity-75">日常消费</Text>
            <Text className="block text-white text-base font-bold mt-1">¥{dailyTotal.toFixed(2)}</Text>
          </View>
          <View className="flex-1 bg-white bg-opacity-15 rounded-xl p-2">
            <Text className="block text-white text-xs opacity-75">订阅扣费</Text>
            <Text className="block text-white text-base font-bold mt-1">¥{subscriptionTotal.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View className="mx-4 mb-4">
        <SegmentControl<BillFilter>
          value={billFilter}
          options={[
            { label: '全部', value: 'all' },
            { label: '日常', value: 'expense' },
            { label: '订阅', value: 'subscription' },
          ]}
          onChange={setBillFilter}
        />
      </View>

      {/* Expense List by Date */}
      {sortedDates.map((date) => {
        const dayTotal = displayGroupedExpenses[date].reduce((sum, item) => sum + Number(item.amount), 0)
        return (
          <View key={date} className="mx-4 mb-3">
            <View className="flex flex-row items-center justify-between mb-2 px-1">
              <Text className="block text-sm font-medium text-[#647084]">{date}</Text>
              <Text className="block text-sm font-semibold text-[#F53F3F]">-¥{dayTotal.toFixed(2)}</Text>
            </View>
            {displayGroupedExpenses[date].map((item) => (
              <View key={item.id}
                className="bg-white rounded-2xl p-4 mb-2"
                onClick={() => !item.is_subscription && openEditModal(item)}
              >
                <View className="flex flex-row items-center justify-between">
                  <View className="flex flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.is_subscription ? '#EAF1FF' : '#EAF1FF' }}>
                      {item.is_subscription
                        ? (item.billing_type === 'manual' ? <Hand size={18} color="#2F7BFF" /> : <Zap size={18} color="#2F7BFF" />)
                        : <Receipt size={18} color="#2F7BFF" />
                      }
                    </View>
                    <View className="flex flex-col flex-1 min-w-0">
                      <Text className="block text-base font-medium text-[#151B2D] truncate">{item.note || item.raw_text || '未命名'}</Text>
                      <View className="flex flex-row items-center gap-1 mt-1">
                        <View className="rounded-full px-2 py-1" style={{ backgroundColor: '#F8F9FC' }}>
                          <Text className="text-xs text-[#647084]">{item.category}</Text>
                        </View>
                        {item.is_subscription && (
                          <>
                            <View className="rounded-full px-2 py-1" style={{ backgroundColor: '#EAF1FF' }}>
                              <Text className="text-xs text-[#2F7BFF]">{item.cycle === 'monthly' ? '月' : item.cycle === 'quarterly' ? '季' : item.cycle === 'yearly' ? '年' : ''}订阅</Text>
                            </View>
                            <View className="rounded-full px-2 py-1" style={{ backgroundColor: item.billing_type === 'manual' ? '#FFF7E8' : '#EAF1FF' }}>
                              <Text className="text-xs" style={{ color: item.billing_type === 'manual' ? '#FF7D00' : '#2F7BFF' }}>{item.billing_type === 'manual' ? '手动' : '自动'}</Text>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                  <View className="flex flex-col items-end flex-shrink-0 ml-3">
                    <Text className="block text-lg font-bold text-[#F53F3F]">-¥{item.amount}</Text>
                    {!item.is_subscription && (
                      <View className="mt-1" onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}>
                        <Trash2 size={14} color="#F53F3F" />
                      </View>
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
          <View className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EAF1FF' }}>
            <Receipt size={28} color="#2F7BFF" />
          </View>
          <Text className="block text-[#647084] mt-4 text-sm">本月暂无记录</Text>
        </View>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <View className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="w-full bg-white rounded-t-2xl" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <ScrollView scrollY className="flex-1 w-full">
              <View className="p-5 pb-4">
                <View className="flex flex-row items-center justify-between mb-4">
                  <Text className="block text-lg font-semibold text-[#151B2D]">编辑记录</Text>
                  <View onClick={closeEditModal}>
                    <X size={20} color="#647084" />
                  </View>
                </View>
                <View className="flex flex-row items-center gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-[#647084] mb-1">名称</Text>
                    <View className="rounded-xl px-3 py-2" style={{ backgroundColor: '#F8F9FC' }}>
                      <Input className="bg-transparent text-sm" value={editNote} onInput={(e) => setEditNote(e.detail.value)} placeholder="消费名称" />
                    </View>
                  </View>
                  <View style={{ width: '100px' }}>
                    <Text className="block text-sm text-[#647084] mb-1">金额</Text>
                    <View className="rounded-xl px-3 py-2" style={{ backgroundColor: '#F8F9FC' }}>
                      <Input className="bg-transparent text-sm" type="digit" value={editAmount} onInput={(e) => setEditAmount(e.detail.value)} placeholder="金额" />
                    </View>
                  </View>
                </View>
                <View className="mb-3">
                  <Text className="block text-sm text-[#647084] mb-1">分类</Text>
                  <ScrollView scrollY className="w-full rounded-xl" style={{ maxHeight: '130px', backgroundColor: '#F8F9FC' }}>
                    <View className="flex flex-row flex-wrap gap-2 p-3">
                      {filteredCategories.map(cat => (
                        <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                          <View className="rounded-full px-3 py-1"
                            style={{ backgroundColor: editCategory === cat.name ? '#2F7BFF' : '#fff' }}
                          >
                            <Text className="text-xs" style={{ color: editCategory === cat.name ? '#fff' : '#647084' }}>{cat.name}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  <View className="flex flex-row items-center gap-2 mt-2">
                    <View className="flex-1 rounded-xl px-3 py-2 flex flex-row items-center gap-2" style={{ minHeight: '36px', backgroundColor: '#F8F9FC' }}>
                      <Search size={12} color="#647084" />
                      <Input className="bg-transparent text-xs flex-1" placeholder="搜索..." value={catSearch} onInput={(e) => setCatSearch(e.detail.value)} />
                    </View>
                    {showCatInput ? (
                      <View className="flex-1 rounded-xl px-3 py-2 flex flex-row items-center gap-1" style={{ backgroundColor: '#F8F9FC' }}>
                        <Input className="bg-transparent text-xs flex-1" placeholder="新分类名" value={newCatName} onInput={(e) => setNewCatName(e.detail.value)} onConfirm={() => handleCreateCategory()} />
                        <View className="px-2 py-1 rounded" style={{ backgroundColor: '#2F7BFF' }} onClick={handleCreateCategory}>
                          <Text className="text-white text-xs">加</Text>
                        </View>
                      </View>
                    ) : (
                      <View className="flex-1 rounded-xl flex flex-row items-center justify-center gap-1 py-2" style={{ backgroundColor: '#EAF1FF' }} onClick={() => setShowCatInput(true)}>
                        <Plus size={14} color="#2F7BFF" />
                        <Text className="text-xs text-[#2F7BFF] font-medium">自定义分类</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View className="flex flex-row items-end gap-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-[#647084] mb-1">日期</Text>
                    <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                      <View className="rounded-xl px-3 py-2 flex flex-row items-center gap-2" style={{ backgroundColor: '#F8F9FC' }}>
                        <Calendar size={14} color="#2F7BFF" />
                        <Text className="text-sm text-[#2F7BFF]">{editDate}</Text>
                      </View>
                    </Picker>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button className="w-full text-white rounded-xl py-2" style={{ background: 'linear-gradient(135deg, #2F7BFF, #65A0FF)' }} onClick={handleSaveEdit} disabled={isUpdating}>
                      <Text className="text-white text-sm font-medium">{isUpdating ? '保存中...' : '完成编辑'}</Text>
                    </Button>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
      <AppTabBar active="bills" />
    </View>
  )
}

export default BillsPage

