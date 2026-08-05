import { useEffect, useMemo, useRef } from 'react'
import { ArrowRightIcon, RouteIcon } from '../icons'
import { formatDateRange } from '../lib/format'
import type { RideRoute, Sponsor, StopSponsor, TimelineEntry } from '../types'
import { SponsorLogo } from './SponsorLogo'

interface TimelineProps {
  routes: RideRoute[]
  entries: TimelineEntry[]
  selectedRouteId: string | null
  selectedEventId: string | null
  onSelectEvent: (eventId: string) => void
  onSelectRoute: (routeId: string) => void
  revealEventId: string | null
  sponsors: Sponsor[]
  stopSponsors: Record<string, StopSponsor>
}

interface TimelineGroup {
  route: RideRoute
  entries: TimelineEntry[]
}

function TimelineCard({
  entry,
  route,
  isSelected,
  onSelectEvent,
  sponsor,
  sponsorLabel,
}: {
  entry: TimelineEntry
  route: RideRoute
  isSelected: boolean
  onSelectEvent: (eventId: string) => void
  sponsor?: Sponsor
  sponsorLabel?: string
}) {
  const content = (
    <>
      <div className="timeline-card__date">
        <time dateTime={entry.startDate}>
          {formatDateRange(entry.startDate, entry.endDate)}
        </time>
        <span className="timeline-card__day">Day {entry.order}</span>
      </div>

      <div className="timeline-card__route">
        <strong>{entry.from}</strong>
        <ArrowRightIcon />
        <strong>{entry.to || 'Rest day'}</strong>
      </div>

      <div className="timeline-card__meta">
        <span>{entry.milesLabel || 'Mileage not listed'}</span>
        {entry.district && <span>{entry.district}</span>}
      </div>

      {entry.event && (
        <div className="timeline-card__event">
          <div className="timeline-card__event-heading">
            <span className="event-number" aria-hidden="true">
              {entry.event.number}
            </span>
            <div>
              <span className="status-label">
                {isSelected ? 'Selected stop' : 'Event stop'}
              </span>
              <h3>{entry.event.title}</h3>
            </div>
          </div>
          {isSelected && (
            <span className="timeline-card__map-cue" aria-hidden="true">
              <span>Showing on map</span>
              <ArrowRightIcon />
            </span>
          )}
          {sponsor && (
            <div className="timeline-card__sponsor">
              <span>{sponsorLabel ?? 'Stop partner'}</span>
              <SponsorLogo sponsor={sponsor} />
            </div>
          )}
        </div>
      )}
    </>
  )

  if (entry.event) {
    return (
      <article
        id={`schedule-${entry.event.id}`}
        className={`timeline-card timeline-card--event${isSelected ? ' is-selected' : ''}`}
        style={{ '--route-color': route.color } as React.CSSProperties}
      >
        <button
          type="button"
          className="timeline-card__hit"
          onClick={() => onSelectEvent(entry.event!.id)}
          aria-label={`${isSelected ? 'Clear' : 'Select'} ${entry.event.title} on map`}
          aria-pressed={isSelected}
          aria-controls={isSelected ? 'map-event-details' : undefined}
        />
        {content}
      </article>
    )
  }

  return (
    <article
      className="timeline-card"
      style={{ '--route-color': route.color } as React.CSSProperties}
    >
      {content}
    </article>
  )
}

export function Timeline({
  routes,
  entries,
  selectedRouteId,
  selectedEventId,
  onSelectEvent,
  onSelectRoute,
  revealEventId,
  sponsors,
  stopSponsors,
}: TimelineProps) {
  const hasScrolledToReveal = useRef<string | null>(null)

  const groups = useMemo(() => {
    const grouped = new Map<string, TimelineEntry[]>()
    for (const entry of entries) {
      const group = grouped.get(entry.routeId) ?? []
      group.push(entry)
      grouped.set(entry.routeId, group)
    }

    return routes
      .map((route): TimelineGroup => ({ route, entries: grouped.get(route.id) ?? [] }))
      .filter((group) => group.entries.length > 0)
  }, [entries, routes])

  useEffect(() => {
    if (!revealEventId || hasScrolledToReveal.current === revealEventId) {
      return
    }
    const element = document.getElementById(`schedule-${revealEventId}`)
    if (element) {
      element.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'center',
      })
      element
        .querySelector<HTMLButtonElement>('.timeline-card__hit')
        ?.focus({ preventScroll: true })
      hasScrolledToReveal.current = revealEventId
    }
  }, [revealEventId])

  useEffect(() => {
    if (!selectedRouteId) return

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`route-${selectedRouteId}`)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [selectedRouteId])

  if (groups.length === 0) {
    return (
      <div className="timeline-empty">
        <RouteIcon />
        <h2>No ride days match this view.</h2>
        <p>Choose another route leg or show the full schedule.</p>
      </div>
    )
  }

  return (
    <ol className="timeline" aria-label="Ride schedule">
      {groups.map(({ route, entries: groupEntries }) => (
        <li
          className={`timeline-group${
            selectedRouteId && selectedRouteId !== route.id
              ? ' is-deemphasized'
              : ''
          }`}
          key={route.id}
          id={`route-${route.id}`}
        >
          <h2 className="timeline-group__title">
            <button
              type="button"
              className="timeline-group__heading"
              onClick={() => onSelectRoute(route.id)}
            >
              <span
                className="timeline-group__number"
                style={{ backgroundColor: route.color }}
                aria-hidden="true"
              >
                {route.order}
              </span>
              <span>
                <small>{route.leg}</small>
                <strong>{route.title}</strong>
                <em>{formatDateRange(route.dateRange.startDate, route.dateRange.endDate)}</em>
              </span>
            </button>
          </h2>
          <ol>
            {groupEntries.map((entry) => (
              <li key={entry.id}>
                <TimelineCard
                  entry={entry}
                  route={route}
                  isSelected={entry.event?.id === selectedEventId}
                  onSelectEvent={onSelectEvent}
                  sponsor={entry.event ? sponsors.find((sponsor) => sponsor.id === stopSponsors[entry.event!.id]?.sponsorId) : undefined}
                  sponsorLabel={entry.event ? stopSponsors[entry.event.id]?.label : undefined}
                />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}
