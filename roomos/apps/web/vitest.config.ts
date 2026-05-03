import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
    env: {
      DATABASE_URL: "postgresql://localhost:5432/test",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
      CLERK_SECRET_KEY: "sk_test_placeholder",
      CLERK_WEBHOOK_SECRET: "whsec_placeholder_for_dev",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
