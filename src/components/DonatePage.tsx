import { useState } from 'react'
import { ArrowRightIcon, BuildingIcon, HeartIcon, MapIcon } from '../icons'
import type { DonationPageContent, Sponsor } from '../types'
import { SponsorLogo } from './SponsorLogo'

type DonationKind = 'personal' | 'business'

interface DonatePageProps {
  kind: DonationKind
  content: DonationPageContent
  presentingSponsor: Sponsor
  onShowMap: () => void
  onChangeKind: (kind: DonationKind) => void
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function DonatePage({
  kind,
  content,
  presentingSponsor,
  onShowMap,
  onChangeKind,
}: DonatePageProps) {
  const [selectedAmount, setSelectedAmount] = useState(content.amountOptions[1] ?? content.amountOptions[0])
  const [frequency, setFrequency] = useState<'once' | 'monthly'>('once')

  return (
    <main className="donate-page" id="main-content">
      <section className="donate-page__intro">
        <button className="text-link" type="button" onClick={onShowMap}>
          <MapIcon />
          Back to the ride map
        </button>
        <span className="eyebrow">{content.eyebrow}</span>
        <h1>{content.title}</h1>
        <p>{content.description}</p>

        <div className="donate-page__sponsor">
          <span>Ride support provided by</span>
          <SponsorLogo sponsor={presentingSponsor} />
        </div>

        <aside className="impact-list" aria-label={content.impactTitle}>
          <h2>{content.impactTitle}</h2>
          <ul>
            {content.impactItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="donation-form-shell" aria-label={`${kind} donation form`}>
        <div className="donation-form-shell__tabs" role="tablist" aria-label="Donation type">
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'personal'}
            className={kind === 'personal' ? 'is-active' : ''}
            onClick={() => onChangeKind('personal')}
          >
            <HeartIcon />
            Personal giving
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'business'}
            className={kind === 'business' ? 'is-active' : ''}
            onClick={() => onChangeKind('business')}
          >
            <BuildingIcon />
            Business sponsorship
          </button>
        </div>

        <div className="donation-form-shell__body">
          <div className="donation-form-shell__heading">
            <span className="form-step">1</span>
            <div>
              <h2>{kind === 'personal' ? 'Choose your gift' : 'Choose your sponsorship'}</h2>
              <p>{kind === 'personal' ? 'Every contribution helps carry this work across Minnesota.' : 'Make your support visible throughout the ride.'}</p>
            </div>
          </div>

          {kind === 'personal' && (
            <div className="frequency-toggle" aria-label="Gift frequency">
              <button
                type="button"
                className={frequency === 'once' ? 'is-active' : ''}
                onClick={() => setFrequency('once')}
                aria-pressed={frequency === 'once'}
              >
                One time
              </button>
              <button
                type="button"
                className={frequency === 'monthly' ? 'is-active' : ''}
                onClick={() => setFrequency('monthly')}
                aria-pressed={frequency === 'monthly'}
              >
                Monthly
              </button>
            </div>
          )}

          <div className="amount-grid" aria-label="Donation amount">
            {content.amountOptions.map((amount) => (
              <button
                type="button"
                key={amount}
                className={selectedAmount === amount ? 'is-active' : ''}
                onClick={() => setSelectedAmount(amount)}
                aria-pressed={selectedAmount === amount}
              >
                {formatAmount(amount)}
              </button>
            ))}
            <button type="button" className="amount-grid__custom">
              {content.customAmountLabel}
            </button>
          </div>

          <div className="donation-form-shell__heading donation-form-shell__heading--details">
            <span className="form-step">2</span>
            <div>
              <h2>{kind === 'personal' ? 'Your details' : 'Business details'}</h2>
              <p>Secure fields will be supplied with the final donation form.</p>
            </div>
          </div>

          <div className="form-placeholder" aria-label="Donation form placeholder">
            <div className="form-placeholder__fields">
              <span />
              <span />
              <span />
            </div>
            <button type="button" className="primary-button" disabled>
              {content.submitLabel}
              <ArrowRightIcon />
            </button>
          </div>
        </div>
        <p className="donation-form-shell__note">Secure payment form placeholder</p>
      </section>
    </main>
  )
}
