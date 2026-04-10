const features = [
  {
    title: '24/7 Inbox Management',
    desc: 'Scans and responds to guest and member messages across every platform in real time — in your voice, following your rules.',
    icon: InboxIcon,
  },
  {
    title: 'Smart Lock Automation',
    desc: 'Provisions access codes on move-in and revokes them on move-out — zero manual rekeying, zero missed handoffs.',
    icon: LockIcon,
  },
  {
    title: 'Proactive Member Outreach',
    desc: 'Flags past-due balances, sends reminders, and manages follow-ups through a tiered escalation workflow.',
    icon: OutreachIcon,
  },
  {
    title: 'Multi-Platform Support',
    desc: 'Operates natively across Airbnb, PadSplit, VRBO, Furnished Finder, Booking.com, and TurboTenant from a single brain.',
    icon: PlatformIcon,
  },
  {
    title: 'Revenue Intelligence',
    desc: 'Monitors pricing, occupancy gaps, and underperforming listings — then flags the opportunities you would have missed.',
    icon: ChartIcon,
  },
  {
    title: 'Lockout Resolution',
    desc: 'Handles lockout scenarios with a tiered response workflow — triage, verify, re-provision, escalate when needed.',
    icon: ShieldIcon,
  },
]

export default function Features() {
  return (
    <section id="features" className="section relative">
      <div className="container-xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow-mono">// CORE CAPABILITIES</div>
          <h2 className="h-section mt-5 text-hm-text">
            An operating brain for your rentals.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-hm-muted">
            Not a dashboard you log into. An autonomous layer that acts on
            your behalf across every platform, every day.
          </p>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="panel panel-hover bracket-corner p-7"
            >
              <div
                className="inline-flex h-11 w-11 items-center justify-center text-hm-cyan"
                style={{
                  background: 'rgba(0,200,255,0.08)',
                  border: '1px solid rgba(0,200,255,0.2)',
                  borderRadius: 2,
                }}
              >
                <f.icon />
              </div>
              <h3 className="mt-5 font-display text-[16px] font-semibold text-hm-text">
                {f.title}
              </h3>
              <p className="mt-3 text-[14px] leading-[1.6] text-hm-muted">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ----- icons ----- */
const baseProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function InboxIcon() {
  return (
    <svg {...baseProps}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  )
}
function LockIcon() {
  return (
    <svg {...baseProps}>
      <rect x="3" y="11" width="18" height="11" rx="1" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
    </svg>
  )
}
function OutreachIcon() {
  return (
    <svg {...baseProps}>
      <path d="M3 11l18-8-4 18-5-7-9-3Z" />
      <path d="M12 14l5-5" />
    </svg>
  )
}
function PlatformIcon() {
  return (
    <svg {...baseProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg {...baseProps}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  )
}
function ShieldIcon() {
  return (
    <svg {...baseProps}>
      <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}
