import type { Sponsor } from '../types'
import { SponsorLogo } from './SponsorLogo'

interface SponsorShowcaseProps {
  sponsors: Sponsor[]
  includeSupporting?: boolean
}

export function SponsorShowcase({ sponsors, includeSupporting = false }: SponsorShowcaseProps) {
  const tiers = [
    { id: 'lead', label: 'Lead partners' },
    { id: 'supporting', label: 'Supporting partners' },
    { id: 'community', label: 'Community partners' },
  ] as const
  const visibleTiers = includeSupporting ? tiers : tiers.slice(0, 1)
  const sponsorGroups = visibleTiers
    .map((tier) => ({
      ...tier,
      sponsors: sponsors.filter((sponsor) => sponsor.tier === tier.id),
    }))
    .filter((tier) => tier.sponsors.length > 0)

  if (sponsorGroups.length === 0) return null

  return (
    <div className="sponsor-showcase" aria-label="Ride sponsors">
      <span className="sponsor-showcase__eyebrow">Ride support provided by</span>
      {sponsorGroups.map((tier) => (
        <div
          className={`sponsor-showcase__row sponsor-showcase__row--${tier.id}`}
          key={tier.id}
        >
          <div className="sponsor-showcase__logos" role="group" aria-label={tier.label}>
            {tier.sponsors.map((sponsor) => (
              <SponsorLogo key={sponsor.id} sponsor={sponsor} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
