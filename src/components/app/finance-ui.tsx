import Taro from '@tarojs/taro'
import { Image, ScrollView, Text, View } from '@tarojs/components'
import {
  ChartNoAxesColumn,
  Check,
  ChevronLeft,
  CreditCard,
  Inbox,
  PenLine,
  Receipt,
  User,
  X,
} from 'lucide-react-taro'
import { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type IconComponent = ComponentType<any>

export type AppTabKey = 'record' | 'subscriptions' | 'bills' | 'stats' | 'profile'

export const BLUE = '#2F7BFF'
export const BLUE_DEEP = '#1769F6'
export const TEXT_PRIMARY = '#151B2D'
export const TEXT_SECONDARY = '#647084'
export const TEXT_MUTED = '#A6AFBD'
export const PAGE_BG = '#F5F8FF'
export const CARD_SHADOW = '0 10px 30px rgba(47, 123, 255, 0.08)'
export const SOFT_SHADOW = '0 8px 24px rgba(21, 27, 45, 0.06)'
export const PRIMARY_GRADIENT = 'linear-gradient(135deg, #2F7BFF 0%, #65A0FF 100%)'

export const TAB_ITEMS: { key: AppTabKey; label: string; pagePath: string; Icon: IconComponent }[] = [
  { key: 'record', label: '记一笔', pagePath: '/pages/index/index', Icon: PenLine },
  { key: 'subscriptions', label: '订阅', pagePath: '/pages/subscriptions/index', Icon: CreditCard },
  { key: 'bills', label: '账单', pagePath: '/pages/bills/index', Icon: Receipt },
  { key: 'stats', label: '统计', pagePath: '/pages/stats/index', Icon: ChartNoAxesColumn },
  { key: 'profile', label: '我的', pagePath: '/pages/profile/index', Icon: User },
]

interface PageShellProps {
  activeTab?: AppTabKey
  children: ReactNode
  className?: string
  showTabBar?: boolean
}

export function PageShell({ activeTab, children, className, showTabBar = true }: PageShellProps) {
  return (
    <View className={cn('min-h-full', className)} style={{ backgroundColor: PAGE_BG }}>
      <ScrollView scrollY className="min-h-full">
        <View style={{ paddingBottom: showTabBar ? '118px' : '28px' }}>{children}</View>
      </ScrollView>
      {showTabBar && activeTab ? <AppTabBar active={activeTab} /> : null}
    </View>
  )
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  left?: ReactNode
  right?: ReactNode
}

export function PageHeader({ title, subtitle, left, right }: PageHeaderProps) {
  return (
    <View className="flex flex-row items-center justify-between px-5 pt-4 pb-3">
      <View className="flex flex-row items-center gap-3">
        {left}
        <View>
          <Text className="block text-xl font-bold" style={{ color: TEXT_PRIMARY }}>{title}</Text>
          {subtitle ? <Text className="block text-xs mt-1" style={{ color: TEXT_SECONDARY }}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  )
}

interface RoundIconButtonProps {
  icon: IconComponent
  color?: string
  backgroundColor?: string
  onClick?: () => void
  size?: number
}

export function RoundIconButton({
  icon: Icon,
  color = BLUE,
  backgroundColor = '#FFFFFF',
  onClick,
  size = 36,
}: RoundIconButtonProps) {
  return (
    <View
      className="flex items-center justify-center rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor,
        boxShadow: backgroundColor === '#FFFFFF' ? SOFT_SHADOW : 'none',
      }}
      onClick={onClick}
    >
      <Icon size={18} color={color} strokeWidth={2.2} />
    </View>
  )
}

interface AppCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  style?: Record<string, string | number>
}

export function AppCard({ children, className, onClick, style }: AppCardProps) {
  return (
    <View
      className={cn('bg-white rounded-2xl p-4', className)}
      style={{ boxShadow: CARD_SHADOW, ...style }}
      onClick={onClick}
    >
      {children}
    </View>
  )
}

interface SectionTitleProps {
  title: string
  action?: string
  onAction?: () => void
}

export function SectionTitle({ title, action, onAction }: SectionTitleProps) {
  return (
    <View className="flex flex-row items-center justify-between px-5 mt-5 mb-3">
      <Text className="block text-base font-bold" style={{ color: TEXT_PRIMARY }}>{title}</Text>
      {action ? (
        <Text className="block text-sm" style={{ color: BLUE }} onClick={onAction}>{action}</Text>
      ) : null}
    </View>
  )
}

