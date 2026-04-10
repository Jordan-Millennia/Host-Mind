import { motion } from 'framer-motion'

const tiers = [
  {
    name: 'Starter',
    tagline: 'For operators testing autonomous co-hosting.',
    price: 'TBD',
    unit: '/ month',
    featured: false,
    features: [
      'Up to 3 units',
      'Core messaging automation',
      'Airbnb + one additional platform',
      'Smart lock integration',
      'Email support',
    ],
    cta: 'Join Waitlist',
  },
  {
    name: 'Growth',
    tagline: 'For active portfolios that need the full engine.',
    price: 'TBD',
    unit: '/ month',
    featured: true,
    features: [
      'Up to 15 units',
      'Full automation suite',
      'All supported platforms',
      'Revenue intelligence + pricing signals',
      'Lockout + escalation workflows',
      'Priority support',
    ],
    cta: 'Join Waitlist',
  },
  {
    name: 'Enterprise',
    tagline: 'For property managers and scale portfolios.',
    price: 'Custom',
    unit: '',
    featured: false,
    features: [
      'Unlimited units',
      'White-label options',
      'Custom workflows + integrations',
      'Dedicated success manager',
      'SLA-backed uptime',
    ],
    cta: 'Contact Sales',
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="section relative">
      <div className="container-xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">Pricing</span>
          <h2 className="h-section mt-6">Simple, per-unit pricing.</h2>
          <p className="mt-5 text-lg text-white/60">
            Start with a handful of units. Scale to hundreds. No long-term
            contracts. Final pricing locked in at launch.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                t.featured
                  ? 'border-brand-glow/50 bg-gradient-to-b from-brand-cyan/[0.08] to-brand-blue/[0.04] shadow-[0_0_60px_-20px_rgba(34,211,238,0.5)]'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              {t.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-cyan to-brand-blue px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg">
                  Most Popular
                </div>
              )}
              <div>
                <h3 className="font-[Sora] text-2xl font-bold">{t.name}</h3>
                <p className="mt-2 text-sm text-white/60">{t.tagline}</p>
              </div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-[Sora] text-4xl font-bold">{t.price}</span>
                <span className="text-sm text-white/50">{t.unit}</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-white/80">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#waitlist"
                className={`mt-8 block text-center ${
                  t.featured ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {t.cta}
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 flex-none text-brand-glow"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}
