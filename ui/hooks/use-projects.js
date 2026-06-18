import { getJson } from '../lib/api.js'

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
      this.projects = await getJson('/projects')
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}
