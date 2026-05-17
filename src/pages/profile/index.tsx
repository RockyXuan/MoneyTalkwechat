import { useState, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { User, Brain, Trash2, MessageCircle, Check, Copy, Settings, LifeBuoy, Star, Shield, Sparkles, Inbox, ChartBarIncreasing, Receipt, BookOpen } from 'lucide-react-taro'
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
  const [aiPreferenceEnabled, setAiPreferenceEnabled] = useState(true)
  const { generateBindingCode, getWechatBindingStatus } = useExpenseStore()

  useEffect(() => {
    fetchPreferences()
    checkBindingStatus()
  }, [])

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
    <View className="min-h-full pb-20" style={{ backgroundColor: '#F8F9FC' }}>
      {/* User Header - Gradient Card */}
      <View className="mx-4 mt-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #2979FF, #5B8FFF)' }}>
        <View className="flex flex-row items-center gap-4">
          <View className="w-16 h-16 rounded-full bg-white bg-opacity-20 flex items-center justify-center">
            <User size={30} color="#fff" />
          </View>
          <View className="flex flex-col">
            <Text className="block text-white text-xl font-bold">记账达人</Text>
            <Text className="block text-white text-sm" style={{ opacity: 0.7 }}>让 AI 帮你轻松记账</Text>
          </View>
        </View>
      </View>

      {/* Quick Stats - 3 Cards */}
      <View className="flex flex-row gap-3 mx-4 mt-4">
        <View className="flex-1 bg-white rounded-2xl p-3 flex flex-col items-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <View className="w-8 h-8 rounded-full flex items-center justify-center mb-1" style={{ backgroundColor: '#F0F5FF' }}>
            <Receipt size={16} color="#2979FF" />
          </View>
          <Text className="block text-lg font-bold text-[#1D2129]">0</Text>
          <Text className="block text-xs text-[#86909C]">本月笔数</Text>
        </View>
        <View className="flex-1 bg-white rounded-2xl p-3 flex flex-col items-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <View className="w-8 h-8 rounded-full flex items-center justify-center mb-1" style={{ backgroundColor: '#FFF7E8' }}>
            <ChartBarIncreasing size={16} color="#FF7D00" />
          </View>
          <Text className="block text-lg font-bold text-[#1D2129]">0</Text>
          <Text className="block text-xs text-[#86909C]">连续记账</Text>
        </View>
        <View className="flex-1 bg-white rounded-2xl p-3 flex flex-col items-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <View className="w-8 h-8 rounded-full flex items-center justify-center mb-1" style={{ backgroundColor: '#E8FFEA' }}>
            <Sparkles size={16} color="#00B42A" />
          </View>
          <Text className="block text-lg font-bold text-[#1D2129]">{preferences.length}</Text>
          <Text className="block text-xs text-[#86909C]">AI 学习</Text>
        </View>
      </View>

      {/* AI Preference Toggle */}
      <View className="mx-4 mt-4">
        <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <View className="flex flex-row items-center justify-between">
            <View className="flex flex-row items-center gap-2">
              <Brain size={18} color="#2979FF" />
              <Text className="block text-sm font-medium text-[#1D2129]">AI 偏好记忆</Text>
            </View>
            <View
              className="px-4 py-1 rounded-full"
              style={{ backgroundColor: aiPreferenceEnabled ? '#2979FF' : '#C9CDD4' }}
              onClick={() => setAiPreferenceEnabled(!aiPreferenceEnabled)}
            >
              <Text className="block text-xs text-white">{aiPreferenceEnabled ? '开启' : '关闭'}</Text>
            </View>
          </View>
          <Text className="block text-xs text-[#86909C] mt-2">修改 AI 分类后，系统会自动记住你的偏好</Text>
        </View>
      </View>

      {/* AI Preferences List */}
      {preferences.length > 0 && (
        <View className="mx-4 mt-3">
          {preferences.map((pref) => (
            <View key={pref.id} className="bg-white rounded-2xl p-4 mb-2" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <View className="flex flex-row items-center justify-between">
                <View className="flex flex-col flex-1">
                  <View className="flex flex-row items-center gap-2">
                    <Text className="block text-sm font-medium text-[#1D2129]">{pref.key_word}</Text>
                    <Text className="block text-xs text-[#86909C]">→</Text>
                    <View className="rounded-full px-2 py-1" style={{ backgroundColor: '#F0F5FF' }}>
                      <Text className="text-xs text-[#2979FF]">{pref.mapped_value}</Text>
                    </View>
                  </View>
                  <Text className="block text-xs text-[#C9CDD4] mt-1">
                    来源：{pref.source === 'user_correction' ? '手动修正' : 'AI 建议'} · 置信度 {pref.confidence}%
                  </Text>
                </View>
                <View onClick={() => handleDeletePreference(pref.id)}>
                  <Trash2 size={14} color="#F53F3F" />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* WeChat Binding */}
      <View className="mx-4 mt-4">
        <View className="flex flex-row items-center gap-2 mb-2">
          <MessageCircle size={18} color="#00B42A" />
          <Text className="block text-base font-semibold text-[#1D2129]">微信绑定</Text>
          {isBound && (
            <View className="rounded-full px-2 py-1" style={{ backgroundColor: '#E8FFEA' }}>
              <Text className="text-xs text-[#00B42A]">已绑定</Text>
            </View>
          )}
        </View>

        {isBound ? (
          <View className="bg-white rounded-2xl p-4 flex flex-row items-center gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <View className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E8FFEA' }}>
              <Check size={20} color="#00B42A" />
            </View>
            <View className="flex flex-col flex-1">
              <Text className="block text-sm font-medium text-[#1D2129]">已绑定微信公众号</Text>
              <Text className="block text-xs text-[#86909C]">直接对公众号发消息即可记账</Text>
            </View>
          </View>
        ) : bindingCode ? (
          <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <View className="flex flex-col items-center mb-3">
              <Text className="block text-xs text-[#86909C] mb-2">您的绑定码</Text>
              <Text className="block text-3xl font-bold text-[#2979FF] tracking-widest">{bindingCode}</Text>
            </View>
            <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: '#F8F9FC' }}>
              <Text className="block text-xs text-[#1D2129] mb-1">使用步骤：</Text>
              <Text className="block text-xs text-[#86909C]">1. 在微信搜索关注记账服务公众号</Text>
              <Text className="block text-xs text-[#86909C]">2. 对公众号发送「绑定 {bindingCode}」</Text>
              <Text className="block text-xs text-[#86909C]">3. 绑定成功后直接发消息即可记账</Text>
            </View>
            <Button className="w-full text-white rounded-xl" style={{ background: 'linear-gradient(135deg, #2979FF, #5B8FFF)' }} onClick={handleCopyCode}>
              <View className="flex flex-row items-center justify-center gap-2">
                <Copy size={14} color="#fff" />
                <Text className="text-white text-sm">复制绑定码</Text>
              </View>
            </Button>
          </View>
        ) : (
          <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <Text className="block text-sm text-[#1D2129] mb-3">绑定微信公众号后，可直接在微信聊天中记账，无需打开小程序。</Text>
            <Button className="w-full text-white rounded-xl" style={{ background: 'linear-gradient(135deg, #2979FF, #5B8FFF)' }} onClick={handleGenerateCode} disabled={isGenerating}>
              <View className="flex flex-row items-center justify-center gap-2">
                <MessageCircle size={14} color="#fff" />
                <Text className="text-white text-sm">{isGenerating ? '生成中...' : '获取绑定码'}</Text>
              </View>
            </Button>
          </View>
        )}
      </View>

      {/* Function Grid 2x3 */}
      <View className="mx-4 mt-4">
        <View className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <View className="flex flex-row">
            <View className="flex-1 p-4 flex flex-col items-center" style={{ borderRight: '1px solid #F8F9FC', borderBottom: '1px solid #F8F9FC' }}>
              <View className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#F0F5FF' }}>
                <Settings size={20} color="#2979FF" />
              </View>
              <Text className="block text-xs text-[#1D2129]">设置</Text>
            </View>
            <View className="flex-1 p-4 flex flex-col items-center" style={{ borderBottom: '1px solid #F8F9FC' }}>
              <View className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#FFF7E8' }}>
                <Star size={20} color="#FF7D00" />
              </View>
              <Text className="block text-xs text-[#1D2129]">给个好评</Text>
            </View>
          </View>
          <View className="flex flex-row">
            <View className="flex-1 p-4 flex flex-col items-center" style={{ borderRight: '1px solid #F8F9FC', borderBottom: '1px solid #F8F9FC' }}>
              <View className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#E8FFEA' }}>
                <LifeBuoy size={20} color="#00B42A" />
              </View>
              <Text className="block text-xs text-[#1D2129]">帮助反馈</Text>
            </View>
            <View className="flex-1 p-4 flex flex-col items-center" style={{ borderBottom: '1px solid #F8F9FC' }}>
              <View className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#F5F0FF' }}>
                <Shield size={20} color="#8B5CF6" />
              </View>
              <Text className="block text-xs text-[#1D2129]">隐私政策</Text>
            </View>
          </View>
          <View className="flex flex-row">
            <View className="flex-1 p-4 flex flex-col items-center" style={{ borderRight: '1px solid #F8F9FC' }}>
              <View className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#F0F5FF' }}>
                <BookOpen size={20} color="#2979FF" />
              </View>
              <Text className="block text-xs text-[#1D2129]">使用技巧</Text>
            </View>
            <View className="flex-1 p-4 flex flex-col items-center">
              <View className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: '#F5F0FF' }}>
                <Inbox size={20} color="#8B5CF6" />
              </View>
              <Text className="block text-xs text-[#1D2129]">收集箱</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

export default ProfilePage
