import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Mic, Send, Loader, PenLine } from 'lucide-react-taro'
import { Network } from '@/network'

const DEFAULT_USER_ID = 'default_user'

interface ParsedExpense {
  amount: number | null
  category: string
  tag: string
  note: string
  expense_date: string
  confidence: number
}

interface ExpenseRecord {
  id: string
  amount: string
  category: string
  tag: string | null
  note: string | null
  source_type: string
  raw_text: string | null
  expense_date: string
  created_at: string
}

const IndexPage = () => {
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [parsedResult, setParsedResult] = useState<ParsedExpense | null>(null)
  const [recentExpenses, setRecentExpenses] = useState<ExpenseRecord[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP
  const [recorderManager, setRecorderManager] = useState<Taro.RecorderManager | null>(null)

  useEffect(() => {
    if (isWeapp) {
      const manager = Taro.getRecorderManager()
      manager.onStart(() => {
        console.log('录音开始')
        setIsRecording(true)
      })
      manager.onStop(async (res) => {
        console.log('录音结束', res.tempFilePath)
        setIsRecording(false)
        await handleAudioUpload(res.tempFilePath)
      })
      manager.onError((err) => {
        console.error('录音错误', err)
        setIsRecording(false)
        Taro.showToast({ title: '录音失败', icon: 'none' })
      })
      setRecorderManager(manager)
    }
  }, [isWeapp])

  useEffect(() => {
    fetchRecentExpenses()
  }, [])

  const fetchRecentExpenses = async () => {
    try {
      const res = await Network.request({
        url: `/api/expenses?user_id=${DEFAULT_USER_ID}&limit=5`,
      })
      console.log('GET /api/expenses response:', res.data)
      const data = res.data as { code: number; msg: string; data: ExpenseRecord[] }
      if (data?.data) {
        setRecentExpenses(data.data)
      }
    } catch (err) {
      console.error('获取最近记录失败', err)
    }
  }

  const handleTextParse = async () => {
    if (!inputText.trim()) {
      Taro.showToast({ title: '请输入消费内容', icon: 'none' })
      return
    }
    setIsParsing(true)
    setParsedResult(null)
    try {
      const res = await Network.request({
        url: '/api/ai/parse',
        method: 'POST',
        data: { text: inputText, user_id: DEFAULT_USER_ID },
      })
      console.log('POST /api/ai/parse response:', res.data)
      const data = res.data as { code: number; msg: string; data: ParsedExpense }
      if (data?.data) {
        setParsedResult(data.data)
      }
    } catch (err) {
      console.error('AI 解析失败', err)
      Taro.showToast({ title: '解析失败，请重试', icon: 'none' })
    } finally {
      setIsParsing(false)
    }
  }

  const handleAudioUpload = async (filePath: string) => {
    setIsParsing(true)
    try {
      const res = await Network.uploadFile({
        url: '/api/asr/recognize',
        filePath,
        name: 'audio',
        formData: { user_id: DEFAULT_USER_ID },
      })
      console.log('ASR upload response:', res.data)
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
      if (data?.data?.text) {
        setInputText(data.data.text)
        Taro.showToast({ title: '语音已转文字', icon: 'success' })
      }
    } catch (err) {
      console.error('语音识别失败', err)
      Taro.showToast({ title: '语音识别失败', icon: 'none' })
    } finally {
      setIsParsing(false)
    }
  }

  const startRecording = () => {
    if (!isWeapp) {
      Taro.showToast({ title: '录音仅支持小程序', icon: 'none' })
      return
    }
    recorderManager?.start({
      format: 'wav',
      sampleRate: 16000,
      numberOfChannels: 1,
    })
  }

  const stopRecording = () => {
    recorderManager?.stop()
  }

  const handleSave = async () => {
    if (!parsedResult) return
    setIsSaving(true)
    try {
      const res = await Network.request({
        url: '/api/expenses',
        method: 'POST',
        data: {
          user_id: DEFAULT_USER_ID,
          amount: parsedResult.amount,
          category: parsedResult.category,
          tag: parsedResult.tag,
          note: parsedResult.note,
          source_type: 'text',
          raw_text: inputText,
          expense_date: parsedResult.expense_date,
        },
      })
      console.log('POST /api/expenses response:', res.data)
      Taro.showToast({ title: '记账成功', icon: 'success' })
      setParsedResult(null)
      setInputText('')
      fetchRecentExpenses()
    } catch (err) {
      console.error('保存失败', err)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setIsSaving(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <View className="min-h-full bg-[#F7F5F0] pb-20">
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <Text className="block text-xl font-semibold text-[#1A1A1A]">记一笔</Text>
        <Text className="block text-sm text-gray-500 mt-1">{today}</Text>
      </View>

      {/* Input Area */}
      <View className="px-4 mt-2">
        <Card className="border-[#E5E1D8]">
          <CardContent className="p-4">
            <Input
              className="border-0 bg-[#F7F5F0] rounded-xl text-[#1A1A1A] text-base ring-0 ring-offset-0 focus-within:ring-0 focus-within:border-0"
              placeholder="今天花了什么？说说看..."
              value={inputText}
              onInput={(e) => setInputText(e.detail.value)}
            />

            <View className="flex flex-row gap-3 mt-3">
              <View className="flex-1">
                <Button
                  className="w-full bg-[#3D7C5F] text-white rounded-xl"
                  onClick={handleTextParse}
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
              <View className="flex-shrink-0">
                <Button
                  className="rounded-xl bg-[#E8F0EB] text-[#3D7C5F]"
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  <View className="flex flex-row items-center justify-center gap-1">
                    <Mic size={16} color={isRecording ? '#EF4444' : '#3D7C5F'} />
                    <Text className={isRecording ? 'text-red-500' : 'text-[#3D7C5F]'}>
                      {isRecording ? '停止' : '语音'}
                    </Text>
                  </View>
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* Parsed Result */}
      {parsedResult && (
        <View className="px-4 mt-4">
          <View className="flex flex-row items-center gap-2 mb-2">
            <PenLine size={16} color="#3D7C5F" />
            <Text className="block text-base font-semibold text-[#1A1A1A]">AI 解析结果</Text>
          </View>
          <Card className="border-[#E5E1D8]">
            <CardContent className="p-4">
              <View className="flex flex-row items-baseline gap-2 mb-3">
                <Text className="block text-3xl font-bold text-[#E8913A]">
                  {parsedResult.amount != null ? `¥${parsedResult.amount}` : '金额未识别'}
                </Text>
                <Badge className="bg-[#E8F0EB] text-[#3D7C5F]">{parsedResult.category}</Badge>
                {parsedResult.tag && (
                  <Badge className="bg-[#FFF7ED] text-[#E8913A]">{parsedResult.tag}</Badge>
                )}
              </View>
              <Text className="block text-sm text-gray-500 mb-1">备注：{parsedResult.note || '无'}</Text>
              <Text className="block text-sm text-gray-500 mb-4">日期：{parsedResult.expense_date}</Text>
              <View className="flex flex-row gap-3">
                <View className="flex-1">
                  <Button
                    className="w-full rounded-xl bg-[#3D7C5F] text-white"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? '保存中...' : '确认记账'}
                  </Button>
                </View>
                <View className="flex-1">
                  <Button
                    className="w-full rounded-xl bg-white border border-[#E5E1D8] text-[#1A1A1A]"
                    onClick={() => setParsedResult(null)}
                  >
                    取消
                  </Button>
                </View>
              </View>
            </CardContent>
          </Card>
        </View>
      )}

      {/* Recent Records */}
      {recentExpenses.length > 0 && (
        <View className="px-4 mt-4">
          <Text className="block text-base font-semibold text-[#1A1A1A] mb-2">最近记录</Text>
          {recentExpenses.map((item) => (
            <Card key={item.id} className="border-[#E5E1D8] mb-2">
              <CardContent className="p-3 flex flex-row items-center justify-between">
                <View className="flex flex-col">
                  <View className="flex flex-row items-center gap-2">
                    <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{item.category}</Badge>
                    {item.tag && <Text className="text-xs text-[#E8913A]">{item.tag}</Text>}
                  </View>
                  <Text className="block text-sm text-gray-500 mt-1">{item.note || item.raw_text || ''}</Text>
                </View>
                <Text className="block text-lg font-bold text-[#E8913A]">¥{item.amount}</Text>
              </CardContent>
            </Card>
          ))}
        </View>
      )}

      {/* Empty State */}
      {recentExpenses.length === 0 && !parsedResult && (
        <View className="flex flex-col items-center justify-center mt-16">
          <PenLine size={48} color="#E5E1D8" />
          <Text className="block text-gray-400 mt-4 text-sm">还没有记录，说点什么开始记账吧</Text>
        </View>
      )}
    </View>
  )
}

export default IndexPage
