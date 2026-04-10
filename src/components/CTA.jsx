import { motion } from 'framer-motion'

export default function CTA() {
  return (
    <section className="section relative">
      <div className="container-xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 p-12 text-center sm:p-16"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-brand-cyan/20 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-brand-blue/20 blur-3xl" />
            <div className="absolute inset-0 bg-grid opacity-50" />
          </div>

          <div className="relative">
            <h2 className="h-section bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              Ready to stop managing and start growing?
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-white/60">
              HostMind is onboarding operators now. Your portfolio could be
              running itself by next month.
            </p>
            <div className="mt-10">
              <a href="#waitlist" className="btn-primary text-base">
                Request Early Access
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
