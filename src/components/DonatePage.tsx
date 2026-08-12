import { useEffect } from 'react'
import { ArrowRightIcon, BuildingIcon, HeartIcon, MapIcon } from '../icons'
import type { DonationPageContent, Sponsor } from '../types'
import { SponsorLogo } from './SponsorLogo'

const EVERYACTION_ASSET_BASE = 'https://static.everyaction.com/plutus'
const EVERYACTION_DONATION_HOST = 'https://secure.everyaction.com/1W5fOoUokkqesSBER73nFQ2'

interface DonatePageProps {
  kind: 'personal' | 'business'
  donationPages: {
    personal: DonationPageContent
    business: DonationPageContent
  }
  presentingSponsor: Sponsor
  onShowMap: () => void
  onShowBusiness: () => void
  onShowPersonal: () => void
}

export function DonatePage({
  kind,
  donationPages,
  presentingSponsor,
  onShowMap,
  onShowBusiness,
  onShowPersonal,
}: DonatePageProps) {
  const personalContent = donationPages.personal
  const businessContent = donationPages.business
  const content = kind === 'business' ? businessContent : personalContent

  useEffect(() => {
    if (kind !== 'personal') return

    const stylesheetId = 'everyaction-embedded-pay-css'
    const scriptId = 'everyaction-embedded-pay-js'

    if (!document.getElementById(stylesheetId)) {
      const link = document.createElement('link')
      link.id = stylesheetId
      link.type = 'text/css'
      link.rel = 'stylesheet'
      link.href = `${EVERYACTION_ASSET_BASE}/embeddedPayButton.css`
      document.head.append(link)
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = `${EVERYACTION_ASSET_BASE}/embeddedPayButton.js`
      script.async = true
      document.body.append(script)
    }
  }, [kind])

  return (
    <main className="donate-page" id="main-content">
      <section className="donate-page__intro">
        <button className="text-link" type="button" onClick={onShowMap}>
          <MapIcon />
          Back to the ride map
        </button>
        {kind === 'business' && (
          <button className="text-link text-link--secondary" type="button" onClick={onShowPersonal}>
            <HeartIcon />
            Individual donations
          </button>
        )}
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

      <section className="donation-form-shell" aria-label="Donation options">
        <div className="donation-form-shell__body">
          <div className="donation-form-shell__heading donation-form-shell__heading--simple">
            <h2>{kind === 'business' ? 'Business Sponsorship' : 'Support the Ride'}</h2>
          </div>

          {kind === 'personal' ? (
          <div className="everyaction-button-stack" aria-label="Donation options">
            <div className="everyaction-option">
              <h3>Individual gifts</h3>
              <p>{personalContent.description}</p>
            </div>
            <button
              type="button"
              className="embedded-pay-button everyaction-donate-button"
              data-host={EVERYACTION_DONATION_HOST}
            >
              <HeartIcon />
              <span>Donate as an individual</span>
            </button>
            <div className="everyaction-option everyaction-option--business">
              <h3>Business or sponsor giving</h3>
              <p>{businessContent.description}</p>
            </div>
            <button
              type="button"
              className="business-sponsorship-button"
              onClick={onShowBusiness}
            >
              <BuildingIcon />
              <span>View sponsorship options</span>
            </button>
          </div>
          ) : (
          <>
            <div className="amount-grid amount-grid--simple" aria-label="Sponsorship amount">
              {businessContent.amountOptions.map((amount) => (
                <button type="button" key={amount}>
                  {formatAmount(amount)}
                </button>
              ))}
              <button type="button" className="amount-grid__custom">
                {businessContent.customAmountLabel}
              </button>
            </div>

            <div className="donation-form-shell__heading donation-form-shell__heading--details donation-form-shell__heading--simple">
              <h2>Business details</h2>
              <p>Secure sponsorship fields will be supplied with the final business donation form.</p>
            </div>

            <div className="form-placeholder form-placeholder--simple" aria-label="Business sponsorship form placeholder">
              <div className="form-placeholder__fields">
                <span />
                <span />
                <span />
              </div>
              <button type="button" className="primary-button" disabled>
                {businessContent.submitLabel}
                <ArrowRightIcon />
              </button>
            </div>
          </>
          )}
        </div>
        <p className="donation-form-shell__note">
          {kind === 'business'
            ? 'Business sponsorship form placeholder'
            : 'Secure donation form powered by EveryAction'}
        </p>
      </section>
    </main>
  )
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}
