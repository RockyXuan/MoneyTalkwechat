import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { ScrollView, Text, View } from '@tarojs/components'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Lightbulb,
  Ellipsis,
  Mic,
  Pause,
  Play,
  Send,
  Sparkles,
  X,
} from 'lucide-react-taro'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AppCard,
  BottomSheet,
  CategoryChip,
  EmptyState,
  MoneyHero,
  PageHeader,
  PageShell,
  Pill,
  RoundIconButton,
  SegmentControl,
  SectionTitle,
  BLUE,
  PRIMARY_GRADIENT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '@/components/app/finance-ui'
import { ParsedExpense, PendingRecord, useExpenseStore } from '@/store/expense-store'

const CATEGORY_ICONS: Record<string, string> = {
  餐饮: '🍔',
  交通: '🚗',
  购物: '🛒',
  住房: '🏠',
  娱乐: '🎮',
  医疗: '💊',
  教育: '📚',
  服饰: '👕',
  订阅: '💳',
  通讯: '📱',
  旅行: '✈️',
  其他: '✨',
}

const QUICK_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '订阅', '其他']
const EXAMPLES = ['中午和同事吃饭 48 元', '打车去机场 86.5 元', '每月 ChatGPT 订阅 20 美元', '咖啡 32，分类餐饮']
const DEFAULT_USER_ID = 'default_user'
type EntryMode = 'day' | 'month'

const todayString = () => new Date().toISOString().slice(0, 10)

const formatDateLabel = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const formatMonthLabel = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

const shiftDate = (dateStr: string, mode: EntryMode, step: number) => {
  const date = new Date(dateStr)
  if (mode === 'day') date.setDate(date.getDate() + step)
  else date.setMonth(date.getMonth() + step)
  return date.toISOString().slice(0, 10)
}

