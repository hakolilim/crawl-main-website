import { chromium, type Browser, type BrowserContext } from "playwright-core";
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

function getWsEndpoint(): string {
  const token = process.env.BROWSERLESS_TOKEN;
  const base =
    process.env.BROWSERLESS_WS_ENDPOINT || "wss://chrome.browserless.io";
  if (!token) {
    throw new HakoError("Thiếu BROWSERLESS_TOKEN trên server.");
  }
  const url = new URL(base);
  url.searchParams.set("token", token);
  // Keep sessions short-lived for serverless
  if (!url.searchParams.has("timeout")) {
    url.searchParams.set("timeout", "120000");
  }
  return url.toString();
}

export async function connectBrowser(): Promise<Browser> {
  const endpoint = getWsEndpoint();
  // Prefer CDP for browserless.io hosted chrome
  try {
    return await chromium.connectOverCDP(endpoint);
  } catch {
    return await chromium.connect(endpoint);
  }
}

export async function withBrowserContext<T>(
  storageState: PlaywrightStorageState | null | undefined,
  fn: (ctx: {
    browser: Browser;
    context: BrowserContext;
  }) => Promise<T>,
): Promise<T> {
  const browser = await connectBrowser();
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
