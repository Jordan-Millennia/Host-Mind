import { useState } from 'react'

const tabs = [
  {
    id: 'str',
    label: 'Short-Term',
    platforms: 'Airbnb · VRBO · Booking.com',
    headline: 'Turn every stay into a five-star experience.',
    points: [
      'Instant response to guest inquiries across Airbnb, VRBO, and Booking.com',
      'Dynamic pricing adjustments based on occupancy and local demand signals',
      'Automated check-in instructions, smart lock codes, and late-checkout handling',
      'Post-stay review requests and cleaner dispatch coordination',
    ],
  },
  {
    id: 'mtr',
    label: 'Mid-Term',
    platforms: 'Furnished Finder · 30+ day stays',
    headline: 'Handle traveling nurses and relocations without friction.',
    points: [
      'Qualifies and responds to Furnished Finder leads in minutes, not hours',
      'Manages lease terms, utility splits, and extension requests',
      'Automates monthly rent reminders and payment confirmations',
      'Orchestrates turnover: cleaning, restocking, and next-guest onboarding',
    ],
  },
  {
    id: 'cls',
    label: 'Co-Living / PadSplit',
    platforms: 'PadSplit · Room-by-room rentals',
    headline: 'Run a full PadSplit portfolio without lifting a finger.',
    points: [
      'Monitors weekly member payments and escalates past-due balances',
      'Assigns room access, manages roommate complaints, and handles lockouts',
      'Executes house-rule enforcement with warnings and documented follow-ups',
      'Coordinates move-outs, deep cleans, and next-member onboarding',
    ],
  },
  {
    id: 'ltr',
    label: 'Long-Term',
    platforms: 'TurboTenant · Traditional leases',
    headline: 'Lease enforcement on autopilot.',
    points: [
      'Tracks rent collection and triggers late-fee and notice workflows',
      'Responds to maintenance requests and routes to your preferred vendors',
      'Manages lease renewals, rent increases, and tenant screening follow-ups',
      'Handles move-in inspections and move-out deposit reconciliation',
    ],
  },
]

export default function UseCases() {
  const [active, setActive] = useState(tabs[0].id)
  const current = tabs.find((t) => t.id === active)

  return (
    <section id="use-cases" className="section relative">
      <div className="container-xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow-mono">// RENTAL MODELS</div>
          <h2 className="h-section mt-5 text-hm-text">Built for every rental model.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-hm-muted">
            Whether you run nightly stays, traveling-nurse housing, PadSplit
            co-living, or traditional leases — HostMind adapts.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {tabs.map((t) => {
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors duration-150 ${
                  isActive ? 'text-hm-cyan' : 'text-hm-muted hover:text-hm-text'
                }`}
                style={{
                  padding: '10px 18px',
                  borderRadius: 2,
                  border: isActive
                    ? '1px solid #00C8FF'
                    : '1px solid rgba(255,255,255,0.1)',
                  background: isActive
                    ? 'rgba(0,200,255,0.12)'
                    : 'transparent',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="mt-10">
          <div
            className="panel mx-auto max-w-4xl p-10 sm:p-12"
            style={{ borderLeft: '3px solid #00C8FF' }}
          >
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-hm-cyan">
              {current.platforms}
            </div>
            <h3 className="mt-4 font-display text-[24px] font-bold text-hm-text sm:text-[28px]">
              {current.headline}
            </h3>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {current.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[14px] text-hm-text/85">
                  <span className="mt-0.5 font-mono text-[14px] font-bold text-hm-cyan">
                    →
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
