export function EmptyShim({ label }: { label: string }) {
  return (
    <div className="text-[11px] italic text-[color:var(--color-muted)] py-2">
      No rooms in {label} right now — quiet is good news.
    </div>
  )
}
