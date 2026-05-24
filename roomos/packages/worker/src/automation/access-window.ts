// Pure access-code helpers — no env, no I/O, so they stay unit-testable in
// isolation (ttlock.ts re-exports these but also imports env at load time).

/** Access window in epoch ms: from 1h before move-in through 1h after the checkout day. */
export function codeWindow(moveInDate: Date, leaseEndDate: Date): { startMs: number; endMs: number } {
  const startMs = moveInDate.getTime() - 3_600_000
  const endMs = leaseEndDate.getTime() + 24 * 3_600_000 + 3_600_000
  return { startMs, endMs }
}

/** Random 6-digit PIN as a string. */
export function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}
