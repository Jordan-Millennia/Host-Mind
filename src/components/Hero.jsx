export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-36 sm:pt-44">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-[rgba(0,100,255,0.08)] blur-[140px]" />
      </div>

      <div className="container-xl relative">
        <div className="mx-auto max-w-4xl text-center">
          {/* Status badge */}
          <div className="inline-flex items-center gap-2 border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] px-3 py-1.5" style={{ borderRadius: 2 }}>
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-hm-green" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-hm-cyan">
              Autonomous AI Co-Hosting
            </span>
          </div>

          <h1 className="h-display mt-8 text-hm-text">
            Your Properties Run{' '}
            <span className="bg-gradient-to-br from-hm-cyan to-hm-violet bg-clip-text text-transparent">
              Themselves.
            </span>
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-hm-muted sm:text-[18px]">
            HostMind is the AI co-host that manages guest communication, access,
            and operations across every platform — automatically.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="#waitlist" className="btn-sharp-primary">
              Get Started
              <ArrowIcon />
            </a>
            <a href="#how" className="btn-sharp-secondary">
              See How It Works
            </a>
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
            <span className="hero-chip">
              <InboxMiniIcon /> Real-time inbox
            </span>
            <span className="hero-chip">
              <LockMiniIcon /> Smart lock control
            </span>
            <span className="hero-chip">
              <ChartMiniIcon /> Revenue intelligence
            </span>
            <span className="hero-chip">
              <ClockMiniIcon /> Operates 24/7
            </span>
          </div>
        </div>

        {/* Operations dashboard mock */}
        <div className="relative mx-auto mt-20 max-w-5xl">
          <div className="pointer-events-none absolute -inset-4 bg-gradient-to-r from-[rgba(0,200,255,0.08)] via-[rgba(123,47,255,0.08)] to-[rgba(0,200,255,0.08)] blur-2xl" />
          <div className="scan-line-overlay relative overflow-hidden border border-[rgba(0,200,255,0.18)] bg-hm-surface" style={{ borderRadius: 4, boxShadow: '0 0 60px rgba(0,200,255,0.06)' }}>
            <DashboardMock />
          </div>
        </div>
      </div>
    </section>
  )
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

function DashboardMock() {
  const stats = [
    { label: 'Active Listings', val: '42', sub: '+ 3 this week', up: true },
    { label: 'Messages Handled', val: '1,284', sub: 'avg 2.1 min reply', up: false },
    { label: 'Occupancy', val: '94%', sub: '+ 22% vs last qtr', up: true },
  ]

  const activity = [
    {
      platform: 'Airbnb',
      color: '#FF5A5F',
      msg: 'Replied to guest inquiry — "Check-in available at 3pm"',
    },
    {
      platform: 'PadSplit',
      color: '#00C8FF',
      msg: 'Sent past-due reminder to member at 2101 Oak Ln #B',
    },
    {
      platform: 'Smart Lock',
      color: '#7B2FFF',
      msg: 'Provisioned access code for new reservation #48201',
    },
  ]

  return (
    <div className="relative z-[3] flex flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-[rgba(0,200,255,0.12)] px-5 py-3.5">
        <span className="pulse-dot h-2 w-2 rounded-full bg-hm-green" />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-hm-green">
          System Online
        </span>
        <span className="mx-3 h-4 w-px bg-[rgba(0,200,255,0.15)]" />
        <span className="font-mono text-[11px] text-hm-muted">hostmind.ai / operations</span>
        <span className="ml-auto font-mono text-[10px] text-hm-muted">UTC 04:28:17</span>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bracket-corner p-5"
            style={{
              background: 'rgba(0,200,255,0.04)',
              border: '1px solid rgba(0,200,255,0.1)',
              borderRadius: 2,
            }}
          >
            <div className="label-mono">{s.label}</div>
            <div className="mt-3 font-display text-[32px] font-bold leading-none text-hm-text">
              {s.val}
            </div>
            <div className={`mt-2 font-mono text-[11px] ${s.up ? 'text-hm-green' : 'text-hm-muted'}`}>
              {s.up && <span className="mr-1">↑</span>}
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Live activity */}
      <div className="border-t border-[rgba(0,200,255,0.12)] p-6 pt-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="label-mono">Live Activity</span>
          <span className="h-px flex-1 bg-[rgba(0,200,255,0.08)]" />
        </div>
        <div className="space-y-2.5">
          {activity.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-1.5 pl-3"
              style={{ borderLeft: `2px solid ${r.color}` }}
            >
              <span
                className="font-mono text-[10px] font-medium uppercase tracking-[0.1em]"
                style={{
                  color: r.color,
                  background: `${r.color}14`,
                  border: `1px solid ${r.color}40`,
                  padding: '2px 8px',
                  borderRadius: 2,
                  minWidth: 88,
                  textAlign: 'center',
                }}
              >
                {r.platform}
              </span>
              <span className="flex-1 text-[13px] text-hm-text/85">{r.msg}</span>
              <span className="font-mono text-[10px] text-hm-muted">just now</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ----- Mini icons for hero chips (12px, cyan stroke) ----- */
const miniProps = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: '#00C8FF',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function InboxMiniIcon() {
  return (
    <svg {...miniProps}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  )
}
function LockMiniIcon() {
  return (
    <svg {...miniProps}>
      <rect x="3" y="11" width="18" height="11" rx="1" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
function ChartMiniIcon() {
  return (
    <svg {...miniProps}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  )
}
function ClockMiniIcon() {
  return (
    <svg {...miniProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
