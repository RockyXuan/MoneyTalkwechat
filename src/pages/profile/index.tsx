import { useState, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { User, BookOpen, Brain, Trash2, MessageCircle, Check, Copy } from 'lucide-react-taro'
import { Network } from '@/network'
import { useExpenseStore } from '@/store/expense-store'

const DEFAULT_USER_ID = 'default_user'

interface Preference {
  id: string
  preference_type: string
  key_word: string
  mapped_value: string
  source: string
  confidence: number
}

const ProfilePage = () => {
  const [preferences, setPreferences] = useState<Preference[]>([])
  const [bindingCode, setBindingCode] = useState<string | null>(null)
  const [isBound, setIsBound] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const { generateBindingCode, getWechatBindingStatus } = useExpenseStore()

  useEffect(() => {
    fetchPreferences()
    checkBindingStatus()
  }, [])

  // Refresh on every tab switch
  useDidShow(() => {
    fetchPreferences()
  })

  const fetchPreferences = async () => {
    try {
      const res = await Network.request({
        url: `/api/preferences?user_id=${DEFAULT_USER_ID}`,
      })
      console.log('GET /api/preferences response:', res.data)
      const data = res.data as { code: number; msg: string; data: Preference[] }
      if (data?.data) {
        setPreferences(data.data)
      }
    } catch (err) {
      console.error('获取偏好失败', err)
    }
  }

  const handleDeletePreference = async (id: string) => {
    try {
      await Network.request({
        url: `/api/preferences/${id}`,
        method: 'DELETE',
        data: { user_id: DEFAULT_USER_ID },
      })
      Taro.showToast({ title: '已删除', icon: 'success' })
      fetchPreferences()
    } catch (err) {
      console.error('删除偏好失败', err)
      Taro.showToast({ title: '删除失败', icon: 'none' })
    }
  }

  const checkBindingStatus = async () => {
    try {
      const result = await getWechatBindingStatus()
      setIsBound(result.bound)
    } catch (err) {
      console.error('检查绑定状态失败', err)
    }
  }

  const handleGenerateCode = async () => {
    setIsGenerating(true)
    try {
      const result = await generateBindingCode()
      if (result.bound) {
        setIsBound(true)
        Taro.showToast({ title: '已绑定', icon: 'success' })
      } else if (result.binding_code) {
        setBindingCode(result.binding_code)
      }
    } catch (err) {
      console.error('生成绑定码失败', err)
      Taro.showToast({ title: '获取失败', icon: 'none' })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyCode = () => {
    if (bindingCode) {
      Taro.setClipboardData({ data: bindingCode })
    }
  }

  return (
    <View className="min-h-full bg-[#F7F5F0] pb-20">
      {/* User Card */}
      <View className="px-4 pt-4">
        <Card className="border-[#E5E1D8] bg-[#3D7C5F]">
          <CardContent className="p-5 flex flex-row items-center gap-4">
            <View className="w-14 h-14 rounded-full bg-white flex items-center justify-center">
              <User size={28} color="#3D7C5F" />
            </View>
            <View className="flex flex-col">
              <Text className="block text-white text-lg font-semibold">记账达人</Text>
              <Text className="block text-white text-sm" style={{ opacity: 0.7 }}>让 AI 帮你轻松记账</Text>
            </View>
          </CardContent>
        </Card>
      </View>

      {/* AI Memory Section */}
      <View className="px-4 mt-4">
        <View className="flex flex-row items-center gap-2 mb-2">
          <Brain size={18} color="#3D7C5F" />
          <Text className="block text-base font-semibold text-[#1A1A1A]">AI 记忆偏好</Text>
          <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{preferences.length} 条</Badge>
        </View>

        {preferences.length > 0 ? (
          preferences.map((pref) => (
            <Card key={pref.id} className="border-[#E5E1D8] mb-2">
              <CardContent className="p-3 flex flex-row items-center justify-between">
                <View className="flex flex-col flex-1">
                  <View className="flex flex-row items-center gap-2">
                    <Text className="block text-sm font-medium text-[#1A1A1A]">{pref.key_word}</Text>
                    <Text className="block text-xs text-gray-400">→</Text>
                    <Badge className="bg-[#E8F0EB] text-[#3D7C5F] text-xs">{pref.mapped_value}</Badge>
                  </View>
                  <Text className="block text-xs text-gray-400 mt-1">
                    来源：{pref.source === 'user_correction' ? '手动修正' : 'AI 建议'} · 置信度 {pref.confidence}%
                  </Text>
                </View>
                <Button className="bg-transparent p-0" onClick={() => handleDeletePreference(pref.id)}>
                  <Trash2 size={14} color="#EF4444" />
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-[#E5E1D8]">
            <CardContent className="p-5 flex flex-col items-center">
              <Brain size={32} color="#E5E1D8" />
              <Text className="block text-sm text-gray-400 mt-2 text-center">
                还没有偏好记忆{'\n'}修改 AI 的分类后，系统会自动记住
              </Text>
            </CardContent>
          </Card>
        )}
      </View>

      {/* WeChat Binding Section */}
      <View className="px-4 mt-4">
        <View className="flex flex-row items-center gap-2 mb-2">
          <MessageCircle size={18} color="#3D7C5F" />
          <Text className="block text-base font-semibold text-[#1A1A1A]">微信绑定</Text>
          {isBound && <Badge className="bg-[#E8F5EE] text-[#3D7C5F] text-xs">已绑定</Badge>}
        </View>

        {isBound ? (
          <Card className="border-[#E5E1D8]">
            <CardContent className="p-4 flex flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-[#E8F5EE] flex items-center justify-center">
                <Check size={20} color="#3D7C5F" />
              </View>
              <View className="flex flex-col flex-1">
                <Text className="block text-sm font-medium text-[#1A1A1A]">已绑定微信公众号</Text>
                <Text className="block text-xs text-gray-400">直接对公众号发消息即可记账</Text>
              </View>
            </CardContent>
          </Card>
        ) : bindingCode ? (
          <Card className="border-[#E5E1D8]">
            <CardContent className="p-4">
              <View className="flex flex-col items-center mb-3">
                <Text className="block text-xs text-gray-500 mb-2">您的绑定码</Text>
                <Text className="block text-3xl font-bold text-[#3D7C5F] tracking-widest">{bindingCode}</Text>
              </View>
              <View className="bg-[#F7F5F0] rounded-lg p-3 mb-3">
                <Text className="block text-xs text-gray-600 mb-1">使用步骤：</Text>
                <Text className="block text-xs text-gray-500">1. 在微信搜索关注记账服务公众号</Text>
                <Text className="block text-xs text-gray-500">2. 对公众号发送「绑定 {bindingCode}」</Text>
                <Text className="block text-xs text-gray-500">3. 绑定成功后直接发消息即可记账</Text>
              </View>
              <Button className="w-full bg-[#3D7C5F] text-white" onClick={handleCopyCode}>
                <View className="flex flex-row items-center justify-center gap-2">
                  <Copy size={14} color="#fff" />
                  <Text className="text-white text-sm">复制绑定码</Text>
                </View>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[#E5E1D8]">
            <CardContent className="p-4">
              <Text className="block text-sm text-gray-600 mb-3">绑定微信公众号后，可直接在微信聊天中记账，无需打开小程序。</Text>
              <Button className="w-full bg-[#3D7C5F] text-white" onClick={handleGenerateCode} disabled={isGenerating}>
                <View className="flex flex-row items-center justify-center gap-2">
                  <MessageCircle size={14} color="#fff" />
                  <Text className="text-white text-sm">{isGenerating ? '生成中...' : '获取绑定码'}</Text>
                </View>
              </Button>
            </CardContent>
          </Card>
        )}
      </View>

      {/* Tips */}
      <View className="px-4 mt-4">
        <View className="flex flex-row items-center gap-2 mb-2">
          <BookOpen size={18} color="#3D7C5F" />
          <Text className="block text-base font-semibold text-[#1A1A1A]">使用技巧</Text>
        </View>
        <Card className="border-[#E5E1D8]">
          <CardContent className="p-4">
            <View className="flex flex-col gap-3">
              <Text className="block text-sm text-gray-600">1. 直接输入&ldquo;午饭花了30&rdquo;即可自动记账</Text>
              <Text className="block text-sm text-gray-600">2. 小程序端可按住语音按钮说话记账</Text>
              <Text className="block text-sm text-gray-600">3. 修改 AI 分类后，系统会记住你的偏好</Text>
              <Text className="block text-sm text-gray-600">4. 用得越多，AI 越懂你的消费习惯</Text>
              <Text className="block text-sm text-gray-600">5. 绑定微信公众号后，直接发消息即可记账</Text>
            </View>
          </CardContent>
        </Card>
      </View>
    </View>
  )
}

export default ProfilePage
