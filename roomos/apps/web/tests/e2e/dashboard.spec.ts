import { test, expect } from "@playwright/test"

test("anonymous /rooms redirects to /sign-in (regression)", async ({ page }) => {
  await page.goto("/rooms")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /all-rooms redirects to /sign-in", async ({ page }) => {
  await page.goto("/all-rooms")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /activity redirects to /sign-in", async ({ page }) => {
  await page.goto("/activity")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /rooms/<id> redirects to /sign-in", async ({ page }) => {
  await page.goto("/rooms/anything")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /settings redirects to /sign-in", async ({ page }) => {
  await page.goto("/settings")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /settings/integrations redirects to /sign-in", async ({ page }) => {
  await page.goto("/settings/integrations")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /settings/owners redirects to /sign-in", async ({ page }) => {
  await page.goto("/settings/owners")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /settings/team redirects to /sign-in", async ({ page }) => {
  await page.goto("/settings/team")
  await expect(page).toHaveURL(/\/sign-in/)
})
