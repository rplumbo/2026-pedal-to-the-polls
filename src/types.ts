export type EventStatus = 'confirmed' | 'tentative' | 'none'
export type CoordinateSource = 'provided' | 'route-approximate'

export interface RouteGeometry {
  type: 'LineString'
  coordinates: [number, number][]
}

export interface RideRoute {
  id: string
  order: number
  title: string
  leg: string
  dateRange: {
    startDate: string
    endDate: string
  }
  color: string
  geometry: RouteGeometry
  bounds: [[number, number], [number, number]]
  distanceMiles: number
  geometryQuality: 'track' | 'sparse-cue-route'
  source?: {
    file: string
    url?: string
    sourceGeometry: 'track' | 'route'
    sourcePointCount: number
    renderedPointCount: number
  }
}

export interface RideEvent {
  id: string
  number: number
  date: string
  title: string
  description: string
  timeLabel?: string | null
  venue?: string | null
  address?: string | null
  city: string
  coordinates: [number, number]
  coordinateSource: CoordinateSource
  status: Exclude<EventStatus, 'none'>
  url?: string | null
}

export interface Sponsor {
  id: string
  name: string
  shortName: string
  level: string
  tier: 'lead' | 'supporting'
  monogram: string
  url?: string
  logoUrl?: string
}

export interface StopSponsor {
  sponsorId: string
  label?: string
}

export interface DonationPageContent {
  eyebrow: string
  title: string
  description: string
  additionalParagraphs?: string[]
  contact?: {
    name: string
    title: string
    email: string
    phone: string
  }
}

export interface ExperienceContent {
  sponsors: Sponsor[]
  stopSponsors: Record<string, StopSponsor>
  donationPages: {
    personal: DonationPageContent
    business: DonationPageContent
  }
}

export interface TimelineEntry {
  id: string
  order: number
  dateLabel: string
  startDate: string
  endDate?: string
  routeId: string
  week?: number
  from: string
  to: string
  miles: number | null
  milesLabel: string
  district?: string
  eventStatus: EventStatus
  event?: RideEvent
}

export interface AppStats {
  campaignMiles: number
  campaignDays: number
  eventCount: number
  confirmedEventCount: number
  tentativeEventCount: number
  routeCount: number
  timelineEntryCount: number
  routeDistanceMiles: number
  listedMiles: number
}

export interface AppMeta {
  title: string
  subtitle?: string
  startDate: string
  endDate: string
  dateRange: string
  timezone: string
  generatedAt: string
  source: {
    timeline: {
      kind: 'local' | 'local-fallback' | 'remote'
      label: string
    }
    timelineSha256: string
    routeManifest: string
  }
  warnings: string[]
}

export interface AppData {
  meta: AppMeta
  stats: AppStats
  routes: RideRoute[]
  timeline: TimelineEntry[]
}
