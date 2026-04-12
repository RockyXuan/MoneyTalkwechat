import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader, PenLine, X, Pencil } from 'lucide-react-taro'
import { useExpenseStore, ParsedExpense } from '@/store/expense-store'

const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '日用品', '娱乐', '医疗', '教育', '居住', '通讯', '其他']

const IndexPage = () => {
  const [inputText, setInputText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedResults, setParsedResults] = useState<ParsedExpense[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  const { expenses, fetchExpenses, addExpenses, deleteExpense } = useExpenseStore()

  useEffect(() => {
    fetchExpenses(10)
  }, [])

  const handleParse = async () => {
    if (!inputText.trim()) {
      Taro.showToast({ title: '请输入消费内容', icon: 'none' })
      return
    }
    setIsParsing(true)
    try {
      const results = await useExpenseStore.getState().parseText(inputText)
      if (results.length > 0) {
        // Append to existing results so user can accumulate
        setParsedResults(prev => [...prev, ...results])
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

  const handleDeleteRecent = async (id: string) => {
    await deleteExpense(id)
    Taro.showToast({ title: '已删除', icon: 'success' })
  }

  const totalParsedAmount = parsedResults.reduce((sum, r) => sum + (r.amount || 0), 0)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <View className="min-h-full bg-[#F7F5F0] pb-20">
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <Text className="block text-xl font-semibold text-[#1A1A1A]">记一笔</Text>
        <Text className="block text-sm text-gray-500 mt-1">{today}</Text>
      </View>

      {/* Input Area - two-line height textarea */}
      <View className="px-4 mt-2">
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

                    {/* Note */}
                    {editingIdx === idx ? (
                      <View className="bg-[#F7F5F0] rounded-lg px-2 py-1 mt-2">
                        <Input
                          className="border-0 bg-transparent text-sm text-gray-600 ring-0 focus-within:ring-0"
                          value={result.note}
                          onInput={(e) => handleUpdateResult(idx, 'note', e.detail.value)}
                          placeholder="备注"
                        />
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

      {/* Recent Records */}
      {expenses.length > 0 && (
        <View className="px-4 mt-4">
          <Text className="block text-base font-semibold text-[#1A1A1A] mb-2">最近记录</Text>
          {expenses.slice(0, 10).map((item) => (
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
                  <Button className="bg-transparent p-0" onClick={() => handleDeleteRecent(item.id)}>
                    <X size={14} color="#999" />
                  </Button>
                </View>
              </CardContent>
            </Card>
          ))}
        </View>
      )}

      {/* Empty State */}
      {expenses.length === 0 && parsedResults.length === 0 && (
        <View className="flex flex-col items-center justify-center mt-16">
          <PenLine size={48} color="#E5E1D8" />
          <Text className="block text-gray-400 mt-4 text-sm">还没有记录，说点什么开始记账吧</Text>
        </View>
      )}
    </View>
  )
}

export default IndexPage
