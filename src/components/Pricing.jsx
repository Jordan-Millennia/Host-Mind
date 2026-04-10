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
          <div className="eyebrow-mono">// PRICING</div>
          <h2 className="h-section mt-5 text-hm-text">Simple, per-unit pricing.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-hm-muted">
            Start with a handful of units. Scale to hundreds. No long-term
            contracts. Final pricing locked in at launch.
          </p>
        </div>

        <div className="mt-16 grid gap-5 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className="bracket-corner relative flex flex-col p-8"
              style={{
                background: t.featured ? 'rgba(0,200,255,0.05)' : '#080D14',
                border: t.featured
                  ? '2px solid #00C8FF'
                  : '1px solid rgba(0,200,255,0.12)',
                borderRadius: 2,
                boxShadow: t.featured ? '0 0 40px rgba(0,200,255,0.12)' : 'none',
              }}
            >
              {t.featured && (
                <div
                  className="absolute right-0 top-0 font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
                  style={{
                    background: '#00C8FF',
                    color: '#020408',
                    padding: '3px 10px',
                    borderRadius: '0 2px 0 2px',
                  }}
                >
                  Recommended
                </div>
              )}
              <div>
                <h3 className="font-display text-[20px] font-bold text-hm-text">
                  {t.name}
                </h3>
                <p className="mt-2 text-[13px] text-hm-muted">{t.tagline}</p>
              </div>
              <div className="mt-8 flex items-baseline gap-2">
                <span className="font-display text-[36px] font-bold text-hm-cyan">
                  {t.price}
                </span>
                <span className="text-[16px] text-hm-muted">{t.unit}</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3.5">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-[13px] text-hm-text/90"
                  >
                    <span className="font-mono text-[13px] font-bold text-hm-cyan">
                      →
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#waitlist"
                className={`mt-9 block text-center ${
                  t.featured ? 'btn-sharp-primary' : 'btn-sharp-outline'
                }`}
              >
                {t.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
