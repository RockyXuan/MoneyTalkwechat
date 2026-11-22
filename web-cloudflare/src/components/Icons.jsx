import { h } from 'preact';
import {
  Wallet, Utensils, Bus, ShoppingBag, Gamepad2, House, CirclePlus,
  GraduationCap, Leaf, Ellipsis, Banknote, Gift, Pencil, ReceiptText,
  ChartNoAxesCombined, UserRound, Settings, Download, ChevronDown,
  ChevronUp, ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal,
  Trash2, RotateCcw, CalendarDays, ArrowUpRight, PieChart, ChartColumn,
  ChartLine, FileDown, CloudUpload, LogOut, X, Check, AlertCircle,
  ArrowRight, LoaderCircle, ShieldCheck, FolderOpen, CheckCheck, CircleHelp,
  Sun, Moon, Sparkles, Tag, AtSign, ChevronRight as RightIcon,
} from 'lucide';
import { PALETTE } from '../../shared/format.js';

const ICON_MAP = {
  wallet: Wallet,
  utensils: Utensils,
  bus: Bus,
  'shopping-bag': ShoppingBag,
  'gamepad-2': Gamepad2,
  house: House,
  'circle-plus': CirclePlus,
  'graduation-cap': GraduationCap,
  leaf: Leaf,
  ellipsis: Ellipsis,
  banknote: Banknote,
  gift: Gift,
  pencil: Pencil,
  receipt: ReceiptText,
  stats: ChartNoAxesCombined,
  user: UserRound,
  settings: Settings,
  download: Download,
  down: ChevronDown,
  up: ChevronUp,
  left: ChevronLeft,
  right: RightIcon,
  plus: Plus,
  search: Search,
  filter: SlidersHorizontal,
  trash: Trash2,
  undo: RotateCcw,
  calendar: CalendarDays,
  income: ArrowUpRight,
  pie: PieChart,
  bar: ChartColumn,
  line: ChartLine,
  file: FileDown,
  upload: CloudUpload,
  logout: LogOut,
  close: X,
  check: Check,
  alert: AlertCircle,
  arrow: ArrowRight,
  loader: LoaderCircle,
  shield: ShieldCheck,
  folder: FolderOpen,
  checks: CheckCheck,
  help: CircleHelp,
  sun: Sun,
  moon: Moon,
  sparkles: Sparkles,
  tag: Tag,
  at: AtSign,
};

export function Icon({ name = 'wallet', size = 18, className = '' }) {
  const nodes = ICON_MAP[name] || Wallet;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      class={className}
    >
      {nodes.map(([tag, attrs], index) => h(tag, { key: index, ...attrs }))}
    </svg>
  );
}

export function categoryColor(category) {
  return PALETTE[category?.color_key] || PALETTE.slate;
}

export function ownerColor(owner) {
  return PALETTE[owner?.color_key] || PALETTE.slate;
}
