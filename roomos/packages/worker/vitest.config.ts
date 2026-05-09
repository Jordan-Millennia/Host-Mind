import { defineConfig } from "vitest/config"
import { config } from "dotenv"
import { resolve } from "node:path"

// Load environment variables from .env.local
config({ path: resolve(__dirname, ".env.local") })

export default defineConfig({
  test: {},
})
