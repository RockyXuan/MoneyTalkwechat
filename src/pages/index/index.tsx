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

// Category emoji map matching UI template
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
    <View className="h-full flex flex-col" style={{ backgroundColor: '#F8F9FC' }}>
      <ScrollView scrollY className="flex-1" style={{ paddingBottom: '100px' }}>

        {/* 1. Header - white background, title left, ellipsis right */}
        <View style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          height: '56px', paddingLeft: '20px', paddingRight: '20px',
          backgroundColor: '#FFFFFF',
        }}
        >
          <Text className="block" style={{ fontSize: '18px', fontWeight: '700', color: '#1D2129' }}>记一笔</Text>
          <View style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ellipsis size={20} color="#86909C" />
          </View>
        </View>

        {/* 2. Date selector - centered pill on white bg */}
        <View style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: '12px', paddingTop: '8px', paddingBottom: '16px', paddingLeft: '20px', paddingRight: '20px',
          backgroundColor: '#FFFFFF',
        }}
        >
          <View onClick={handleDatePrev} style={{
            width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '999px', backgroundColor: '#F2F3F5',
          }}
          >
            <ChevronLeft size={14} color="#86909C" />
          </View>
          <Text className="block" style={{ fontSize: '15px', color: '#1D2129', fontWeight: '600' }}>
            {formatDateDisplay(selectedDate)}
          </Text>
          <View onClick={handleDateNext} style={{
            width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '999px', backgroundColor: '#F2F3F5',
          }}
          >
            <ChevronRight size={14} color="#86909C" />
          </View>
        </View>

        {/* 3. Amount input area - large ¥ symbol, big font */}
        <View style={{ paddingLeft: '24px', paddingRight: '24px', paddingTop: '20px', paddingBottom: '8px', backgroundColor: '#FFFFFF' }}>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: '2px' }}>
            <Text className="block" style={{ fontSize: '28px', fontWeight: '700', color: '#1D2129', marginBottom: '6px' }}>¥</Text>
            <View style={{ flex: 1, backgroundColor: 'transparent' }}>
              <Input
                type="digit"
                style={{ fontSize: '42px', fontWeight: '700', color: '#1D2129', backgroundColor: 'transparent', width: '100%', lineHeight: '50px' }}
                placeholder="0.00"
                placeholderStyle="color:#C9CDD4;font-size:42px;font-weight:700"
                value={amount}
                onInput={(e) => setAmount(e.detail.value)}
              />
            </View>
          </View>
          {/* Divider line */}
          <View style={{ marginTop: '4px', height: '1px', backgroundColor: '#E5E6EB' }} />
        </View>

        {/* 4. Category chips - pill shape with emoji+text */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '20px', backgroundColor: '#FFFFFF' }}>
          <ScrollView scrollX style={{ width: '100%', whiteSpace: 'nowrap' }}>
            <View style={{ display: 'flex', flexDirection: 'row', gap: '10px', paddingBottom: '12px' }}>
              {DEFAULT_CATEGORIES.map(name => {
                const isActive = selectedCategory === name
                return (
                  <View
                    key={name}
                    onClick={() => setSelectedCategory(name)}
                    style={{
                      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
                      paddingLeft: '16px', paddingRight: '16px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '24px',
                      backgroundColor: isActive ? '#2979FF' : '#FFFFFF',
                      borderWidth: '1px', borderStyle: 'solid',
                      borderColor: isActive ? '#2979FF' : '#E5E6EB',
                      flexShrink: 0,
                    }}
                  >
                    <Text className="block" style={{ fontSize: '15px' }}>{getCategoryIcon(name)}</Text>
                    <Text
                      className="block"
                      style={{
                        fontSize: '14px', fontWeight: isActive ? '600' : '400',
                        color: isActive ? '#FFFFFF' : '#86909C',
                      }}
                    >
                      {name}
                    </Text>
                  </View>
                )
              })}
              {/* Add category button */}
              <View style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '4px',
                paddingLeft: '14px', paddingRight: '14px', paddingTop: '10px', paddingBottom: '10px', borderRadius: '24px',
                borderWidth: '1px', borderStyle: 'dashed',
                borderColor: '#C9CDD4', backgroundColor: '#FFFFFF',
                flexShrink: 0,
              }}
              >
                <Plus size={14} color="#86909C" />
              </View>
            </View>
          </ScrollView>
        </View>

        {/* 5. Remark input - grey rounded box */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '8px', backgroundColor: '#FFFFFF' }}>
          <View style={{
            width: '100%', backgroundColor: '#F2F3F5', borderRadius: '12px',
            paddingLeft: '16px', paddingRight: '16px', paddingTop: '14px', paddingBottom: '14px',
          }}
          >
            <Input
              style={{ width: '100%', fontSize: '14px', backgroundColor: 'transparent', color: '#1D2129' }}
              placeholder="点击添加备注..."
              placeholderStyle="color:#C9CDD4"
              value={remark}
              onInput={(e) => setRemark(e.detail.value)}
            />
          </View>
        </View>

        {/* 6. Date row with calendar icon */}
        <View style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px',
          paddingLeft: '20px', paddingRight: '20px', paddingTop: '16px', paddingBottom: '20px',
          backgroundColor: '#FFFFFF',
        }}
        >
          <Calendar size={16} color="#86909C" />
          <Text className="block" style={{ fontSize: '14px', color: '#86909C' }}>{formatDateFull(selectedDate)}</Text>
        </View>

        {/* 7. Save button - blue gradient rounded button */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '8px', paddingBottom: '24px' }}>
          <Button
            className="w-full"
            style={{
              backgroundColor: '#2979FF', borderRadius: '14px',
              height: '50px', fontWeight: '600', fontSize: '16px',
              boxShadow: '0 4px 12px rgba(41,121,255,0.3)',
            }}
            onClick={handleSave}
            disabled={isSaving}
          >
            <Text className="block" style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: '600' }}>
              {isSaving ? '保存中...' : '保存'}
            </Text>
          </Button>
        </View>

        {/* 8. Recent records section */}
        <View style={{ paddingLeft: '20px', paddingRight: '20px', paddingTop: '8px' }}>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <Text className="block" style={{ fontSize: '17px', fontWeight: '700', color: '#1D2129' }}>最近记录</Text>
            <View onClick={handleViewAll} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2px' }}>
              <Text className="block" style={{ fontSize: '13px', color: '#86909C' }}>查看全部</Text>
              <ChevronRight size={14} color="#86909C" />
            </View>
          </View>

          <View style={{
            backgroundColor: '#FFFFFF', borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(41,121,255,0.06)',
          }}
          >
            {recentExpenses.length > 0 ? recentExpenses.map((item, idx) => (
              <View
                key={item.id}
                style={{
                  display: 'flex', flexDirection: 'row', alignItems: 'center',
                  paddingLeft: '16px', paddingRight: '16px', paddingTop: '14px', paddingBottom: '14px',
                  borderBottomWidth: idx < recentExpenses.length - 1 ? '1px' : '0',
                  borderBottomColor: '#F2F3F5', borderBottomStyle: 'solid',
                }}
              >
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <View style={{
                    width: '36px', height: '36px', backgroundColor: '#F2F3F5',
                    borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  >
                    <Text className="block" style={{ fontSize: '18px' }}>{getCategoryIcon(item.category)}</Text>
                  </View>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text className="block" style={{ fontSize: '15px', fontWeight: '500', color: '#1D2129' }} numberOfLines={1}>
                      {item.note || item.category}
                    </Text>
                  </View>
                </View>
                <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: '12px' }}>
                  <Text className="block" style={{ fontSize: '15px', fontWeight: '600', color: '#F53F3F' }}>-¥{item.amount.toFixed(2)}</Text>
                  <Text className="block" style={{ fontSize: '12px', color: '#C9CDD4' }}>
                    {item.expense_date ? `${new Date(item.expense_date).getMonth() + 1}月${new Date(item.expense_date).getDate()}日` : ''}
                  </Text>
                </View>
              </View>
            )) : (
              <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '28px', paddingBottom: '28px' }}>
                <Inbox size={36} color="#E5E6EB" />
                <Text className="block" style={{ fontSize: '14px', color: '#C9CDD4', marginTop: '10px' }}>暂无记录</Text>
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
              flex: 1, backgroundColor: '#FFFFFF', borderRadius: '16px',
              paddingTop: '20px', paddingBottom: '20px', paddingLeft: '16px', paddingRight: '16px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '10px',
              boxShadow: '0 2px 8px rgba(41,121,255,0.06)',
            }}
          >
            <View style={{
              width: '44px', height: '44px', backgroundColor: '#F0F5FF',
              borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            >
              <Sparkles size={22} color="#2979FF" />
            </View>
            <Text className="block" style={{ fontSize: '15px', fontWeight: '600', color: '#1D2129' }}>智能记账</Text>
            <Text className="block" style={{ fontSize: '12px', color: '#86909C', textAlign: 'center' }}>AI一句话记账</Text>
          </View>
          {/* Inbox card */}
          <View
            onClick={handleInboxClick}
            style={{
              flex: 1, backgroundColor: '#FFFFFF', borderRadius: '16px',
              paddingTop: '20px', paddingBottom: '20px', paddingLeft: '16px', paddingRight: '16px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '10px',
              boxShadow: '0 2px 8px rgba(41,121,255,0.06)',
            }}
          >
            <View style={{
              width: '44px', height: '44px', backgroundColor: '#F0F5FF',
              borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}
            >
              <Inbox size={22} color="#2979FF" />
              {pendingRecords.length > 0 && (
                <View style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  width: '18px', height: '18px', backgroundColor: '#F53F3F',
                  borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                >
                  <Text className="block" style={{ fontSize: '10px', fontWeight: '700', color: '#FFFFFF' }}>{pendingRecords.length}</Text>
                </View>
              )}
            </View>
            <Text className="block" style={{ fontSize: '15px', fontWeight: '600', color: '#1D2129' }}>收集箱</Text>
            <Text className="block" style={{ fontSize: '12px', color: '#86909C', textAlign: 'center' }}>
              {pendingRecords.length > 0 ? `${pendingRecords.length}条待确认` : '暂无待确认'}
            </Text>
          </View>
        </View>

        {/* 10. AI tip bar - gradient blue background */}
        <View style={{
          marginLeft: '20px', marginRight: '20px', marginTop: '16px', marginBottom: '20px',
          backgroundColor: '#F0F5FF', borderRadius: '12px',
          paddingLeft: '16px', paddingRight: '16px', paddingTop: '14px', paddingBottom: '14px',
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px',
        }}
        >
          <Lightbulb size={16} color="#2979FF" />
          <Text className="block" style={{ fontSize: '13px', color: '#2979FF', fontWeight: '500', flex: 1 }}>
            最近餐饮支出偏高，建议控制外卖频次，本周已超预算28%
          </Text>
        </View>

      </ScrollView>
    </View>
  )
}

export default IndexPage
