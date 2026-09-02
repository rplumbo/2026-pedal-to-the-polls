import type { Sponsor } from '../types'
import { SponsorLogo } from './SponsorLogo'

interface SponsorShowcaseProps {
  sponsors: Sponsor[]
  includeSupporting?: boolean
}

export function SponsorShowcase({ sponsors, includeSupporting = false }: SponsorShowcaseProps) {
  const leadSponsors = sponsors.filter((sponsor) => sponsor.tier === 'lead')
  const supportingSponsors = sponsors.filter((sponsor) => sponsor.tier === 'supporting')

  if (leadSponsors.length === 0) return null

  return (
    <div className="sponsor-showcase">
      <div className="sponsor-showcase__row sponsor-showcase__row--lead">
        <span className="sponsor-showcase__eyebrow">Ride support provided by</span>
        <div className="sponsor-showcase__logos" role="group" aria-label="Lead sponsors">
          {leadSponsors.map((sponsor) => (
            <SponsorLogo key={sponsor.id} sponsor={sponsor} />
          ))}
        </div>
      </div>

      {includeSupporting && supportingSponsors.length > 0 && (
        <div className="sponsor-showcase__row sponsor-showcase__row--supporting">
          <div className="sponsor-showcase__logos" role="group" aria-label="Supporting sponsors">
            {supportingSponsors.map((sponsor) => (
              <SponsorLogo key={sponsor.id} sponsor={sponsor} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
