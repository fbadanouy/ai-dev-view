const API = 'http://localhost:8765/api'

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/* Loads configured skills merged with their usage analytics. */
export class SkillsController {
  skills  = []
  loading = true
  error   = null

  constructor(host) {
    this.host = host
    host.addController(this)
  }

  async hostConnected() {
    try {
      const [skills, analytics] = await Promise.all([
        getJson(`${API}/skills`),
        getJson(`${API}/analytics/skills`),
      ])
      const byName = new Map(analytics.map(a => [a.skill_name, a]))
      this.skills = skills.map(s => ({
        ...s,
        ...(byName.get(s.skill_name) ?? { sessions_used: 0, total_uses: 0, last_used: null }),
      }))
      this.skills.sort((a, b) => (b.sessions_used ?? 0) - (a.sessions_used ?? 0))
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}
