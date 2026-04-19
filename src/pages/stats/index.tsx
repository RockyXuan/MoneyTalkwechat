import { useState, useRef } from 'react'
import { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChartNoAxesColumn } from 'lucide-react-taro'
import { useExpenseStore } from '@/store/expense-store'

type PeriodType = 'year' | 'quarter' | 'month'

interface CategoryStat {
  category: string
  total: number
  count: number
  percent: number
}

interface TrendItem {
  label: string
  total: number
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

// Generate color palette for unknown categories
const PALETTE = ['#3D7C5F', '#4A90D9', '#E8913A', '#9B7CB8', '#E06C75', '#56B6C2', '#D19A66', '#C678DD', '#61AFEF', '#6B7280', '#F59E0B', '#10B981']
const getColor = (category: string, index: number) => CATEGORY_COLORS[category] || PALETTE[index % PALETTE.length]

/** Conic-gradient pie chart component */
const PieChart = ({ data, total }: { data: CategoryStat[]; total: number }) => {
  if (total === 0 || data.length === 0) return null

  // Build conic-gradient stops
  let cumulativePercent = 0
  const stops = data.map((item, i) => {
    const startPercent = cumulativePercent
    cumulativePercent += item.percent
    const color = getColor(item.category, i)
    return `${color} ${startPercent}% ${cumulativePercent}%`
  })

  const gradient = `conic-gradient(${stops.join(', ')})`

  return (
    <View className="flex flex-row items-center gap-4">
      {/* Pie circle */}
      <View
        className="rounded-full flex-shrink-0"
        style={{
          width: '120px',
          height: '120px',
          background: gradient,
        }}
      />
      {/* Legend */}
      <View className="flex-1">
        {data.slice(0, 6).map((item, i) => (
          <View key={item.category} className="flex flex-row items-center gap-2 mb-1">
            <View className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(item.category, i) }} />
            <Text className="block text-xs text-[#1A1A1A] flex-1" numberOfLines={1}>{item.category}</Text>
            <Text className="block text-xs text-gray-500 flex-shrink-0">{item.percent}%</Text>
          </View>
        ))}
        {data.length > 6 && (
          <Text className="block text-xs text-gray-400">+{data.length - 6}个分类</Text>
        )}
      </View>
    </View>
  )
}

