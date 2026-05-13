import { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Picker, ScrollView } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader, X, CreditCard, Trash2, Calendar, Zap, Hand, Bell } from 'lucide-react-taro'
import { useExpenseStore, ParsedSubscription, SubscriptionRecord } from '@/store/expense-store'

const CYCLE_LABELS: Record<string, string> = {
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年',
  weekly: '每周',
}

const calcCosts = (amount: number, cycle: string) => {
  let yearly = 0
  switch (cycle) {
    case 'yearly': yearly = amount; break
    case 'quarterly': yearly = amount * 4; break
    case 'monthly': yearly = amount * 12; break
    case 'weekly': yearly = amount * 52; break
    default: yearly = amount * 12
  }
  return {
    yearly: Math.round(yearly * 100) / 100,
    monthly: Math.round((yearly / 12) * 100) / 100,
    daily: Math.round((yearly / 365) * 100) / 100,
  }
}

const daysUntil = (dateStr: string) => {
  const target = new Date(dateStr)
  const now = new Date()
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}

const calcTotalCharged = (amount: number, cycle: string, startDate: string) => {
  const start = new Date(startDate)
  const now = new Date()
  if (start > now) return { cycles: 0, total: 0 }
  let cycles = 0
  switch (cycle) {
    case 'yearly': { let d = new Date(start); while (d <= now) { cycles++; d.setFullYear(d.getFullYear() + 1) }; break }
    case 'quarterly': { let d = new Date(start); while (d <= now) { cycles++; d.setMonth(d.getMonth() + 3) }; break }
    case 'weekly': { let d = new Date(start); while (d <= now) { cycles++; d.setDate(d.getDate() + 7) }; break }
    default: { let d = new Date(start); while (d <= now) { cycles++; d.setMonth(d.getMonth() + 1) }; break }
  }
  return { cycles, total: Math.round(cycles * amount * 100) / 100 }
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

  // Edit modal
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
    <View className="min-h-full" style={{ backgroundColor: '#F7F8FA' }}>
      <ScrollView scrollY className="min-h-full">
        <View className="pb-36">
          {/* Gradient Header Card */}
          <View className="mx-4 mt-4 rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #7C3AED, #2563EB)' }}>
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

          {/* Input Area */}
          <View className="mx-4 mt-3">
            <View className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <View className="flex flex-row items-center gap-2 mb-3">
                <Send size={16} color="#7C3AED" />
                <Text className="block text-sm font-semibold text-foreground">添加订阅</Text>
              </View>
              <View className="bg-slate-50 rounded-xl p-3 mb-3">
                <Textarea
                  style={{ width: '100%', minHeight: '60px', backgroundColor: 'transparent', fontSize: '15px', color: '#1E293B' }}
                  placeholder="说说你的订阅，如：每月订阅了腾讯视频25元"
                  placeholderStyle="color:#94A3B8"
                  value={inputText}
                  onInput={(e) => setInputText(e.detail.value)}
                />
              </View>
              <Button
                className="w-full text-white rounded-xl"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}
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
              <View className="bg-white rounded-2xl p-4 border-2 border-purple-200" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <View className="flex flex-row items-center justify-between mb-3">
                  <Text className="block text-sm font-semibold text-purple-600">识别结果（点击可编辑）</Text>
                  <Button className="bg-transparent p-0" onClick={() => { setParsedResults([]); setEditingIdx(null) }}>
                    <X size={16} color="#94A3B8" />
                  </Button>
                </View>
                {parsedResults.length > 1 && (
                  <View className="flex flex-row gap-1 mb-3">
                    {parsedResults.map((_, idx) => (
                      <View key={idx}
                        className={`px-3 py-1 rounded-full ${editingIdx === idx ? 'bg-purple-500' : 'bg-slate-100'}`}
                        onClick={() => setEditingIdx(idx)}
                      >
                        <Text className={`block text-xs ${editingIdx === idx ? 'text-white' : 'text-slate-500'}`}>第{idx + 1}项</Text>
                      </View>
                    ))}
                  </View>
                )}
                {currentParsed && (
                  <View>
                    <View className="flex flex-row items-center gap-3 mb-3">
                      <View className="flex-1">
                        <Text className="block text-xs text-slate-500 mb-1">名称</Text>
                        <View className="bg-slate-50 rounded-xl px-3 py-2">
                          <Input className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0"
                            value={currentParsed.name}
                            onInput={(e) => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], name: e.detail.value, _edited: true }; setParsedResults(updated) }}
                          />
                        </View>
                      </View>
                      <View style={{ width: '100px' }}>
                        <Text className="block text-xs text-slate-500 mb-1">金额</Text>
                        <View className="bg-slate-50 rounded-xl px-3 py-2">
                          <Input className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0" type="digit"
                            value={currentParsed.amount != null ? String(currentParsed.amount) : ''}
                            onInput={(e) => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], amount: Number(e.detail.value) || null, _edited: true }; setParsedResults(updated) }}
                          />
                        </View>
                      </View>
                    </View>
                    <View className="mb-3">
                      <Text className="block text-xs text-slate-500 mb-1">周期</Text>
                      <View className="flex flex-row gap-2">
                        {(['monthly', 'quarterly', 'yearly'] as const).map(c => (
                          <View key={c}
                            className={`px-3 py-2 rounded-xl ${currentParsed.cycle === c ? 'bg-purple-500' : 'bg-slate-50'}`}
                            onClick={() => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], cycle: c, _edited: true }; setParsedResults(updated) }}
                          >
                            <Text className={`block text-xs ${currentParsed.cycle === c ? 'text-white' : 'text-slate-500'}`}>{CYCLE_LABELS[c]}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View className="mb-3">
                      <Text className="block text-xs text-slate-500 mb-1">续费方式</Text>
                      <View className="flex flex-row gap-2">
                        {([
                          { key: 'auto' as const, label: '自动续费', icon: 'zap' },
                          { key: 'manual' as const, label: '手动续费', icon: 'hand' },
                        ]).map(opt => (
                          <View key={opt.key}
                            className={`flex-1 px-3 py-2 rounded-xl flex flex-row items-center justify-center gap-1 ${currentParsed.billing_type === opt.key ? 'bg-purple-500' : 'bg-slate-50'}`}
                            onClick={() => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], billing_type: opt.key, _edited: true }; setParsedResults(updated) }}
                          >
                            {opt.icon === 'zap' ? <Zap size={12} color={currentParsed.billing_type === opt.key ? '#fff' : '#94A3B8'} /> : <Hand size={12} color={currentParsed.billing_type === opt.key ? '#fff' : '#94A3B8'} />}
                            <Text className={`block text-xs ${currentParsed.billing_type === opt.key ? 'text-white' : 'text-slate-500'}`}>{opt.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View className="mb-3">
                      <Text className="block text-xs text-slate-500 mb-1">起始日期</Text>
                      <Picker
                        mode="date" value={currentParsed.start_date || new Date().toISOString().slice(0, 10)}
                        onChange={(e) => { const idx = editingIdx!; const updated = [...parsedResults]; updated[idx] = { ...updated[idx], start_date: e.detail.value, _edited: true }; setParsedResults(updated) }}
                      >
                        <View className="bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-2">
                          <Calendar size={14} color="#7C3AED" />
                          <Text className="text-sm text-purple-600">{currentParsed.start_date || new Date().toISOString().slice(0, 10)}</Text>
                        </View>
                      </Picker>
                    </View>
                    {currentParsed.amount != null && (
                      <View className="bg-purple-50 rounded-xl p-3 mb-3">
                        <View className="flex flex-row items-center justify-between">
                          <Text className="block text-xs text-purple-600">年费预估</Text>
                          <Text className="block text-base font-bold text-purple-600">¥{calcCosts(currentParsed.amount, currentParsed.cycle).yearly.toFixed(2)}/年</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
                <Button className="w-full text-white rounded-xl" style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }} onClick={handleSave} disabled={isSaving}>
                  <Text className="text-white">{isSaving ? '保存中...' : `保存${parsedResults.length}项订阅`}</Text>
                </Button>
              </View>
            </View>
          )}

          {/* Subscription List */}
          {subscriptions.length > 0 && (
            <View className="mx-4 mt-4">
              <View className="flex flex-row items-center justify-between mb-3">
                <Text className="block text-base font-semibold text-foreground">我的订阅</Text>
                {cycleFilter !== 'all' && (
                  <Text className="block text-xs text-slate-400">¥{filteredYearly.toFixed(0)}/年</Text>
                )}
              </View>
              {/* Cycle filter */}
              <View className="flex flex-row bg-white rounded-xl p-1 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {([
                  { key: 'all' as const, label: '全部' },
                  { key: 'monthly' as const, label: '按月' },
                  { key: 'quarterly' as const, label: '按季' },
                  { key: 'yearly' as const, label: '按年' },
                ]).map(opt => (
                  <View key={opt.key}
                    className={`flex-1 py-2 rounded-lg ${cycleFilter === opt.key ? 'bg-white' : ''}`}
                    style={cycleFilter === opt.key ? { boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } : {}}
                    onClick={() => setCycleFilter(opt.key)}
                  >
                    <Text className={`block text-center text-xs font-medium ${cycleFilter === opt.key ? 'text-purple-600' : 'text-slate-400'}`}>
                      {opt.label}
                    </Text>
                  </View>
                ))}
              </View>
              {filteredSubs.map(sub => {
                const costs = calcCosts(Number(sub.amount), sub.cycle)
                const days = daysUntil(sub.next_billing_date)
                const urgencyColor = days <= 3 ? '#EF4444' : days <= 7 ? '#F59E0B' : '#2563EB'
                const charged = calcTotalCharged(Number(sub.amount), sub.cycle, sub.start_date)
                const isAuto = sub.billing_type !== 'manual'
                return (
                  <View key={sub.id} className="bg-white rounded-2xl p-4 mb-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }} onClick={() => openEditModal(sub)}>
                    <View className="flex flex-row items-center gap-2 mb-2">
                      {isAuto ? <Zap size={14} color="#7C3AED" /> : <Hand size={14} color="#F59E0B" />}
                      <View className="flex flex-row items-center flex-1 min-w-0">
                        <Text className="block text-base font-semibold text-foreground truncate">{sub.name}</Text>
                        <Text className="block text-lg font-bold text-amber-500 flex-shrink-0 ml-2">¥{sub.amount}</Text>
                      </View>
                    </View>
                    <View className="flex flex-row items-center gap-2 mb-2">
                      <View className="bg-purple-50 rounded-full px-2 py-1">
                        <Text className="text-xs text-purple-600">{CYCLE_LABELS[sub.cycle] || sub.cycle}</Text>
                      </View>
                      <View className={`${isAuto ? 'bg-blue-50' : 'bg-amber-50'} rounded-full px-2 py-1`}>
                        <Text className={`text-xs ${isAuto ? 'text-blue-600' : 'text-amber-600'}`}>{isAuto ? '自动' : '手动'}</Text>
                      </View>
                    </View>
                    <View className="flex flex-row items-center gap-2 mb-2">
                      <Bell size={12} color={urgencyColor} />
                      <Text className="block text-xs text-slate-500">下次扣费: {sub.next_billing_date}</Text>
                      <Text className="block text-xs font-medium" style={{ color: urgencyColor }}>
                        {days <= 0 ? '今天' : `${days}天后`}
                      </Text>
                    </View>
                    {charged.cycles > 0 && (
                      <View className="bg-amber-50 rounded-xl px-3 py-2 mb-2 flex flex-row items-center justify-between">
                        <Text className="block text-xs text-amber-600">累计已扣 {charged.cycles} 次</Text>
                        <Text className="block text-sm font-bold text-amber-600">¥{charged.total.toFixed(2)}</Text>
                      </View>
                    )}
                    <View className="flex flex-row items-center justify-between">
                      <Text className="block text-xs text-slate-400">≈ ¥{costs.yearly.toFixed(2)}/年 · ¥{costs.monthly.toFixed(2)}/月</Text>
                      <Button className="bg-transparent p-0" onClick={(e) => { e.stopPropagation(); handleDelete(sub.id) }}>
                        <Trash2 size={16} color="#EF4444" />
                      </Button>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* Empty State */}
          {subscriptions.length === 0 && parsedResults.length === 0 && (
            <View className="flex flex-col items-center justify-center mt-16">
              <View className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center">
                <CreditCard size={28} color="#7C3AED" />
              </View>
              <Text className="block text-slate-400 mt-4 text-sm">还没有订阅记录</Text>
              <Text className="block text-slate-300 text-xs mt-1">说出你的订阅服务，如「每月订阅了腾讯视频25元」</Text>
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
                  <Text className="block text-lg font-semibold text-foreground">编辑订阅</Text>
                  <Button className="bg-transparent p-0" onClick={closeEditModal}>
                    <X size={20} color="#94A3B8" />
                  </Button>
                </View>
                <View className="mb-3">
                  <Text className="block text-sm text-slate-500 mb-1">名称</Text>
                  <View className="bg-slate-50 rounded-xl px-3 py-2">
                    <Input className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0" value={editName} onInput={(e) => setEditName(e.detail.value)} />
                  </View>
                </View>
                <View className="flex flex-row items-center gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="block text-sm text-slate-500 mb-1">金额</Text>
                    <View className="bg-slate-50 rounded-xl px-3 py-2">
                      <Input className="border-0 bg-transparent text-sm ring-0 focus-within:ring-0" type="digit" value={editAmount} onInput={(e) => setEditAmount(e.detail.value)} />
                    </View>
                  </View>
                  <View style={{ width: '120px' }}>
                    <Text className="block text-sm text-slate-500 mb-1">周期</Text>
                    <Picker
                      mode="selector" range={['每月', '每季度', '每年']} value={['monthly', 'quarterly', 'yearly'].indexOf(editCycle)}
                      onChange={(e) => setEditCycle(['monthly', 'quarterly', 'yearly'][Number(e.detail.value)])}
                    >
                      <View className="bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-2">
                        <Text className="text-sm text-purple-600">{CYCLE_LABELS[editCycle]}</Text>
                      </View>
                    </Picker>
                  </View>
                </View>
                <View className="mb-3">
                  <Text className="block text-sm text-slate-500 mb-1">续费方式</Text>
                  <View className="flex flex-row gap-2">
                    {([
                      { key: 'auto' as const, label: '自动续费', icon: 'zap' },
                      { key: 'manual' as const, label: '手动续费', icon: 'hand' },
                    ]).map(opt => (
                      <View key={opt.key}
                        className={`flex-1 px-3 py-2 rounded-xl flex flex-row items-center justify-center gap-1 ${editBillingType === opt.key ? 'bg-purple-500' : 'bg-slate-50'}`}
                        onClick={() => setEditBillingType(opt.key)}
                      >
                        {opt.icon === 'zap' ? <Zap size={12} color={editBillingType === opt.key ? '#fff' : '#94A3B8'} /> : <Hand size={12} color={editBillingType === opt.key ? '#fff' : '#94A3B8'} />}
                        <Text className={`block text-xs ${editBillingType === opt.key ? 'text-white' : 'text-slate-500'}`}>{opt.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View className="mb-3">
                  <Text className="block text-sm text-slate-500 mb-1">起始日期</Text>
                  <Picker mode="date" value={editStartDate} onChange={(e) => setEditStartDate(e.detail.value)}>
                    <View className="bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-2">
                      <Calendar size={14} color="#7C3AED" />
                      <Text className="text-sm text-purple-600">{editStartDate}</Text>
                    </View>
                  </Picker>
                </View>
                <View className="mb-2">
                  <Text className="block text-sm text-slate-500 mb-1">下次扣费日期</Text>
                  <Picker mode="date" value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                    <View className="bg-slate-50 rounded-xl px-3 py-2 flex flex-row items-center gap-2">
                      <Calendar size={14} color="#7C3AED" />
                      <Text className="text-sm text-purple-600">{editDate}</Text>
                    </View>
                  </Picker>
                </View>
                {editAmount && (
                  <View className="bg-purple-50 rounded-xl p-3 mb-2">
                    <Text className="block text-xs text-purple-600">年费 ≈ ¥{calcCosts(Number(editAmount) || 0, editCycle).yearly.toFixed(2)}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
            <View className="p-4 pt-2" style={{ borderTop: '1px solid #E2E8F0' }}>
              <Button className="w-full text-white rounded-xl" style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }} onClick={handleSaveEdit} disabled={isUpdating}>
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
