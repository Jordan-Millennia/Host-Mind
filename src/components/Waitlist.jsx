import { useState } from 'react'

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
  const [status, setStatus] = useState('idle')

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
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,200,255,0.05), transparent 70%)',
        }}
      />

      <div className="container-xl">
        <div className="panel bracket-corner mx-auto max-w-[640px] p-10 sm:p-12">
          <div className="text-center">
            <div className="eyebrow-mono">// EARLY ACCESS</div>
            <h2 className="h-section mt-5 text-hm-text">Get Early Access</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-hm-muted">
              HostMind is onboarding property operators now. Join the waitlist
              and we'll reach out to get you set up.
            </p>
          </div>

          {status === 'success' ? (
            <div
              className="mt-10 p-8 text-center"
              style={{
                background: 'rgba(0,255,148,0.06)',
                border: '1px solid rgba(0,255,148,0.35)',
                borderRadius: 2,
              }}
            >
              <div className="font-mono text-[13px] text-hm-green">
                ✓ You're on the list.
              </div>
              <div className="mt-3 text-[14px] text-hm-text/80">
                We'll be in touch shortly.
              </div>
            </div>
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
                className="font-display text-[14px] font-bold disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  width: '100%',
                  height: 48,
                  background: '#00C8FF',
                  color: '#020408',
                  border: 'none',
                  borderRadius: 2,
                  transition: 'filter 150ms ease, box-shadow 150ms ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = 'brightness(1.1)'
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(0,200,255,0.4)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = ''
                  e.currentTarget.style.boxShadow = ''
                }}
              >
                {status === 'submitting' ? 'Joining…' : 'Join the Waitlist'}
              </button>

              {status === 'error' && (
                <p className="text-center font-mono text-[12px] text-red-300">
                  Something went wrong. Please try again or email hello@hostmind.ai.
                </p>
              )}
              <p className="text-center font-mono text-[11px] text-hm-muted">
                No spam. We'll only reach out about your waitlist spot.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

const inputStyle = (error) => ({
  width: '100%',
  background: 'rgba(0,200,255,0.03)',
  border: error ? '1px solid rgba(255,100,100,0.6)' : '1px solid rgba(0,200,255,0.15)',
  borderRadius: 2,
  padding: '12px 14px',
  color: '#F0F4FF',
  fontFamily: 'Inter, sans-serif',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
})

function Field({ label, required, error, ...rest }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-hm-muted">
        {label} {required && <span className="text-hm-cyan">*</span>}
      </span>
      <input
        {...rest}
        style={inputStyle(error)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#00C8FF'
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.15)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error
            ? 'rgba(255,100,100,0.6)'
            : 'rgba(0,200,255,0.15)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />
    </label>
  )
}

function Select({ label, required, error, options, ...rest }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-hm-muted">
        {label} {required && <span className="text-hm-cyan">*</span>}
      </span>
      <div className="relative">
        <select
          {...rest}
          style={{
            ...inputStyle(error),
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            paddingRight: 40,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#00C8FF'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.15)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error
              ? 'rgba(255,100,100,0.6)'
              : 'rgba(0,200,255,0.15)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6B7FA3"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </label>
  )
}
