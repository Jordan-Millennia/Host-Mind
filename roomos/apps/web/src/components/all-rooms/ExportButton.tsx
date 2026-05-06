"use client"

import { useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { exportCsv } from "@/app/(signed-in)/all-rooms/actions"

export function ExportButton() {
  const sp = useSearchParams()
  const [pending, start] = useTransition()

  function download() {
    start(async () => {
      const fd = new FormData()
      sp.forEach((v, k) => fd.append(k, v))
      const { filename, csv } = await exportCsv(fd)
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <button
      onClick={download}
      disabled={pending}
      className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] hover:border-[color:var(--color-rule-hi)] disabled:opacity-50"
    >
      {pending ? "Exporting…" : "Export CSV"}
    </button>
  )
}
