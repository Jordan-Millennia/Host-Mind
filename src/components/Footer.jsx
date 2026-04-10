export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-950">
      <div className="container-xl py-16">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Logo />
              <span className="font-[Sora] text-lg font-bold tracking-tight">
                HostMind
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-white/50">
              The intelligent layer between your property and the platform.
            </p>
          </div>

          <FooterCol
            title="Product"
            links={[
              { label: 'Features', href: '#features' },
              { label: 'How It Works', href: '#how' },
              { label: 'Use Cases', href: '#use-cases' },
              { label: 'Pricing', href: '#pricing' },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { label: 'Contact', href: 'mailto:hello@hostmind.ai' },
              { label: 'Waitlist', href: '#waitlist' },
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              { label: 'Privacy Policy', href: '#' },
              { label: 'Terms of Service', href: '#' },
            ]}
          />
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/40">
            © 2025 HostMind. All rights reserved.
          </p>
          <a
            href="mailto:hello@hostmind.ai"
            className="text-xs text-white/40 transition hover:text-white/70"
          >
            hello@hostmind.ai
          </a>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-widest text-white/60">
        {title}
      </h4>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              className="text-sm text-white/70 transition hover:text-white"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="hm-grad-footer" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" stroke="url(#hm-grad-footer)" strokeWidth="1.5" />
      <path d="M10 22V10m0 6h12m0-6v12" stroke="url(#hm-grad-footer)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2.2" fill="#22D3EE" />
    </svg>
  )
}
