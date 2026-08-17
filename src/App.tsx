import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { DonatePage } from './components/DonatePage'
import { Timeline } from './components/Timeline'
import { loadAppData, loadExperienceContent } from './data'
import {
  CalendarIcon,
  ChevronDownIcon,
  HeartIcon,
  MapIcon,
  RouteIcon,
  ScheduleIcon,
  TrailMark,
} from './icons'
import { formatMiles } from './lib/format'
import type { AppData, ExperienceContent } from './types'

type MobileView = 'schedule' | 'map'
type PageView = 'map' | 'donate' | 'donate-business'

const MapPanel = lazy(() =>
  import('./components/MapPanel').then((module) => ({ default: module.MapPanel })),
)

function readHashSelection() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const view = params.get('view')
  const page: PageView =
    view === 'donate-business'
      ? 'donate-business'
      : view === 'donate' || view === 'donate-personal'
      ? 'donate'
      : 'map'

  return {
    eventId: params.get('event'),
    routeId: params.get('route'),
    page,
  }
}

function writeHash(eventId: string | null, routeId: string | null, page: PageView) {
  const params = new URLSearchParams()
  if (eventId) params.set('event', eventId)
  if (routeId) params.set('route', routeId)
  if (page !== 'map') params.set('view', page)
  const hash = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`)
}

function centerRoutePickerButton(button: HTMLButtonElement) {
  const picker = button.closest<HTMLElement>('.route-chips')
  if (!picker) return

  const pickerRect = picker.getBoundingClientRect()
  const buttonRect = button.getBoundingClientRect()
  picker.scrollTo({
    left:
      picker.scrollLeft +
      buttonRect.left -
      pickerRect.left -
      (pickerRect.width - buttonRect.width) / 2,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  })
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
  const [experience, setExperience] = useState<ExperienceContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<PageView>(initialHash.page)
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
    Promise.all([loadAppData(controller.signal), loadExperienceContent(controller.signal)])
      .then(([appData, content]) => {
        setData(appData)
        setExperience(content)
      })
      .catch((reason: unknown) => {
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
      setPage(selection.page)
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
    writeHash(selectedEventId, selectedRouteId, page)
  }, [page, selectedEventId, selectedRouteId])

  const handleSelectRoute = useCallback((routeId: string) => {
    setSelectedRouteId((current) => (current === routeId ? null : routeId))
    setSelectedEventId(null)
    setRevealEventId(null)
  }, [])

  const handleSelectEvent = useCallback((eventId: string) => {
    const isSelectingEvent = selectedEventId !== eventId
    const entry = data?.timeline.find((candidate) => candidate.event?.id === eventId)
    if (entry) {
      setSelectedRouteId((current) =>
        current && current !== entry.routeId ? null : current,
      )
    }
    setSelectedEventId(isSelectingEvent ? eventId : null)
    setRevealEventId(null)
    if (isSelectingEvent && isMobile) {
      setHasOpenedMap(true)
      setMobileView('map')
    }
  }, [data, isMobile, selectedEventId])

  if (error) return <ErrorState message={error} />
  if (!data || !experience) return <LoadingState />

  const activeEntry = data.timeline.find((entry) => entry.event?.id === selectedEventId)
  const mapRouteId = selectedRouteId ?? activeEntry?.routeId ?? null

  const updatedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: data.meta.timezone,
  }).format(new Date(data.meta.generatedAt))
  const presentingSponsor = experience.sponsors.find(
    (sponsor) => sponsor.id === experience.presentingSponsorId,
  )

  if (!presentingSponsor) {
    return <ErrorState message="The presenting sponsor is missing from the sponsor content." />
  }

  const showDonationPage = page !== 'map'

  return (
    <div className={`app-shell app-shell--${mobileView}${showDonationPage ? ' app-shell--donate' : ''}`}>
      <header className="masthead">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Pedal to the Polls home">
          <img
            className="brand__logo"
            src={`${import.meta.env.BASE_URL}images/STBWAF%20Logo_white.png.avif`}
            alt=""
          />
        </a>

        <div className="masthead__date">
          <CalendarIcon />
          <span>{data.meta.dateRange}</span>
        </div>

        {!showDonationPage && <nav className="mobile-view-switcher" aria-label="Choose schedule or map view">
          <button
            type="button"
            className={mobileView === 'schedule' ? 'is-active' : ''}
            onClick={() => setMobileView('schedule')}
            aria-pressed={mobileView === 'schedule'}
            aria-label="Show schedule"
            title="Schedule"
          >
            <ScheduleIcon />
            <span>Schedule</span>
          </button>
          <button
            type="button"
            className={mobileView === 'map' ? 'is-active' : ''}
            onClick={() => {
              setHasOpenedMap(true)
              setMobileView('map')
            }}
            aria-pressed={mobileView === 'map'}
            aria-label="Show map"
            title="Map"
          >
            <MapIcon />
            <span>Map</span>
          </button>
        </nav>}

        <div className="masthead__actions">
          <span className="masthead__mission">Minnesota miles for the Boundary Waters</span>
          <button
            type="button"
            className="masthead__donate"
            onClick={() => setPage('donate')}
            aria-current={page === 'donate' || page === 'donate-business' ? 'page' : undefined}
          >
            <HeartIcon />
            <span>Donate</span>
          </button>
        </div>
      </header>

      {showDonationPage ? (
        <DonatePage
          kind={page === 'donate-business' ? 'business' : 'personal'}
          donationPages={experience.donationPages}
          presentingSponsor={presentingSponsor}
          onShowMap={() => setPage('map')}
          onShowBusiness={() => setPage('donate-business')}
          onShowPersonal={() => setPage('donate')}
        />
      ) : (
      <main id="main-content" className="workspace">
        <aside className="schedule-panel" aria-label="Ride overview and schedule">
          <section className="ride-intro">
            <span className="eyebrow">Ride across Minnesota</span>
            <h1>Pedal to the Polls</h1>
            <p>
              <span className="ride-intro__riders">
                <img
                  src="https://www.dropbox.com/scl/fi/t62586ikmzsds6ythxvsw/20160621_6D_NJP_IMG_4132.jpg?rlkey=dzc0vb2k85v2eoyejcehlr5ur&raw=1"
                  alt="Amy and Dave Freeman in the Boundary Waters"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <span>Amy &amp; Dave Freeman</span>
              </span>
              Follow National Geographic Adventurer of the Year 2014 Amy Freeman and her husband Dave as they ride across the State to encourage Minnesotans to get out and vote for Boundary Waters champions this midterm! Amy and Dave are biking (with a canoe in tow) across the state of Minnesota to raise awareness for Boundary Waters permanent protection, and how Minnesota can act to safeguard this special place, forever.
            </p>
            <div className="ride-intro__actions">
              <details className="ride-intro__more">
                <summary>
                  <span className="ride-intro__more-logo" aria-hidden="true">
                    <img
                      src={`${import.meta.env.BASE_URL}images/STBWAF%20Logo_white.png.avif`}
                      alt=""
                    />
                  </span>
                  <span className="ride-intro__more-copy">
                    <strong>About the Action Fund</strong>
                    <small>Turning Boundary Waters protection into action at the ballot box.</small>
                    <span className="ride-intro__more-cue">
                      <span className="ride-intro__more-closed">Learn about our work</span>
                      <span className="ride-intro__more-open">Show less</span>
                      <ChevronDownIcon />
                    </span>
                  </span>
                </summary>
                <div>
                  <p>
                    The Save the Boundary Waters Action Fund is a 501c(4) organization dedicated to permanently protecting the Boundary Waters Canoe Area Wilderness from toxic copper-nickel mining proposed in its watershed. Save the Boundary Waters Action Fund endorses candidates committed to supporting permanent protection legislation, meets with lawmakers, works to make Boundary Waters protection a winning electoral issue, and provides grassroots support to endorsed Boundary Waters champions through a robust door knocking and volunteer program. The mission of Save the Boundary Waters Action Fund is to ensure Minnesota elects Boundary Waters champions who will protect this special and unique place, forever.
                  </p>
                </div>
              </details>
            </div>
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

          <section id="route-navigator" className="schedule-controls" aria-label="Route leg selection">
            <div className="schedule-controls__heading">
              <div>
                <span className="eyebrow">The journey</span>
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
                  onClick={(event) => {
                    handleSelectRoute(route.id)
                    centerRoutePickerButton(event.currentTarget)
                  }}
                  aria-pressed={selectedRouteId === route.id}
                  aria-label={`${route.leg}: ${route.title}`}
                  title={route.title}
                >
                  <i style={{ backgroundColor: route.color }} aria-hidden="true" />
                  <span>{route.title}</span>
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
              sponsors={experience.sponsors}
              stopSponsors={experience.stopSponsors}
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
                onClearEvent={() => setSelectedEventId(null)}
                sponsors={experience.sponsors}
                presentingSponsorId={experience.presentingSponsorId}
                stopSponsors={experience.stopSponsors}
              />
            </Suspense>
          )}
        </div>
      </main>
      )}

      {!showDonationPage && (
        <button className="support-ride-button" type="button" onClick={() => setPage('donate')}>
          <HeartIcon />
          Support the ride
        </button>
      )}

      <div className="sr-only" aria-live="polite">
        {activeEntry?.event
          ? `Selected ${activeEntry.event.title} in ${activeEntry.event.city}.`
          : 'No event selected.'}
      </div>
    </div>
  )
}

export default App
