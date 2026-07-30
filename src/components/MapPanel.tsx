import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CloseIcon, LocationIcon, ResetIcon, TimeIcon } from '../icons'
import { formatDateRange } from '../lib/format'
import type { RideRoute, TimelineEntry } from '../types'

setWorkerUrl(mapLibreWorkerUrl)

interface MapPanelProps {
  routes: RideRoute[]
  timeline: TimelineEntry[]
  isVisible: boolean
  selectedRouteId: string | null
  selectedEventId: string | null
  onSelectRoute: (routeId: string) => void
  onSelectEvent: (eventId: string) => void
  onShowFullRoute: () => void
  onClearEvent: () => void
}

const ROUTE_SOURCE_ID = 'ride-routes'
const ROUTE_HIT_ID = 'ride-route-hit'
const DEFAULT_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    },
  },
  layers: [
    {
      id: 'open-street-map',
      type: 'raster',
      source: 'openStreetMap',
      paint: {
        'raster-opacity': 0.78,
        'raster-saturation': -0.55,
      },
    },
  ],
}
const MAP_STYLE =
  import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE

function getCombinedBounds(routes: RideRoute[]): [[number, number], [number, number]] {
  const west = Math.min(...routes.map((route) => route.bounds[0][0]))
  const south = Math.min(...routes.map((route) => route.bounds[0][1]))
  const east = Math.max(...routes.map((route) => route.bounds[1][0]))
  const north = Math.max(...routes.map((route) => route.bounds[1][1]))
  return [
    [west, south],
    [east, north],
  ]
}

function fitMap(
  map: MapLibreMap,
  bounds: [[number, number], [number, number]],
  compact = false,
) {
  map.fitBounds(bounds, {
    padding: compact
      ? { top: 90, right: 28, bottom: 120, left: 28 }
      : { top: 100, right: 70, bottom: 80, left: 70 },
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
    maxZoom: 10.5,
  })
}

