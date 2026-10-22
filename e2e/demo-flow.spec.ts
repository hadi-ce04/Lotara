import { expect, test, type Page } from "@playwright/test";

// Set E2E_SCREENSHOTS=1 to save full-page screenshots of each view.
const shot = (p: Page, name: string) =>
  process.env.E2E_SCREENSHOTS ? p.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true }) : null;

// Full reduced-MVP journey in a real browser against the real database.
// Note: this resets the demo tenant's data.
test("three kitchens: match, exclusion, missing label resolved, staff report, review", async ({ page, context }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Demo password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText(/Incorrect password/);
  await page.getByLabel("Demo password").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Recall response overview" })).toBeVisible();

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.locator("form [role=status]")).toHaveText(/Demo data reset/);
  const row = (site: string) => page.getByRole("row").filter({ hasText: site });
  await expect(row("Les Lilas")).toContainText("Recorded match");
  await expect(row("Belleville")).toContainText("Not matching this notice");
  await expect(row("Belleville")).toContainText("only under a different GTIN");
  await expect(row("Montreuil")).toContainText("Needs evidence");
  await shot(page, "1-overview");

  // Investigate the incomplete case: it should request the label.
  await row("Montreuil").getByRole("link").click();
  await page.getByRole("button", { name: "Run investigation" }).click();
  await expect(page.getByText(/Open evidence request · lot, best_before/)).toBeVisible();
  await page.getByRole("button", { name: "Request kitchen stock check" }).click();
  await expect(page.getByRole("link", { name: /kitchen page/ })).toBeVisible();
  const kitchenHref = await page.getByRole("link", { name: /kitchen page/ }).getAttribute("href");
  const caseUrl = page.url();
  await shot(page, "2-case-evidence-requested");

  // Kitchen participant: upload the label photo (separate browser context, no manager session).
  const kitchenContext = await context.browser()!.newContext();
  const kitchen = await kitchenContext.newPage();
  await kitchen.goto(new URL(kitchenHref!, caseUrl).toString());
  await expect(kitchen.getByRole("heading", { name: "Crèche Montreuil Centre" })).toBeVisible();
  await shot(kitchen, "3-kitchen");
  await kitchen.locator('input[name="photo"]').setInputFiles("public/demo/synthetic-label-K100.png");
  await kitchen.getByRole("button", { name: "Send photo" }).click();
  await expect(kitchen.locator("form [role=status]")).toHaveText(/Photo sent/);

  // The kitchen cannot read private evidence images.
  const docs = await kitchen.request.get(new URL("/api/documents/00000000-0000-0000-0000-000000000000", caseUrl).toString());
  expect(docs.status()).toBe(401);

  // Manager reads the label and confirms; the case is reassessed.
  await page.reload();
  await expect(page.getByAltText("Uploaded label photo")).toBeVisible();
  await page.getByLabel("Lot code").fill("K100");
  await page.getByLabel("Best before (DD/MM/YYYY)").fill("10/12/2026");
  await page.getByLabel(/I read these values/).check();
  await page.getByRole("button", { name: "Confirm reading & reassess" }).click();
  // The confirm form is replaced by the confirmed values, so assert persisted state.
  await expect(page.locator("main header")).toContainText("Recorded match");
  await expect(page.getByText("Confirmed lot: K100 by demo-manager")).toBeVisible();
  await expect(page.getByText("Confirmed label reading").first()).toBeVisible();

  // Kitchen reports a typed, confirmed action.
  await kitchen.reload();
  await kitchen.getByLabel(/I set aside the affected stock/).check();
  await kitchen.getByLabel(/Quantity/).fill("2");
  await kitchen.getByLabel("Unit").fill("cartons");
  await kitchen.getByLabel(/I confirm this report/).check();
  await kitchen.getByRole("button", { name: "Send report" }).click();
  await expect(kitchen.locator("form [role=status]")).toHaveText(/Report recorded/);
  await kitchenContext.close();

  // Manager reviews; state persists across reload.
  await page.reload();
  await expect(page.getByText(/Participant reported: Set aside/)).toBeVisible();
  await shot(page, "4-case-reported");
  await page.getByRole("button", { name: "Mark reviewed complete" }).click();
  await expect(page.locator("main header")).toContainText("Reviewed complete");
  await page.goto("/");
  await expect(row("Montreuil")).toContainText("Recorded match");
  await expect(row("Montreuil")).toContainText("Reviewed complete");
  await shot(page, "5-overview-final");
});
