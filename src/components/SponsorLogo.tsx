import type { Sponsor } from '../types'

interface SponsorLogoProps {
  sponsor: Sponsor
  className?: string
  showLevel?: boolean
}

export function SponsorLogo({ sponsor, className = '', showLevel = false }: SponsorLogoProps) {
  const logoSrc = sponsor.logoUrl?.startsWith('http')
    ? sponsor.logoUrl
    : sponsor.logoUrl
      ? `${import.meta.env.BASE_URL}${sponsor.logoUrl.replace(/^\/+/, '')}`
      : undefined
  const mark = sponsor.logoUrl ? (
    <img className="sponsor-logo__image" src={logoSrc} alt={sponsor.name} />
  ) : (
    <span className="sponsor-logo__monogram" aria-hidden="true">
      {sponsor.monogram}
    </span>
  )

  const content = (
    <>
      {mark}
      {(!sponsor.logoUrl || showLevel) && (
        <span className="sponsor-logo__copy">
          {!sponsor.logoUrl && <strong>{sponsor.shortName}</strong>}
          {showLevel && <small>{sponsor.level}</small>}
        </span>
      )}
    </>
  )

  if (sponsor.url) {
    return (
      <a
        className={`sponsor-logo ${className}`.trim()}
        href={sponsor.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Visit ${sponsor.name}`}
      >
        {content}
      </a>
    )
  }

  return <div className={`sponsor-logo ${className}`.trim()}>{content}</div>
}
