import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4/auto/+esm'
import { getJson } from '../../lib/api.js'
import { asyncView } from '../../lib/async-view.js'
import { CHART_COLORS as C } from '../ui/time-chart.js'

/*  <analytics-page>
 *
 *  Cross-provider activity overview from /api/analytics/overview.
 *  Hero chart: stacked session bars per provider + one universal metric line.
 *  Provider panels: each provider's native metrics only (kiro records no
 *  tokens, codex no context — missing buckets render as gaps, never zeros).
 *
 *  Charts use one fixed palette (matches the default solarized-grey vibe)
 *  rather than following the theme selector — a deliberate simplification.
 */

const METRICS = [
  { id: 'tool_uses', label: 'tool calls' },
  { id: 'messages',  label: 'messages' },
  { id: 'errors',    label: 'tool errors' },
]

const BUCKETS = ['day', 'week', 'month']

Chart.defaults.color = C.text
Chart.defaults.borderColor = C.grid
Chart.defaults.font.family = "'JetBrains Mono', monospace"
Chart.defaults.font.size = 11

class AnalyticsPage extends LitElement {
  static properties = {
    _data:   { state: true },
    _bucket: { state: true },
    _metric: { state: true },
    _error:  { state: true },
  }

  constructor() {
    super()
    this._bucket = 'week'
    this._metric = 'tool_uses'
    this._charts = []
  }

  createRenderRoot() { return this }

  connectedCallback() {
    super.connectedCallback()
    this.load()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._charts.forEach(c => c.destroy())
    this._charts = []
  }

  async load() {
    try {
      this._data = await getJson(`/analytics/overview?bucket=${this._bucket}`)
      this._error = null
    } catch (e) {
      this._error = String(e)
    }
  }

  setBucket(b) { this._bucket = b; this.load() }
  setMetric(m) { this._metric = m; this.buildCharts() }

  updated() {
    if (this._data) this.buildCharts()
  }

  buildCharts() {
    this._charts.forEach(c => c.destroy())
    this._charts = []
    const d = this._data
    if (!d) return

    const line = (label, data, color, opts = {}) => ({
      type: 'line', label, data, borderColor: color, backgroundColor: color,
      borderWidth: 1.5, pointRadius: 2, tension: 0.3, spanGaps: true, ...opts,
    })
    const axes = extra => ({
      x: { grid: { display: false }, stacked: true },
      y: { grid: { color: C.grid }, stacked: true, beginAtZero: true },
      ...extra,
    })

    const metricLabel = METRICS.find(m => m.id === this._metric).label

    this.chart('hero', {
      data: {
        labels: d.buckets,
        datasets: [
          line(metricLabel, d.lines[this._metric], C.line,
               { yAxisID: 'y1', borderWidth: 2, pointRadius: 3 }),
          { label: 'kiro',   data: d.sessions.kiro,   backgroundColor: C.kiro },
          { label: 'claude', data: d.sessions.claude, backgroundColor: C.claude },
          { label: 'codex',  data: d.sessions.codex,  backgroundColor: C.codex },
        ],
      },
      type: 'bar',
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: axes({
          y:  { stacked: true, beginAtZero: true, grid: { color: C.grid },
                title: { display: true, text: 'sessions' } },
          y1: { position: 'right', beginAtZero: true, grid: { display: false },
                title: { display: true, text: metricLabel } },
        }),
      },
    })

    this.chart('claude', {
      type: 'line',
      data: { labels: d.buckets, datasets: [
        line('in',          d.claude.input,       C.blue),
        line('out',         d.claude.output,      C.green),
        line('cache read',  d.claude.cache_read,  C.yellow),
        line('cache write', d.claude.cache_write, C.orange),
      ]},
      options: { responsive: true, maintainAspectRatio: false,
                 scales: { x: { grid: { display: false } },
                           y: { grid: { color: C.grid }, beginAtZero: true } } },
    })

    this.chart('codex', {
      type: 'line',
      data: { labels: d.buckets, datasets: [
        line('total tokens', d.codex.total,     C.blue),
        line('reasoning',    d.codex.reasoning, C.magenta),
      ]},
      options: { responsive: true, maintainAspectRatio: false,
                 scales: { x: { grid: { display: false } },
                           y: { grid: { color: C.grid }, beginAtZero: true } } },
    })

    this.chart('kiro', {
      type: 'line',
      data: { labels: d.buckets, datasets: [
        line('cycles',    d.kiro.cycles,      C.kiro),
        line('avg ctx %', d.kiro.avg_ctx_pct, C.cyan, { yAxisID: 'y1' }),
      ]},
      options: { responsive: true, maintainAspectRatio: false,
                 scales: { x: { grid: { display: false } },
                           y:  { grid: { color: C.grid }, beginAtZero: true },
                           y1: { position: 'right', beginAtZero: true, max: 100,
                                 grid: { display: false },
                                 ticks: { callback: v => v + '%' } } } },
    })
  }

  chart(id, config) {
    const canvas = this.querySelector(`#chart-${id}`)
    if (canvas) this._charts.push(new Chart(canvas, config))
  }

  render() {
    return asyncView({ loading: !this._data && !this._error, error: this._error },
      () => this._renderCharts())
  }

  _renderCharts() {
    const toggleCls = active => `px-2 py-0.5 rounded font-mono text-xs cursor-pointer border transition-colors
      ${active ? 'border-edge-strong bg-surface2 text-fg' : 'border-edge text-dim hover:text-muted'}`

    return html`
      <div class="p-6 flex flex-col gap-6">

        <!-- Hero: activity across providers -->
        <div class="bg-surface border border-edge rounded-xl p-5">
          <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div class="text-xs text-dim uppercase tracking-widest">Activity by provider</div>
            <div class="flex items-center gap-3">
              <div class="flex gap-1">
                ${BUCKETS.map(b => html`
                  <button class=${toggleCls(this._bucket === b)} @click=${() => this.setBucket(b)}>${b}</button>
                `)}
              </div>
              <select
                .value=${this._metric}
                @change=${e => this.setMetric(e.target.value)}
                class="bg-inset border border-edge-strong text-muted rounded px-1.5 py-0.5 cursor-pointer font-mono text-xs"
              >
                ${METRICS.map(m => html`<option value=${m.id} ?selected=${this._metric === m.id}>line: ${m.label}</option>`)}
              </select>
            </div>
          </div>
          <div class="h-[320px]"><canvas id="chart-hero"></canvas></div>
        </div>

        <!-- Provider-native panels: each shows only what that provider records -->
        <div class="grid gap-6 md:grid-cols-3">
          ${[
            ['claude', 'claude — tokens & cache', C.claude],
            ['codex',  'codex — tokens',          C.codex],
            ['kiro',   'kiro — cycles & context', C.kiro],
          ].map(([id, title, color]) => html`
            <div class="bg-surface border border-edge rounded-xl p-5">
              <div class="text-xs uppercase tracking-widest mb-4" style="color:${color}">${title}</div>
              <div class="h-[200px]"><canvas id="chart-${id}"></canvas></div>
            </div>
          `)}
        </div>

      </div>
    `
  }
}

customElements.define('analytics-page', AnalyticsPage)
