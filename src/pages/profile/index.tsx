import { useState, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { User, BookOpen, Brain, Trash2, MessageCircle, Check, Copy, ChevronRight, Settings, LifeBuoy, Star, Shield } from 'lucide-react-taro'
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
    <View className="min-h-full pb-20" style={{ backgroundColor: '#F7F8FA' }}>
      {/* User Header - Gradient Card */}
      <View className="mx-4 mt-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}>
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

      {/* AI Memory Section */}
      <View className="mx-4 mt-4">
        <View className="flex flex-row items-center gap-2 mb-2">
          <Brain size={18} color="#7C3AED" />
          <Text className="block text-base font-semibold text-foreground">AI 记忆偏好</Text>
          <View className="bg-purple-50 rounded-full px-2 py-1">
            <Text className="text-xs text-purple-600">{preferences.length} 条</Text>
          </View>
        </View>

        {preferences.length > 0 ? (
          preferences.map((pref) => (
            <View key={pref.id} className="bg-white rounded-2xl p-4 mb-2" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <View className="flex flex-row items-center justify-between">
                <View className="flex flex-col flex-1">
                  <View className="flex flex-row items-center gap-2">
                    <Text className="block text-sm font-medium text-foreground">{pref.key_word}</Text>
                    <Text className="block text-xs text-slate-400">→</Text>
                    <View className="bg-blue-50 rounded-full px-2 py-1">
                      <Text className="text-xs text-blue-600">{pref.mapped_value}</Text>
                    </View>
                  </View>
                  <Text className="block text-xs text-slate-400 mt-1">
                    来源：{pref.source === 'user_correction' ? '手动修正' : 'AI 建议'} · 置信度 {pref.confidence}%
                  </Text>
                </View>
                <Button className="bg-transparent p-0" onClick={() => handleDeletePreference(pref.id)}>
                  <Trash2 size={14} color="#EF4444" />
                </Button>
              </View>
            </View>
          ))
        ) : (
          <View className="bg-white rounded-2xl p-5 flex flex-col items-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <View className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
              <Brain size={24} color="#94A3B8" />
            </View>
            <Text className="block text-sm text-slate-400 mt-2 text-center">
              还没有偏好记忆{'\n'}修改 AI 的分类后，系统会自动记住
            </Text>
          </View>
        )}
      </View>

      {/* WeChat Binding Section */}
      <View className="mx-4 mt-4">
        <View className="flex flex-row items-center gap-2 mb-2">
          <MessageCircle size={18} color="#10B981" />
          <Text className="block text-base font-semibold text-foreground">微信绑定</Text>
          {isBound && (
            <View className="bg-green-50 rounded-full px-2 py-1">
              <Text className="text-xs text-green-600">已绑定</Text>
            </View>
          )}
        </View>

        {isBound ? (
          <View className="bg-white rounded-2xl p-4 flex flex-row items-center gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <View className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <Check size={20} color="#10B981" />
            </View>
            <View className="flex flex-col flex-1">
              <Text className="block text-sm font-medium text-foreground">已绑定微信公众号</Text>
              <Text className="block text-xs text-slate-400">直接对公众号发消息即可记账</Text>
            </View>
          </View>
        ) : bindingCode ? (
          <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <View className="flex flex-col items-center mb-3">
              <Text className="block text-xs text-slate-400 mb-2">您的绑定码</Text>
              <Text className="block text-3xl font-bold text-blue-600 tracking-widest">{bindingCode}</Text>
            </View>
            <View className="bg-slate-50 rounded-xl p-3 mb-3">
              <Text className="block text-xs text-slate-600 mb-1">使用步骤：</Text>
              <Text className="block text-xs text-slate-500">1. 在微信搜索关注记账服务公众号</Text>
              <Text className="block text-xs text-slate-500">2. 对公众号发送「绑定 {bindingCode}」</Text>
              <Text className="block text-xs text-slate-500">3. 绑定成功后直接发消息即可记账</Text>
            </View>
            <Button className="w-full bg-blue-600 text-white rounded-xl" onClick={handleCopyCode}>
              <View className="flex flex-row items-center justify-center gap-2">
                <Copy size={14} color="#fff" />
                <Text className="text-white text-sm">复制绑定码</Text>
              </View>
            </Button>
          </View>
        ) : (
          <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <Text className="block text-sm text-slate-600 mb-3">绑定微信公众号后，可直接在微信聊天中记账，无需打开小程序。</Text>
            <Button className="w-full bg-blue-600 text-white rounded-xl" onClick={handleGenerateCode} disabled={isGenerating}>
              <View className="flex flex-row items-center justify-center gap-2">
                <MessageCircle size={14} color="#fff" />
                <Text className="text-white text-sm">{isGenerating ? '生成中...' : '获取绑定码'}</Text>
              </View>
            </Button>
          </View>
        )}
      </View>

      {/* Menu Items */}
      <View className="mx-4 mt-4">
        <View className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <View className="flex flex-row items-center justify-between p-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <View className="flex flex-row items-center gap-3">
              <View className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <Settings size={16} color="#2563EB" />
              </View>
              <Text className="block text-sm text-foreground">设置</Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </View>
          <View className="flex flex-row items-center justify-between p-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <View className="flex flex-row items-center gap-3">
              <View className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                <Star size={16} color="#F59E0B" />
              </View>
              <Text className="block text-sm text-foreground">给个好评</Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </View>
          <View className="flex flex-row items-center justify-between p-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <View className="flex flex-row items-center gap-3">
              <View className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                <LifeBuoy size={16} color="#10B981" />
              </View>
              <Text className="block text-sm text-foreground">帮助与反馈</Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </View>
          <View className="flex flex-row items-center justify-between p-4">
            <View className="flex flex-row items-center gap-3">
              <View className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center">
                <Shield size={16} color="#64748B" />
              </View>
              <Text className="block text-sm text-foreground">隐私政策</Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </View>
        </View>
      </View>

      {/* Tips */}
      <View className="mx-4 mt-4">
        <View className="flex flex-row items-center gap-2 mb-2">
          <BookOpen size={18} color="#F59E0B" />
          <Text className="block text-base font-semibold text-foreground">使用技巧</Text>
        </View>
        <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <View className="flex flex-col gap-3">
            <View className="flex flex-row items-start gap-2">
              <View className="w-5 h-5 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Text className="text-xs text-blue-600 font-bold">1</Text>
              </View>
              <Text className="block text-sm text-slate-600">直接输入&ldquo;午饭花了30&rdquo;即可自动记账</Text>
            </View>
            <View className="flex flex-row items-start gap-2">
              <View className="w-5 h-5 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Text className="text-xs text-blue-600 font-bold">2</Text>
              </View>
              <Text className="block text-sm text-slate-600">小程序端可按住语音按钮说话记账</Text>
            </View>
            <View className="flex flex-row items-start gap-2">
              <View className="w-5 h-5 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Text className="text-xs text-blue-600 font-bold">3</Text>
              </View>
              <Text className="block text-sm text-slate-600">修改 AI 分类后，系统会记住你的偏好</Text>
            </View>
            <View className="flex flex-row items-start gap-2">
              <View className="w-5 h-5 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Text className="text-xs text-blue-600 font-bold">4</Text>
              </View>
              <Text className="block text-sm text-slate-600">用得越多，AI 越懂你的消费习惯</Text>
            </View>
            <View className="flex flex-row items-start gap-2">
              <View className="w-5 h-5 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Text className="text-xs text-blue-600 font-bold">5</Text>
              </View>
              <Text className="block text-sm text-slate-600">绑定微信公众号后，直接发消息即可记账</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

export default ProfilePage
