import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Receipt, Trash2, ChevronLeft, ChevronRight } from 'lucide-react-taro'
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

  const { deleteExpense } = useExpenseStore()

  useEffect(() => {
    fetchExpenses()
  }, [currentMonth])

  const fetchExpenses = async () => {
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
  }

  const handleDelete = async (id: string) => {
    const res = await Taro.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定要删除这条记录吗？',
    })
    if (!res.confirm) return

    await deleteExpense(id)
    // Optimistic update: also remove from local grouped state
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
                  <View className="flex flex-col flex-1">
                    <View className="flex flex-row items-center gap-2">
                      <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{item.category}</Badge>
                      {item.tag && <Text className="text-xs text-[#E8913A]">{item.tag}</Text>}
                    </View>
                    <Text className="block text-sm text-gray-500 mt-1">{item.note || item.raw_text || ''}</Text>
                  </View>
                  <View className="flex flex-row items-center gap-2">
                    <Text className="block text-lg font-bold text-[#E8913A]">¥{item.amount}</Text>
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
    </View>
  )
}

export default BillsPage
