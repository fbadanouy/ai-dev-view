/*  api.js — the single source of the backend base URL and JSON fetch helpers.
 *  Every component/hook goes through here instead of hardcoding the host. */

export const API_BASE = 'http://localhost:8765/api'

const toUrl = path => (path.startsWith('http') ? path : `${API_BASE}${path}`)

export async function getJson(path) {
  const res = await fetch(toUrl(path))
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export async function postJson(path, body) {
  const res = await fetch(toUrl(path), {
    method: 'POST',
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}
