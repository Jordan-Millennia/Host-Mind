import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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
          <span className="eyebrow">Use Cases</span>
          <h2 className="h-section mt-6">Built for every rental model.</h2>
          <p className="mt-5 text-lg text-white/60">
            Whether you run nightly stays, traveling-nurse housing, PadSplit
            co-living, or traditional leases — HostMind adapts.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`rounded-full border px-5 py-2 text-sm font-medium transition ${
                active === t.id
                  ? 'border-brand-glow/50 bg-brand-glow/10 text-white shadow-[0_0_24px_-4px_rgba(34,211,238,0.6)]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="glass-card mx-auto max-w-4xl p-8 sm:p-10"
            >
              <div className="text-xs font-semibold uppercase tracking-widest text-brand-glow">
                {current.platforms}
              </div>
              <h3 className="mt-3 font-[Sora] text-2xl font-bold sm:text-3xl">
                {current.headline}
              </h3>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {current.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-white/75">
                    <CheckIcon />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 flex-none text-brand-glow"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" opacity="0.4" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  )
}