interface SegmentControlProps<T extends string> {
  value: T
  options: { label: string; value: T }[]
  onChange: (value: T) => void
}

export function SegmentControl<T extends string>({ value, options, onChange }: SegmentControlProps<T>) {
  return (
    <View className="flex flex-row rounded-full p-1" style={{ backgroundColor: '#EAF1FF' }}>
      {options.map(option => {
        const active = option.value === value
        return (
          <View
            key={option.value}
            className="flex-1 rounded-full py-2"
            style={active ? { backgroundColor: '#FFFFFF', boxShadow: '0 4px 14px rgba(47, 123, 255, 0.14)' } : {}}
            onClick={() => onChange(option.value)}
          >
            <Text className="block text-center text-sm font-semibold" style={{ color: active ? BLUE : TEXT_SECONDARY }}>
              {option.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

interface CategoryChipProps {
  label: string
  active?: boolean
  icon?: string
  onClick?: () => void
}

export function CategoryChip({ label, active, icon, onClick }: CategoryChipProps) {
  return (
    <View
      className="flex flex-row items-center rounded-full px-4 py-2 mr-2"
      style={{
        backgroundColor: active ? BLUE : '#FFFFFF',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: active ? BLUE : '#DDE7F7',
        boxShadow: active ? '0 8px 18px rgba(47, 123, 255, 0.18)' : 'none',
      }}
      onClick={onClick}
    >
      {icon ? <Text className="block text-sm mr-1">{icon}</Text> : null}
      <Text className="block text-sm font-medium" style={{ color: active ? '#FFFFFF' : TEXT_SECONDARY }}>{label}</Text>
    </View>
  )
}

interface EmptyStateProps {
  icon?: IconComponent
  image?: string
  title: string
  description?: string
}

export function EmptyState({ icon: Icon = Inbox, image, title, description }: EmptyStateProps) {
  return (
    <View className="flex flex-col items-center justify-center py-10 px-6">
      <View
        className="flex items-center justify-center rounded-full"
        style={{ width: '64px', height: '64px', backgroundColor: '#EAF1FF' }}
      >
        {image ? <Image src={image} style={{ width: '34px', height: '34px' }} /> : <Icon size={30} color={BLUE} strokeWidth={2.1} />}
      </View>
      <Text className="block text-sm font-semibold mt-3" style={{ color: TEXT_PRIMARY }}>{title}</Text>
      {description ? <Text className="block text-xs text-center mt-1 leading-5" style={{ color: TEXT_MUTED }}>{description}</Text> : null}
    </View>
  )
}

interface StatCardProps {
  label: string
  value: string
  icon?: IconComponent
  tone?: 'blue' | 'green' | 'orange' | 'purple'
}

const toneMap = {
  blue: { bg: '#EAF1FF', fg: BLUE },
  green: { bg: '#EAFBF0', fg: '#16A34A' },
  orange: { bg: '#FFF4E5', fg: '#F97316' },
  purple: { bg: '#F3EFFF', fg: '#7C3AED' },
}

export function StatCard({ label, value, icon: Icon = ChartNoAxesColumn, tone = 'blue' }: StatCardProps) {
  const colors = toneMap[tone]
  return (
    <AppCard className="flex-1 p-3">
      <View className="flex flex-row items-center gap-2">
        <View className="flex items-center justify-center rounded-xl" style={{ width: '34px', height: '34px', backgroundColor: colors.bg }}>
          <Icon size={16} color={colors.fg} strokeWidth={2.2} />
        </View>
        <View className="flex-1">
          <Text className="block text-xs" style={{ color: TEXT_MUTED }}>{label}</Text>
          <Text className="block text-base font-bold mt-1" style={{ color: TEXT_PRIMARY }}>{value}</Text>
        </View>
      </View>
    </AppCard>
  )
}

interface PillProps {
  children: ReactNode
  tone?: 'blue' | 'green' | 'orange' | 'gray' | 'red' | 'purple'
}

const pillColors = {
  blue: { bg: '#EAF1FF', fg: BLUE },
  green: { bg: '#EAFBF0', fg: '#16A34A' },
  orange: { bg: '#FFF4E5', fg: '#F97316' },
  gray: { bg: '#F2F5FA', fg: TEXT_SECONDARY },
  red: { bg: '#FFF1F1', fg: '#EF4444' },
  purple: { bg: '#F3EFFF', fg: '#7C3AED' },
}

export function Pill({ children, tone = 'gray' }: PillProps) {
  const colors = pillColors[tone]
  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.bg }}>
      <Text className="block text-xs font-medium" style={{ color: colors.fg }}>{children}</Text>
    </View>
  )
}

interface MoneyHeroProps {
  label: string
  amount: string
  caption?: string
  icon?: IconComponent
  children?: ReactNode
}

export function MoneyHero({ label, amount, caption, icon: Icon = Receipt, children }: MoneyHeroProps) {
  return (
    <View className="mx-5 rounded-2xl p-5" style={{ background: PRIMARY_GRADIENT, boxShadow: '0 16px 34px rgba(47, 123, 255, 0.22)' }}>
      <View className="flex flex-row items-start justify-between">
        <View>
          <Text className="block text-sm" style={{ color: 'rgba(255,255,255,0.82)' }}>{label}</Text>
          <Text className="block text-3xl font-bold mt-2" style={{ color: '#FFFFFF' }}>{amount}</Text>
          {caption ? <Text className="block text-xs mt-2" style={{ color: 'rgba(255,255,255,0.72)' }}>{caption}</Text> : null}
        </View>
        <View className="flex items-center justify-center rounded-full" style={{ width: '48px', height: '48px', backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <Icon size={24} color="#FFFFFF" strokeWidth={2.2} />
        </View>
      </View>
      {children ? <View className="mt-4">{children}</View> : null}
    </View>
  )
}

interface BottomSheetProps {
  title: string
  visible: boolean
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ title, visible, onClose, children }: BottomSheetProps) {
  if (!visible) return null
  return (
    <View className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: 'rgba(21, 27, 45, 0.42)' }} onClick={onClose}>
      <View
        className="w-full bg-white rounded-t-2xl"
        style={{ maxHeight: '84vh', display: 'flex', flexDirection: 'column' }}
        onClick={(event) => event.stopPropagation()}
      >
        <View className="flex flex-row items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #EEF3FA' }}>
          <Text className="block text-lg font-bold" style={{ color: TEXT_PRIMARY }}>{title}</Text>
          <RoundIconButton icon={X} color={TEXT_SECONDARY} backgroundColor="#F2F5FA" size={32} onClick={onClose} />
        </View>
        <ScrollView scrollY className="flex-1">
          <View className="p-5">{children}</View>
        </ScrollView>
      </View>
    </View>
  )
}

interface CheckRowProps {
  title: string
  description?: string
  checked?: boolean
  onClick?: () => void
}

export function CheckRow({ title, description, checked, onClick }: CheckRowProps) {
  return (
    <View className="flex flex-row items-center gap-3 py-3" onClick={onClick}>
      <View
        className="flex items-center justify-center rounded-full"
        style={{
          width: '24px',
          height: '24px',
          backgroundColor: checked ? BLUE : '#FFFFFF',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: checked ? BLUE : '#DDE7F7',
        }}
      >
        {checked ? <Check size={14} color="#FFFFFF" strokeWidth={2.4} /> : null}
      </View>
      <View className="flex-1">
        <Text className="block text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{title}</Text>
        {description ? <Text className="block text-xs mt-1" style={{ color: TEXT_MUTED }}>{description}</Text> : null}
      </View>
    </View>
  )
}

export function BackButton() {
  return <RoundIconButton icon={ChevronLeft} color={TEXT_SECONDARY} onClick={() => Taro.navigateBack()} />
}

export function AppTabBar({ active }: { active: AppTabKey }) {
  const switchTo = (pagePath: string) => {
    Taro.switchTab({ url: pagePath })
  }

  return (
    <View
      className="fixed left-0 right-0 z-40 flex flex-row items-center justify-center px-5"
      style={{ bottom: '0', paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <View
        className="w-full flex flex-row items-center justify-between rounded-full px-2 py-2"
        style={{ backgroundColor: '#FFFFFF', boxShadow: '0 16px 36px rgba(21, 27, 45, 0.14)' }}
      >
        {TAB_ITEMS.map(item => {
          const selected = active === item.key
          const Icon = item.Icon
          return (
            <View
              key={item.key}
              className="flex-1 flex items-center justify-center rounded-full py-2"
              style={selected ? { backgroundColor: '#EAF1FF' } : {}}
              onClick={() => switchTo(item.pagePath)}
            >
              <Icon size={20} color={selected ? BLUE : '#9AA6B8'} strokeWidth={2.2} />
              <Text className="block text-xs mt-1 font-medium" style={{ color: selected ? BLUE : '#9AA6B8' }}>
                {item.label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
