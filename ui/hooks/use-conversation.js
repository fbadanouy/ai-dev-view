const API = 'http://localhost:8765/api'

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/* Loads a session's conversation: messages + tool calls (joined by
   tool_use_id) + per-turn metrics for the turns graph. */
export class ConversationController {
  messages     = []
  toolCalls    = []
  toolCallById = new Map()
  turns        = []
  loading      = false
  error        = null
  _sessionId   = null

  constructor(host) {
    this.host = host
    host.addController(this)
  }

  hostConnected() {}

  async load(sessionId) {
    if (!sessionId || sessionId === this._sessionId) return
    this._sessionId = sessionId
    this.loading = true
    this.error   = null
    this.messages = []
    this.toolCalls = []
    this.turns = []
    this.host.requestUpdate()
    try {
      const [messages, toolCalls, turns] = await Promise.all([
        getJson(`${API}/session/${sessionId}/messages`),
        getJson(`${API}/session/${sessionId}/tool-calls`),
        getJson(`${API}/session/${sessionId}/turn-details`),
      ])
      if (this._sessionId !== sessionId) return  // stale response, a newer load won
      this.messages     = messages
      this.toolCalls    = toolCalls
      this.toolCallById = new Map(toolCalls.map(tc => [tc.tool_use_id, tc]))
      this.turns        = turns
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}

/* Full input + result payload for one tool call — fetched only on demand. */
export function fetchFullToolResult(sessionId, toolUseId) {
  return getJson(`${API}/session/${sessionId}/tool-result/${toolUseId}`)
}
