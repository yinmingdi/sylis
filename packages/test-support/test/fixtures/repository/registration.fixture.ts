test("IDENTITY-001-E2E registers through the public form", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
});
