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
    <section className="relative py-16">
      <div className="container-xl">
        <div className="mx-auto flex flex-col items-center">
          <div className="flex w-full items-center gap-4">
            <span className="h-px flex-1 bg-[rgba(0,200,255,0.08)]" />
            <span className="label-mono">Trusted across platforms</span>
            <span className="h-px flex-1 bg-[rgba(0,200,255,0.08)]" />
          </div>
          <div className="mt-10 grid w-full grid-cols-2 items-center justify-items-center gap-8 sm:grid-cols-3 lg:grid-cols-6">
            {platforms.map((name) => (
              <div
                key={name}
                className="group relative flex items-center pl-3 font-display text-[17px] font-medium tracking-tight text-hm-muted transition-colors duration-150 hover:text-hm-cyan"
              >
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 scale-y-0 bg-hm-cyan transition-transform duration-200 group-hover:scale-y-100" />
                {name}
              </div>
            ))}
          </div>
          <div className="mt-10 h-px w-full bg-[rgba(0,200,255,0.08)]" />
        </div>
      </div>
    </section>
  )
}
