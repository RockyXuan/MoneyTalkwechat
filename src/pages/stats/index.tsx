import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartNoAxesColumn, ChevronLeft, ChevronRight } from 'lucide-react-taro'
import { Network } from '@/network'

const DEFAULT_USER_ID = 'default_user'

interface CategoryStat {
  category: string
  total: number
  count: number
}

const CATEGORY_COLORS: Record<string, string> = {
  '餐饮': '#3D7C5F',
  '交通': '#4A90D9',
  '购物': '#E8913A',
  '日用品': '#9B7CB8',
  '娱乐': '#E06C75',
  '医疗': '#56B6C2',
  '教育': '#D19A66',
  '居住': '#C678DD',
  '通讯': '#61AFEF',
  '其他': '#6B7280',
}

const StatsPage = () => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [monthTotal, setMonthTotal] = useState(0)
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [dailyStats, setDailyStats] = useState<{ date: string; total: number }[]>([])

  useEffect(() => {
    fetchStats()
  }, [currentMonth])

  const fetchStats = async () => {
    try {
      const res = await Network.request({
        url: `/api/expenses/stats?user_id=${DEFAULT_USER_ID}&month=${currentMonth}`,
      })
      console.log('GET /api/expenses/stats response:', res.data)
      const data = res.data as { code: number; msg: string; data: { month_total: number; categories: CategoryStat[]; daily: { date: string; total: number }[] } }
      if (data?.data) {
        setMonthTotal(data.data.month_total)
        setCategoryStats(data.data.categories.sort((a, b) => b.total - a.total))
        setDailyStats(data.data.daily)
      }
    } catch (err) {
      console.error('获取统计失败', err)
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

  const maxDaily = Math.max(...dailyStats.map(d => d.total), 1)

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
      <View className="px-4 mb-4">
        <Card className="border-[#E5E1D8] bg-[#3D7C5F]">
          <CardContent className="p-4 flex flex-col items-center">
            <Text className="block text-white text-sm mb-1">本月总支出</Text>
            <Text className="block text-white text-3xl font-bold">¥{monthTotal.toFixed(2)}</Text>
          </CardContent>
        </Card>
      </View>

      {/* Daily Trend */}
      {dailyStats.length > 0 && (
        <View className="px-4 mb-4">
          <Text className="block text-base font-semibold text-[#1A1A1A] mb-2">每日消费趋势</Text>
          <Card className="border-[#E5E1D8]">
            <CardContent className="p-4">
              <View className="flex flex-row items-end gap-1" style={{ minHeight: '100px' }}>
                {dailyStats.slice(-14).map((d) => {
                  const height = Math.max((d.total / maxDaily) * 80, 4)
                  return (
                    <View key={d.date} className="flex flex-col items-center flex-1">
                      <Text className="block text-xs text-[#E8913A] mb-1">{d.total > 0 ? d.total.toFixed(0) : ''}</Text>
                      <View
                        className="w-full rounded-t bg-[#3D7C5F]"
                        style={{ height: `${height}px` }}
                      />
                      <Text className="block text-xs text-gray-400 mt-1">{d.date.slice(-2)}</Text>
                    </View>
                  )
                })}
              </View>
            </CardContent>
          </Card>
        </View>
      )}

      {/* Category Breakdown */}
      {categoryStats.length > 0 && (
        <View className="px-4 mb-4">
          <Text className="block text-base font-semibold text-[#1A1A1A] mb-2">分类占比</Text>
          {categoryStats.map((cat) => {
            const percent = monthTotal > 0 ? (cat.total / monthTotal * 100) : 0
            const color = CATEGORY_COLORS[cat.category] || '#6B7280'
            return (
              <Card key={cat.category} className="border-[#E5E1D8] mb-2">
                <CardContent className="p-3">
                  <View className="flex flex-row items-center justify-between mb-2">
                    <View className="flex flex-row items-center gap-2">
                      <View className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                      <Text className="block text-sm font-medium text-[#1A1A1A]">{cat.category}</Text>
                      <Text className="block text-xs text-gray-500">{cat.count}笔</Text>
                    </View>
                    <View className="flex flex-row items-center gap-2">
                      <Text className="block text-base font-bold text-[#E8913A]">¥{cat.total.toFixed(2)}</Text>
                      <Badge className="bg-[#F7F5F0] text-gray-500 text-xs">{percent.toFixed(1)}%</Badge>
                    </View>
                  </View>
                  <View className="w-full h-2 bg-[#F7F5F0] rounded-full">
                    <View
                      className="h-2 rounded-full"
                      style={{ width: `${percent}%`, backgroundColor: color }}
                    />
                  </View>
                </CardContent>
              </Card>
            )
          })}
        </View>
      )}

      {/* Empty State */}
      {categoryStats.length === 0 && (
        <View className="flex flex-col items-center justify-center mt-24">
          <ChartNoAxesColumn size={48} color="#E5E1D8" />
          <Text className="block text-gray-400 mt-4 text-sm">本月暂无数据</Text>
        </View>
      )}
    </View>
  )
}

export default StatsPage
