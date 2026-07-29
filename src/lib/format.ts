const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'America/Chicago',
})

const longDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'America/Chicago',
})

function asLocalNoon(isoDate: string) {
  return new Date(`${isoDate}T12:00:00-05:00`)
}

export function formatDate(isoDate: string) {
  return longDate.format(asLocalNoon(isoDate))
}

export function formatDateRange(startDate: string, endDate?: string) {
  if (!endDate || startDate === endDate) {
    return formatDate(startDate)
  }
  return `${shortDate.format(asLocalNoon(startDate))}–${shortDate.format(asLocalNoon(endDate))}`
}

export function formatMiles(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}
