import { getJson } from '../lib/api.js'

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
      this.skills = await getJson('/skills')
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}
