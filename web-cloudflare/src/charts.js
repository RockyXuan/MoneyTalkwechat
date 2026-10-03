import { Chart, BarController, BarElement, LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { PALETTE, money } from '../shared/format.js';
Chart.register(BarController, BarElement, LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Tooltip);
let chart;
export function destroyChart() { chart?.destroy(); chart = null; }
export function chartData(stats, mode) {
  if (mode === 'pie') return { labels: stats.categories.map(c => c.name), datasets: [{ data: stats.categories.map(c => c.amount_minor), backgroundColor: stats.categories.map(c => PALETTE[c.color_key]), borderWidth: 3, borderColor: '#fff', hoverOffset: 6 }] };
  const values = new Map(stats.series.map(v => [`${v.bucket}:${v.category_id}`, v.amount_minor]));
  return { labels: stats.buckets.map(b => stats.bucket === 'day' ? `${Number(b.slice(5, 7))}/${Number(b.slice(8))}` : `${Number(b.slice(5))}月`), datasets: stats.categories.map(c => ({ label: c.name, categoryId: c.id, data: stats.buckets.map(b => values.get(`${b}:${c.id}`) || 0), backgroundColor: PALETTE[c.color_key], borderColor: PALETTE[c.color_key], borderWidth: mode === 'line' ? 2 : 0, borderRadius: 0, maxBarThickness: 28, pointRadius: stats.buckets.length > 20 ? 2 : 3, pointHoverRadius: 5, tension: 0, fill: false })) };
}
export function renderChart(canvas, stats, mode, onCategory) {
  destroyChart();
  if (!canvas || !stats.totals.expense_minor) return;
  const pie = mode === 'pie';
  const tickLimit = matchMedia('(max-width: 767px)').matches ? 7 : 9;
  const tickStep = Math.max(1, Math.round((stats.buckets.length - 1) / (tickLimit - 1)));
  chart = new Chart(canvas, {
    type: mode === 'bar' ? 'bar' : mode === 'line' ? 'line' : 'pie', data: chartData(stats, mode),
    options: {
      responsive: true, maintainAspectRatio: false, animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : {duration:240},
      interaction: { mode: pie ? 'nearest' : 'index', intersect: false },
      layout: { padding: { top: 12, right: 8, bottom: 0 } },
      plugins: { tooltip: { backgroundColor: '#fff', titleColor: '#151b2d', bodyColor: '#35405a', borderColor: '#dbe5f4', borderWidth: 1, padding: 13, boxPadding: 5,
        callbacks: { label: item => { const value = pie ? item.parsed : item.parsed.y; return `${pie ? item.label : item.dataset.label}  ${money(value)}${pie ? `  ${(value / stats.totals.expense_minor * 100).toFixed(1)}%` : ''}`; }, footer: items => !pie ? `合计  ${money(items.reduce((s, i) => s + i.parsed.y, 0))}` : '' } } },
      scales: pie ? {} : {
        x: { stacked: mode === 'bar', grid: { display: false }, border: { color: '#e2e8f2' }, ticks: { color: '#647084', maxRotation: 0, autoSkip: false, callback(value, index) { const last = stats.buckets.length - 1; return index === last || (index % tickStep === 0 && index <= last - tickStep) ? this.getLabelForValue(value) : ''; }, font: { size: 11 } } },
        y: { stacked: mode === 'bar', beginAtZero: true, border: { display: false }, grid: { color: '#edf1f7' }, ticks: { color: '#647084', maxTicksLimit: 6, font: { size: 11 }, callback: value => Number(value) / 100 } },
      },
    },
  });
}
