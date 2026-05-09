"use client"

import { useState, useTransition } from "react"
import { importOwnersCsv, type ImportReport } from "@/app/(signed-in)/settings/owners/actions"

export function CsvImportForm() {
  const [report, setReport] = useState<ImportReport | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const out = await importOwnersCsv(fd)
      setReport(out)
    })
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md p-5 bg-[color:var(--color-paper)]">
      <p className="text-sm text-[color:var(--color-muted)] mb-3">
        Upload a CSV with columns <code>address,owner_name,owner_email</code>. Owners are created if missing
        and matched by name+email. Properties are matched by exact address.
      </p>
      <form onSubmit={onSubmit} className="flex gap-2 items-center flex-wrap">
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="text-[10px] font-semibold uppercase tracking-[0.14em] px-4 py-[8px] rounded-md bg-[color:var(--color-coral)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-coral-light)] disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </form>

      {report && (
        <div className="mt-4 text-sm">
          <p>
            Created <strong>{report.created}</strong> owners,
            reused <strong>{report.reused}</strong>,
            assigned <strong>{report.assigned}</strong> properties.
          </p>
          {report.parseErrors.length > 0 && (
            <details className="mt-2 text-[color:var(--color-clay)]">
              <summary className="cursor-pointer">{report.parseErrors.length} parse errors</summary>
              <ul className="mt-1 text-xs list-disc pl-5">
                {report.parseErrors.map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
              </ul>
            </details>
          )}
          {report.notFoundAddresses.length > 0 && (
            <details className="mt-2 text-[color:var(--color-muted)]">
              <summary className="cursor-pointer">{report.notFoundAddresses.length} addresses didn&apos;t match a property</summary>
              <ul className="mt-1 text-xs list-disc pl-5">
                {report.notFoundAddresses.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
