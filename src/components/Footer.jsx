import { HexLogo } from './Navbar.jsx'

export default function Footer() {
  return (
    <footer
      className="border-t bg-hm-bg"
      style={{ borderColor: 'rgba(0,200,255,0.08)' }}
    >
      <div className="container-xl py-16">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <HexLogo size={24} />
              <span className="font-display text-[16px] font-semibold tracking-tight text-hm-text">
                HostMind
              </span>
            </div>
            <p className="mt-5 max-w-xs text-[13px] leading-relaxed text-hm-muted">
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

        <div
          className="mt-14 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row"
          style={{ borderColor: 'rgba(0,200,255,0.08)' }}
        >
          <p className="font-mono text-[11px] text-[rgba(107,127,163,0.7)]">
            © 2025 HostMind. All rights reserved.
          </p>
          <a
            href="mailto:hello@hostmind.ai"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-hm-muted transition-colors duration-150 hover:text-hm-cyan"
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
      <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-hm-cyan">
        {title}
      </h4>
      <ul className="mt-5 space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-hm-muted transition-colors duration-150 hover:text-hm-cyan"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
