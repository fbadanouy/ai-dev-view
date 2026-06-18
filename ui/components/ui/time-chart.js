import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4/auto/+esm'
import { provider } from '../../lib/providers.js'

/*  <time-chart>
 *
 *  Reusable Chart.js wrapper — the same chart engine and palette the analytics
 *  page uses, extracted so any page can drop in a time series. Handles the
 *  Chart lifecycle (create / update / destroy) so callers just pass data.
 *
 *  Props:
 *    type      String   Chart.js type (default 'bar'); per-dataset `type` wins
 *    labels    Array    x-axis labels
 *    datasets  Array    Chart.js dataset configs
 *    options   Object   merged over sensible time-series defaults
 *    height    Number   px height of the canvas box (default 240)
 */

// Shared chart palette. Provider colors come from the single source
// (lib/providers.js); the rest are chart-only accents not tied to a provider.
export const CHART_COLORS = {
  kiro:   provider('kiro').color,
  claude: provider('claude').color,
  codex:  provider('codex').color,
  line:   '#b58900', grid: 'rgba(147, 161, 161, 0.12)', text: '#93a1a1',
  blue:   '#268bd2', cyan: '#2aa198', green: '#859900', yellow: '#b58900',
  orange: '#d26437', magenta: '#d95294',
}

Chart.defaults.color = CHART_COLORS.text
Chart.defaults.borderColor = CHART_COLORS.grid
Chart.defaults.font.family = "'JetBrains Mono', monospace"
Chart.defaults.font.size = 11

class TimeChart extends LitElement {
  static properties = {
    type:     { type: String },
    labels:   { type: Array },
    datasets: { type: Array },
    options:  { type: Object },
    height:   { type: Number },
  }

  createRenderRoot() { return this }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._chart?.destroy()
    this._chart = null
  }

  updated() { this._draw() }

  _draw() {
    const canvas = this.querySelector('canvas')
    if (!canvas || !this.labels || !this.datasets) return

    const config = {
      type: this.type || 'bar',
      data: { labels: this.labels, datasets: this.datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: CHART_COLORS.grid }, beginAtZero: true },
        },
        ...(this.options || {}),
      },
    }

    if (this._chart) {
      this._chart.data = config.data
      this._chart.options = config.options
      this._chart.update()
    } else {
      this._chart = new Chart(canvas, config)
    }
  }

  render() {
    return html`<div style="height:${this.height || 240}px"><canvas></canvas></div>`
  }
}

customElements.define('time-chart', TimeChart)
