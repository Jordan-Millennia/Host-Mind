import { useState } from 'react'
import { motion } from 'framer-motion'

// Replace YOUR_FORM_ID with the endpoint you get after creating a free form at https://formspree.io
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID'

const initialState = {
  name: '',
  email: '',
  phone: '',
  units: '',
  platform: '',
}

export default function Waitlist() {
  const [form, setForm] = useState(initialState)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | submitting | success | error

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const validate = () => {
    const next = {}
    if (!form.name.trim()) next.name = true
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) next.email = true
    if (!form.units) next.units = true
    if (!form.platform) next.platform = true
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setStatus('submitting')
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setStatus('success')
        setForm(initialState)
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <section id="waitlist" className="section relative">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-cyan/10 blur-[120px]" />
      </div>

      <div className="container-xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="glass-card mx-auto max-w-3xl overflow-hidden p-8 sm:p-12"
        >
          <div className="text-center">
            <span className="eyebrow">Early Access</span>
            <h2 className="h-section mt-6">Get Early Access</h2>
            <p className="mt-4 text-lg text-white/60">
              HostMind is onboarding property operators now. Join the waitlist
              and we'll reach out to get you set up.
            </p>
          </div>

          {status === 'success' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-10 rounded-xl border border-brand-glow/40 bg-brand-glow/10 p-8 text-center"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-glow/20 ring-1 ring-brand-glow/50">
                <svg className="h-7 w-7 text-brand-glow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </div>
              <h3 className="mt-4 font-[Sora] text-xl font-bold">You're on the list.</h3>
              <p className="mt-2 text-sm text-white/70">
                We'll be in touch shortly.
              </p>
            </motion.div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-10 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Full Name"
                  required
                  error={errors.name}
                  value={form.name}
                  onChange={update('name')}
                  placeholder="Jane Doe"
                />
                <Field
                  label="Email Address"
                  required
                  type="email"
                  error={errors.email}
                  value={form.email}
                  onChange={update('email')}
                  placeholder="jane@example.com"
                />
              </div>

              <Field
                label="Phone Number"
                type="tel"
                value={form.phone}
                onChange={update('phone')}
                placeholder="(555) 123-4567"
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Select
                  label="Number of Units"
                  required
                  error={errors.units}
                  value={form.units}
                  onChange={update('units')}
                  options={['1–3', '4–10', '11–25', '25+']}
                />
                <Select
                  label="Primary Platform"
                  required
                  error={errors.platform}
                  value={form.platform}
                  onChange={update('platform')}
                  options={['Airbnb', 'PadSplit', 'VRBO', 'Furnished Finder', 'Mixed', 'Other']}
                />
              </div>

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="btn-primary w-full text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'submitting' ? 'Joining…' : 'Join the Waitlist'}
              </button>

              {status === 'error' && (
                <p className="text-center text-sm text-red-300">
                  Something went wrong. Please try again or email hello@hostmind.ai.
                </p>
              )}
              <p className="text-center text-xs text-white/40">
                No spam. We'll only reach out about your waitlist spot.
              </p>
            </form>
          )}
        </motion.div>
      </div>
    </section>
  )
}

function Field({ label, required, error, ...rest }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">
        {label} {required && <span className="text-brand-glow">*</span>}
      </span>
      <input
        {...rest}
        className={`w-full rounded-lg border bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:bg-white/[0.07] ${
          error
            ? 'border-red-400/60 focus:border-red-400'
            : 'border-white/10 focus:border-brand-glow/60'
        }`}
      />
    </label>
  )
}

function Select({ label, required, error, options, ...rest }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">
        {label} {required && <span className="text-brand-glow">*</span>}
      </span>
      <select
        {...rest}
        className={`w-full rounded-lg border bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:bg-white/[0.07] ${
          error
            ? 'border-red-400/60 focus:border-red-400'
            : 'border-white/10 focus:border-brand-glow/60'
        }`}
      >
        <option value="" className="bg-ink-900">Select…</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-ink-900">
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