/** Bar chart for trends */
const TrendChart = ({ trends }: { trends: TrendItem[] }) => {
  if (trends.length === 0) return null
  const maxVal = Math.max(...trends.map(t => t.total), 1)

  return (
    <View className="flex flex-row items-end gap-1" style={{ minHeight: '120px' }}>
      {trends.map((t) => {
        const height = Math.max((t.total / maxVal) * 100, 4)
        return (
          <View key={t.label} className="flex flex-col items-center flex-1">
            <Text className="block text-xs text-[#E8913A] mb-1">{t.total > 0 ? t.total.toFixed(0) : ''}</Text>
            <View
              className="w-full rounded-t bg-[#3D7C5F]"
              style={{ height: `${height}px` }}
            />
            <Text className="block text-xs text-gray-400 mt-1">{t.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

const StatsPage = () => {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [period, setPeriod] = useState<PeriodType>('month')
  const [currentQuarter, setCurrentQuarter] = useState(() => Math.ceil((now.getMonth() + 1) / 3))
  const [currentMonth, setCurrentMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

  const [totalExpense, setTotalExpense] = useState(0)
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [trends, setTrends] = useState<TrendItem[]>([])

  const { dataVersion } = useExpenseStore()
  const lastFetchedVersion = useRef(0)

  const loadData = async () => {
    const data = await useExpenseStore.getState().getStatsV2(period, currentYear, period === 'quarter' ? currentQuarter : undefined, period === 'month' ? currentMonth : undefined)
    setTotalExpense(data.total_expense)
    setCategoryStats(data.categories)
    setTrends(data.trends)
    lastFetchedVersion.current = dataVersion
  }

  useDidShow(() => {
    loadData()
  })

  if (dataVersion !== lastFetchedVersion.current && dataVersion > 0) {
    lastFetchedVersion.current = dataVersion
    loadData()
  }

  // Navigation handlers
  const prevPeriod = () => {
    if (period === 'year') {
      setCurrentYear(y => y - 1)
    } else if (period === 'quarter') {
      if (currentQuarter === 1) {
        setCurrentQuarter(4)
        setCurrentYear(y => y - 1)
      } else {
        setCurrentQuarter(q => (q - 1) as 1 | 2 | 3 | 4)
      }
    } else {
      const [y, m] = currentMonth.split('-').map(Number)
      const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
      setCurrentMonth(prev)
    }
  }

  const nextPeriod = () => {
    if (period === 'year') {
      setCurrentYear(y => y + 1)
    } else if (period === 'quarter') {
      if (currentQuarter === 4) {
        setCurrentQuarter(1)
        setCurrentYear(y => y + 1)
      } else {
        setCurrentQuarter(q => (q + 1) as 1 | 2 | 3 | 4)
      }
    } else {
      const [y, m] = currentMonth.split('-').map(Number)
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      setCurrentMonth(next)
    }
  }

  // Display label
  const periodLabel = period === 'year'
    ? `${currentYear}年`
    : period === 'quarter'
      ? `${currentYear}年 Q${currentQuarter}`
      : currentMonth

  // Period toggle buttons
  const periodOptions: { key: PeriodType; label: string }[] = [
    { key: 'year', label: '按年' },
    { key: 'quarter', label: '按季' },
    { key: 'month', label: '按月' },
  ]

  return (
    <ScrollView scrollY className="min-h-full bg-[#F7F5F0]">
      <View className="pb-24">
        {/* Year Selector + Period Toggle */}
        <View className="px-4 pt-4 pb-2">
          {/* Year navigation */}
          <View className="flex flex-row items-center justify-between mb-3">
            <Button className="bg-transparent p-0" onClick={prevPeriod}>
              <ChevronLeft size={24} color="#3D7C5F" />
            </Button>
            <Text className="block text-lg font-semibold text-[#1A1A1A]">{periodLabel}</Text>
            <Button className="bg-transparent p-0" onClick={nextPeriod}>
              <ChevronRight size={24} color="#3D7C5F" />
            </Button>
          </View>
          {/* Period toggle */}
          <View className="flex flex-row bg-white rounded-xl p-1">
            {periodOptions.map(opt => (
              <View
                key={opt.key}
                className={`flex-1 py-2 rounded-lg ${period === opt.key ? 'bg-[#3D7C5F]' : ''}`}
                onClick={() => setPeriod(opt.key)}
              >
                <Text className={`block text-center text-sm font-medium ${period === opt.key ? 'text-white' : 'text-gray-500'}`}>
                  {opt.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Total Expense Card */}
        <View className="px-4 mb-4">
          <Card className="border-[#E5E1D8] bg-[#3D7C5F]">
            <CardContent className="p-4 flex flex-col items-center">
              <Text className="block text-white text-sm mb-1">
                {period === 'year' ? '年度总支出' : period === 'quarter' ? '季度总支出' : '本月总支出'}
              </Text>
              <Text className="block text-white text-3xl font-bold">¥{totalExpense.toFixed(2)}</Text>
            </CardContent>
          </Card>
        </View>

        {/* Expense Distribution Pie Chart */}
        {categoryStats.length > 0 && (
          <View className="px-4 mb-4">
            <Text className="block text-base font-semibold text-[#1A1A1A] mb-2">消费分布</Text>
            <Card className="border-[#E5E1D8]">
              <CardContent className="p-4">
                <PieChart data={categoryStats} total={totalExpense} />
              </CardContent>
            </Card>
          </View>
        )}

        {/* Category Detail List */}
        {categoryStats.length > 0 && (
          <View className="px-4 mb-4">
            <Text className="block text-base font-semibold text-[#1A1A1A] mb-2">分类明细</Text>
            {categoryStats.map((cat, i) => {
              const color = getColor(cat.category, i)
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
                        <Badge className="bg-[#F7F5F0] text-gray-500 text-xs">{cat.percent}%</Badge>
                      </View>
                    </View>
                    <View className="w-full h-2 bg-[#F7F5F0] rounded-full">
                      <View
                        className="h-2 rounded-full"
                        style={{ width: `${cat.percent}%`, backgroundColor: color }}
                      />
                    </View>
                  </CardContent>
                </Card>
              )
            })}
          </View>
        )}

        {/* Trend Chart */}
        {trends.length > 0 && (
          <View className="px-4 mb-4">
            <Text className="block text-base font-semibold text-[#1A1A1A] mb-2">
              {period === 'year' ? '季度趋势' : period === 'quarter' ? '月度趋势' : '每日消费趋势'}
            </Text>
            <Card className="border-[#E5E1D8]">
              <CardContent className="p-4">
                <TrendChart trends={trends} />
              </CardContent>
            </Card>
          </View>
        )}

        {/* Category Pie Chart - Top 3 Focus */}
        {categoryStats.length >= 3 && (
          <View className="px-4 mb-4">
            <Text className="block text-base font-semibold text-[#1A1A1A] mb-2">TOP3 消费分类</Text>
            <Card className="border-[#E5E1D8]">
              <CardContent className="p-4">
                <PieChart data={categoryStats.slice(0, 3)} total={totalExpense} />
                <View className="mt-3 pt-3" style={{ borderTop: '1px solid #E5E1D8' }}>
                  {categoryStats.slice(0, 3).map((cat, i) => {
                    const color = getColor(cat.category, i)
                    return (
                      <View key={cat.category} className="flex flex-row items-center justify-between mb-2">
                        <View className="flex flex-row items-center gap-2">
                          <View className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                          <Text className="block text-sm text-[#1A1A1A]">{cat.category}</Text>
                        </View>
                        <View className="flex flex-row items-center gap-3">
                          <Text className="block text-sm font-bold text-[#E8913A]">¥{cat.total.toFixed(2)}</Text>
                          <Text className="block text-xs text-gray-500">{cat.percent}%</Text>
                        </View>
                      </View>
                    )
                  })}
                </View>
              </CardContent>
            </Card>
          </View>
        )}

        {/* Empty State */}
        {categoryStats.length === 0 && (
          <View className="flex flex-col items-center justify-center mt-24">
            <ChartNoAxesColumn size={48} color="#E5E1D8" />
            <Text className="block text-gray-400 mt-4 text-sm">该时段暂无数据</Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

export default StatsPage
