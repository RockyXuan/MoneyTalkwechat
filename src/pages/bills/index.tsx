import { useState, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Receipt, Trash2, ChevronLeft, ChevronRight, Calendar, Search, Plus, X, Zap, Hand } from 'lucide-react-taro'
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

    // Fetch expenses and subscription billings in parallel
    const [data, subBillings] = await Promise.all([
      useExpenseStore.getState().fetchExpensesByMonth(startDate, endDate),
      useExpenseStore.getState().fetchSubscriptionBillings(startDate, endDate),
    ])

    const grouped: GroupedExpenses = {}
    let total = 0

    // Add regular expenses
    data.forEach((item) => {
      if (!grouped[item.expense_date]) {
        grouped[item.expense_date] = []
      }
      grouped[item.expense_date].push(item)
      total += Number(item.amount)
    })

    // Add subscription billing events
    subBillings.forEach((item: any) => {
      const date = item.expense_date
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push({
        id: item.id,
        amount: item.amount,
        category: item.category,
        tag: '',
        note: item.name,
        raw_text: '',
        source_type: 'subscription',
        expense_date: date,
        created_at: '',
        is_subscription: true,
        cycle: item.cycle,
        subscription_id: item.subscription_id,
        billing_type: item.billing_type || 'auto',
      })
      total += Number(item.amount)
    })

    // Sort each date group: subscriptions first, then by id
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
    <View className="min-h-full bg-background pb-20">
      {/* Month Selector */}
      <View className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
        <Button className="bg-transparent p-0" onClick={prevMonth}>
          <ChevronLeft size={24} color="var(--color-primary)" />
        </Button>
        <Text className="block text-lg font-semibold text-foreground">{currentMonth}</Text>
        <Button className="bg-transparent p-0" onClick={nextMonth}>
          <ChevronRight size={24} color="var(--color-primary)" />
        </Button>
      </View>

      {/* Month Total */}
      <View className="px-4 mb-3">
        <Card className="border-border bg-primary">
          <CardContent className="p-4 flex flex-row items-center justify-between">
            <Text className="block text-primary-foreground text-sm">本月支出</Text>
            <Text className="block text-primary-foreground text-2xl font-bold">¥{monthTotal.toFixed(2)}</Text>
          </CardContent>
        </Card>
      </View>

      {/* Expense List by Date */}
      {sortedDates.map((date) => {
        const dayTotal = groupedExpenses[date].reduce((sum, item) => sum + Number(item.amount), 0)
        return (
          <View key={date} className="px-4 mb-3">
            <View className="flex flex-row items-center justify-between mb-1 px-1">
              <Text className="block text-sm font-medium text-foreground">{date}</Text>
              <Text className="block text-sm text-accent-foreground">¥{dayTotal.toFixed(2)}</Text>
            </View>
            {groupedExpenses[date].map((item) => (
              <Card key={item.id} className={`border-border mb-2 ${item.is_subscription ? 'bg-accent bg-opacity-20' : ''}`}>
                <CardContent className="p-3 flex flex-row items-center justify-between">
                  <View className="flex flex-col flex-1" onClick={() => !item.is_subscription && openEditModal(item)}>
                    {/* Line 1: Name + Amount */}
                    <View className="flex flex-row items-center gap-2">
                      {item.is_subscription && (item.billing_type === 'manual' ? <Hand size={12} color="var(--color-primary)" /> : <Zap size={12} color="var(--color-primary)" />)}
                      <Text className="block text-base font-semibold text-foreground">
                        {item.note || item.raw_text || '未命名'}
                      </Text>
                      <Text className="block text-lg font-bold text-accent-foreground">¥{item.amount}</Text>
                    </View>
                    {/* Line 2: Category */}
                    <View className="flex flex-row items-center gap-2 mt-1">
                      <Badge className="bg-primary bg-opacity-10 text-primary text-xs">{item.category}</Badge>
                      {item.is_subscription && (
                        <View className="flex flex-row items-center gap-1">
                          <Badge className="bg-accent text-accent-foreground text-xs">
                            {item.cycle === 'monthly' ? '月订阅' : item.cycle === 'quarterly' ? '季订阅' : item.cycle === 'yearly' ? '年订阅' : '订阅'}
                          </Badge>
                          <Badge className={`${item.billing_type === 'manual' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'} text-xs`}>
                            {item.billing_type === 'manual' ? '手动' : '自动'}
                          </Badge>
                        </View>
                      )}
                      {!item.is_subscription && item.tag && <Text className="text-xs text-accent-foreground">{item.tag}</Text>}
                    </View>
                  </View>
                  <View className="flex flex-row items-center">
                    {!item.is_subscription && (
                      <Button className="bg-transparent p-0" onClick={() => handleDelete(item.id)}>
                        <Trash2 size={16} color="var(--color-destructive)" />
                      </Button>
                    )}
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
          <Receipt size={48} color="var(--color-muted-foreground)" />
          <Text className="block text-muted-foreground mt-4 text-sm">本月暂无记录</Text>
        </View>
      )}

      {/* Edit Modal */}
      {editingRecord && (
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
                    <View className="bg-card rounded-lg px-3 py-2">
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
                    <View className="bg-card rounded-lg px-3 py-2">
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
                  {/* Category grid - 3+ rows */}
                  <ScrollView scrollY className="w-full bg-card rounded-lg" style={{ maxHeight: '130px' }}>
                    <View className="flex flex-row flex-wrap gap-2 p-3">
                      {filteredCategories.map(cat => (
                        <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                          <Badge className={`${editCategory === cat.name ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} text-xs px-3 py-1`}>
                            {cat.name}
                          </Badge>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  {/* Search + Custom in one row */}
                  <View className="flex flex-row items-center gap-2 mt-2">
                    <View className="flex-1 bg-card rounded-lg px-3 py-2 flex flex-row items-center gap-2" style={{ minHeight: '36px' }}>
                      <Search size={12} color="#999" />
                      <Input
                        className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                        placeholder="搜索..."
                        value={catSearch}
                        onInput={(e) => setCatSearch(e.detail.value)}
                      />
                    </View>
                    {showCatInput ? (
                      <View className="flex-1 bg-card rounded-lg px-3 py-2 flex flex-row items-center gap-1">
                        <Input
                          className="border-0 bg-transparent text-xs ring-0 focus-within:ring-0 flex-1"
                          placeholder="新分类名"
                          value={newCatName}
                          onInput={(e) => setNewCatName(e.detail.value)}
                          onConfirm={() => handleCreateCategory()}
                        />
                        <View className="px-2 py-1 bg-primary rounded" onClick={handleCreateCategory}>
                          <Text className="text-primary-foreground text-xs">加</Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        className="flex-1 bg-accent rounded-lg flex flex-row items-center justify-center gap-1 py-2"
                        onClick={() => setShowCatInput(true)}
                      >
                        <Plus size={14} color="var(--color-primary)" />
                        <Text className="text-xs text-primary font-medium">自定义分类</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Date + Save in one row */}
                <View className="flex flex-row items-end gap-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-muted-foreground mb-1">日期</Text>
                    <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                      <View className="bg-card rounded-lg px-3 py-2 flex flex-row items-center gap-2">
                        <Calendar size={14} color="var(--color-primary)" />
                        <Text className="text-sm text-primary">{editDate}</Text>
                      </View>
                    </Picker>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      className="w-full bg-primary text-primary-foreground rounded-lg py-2"
                      onClick={handleSaveEdit}
                      disabled={isUpdating}
                    >
                      <Text className="text-primary-foreground text-sm font-medium">{isUpdating ? '保存中...' : '完成编辑'}</Text>
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
