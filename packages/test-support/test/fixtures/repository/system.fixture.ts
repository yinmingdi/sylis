test("SYSTEM-001 crosses the HTTP boundary", async ({ page }) => {
  const response = await page.request.get("/api/v1/status");
  expect(response.ok()).toBeTruthy();
});
