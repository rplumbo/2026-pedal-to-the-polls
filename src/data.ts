import type { AppData } from './types'

function assertAppData(value: unknown): asserts value is AppData {
  if (!value || typeof value !== 'object') {
    throw new Error('The ride data file is empty or invalid.')
  }

  const data = value as Partial<AppData>
  if (!Array.isArray(data.routes) || !Array.isArray(data.timeline) || !data.meta || !data.stats) {
    throw new Error('The ride data file does not match the expected format.')
  }
}

export async function loadAppData(signal?: AbortSignal): Promise<AppData> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/app-data.json`, {
    signal,
    cache: import.meta.env.DEV ? 'no-store' : 'default',
  })

  if (!response.ok) {
    throw new Error(`Could not load the ride schedule (${response.status}).`)
  }

  const value: unknown = await response.json()
  assertAppData(value)
  return value
}
