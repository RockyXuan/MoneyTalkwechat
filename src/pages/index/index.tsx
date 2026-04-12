import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Picker } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader, PenLine, X, Pencil, Calendar } from 'lucide-react-taro'
import { useExpenseStore, ParsedExpense } from '@/store/expense-store'

const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '日用品', '娱乐', '医疗', '教育', '居住', '通讯', '其他']

const IndexPage = () => {
  const [inputText, setInputText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedResults, setParsedResults] = useState<ParsedExpense[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  // Date mode: 'today' or 'month'
  const [dateMode, setDateMode] = useState<'today' | 'month'>('today')
  // For today mode: specific date
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  // For month mode: month string like "2025-05"
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const { addExpenses } = useExpenseStore()

  const getDefaultDate = () => {
    if (dateMode === 'month') {
      return `${selectedMonth}-01`
    }
    return selectedDate
  }

  const handleParse = async () => {
    if (!inputText.trim()) {
      Taro.showToast({ title: '请输入消费内容', icon: 'none' })
      return
    }
    setIsParsing(true)
    try {
      const defaultDate = getDefaultDate()
      const results = await useExpenseStore.getState().parseText(inputText, defaultDate)
      if (results.length > 0) {
        // In month mode, override all expense_date to selectedMonth + the day
        const adjusted = results.map(r => {
          if (dateMode === 'month') {
            // Keep the day part from AI result if it has a specific day, otherwise use month-01
            const dayMatch = r.expense_date?.match(/(\d{4})-(\d{2})-(\d{2})/)
            if (dayMatch) {
              // Replace year-month with selected month
              return { ...r, expense_date: `${selectedMonth}-${dayMatch[3]}` }
            }
            return { ...r, expense_date: `${selectedMonth}-01` }
          }
          return r
        })
        setParsedResults(prev => [...prev, ...adjusted])
      } else {
        Taro.showToast({ title: '未识别到消费信息', icon: 'none' })
      }
    } catch (err) {
      console.error('解析失败', err)
      Taro.showToast({ title: '解析失败，请重试', icon: 'none' })
    } finally {
      setIsParsing(false)
    }
  }

  const handleSave = async () => {
    if (parsedResults.length === 0) return
    setIsSaving(true)
    try {
      await addExpenses(parsedResults, inputText)
      Taro.showToast({ title: `成功保存 ${parsedResults.length} 笔`, icon: 'success' })
      setParsedResults([])
      setInputText('')
      setEditingIdx(null)
    } catch (err) {
      console.error('保存失败', err)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveResult = (idx: number) => {
    setParsedResults(prev => prev.filter((_, i) => i !== idx))
  }

  const handleUpdateResult = (idx: number, field: string, value: any) => {
    setParsedResults(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value, _edited: true } : item
    ))
  }

  const totalParsedAmount = parsedResults.reduce((sum, r) => sum + (r.amount || 0), 0)

  return (
    <View className="min-h-full bg-[#F7F5F0] pb-20">
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <Text className="block text-xl font-semibold text-[#1A1A1A]">记一笔</Text>
      </View>

      {/* Date Selector */}
      <View className="px-4 mb-2">
        <Card className="border-[#E5E1D8]">
          <CardContent className="p-3">
            <View className="flex flex-row items-center gap-3">
              <Calendar size={18} color="#3D7C5F" />
              {/* Mode toggle */}
              <View className="flex flex-row bg-[#F7F5F0] rounded-lg p-1">
                <View
                  className={`px-3 py-1 rounded-md ${dateMode === 'today' ? 'bg-[#3D7C5F]' : ''}`}
                  onClick={() => setDateMode('today')}
                >
                  <Text className={`block text-xs ${dateMode === 'today' ? 'text-white' : 'text-gray-500'}`}>
                    按日期
                  </Text>
                </View>
                <View
                  className={`px-3 py-1 rounded-md ${dateMode === 'month' ? 'bg-[#3D7C5F]' : ''}`}
                  onClick={() => setDateMode('month')}
                >
                  <Text className={`block text-xs ${dateMode === 'month' ? 'text-white' : 'text-gray-500'}`}>
                    按月份
                  </Text>
                </View>
              </View>
              {/* Date/Month picker */}
              {dateMode === 'today' ? (
                <Picker mode="date" value={selectedDate} onChange={(e) => setSelectedDate(e.detail.value)}>
                  <View className="px-3 py-1 bg-[#E8F0EB] rounded-lg">
                    <Text className="block text-sm text-[#3D7C5F] font-medium">{selectedDate}</Text>
                  </View>
                </Picker>
              ) : (
                <Picker
                  mode="date"
                  fields="month"
                  value={`${selectedMonth}-01`}
                  onChange={(e) => {
                    const val = e.detail.value as string
                    setSelectedMonth(val.slice(0, 7))
                  }}
                >
                  <View className="px-3 py-1 bg-[#E8F0EB] rounded-lg">
                    <Text className="block text-sm text-[#3D7C5F] font-medium">{selectedMonth}</Text>
                  </View>
                </Picker>
              )}
            </View>
            {dateMode === 'month' && (
              <Text className="block text-xs text-gray-400 mt-2">
                按月模式：所有记录将记入 {selectedMonth}，无需重复说日期
              </Text>
            )}
          </CardContent>
        </Card>
      </View>

      {/* Input Area */}
      <View className="px-4">
        <Card className="border-[#E5E1D8]">
          <CardContent className="p-4">
            <View className="bg-[#F7F5F0] rounded-xl p-3">
              <Textarea
                style={{ width: '100%', minHeight: '64px', backgroundColor: 'transparent', fontSize: '15px', lineHeight: '22px' }}
                placeholder="今天花了什么？说说看..."
                value={inputText}
                onInput={(e) => setInputText(e.detail.value)}
                maxlength={500}
              />
            </View>
            <View className="mt-3">
              <Button
                className="w-full bg-[#3D7C5F] text-white rounded-xl"
                onClick={handleParse}
                disabled={isParsing || !inputText.trim()}
              >
                {isParsing ? (
                  <View className="flex flex-row items-center justify-center gap-2">
                    <Loader size={16} color="#fff" className="animate-spin" />
                    <Text className="text-white">解析中</Text>
                  </View>
                ) : (
                  <View className="flex flex-row items-center justify-center gap-2">
                    <Send size={16} color="#fff" />
                    <Text className="text-white">智能记账</Text>
                  </View>
                )}
              </Button>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* Parsed Results */}
      {parsedResults.length > 0 && (
        <View className="px-4 mt-4">
          <View className="flex flex-row items-center justify-between mb-2">
            <View className="flex flex-row items-center gap-2">
              <PenLine size={16} color="#3D7C5F" />
              <Text className="block text-base font-semibold text-[#1A1A1A]">AI 解析结果</Text>
              <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{parsedResults.length} 笔</Badge>
            </View>
            <Text className="block text-lg font-bold text-[#E8913A]">合计 ¥{totalParsedAmount.toFixed(2)}</Text>
          </View>

          {parsedResults.map((result, idx) => (
            <Card key={idx} className="border-[#E5E1D8] mb-2">
              <CardContent className="p-3">
                <View className="flex flex-row items-start justify-between">
                  <View className="flex flex-col flex-1">
                    {/* Amount */}
                    {editingIdx === idx ? (
                      <View className="bg-[#F7F5F0] rounded-lg px-2 py-1 mb-2">
                        <Input
                          className="border-0 bg-transparent text-[#E8913A] text-xl font-bold ring-0 focus-within:ring-0"
                          type="digit"
                          value={result.amount != null ? String(result.amount) : ''}
                          onInput={(e) => handleUpdateResult(idx, 'amount', e.detail.value ? Number(e.detail.value) : null)}
                        />
                      </View>
                    ) : (
                      <Text className="block text-2xl font-bold text-[#E8913A] mb-1">
                        {result.amount != null ? `¥${result.amount}` : '金额未识别'}
                      </Text>
                    )}

                    {/* Category + Tag */}
                    <View className="flex flex-row items-center gap-2 mt-1 flex-wrap">
                      {editingIdx === idx ? (
                        <View className="flex flex-row flex-wrap gap-1">
                          {DEFAULT_CATEGORIES.map(cat => (
                            <View key={cat} onClick={() => handleUpdateResult(idx, 'category', cat)}>
                              <Badge className={`${result.category === cat ? 'bg-[#3D7C5F] text-white' : 'bg-[#F7F5F0] text-gray-500'} text-xs`}>
                                {cat}
                              </Badge>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <>
                          <Badge className="bg-[#E8F0EB] text-[#3D7C5F]">{result.category}</Badge>
                          {result.tag && <Badge className="bg-[#FFF7ED] text-[#E8913A]">{result.tag}</Badge>}
                        </>
                      )}
                    </View>

                    {/* Note + Date */}
                    {editingIdx === idx ? (
                      <View className="mt-2 flex flex-col gap-2">
                        <View className="bg-[#F7F5F0] rounded-lg px-2 py-1">
                          <Input
                            className="border-0 bg-transparent text-sm text-gray-600 ring-0 focus-within:ring-0"
                            value={result.note}
                            onInput={(e) => handleUpdateResult(idx, 'note', e.detail.value)}
                            placeholder="备注"
                          />
                        </View>
                        <Picker mode="date" value={result.expense_date} onChange={(e) => handleUpdateResult(idx, 'expense_date', e.detail.value)}>
                          <View className="bg-[#F7F5F0] rounded-lg px-2 py-1 flex flex-row items-center gap-1">
                            <Calendar size={12} color="#3D7C5F" />
                            <Text className="text-sm text-[#3D7C5F]">{result.expense_date}</Text>
                          </View>
                        </Picker>
                      </View>
                    ) : (
                      <Text className="block text-sm text-gray-500 mt-1">
                        {result.note || '无备注'} · {result.expense_date}
                      </Text>
                    )}
                  </View>

                  {/* Action buttons */}
                  <View className="flex flex-row items-center gap-1 ml-2">
                    <Button className="bg-transparent p-1" onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}>
                      <Pencil size={14} color={editingIdx === idx ? '#3D7C5F' : '#999'} />
                    </Button>
                    <Button className="bg-transparent p-1" onClick={() => handleRemoveResult(idx)}>
                      <X size={14} color="#EF4444" />
                    </Button>
                  </View>
                </View>
              </CardContent>
            </Card>
          ))}

          {/* Save / Clear buttons */}
          <View className="flex flex-row gap-3 mt-3">
            <View className="flex-1">
              <Button
                className="w-full rounded-xl bg-[#3D7C5F] text-white"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : `确认记账（${parsedResults.length} 笔）`}
              </Button>
            </View>
            <View className="flex-1">
              <Button
                className="w-full rounded-xl bg-white border border-[#E5E1D8] text-[#1A1A1A]"
                onClick={() => { setParsedResults([]); setEditingIdx(null) }}
              >
                清空结果
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* Empty State */}
      {parsedResults.length === 0 && (
        <View className="flex flex-col items-center justify-center mt-16">
          <PenLine size={48} color="#E5E1D8" />
          <Text className="block text-gray-400 mt-4 text-sm">说点什么开始记账吧</Text>
        </View>
      )}
    </View>
  )
}

export default IndexPage
