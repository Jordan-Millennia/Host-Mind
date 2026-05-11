import { defineConfig } from "vitest/config"
import { config } from "dotenv"
import { resolve } from "node:path"

// Load environment variables from .env.local FIRST, OVERRIDING anything the
// parent shell may have leaked in (e.g. a stray DATABASE_URL from an earlier
// `railway run` invocation pointing at prod). Without `override: true`, dotenv
// keeps the shell's value — which is how integration tests once briefly wrote
// to prod from a dev worktree. Never again.
config({ path: resolve(__dirname, ".env.local"), override: true })

// Defense in depth: refuse to run if DATABASE_URL looks like a managed/prod
// host. Local dev must be on localhost; CI is on the GitHub Actions service-
// container postgres at localhost:5432/roomos_ci.
const url = process.env.DATABASE_URL ?? ""
const looksLikeProd =
  /\.rlwy\.net|\.railway\.app|switchyard\.proxy|amazonaws\.com|render\.com|supabase\.co|neon\.tech/i.test(url)
if (looksLikeProd) {
  throw new Error(
    `DATABASE_URL appears to point at a managed/production host (${url.replace(/:[^@]*@/, ":***@")}). ` +
      `Tests refuse to run against non-local databases. Update .env.local or unset DATABASE_URL.`,
  )
}

export default defineConfig({
  test: {},
})
