"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useTransition } from "react"

const STATUS_CHIPS = [
  { key: "all",        label: "All" },
  { key: "past_due",   label: "Past Due" },
  { key: "vacant",     label: "Vacant" },
  { key: "moving",     label: "Moving" },
  { key: "needs_flip", label: "Needs Flip" },
  { key: "occupied",   label: "Occupied" },
] as const

type Owner = { id: string; name: string }
type Property = { id: string; address: string }

export function FilterBar({ owners, properties }: { owners: Owner[]; properties: Property[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === "") next.delete(k)
      else next.set(k, v)
    })
    next.delete("page")  // any change resets to page 1
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  const status = sp.get("status") ?? "all"
  const ownerId = sp.get("ownerId") ?? ""
  const propertyId = sp.get("propertyId") ?? ""
  const q = sp.get("q") ?? ""

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <input
        defaultValue={q}
        onKeyDown={(e) => {
          if (e.key === "Enter") update({ q: (e.target as HTMLInputElement).value || null })
        }}
        placeholder="Search address, member, room…"
        className="flex-1 min-w-[220px] text-sm px-3 py-2 rounded-md border border-[color:var(--color-hairline)] bg-[color:var(--color-paper)] focus:outline-none focus:border-[color:var(--color-hairline-hi)]"
      />

      <div className="flex gap-1 flex-wrap">
        {STATUS_CHIPS.map((c) => {
          const active = status === c.key
          return (
            <button
              key={c.key}
              onClick={() => update({ status: c.key === "all" ? null : c.key })}
              aria-pressed={active}
              className={`text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border transition-colors ${
                active
                  ? "bg-[color:var(--color-ink-2)] text-[color:var(--color-paper)] border-[color:var(--color-ink-2)]"
                  : "bg-[color:var(--color-paper)] text-[color:var(--color-ink-3)] border-[color:var(--color-hairline)] hover:border-[color:var(--color-hairline-hi)]"
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <select
        value={ownerId}
        onChange={(e) => update({ ownerId: e.target.value || null })}
        className="text-sm px-2 py-2 rounded-md border border-[color:var(--color-hairline)] bg-[color:var(--color-paper)]"
      >
        <option value="">All Owners</option>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>

      <select
        value={propertyId}
        onChange={(e) => update({ propertyId: e.target.value || null })}
        className="text-sm px-2 py-2 rounded-md border border-[color:var(--color-hairline)] bg-[color:var(--color-paper)] max-w-[260px]"
      >
        <option value="">All Properties</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
      </select>

      {pending && <span className="text-[11px] text-[color:var(--color-ink-3)]">…</span>}
    </div>
  )
}
