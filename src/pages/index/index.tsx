import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, ScrollView } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ChevronLeft, ChevronRight, Plus, Calendar,
  Sparkles, Inbox, Lightbulb, Ellipsis
} from 'lucide-react-taro'
import { useExpenseStore, PendingRecord } from '@/store/expense-store'

// Category emoji map matching prototype
const CATEGORY_ICONS: Record<string, string> = {
  '餐饮': '🍔', '交通': '🚗', '购物': '🛒', '住房': '🏠',
  '娱乐': '🎮', '医疗': '💊', '教育': '📚', '服饰': '👕',
  '其他': '💡', '订阅': '📱', '通讯': '📞', '美妆': '💄',
  '运动': '⚽', '旅行': '✈️', '宠物': '🐾', '礼物': '🎁',
  '工资': '💰', '理财': '📈', '红包': '🧧', '退款': '💳',
  '居住': '🏠',
}

const getCategoryIcon = (name: string) => CATEGORY_ICONS[name] || '💡'

const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '服饰', '其他']

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const formatDateDisplay = (dateStr: string) => {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`
}

const formatDateFull = (dateStr: string) => {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

interface RecentExpense {
  id: string
  note: string
  amount: number
  category: string
  expense_date: string
}

const IndexPage = () => {
  const [selectedCategory, setSelectedCategory] = useState('餐饮')
  const [amount, setAmount] = useState('')
  const [remark, setRemark] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Inbox
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([])

  // Recent records from store
  const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([])

  // Saving state
  const [isSaving, setIsSaving] = useState(false)

  const { addExpenses, fetchPendingRecords, fetchExpenses, expenses } = useExpenseStore()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const records = await fetchPendingRecords()
      setPendingRecords(records)
    } catch (err) {
      console.error('loadPendingRecords error:', err)
    }
    try {
      await fetchExpenses()
      const sorted = [...(expenses || [])].sort((a, b) =>
        new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime()
      )
      setRecentExpenses(sorted.slice(0, 5).map(e => ({
        id: e.id, note: e.note || '', amount: Number(e.amount) || 0,
        category: e.category || '其他', expense_date: e.expense_date || ''
      })))
    } catch (err) {
      console.error('fetchExpenses error:', err)
    }
  }

  const handleDatePrev = () => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  const handleDateNext = () => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + 1)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  const handleSave = async () => {
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      Taro.showToast({ title: '请输入金额', icon: 'none' })
      return
    }
    setIsSaving(true)
    try {
      await addExpenses([{
        note: remark || selectedCategory,
        amount: numAmount,
        category: selectedCategory,
        tag: '',
        expense_date: selectedDate,
        confidence: 1,
      }], remark || selectedCategory)
      Taro.showToast({ title: '保存成功', icon: 'success' })
      setAmount('')
      setRemark('')
      setSelectedCategory('餐饮')
      loadData()
    } catch (err) {
      console.error('save error:', err)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSmartRecord = () => {
    Taro.showToast({ title: '智能记账开发中', icon: 'none' })
  }

  const handleInboxClick = () => {
    if (pendingRecords.length === 0) {
      Taro.showToast({ title: '暂无待确认记录', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: '/pages/category-detail/index?type=inbox' })
  }

  const handleViewAll = () => {
    Taro.switchTab({ url: '/pages/bills/index' })
  }

  return (
    <View className="h-full flex flex-col" style={{ backgroundColor: '#F5F7FB' }}>
      <ScrollView scrollY className="flex-1" style={{ paddingBottom: '100px' }}>

        {/* 1. Header */}
        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: '56px', paddingLeft: '20px', paddingRight: '20px' }}>
          <Text className="block" style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A' }}>记一笔</Text>
          <View style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ellipsis size={20} color="#8A8A8A" />
          </View>
        </View>

        {/* 2. Date selector */}
        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '16px', paddingTop: '8px', paddingBottom: '8px', paddingLeft: '20px', paddingRight: '20px' }}>
          <View onClick={handleDatePrev} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={16} color="#8A8A8A" />
          </View>
          <Text className="block" style={{ fontSize: '14px', color: '#8A8A8A', fontWeight: '500' }}>{formatDateDisplay(selectedDate)}</Text>
          <View onClick={handleDateNext} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} color="#8A8A8A" />
          </View>
        </View>

        {/* 3. Amount input */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '8px', paddingBottom: '4px' }}>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: '4px' }}>
            <Text className="block" style={{ fontSize: '24px', fontWeight: '700', color: '#1A1A1A' }}>¥</Text>
            <View style={{ flex: 1, backgroundColor: 'transparent' }}>
              <Input
                type="digit"
                style={{ fontSize: '38px', fontWeight: '700', color: '#1A1A1A', backgroundColor: 'transparent', width: '100%' }}
                placeholder="0.00"
                placeholderStyle="color:#C9CDD4"
                value={amount}
                onInput={(e) => setAmount(e.detail.value)}
              />
            </View>
          </View>
          <View style={{ marginTop: '8px', borderBottomWidth: '1px', borderBottomColor: 'rgba(240,242,245,0.3)', borderBottomStyle: 'solid' }} />
        </View>

        {/* 4. Category chips */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '16px' }}>
          <ScrollView scrollX style={{ width: '100%', whiteSpace: 'nowrap' }}>
            <View style={{ display: 'flex', flexDirection: 'row', gap: '8px', paddingBottom: '8px' }}>
              {DEFAULT_CATEGORIES.map(name => {
                const isActive = selectedCategory === name
                return (
                  <View
                    key={name}
                    onClick={() => setSelectedCategory(name)}
                    style={{
                      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
                      paddingLeft: '14px', paddingRight: '14px', paddingTop: '8px', paddingBottom: '8px', borderRadius: '999px',
                      backgroundColor: isActive ? '#2F7BFF' : '#FFFFFF',
                      borderWidth: '1px', borderStyle: 'solid',
                      borderColor: isActive ? '#2F7BFF' : 'rgba(240,242,245,0.3)',
                      flexShrink: 0,
                    }}
                  >
                    <Text className="block" style={{ fontSize: '14px' }}>{getCategoryIcon(name)}</Text>
                    <Text
                      className="block"
                      style={{
                        fontSize: '14px', fontWeight: isActive ? '500' : '400',
                        color: isActive ? '#FFFFFF' : '#8A8A8A',
                      }}
                    >
                      {name}
                    </Text>
                  </View>
                )
              })}
              {/* Add category button */}
              <View style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px',
                paddingLeft: '14px', paddingRight: '14px', paddingTop: '8px', paddingBottom: '8px', borderRadius: '999px',
                borderWidth: '1px', borderStyle: 'dashed',
                borderColor: 'rgba(240,242,245,0.4)', backgroundColor: '#FFFFFF',
                flexShrink: 0,
              }}
              >
                <Plus size={14} color="#8A8A8A" />
              </View>
            </View>
          </ScrollView>
        </View>

        {/* 5. Remark input */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '16px' }}>
          <View style={{
            width: '100%', backgroundColor: '#F0F2F5', borderRadius: '12px',
            paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px',
          }}
          >
            <Input
              style={{ width: '100%', fontSize: '14px', backgroundColor: 'transparent', color: '#1A1A1A' }}
              placeholder="点击添加备注..."
              placeholderStyle="color:rgba(138,138,138,0.5)"
              value={remark}
              onInput={(e) => setRemark(e.detail.value)}
            />
          </View>
        </View>

        {/* 6. Date row */}
        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', paddingLeft: '20px', paddingRight: '20px', paddingTop: '16px' }}>
          <Calendar size={16} color="#8A8A8A" />
          <Text className="block" style={{ fontSize: '14px', color: '#8A8A8A' }}>{formatDateFull(selectedDate)}</Text>
        </View>

        {/* 7. Save button */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '20px' }}>
          <Button
            className="w-full"
            style={{
              backgroundColor: '#2F7BFF', borderRadius: '12px',
              height: '48px', fontWeight: '600', fontSize: '16px',
            }}
            onClick={handleSave}
            disabled={isSaving}
          >
            <Text className="block" style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: '600' }}>
              {isSaving ? '保存中...' : '保存'}
            </Text>
          </Button>
        </View>

        {/* 8. Recent records */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '32px' }}>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <Text className="block" style={{ fontSize: '16px', fontWeight: '600', color: '#1A1A1A' }}>最近记录</Text>
            <View onClick={handleViewAll} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2px' }}>
              <Text className="block" style={{ fontSize: '12px', color: '#8A8A8A' }}>查看全部</Text>
              <ChevronRight size={14} color="#8A8A8A" />
            </View>
          </View>

          <View style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            {recentExpenses.length > 0 ? recentExpenses.map((item, idx) => (
              <View
                key={item.id}
                style={{
                  display: 'flex', flexDirection: 'row', alignItems: 'center',
                  paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px',
                  borderBottomWidth: idx < recentExpenses.length - 1 ? '1px' : '0',
                  borderBottomColor: 'rgba(240,242,245,0.15)', borderBottomStyle: 'solid',
                }}
              >
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <Text className="block" style={{ fontSize: '18px' }}>{getCategoryIcon(item.category)}</Text>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text className="block" style={{ fontSize: '14px', fontWeight: '500', color: '#1A1A1A' }} numberOfLines={1}>
                      {item.note || item.category}
                    </Text>
                  </View>
                </View>
                <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: '12px' }}>
                  <Text className="block" style={{ fontSize: '14px', fontWeight: '600', color: '#FF3B30' }}>-¥{item.amount.toFixed(2)}</Text>
                  <Text className="block" style={{ fontSize: '12px', color: '#8A8A8A' }}>
                    {item.expense_date ? `${new Date(item.expense_date).getMonth() + 1}月${new Date(item.expense_date).getDate()}日` : ''}
                  </Text>
                </View>
              </View>
            )) : (
              <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px', paddingBottom: '24px' }}>
                <Inbox size={32} color="#E8EAED" />
                <Text className="block" style={{ fontSize: '14px', color: '#8A8A8A', marginTop: '8px' }}>暂无记录</Text>
              </View>
            )}
          </View>
        </View>

        {/* 9. Smart Record + Inbox cards side by side */}
        <View style={{ display: 'flex', flexDirection: 'row', gap: '12px', paddingLeft: '20px', paddingRight: '20px', paddingTop: '20px' }}>
          {/* Smart Record card */}
          <View
            onClick={handleSmartRecord}
            style={{
              flex: 1, backgroundColor: '#FFFFFF', borderRadius: '12px',
              padding: '16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <View style={{
              width: '40px', height: '40px', backgroundColor: '#E8F0FE',
              borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            >
              <Sparkles size={20} color="#2F7BFF" />
            </View>
            <Text className="block" style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A' }}>智能记账</Text>
            <Text className="block" style={{ fontSize: '12px', color: '#8A8A8A', textAlign: 'center' }}>AI一句话记账</Text>
          </View>
          {/* Inbox card */}
          <View
            onClick={handleInboxClick}
            style={{
              flex: 1, backgroundColor: '#FFFFFF', borderRadius: '12px',
              padding: '16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}
          >
            <View style={{
              width: '40px', height: '40px', backgroundColor: '#E8F0FE',
              borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}
            >
              <Inbox size={20} color="#2F7BFF" />
              {pendingRecords.length > 0 && (
                <View style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  width: '16px', height: '16px', backgroundColor: '#FF3B30',
                  borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                >
                  <Text className="block" style={{ fontSize: '10px', fontWeight: '700', color: '#FFFFFF' }}>{pendingRecords.length}</Text>
                </View>
              )}
            </View>
            <Text className="block" style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A' }}>收集箱</Text>
            <Text className="block" style={{ fontSize: '12px', color: '#8A8A8A', textAlign: 'center' }}>
              {pendingRecords.length > 0 ? `${pendingRecords.length}条待确认` : '暂无待确认'}
            </Text>
          </View>
        </View>

        {/* 10. AI tip bar */}
        <View style={{
          marginLeft: '20px', marginRight: '20px', marginTop: '16px', marginBottom: '16px',
          backgroundColor: '#E8F0FE', borderRadius: '12px',
          paddingLeft: '16px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px',
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px',
        }}
        >
          <Lightbulb size={16} color="#2F7BFF" />
          <Text className="block" style={{ fontSize: '12px', color: '#2F7BFF', fontWeight: '500' }}>
            最近餐饮支出偏高，建议控制外卖频次，本周已超预算28%
          </Text>
        </View>

      </ScrollView>
    </View>
  )
}

export default IndexPage
