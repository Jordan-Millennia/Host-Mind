import { motion } from 'framer-motion'

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 sm:pt-40">
      {/* Background layers */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-brand-cyan/10 blur-[120px]" />
        <div className="absolute right-0 top-40 h-[400px] w-[500px] rounded-full bg-brand-blue/10 blur-[120px]" />
        <Particles />
      </div>

      <div className="container-xl relative">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mx-auto max-w-4xl text-center"
        >
          <span className="eyebrow">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-glow opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-glow" />
            </span>
            Autonomous AI Co-Hosting
          </span>

          <h1 className="h-display mt-8 bg-gradient-to-b from-white via-white to-white/60 bg-clip-text text-transparent">
            Your Properties Run Themselves.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl">
            HostMind is the AI co-host that manages guest communication, access,
            and operations across every platform — automatically.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="#waitlist" className="btn-primary">
              Get Started
              <ArrowIcon />
            </a>
            <a href="#how" className="btn-secondary">
              See How It Works
            </a>
          </div>

          <div className="mt-14 flex flex-wrap items-center justify-center gap-3 text-xs text-white/50">
            <span className="chip">⚡ Real-time inbox</span>
            <span className="chip">🔐 Smart lock control</span>
            <span className="chip">📈 Revenue intelligence</span>
            <span className="chip">🤖 Operates 24/7</span>
          </div>
        </motion.div>

        {/* Dashboard preview mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
          className="relative mx-auto mt-20 max-w-5xl"
        >
          <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-r from-brand-cyan/20 via-brand-blue/20 to-brand-cyan/20 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900/80 backdrop-blur-xl shadow-card">
            <DashboardMock />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

function Particles() {
  const dots = Array.from({ length: 24 })
  return (
    <div className="absolute inset-0 overflow-hidden">
      {dots.map((_, i) => {
        const left = (i * 37) % 100
        const top = (i * 53) % 100
        const delay = (i % 6) * 0.8
        return (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-brand-glow/60"
            style={{ left: `${left}%`, top: `${top}%` }}
            animate={{ y: [0, -20, 0], opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 4 + (i % 4), repeat: Infinity, delay }}
          />
        )
      })}
    </div>
  )
}

function DashboardMock() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400/80" />
        <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
        <span className="h-3 w-3 rounded-full bg-green-400/80" />
        <div className="ml-4 text-xs text-white/50">hostmind.ai / operations</div>
      </div>
      <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
        {[
          { label: 'Active Listings', val: '42', sub: '+ 3 this week' },
          { label: 'Messages Handled', val: '1,284', sub: 'avg 2.1 min reply' },
          { label: 'Occupancy', val: '94%', sub: '+ 22% vs last qtr' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="text-xs uppercase tracking-wider text-white/50">
              {s.label}
            </div>
            <div className="mt-2 font-[Sora] text-2xl font-bold">{s.val}</div>
            <div className="mt-1 text-xs text-brand-glow">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-6">
        <div className="mb-3 text-xs uppercase tracking-wider text-white/50">
          Live activity
        </div>
        <div className="space-y-3">
          {[
            { t: 'Airbnb', m: 'Replied to guest inquiry — "Check-in available at 3pm"', c: 'text-emerald-300' },
            { t: 'PadSplit', m: 'Sent past-due reminder to member at 2101 Oak Ln #B', c: 'text-amber-300' },
            { t: 'Smart Lock', m: 'Provisioned access code for new reservation #48201', c: 'text-brand-glow' },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="chip">{r.t}</span>
              <span className={`text-white/80`}>{r.m}</span>
              <span className={`ml-auto text-xs ${r.c}`}>• just now</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
