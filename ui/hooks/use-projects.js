const API = 'http://localhost:8765/api'

async function getJson(u) {
  const r = await fetch(u)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export class ProjectsController {
  projects = []
  loading  = true
  error    = null

  constructor(host) {
    this.host = host
    host.addController(this)
  }

  async hostConnected() {
    try {
      this.projects = await getJson(`${API}/projects`)
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}
