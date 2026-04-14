import { useState, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Receipt, Trash2, ChevronLeft, ChevronRight, Calendar, Search, Plus, X } from 'lucide-react-taro'
import { useExpenseStore, ExpenseRecord } from '@/store/expense-store'

interface GroupedExpenses {
  [date: string]: ExpenseRecord[]
}

const BillsPage = () => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [groupedExpenses, setGroupedExpenses] = useState<GroupedExpenses>({})
  const [monthTotal, setMonthTotal] = useState(0)

  // Track the dataVersion we last fetched at, skip re-fetch if we just mutated
  const lastFetchedVersion = useRef(0)
  const skipNextVersionBump = useRef(false)

  // Edit modal state
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

    const data = await useExpenseStore.getState().fetchExpensesByMonth(startDate, endDate)
    const grouped: GroupedExpenses = {}
    let total = 0
    data.forEach((item) => {
      if (!grouped[item.expense_date]) {
        grouped[item.expense_date] = []
      }
      grouped[item.expense_date].push(item)
      total += Number(item.amount)
    })
    setGroupedExpenses(grouped)
    setMonthTotal(total)
    lastFetchedVersion.current = dataVersion
  }

  // Refresh on every tab switch
  useDidShow(() => {
    loadData()
    fetchCategories()
  })

  // Refresh when dataVersion changes (other tabs mutated data)
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
    const res = await Taro.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定要删除这条记录吗？',
    })
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
    setEditingRecord(item)
    setEditAmount(String(item.amount))
    setEditCategory(item.category)
    setEditNote(item.note || '')
    setEditDate(item.expense_date)
    setCatSearch('')
    setShowCatInput(false)
    setNewCatName('')
  }

  const closeEditModal = () => {
    setEditingRecord(null)
    setCatSearch('')
    setShowCatInput(false)
  }

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
        // If category changed, save preference
        if (editCategory !== editingRecord.category && editNote) {
          savePreference(editNote, editCategory)
        }
        // Optimistically update local grouped data
        setGroupedExpenses(prev => {
          const next: GroupedExpenses = {}
          let total = 0
          Object.entries(prev).forEach(([, items]) => {
            const updated = items.map(item => {
              if (item.id === editingRecord.id) {
                return {
                  ...item,
                  amount: editAmount,
                  category: editCategory,
                  note: editNote,
                  expense_date: editDate,
                }
              }
              return item
            })
            // Re-group by date in case date changed
            updated.forEach(item => {
              if (!next[item.expense_date]) next[item.expense_date] = []
              // Avoid duplicates
              if (!next[item.expense_date].find(i => i.id === item.id)) {
                next[item.expense_date].push(item)
              }
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
      console.error('更新失败', err)
      Taro.showToast({ title: '更新失败', icon: 'none' })
    } finally {
      setIsUpdating(false)
    }
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

  const prevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number)
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    setCurrentMonth(prev)
  }

  const nextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    setCurrentMonth(next)
  }

  const sortedDates = Object.keys(groupedExpenses).sort().reverse()

  const filteredCategories = categories.filter(c =>
    !catSearch || c.name.includes(catSearch)
  )

  return (
    <View className="min-h-full bg-[#F7F5F0] pb-20">
      {/* Month Selector */}
      <View className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
        <Button className="bg-transparent p-0" onClick={prevMonth}>
          <ChevronLeft size={24} color="#3D7C5F" />
        </Button>
        <Text className="block text-lg font-semibold text-[#1A1A1A]">{currentMonth}</Text>
        <Button className="bg-transparent p-0" onClick={nextMonth}>
          <ChevronRight size={24} color="#3D7C5F" />
        </Button>
      </View>

      {/* Month Total */}
      <View className="px-4 mb-3">
        <Card className="border-[#E5E1D8] bg-[#3D7C5F]">
          <CardContent className="p-4 flex flex-row items-center justify-between">
            <Text className="block text-white text-sm">本月支出</Text>
            <Text className="block text-white text-2xl font-bold">¥{monthTotal.toFixed(2)}</Text>
          </CardContent>
        </Card>
      </View>

      {/* Expense List by Date */}
      {sortedDates.map((date) => {
        const dayTotal = groupedExpenses[date].reduce((sum, item) => sum + Number(item.amount), 0)
        return (
          <View key={date} className="px-4 mb-3">
            <View className="flex flex-row items-center justify-between mb-1 px-1">
              <Text className="block text-sm font-medium text-[#1A1A1A]">{date}</Text>
              <Text className="block text-sm text-[#E8913A]">¥{dayTotal.toFixed(2)}</Text>
            </View>
            {groupedExpenses[date].map((item) => (
              <Card key={item.id} className="border-[#E5E1D8] mb-2">
                <CardContent className="p-3 flex flex-row items-center justify-between">
                  <View className="flex flex-col flex-1" onClick={() => openEditModal(item)}>
                    {/* Line 1: Name + Amount */}
                    <View className="flex flex-row items-center gap-2">
                      <Text className="block text-base font-semibold text-[#1A1A1A]">
                        {item.note || item.raw_text || '未命名'}
                      </Text>
                      <Text className="block text-lg font-bold text-[#E8913A]">¥{item.amount}</Text>
                    </View>
                    {/* Line 2: Category */}
                    <View className="flex flex-row items-center gap-2 mt-1">
                      <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{item.category}</Badge>
                      {item.tag && <Text className="text-xs text-[#E8913A]">{item.tag}</Text>}
                    </View>
                  </View>
                  <View className="flex flex-row items-center">
                    <Button className="bg-transparent p-0" onClick={() => handleDelete(item.id)}>
                      <Trash2 size={16} color="#EF4444" />
                    </Button>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )
      })}

      {/* Empty State */}
      {sortedDates.length === 0 && (
        <View className="flex flex-col items-center justify-center mt-24">
          <Receipt size={48} color="#E5E1D8" />
          <Text className="block text-gray-400 mt-4 text-sm">本月暂无记录</Text>
        </View>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <View className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="w-full bg-[#F7F5F0] rounded-t-2xl p-5 pb-4">
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
              {/* Search */}
              <View className="bg-white rounded-lg px-3 py-2 mb-2 flex flex-row items-center gap-2">
                <Search size={14} color="#999" />
                <Input
                  className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0 flex-1"
                  placeholder="搜索分类..."
                  value={catSearch}
                  onInput={(e) => setCatSearch(e.detail.value)}
                />
              </View>
              {/* Category list */}
              <ScrollView scrollY className="w-full bg-white rounded-lg" style={{ maxHeight: '100px' }}>
                <View className="flex flex-row flex-wrap gap-1 p-2">
                  {filteredCategories.map(cat => (
                    <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                      <Badge className={`${editCategory === cat.name ? 'bg-[#3D7C5F] text-white' : 'bg-[#F7F5F0] text-gray-500'} text-xs`}>
                        {cat.name}
                      </Badge>
                    </View>
                  ))}
                </View>
              </ScrollView>
              {/* Custom category */}
              {showCatInput ? (
                <View className="flex flex-row items-center gap-2 mt-2">
                  <View className="flex-1 bg-white rounded-lg px-3 py-2">
                    <Input
                      className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0"
                      placeholder="输入新分类名称"
                      value={newCatName}
                      onInput={(e) => setNewCatName(e.detail.value)}
                      onConfirm={() => handleCreateCategory()}
                    />
                  </View>
                  <Button className="bg-[#3D7C5F] text-white text-xs px-3 py-2 rounded-lg" onClick={handleCreateCategory}>
                    <Text className="text-white text-xs">添加</Text>
                  </Button>
                </View>
              ) : (
                <View
                  className="flex flex-row items-center gap-1 mt-2 px-2 py-1 bg-[#FFF7ED] rounded-lg self-start"
                  onClick={() => setShowCatInput(true)}
                >
                  <Plus size={12} color="#E8913A" />
                  <Text className="text-xs text-[#E8913A]">自定义分类</Text>
                </View>
              )}
            </View>

            {/* Date */}
            <View className="mb-2">
              <Text className="block text-sm text-gray-500 mb-1">日期</Text>
              <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                <View className="bg-white rounded-lg px-3 py-2 flex flex-row items-center gap-2">
                  <Calendar size={14} color="#3D7C5F" />
                  <Text className="text-sm text-[#3D7C5F]">{editDate}</Text>
                </View>
              </Picker>
            </View>

            {/* Save button */}
            <Button
              className="w-full bg-[#3D7C5F] text-white rounded-xl"
              onClick={handleSaveEdit}
              disabled={isUpdating}
            >
              {isUpdating ? '保存中...' : '保存修改'}
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}

export default BillsPage