const normalizeExpense = (data: Record<string, any>, fallbackDate: string): ParsedExpense | null => {
  const amount = Number(data.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return {
    amount,
    category: data.category || '其他',
    tag: data.tag || '',
    note: data.note || data.name || data.raw_text || data.category || '未命名',
    expense_date: data.expense_date || fallbackDate,
    confidence: Number(data.confidence) || 0.9,
  }
}

const amountText = (amount: number | null) => (amount == null ? '待补充' : `¥${Number(amount).toFixed(2)}`)

const getPendingMediaUrl = (recordId: string) => (
  `${PROJECT_DOMAIN}/api/wechat/pending-records/${recordId}/media?user_id=${DEFAULT_USER_ID}`
)

const transcriptionLabel = (source?: PendingRecord['transcription_source']) => {
  if (source === 'wechat_recognition') return '微信转写'
  if (source === 'asr') return 'AI 转写'
  if (source === 'unavailable') return '待补充'
  return '原文'
}

const IndexPage = () => {
  const [entryMode, setEntryMode] = useState<EntryMode>('day')
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [inputText, setInputText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('餐饮')
  const [parsedResults, setParsedResults] = useState<ParsedExpense[]>([])
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isInboxOpen, setIsInboxOpen] = useState(false)
  const [playingRecordId, setPlayingRecordId] = useState<string | null>(null)
  const audioRef = useRef<ReturnType<typeof Taro.createInnerAudioContext> | null>(null)

  const {
    addExpenses,
    confirmPendingRecord,
    createSubscription,
    fetchExpenses,
    fetchPendingRecords,
    parseText,
    rejectPendingRecord,
  } = useExpenseStore()

  const recentExpenses = useExpenseStore(state => state.expenses)

  const loadData = async () => {
    const [pending] = await Promise.all([
      fetchPendingRecords(),
      fetchExpenses(20),
    ])
    setPendingRecords(pending)
  }

  useDidShow(() => {
    loadData()
  })

  useEffect(() => () => {
    audioRef.current?.destroy()
    audioRef.current = null
  }, [])

  const stopPendingAudio = () => {
    audioRef.current?.stop()
    audioRef.current?.destroy()
    audioRef.current = null
    setPlayingRecordId(null)
  }

  const playPendingAudio = (record: PendingRecord) => {
    if (!record.media_object_key) {
      Taro.showToast({ title: '这条没有可回听语音', icon: 'none' })
      return
    }
    if (playingRecordId === record.id) {
      stopPendingAudio()
      return
    }

    stopPendingAudio()
    const audio = Taro.createInnerAudioContext()
    audioRef.current = audio
    audio.src = getPendingMediaUrl(record.id)
    audio.onEnded(() => setPlayingRecordId(null))
    audio.onStop(() => setPlayingRecordId(null))
    audio.onError(error => {
      console.error('playPendingAudio error:', error)
      setPlayingRecordId(null)
      Taro.showToast({ title: '语音播放失败', icon: 'none' })
    })
    setPlayingRecordId(record.id)
    audio.play()
  }

  const parseInput = async () => {
    if (!inputText.trim()) {
      Taro.showToast({ title: '先写一句消费内容', icon: 'none' })
      return
    }
    setIsParsing(true)
    try {
      const results = await parseText(inputText.trim(), selectedDate)
      if (results.length === 0) {
        Taro.showToast({ title: '没有识别到金额', icon: 'none' })
        return
      }
      const enriched = results.map(item => ({
        ...item,
        category: item.category || selectedCategory,
        expense_date: item.expense_date || selectedDate,
      }))
      setParsedResults(enriched)
    } catch (error) {
      console.error('parseInput error:', error)
      Taro.showToast({ title: '解析失败', icon: 'none' })
    } finally {
      setIsParsing(false)
    }
  }

  const saveParsedResults = async () => {
    const validItems = parsedResults.filter(item => item.amount != null && item.amount > 0)
    if (validItems.length === 0) {
      Taro.showToast({ title: '请补充金额后保存', icon: 'none' })
      return
    }
    setIsSaving(true)
    try {
      await addExpenses(validItems, inputText.trim())
      Taro.showToast({ title: '已记账', icon: 'success' })
      setInputText('')
      setParsedResults([])
      loadData()
    } catch (error) {
      console.error('saveParsedResults error:', error)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setIsSaving(false)
    }
  }

  const confirmInboxRecord = async (record: PendingRecord) => {
    try {
      const data = record.parsed_data || {}
      if (record.record_type === 'subscription') {
        const amount = Number(data.amount)
        if (!Number.isFinite(amount) || amount <= 0) {
          Taro.showToast({ title: '订阅金额缺失', icon: 'none' })
          return
        }
        await createSubscription({
          name: data.name || data.note || '未命名订阅',
          amount,
          cycle: data.cycle || 'monthly',
          category: data.category || '订阅',
          description: data.description || record.raw_text,
          start_date: data.start_date || selectedDate,
          billing_type: data.billing_type || 'auto',
        })
      } else {
        const item = normalizeExpense(data, selectedDate)
        if (!item) {
          Taro.showToast({ title: '消费金额缺失', icon: 'none' })
          return
        }
        await addExpenses([item], record.raw_text)
      }
      await confirmPendingRecord(record.id)
      Taro.showToast({ title: '已确认', icon: 'success' })
      const pending = await fetchPendingRecords()
      setPendingRecords(pending)
      if (pending.length === 0) setIsInboxOpen(false)
      loadData()
    } catch (error) {
      console.error('confirmInboxRecord error:', error)
      Taro.showToast({ title: '确认失败', icon: 'none' })
    }
  }

  const rejectInboxRecord = async (record: PendingRecord) => {
    try {
      await rejectPendingRecord(record.id)
      const pending = await fetchPendingRecords()
      setPendingRecords(pending)
      if (pending.length === 0) setIsInboxOpen(false)
      Taro.showToast({ title: '已忽略', icon: 'success' })
    } catch (error) {
      console.error('rejectInboxRecord error:', error)
      Taro.showToast({ title: '操作失败', icon: 'none' })
    }
  }

  const recentList = [...recentExpenses]
    .sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
    .slice(0, 4)

  const inputPlaceholder = entryMode === 'day'
    ? '今天花了什么？一句话记下来'
    : '这个月有什么固定支出？也可以一句话录入'

  return (
    <PageShell activeTab="record">
      <PageHeader
        title="记一笔"
        subtitle="一句话智能识别消费、分类和日期"
        left={<RoundIconButton icon={Clock3} color={BLUE} />}
        right={<RoundIconButton icon={Ellipsis} color={TEXT_SECONDARY} />}
      />

      <View className="mx-5 mb-4">
        <SegmentControl<EntryMode>
          value={entryMode}
          options={[{ label: '按日期', value: 'day' }, { label: '按月份', value: 'month' }]}
          onChange={setEntryMode}
        />
      </View>

      <View className="mx-5 mb-4 flex flex-row items-center justify-between">
        <RoundIconButton icon={ChevronLeft} color={TEXT_SECONDARY} backgroundColor="#FFFFFF" onClick={() => setSelectedDate(shiftDate(selectedDate, entryMode, -1))} />
        <View className="flex flex-row items-center gap-2 rounded-full bg-white px-5 py-2" style={{ boxShadow: '0 6px 18px rgba(21, 27, 45, 0.06)' }}>
          <CalendarDays size={16} color={BLUE} />
          <Text className="block text-base font-semibold" style={{ color: TEXT_PRIMARY }}>
            {entryMode === 'day' ? formatDateLabel(selectedDate) : formatMonthLabel(selectedDate)}
          </Text>
        </View>
        <RoundIconButton icon={ChevronRight} color={TEXT_SECONDARY} backgroundColor="#FFFFFF" onClick={() => setSelectedDate(shiftDate(selectedDate, entryMode, 1))} />
      </View>

      <AppCard className="mx-5 p-5">
        <View className="flex flex-row items-center gap-2 mb-3">
          <Sparkles size={18} color={BLUE} strokeWidth={2.2} />
          <Text className="block text-base font-bold" style={{ color: TEXT_PRIMARY }}>智能记账</Text>
          <Pill tone="blue">AI 解析</Pill>
        </View>
        <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#F4F8FF' }}>
          <Textarea
            value={inputText}
            placeholder={inputPlaceholder}
            placeholderStyle="color:#A6AFBD"
            style={{ width: '100%', minHeight: '86px', backgroundColor: 'transparent', color: TEXT_PRIMARY, fontSize: '16px', lineHeight: '24px' }}
            onInput={(event) => setInputText(event.detail.value)}
          />
        </View>

        <ScrollView scrollX className="mt-4" style={{ whiteSpace: 'nowrap' }}>
          <View className="flex flex-row">
            {QUICK_CATEGORIES.map(category => (
              <CategoryChip
                key={category}
                label={category}
                icon={CATEGORY_ICONS[category]}
                active={selectedCategory === category}
                onClick={() => {
                  setSelectedCategory(category)
                  if (!inputText.trim()) setInputText(`${category} `)
                }}
              />
            ))}
          </View>
        </ScrollView>

        <Button
          className="w-full mt-5 rounded-2xl text-white"
          style={{ height: '50px', background: PRIMARY_GRADIENT, boxShadow: '0 10px 24px rgba(47, 123, 255, 0.24)' }}
          disabled={isParsing}
          onClick={parseInput}
        >
          <Send size={17} color="#FFFFFF" strokeWidth={2.2} />
          <Text className="block text-white text-base font-semibold ml-2">{isParsing ? '解析中...' : '智能记账'}</Text>
        </Button>

        <View className="flex flex-row flex-wrap gap-2 mt-4">
          {EXAMPLES.map(example => (
            <View
              key={example}
              className="rounded-full px-3 py-2"
              style={{ backgroundColor: '#F2F5FA' }}
              onClick={() => setInputText(example)}
            >
              <Text className="block text-xs" style={{ color: TEXT_SECONDARY }}>{example}</Text>
            </View>
          ))}
        </View>
      </AppCard>

      {parsedResults.length > 0 ? (
        <AppCard className="mx-5 mt-4">
          <View className="flex flex-row items-center justify-between mb-3">
            <Text className="block text-base font-bold" style={{ color: TEXT_PRIMARY }}>AI 解析结果</Text>
            <RoundIconButton icon={X} color={TEXT_SECONDARY} backgroundColor="#F2F5FA" size={30} onClick={() => setParsedResults([])} />
          </View>
          {parsedResults.map((item, index) => (
            <View key={`${item.note}-${index}`} className="flex flex-row items-center gap-3 py-3" style={index > 0 ? { borderTop: '1px solid #EEF3FA' } : {}}>
              <View className="flex items-center justify-center rounded-xl" style={{ width: '42px', height: '42px', backgroundColor: '#EAF1FF' }}>
                <Text className="block text-lg">{CATEGORY_ICONS[item.category] || CATEGORY_ICONS.其他}</Text>
              </View>
              <View className="flex-1 min-w-0">
                <Text className="block text-sm font-semibold" style={{ color: TEXT_PRIMARY }} numberOfLines={1}>{item.note || item.category}</Text>
                <View className="flex flex-row items-center gap-2 mt-1">
                  <Pill tone="gray">{item.category || '其他'}</Pill>
                  <Text className="block text-xs" style={{ color: TEXT_MUTED }}>{item.expense_date || selectedDate}</Text>
                </View>
              </View>
              <Text className="block text-base font-bold" style={{ color: '#EF4444' }}>{amountText(item.amount)}</Text>
            </View>
          ))}
          <Button
            className="w-full mt-3 rounded-2xl text-white"
            style={{ height: '48px', background: PRIMARY_GRADIENT }}
            disabled={isSaving}
            onClick={saveParsedResults}
          >
            <Check size={17} color="#FFFFFF" strokeWidth={2.3} />
            <Text className="block text-white text-sm font-semibold ml-2">{isSaving ? '保存中...' : '确认入账'}</Text>
          </Button>
        </AppCard>
      ) : null}

      <View className="mx-5 mt-4 flex flex-row gap-3">
        <AppCard className="flex-1 p-4" onClick={() => setIsInboxOpen(true)}>
          <View className="flex flex-row items-center justify-between">
            <View className="flex items-center justify-center rounded-xl" style={{ width: '42px', height: '42px', backgroundColor: '#EAF1FF' }}>
              <Inbox size={20} color={BLUE} strokeWidth={2.2} />
            </View>
            {pendingRecords.length > 0 ? <Pill tone="red">{pendingRecords.length} 条</Pill> : <Pill>空</Pill>}
          </View>
          <Text className="block text-sm font-bold mt-3" style={{ color: TEXT_PRIMARY }}>收集箱待确认</Text>
          <Text className="block text-xs mt-1" style={{ color: TEXT_MUTED }}>公众号消息在这里确认</Text>
        </AppCard>

        <AppCard className="flex-1 p-4">
          <View className="flex items-center justify-center rounded-xl" style={{ width: '42px', height: '42px', backgroundColor: '#FFF4E5' }}>
            <Lightbulb size={20} color="#F97316" strokeWidth={2.2} />
          </View>
          <Text className="block text-sm font-bold mt-3" style={{ color: TEXT_PRIMARY }}>AI 建议</Text>
          <Text className="block text-xs mt-1 leading-5" style={{ color: TEXT_MUTED }}>常用分类会自动记忆，越改越懂你。</Text>
        </AppCard>
      </View>

      <SectionTitle title="最近记录" action="查看全部" onAction={() => Taro.switchTab({ url: '/pages/bills/index' })} />
      <AppCard className="mx-5 p-0 overflow-hidden">
        {recentList.length > 0 ? recentList.map((item, index) => (
          <View
            key={item.id}
            className="flex flex-row items-center gap-3 px-4 py-4"
            style={index < recentList.length - 1 ? { borderBottom: '1px solid #EEF3FA' } : {}}
          >
            <View className="flex items-center justify-center rounded-xl" style={{ width: '42px', height: '42px', backgroundColor: '#F4F8FF' }}>
              <Text className="block text-lg">{CATEGORY_ICONS[item.category] || CATEGORY_ICONS.其他}</Text>
            </View>
            <View className="flex-1 min-w-0">
              <Text className="block text-sm font-semibold" style={{ color: TEXT_PRIMARY }} numberOfLines={1}>{item.note || item.category}</Text>
              <Text className="block text-xs mt-1" style={{ color: TEXT_MUTED }}>{item.category} · {item.expense_date}</Text>
            </View>
            <Text className="block text-base font-bold" style={{ color: '#EF4444' }}>-¥{Number(item.amount).toFixed(2)}</Text>
          </View>
        )) : (
          <EmptyState title="还没有记录" description="写一句消费内容，AI 会帮你拆成账单。" />
        )}
      </AppCard>

      <MoneyHero
        label="智能提示"
        amount="少打字，多确认"
        caption="自然语言、订阅识别和微信收集箱共用同一套记账流。"
        icon={Sparkles}
      />

      <BottomSheet title="收集箱待确认" visible={isInboxOpen} onClose={() => setIsInboxOpen(false)}>
        {pendingRecords.length > 0 ? pendingRecords.map(record => {
          const data = record.parsed_data || {}
          const isSubscription = record.record_type === 'subscription'
          const isVoice = record.source_message_type === 'voice' || !!record.media_object_key || !!record.wechat_media_id
          const sourceLabel = isVoice ? '公众号语音' : record.source === 'wechat_oa' ? '公众号文字' : '小程序'
          const isPlaying = playingRecordId === record.id
          const parsedSummary = isSubscription
            ? `${data.category || '订阅'} · ${data.cycle || '周期待确认'}`
            : `${data.category || '分类待确认'} · ${data.expense_date || selectedDate}`
          return (
            <AppCard key={record.id} className="mb-3" style={{ boxShadow: 'none', borderWidth: '1px', borderStyle: 'solid', borderColor: '#EEF3FA' }}>
              <View className="flex flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <View className="flex flex-row items-center gap-2">
                    <Pill tone={isSubscription ? 'purple' : 'blue'}>{isSubscription ? '订阅' : '消费'}</Pill>
                    <Pill tone={isVoice ? 'orange' : 'gray'}>{sourceLabel}</Pill>
                    <Text className="block text-xs" style={{ color: TEXT_MUTED }}>{transcriptionLabel(record.transcription_source)}</Text>
                  </View>
                  <Text className="block text-base font-bold mt-3" style={{ color: TEXT_PRIMARY }}>{data.note || data.name || record.raw_text}</Text>
                  <Text className="block text-xs mt-2 leading-5" style={{ color: TEXT_SECONDARY }}>
                    {isVoice ? '识别文本：' : '原始文本：'}{record.raw_text}
                  </Text>
                  <Text className="block text-xs mt-1" style={{ color: TEXT_MUTED }}>{parsedSummary}</Text>
                </View>
                <Text className="block text-lg font-bold" style={{ color: isSubscription ? BLUE : '#EF4444' }}>
                  {data.amount ? `¥${Number(data.amount).toFixed(2)}` : '待补充'}
                </Text>
              </View>
              {isVoice ? (
                <Button
                  className="mt-4 rounded-2xl"
                  style={{ width: '100%', height: '42px', backgroundColor: record.media_object_key ? '#EAF1FF' : '#F2F5FA' }}
                  onClick={() => playPendingAudio(record)}
                >
                  {isPlaying ? <Pause size={16} color={BLUE} strokeWidth={2.2} /> : <Play size={16} color={record.media_object_key ? BLUE : TEXT_SECONDARY} strokeWidth={2.2} />}
                  <Mic size={15} color={record.media_object_key ? BLUE : TEXT_SECONDARY} strokeWidth={2.2} />
                  <Text className="block text-sm font-semibold ml-2" style={{ color: record.media_object_key ? BLUE : TEXT_SECONDARY }}>
                    {record.media_object_key ? (isPlaying ? '暂停回听原语音' : '回听原语音') : '原语音待存储配置'}
                  </Text>
                </Button>
              ) : null}
              <View className="flex flex-row items-center gap-2 mt-4">
                <Button className="flex-1 rounded-2xl" style={{ backgroundColor: '#F2F5FA' }} onClick={() => rejectInboxRecord(record)}>
                  <X size={16} color={TEXT_SECONDARY} strokeWidth={2.2} />
                  <Text className="block text-sm font-semibold ml-1" style={{ color: TEXT_SECONDARY }}>忽略</Text>
                </Button>
                <Button className="flex-1 rounded-2xl text-white" style={{ background: PRIMARY_GRADIENT }} onClick={() => confirmInboxRecord(record)}>
                  <Check size={16} color="#FFFFFF" strokeWidth={2.3} />
                  <Text className="block text-sm font-semibold text-white ml-1">确认</Text>
                </Button>
              </View>
            </AppCard>
          )
        }) : (
          <EmptyState icon={Inbox} title="没有待确认记录" description="公众号发来的待确认账单会出现在这里。" />
        )}
      </BottomSheet>
    </PageShell>
  )
}

export default IndexPage

