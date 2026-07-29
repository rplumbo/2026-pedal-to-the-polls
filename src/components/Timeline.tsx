import { useEffect, useMemo, useRef } from 'react'
import { ArrowRightIcon, LocationIcon, RouteIcon, TimeIcon } from '../icons'
import { formatDateRange } from '../lib/format'
import type { RideRoute, TimelineEntry } from '../types'

interface TimelineProps {
  routes: RideRoute[]
  entries: TimelineEntry[]
  selectedRouteId: string | null
  selectedEventId: string | null
  onSelectEvent: (eventId: string) => void
  onSelectRoute: (routeId: string) => void
  revealEventId: string | null
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
}: {
  entry: TimelineEntry
  route: RideRoute
  isSelected: boolean
  onSelectEvent: (eventId: string) => void
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
              <span className="status-label">Event stop</span>
              <h3>{entry.event.title}</h3>
            </div>
          </div>

          <div
            id={`event-details-${entry.event.id}`}
            className="timeline-card__event-details"
          >
            <p>{entry.event.description}</p>
            <div className="event-facts">
              <span>
                <LocationIcon />
                {[entry.event.venue, entry.event.city].filter(Boolean).join(' · ')}
              </span>
              {entry.event.address && <span className="event-address">{entry.event.address}</span>}
              {entry.event.timeLabel && (
                <span>
                  <TimeIcon />
                  {entry.event.timeLabel} CT
                </span>
              )}
            </div>
            {entry.event.url && (
              <a
                className="event-link"
                href={entry.event.url}
                target="_blank"
                rel="noreferrer"
              >
                Event details
              </a>
            )}
            {entry.event.coordinateSource === 'route-approximate' && (
              <span className="approximate-note">Map pin is approximate</span>
            )}
          </div>
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
          aria-label={`${isSelected ? 'Hide' : 'Show'} details for ${entry.event.title}`}
          aria-expanded={isSelected}
          aria-controls={`event-details-${entry.event.id}`}
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
                />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}
