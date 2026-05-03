import { test, expect } from "@playwright/test"

test("anonymous users are redirected from /rooms to /sign-in", async ({ page }) => {
  await page.goto("/rooms")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("public landing page shows the brand and a sign-in CTA", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("CoHost Management")).toBeVisible()
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible()
})

test("/api/clerk-webhook rejects unsigned POSTs", async ({ request }) => {
  const res = await request.post("/api/clerk-webhook", {
    data: { type: "user.created", data: {} },
  })
  expect(res.status()).toBe(400) // missing svix headers
})
