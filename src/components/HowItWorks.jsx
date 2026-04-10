import { motion } from 'framer-motion'

const steps = [
  {
    n: '01',
    title: 'Connect your properties and platforms',
    desc: 'Link Airbnb, PadSplit, VRBO, Furnished Finder, TurboTenant, and your smart locks. HostMind pulls in your units, listings, and inbox in minutes.',
  },
  {
    n: '02',
    title: 'HostMind learns your rules',
    desc: 'Teach it your house policies, pricing logic, move-in workflows, and escalation rules once. It applies them consistently across every unit, every platform, forever.',
  },
  {
    n: '03',
    title: 'Sit back — HostMind handles everything',
    desc: 'From first inquiry to move-out cleanup. Messages answered, codes provisioned, payments chased, revenue optimized. You get a weekly summary and only hear from it when something truly needs you.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how" className="section relative">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-blue/5 blur-[120px]" />
      </div>

      <div className="container-xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">How It Works</span>
          <h2 className="h-section mt-6">Three steps to autonomous operations.</h2>
          <p className="mt-5 text-lg text-white/60">
            Setup takes a morning. After that, HostMind runs your portfolio
            while you focus on acquisition.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="glass-card relative p-8"
            >
              <div className="flex items-center gap-4">
                <div className="font-[Sora] text-5xl font-bold text-transparent [-webkit-text-stroke:1px_rgba(34,211,238,0.5)]">
                  {s.n}
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-brand-glow/40 to-transparent" />
              </div>
              <h3 className="mt-6 font-[Sora] text-xl font-semibold">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
