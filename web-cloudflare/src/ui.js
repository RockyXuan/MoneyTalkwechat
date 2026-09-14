import { createElement, Wallet, Utensils, Bus, ShoppingBag, Gamepad2, House, CirclePlus, GraduationCap, Leaf, Ellipsis, Banknote, Gift, Pencil, ReceiptText, ChartNoAxesCombined, UserRound, Settings, Download, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, Trash2, RotateCcw, CalendarDays, ArrowUpRight, PieChart, ChartColumn, ChartLine, FileDown, CloudUpload, LogOut, X, Check, AlertCircle, ArrowRight, LoaderCircle, ShieldCheck, FolderOpen, CheckCheck, CircleHelp } from 'lucide';
import { PALETTE, money } from '../shared/format.js';

const icons = { wallet: Wallet, utensils: Utensils, bus: Bus, 'shopping-bag': ShoppingBag, 'gamepad-2': Gamepad2, house: House, 'circle-plus': CirclePlus, 'graduation-cap': GraduationCap, leaf: Leaf, ellipsis: Ellipsis, banknote: Banknote, gift: Gift, pencil: Pencil, receipt: ReceiptText, stats: ChartNoAxesCombined, user: UserRound, settings: Settings, download: Download, down: ChevronDown, up: ChevronUp, left: ChevronLeft, right: ChevronRight, plus: Plus, search: Search, filter: SlidersHorizontal, trash: Trash2, undo: RotateCcw, calendar: CalendarDays, income: ArrowUpRight, pie: PieChart, bar: ChartColumn, line: ChartLine, file: FileDown, upload: CloudUpload, logout: LogOut, close: X, check: Check, alert: AlertCircle, arrow: ArrowRight, loader: LoaderCircle, shield: ShieldCheck, folder: FolderOpen, checks: CheckCheck, help: CircleHelp };
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function icon(name, size = 20) { return createElement(icons[name] || Wallet, { width: size, height: size, 'stroke-width': 1.8, 'aria-hidden': 'true', focusable: 'false' }).outerHTML; }
export function color(category) { return PALETTE[category?.color_key] || PALETTE.slate; }
export function categoryIcon(category, size = '') { return `<span class="category-icon ${size}" style="--category:${color(category)}">${icon(category?.icon || 'ellipsis', size === 'small' ? 17 : 21)}</span>`; }
export function iconButton(name, title, attributes = '') { return `<button type="button" class="icon-button" aria-label="${escape(title)}" title="${escape(title)}" ${attributes}>${icon(name)}</button>`; }
export function empty(title, description, action = '') { return `<div class="empty-state">${icon('folder', 36)}<h3>${escape(title)}</h3><p>${escape(description)}</p>${action}</div>`; }
export function errorPanel(message) { return `<div class="error-panel" role="alert">${icon('alert')}<div><strong>暂时没有读取到账本</strong><p>${escape(message)}</p></div><button class="button secondary" data-action="refresh">重试</button></div>`; }
export function amount(entry) { return `<span class="money ${entry.type === 'income' ? 'income-text' : ''}">${entry.type === 'income' ? '+' : '−'}${money(entry.amount_minor, false)}</span>`; }
export function timeLabel(value) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
export function dayLabel(day) {
  const [, m, d] = day.split('-');
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(new Date(`${day}T12:00:00+08:00`));
  return `${Number(m)}月${Number(d)}日 <span>${weekday}</span>`;
}
export function recordRow(entry, { date = false, restore = false } = {}) {
  return `<div class="record-row"><button class="record-body" data-action="entry" data-id="${escape(entry.id)}">${categoryIcon(entry)}<span class="record-copy"><strong>${escape(entry.note || entry.category_name)}</strong><small>${date ? `${escape(entry.occurred_on.slice(5).replace('-', '月'))}日 · ` : ''}${escape(entry.category_name)} · ${timeLabel(entry.created_at)}</small></span>${amount(entry)}</button>${restore ? iconButton('undo', '恢复这条记录', `data-action="restore-entry" data-id="${escape(entry.id)}" data-version="${entry.version}"`) : ''}</div>`;
}
export function tableRows(entries) {
  return entries.map(e => `<tr><td class="table-date">${escape(e.occurred_on.slice(5))}</td><td class="table-note"><button class="text-button note-link" data-action="entry" data-id="${escape(e.id)}">${escape(e.note || e.category_name)}</button></td><td><span class="table-category" style="--category:${color(e)}">${icon(e.icon, 17)}${escape(e.category_name)}</span></td><td class="numeric">${amount(e)}</td><td class="table-actions">${iconButton('pencil', '编辑记录', `data-action="entry" data-id="${escape(e.id)}"`)}${iconButton('trash', '删除记录', `class="danger" data-action="delete-entry" data-id="${escape(e.id)}"`)}</td></tr>`).join('');
}