export function MapPanel({
  routes,
  timeline,
  isVisible,
  selectedRouteId,
  selectedEventId,
  onSelectRoute,
  onSelectEvent,
  onShowFullRoute,
  onClearEvent,
}: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const routeOverlayRef = useRef<SVGSVGElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRefs = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>())
  const onSelectRouteRef = useRef(onSelectRoute)
  const onSelectEventRef = useRef(onSelectEvent)
  const [mapReady, setMapReady] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)

  onSelectRouteRef.current = onSelectRoute
  onSelectEventRef.current = onSelectEvent

  const eventEntries = useMemo(
    () => timeline.filter((entry): entry is TimelineEntry & { event: NonNullable<TimelineEntry['event']> } => Boolean(entry.event)),
    [timeline],
  )
  const selectedEntry = eventEntries.find((entry) => entry.event.id === selectedEventId)
  const selectedRoute = routes.find((route) => route.id === selectedRouteId)
  const selectedEntryRoute = selectedEntry
    ? routes.find((route) => route.id === selectedEntry.routeId)
    : undefined

  useEffect(() => {
    if (!containerRef.current || mapRef.current || routes.length === 0) {
      return
    }

    const supportCanvas = document.createElement('canvas')
    if (!supportCanvas.getContext('webgl2')) {
      setMapFailed(true)
      return
    }

    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [-94.2, 46.1],
        zoom: 5.1,
        attributionControl: false,
        cooperativeGestures: window.innerWidth >= 760,
      })
    } catch {
      setMapFailed(true)
      return
    }

    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new ScaleControl({ maxWidth: 110, unit: 'imperial' }), 'bottom-right')
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right')
    map.scrollZoom.disable()
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.getCanvas().setAttribute(
      'aria-label',
      'Interactive map of the Pedal to the Polls route across Minnesota',
    )

    let overlayFrame: number | null = null
    const renderRouteOverlay = () => {
      const overlay = routeOverlayRef.current
      if (!overlay) return

      const { width, height } = map.getContainer().getBoundingClientRect()
      overlay.setAttribute('viewBox', `0 0 ${width} ${height}`)
      const paths = overlay.querySelectorAll<SVGPathElement>('path[data-route-path]')

      routes.forEach((route, routeIndex) => {
        const routePath = paths[routeIndex]
        if (!routePath) return
        const pathData = route.geometry.coordinates
          .map((coordinate, pointIndex) => {
            const point = map.project(coordinate)
            return `${pointIndex === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`
          })
          .join(' ')
        routePath.setAttribute('d', pathData)
      })
    }
    const scheduleRouteOverlay = () => {
      if (overlayFrame !== null) return
      overlayFrame = window.requestAnimationFrame(() => {
        overlayFrame = null
        renderRouteOverlay()
      })
    }

    const updateMarkerOffsets = () => {
      const projected = eventEntries.map((entry) => ({
        eventId: entry.event.id,
        eventNumber: entry.event.number,
        point: map.project(entry.event.coordinates),
      }))
      const parents = projected.map((_, index) => index)
      const findRoot = (index: number): number => {
        if (parents[index] !== index) {
          parents[index] = findRoot(parents[index])
        }
        return parents[index]
      }
      const join = (left: number, right: number) => {
        const leftRoot = findRoot(left)
        const rightRoot = findRoot(right)
        if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
      }

      for (let left = 0; left < projected.length; left += 1) {
        for (let right = left + 1; right < projected.length; right += 1) {
          const deltaX = projected[left].point.x - projected[right].point.x
          const deltaY = projected[left].point.y - projected[right].point.y
          if (deltaX ** 2 + deltaY ** 2 < 38 ** 2) join(left, right)
        }
      }

      const groups = new Map<number, typeof projected>()
      projected.forEach((item, index) => {
        const root = findRoot(index)
        const group = groups.get(root) ?? []
        group.push(item)
        groups.set(root, group)
      })

      groups.forEach((group) => {
        group.sort((left, right) => left.eventNumber - right.eventNumber)
        if (group.length === 1) {
          markerRefs.current.get(group[0].eventId)?.marker.setOffset([0, 0])
          return
        }
        const radius = 28 + Math.max(0, group.length - 4) * 4
        group.forEach((item, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / group.length
          markerRefs.current
            .get(item.eventId)
            ?.marker.setOffset([
              Math.round(Math.cos(angle) * radius),
              Math.round(Math.sin(angle) * radius),
            ])
        })
      })
    }

    map.on('move', scheduleRouteOverlay)
    map.on('resize', scheduleRouteOverlay)
    scheduleRouteOverlay()

    const handleLoad = () => {
      const features = routes.map((route) => ({
        type: 'Feature' as const,
        properties: {
          id: route.id,
          title: route.title,
          color: route.color,
        },
        geometry: route.geometry,
      }))

      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      })

      map.addLayer({
        id: ROUTE_HIT_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: {
          'line-color': 'rgba(0, 0, 0, 0)',
          'line-width': 20,
        },
      })

      map.on('mouseenter', ROUTE_HIT_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', ROUTE_HIT_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', ROUTE_HIT_ID, (event) => {
        const id = event.features?.[0]?.properties?.id
        if (typeof id === 'string') {
          onSelectRouteRef.current(id)
        }
      })

      for (const entry of eventEntries) {
        const button = document.createElement('button')
        const entryRoute = routes.find((route) => route.id === entry.routeId)
        button.type = 'button'
        button.className = 'map-marker'
        button.dataset.eventId = entry.event.id
        button.style.setProperty('--route-color', entryRoute?.color ?? 'var(--pine)')
        button.setAttribute(
          'aria-label',
          `${entry.event.number}. ${entry.event.title}, ${formatDateRange(entry.startDate, entry.endDate)}`,
        )
        button.title = entry.event.title
        button.innerHTML = `<span aria-hidden="true">${entry.event.number}</span>`
        button.addEventListener('click', (clickEvent) => {
          clickEvent.stopPropagation()
          onSelectEventRef.current(entry.event.id)
        })

        const marker = new Marker({ element: button, anchor: 'center' })
          .setLngLat(entry.event.coordinates)
          .addTo(map)

        markerRefs.current.set(entry.event.id, { marker, element: button })
      }

      map.on('moveend', updateMarkerOffsets)
      fitMap(map, getCombinedBounds(routes), window.innerWidth < 760)
      scheduleRouteOverlay()
      updateMarkerOffsets()
      setMapReady(true)
    }

    map.once('load', handleLoad)
    map.once('error', (event) => {
      if (!map.isStyleLoaded() && event.error) {
        setMapFailed(true)
      }
    })

    return () => {
      markerRefs.current.forEach(({ marker }) => marker.remove())
      markerRefs.current.clear()
      if (overlayFrame !== null) window.cancelAnimationFrame(overlayFrame)
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [eventEntries, routes])

  useEffect(() => {
    if (!isVisible || !mapRef.current) return
    const frame = window.requestAnimationFrame(() => mapRef.current?.resize())
    return () => window.cancelAnimationFrame(frame)
  }, [isVisible, mapReady])

  useEffect(() => {
    markerRefs.current.forEach(({ element }, eventId) => {
      const isActive = eventId === selectedEventId
      element.classList.toggle('is-active', isActive)
      element.setAttribute('aria-expanded', String(isActive))
      element.setAttribute('aria-controls', 'map-event-details')
    })
  }, [mapReady, selectedEventId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) {
      return
    }

    if (!selectedEventId) {
      fitMap(map, getCombinedBounds(routes), window.innerWidth < 760)
    }
  }, [mapReady, routes, selectedEventId, selectedRouteId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !selectedEntry) {
      return
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.easeTo({
      center: selectedEntry.event.coordinates,
      zoom: Math.max(map.getZoom(), 8),
      offset: window.innerWidth < 760 ? [0, -70] : [0, -40],
      duration: prefersReducedMotion ? 0 : 600,
    })
  }, [mapReady, selectedEntry])

  const resetView = () => {
    onShowFullRoute()
    if (mapRef.current) {
      fitMap(mapRef.current, getCombinedBounds(routes), window.innerWidth < 760)
    }
  }

  return (
    <section className="map-panel" aria-label="Route map">
      <div ref={containerRef} className="map-canvas" />
      <svg ref={routeOverlayRef} className="route-overlay" aria-hidden="true">
        {routes.map((route) => (
          <path
            key={route.id}
            data-route-path={route.id}
            className={route.id === selectedRouteId ? 'is-selected' : ''}
            stroke={route.color}
          />
        ))}
      </svg>

      <div className="map-toolbar">
        <div>
          <span className="map-toolbar__eyebrow">
            {selectedRoute ? selectedRoute.leg : 'Full route'}
          </span>
          <strong>{selectedRoute ? selectedRoute.title : 'Across Minnesota'}</strong>
        </div>
        <button className="icon-button" type="button" onClick={resetView} title="Show the full route">
          <ResetIcon />
          <span className="sr-only">Show the full route</span>
        </button>
      </div>

      <div className="map-key" aria-label="Map marker key">
        <span><i className="key-dot" /> Event stop</span>
      </div>

      {mapFailed && (
        <div className="map-error" role="status">
          <strong>The basemap could not load.</strong>
          <span>The complete ride schedule remains available in the Schedule view.</span>
        </div>
      )}

      {selectedEntry?.event && (
        <article
          id="map-event-details"
          className="map-event-card"
          style={{ '--route-color': selectedEntryRoute?.color } as React.CSSProperties}
          aria-live="polite"
        >
          <button
            className="map-event-card__close icon-button"
            type="button"
            onClick={onClearEvent}
          >
            <CloseIcon />
            <span className="sr-only">Close event details</span>
          </button>
          <div className="map-event-card__heading">
            <span className="map-event-card__marker" aria-hidden="true">
              {selectedEntry.event.number}
            </span>
            <div>
              <div className="event-card__topline">
                <span className="status-badge">Selected stop</span>
                <time dateTime={selectedEntry.startDate}>
                  {formatDateRange(selectedEntry.startDate, selectedEntry.endDate)}
                </time>
              </div>
              <h2>{selectedEntry.event.title}</h2>
            </div>
          </div>
          <p>{selectedEntry.event.description}</p>
          <div className="map-event-card__facts">
            <span>
              <LocationIcon />
              {[selectedEntry.event.venue, selectedEntry.event.city].filter(Boolean).join(' · ')}
            </span>
            {selectedEntry.event.address && (
              <span className="map-event-card__address">{selectedEntry.event.address}</span>
            )}
            {selectedEntry.event.timeLabel && (
              <span>
                <TimeIcon />
                {selectedEntry.event.timeLabel} CT
              </span>
            )}
          </div>
          {selectedEntry.event.url && (
            <a
              className="event-link"
              href={selectedEntry.event.url}
              target="_blank"
              rel="noreferrer"
            >
              Event details
            </a>
          )}
        </article>
      )}

      <p className="map-disclaimer">Preliminary route · Not for navigation</p>
    </section>
  )
}
