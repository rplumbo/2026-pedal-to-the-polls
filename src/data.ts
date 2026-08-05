import type { AppData, ExperienceContent } from './types'

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

function assertExperienceContent(value: unknown): asserts value is ExperienceContent {
  if (!value || typeof value !== 'object') {
    throw new Error('The sponsor and donation content file is empty or invalid.')
  }

  const content = value as Partial<ExperienceContent>
  if (
    !Array.isArray(content.sponsors) ||
    !content.presentingSponsorId ||
    !content.stopSponsors ||
    !content.donationPages?.personal ||
    !content.donationPages.business
  ) {
    throw new Error('The sponsor and donation content file does not match the expected format.')
  }
}

export async function loadExperienceContent(signal?: AbortSignal): Promise<ExperienceContent> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/experience-content.json`, {
    signal,
    cache: import.meta.env.DEV ? 'no-store' : 'default',
  })

  if (!response.ok) {
    throw new Error(`Could not load sponsor and donation content (${response.status}).`)
  }

  const value: unknown = await response.json()
  assertExperienceContent(value)
  return value
}
