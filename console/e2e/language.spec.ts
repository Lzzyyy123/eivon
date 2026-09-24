import { expect, test } from "@playwright/test";
import { signInThroughUI } from "./auth";

test("switch language before signing in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Interface language" }).selectOption("zh-CN");
  await expect(page.getByRole("heading", { name: /创建工作区|欢迎回来/ })).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
  await page.getByRole("combobox", { name: "界面语言" }).selectOption("en");
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("switch language across the console and retain the preference", async ({ page }) => {
  await signInThroughUI(page);
  await page.getByRole("combobox", { name: "Interface language" }).selectOption("zh-CN");
  await expect(page.getByRole("heading", { name: "总览", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近运行" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

  const pages = [
    ["02 智能体", "智能体"], ["03 资源", "资源"], ["04 工作流", "工作流"],
    ["05 对话台", "对话台"], ["06 运行记录", "运行记录"],
    ["07 评测中心", "评测中心"], ["08 知识库", "知识库"],
    ["09 成员", "成员"], ["10 设置", "设置"],
  ] as const;
  for (const [navigation, title] of pages) {
    await page.getByRole("button", { name: navigation, exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
  }
  await page.screenshot({ path: "/tmp/eivon-settings-zh.png" });

  await page.reload();
  await expect(page.getByRole("heading", { name: "总览", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "界面语言" })).toHaveValue("zh-CN");
  await page.getByRole("button", { name: "10 设置", exact: true }).click();
  await page.getByRole("group", { name: "界面语言" }).getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("mobile overview and language switch fit the viewport", async ({ page }) => {
  await signInThroughUI(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: "/tmp/eivon-desktop-overview.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Interface language" }).selectOption("zh-CN");
  await expect(page.getByRole("heading", { name: "总览", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/eivon-mobile-overview.png", fullPage: true });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  for (const name of ["智能体", "资源", "工作流", "对话台", "运行记录", "评测中心", "知识库", "成员", "设置"]) {
    await navigation.getByRole("button", { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(390);
  }
});
