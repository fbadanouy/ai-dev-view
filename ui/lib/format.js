export function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString()
}

export function fmtDuration(secs) {
  if (secs == null) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function timeAgo(iso) {
  if (!iso) return null
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 60) return 'just now'
  const units = [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']]
  for (const [span, label] of units) {
    if (secs >= span) return `${Math.floor(secs / span)}${label} ago`
  }
}

export function fmtBytes(n) {
  if (n == null) return null
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function fmtTokens(n) {
  if (n == null) return '—'
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}
