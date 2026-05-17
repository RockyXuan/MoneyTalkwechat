import { useState } from 'react'
import { View, Text, ScrollView, Picker } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import Taro, { useDidShow } from '@tarojs/taro'
import { CreditCard, Send, Loader, X, Zap, Hand, Calendar, Bell, Trash2, Sparkles } from 'lucide-react-taro'
import { Button } from '@/components/ui/button'
import { useExpenseStore, SubscriptionRecord as StoreSubscriptionRecord, ParsedSubscription as StoreParsedSubscription } from '@/store/expense-store'

type SubscriptionRecord = StoreSubscriptionRecord
type ParsedSubscription = StoreParsedSubscription

const CYCLE_LABELS: Record<string, string> = { monthly: '每月', quarterly: '每季', yearly: '每年' }

function daysUntil(dateStr: string) {
  const d = new Date(dateStr); const now = new Date(); now.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - now.getTime()) / 86400000)
}

function calcCosts(amount: number, cycle: string) {
  const yearly = cycle === 'monthly' ? amount * 12 : cycle === 'quarterly' ? amount * 4 : amount
  return { yearly, monthly: yearly / 12 }
}

function calcTotalCharged(amount: number, cycle: string, startDate: string) {
  const start = new Date(startDate); const now = new Date()
  let cycles = 0
  if (cycle === 'monthly') cycles = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
  else if (cycle === 'quarterly') cycles = Math.floor(((now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()) / 3)
  else cycles = now.getFullYear() - start.getFullYear()
  return { cycles: Math.max(0, cycles), total: Math.round(cycles * amount * 100) / 100 }
}

const SubscriptionsPage = () => {
  const [inputText, setInputText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parsedResults, setParsedResults] = useState<ParsedSubscription[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([])
  const [totalYearly, setTotalYearly] = useState(0)
  const [totalMonthly, setTotalMonthly] = useState(0)
  const [cycleFilter, setCycleFilter] = useState<'all' | 'monthly' | 'quarterly' | 'yearly'>('all')

  const [editingSub, setEditingSub] = useState<SubscriptionRecord | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editCycle, setEditCycle] = useState('monthly')
  const [editDate, setEditDate] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editBillingType, setEditBillingType] = useState<'auto' | 'manual'>('auto')
  const [isUpdating, setIsUpdating] = useState(false)

  const { fetchSubscriptions, createSubscription, updateSubscription, deleteSubscription, parseSubscription } = useExpenseStore()

  const loadData = async () => {
    const subs = await fetchSubscriptions()
    setSubscriptions(subs)
    let yearTotal = 0
    subs.forEach(s => { yearTotal += calcCosts(Number(s.amount), s.cycle).yearly })
    setTotalYearly(Math.round(yearTotal * 100) / 100)
    setTotalMonthly(Math.round((yearTotal / 12) * 100) / 100)
  }

  useDidShow(() => { loadData() })

  const handleParse = async () => {
    if (!inputText.trim()) { Taro.showToast({ title: '请输入订阅内容', icon: 'none' }); return }
    setIsParsing(true)
    try {
      const results = await parseSubscription(inputText)
      if (results.length > 0) { setParsedResults(results); setEditingIdx(0); setInputText('') }
      else { Taro.showToast({ title: '未能识别订阅信息', icon: 'none' }) }
    } catch (err) {
      console.error('parse error:', err)
      Taro.showToast({ title: '解析失败', icon: 'none' })
    } finally { setIsParsing(false) }
  }

  const handleSave = async () => {
    if (parsedResults.length === 0) return
    setIsSaving(true)
    try {
      for (const item of parsedResults) {
        if (item.amount == null) continue
        await createSubscription({
          name: item.name, amount: item.amount, cycle: item.cycle,
          category: item.category || '订阅', description: item.description || '',
          start_date: item.start_date || new Date().toISOString().slice(0, 10),
          billing_type: item.billing_type || 'auto',
        })
      }
      Taro.showToast({ title: '已添加订阅', icon: 'success' })
      setParsedResults([]); setEditingIdx(null); loadData()
    } catch (err) {
      console.error('save error:', err); Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally { setIsSaving(false) }
  }

  const handleDelete = async (id: string) => {
    const res = await Taro.showModal({ title: '确认取消', content: '确定要取消这个订阅吗？' })
    if (!res.confirm) return
    try { await deleteSubscription(id); Taro.showToast({ title: '已取消订阅', icon: 'success' }); setSubscriptions(prev => prev.filter(s => s.id !== id)); loadData() }
    catch (err) { console.error('delete error:', err) }
  }

  const openEditModal = (sub: SubscriptionRecord) => {
    setEditingSub(sub); setEditName(sub.name); setEditAmount(String(sub.amount))
    setEditCycle(sub.cycle); setEditDate(sub.next_billing_date); setEditStartDate(sub.start_date)
    setEditBillingType(sub.billing_type === 'manual' ? 'manual' : 'auto')
  }
  const closeEditModal = () => setEditingSub(null)

  const handleSaveEdit = async () => {
    if (!editingSub) return
    setIsUpdating(true)
    try {
      await updateSubscription(editingSub.id, {
        name: editName, amount: Number(editAmount), cycle: editCycle,
        next_billing_date: editDate, start_date: editStartDate, billing_type: editBillingType,
      })
      Taro.showToast({ title: '已更新', icon: 'success' }); closeEditModal(); loadData()
    } catch (err) {
      console.error('update error:', err); Taro.showToast({ title: '更新失败', icon: 'none' })
    } finally { setIsUpdating(false) }
  }

  const currentParsed = editingIdx != null ? parsedResults[editingIdx] : null
  const filteredSubs = cycleFilter === 'all' ? subscriptions : subscriptions.filter(s => s.cycle === cycleFilter)
  const filteredYearly = filteredSubs.reduce((sum, s) => sum + calcCosts(Number(s.amount), s.cycle).yearly, 0)

  return (
    <View className="min-h-full" style={{ backgroundColor: '#F8F9FC' }}>
      <ScrollView scrollY className="min-h-full">
        <View className="pb-36">
          {/* Gradient Header Card */}
          <View className="mx-4 mt-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #2979FF, #5B8FFF)' }}>
            <View className="flex flex-row items-center gap-2 mb-3">
              <CreditCard size={20} color="#fff" />
              <Text className="block text-lg font-semibold text-white">订阅管理</Text>
            </View>
            <View className="flex flex-row gap-4">
              <View className="flex-1 bg-white bg-opacity-15 rounded-xl p-3">
                <Text className="block text-white text-xs opacity-75">月均支出</Text>
                <Text className="block text-white text-xl font-bold mt-1">¥{totalMonthly.toFixed(0)}</Text>
              </View>
              <View className="flex-1 bg-white bg-opacity-15 rounded-xl p-3">
                <Text className="block text-white text-xs opacity-75">年均支出</Text>
                <Text className="block text-white text-xl font-bold mt-1">¥{totalYearly.toFixed(0)}</Text>
              </View>
            </View>
            <Text className="block text-white text-xs opacity-60 mt-2">共 {subscriptions.length} 项活跃订阅</Text>
          </View>

          {/* Filter Chips */}
          {subscriptions.length > 0 && (
            <View className="flex flex-row gap-2 mx-4 mt-4">
              {([
                { key: 'all' as const, label: '全部' },
                { key: 'monthly' as const, label: '月付' },
                { key: 'quarterly' as const, label: '季付' },
                { key: 'yearly' as const, label: '年付' },
              ]).map(opt => (
                <View key={opt.key}
                  className="px-4 py-2 rounded-full"
                  style={{
                    backgroundColor: cycleFilter === opt.key ? '#2979FF' : '#fff',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: cycleFilter === opt.key ? '#2979FF' : '#E5E6EB',
                  }}
                  onClick={() => setCycleFilter(opt.key)}
                >
                  <Text className="block text-xs font-medium" style={{ color: cycleFilter === opt.key ? '#fff' : '#86909C' }}>
                    {opt.label}
                  </Text>
                </View>
              ))}
              {cycleFilter !== 'all' && (
                <View className="flex items-center justify-center ml-auto">
                  <Text className="block text-xs text-[#86909C]">¥{filteredYearly.toFixed(0)}/年</Text>
                </View>
              )}
            </View>
          )}

          {/* Subscription List */}
          {filteredSubs.length > 0 && (
            <View className="mx-4 mt-3">
              {filteredSubs.map(sub => {
                const costs = calcCosts(Number(sub.amount), sub.cycle)
                const days = daysUntil(sub.next_billing_date)
                const urgencyColor = days <= 3 ? '#F53F3F' : days <= 7 ? '#FF7D00' : '#2979FF'
                const charged = calcTotalCharged(Number(sub.amount), sub.cycle, sub.start_date)
                const isAuto = sub.billing_type !== 'manual'
                return (
                  <View key={sub.id} className="bg-white rounded-2xl p-4 mb-3" onClick={() => openEditModal(sub)}>
                    <View className="flex flex-row items-center justify-between mb-2">
                      <View className="flex flex-row items-center gap-2">
                        {isAuto ? <Zap size={14} color="#2979FF" /> : <Hand size={14} color="#FF7D00" />}
                        <Text className="block text-base font-semibold text-[#1D2129]">{sub.name}</Text>
                      </View>
                      <Text className="block text-lg font-bold text-[#2979FF]">¥{sub.amount}</Text>
                    </View>
                    <View className="flex flex-row items-center gap-2 mb-2">
                      <View className="rounded-full px-3 py-1" style={{ backgroundColor: '#F0F5FF' }}>
                        <Text className="text-xs text-[#2979FF]">{CYCLE_LABELS[sub.cycle] || sub.cycle}</Text>
                      </View>
                      <View className="rounded-full px-3 py-1" style={{ backgroundColor: isAuto ? '#F0F5FF' : '#FFF7E8' }}>
                        <Text className="text-xs" style={{ color: isAuto ? '#2979FF' : '#FF7D00' }}>{isAuto ? '自动续费' : '手动续费'}</Text>
                      </View>
                    </View>
                    <View className="flex flex-row items-center gap-2 mb-2">
                      <Bell size={12} color={urgencyColor} />
                      <Text className="block text-xs text-[#86909C]">下次扣费: {sub.next_billing_date}</Text>
                      <Text className="block text-xs font-medium" style={{ color: urgencyColor }}>
                        {days <= 0 ? '今天' : `${days}天后`}
                      </Text>
                    </View>
                    {charged.cycles > 0 && (
                      <View className="rounded-xl px-3 py-2 mb-2 flex flex-row items-center justify-between" style={{ backgroundColor: '#FFF7E8' }}>
                        <Text className="block text-xs text-[#FF7D00]">累计已扣 {charged.cycles} 次</Text>
                        <Text className="block text-sm font-bold text-[#FF7D00]">¥{charged.total.toFixed(2)}</Text>
                      </View>
                    )}
                    <View className="flex flex-row items-center justify-between">
                      <Text className="block text-xs text-[#C9CDD4]">≈ ¥{costs.yearly.toFixed(2)}/年 · ¥{costs.monthly.toFixed(2)}/月</Text>
                      <View onClick={(e) => { e.stopPropagation(); handleDelete(sub.id) }}>
                        <Trash2 size={16} color="#F53F3F" />
                      </View>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* AI Subscription Recognition */}
          <View className="mx-4 mt-4">
            <View className="bg-white rounded-2xl p-4">
              <View className="flex flex-row items-center gap-2 mb-3">
                <Sparkles size={16} color="#2979FF" />
                <Text className="block text-sm font-semibold text-[#1D2129]">订阅识别</Text>
              </View>
              <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: '#F8F9FC' }}>
                <Textarea
                  style={{ width: '100%', minHeight: '60px', backgroundColor: 'transparent', fontSize: '15px', color: '#1D2129' }}
                  placeholder="说说你的订阅，如：每月订阅了腾讯视频25元"
                  placeholderStyle="color:#C9CDD4"
                  value={inputText}
                  onInput={(e) => setInputText(e.detail.value)}
                />
              </View>
              <Button
                className="w-full text-white rounded-xl"
                style={{ background: 'linear-gradient(135deg, #2979FF, #5B8FFF)' }}
                onClick={handleParse}
                disabled={isParsing}
              >
                {isParsing ? <Loader size={16} color="#fff" className="animate-spin" /> : <Send size={16} color="#fff" />}
                <Text className="text-white ml-2">{isParsing ? '识别中...' : '识别订阅'}</Text>
              </Button>
            </View>
          </View>

          {/* Parsed Results */}
          {parsedResults.length > 0 && (
            <View className="mx-4 mt-3">
              <View className="bg-white rounded-2xl p-4" style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: '#2979FF' }}>
                <View className="flex flex-row items-center justify-between mb-3">
                  <Text className="block text-sm font-semibold text-[#2979FF]">识别结果（点击可编辑）</Text>
                  <View onClick={() => { setParsedResults([]); setEditingIdx(null) }}>
                    <X size={16} color="#86909C" />
                  </View>
                </View>
                {parsedResults.length > 1 && (
                  <View className="flex flex-row gap-1 mb-3">
                    {parsedResults.map((_, idx) => (
                      <View key={idx}
                        className="px-3 py-1 rounded-full"
                        style={{ backgroundColor: editingIdx === idx ? '#2979FF' : '#F8F9FC' }}
                        onClick={() => setEditingIdx(idx)}
                      >
                        <Text className="block text-xs" style={{ color: editingIdx === idx ? '#fff' : '#86909C' }}>第{idx + 1}项</Text>
                      </View>
                    ))}
                  </View>
                )}
                {currentParsed && (
                  <View>
                    <View className="flex flex-row items-center gap-3 mb-3">
                      <View className="flex-1">
                        <Text className="block text-xs text-[#86909C] mb-1">名称</Text>
                        <View className="rounded-xl px-3 py-2" style={{ backgroundColor: '#F8F9FC' }}>
                          <Input className="bg-transparent text-sm"
                            value={currentParsed.name}
                            onInput={(e) => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], name: e.detail.value, _edited: true }; setParsedResults(updated) }}
                          />
                        </View>
                      </View>
                      <View style={{ width: '100px' }}>
                        <Text className="block text-xs text-[#86909C] mb-1">金额</Text>
                        <View className="rounded-xl px-3 py-2" style={{ backgroundColor: '#F8F9FC' }}>
                          <Input className="bg-transparent text-sm" type="digit"
                            value={currentParsed.amount != null ? String(currentParsed.amount) : ''}
                            onInput={(e) => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], amount: Number(e.detail.value) || null, _edited: true }; setParsedResults(updated) }}
                          />
                        </View>
                      </View>
                    </View>
                    <View className="mb-3">
                      <Text className="block text-xs text-[#86909C] mb-1">周期</Text>
                      <View className="flex flex-row gap-2">
                        {(['monthly', 'quarterly', 'yearly'] as const).map(c => (
                          <View key={c}
                            className="px-3 py-2 rounded-xl"
                            style={{ backgroundColor: currentParsed.cycle === c ? '#2979FF' : '#F8F9FC' }}
                            onClick={() => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], cycle: c, _edited: true }; setParsedResults(updated) }}
                          >
                            <Text className="block text-xs" style={{ color: currentParsed.cycle === c ? '#fff' : '#86909C' }}>{CYCLE_LABELS[c]}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View className="mb-3">
                      <Text className="block text-xs text-[#86909C] mb-1">续费方式</Text>
                      <View className="flex flex-row gap-2">
                        {([
                          { key: 'auto' as const, label: '自动续费', icon: 'zap' },
                          { key: 'manual' as const, label: '手动续费', icon: 'hand' },
                        ]).map(opt => (
                          <View key={opt.key}
                            className="flex-1 px-3 py-2 rounded-xl flex flex-row items-center justify-center gap-1"
                            style={{ backgroundColor: currentParsed.billing_type === opt.key ? '#2979FF' : '#F8F9FC' }}
                            onClick={() => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], billing_type: opt.key, _edited: true }; setParsedResults(updated) }}
                          >
                            {opt.icon === 'zap' ? <Zap size={12} color={currentParsed.billing_type === opt.key ? '#fff' : '#86909C'} /> : <Hand size={12} color={currentParsed.billing_type === opt.key ? '#fff' : '#86909C'} />}
                            <Text className="block text-xs" style={{ color: currentParsed.billing_type === opt.key ? '#fff' : '#86909C' }}>{opt.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View className="mb-3">
                      <Text className="block text-xs text-[#86909C] mb-1">起始日期</Text>
                      <Picker
                        mode="date" value={currentParsed.start_date || new Date().toISOString().slice(0, 10)}
                        onChange={(e) => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], start_date: e.detail.value, _edited: true }; setParsedResults(updated) }}
                      >
                        <View className="rounded-xl px-3 py-2 flex flex-row items-center gap-2" style={{ backgroundColor: '#F8F9FC' }}>
                          <Calendar size={14} color="#2979FF" />
                          <Text className="text-sm text-[#2979FF]">{currentParsed.start_date || new Date().toISOString().slice(0, 10)}</Text>
                        </View>
                      </Picker>
                    </View>
                    {currentParsed.amount != null && (
                      <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: '#F0F5FF' }}>
                        <View className="flex flex-row items-center justify-between">
                          <Text className="block text-xs text-[#2979FF]">年费预估</Text>
                          <Text className="block text-base font-bold text-[#2979FF]">¥{calcCosts(currentParsed.amount, currentParsed.cycle).yearly.toFixed(2)}/年</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
                <Button className="w-full text-white rounded-xl" style={{ background: 'linear-gradient(135deg, #2979FF, #5B8FFF)' }} onClick={handleSave} disabled={isSaving}>
                  <Text className="text-white">{isSaving ? '保存中...' : `保存${parsedResults.length}项订阅`}</Text>
                </Button>
              </View>
            </View>
          )}

          {/* Empty State */}
          {subscriptions.length === 0 && parsedResults.length === 0 && (
            <View className="flex flex-col items-center justify-center mt-16">
              <View className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F0F5FF' }}>
                <CreditCard size={28} color="#2979FF" />
              </View>
              <Text className="block text-[#86909C] mt-4 text-sm">还没有订阅记录</Text>
              <Text className="block text-[#C9CDD4] text-xs mt-1">说出你的订阅服务，如「每月订阅了腾讯视频25元」</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Edit Subscription Modal */}
      {editingSub && (
        <View className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="w-full bg-white rounded-t-2xl" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <ScrollView scrollY className="flex-1 w-full">
              <View className="p-5 pb-2">
                <View className="flex flex-row items-center justify-between mb-4">
                  <Text className="block text-lg font-semibold text-[#1D2129]">编辑订阅</Text>
                  <View onClick={closeEditModal}>
                    <X size={20} color="#86909C" />
                  </View>
                </View>
                <View className="mb-3">
                  <Text className="block text-sm text-[#86909C] mb-1">名称</Text>
                  <View className="rounded-xl px-3 py-2" style={{ backgroundColor: '#F8F9FC' }}>
                    <Input className="bg-transparent text-sm" value={editName} onInput={(e) => setEditName(e.detail.value)} />
                  </View>
                </View>
                <View className="flex flex-row items-center gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-[#86909C] mb-1">金额</Text>
                    <View className="rounded-xl px-3 py-2" style={{ backgroundColor: '#F8F9FC' }}>
                      <Input className="bg-transparent text-sm" type="digit" value={editAmount} onInput={(e) => setEditAmount(e.detail.value)} />
                    </View>
                  </View>
                  <View style={{ width: '120px' }}>
                    <Text className="block text-sm text-[#86909C] mb-1">周期</Text>
                    <Picker
                      mode="selector" range={['每月', '每季度', '每年']} value={['monthly', 'quarterly', 'yearly'].indexOf(editCycle)}
                      onChange={(e) => setEditCycle(['monthly', 'quarterly', 'yearly'][Number(e.detail.value)])}
                    >
                      <View className="rounded-xl px-3 py-2 flex flex-row items-center gap-2" style={{ backgroundColor: '#F8F9FC' }}>
                        <Text className="text-sm text-[#2979FF]">{CYCLE_LABELS[editCycle]}</Text>
                      </View>
                    </Picker>
                  </View>
                </View>
                <View className="mb-3">
                  <Text className="block text-sm text-[#86909C] mb-1">续费方式</Text>
                  <View className="flex flex-row gap-2">
                    {([
                      { key: 'auto' as const, label: '自动续费', icon: 'zap' },
                      { key: 'manual' as const, label: '手动续费', icon: 'hand' },
                    ]).map(opt => (
                      <View key={opt.key}
                        className="flex-1 px-3 py-2 rounded-xl flex flex-row items-center justify-center gap-1"
                        style={{ backgroundColor: editBillingType === opt.key ? '#2979FF' : '#F8F9FC' }}
                        onClick={() => setEditBillingType(opt.key)}
                      >
                        {opt.icon === 'zap' ? <Zap size={12} color={editBillingType === opt.key ? '#fff' : '#86909C'} /> : <Hand size={12} color={editBillingType === opt.key ? '#fff' : '#86909C'} />}
                        <Text className="block text-xs" style={{ color: editBillingType === opt.key ? '#fff' : '#86909C' }}>{opt.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View className="mb-3">
                  <Text className="block text-sm text-[#86909C] mb-1">起始日期</Text>
                  <Picker mode="date" value={editStartDate} onChange={(e) => setEditStartDate(e.detail.value)}>
                    <View className="rounded-xl px-3 py-2 flex flex-row items-center gap-2" style={{ backgroundColor: '#F8F9FC' }}>
                      <Calendar size={14} color="#2979FF" />
                      <Text className="text-sm text-[#2979FF]">{editStartDate}</Text>
                    </View>
                  </Picker>
                </View>
                <View className="mb-2">
                  <Text className="block text-sm text-[#86909C] mb-1">下次扣费日期</Text>
                  <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                    <View className="rounded-xl px-3 py-2 flex flex-row items-center gap-2" style={{ backgroundColor: '#F8F9FC' }}>
                      <Calendar size={14} color="#2979FF" />
                      <Text className="text-sm text-[#2979FF]">{editDate}</Text>
                    </View>
                  </Picker>
                </View>
                {editAmount && (
                  <View className="rounded-xl p-3 mb-2" style={{ backgroundColor: '#F0F5FF' }}>
                    <Text className="block text-xs text-[#2979FF]">年费 ≈ ¥{calcCosts(Number(editAmount) || 0, editCycle).yearly.toFixed(2)}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
            <View className="p-4 pt-2" style={{ borderTop: '1px solid #E5E6EB' }}>
              <Button className="w-full text-white rounded-xl" style={{ background: 'linear-gradient(135deg, #2979FF, #5B8FFF)' }} onClick={handleSaveEdit} disabled={isUpdating}>
                {isUpdating ? '保存中...' : '保存修改'}
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

export default SubscriptionsPage
