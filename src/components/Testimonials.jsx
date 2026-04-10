import { motion } from 'framer-motion'

const testimonials = [
  {
    stat: '4 hrs → 3 min',
    quote:
      'Response time dropped from four hours to under three minutes. Our review scores jumped inside a month.',
    name: 'Marcus H.',
    role: 'STR operator · 18 units',
  },
  {
    stat: '+22%',
    quote:
      'Occupancy up 22% in 60 days. HostMind caught pricing gaps we never would have spotted across platforms.',
    name: 'Priya S.',
    role: 'Portfolio investor · 34 units',
  },
  {
    stat: 'Zero',
    quote:
      'Zero lockouts since deploying HostMind. The smart lock automation alone paid for the entire service.',
    name: 'Devon R.',
    role: 'PadSplit host · 9 houses',
  },
]

export default function Testimonials() {
  return (
    <section className="section relative">
      <div className="container-xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="eyebrow">Results</span>
          <h2 className="h-section mt-6">
            What operators see in the first 60 days.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="glass-card flex h-full flex-col p-8"
            >
              <div className="bg-gradient-to-r from-brand-cyan to-brand-blue bg-clip-text font-[Sora] text-4xl font-bold text-transparent">
                {t.stat}
              </div>
              <blockquote className="mt-5 flex-1 text-sm leading-relaxed text-white/80">
                "{t.quote}"
              </blockquote>
              <figcaption className="mt-6 border-t border-white/10 pt-5">
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="text-xs text-white/50">{t.role}</div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}
