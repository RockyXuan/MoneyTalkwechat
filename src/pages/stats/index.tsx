import { useState, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChevronDown, ChartNoAxesColumn, CreditCard, ChevronRight as ChevronRightIcon } from 'lucide-react-taro'
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

const PALETTE = ['#2563EB', '#7C3AED', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16']
const getColor = (_category: string, index: number) => PALETTE[index % PALETTE.length]

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
const QUARTER_SUBS = ['1-3月', '4-6月', '7-9月', '10-12月']

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
      <View className="rounded-full flex-shrink-0" style={{ width: '120px', height: '120px', background: gradient }} />
      <View className="flex-1">
        {data.slice(0, 6).map((item, i) => (
          <View key={item.category} className="flex flex-row items-center gap-2 mb-1">
            <View className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(item.category, i) }} />
            <Text className="block text-xs text-foreground flex-1" numberOfLines={1}>{item.category}</Text>
            <Text className="block text-xs text-slate-400 flex-shrink-0">{item.percent}%</Text>
          </View>
        ))}
        {data.length > 6 && <Text className="block text-xs text-slate-300">+{data.length - 6}个分类</Text>}
      </View>
    </View>
  )
}

const TrendChart = ({ trends }: { trends: TrendItem[] }) => {
  if (trends.length === 0) return null
  const maxVal = Math.max(...trends.map(t => t.total), 1)
  return (
    <View className="flex flex-row items-end gap-1" style={{ minHeight: '120px' }}>
      {trends.map((t) => {
        const height = Math.max((t.total / maxVal) * 100, 4)
        return (
          <View key={t.label} className="flex flex-col items-center flex-1">
            <Text className="block text-xs text-blue-600 mb-1">{t.total > 0 ? t.total.toFixed(0) : ''}</Text>
            <View className="w-full rounded-t" style={{ height: `${height}px`, background: 'linear-gradient(180deg, #2563EB, #93C5FD)' }} />
            <Text className="block text-xs text-slate-400 mt-1">{t.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

const PeriodPicker = ({
  period, pickerYear, currentYear, currentQuarter, currentMonth,
  onSelect, onChangePickerYear, onClose,
}: {
  period: PeriodType; pickerYear: number; currentYear: number; currentQuarter: number; currentMonth: string
  onSelect: (value: number | string) => void; onChangePickerYear: (year: number) => void; onClose: () => void
}) => {
  const now = new Date()

  if (period === 'month') {
    const currentM = currentMonth.split('-')[1] ? Number(currentMonth.split('-')[1]) : now.getMonth() + 1
    return (
      <View className="bg-white rounded-2xl p-4 mx-4" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <View className="flex flex-row items-center justify-between mb-4">
          <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear - 1)}>
            <ChevronLeft size={20} color="#2563EB" />
          </Button>
          <Text className="block text-base font-semibold text-foreground">{pickerYear}年</Text>
          <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear + 1)}>
            <ChevronRight size={20} color="#2563EB" />
          </Button>
        </View>
        <View className="flex flex-row flex-wrap">
          {MONTH_LABELS.map((label, i) => {
            const m = i + 1
            const isActive = pickerYear === currentYear && m === currentM
            const isCurrent = pickerYear === now.getFullYear() && m === now.getMonth() + 1
            return (
              <View
                key={m} className="w-1/4 mb-3"
                onClick={() => { onSelect(`${pickerYear}-${String(m).padStart(2, '0')}`); onClose() }}
              >
                <View className={`mx-1 py-3 rounded-xl flex items-center justify-center ${isActive ? 'bg-blue-500' : isCurrent ? 'bg-blue-50' : 'bg-slate-50'}`}>
                  <Text className={`block text-sm font-medium ${isActive ? 'text-white' : isCurrent ? 'text-blue-600' : 'text-foreground'}`}>{label}</Text>
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
      <View className="bg-white rounded-2xl p-4 mx-4" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <View className="flex flex-row items-center justify-between mb-4">
          <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear - 1)}>
            <ChevronLeft size={20} color="#2563EB" />
          </Button>
          <Text className="block text-base font-semibold text-foreground">{pickerYear}年</Text>
          <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear + 1)}>
            <ChevronRight size={20} color="#2563EB" />
          </Button>
        </View>
        <View className="flex flex-row flex-wrap">
          {QUARTER_LABELS.map((label, i) => {
            const q = i + 1
            const isActive = pickerYear === currentYear && q === currentQuarter
            const isCurrent = pickerYear === now.getFullYear() && q === Math.ceil((now.getMonth() + 1) / 3)
            return (
              <View key={q} className="w-1/2 mb-3" onClick={() => { onSelect(q); onClose() }}>
                <View className={`mx-1 py-4 rounded-xl flex flex-col items-center justify-center ${isActive ? 'bg-blue-500' : isCurrent ? 'bg-blue-50' : 'bg-slate-50'}`}>
                  <Text className={`block text-lg font-bold ${isActive ? 'text-white' : isCurrent ? 'text-blue-600' : 'text-foreground'}`}>{label}</Text>
                  <Text className={`block text-xs mt-1 ${isActive ? 'text-white' : 'text-slate-400'}`} style={isActive ? { opacity: 0.7 } : {}}>{QUARTER_SUBS[i]}</Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  const baseYear = Math.floor(pickerYear / 12) * 12
  const startYear = baseYear - 4
  const years: number[] = []
  for (let i = 0; i < 12; i++) years.push(startYear + i)

  return (
    <View className="bg-white rounded-2xl p-4 mx-4" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <View className="flex flex-row items-center justify-between mb-4">
        <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear - 12)}>
          <ChevronLeft size={20} color="#2563EB" />
        </Button>
        <Text className="block text-base font-semibold text-foreground">{startYear} - {startYear + 11}</Text>
        <Button className="bg-transparent p-1" onClick={() => onChangePickerYear(pickerYear + 12)}>
          <ChevronRight size={20} color="#2563EB" />
        </Button>
      </View>
      <View className="flex flex-row flex-wrap">
        {years.map(y => {
          const isActive = y === currentYear
          const isCurrent = y === now.getFullYear()
          return (
            <View key={y} className="w-1/4 mb-3" onClick={() => { onSelect(y); onClose() }}>
              <View className={`mx-1 py-3 rounded-xl flex items-center justify-center ${isActive ? 'bg-blue-500' : isCurrent ? 'bg-blue-50' : 'bg-slate-50'}`}>
                <Text className={`block text-sm font-medium ${isActive ? 'text-white' : isCurrent ? 'text-blue-600' : 'text-foreground'}`}>{y}</Text>
              </View>
            </View>
          )
        })}
      </View>
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
  const [subStats, setSubStats] = useState<{
    total_yearly: number; total_monthly: number; total_daily: number; subscription_count: number
    by_category: Record<string, { total_yearly: number; total_monthly: number; count: number; items: { name: string; amount: number; cycle: string; yearly: number; monthly: number }[] }>
  } | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(now.getFullYear())
  const { dataVersion } = useExpenseStore()
  const lastFetchedVersion = useRef(0)

  const loadData = async () => {
    const data = await useExpenseStore.getState().getStatsV2(period, currentYear, period === 'quarter' ? currentQuarter : undefined, period === 'month' ? currentMonth : undefined)
    setTotalExpense(data.total_expense); setCategoryStats(data.categories); setTrends(data.trends)
    lastFetchedVersion.current = dataVersion
  }

  useDidShow(() => { loadData(); useExpenseStore.getState().getSubscriptionStats().then(setSubStats).catch(console.error) })

  if (dataVersion !== lastFetchedVersion.current && dataVersion > 0) { lastFetchedVersion.current = dataVersion; loadData() }

  const periodLabel = period === 'year' ? `${currentYear}年` : period === 'quarter' ? `${currentYear}年 Q${currentQuarter}` : `${currentMonth.split('-')[0]}年${Number(currentMonth.split('-')[1])}月`
  const periodOptions: { key: PeriodType; label: string }[] = [{ key: 'year', label: '按年' }, { key: 'quarter', label: '按季' }, { key: 'month', label: '按月' }]

  const handlePickerSelect = (value: number | string) => {
    if (period === 'month') { setCurrentMonth(value as string); setCurrentYear(Number((value as string).split('-')[0])) }
    else if (period === 'quarter') { setCurrentQuarter(value as 1 | 2 | 3 | 4); setCurrentYear(pickerYear) }
    else { setCurrentYear(value as number) }
  }

  const handlePeriodChange = (key: PeriodType) => { setPeriod(key); setShowPicker(false) }
  const openPicker = () => { setPickerYear(currentYear); setShowPicker(true) }

  const getDateRange = () => {
    if (period === 'year') return { startDate: `${currentYear}-01-01`, endDate: `${currentYear + 1}-01-01` }
    else if (period === 'quarter') {
      const startMonth = (currentQuarter - 1) * 3 + 1; const endMonth = startMonth + 3
      const endYear = endMonth > 12 ? currentYear + 1 : currentYear; const adjEndMonth = endMonth > 12 ? endMonth - 12 : endMonth
      return { startDate: `${currentYear}-${String(startMonth).padStart(2, '0')}-01`, endDate: `${endYear}-${String(adjEndMonth).padStart(2, '0')}-01` }
    } else {
      const [y, m] = currentMonth.split('-')
      const nextMonth = m === '12' ? `${Number(y) + 1}-01` : `${y}-${String(Number(m) + 1).padStart(2, '0')}`
      return { startDate: `${currentMonth}-01`, endDate: `${nextMonth}-01` }
    }
  }

  const navigateToCategory = (catName: string) => {
    const range = getDateRange()
    Taro.navigateTo({ url: `/pages/category-detail/index?category=${encodeURIComponent(catName)}&startDate=${range.startDate}&endDate=${range.endDate}&periodLabel=${encodeURIComponent(periodLabel)}` })
  }

  return (
    <View className="min-h-full" style={{ backgroundColor: '#F7F8FA' }}>
      {showPicker && <View className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} onClick={() => setShowPicker(false)} />}

      <ScrollView scrollY className="min-h-full">
        <View className="pb-24">
          {/* Period Toggle */}
          <View className="px-4 pt-4 pb-2">
            <View className="flex flex-row bg-white rounded-xl p-1 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              {periodOptions.map(opt => (
                <View
                  key={opt.key}
                  className={`flex-1 py-2 rounded-lg ${period === opt.key ? 'bg-white' : ''}`}
                  style={period === opt.key ? { boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } : {}}
                  onClick={() => handlePeriodChange(opt.key)}
                >
                  <Text className={`block text-center text-sm font-medium ${period === opt.key ? 'text-blue-600' : 'text-slate-400'}`}>{opt.label}</Text>
                </View>
              ))}
            </View>
            <View className="flex flex-row items-center justify-center py-2" onClick={openPicker}>
              <Text className="block text-lg font-semibold text-foreground">{periodLabel}</Text>
              <ChevronDown size={18} color="#2563EB" className="ml-1" />
            </View>
          </View>

          {showPicker && (
            <View className="mb-4 z-50 relative">
              <PeriodPicker
                period={period} pickerYear={pickerYear} currentYear={currentYear} currentQuarter={currentQuarter} currentMonth={currentMonth}
                onSelect={handlePickerSelect} onChangePickerYear={setPickerYear} onClose={() => setShowPicker(false)}
              />
            </View>
          )}

          {/* Total Expense - Gradient Card */}
          <View className="mx-4 mb-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}>
            <View className="flex flex-row items-center justify-between">
              <View>
                <Text className="block text-white text-sm opacity-80">
                  {period === 'year' ? '年度总支出' : period === 'quarter' ? '季度总支出' : '本月总支出'}
                </Text>
                <Text className="block text-white text-3xl font-bold mt-1">¥{totalExpense.toFixed(2)}</Text>
              </View>
              <View className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <ChartNoAxesColumn size={24} color="#fff" />
              </View>
            </View>
          </View>

          {/* Expense Distribution */}
          {categoryStats.length > 0 && (
            <View className="mx-4 mb-4">
              <Text className="block text-base font-semibold text-foreground mb-2">消费分布</Text>
              <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <PieChart data={categoryStats} total={totalExpense} />
              </View>
            </View>
          )}

          {/* Category Detail List */}
          {categoryStats.length > 0 && (
            <View className="mx-4 mb-4">
              <Text className="block text-base font-semibold text-foreground mb-2">分类明细</Text>
              {categoryStats.map((cat, i) => {
                const color = getColor(cat.category, i)
                return (
                  <View key={cat.category} className="bg-white rounded-2xl p-4 mb-2" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} onClick={() => navigateToCategory(cat.category)}>
                    <View className="flex flex-row items-center justify-between mb-2">
                      <View className="flex flex-row items-center gap-2">
                        <View className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                          <View className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        </View>
                        <View className="flex flex-col">
                          <Text className="block text-sm font-medium text-foreground">{cat.category}</Text>
                          <Text className="block text-xs text-slate-400">{cat.count}笔</Text>
                        </View>
                      </View>
                      <View className="flex flex-row items-center gap-2">
                        <Text className="block text-base font-bold text-foreground">¥{cat.total.toFixed(2)}</Text>
                        <View className="bg-slate-100 rounded-full px-2 py-1">
                          <Text className="text-xs text-slate-500">{cat.percent}%</Text>
                        </View>
                        <ChevronRightIcon size={14} color="#94A3B8" />
                      </View>
                    </View>
                    <View className="w-full h-2 bg-slate-100 rounded-full">
                      <View className="h-2 rounded-full" style={{ width: `${cat.percent}%`, backgroundColor: color }} />
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* Trend Chart */}
          {trends.length > 0 && (
            <View className="mx-4 mb-4">
              <Text className="block text-base font-semibold text-foreground mb-2">
                {period === 'year' ? '季度趋势' : period === 'quarter' ? '月度趋势' : '每日消费趋势'}
              </Text>
              <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <TrendChart trends={trends} />
              </View>
            </View>
          )}

          {/* TOP3 */}
          {categoryStats.length >= 3 && (
            <View className="mx-4 mb-4">
              <Text className="block text-base font-semibold text-foreground mb-2">TOP3 消费分类</Text>
              <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <PieChart data={categoryStats.slice(0, 3)} total={totalExpense} />
                <View className="mt-3 pt-3" style={{ borderTop: '1px solid #E2E8F0' }}>
                  {categoryStats.slice(0, 3).map((cat, i) => {
                    const color = getColor(cat.category, i)
                    return (
                      <View key={cat.category} className="flex flex-row items-center justify-between mb-2">
                        <View className="flex flex-row items-center gap-2">
                          <View className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                          <Text className="block text-sm text-foreground">{cat.category}</Text>
                        </View>
                        <View className="flex flex-row items-center gap-3">
                          <Text className="block text-sm font-bold text-foreground">¥{cat.total.toFixed(2)}</Text>
                          <Text className="block text-xs text-slate-400">{cat.percent}%</Text>
                        </View>
                      </View>
                    )
                  })}
                </View>
              </View>
            </View>
          )}

          {/* Subscription Stats */}
          {subStats && subStats.subscription_count > 0 && (
            <View className="mx-4 mb-4">
              <Text className="block text-base font-semibold text-foreground mb-2">
                <View className="inline-flex flex-row items-center gap-1">
                  <CreditCard size={16} color="#7C3AED" />
                </View>
                订阅支出
              </Text>
              <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <View className="flex flex-row items-center justify-between mb-3 pb-3" style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <View className="flex flex-col">
                    <Text className="block text-xs text-slate-400">活跃订阅</Text>
                    <Text className="block text-lg font-bold text-purple-600">{subStats.subscription_count} 项</Text>
                  </View>
                  <View className="flex flex-col items-end">
                    <View className="flex flex-row items-center gap-3">
                      <View className="flex flex-col items-end">
                        <Text className="block text-xs text-slate-400">日均</Text>
                        <Text className="block text-sm font-semibold text-amber-500">¥{subStats.total_daily.toFixed(2)}</Text>
                      </View>
                      <View className="flex flex-col items-end">
                        <Text className="block text-xs text-slate-400">月均</Text>
                        <Text className="block text-sm font-semibold text-amber-500">¥{subStats.total_monthly.toFixed(2)}</Text>
                      </View>
                      <View className="flex flex-col items-end">
                        <Text className="block text-xs text-slate-400">年总计</Text>
                        <Text className="block text-lg font-bold text-red-500">¥{subStats.total_yearly.toFixed(2)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                {Object.entries(subStats.by_category).map(([cat, info]) => (
                  <View key={cat} className="mb-2">
                    {info.items.map((item, i) => (
                      <View key={i} className="flex flex-row items-center justify-between py-2" style={i < info.items.length - 1 ? { borderBottom: '1px solid #F1F5F9' } : {}}>
                        <View className="flex flex-row items-center gap-2">
                          <Text className="block text-sm text-foreground">{item.name}</Text>
                          <View className="bg-purple-50 rounded-full px-2 py-1">
                            <Text className="text-xs text-purple-600">{item.cycle === 'monthly' ? '月付' : item.cycle === 'quarterly' ? '季付' : item.cycle === 'yearly' ? '年付' : item.cycle}</Text>
                          </View>
                        </View>
                        <View className="flex flex-row items-center gap-3">
                          <Text className="block text-sm font-semibold text-foreground">¥{item.amount}</Text>
                          <Text className="block text-xs text-slate-400">¥{item.yearly.toFixed(0)}/年</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Empty State */}
          {categoryStats.length === 0 && (
            <View className="flex flex-col items-center justify-center mt-24">
              <View className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                <ChartNoAxesColumn size={28} color="#2563EB" />
              </View>
              <Text className="block text-slate-400 mt-4 text-sm">该时段暂无数据</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

export default StatsPage
