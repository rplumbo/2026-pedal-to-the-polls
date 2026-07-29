import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Timeline } from './components/Timeline'
import { loadAppData } from './data'
import {
  CalendarIcon,
  MapIcon,
  RouteIcon,
  ScheduleIcon,
  TrailMark,
} from './icons'
import { formatMiles } from './lib/format'
import type { AppData } from './types'

type MobileView = 'schedule' | 'map'

const MapPanel = lazy(() =>
  import('./components/MapPanel').then((module) => ({ default: module.MapPanel })),
)

function readHashSelection() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return {
    eventId: params.get('event'),
    routeId: params.get('route'),
  }
}

function writeHash(eventId: string | null, routeId: string | null) {
  const params = new URLSearchParams()
  if (eventId) params.set('event', eventId)
  if (routeId) params.set('route', routeId)
  const hash = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`)
}

function LoadingState() {
  return (
    <main className="loading-state" aria-live="polite">
      <TrailMark />
      <span>Loading the ride…</span>
    </main>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="error-state">
      <span className="eyebrow">Something went off route</span>
      <h1>The ride schedule could not be loaded.</h1>
      <p>{message}</p>
      <button className="primary-button" type="button" onClick={() => window.location.reload()}>
        Try again
      </button>
    </main>
  )
}

function App() {
  const initialHash = useMemo(readHashSelection, [])
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('schedule')
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(initialHash.routeId)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialHash.eventId)
  const [revealEventId, setRevealEventId] = useState<string | null>(initialHash.eventId)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [hasOpenedMap, setHasOpenedMap] = useState(
    () => !window.matchMedia('(max-width: 760px)').matches,
  )

  useEffect(() => {
    const controller = new AbortController()
    loadAppData(controller.signal).then(setData).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'An unexpected data error occurred.')
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => {
      setIsMobile(query.matches)
      if (!query.matches) setHasOpenedMap(true)
    }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const syncSelectionFromHash = () => {
      const selection = readHashSelection()
      setSelectedRouteId(selection.routeId)
      setSelectedEventId(selection.eventId)
      setRevealEventId(selection.eventId)
    }
    window.addEventListener('hashchange', syncSelectionFromHash)
    return () => window.removeEventListener('hashchange', syncSelectionFromHash)
  }, [])

  useEffect(() => {
    if (!data) return
    if (selectedRouteId && !data.routes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(null)
    }
    const selectedEventEntry = selectedEventId
      ? data.timeline.find((entry) => entry.event?.id === selectedEventId)
      : undefined
    if (selectedEventId && !selectedEventEntry) {
      setSelectedEventId(null)
      setRevealEventId(null)
    } else if (
      selectedEventEntry &&
      selectedRouteId &&
      selectedEventEntry.routeId !== selectedRouteId
    ) {
      setSelectedRouteId(null)
    }
  }, [data, selectedEventId, selectedRouteId])

  useEffect(() => {
    writeHash(selectedEventId, selectedRouteId)
  }, [selectedEventId, selectedRouteId])

  const handleSelectRoute = useCallback((routeId: string) => {
    setSelectedRouteId((current) => (current === routeId ? null : routeId))
    setSelectedEventId(null)
    setRevealEventId(null)
  }, [])

  const handleSelectEvent = useCallback((eventId: string) => {
    const entry = data?.timeline.find((candidate) => candidate.event?.id === eventId)
    if (entry) {
      setSelectedRouteId((current) =>
        current && current !== entry.routeId ? null : current,
      )
    }
    setSelectedEventId((current) => (current === eventId ? null : eventId))
    setRevealEventId(null)
  }, [data])

  if (error) return <ErrorState message={error} />
  if (!data) return <LoadingState />

  const activeEntry = data.timeline.find((entry) => entry.event?.id === selectedEventId)
  const mapRouteId = selectedRouteId ?? activeEntry?.routeId ?? null

  const updatedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: data.meta.timezone,
  }).format(new Date(data.meta.generatedAt))

  const showEventInSchedule = (eventId: string) => {
    const entry = data.timeline.find((candidate) => candidate.event?.id === eventId)
    if (entry && selectedRouteId && selectedRouteId !== entry.routeId) {
      setSelectedRouteId(null)
    }
    setSelectedEventId(eventId)
    setRevealEventId(eventId)
    setMobileView('schedule')
  }

  return (
    <div className={`app-shell app-shell--${mobileView}`}>
      <header className="masthead">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Pedal to the Polls home">
          <TrailMark className="brand__mark" />
          <span>
            <small>2026</small>
            <strong>Pedal to the Polls</strong>
          </span>
        </a>

        <div className="masthead__date">
          <CalendarIcon />
          <span>{data.meta.dateRange}</span>
        </div>

        <nav className="mobile-view-switcher" aria-label="Choose schedule or map view">
          <button
            type="button"
            className={mobileView === 'schedule' ? 'is-active' : ''}
            onClick={() => setMobileView('schedule')}
            aria-pressed={mobileView === 'schedule'}
          >
            <ScheduleIcon />
            Schedule
          </button>
          <button
            type="button"
            className={mobileView === 'map' ? 'is-active' : ''}
            onClick={() => {
              setHasOpenedMap(true)
              setMobileView('map')
            }}
            aria-pressed={mobileView === 'map'}
          >
            <MapIcon />
            Map
          </button>
        </nav>

        <span className="masthead__mission">Minnesota miles for the Boundary Waters</span>
      </header>

      <main id="main-content" className="workspace">
        <aside className="schedule-panel" aria-label="Ride overview and schedule">
          <section className="ride-intro">
            <span className="eyebrow">Ride across Minnesota</span>
            <h1>Miles for the water.</h1>
            <p>
              Follow a six-leg ride from Ely to Stillwater—and find the community
              gatherings happening along the way.
            </p>
            <p className="ride-intro__dates">
              <CalendarIcon />
              {data.meta.dateRange}
            </p>

            <dl className="ride-stats">
              <div>
                <dt>Miles</dt>
                <dd>{formatMiles(data.stats.campaignMiles)}</dd>
              </div>
              <div>
                <dt>Ride days</dt>
                <dd>{data.stats.campaignDays}</dd>
              </div>
              <div>
                <dt>Event stops</dt>
                <dd>{data.stats.eventCount}</dd>
              </div>
            </dl>
          </section>

          <section className="schedule-controls" aria-label="Route leg selection">
            <div className="schedule-controls__heading">
              <div>
                <span className="eyebrow">The journey</span>
                <h2>Choose a route leg</h2>
              </div>
            </div>

            <div className="route-chips" aria-label="Route legs">
              <button
                type="button"
                className={!selectedRouteId ? 'is-active' : ''}
                onClick={() => {
                  setSelectedRouteId(null)
                  setSelectedEventId(null)
                  setRevealEventId(null)
                }}
                aria-pressed={!selectedRouteId}
                aria-label="Show the full ride"
              >
                <RouteIcon />
                Full ride
              </button>
              {data.routes.map((route) => (
                <button
                  type="button"
                  key={route.id}
                  className={selectedRouteId === route.id ? 'is-active' : ''}
                  onClick={() => handleSelectRoute(route.id)}
                  aria-pressed={selectedRouteId === route.id}
                  aria-label={`${route.leg}: ${route.title}`}
                  title={route.title}
                >
                  <i style={{ backgroundColor: route.color }} aria-hidden="true" />
                  {route.leg}
                </button>
              ))}
            </div>
          </section>

          <section className="timeline-section" aria-label="Chronological ride timeline">
            <Timeline
              routes={data.routes}
              entries={data.timeline}
              selectedRouteId={selectedRouteId}
              selectedEventId={selectedEventId}
              onSelectEvent={handleSelectEvent}
              onSelectRoute={handleSelectRoute}
              revealEventId={revealEventId}
            />
          </section>

          <footer className="schedule-footer">
            <p>
              <strong>Plan with care.</strong> The route and event details are preliminary,
              subject to change, and not intended for turn-by-turn navigation.
            </p>
            <details>
              <summary>About this schedule</summary>
              <p>
                Event pins without published coordinates are placed approximately along the
                route near the named city. Confirm the venue before attending. Times are
                shown in Central Time.
              </p>
              <p>Schedule snapshot: {updatedDate}</p>
            </details>
          </footer>
        </aside>

        <div className="map-region">
          {(!isMobile || hasOpenedMap) && (
            <Suspense
              fallback={
                <div className="map-loading" role="status">
                  <TrailMark />
                  <span>Loading the map…</span>
                </div>
              }
            >
              <MapPanel
                routes={data.routes}
                timeline={data.timeline}
                isVisible={!isMobile || mobileView === 'map'}
                selectedRouteId={mapRouteId}
                selectedEventId={selectedEventId}
                onSelectRoute={handleSelectRoute}
                onSelectEvent={handleSelectEvent}
                onShowFullRoute={() => {
                  setSelectedRouteId(null)
                  setSelectedEventId(null)
                  setRevealEventId(null)
                }}
                onClearEvent={() => setSelectedEventId(null)}
                onShowSchedule={showEventInSchedule}
              />
            </Suspense>
          )}
        </div>
      </main>

      <div className="sr-only" aria-live="polite">
        {activeEntry?.event
          ? `Selected ${activeEntry.event.title} in ${activeEntry.event.city}.`
          : 'No event selected.'}
      </div>
    </div>
  )
}

export default App
