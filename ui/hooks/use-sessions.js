import { getJson } from '../lib/api.js'

function computeMaxes(sessions) {
  const pluck = key => Math.max(0, ...sessions.map(s => s[key] || 0))
  return {
    messages:              pluck('messages'),
    tool_uses:             pluck('tool_uses'),
    cycles:                pluck('cycles'),
    request_count:         pluck('request_count'),
    tool_error_count:      pluck('tool_error_count'),
    input_tokens:                   pluck('input_tokens'),
    output_tokens:                  pluck('output_tokens'),
    cache_read_tokens:              pluck('cache_read_tokens'),
    cache_creation_tokens:          pluck('cache_creation_tokens'),
    codex_input_tokens:             pluck('codex_input_tokens'),
    codex_output_tokens:            pluck('codex_output_tokens'),
    codex_cached_input_tokens:      pluck('codex_cached_input_tokens'),
    codex_reasoning_output_tokens:  pluck('codex_reasoning_output_tokens'),
    codex_total_tokens:             pluck('codex_total_tokens'),
    request_count:                  pluck('request_count'),
  }
}

export class SessionsController {
  sessions = []
  maxes    = {}
  loading  = true
  error    = null

  constructor(host) {
    this.host = host
    host.addController(this)
  }

  async hostConnected() {
    try {
      this.sessions = await getJson('/sessions')
      this.maxes    = computeMaxes(this.sessions)
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}
