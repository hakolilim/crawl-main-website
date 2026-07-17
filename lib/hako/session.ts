import * as cheerio from "cheerio";
import {
  AuthenticationError,
  withBrowserContext,
} from "@/lib/hako/browserless";
import { LOGIN_URL } from "@/lib/hako/utils";
import type { PlaywrightStorageState } from "@/lib/types";

async function readUserLabel(page: {
  locator: (sel: string) => {
    first: () => {
      count: () => Promise<number>;
      isVisible: () => Promise<boolean>;
      textContent: () => Promise<string | null>;
    };
  };
}): Promise<string> {
  const selectors = [
    ".header-user-name",
    ".dropdown-user strong",
    ".user-name",
    'a[href*="/thanh-vien/"]',
    'a[href*="/member/"]',
  ];
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) && (await locator.isVisible())) {
        const text = ((await locator.textContent()) || "").trim();
        if (text) return text;
      }
    } catch {
      // continue
    }
  }
  return "Đăng nhập thành công";
}

export async function loginHako(
  username: string,
  password: string,
): Promise<{ userLabel: string; storageState: PlaywrightStorageState }> {
  return withBrowserContext(null, async ({ context }) => {
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const emailInput = page
      .locator(
        'input[placeholder*="Email"], input[type="email"], input[type="text"]',
      )
      .first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page
      .locator(
        'button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Dang nhap")',
      )
      .first();

    await emailInput.fill(username);
    await passwordInput.fill(password);
    await submitButton.click();
    await page.waitForTimeout(2500);
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const currentUrl = page.url().toLowerCase();
    const content = await page.content();
    if (currentUrl.includes("login")) {
      const $ = cheerio.load(content);
      const alert = $(
        '.alert, .error, .validation-summary-errors, [class*="danger"]',
      )
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      throw new AuthenticationError(
        alert ||
          "Không thể đăng nhập. Hãy kiểm tra tài khoản hoặc captcha/anti-bot.",
      );
    }

    const label = (await readUserLabel(page)) || username;
    const storageState = (await context.storageState()) as PlaywrightStorageState;
    return { userLabel: label, storageState };
  });
}
