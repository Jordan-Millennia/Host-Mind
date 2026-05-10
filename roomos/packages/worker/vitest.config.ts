import { defineConfig } from "vitest/config"
import { config } from "dotenv"
import { resolve } from "node:path"

// Load environment variables from .env.local
config({ path: resolve(__dirname, ".env.local") })

export default defineConfig({
  test: {
    // Integration tests hit Postgres and can take 10–15 s.
    // Keeping this well above the longest observed run (14.8 s) to prevent
    // zombie async operations that corrupt subsequent beforeEach cleanups.
    testTimeout: 30000,
    // Member table has @@unique([platform, externalMemberId]) with no org scope.
    // Running DB test files in parallel causes cross-file unique-constraint races
    // (e.g., both persist-member and sync.integration create vault:28685-R6-*).
    // Sequential file execution is the correct isolation strategy for a shared DB.
    fileParallelism: false,
  },
})
