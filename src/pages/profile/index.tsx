import { useState, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { User, BookOpen, Brain, Trash2 } from 'lucide-react-taro'
import { Network } from '@/network'

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

  useEffect(() => {
    fetchPreferences()
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
            </View>
          </CardContent>
        </Card>
      </View>
    </View>
  )
}

export default ProfilePage
