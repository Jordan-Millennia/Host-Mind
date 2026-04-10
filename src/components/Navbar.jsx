import { useEffect, useState } from 'react'

const links = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How It Works' },
  { href: '#use-cases', label: 'Use Cases' },
  { href: '#pricing', label: 'Pricing' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-[rgba(0,200,255,0.1)] bg-[rgba(2,4,8,0.75)] [backdrop-filter:blur(24px)_saturate(180%)]'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav className="container-xl flex h-16 items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5">
          <HexLogo />
          <span className="font-display text-[17px] font-semibold tracking-tight text-hm-text">
            HostMind
          </span>
        </a>

        <div className="hidden items-center gap-9 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-hm-muted transition-colors duration-150 hover:text-hm-cyan"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:block">
          <a href="#waitlist" className="btn-sharp-outline">
            Get Early Access →
          </a>
        </div>

        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
          className="border border-[rgba(0,200,255,0.2)] bg-[rgba(0,200,255,0.04)] p-2 text-hm-cyan md:hidden"
          style={{ borderRadius: 2 }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-[rgba(0,200,255,0.1)] bg-[rgba(2,4,8,0.95)] backdrop-blur md:hidden">
          <div className="container-xl flex flex-col gap-5 py-6">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-hm-muted"
              >
                {l.label}
              </a>
            ))}
            <a
              href="#waitlist"
              onClick={() => setOpen(false)}
              className="btn-sharp-outline w-full"
            >
              Get Early Access →
            </a>
          </div>
        </div>
      )}
    </header>
  )
}

export function HexLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        stroke="#00C8FF"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 8L23 12V20L16 24L9 20V12L16 8Z"
        stroke="#00C8FF"
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="2.4" fill="#00C8FF" />
      <circle cx="16" cy="16" r="4.5" stroke="#00C8FF" strokeOpacity="0.3" strokeWidth="0.8" />
    </svg>
  )
}
