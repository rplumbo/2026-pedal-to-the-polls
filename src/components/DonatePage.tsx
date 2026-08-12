import { useEffect } from 'react'
import { BuildingIcon, HeartIcon, MapIcon } from '../icons'
import type { DonationPageContent, Sponsor } from '../types'
import { SponsorLogo } from './SponsorLogo'

const EVERYACTION_ASSET_BASE = 'https://static.everyaction.com/plutus'
const EVERYACTION_DONATION_HOST = 'https://secure.everyaction.com/1W5fOoUokkqesSBER73nFQ2'

interface DonatePageProps {
  donationPages: {
    personal: DonationPageContent
    business: DonationPageContent
  }
  presentingSponsor: Sponsor
  onShowMap: () => void
}

export function DonatePage({
  donationPages,
  presentingSponsor,
  onShowMap,
}: DonatePageProps) {
  const personalContent = donationPages.personal
  const businessContent = donationPages.business

  useEffect(() => {
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
  }, [])

  return (
    <main className="donate-page" id="main-content">
      <section className="donate-page__intro">
        <button className="text-link" type="button" onClick={onShowMap}>
          <MapIcon />
          Back to the ride map
        </button>
        <span className="eyebrow">{personalContent.eyebrow}</span>
        <h1>{personalContent.title}</h1>
        <p>{personalContent.description}</p>

        <div className="donate-page__sponsor">
          <span>Ride support provided by</span>
          <SponsorLogo sponsor={presentingSponsor} />
        </div>

        <aside className="impact-list" aria-label={personalContent.impactTitle}>
          <h2>{personalContent.impactTitle}</h2>
          <ul>
            {personalContent.impactItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="donation-form-shell" aria-label="Donation options">
        <div className="donation-form-shell__body">
          <div className="donation-form-shell__heading">
            <span className="form-step">1</span>
            <div>
              <h2>Choose how to give</h2>
              <p>Both options open the secure EveryAction form in a popup.</p>
            </div>
          </div>

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
            <div className="everyaction-option">
              <h3>Business donations</h3>
              <p>{businessContent.description}</p>
            </div>
            <button
              type="button"
              className="embedded-pay-button everyaction-donate-button everyaction-donate-button--business"
              data-host={EVERYACTION_DONATION_HOST}
            >
              <BuildingIcon />
              <span>Business donation</span>
            </button>
          </div>
        </div>
        <p className="donation-form-shell__note">Secure donation form powered by EveryAction</p>
      </section>
    </main>
  )
}
