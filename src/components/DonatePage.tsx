import { useEffect } from 'react'
import { BuildingIcon, DownloadIcon, HeartIcon, MapIcon } from '../icons'
import type { DonationPageContent, Sponsor } from '../types'
import { SponsorLogo } from './SponsorLogo'

const EVERYACTION_PAY_ASSET_BASE = 'https://static.everyaction.com/plutus'
const EVERYACTION_PERSONAL_HOST = 'https://secure.everyaction.com/wrSbblYkO0W-ocwl-jCGLw2'
const EVERYACTION_ACTIONTAG_BASE = 'https://static.everyaction.com/ea-actiontag'
const EVERYACTION_BUSINESS_FORM = 'https://secure.everyaction.com/v1/Forms/f9dWXtiRV0-LmWX9i3RUGQ2'
const EVERYACTION_BUSINESS_LINK = 'https://secure.everyaction.com/f9dWXtiRV0-LmWX9i3RUGQ2'
const SPONSORSHIP_PACKET_URL = `${import.meta.env.BASE_URL}Pedal%20to%20the%20Polls%20Sponsorship%20Packet.pdf`

interface DonatePageProps {
  kind: 'personal' | 'business'
  donationPages: {
    personal: DonationPageContent
    business: DonationPageContent
  }
  presentingSponsor?: Sponsor
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
      link.href = `${EVERYACTION_PAY_ASSET_BASE}/embeddedPayButton.css`
      document.head.append(link)
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = `${EVERYACTION_PAY_ASSET_BASE}/embeddedPayButton.js`
      script.async = true
      document.body.append(script)
    }
  }, [kind])

  useEffect(() => {
    if (kind !== 'business') return

    // Safari exposes ApplePaySession on loopback URLs, but Apple Pay itself rejects
    // non-HTTPS documents. ActionTag does not catch that rejection and otherwise
    // abandons the whole form render, so omit Apple Pay only for local HTTP previews.
    if (window.location.protocol !== 'https:') {
      const safariWindow = window as Window & { ApplePaySession?: unknown }
      safariWindow.ApplePaySession = undefined
    }

    const preloadId = 'everyaction-actiontag-css'
    const scriptId = 'everyaction-actiontag-js'
    let cancelled = false
    let formRendered = false
    let retryTimer: number | undefined
    let delayedTimer: number | undefined

    if (!document.getElementById(preloadId)) {
      const preload = document.createElement('link')
      preload.id = preloadId
      preload.rel = 'preload'
      preload.as = 'style'
      preload.href = `${EVERYACTION_ACTIONTAG_BASE}/at.min.css`
      document.head.append(preload)
    }

    const form = document.querySelector<HTMLElement>('.business-everyaction-form')
    const formStatus = document.querySelector<HTMLElement>('.business-form-status')
    const delayedMessage = formStatus?.querySelector<HTMLElement>('.business-form-status__delayed-message')
    const markDelayed = () => {
      if (cancelled || formRendered) return
      formStatus?.classList.add('is-delayed')
      const heading = formStatus?.querySelector('strong')
      if (heading) heading.textContent = 'The secure form is taking longer than expected.'
      if (delayedMessage) delayedMessage.hidden = false
    }
    const markReadyWhenRendered = () => {
      if (form && form.childElementCount > 0) {
        formRendered = true
        window.clearTimeout(delayedTimer)
        formStatus?.classList.add('is-hidden')
      }
    }
    const observer = new MutationObserver(markReadyWhenRendered)
    if (form) {
      observer.observe(form, { attributes: true, childList: true, subtree: true })
      markReadyWhenRendered()
    }

    if (!formRendered) {
      delayedTimer = window.setTimeout(markDelayed, 8_000)
    }

    const processFormWhenReady = () => {
      if (cancelled) return
      const actionTagWindow = window as Window & {
        nvtag?: { process: (target: Element) => void }
      }
      if (form && actionTagWindow.nvtag?.process) {
        if (form.dataset.actionTagProcessed === 'true') return
        form.dataset.actionTagProcessed = 'true'
        actionTagWindow.nvtag.process(form)
        return
      }
      retryTimer = window.setTimeout(processFormWhenReady, 100)
    }

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existingScript) {
      processFormWhenReady()
    } else {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = `${EVERYACTION_ACTIONTAG_BASE}/at.js`
      script.async = true
      script.addEventListener('error', markDelayed, { once: true })
      document.body.append(script)
      processFormWhenReady()
    }

    return () => {
      cancelled = true
      observer.disconnect()
      window.clearTimeout(retryTimer)
      window.clearTimeout(delayedTimer)
    }
  }, [kind])

  return (
    <main className={`donate-page donate-page--${kind}`} id="main-content">
      <section className="donate-page__intro">
        <div className="donate-page__nav">
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
        </div>

        <div className="donate-page__content">
          <div className="donate-page__pitch">
            <span className="eyebrow">{content.eyebrow}</span>
            <h1>{content.title}</h1>
            <div className="donate-page__copy">
              <p className={kind === 'personal' ? 'donate-page__lead' : undefined}>{content.description}</p>
            </div>
          </div>

          <div className="donate-page__details">
            {!!content.additionalParagraphs?.length && (
              <div className="donate-page__copy donate-page__copy--additional">
                {content.additionalParagraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            )}

            {kind === 'business' && (
              <div className="donate-page__business-resources">
                <p className="donate-page__packet-prompt">
                  Want to see the sponsorship opportunities and benefits?
                </p>
                <SponsorshipPacketLink />
                {content.contact && (
                  <address className="donate-page__contact">
                    <strong>Questions?</strong>
                    <span>
                      Contact {content.contact.name}, {content.contact.title}, at{' '}
                      <a href={`mailto:${content.contact.email}`}>{content.contact.email}</a> or{' '}
                      <a href={`tel:${content.contact.phone.replace(/[^+\d]/g, '')}`}>{content.contact.phone}</a>
                    </span>
                  </address>
                )}
              </div>
            )}
          </div>
        </div>

        {presentingSponsor && (
          <div className="donate-page__sponsor">
            <span>Ride support provided by</span>
            <SponsorLogo sponsor={presentingSponsor} />
          </div>
        )}
      </section>

      <section className="donation-form-shell" aria-label={kind === 'business' ? 'Business contribution form' : 'Donation options'}>
        <div className="donation-form-shell__body">
          {kind === 'personal' && (
            <div className="donation-form-shell__heading donation-form-shell__heading--simple">
              <h2>Support the ride</h2>
            </div>
          )}

          {kind === 'personal' ? (
            <div className="everyaction-button-stack" aria-label="Donation options">
              <div className="everyaction-option">
                <h3>Individual gifts</h3>
                <p>Make a secure individual contribution to power the ride.</p>
              </div>
              <button
                type="button"
                className="embedded-pay-button everyaction-donate-button"
                data-host={EVERYACTION_PERSONAL_HOST}
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
                <span>Become a sponsor</span>
              </button>

              <SponsorshipPacketLink />
            </div>
          ) : (
            <div className="business-form-stack">
              <div className="business-form-status" role="status">
                <span className="business-form-status__spinner" aria-hidden="true" />
                <span>
                  <strong>Loading the secure sponsorship form…</strong>
                  <small className="business-form-status__delayed-message" hidden>
                    Your browser may be blocking EveryAction.{' '}
                    <a href={EVERYACTION_BUSINESS_LINK} target="_blank" rel="noreferrer">
                      Open the secure form
                    </a>
                    .
                  </small>
                </span>
              </div>
              <div className="business-form-host">
                <div
                  className="ngp-form business-everyaction-form"
                  data-form-url={EVERYACTION_BUSINESS_FORM}
                  data-fastaction-endpoint="https://fastaction.ngpvan.com"
                  data-inline-errors="true"
                  data-fastaction-nologin="true"
                  data-mobile-autofocus="false"
                />
              </div>
            </div>
          )}
        </div>
        <p className="donation-form-shell__note">
          Secure {kind === 'business' ? 'business contribution' : 'donation'} form powered by EveryAction
        </p>
      </section>
    </main>
  )
}

function SponsorshipPacketLink() {
  return (
    <a className="sponsorship-packet-link" href={SPONSORSHIP_PACKET_URL} download>
      <DownloadIcon />
      <span>Download sponsorship packet</span>
      <small>PDF</small>
    </a>
  )
}
