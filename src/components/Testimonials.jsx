const testimonials = [
  {
    stat: '4 hrs → 3 min',
    quote:
      'Response time dropped from four hours to under three minutes. Our review scores jumped inside a month.',
    name: 'Marcus H.',
    role: 'STR operator · 18 units',
    color: '#00C8FF',
  },
  {
    stat: '+22%',
    quote:
      'Occupancy up 22% in 60 days. HostMind caught pricing gaps we never would have spotted across platforms.',
    name: 'Priya S.',
    role: 'Portfolio investor · 34 units',
    color: '#7B2FFF',
  },
  {
    stat: 'Zero',
    quote:
      'Zero lockouts since deploying HostMind. The smart lock automation alone paid for the entire service.',
    name: 'Devon R.',
    role: 'PadSplit host · 9 houses',
    color: '#00C8FF',
  },
]

export default function Testimonials() {
  return (
    <section className="section relative">
      <div className="container-xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow-mono">// OPERATOR RESULTS</div>
          <h2 className="h-section mt-5 text-hm-text">
            What operators see in the first 60 days.
          </h2>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="panel flex h-full flex-col p-8"
              style={{ borderLeft: `3px solid ${t.color}` }}
            >
              <div
                className="font-display text-[28px] font-bold"
                style={{ color: t.color }}
              >
                {t.stat}
              </div>
              <blockquote className="mt-5 flex-1 text-[14px] italic leading-[1.65] text-hm-text/85">
                "{t.quote}"
              </blockquote>
              <figcaption className="mt-6 border-t border-[rgba(0,200,255,0.1)] pt-5">
                <div className="font-display text-[14px] font-semibold text-hm-text">
                  {t.name}
                </div>
                <div className="mt-1 font-mono text-[11px] text-hm-muted">
                  {t.role}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
