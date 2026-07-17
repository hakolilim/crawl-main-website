import { chromium, type Browser, type BrowserContext } from "playwright";
import type { PlaywrightStorageState } from "@/lib/types";

export class HakoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HakoError";
  }
}

export class AuthenticationError extends HakoError {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

function shortError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const firstLine = raw.split("\n")[0]?.trim() || raw;
  return firstLine
    .replace(/Call log:[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function resolveHeadless(): boolean {
  const raw = process.env.PLAYWRIGHT_HEADLESS?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return true;
}

export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({
      headless: resolveHeadless(),
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch (err) {
    throw new HakoError(
      [
        "Không khởi động được Chromium (Playwright local).",
        shortError(err),
        "Chạy: npx playwright install chromium",
      ].join(" "),
    );
  }
}

export async function withBrowserContext<T>(
  storageState: PlaywrightStorageState | null | undefined,
  fn: (ctx: {
    browser: Browser;
    context: BrowserContext;
  }) => Promise<T>,
): Promise<T> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storageState: (storageState as any) || undefined,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "vi-VN",
      viewport: { width: 1280, height: 800 },
    });

    try {
      return await fn({ browser, context });
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}
