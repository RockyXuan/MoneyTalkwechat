import { useState, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChevronDown, ChartNoAxesColumn, CreditCard } from 'lucide-react-taro'
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

const PALETTE = ['#3D7C5F', '#4A90D9', '#E8913A', '#9B7CB8', '#E06C75', '#56B6C2', '#D19A66', '#C678DD', '#61AFEF', '#6B7280', '#F59E0B', '#10B981']
const getColor = (category: string, index: number) => CATEGORY_COLORS[category] || PALETTE[index % PALETTE.length]

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
const QUARTER_SUBS = ['1-3月', '4-6月', '7-9月', '10-12月']

/** Conic-gradient pie chart */
const PieChart = ({ data, total }: { data: CategoryStat[]; total: number }) => {
  if (total === 0 || data.length === 0) return null
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
      <View
        className="rounded-full flex-shrink-0"
        style={{ width: '120px', height: '120px', background: gradient }}
      />
      <View className="flex-1">
        {data.slice(0, 6).map((item, i) => (
          <View key={item.category} className="flex flex-row items-center gap-2 mb-1">
            <View className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(item.category, i) }} />
            <Text className="block text-xs text-foreground flex-1" numberOfLines={1}>{item.category}</Text>
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
            <Text className="block text-xs text-accent mb-1">{t.total > 0 ? t.total.toFixed(0) : ''}</Text>
            <View
              className="w-full rounded-t bg-primary"
              style={{ height: `${height}px` }}
            />
            <Text className="block text-xs text-gray-400 mt-1">{t.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

/** Period Picker Panel — slides down below the header */
const PeriodPicker = ({
  period,
  pickerYear,
  currentYear,
  currentQuarter,
  currentMonth,
  onSelect,
  onChangePickerYear,
  onClose,
}: {
  period: PeriodType
  pickerYear: number
  currentYear: number
  currentQuarter: number
  currentMonth: string
  onSelect: (value: number | string) => void
  onChangePickerYear: (year: number) => void
  onClose: () => void
}) => {
  const now = new Date()

  if (period === 'month') {
    // 12 months in 4x3 grid
    const currentM = currentMonth.split('-')[1] ? Number(currentMonth.split('-')[1]) : now.getMonth() + 1
    return (
      <View className="bg-white rounded-2xl p-4 mx-4 shadow-lg">
        {/* Year nav */}
        <View className="flex flex-row items-center justify-between mb-4">
          <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear - 1)}>
            <ChevronLeft size={20} color="var(--color-primary)" />
          </Button>
          <Text className="block text-base font-semibold text-foreground">{pickerYear}年</Text>
          <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear + 1)}>
            <ChevronRight size={20} color="var(--color-primary)" />
          </Button>
        </View>
        {/* Month grid */}
        <View className="flex flex-row flex-wrap">
          {MONTH_LABELS.map((label, i) => {
            const m = i + 1
            const isActive = pickerYear === currentYear && m === currentM
            const isCurrent = pickerYear === now.getFullYear() && m === now.getMonth() + 1
            return (
              <View
                key={m}
                className="w-1/4 mb-3"
                onClick={() => {
                  const val = `${pickerYear}-${String(m).padStart(2, '0')}`
                  onSelect(val)
                  onClose()
                }}
              >
                <View
                  className={`mx-1 py-3 rounded-xl flex items-center justify-center ${isActive ? 'bg-primary' : isCurrent ? 'bg-accent bg-opacity-20' : 'bg-muted'}`}
                >
                  <Text className={`block text-sm font-medium ${isActive ? 'text-white' : isCurrent ? 'text-primary' : 'text-foreground'}`}>
                    {label}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  if (period === 'quarter') {
    return (
      <View className="bg-white rounded-2xl p-4 mx-4 shadow-lg">
        {/* Year nav */}
        <View className="flex flex-row items-center justify-between mb-4">
          <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear - 1)}>
            <ChevronLeft size={20} color="var(--color-primary)" />
          </Button>
          <Text className="block text-base font-semibold text-foreground">{pickerYear}年</Text>
          <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear + 1)}>
            <ChevronRight size={20} color="var(--color-primary)" />
          </Button>
        </View>
        {/* Quarter grid 2x2 */}
        <View className="flex flex-row flex-wrap">
          {QUARTER_LABELS.map((label, i) => {
            const q = i + 1
            const isActive = pickerYear === currentYear && q === currentQuarter
            const isCurrent = pickerYear === now.getFullYear() && q === Math.ceil((now.getMonth() + 1) / 3)
            return (
              <View
                key={q}
                className="w-1/2 mb-3"
                onClick={() => {
                  onSelect(q)
                  onClose()
                }}
              >
                <View
                  className={`mx-1 py-4 rounded-xl flex flex-col items-center justify-center ${isActive ? 'bg-primary' : isCurrent ? 'bg-accent bg-opacity-20' : 'bg-muted'}`}
                >
                  <Text className={`block text-lg font-bold ${isActive ? 'text-white' : isCurrent ? 'text-primary' : 'text-foreground'}`}>
                    {label}
                  </Text>
                  <Text className={`block text-xs mt-1 ${isActive ? 'text-white' : 'text-gray-400'}`} style={isActive ? { opacity: 0.7 } : {}}>
                    {QUARTER_SUBS[i]}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  // Year picker — show a range of years in 4x3 grid
  const baseYear = Math.floor(pickerYear / 12) * 12
  const startYear = baseYear - 4 // show a wider range
  const years: number[] = []
  for (let i = 0; i < 12; i++) {
    years.push(startYear + i)
  }

  return (
    <View className="bg-white rounded-2xl p-4 mx-4 shadow-lg">
      {/* Decade nav */}
      <View className="flex flex-row items-center justify-between mb-4">
        <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear - 12)}>
          <ChevronLeft size={20} color="var(--color-primary)" />
        </Button>
        <Text className="block text-base font-semibold text-foreground">{startYear} - {startYear + 11}</Text>
        <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear + 12)}>
          <ChevronRight size={20} color="var(--color-primary)" />
        </Button>
      </View>
      {/* Year grid */}
      <View className="flex flex-row flex-wrap">
        {years.map(y => {
          const isActive = y === currentYear
          const isCurrent = y === now.getFullYear()
          return (
            <View
              key={y}
              className="w-1/4 mb-3"
              onClick={() => {
                onSelect(y)
                onClose()
              }}
            >
              <View
                className={`mx-1 py-3 rounded-xl flex items-center justify-center ${isActive ? 'bg-primary' : isCurrent ? 'bg-accent bg-opacity-20' : 'bg-muted'}`}
              >
                <Text className={`block text-sm font-medium ${isActive ? 'text-white' : isCurrent ? 'text-primary' : 'text-foreground'}`}>
                  {y}
                </Text>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ─── Main Page ────────────────────────────────────────────────
const StatsPage = () => {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [period, setPeriod] = useState<PeriodType>('month')
  const [currentQuarter, setCurrentQuarter] = useState(() => Math.ceil((now.getMonth() + 1) / 3))
  const [currentMonth, setCurrentMonth] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

  const [totalExpense, setTotalExpense] = useState(0)
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [trends, setTrends] = useState<TrendItem[]>([])

  // Subscription stats
  const [subStats, setSubStats] = useState<{
    total_yearly: number
    total_monthly: number
    total_daily: number
    subscription_count: number
    by_category: Record<string, { total_yearly: number; total_monthly: number; count: number; items: { name: string; amount: number; cycle: string; yearly: number; monthly: number }[] }>
  } | null>(null)

  // Picker state
  const [showPicker, setShowPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(now.getFullYear())

  const { dataVersion } = useExpenseStore()
  const lastFetchedVersion = useRef(0)

  const loadData = async () => {
    const data = await useExpenseStore.getState().getStatsV2(
      period,
      currentYear,
      period === 'quarter' ? currentQuarter : undefined,
      period === 'month' ? currentMonth : undefined,
    )
    setTotalExpense(data.total_expense)
    setCategoryStats(data.categories)
    setTrends(data.trends)
    lastFetchedVersion.current = dataVersion
  }

  useDidShow(() => {
    loadData()
    // Load subscription stats
    useExpenseStore.getState().getSubscriptionStats().then(setSubStats).catch(console.error)
  })

  if (dataVersion !== lastFetchedVersion.current && dataVersion > 0) {
    lastFetchedVersion.current = dataVersion
    loadData()
  }

  // Display label
  const periodLabel = period === 'year'
    ? `${currentYear}年`
    : period === 'quarter'
      ? `${currentYear}年 Q${currentQuarter}`
      : `${currentMonth.split('-')[0]}年${Number(currentMonth.split('-')[1])}月`

  const periodOptions: { key: PeriodType; label: string }[] = [
    { key: 'year', label: '按年' },
    { key: 'quarter', label: '按季' },
    { key: 'month', label: '按月' },
  ]

  const handlePickerSelect = (value: number | string) => {
    if (period === 'month') {
      setCurrentMonth(value as string)
      setCurrentYear(Number((value as string).split('-')[0]))
    } else if (period === 'quarter') {
      setCurrentQuarter(value as 1 | 2 | 3 | 4)
      setCurrentYear(pickerYear)
    } else {
      setCurrentYear(value as number)
    }
  }

  const handlePeriodChange = (key: PeriodType) => {
    setPeriod(key)
    setShowPicker(false)
  }

  const openPicker = () => {
    setPickerYear(currentYear)
    setShowPicker(true)
  }

  // Compute date range for current period selection
  const getDateRange = () => {
    if (period === 'year') {
      return { startDate: `${currentYear}-01-01`, endDate: `${currentYear + 1}-01-01` }
    } else if (period === 'quarter') {
      const startMonth = (currentQuarter - 1) * 3 + 1
      const endMonth = startMonth + 3
      const endYear = endMonth > 12 ? currentYear + 1 : currentYear
      const adjEndMonth = endMonth > 12 ? endMonth - 12 : endMonth
      return {
        startDate: `${currentYear}-${String(startMonth).padStart(2, '0')}-01`,
        endDate: `${endYear}-${String(adjEndMonth).padStart(2, '0')}-01`,
      }
    } else {
      const [y, m] = currentMonth.split('-')
      const nextMonth = m === '12' ? `${Number(y) + 1}-01` : `${y}-${String(Number(m) + 1).padStart(2, '0')}`
      return { startDate: `${currentMonth}-01`, endDate: `${nextMonth}-01` }
    }
  }

  const navigateToCategory = (catName: string) => {
    const range = getDateRange()
    Taro.navigateTo({
      url: `/pages/category-detail/index?category=${encodeURIComponent(catName)}&startDate=${range.startDate}&endDate=${range.endDate}&periodLabel=${encodeURIComponent(periodLabel)}`,
    })
  }

  return (
    <View className="min-h-full bg-muted">
      {/* Full-screen backdrop when picker is open */}
      {showPicker && (
        <View
          className="fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
          onClick={() => setShowPicker(false)}
        />
      )}

      <ScrollView scrollY className="min-h-full">
        <View className="pb-24">
          {/* Period Toggle + Clickable Label */}
          <View className="px-4 pt-4 pb-2">
            {/* Period toggle */}
            <View className="flex flex-row bg-white rounded-xl p-1 mb-3">
              {periodOptions.map(opt => (
                <View
                  key={opt.key}
                  className={`flex-1 py-2 rounded-lg ${period === opt.key ? 'bg-primary' : ''}`}
                  onClick={() => handlePeriodChange(opt.key)}
                >
                  <Text className={`block text-center text-sm font-medium ${period === opt.key ? 'text-white' : 'text-gray-500'}`}>
                    {opt.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Clickable period label */}
            <View
              className="flex flex-row items-center justify-center py-2"
              onClick={openPicker}
            >
              <Text className="block text-lg font-semibold text-foreground">{periodLabel}</Text>
              <ChevronDown size={18} color="var(--color-primary)" className="ml-1" />
            </View>
          </View>

          {/* Picker Panel (expand below header) */}
          {showPicker && (
            <View className="mb-4 z-50 relative">
              <PeriodPicker
                period={period}
                pickerYear={pickerYear}
                currentYear={currentYear}
                currentQuarter={currentQuarter}
                currentMonth={currentMonth}
                onSelect={handlePickerSelect}
                onChangePickerYear={setPickerYear}
                onClose={() => setShowPicker(false)}
              />
            </View>
          )}

          {/* Total Expense Card */}
          <View className="px-4 mb-4">
            <Card className="border-border bg-primary">
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
              <Text className="block text-base font-semibold text-foreground mb-2">消费分布</Text>
              <Card className="border-border">
                <CardContent className="p-4">
                  <PieChart data={categoryStats} total={totalExpense} />
                </CardContent>
              </Card>
            </View>
          )}

          {/* Category Detail List — clickable to view records */}
          {categoryStats.length > 0 && (
            <View className="px-4 mb-4">
              <Text className="block text-base font-semibold text-foreground mb-2">分类明细</Text>
              {categoryStats.map((cat, i) => {
                const color = getColor(cat.category, i)
                return (
                  <Card key={cat.category} className="border-border mb-2">
                    <CardContent className="p-3" onClick={() => navigateToCategory(cat.category)}>
                      <View className="flex flex-row items-center justify-between mb-2">
                        <View className="flex flex-row items-center gap-2">
                          <View className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                          <Text className="block text-sm font-medium text-foreground">{cat.category}</Text>
                          <Text className="block text-xs text-gray-500">{cat.count}笔</Text>
                        </View>
                        <View className="flex flex-row items-center gap-2">
                          <Text className="block text-base font-bold text-accent">¥{cat.total.toFixed(2)}</Text>
                          <Badge className="bg-muted text-gray-500 text-xs">{cat.percent}%</Badge>
                          <ChevronRight size={14} color="#999" />
                        </View>
                      </View>
                      <View className="w-full h-2 bg-muted rounded-full">
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
              <Text className="block text-base font-semibold text-foreground mb-2">
                {period === 'year' ? '季度趋势' : period === 'quarter' ? '月度趋势' : '每日消费趋势'}
              </Text>
              <Card className="border-border">
                <CardContent className="p-4">
                  <TrendChart trends={trends} />
                </CardContent>
              </Card>
            </View>
          )}

          {/* TOP3 Pie */}
          {categoryStats.length >= 3 && (
            <View className="px-4 mb-4">
              <Text className="block text-base font-semibold text-foreground mb-2">TOP3 消费分类</Text>
              <Card className="border-border">
                <CardContent className="p-4">
                  <PieChart data={categoryStats.slice(0, 3)} total={totalExpense} />
                  <View className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {categoryStats.slice(0, 3).map((cat, i) => {
                      const color = getColor(cat.category, i)
                      return (
                        <View key={cat.category} className="flex flex-row items-center justify-between mb-2">
                          <View className="flex flex-row items-center gap-2">
                            <View className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                            <Text className="block text-sm text-foreground">{cat.category}</Text>
                          </View>
                          <View className="flex flex-row items-center gap-3">
                            <Text className="block text-sm font-bold text-accent">¥{cat.total.toFixed(2)}</Text>
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

          {/* Subscription Stats */}
          {subStats && subStats.subscription_count > 0 && (
            <View className="px-4 mb-4">
              <Text className="block text-base font-semibold text-foreground mb-2">
                <View className="inline-flex flex-row items-center gap-1">
                  <CreditCard size={16} color="var(--color-primary)" />
                </View>
                订阅支出
              </Text>
              <Card className="border-border">
                <CardContent className="p-4">
                  {/* Total overview */}
                  <View className="flex flex-row items-center justify-between mb-3 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <View className="flex flex-col">
                      <Text className="block text-xs text-gray-500">活跃订阅</Text>
                      <Text className="block text-lg font-bold text-primary">{subStats.subscription_count} 项</Text>
                    </View>
                    <View className="flex flex-col items-end">
                      <View className="flex flex-row items-center gap-3">
                        <View className="flex flex-col items-end">
                          <Text className="block text-xs text-gray-400">日均</Text>
                          <Text className="block text-sm font-semibold text-accent">¥{subStats.total_daily.toFixed(2)}</Text>
                        </View>
                        <View className="flex flex-col items-end">
                          <Text className="block text-xs text-gray-400">月均</Text>
                          <Text className="block text-sm font-semibold text-accent">¥{subStats.total_monthly.toFixed(2)}</Text>
                        </View>
                        <View className="flex flex-col items-end">
                          <Text className="block text-xs text-gray-400">年总计</Text>
                          <Text className="block text-lg font-bold text-destructive">¥{subStats.total_yearly.toFixed(2)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  {/* Subscription items */}
                  {Object.entries(subStats.by_category).map(([cat, info]) => (
                    <View key={cat} className="mb-2">
                      {info.items.map((item, i) => (
                        <View key={i} className="flex flex-row items-center justify-between py-2" style={i < info.items.length - 1 ? { borderBottom: '1px solid var(--color-muted)' } : {}}>
                          <View className="flex flex-row items-center gap-2">
                            <Text className="block text-sm text-foreground">{item.name}</Text>
                            <Badge className="bg-accent bg-opacity-20 text-primary text-xs">{item.cycle === 'monthly' ? '月付' : item.cycle === 'quarterly' ? '季付' : item.cycle === 'yearly' ? '年付' : item.cycle}</Badge>
                          </View>
                          <View className="flex flex-row items-center gap-3">
                            <Text className="block text-sm font-semibold text-accent">¥{item.amount}</Text>
                            <Text className="block text-xs text-gray-400">¥{item.yearly.toFixed(0)}/年</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
                </CardContent>
              </Card>
            </View>
          )}

          {/* Empty State */}
          {categoryStats.length === 0 && (
            <View className="flex flex-col items-center justify-center mt-24">
              <ChartNoAxesColumn size={48} color="var(--color-muted-foreground)" />
              <Text className="block text-gray-400 mt-4 text-sm">该时段暂无数据</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

export default StatsPage
