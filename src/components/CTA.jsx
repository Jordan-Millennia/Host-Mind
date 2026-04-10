export default function CTA() {
  return (
    <section className="section relative">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'rgba(0,200,255,0.08)' }}
      />
      <div className="container-xl">
        <div
          className="relative overflow-hidden px-8 py-20 text-center sm:px-16 sm:py-24"
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(0,200,255,0.06), transparent 70%)',
          }}
        >
          <div className="relative">
            <div className="eyebrow-mono">// DEPLOY NOW</div>
            <h2 className="h-section mx-auto mt-5 max-w-3xl text-hm-text">
              Ready to stop managing and start growing?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-hm-muted">
              HostMind is onboarding operators now. Your portfolio could be
              running itself by next month.
            </p>
            <div className="mt-10">
              <a href="#waitlist" className="btn-sharp-primary">
                Request Early Access
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
