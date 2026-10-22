// Renders the submission slide and evidence image: node docs/submission/render.mjs
import { chromium } from "@playwright/test";
import path from "node:path";
const dir = path.resolve("docs/submission");
const browser = await chromium.launch();
for (const [name, w, h] of [["slide", 1920, 1080], ["evidence", 1600, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto("file:///" + path.join(dir, `${name}.html`).replaceAll("\\", "/"));
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  if (name === "slide") await page.pdf({ path: path.join(dir, "slide.pdf"), width: "1920px", height: "1080px", printBackground: true });
  console.log("rendered", name);
}
await browser.close();
