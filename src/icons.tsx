import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const defaults = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M5 12h13M14 7l5 5-5 5" />
    </svg>
  )
}
export function CalendarIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

export function BuildingIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M4 21h16M6 21V5h8v16M14 9h4v12" />
      <path d="M9 9h2M9 13h2M9 17h2M16.5 13h1M16.5 17h1" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m7 9 5 5 5-5" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 20h14" />
    </svg>
  )
}

export function HeartIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 6l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.3a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  )
}

export function LocationIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

export function MapIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  )
}

export function ResetIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M4 7v5h5" />
      <path d="M5.7 16.4A8 8 0 1 0 4.2 9" />
    </svg>
  )
}

export function RouteIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8 18h2.5a2.5 2.5 0 0 0 0-5h-1a2.5 2.5 0 0 1 0-5H16" />
    </svg>
  )
}

export function ScheduleIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r=".8" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TimeIcon(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function TrailMark(props: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="48"
      height="48"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <circle cx="13" cy="32" r="8" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="36" cy="32" r="8" stroke="currentColor" strokeWidth="2.6" />
      <path
        d="m13 32 8-13 7 13H13Zm8-13h8m-3-5h5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M27 13h-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}
