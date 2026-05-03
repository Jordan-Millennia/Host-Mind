/** Returns a randomized delay in milliseconds, biased gaussian around `meanMs`.
 *  Result is clamped to [meanMs * 0.4, meanMs * 1.8]. */
export function jitterMs(meanMs: number): number {
  // Box-Muller transform → centered around 1.0, σ ~ 0.3
  const u1 = Math.random() || 1e-9
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const factor = 1 + z * 0.3
  const clamped = Math.max(0.4, Math.min(1.8, factor))
  return Math.round(meanMs * clamped)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const jitterSleep = (meanMs: number) => sleep(jitterMs(meanMs))
