import type { ReactNode } from "react"

export function PlatformCard({
  name,
  status,
  description,
  disabled = false,
  children,
}: {
  name: string
  status: "connected" | "disconnected" | "coming_soon"
  description: string
  disabled?: boolean
  children?: ReactNode
}) {
  const statusColor = status === "connected"
    ? "var(--color-green)"
    : status === "coming_soon"
    ? "var(--color-muted)"
    : "var(--color-clay)"
  const statusLabel = status === "connected" ? "Connected" : status === "coming_soon" ? "Phase 2+" : "Not connected"

  return (
    <div className={`p-7 bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] rounded-md ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">{name}</h3>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-[2px] rounded border"
          style={{ color: statusColor, borderColor: `${statusColor}40`, background: `${statusColor}10` }}
        >
          {statusLabel}
        </span>
      </div>
      <p className="text-sm text-[color:var(--color-muted)] mb-4">{description}</p>
      {children}
    </div>
  )
}
