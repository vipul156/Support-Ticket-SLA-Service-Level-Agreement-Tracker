// Timestamps are stored and transported as UTC ISO 8601; all display happens
// in the viewer's local timezone via Intl.
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

export function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes)
  const days = Math.floor(abs / (60 * 24))
  const hours = Math.floor((abs % (60 * 24)) / 60)
  const mins = abs % 60
  const sign = minutes < 0 ? '-' : ''
  if (days > 0) return `${sign}${days}d ${hours}h`
  if (hours > 0) return `${sign}${hours}h ${mins}m`
  return `${sign}${mins}m`
}
