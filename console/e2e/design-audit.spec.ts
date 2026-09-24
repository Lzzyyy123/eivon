import { expect, test } from "@playwright/test";
import { signInThroughUI } from "./auth";

test("authentication page fits desktop and mobile viewports", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".auth-form h1")).toHaveText(/Create your workspace|Welcome back/);
  const desktopForm = await page.locator(".auth-form").boundingBox();
  expect(desktopForm?.width).toBeGreaterThan(380);
  await page.screenshot({ path: "/tmp/eivon-setup-after-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileForm = await page.locator(".auth-form").boundingBox();
  expect(mobileForm?.x).toBeGreaterThanOrEqual(20);
  expect(mobileForm!.x + mobileForm!.width).toBeLessThanOrEqual(370);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/eivon-setup-after-mobile.png", fullPage: true });
});

test("knowledge workspace fits desktop and mobile viewports", async ({ page }) => {
  await signInThroughUI(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "08 Knowledge", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Knowledge", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New collection" }).first()).toBeVisible();
  await page.screenshot({ path: "/tmp/eivon-knowledge-after-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/eivon-knowledge-after-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "New collection" }).first().click();
  await expect(page.getByRole("dialog", { name: "Create collection" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
