import { motion } from 'framer-motion'

const platforms = [
  'Airbnb',
  'PadSplit',
  'VRBO',
  'Furnished Finder',
  'Booking.com',
  'TurboTenant',
]

export default function LogoBar() {
  return (
    <section className="relative border-y border-white/5 bg-white/[0.02] py-14">
      <div className="container-xl">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
          Trusted across platforms
        </p>
        <div className="mt-8 grid grid-cols-2 items-center justify-items-center gap-6 sm:grid-cols-3 lg:grid-cols-6">
          {platforms.map((name, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="font-[Sora] text-lg font-semibold tracking-tight text-white/50 transition hover:text-white/90"
            >
              {name}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
