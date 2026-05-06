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
