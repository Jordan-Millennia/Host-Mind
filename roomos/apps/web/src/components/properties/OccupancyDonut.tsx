import { donutSegments } from "@/lib/format"

export type OccupancyDonutProps = {
  occupied: number
  vacant: number
  moving?: number
  size?: number              // default 32px
  strokeWidth?: number       // default 4
  className?: string
}

const COLOR_VAR: Record<string, string> = {
  occupied: "var(--color-green)",
  vacant: "var(--color-clay)",
  moving: "var(--color-amber)",
}

export function OccupancyDonut({
  occupied,
  vacant,
  moving = 0,
  size = 32,
  strokeWidth = 4,
  className,
}: OccupancyDonutProps) {
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const segments = donutSegments({ occupied, vacant, moving }, r)
  const circumference = 2 * Math.PI * r
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      style={{ transform: "rotate(-90deg)" }}
      aria-label={`${occupied} of ${occupied + vacant + moving} rooms occupied`}
    >
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={strokeWidth} />
      {segments.map((s, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={COLOR_VAR[s.color]}
          strokeWidth={strokeWidth}
          strokeDasharray={`${s.length} ${circumference}`}
          strokeDashoffset={s.offset}
        />
      ))}
    </svg>
  )
}
