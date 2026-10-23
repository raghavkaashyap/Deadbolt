import { test, expect } from "@playwright/test";

test("shows the blocked injection and the legitimate recovery", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Intent becomes a boundary." })).toBeVisible();
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByRole("button", { pressed: true })).toContainText("Blocked");
  await expect(page.getByRole("heading", { name: "04 / Execution provenance" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /LG 27-inch QHD Monitor/ }).click();
  await expect(page.getByRole("button", { pressed: true })).toContainText("Authorized");
  await expect(page.getByText("All policy checks passed", { exact: false })).toBeVisible();
});

test("strict influence policy blocks the checkout price change", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Scenario", { exact: true }).selectOption("price_inflation");
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByRole("button", { pressed: true })).toContainText("Needs review");
  await page.getByLabel("Block untrusted field changes").check();
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByRole("button", { pressed: true })).toContainText("Blocked");
  await page.screenshot({ path: test.info().outputPath("mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("simulation errors are recoverable and the page uses no private API", async ({ page }) => {
  let privateCalls = 0;
  page.on("request", request => { if (/\/api\/(mandates|authorize|approvals|payments)/.test(request.url())) privateCalls++; });
  await page.goto("/");
  await page.route("**/api/simulate", route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Simulation could not run" })).toContainText("try again");
  await page.unroute("**/api/simulate");
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByRole("heading", { name: "02 / Purchase attempts" })).toBeVisible();
  expect(privateCalls).toBe(0);
});


test("simulation endpoint validates its policy flag", async ({ request }) => {
  expect((await request.post("/api/simulate", { data: { scenario: "happy_path", block_on_untrusted_influence: "false" } })).status()).toBe(400);
  expect((await request.post("/api/simulate", { data: { scenario: "toString" } })).status()).toBe(400);
});
