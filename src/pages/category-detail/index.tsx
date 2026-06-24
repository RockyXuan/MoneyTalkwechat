import { useState, useRef } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Calendar, Search, Plus, X, Receipt } from 'lucide-react-taro'
import { useExpenseStore, ExpenseRecord } from '@/store/expense-store'
import { Network } from '@/network'
import { AppCard, BackButton, EmptyState, MoneyHero, PageHeader, Pill, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY } from '@/components/app/finance-ui'

const DEFAULT_USER_ID = 'default_user'

interface GroupedExpenses {
  [date: string]: ExpenseRecord[]
}

const CategoryDetailPage = () => {
  const router = useRouter()
  const category = decodeURIComponent(router.params.category || '')
  const startDate = decodeURIComponent(router.params.startDate || '')
  const endDate = decodeURIComponent(router.params.endDate || '')
  const periodLabel = decodeURIComponent(router.params.periodLabel || '')

  const [groupedExpenses, setGroupedExpenses] = useState<GroupedExpenses>({})
  const [totalAmount, setTotalAmount] = useState(0)

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
    try {
      let url = `/api/expenses?user_id=${DEFAULT_USER_ID}&start_date=${startDate}&end_date=${endDate}&category=${encodeURIComponent(category)}&limit=500`
      const res = await Network.request({ url })
      console.log('categoryDetail loadData:', res.data)
      const resp = res.data as { code: number; msg: string; data: ExpenseRecord[] }
      const data = resp?.data || []

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
      setTotalAmount(total)
      lastFetchedVersion.current = dataVersion
    } catch (err) {
      console.error('loadData error:', err)
    }
  }

  useDidShow(() => {
    loadData()
    fetchCategories()
  })

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
      Object.entries(prev).forEach(([, items]) => {
        const filtered = items.filter(item => item.id !== id)
        if (filtered.length > 0) {
          next[items[0]?.expense_date || ''] = filtered
          filtered.forEach(item => { total += Number(item.amount) })
        }
      })
      setTotalAmount(total)
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
        if (editCategory !== editingRecord.category && editNote) {
          savePreference(editNote, editCategory)
        }
        // Optimistically update local data
        setGroupedExpenses(prev => {
          const next: GroupedExpenses = {}
          let total = 0
          Object.entries(prev).forEach(([, items]) => {
            const updated = items.map(item => {
              if (item.id === editingRecord.id) {
                return { ...item, amount: editAmount, category: editCategory, note: editNote, expense_date: editDate }
              }
              return item
            })
            updated.forEach(item => {
              if (!next[item.expense_date]) next[item.expense_date] = []
              if (!next[item.expense_date].find(i => i.id === item.id)) {
                next[item.expense_date].push(item)
              }
              total += Number(item.amount)
            })
          })
          setTotalAmount(total)
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

  const sortedDates = Object.keys(groupedExpenses).sort().reverse()
  const filteredCategories = categories.filter(c => !catSearch || c.name.includes(catSearch))

  return (
    <View className="min-h-full" style={{ backgroundColor: '#F5F8FF' }}>
      <PageHeader
        title={category || '分类详情'}
        subtitle={periodLabel || '分类支出明细'}
        left={<BackButton />}
      />
      <MoneyHero label="分类支出" amount={`¥${totalAmount.toFixed(2)}`} caption={periodLabel} icon={Receipt}>
        <View className="flex flex-row">
          <Pill tone="blue">{category || '全部'}</Pill>
        </View>
      </MoneyHero>

      {/* Expense List by Date */}
      <ScrollView scrollY className="pb-20">
        {sortedDates.map((date) => {
          const dayTotal = groupedExpenses[date].reduce((sum, item) => sum + Number(item.amount), 0)
          return (
            <View key={date} className="px-5 mb-3">
              <View className="flex flex-row items-center justify-between mb-2 px-1 mt-4">
                <Text className="block text-sm font-semibold" style={{ color: TEXT_SECONDARY }}>{date}</Text>
                <Text className="block text-sm font-bold" style={{ color: '#EF4444' }}>¥{dayTotal.toFixed(2)}</Text>
              </View>
              {groupedExpenses[date].map((item) => (
                <AppCard key={item.id} className="mb-2 p-4">
                  <View className="flex flex-row items-center justify-between">
                    <View className="flex flex-row items-center gap-3 flex-1 min-w-0" onClick={() => openEditModal(item)}>
                      <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EAF1FF' }}>
                        <Receipt size={18} color="#2F7BFF" />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="block text-base font-semibold" style={{ color: TEXT_PRIMARY }} numberOfLines={1}>
                          {item.note || item.raw_text || '未命名'}
                        </Text>
                        <View className="flex flex-row items-center gap-2 mt-1">
                          <Pill tone="gray">{item.category}</Pill>
                          {item.tag ? <Text className="text-xs" style={{ color: TEXT_MUTED }}>{item.tag}</Text> : null}
                        </View>
                      </View>
                    </View>
                    <View className="flex flex-row items-center gap-2">
                      <Text className="block text-lg font-bold" style={{ color: '#EF4444' }}>¥{item.amount}</Text>
                      <View onClick={() => handleDelete(item.id)}>
                        <Trash2 size={16} color="#EF4444" />
                      </View>
                    </View>
                  </View>
                </AppCard>
              ))}
            </View>
          )
        })}

        {/* Empty State */}
        {sortedDates.length === 0 && (
          <EmptyState icon={Receipt} title="该分类暂无记录" description="从统计页进入后，会展示该时间范围内的分类明细。" />
        )}
      </ScrollView>

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
                    <X size={20} color="#999" />
                  </Button>
                </View>

                {/* Name + Amount */}
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
                  {/* Category grid - 3+ rows */}
                  <ScrollView scrollY className="w-full bg-white rounded-lg" style={{ maxHeight: '130px' }}>
                    <View className="flex flex-row flex-wrap gap-2 p-3">
                      {filteredCategories.map(cat => (
                        <View key={cat.id} onClick={() => { setEditCategory(cat.name); setCatSearch('') }}>
                          <Badge className={`${editCategory === cat.name ? 'bg-primary text-primary-foreground' : 'bg-background text-gray-500'} text-xs px-3 py-1`}>
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
                        <View className="px-2 py-1 bg-primary rounded" onClick={handleCreateCategory}>
                          <Text className="text-primary-foreground text-xs">加</Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        className="flex-1 bg-warning bg-opacity-10 rounded-lg flex flex-row items-center justify-center gap-1 py-2"
                        onClick={() => setShowCatInput(true)}
                      >
                        <Plus size={14} color="#2F7BFF" />
                        <Text className="text-xs text-accent font-medium">自定义分类</Text>
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
                        <Calendar size={14} color="#2F7BFF" />
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

export default CategoryDetailPage

