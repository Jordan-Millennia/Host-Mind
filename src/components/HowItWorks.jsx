import { Fragment } from 'react'

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
      <div className="container-xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow-mono">// DEPLOYMENT SEQUENCE</div>
          <h2 className="h-section mt-5 text-hm-text">
            Three steps to autonomous operations.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-hm-muted">
            Setup takes a morning. After that, HostMind runs your portfolio
            while you focus on acquisition.
          </p>
        </div>

        <div className="mt-20 grid gap-8 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-0">
          {steps.map((s, i) => (
            <Fragment key={s.n}>
              <StepCard step={s} />
              {i < steps.length - 1 && (
                <div className="hidden items-center px-4 lg:flex">
                  <div className="connector-dashed w-full min-w-[60px]" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}

function StepCard({ step }) {
  return (
    <div className="panel bracket-corner relative overflow-hidden p-8 pt-10">
      {/* Watermark number */}
      <div
        className="pointer-events-none absolute right-6 top-4 font-mono font-bold leading-none"
        style={{
          fontSize: 80,
          color: 'rgba(0,200,255,0.06)',
          letterSpacing: '-0.04em',
        }}
      >
        {step.n}
      </div>

      {/* Step badge */}
      <div
        className="relative flex h-8 w-8 items-center justify-center font-mono text-[12px] font-bold text-hm-cyan"
        style={{
          border: '1px solid rgba(0,200,255,0.3)',
          borderRadius: '50%',
        }}
      >
        {step.n}
      </div>

      <h3 className="relative mt-6 font-display text-[18px] font-semibold text-hm-text">
        {step.title}
      </h3>
      <p className="relative mt-3 text-[14px] leading-[1.6] text-hm-muted">
        {step.desc}
      </p>
    </div>
  )
}
