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

/**
 * Browserless expects `timeout` in **seconds** (1–60000), not milliseconds.
 * @see error: "Timeout must be an integer between 1 and 60,000 seconds"
 */
function resolveTimeoutSeconds(): string {
  const raw = process.env.BROWSERLESS_TIMEOUT || "60";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return "60";
  // Cap to Browserless max; also reject mistaken ms values (e.g. 120000)
  if (n > 60000) return "60";
  // If someone still puts ms-like values under 60000 but over a reasonable session
  // (e.g. 120000 was invalid; 30000 ms would be 30000s ~ 8h — allow as seconds per API)
  return String(n);
}

function getWsEndpoint(kind: "playwright" | "cdp"): string {
  const token = process.env.BROWSERLESS_TOKEN;
  const base =
    process.env.BROWSERLESS_WS_ENDPOINT || "wss://chrome.browserless.io";
  if (!token) {
    throw new HakoError("Thiếu BROWSERLESS_TOKEN trên server.");
  }

  const url = new URL(base);

  // Ensure path for Playwright protocol when using chromium.connect()
  if (kind === "playwright") {
    const path = url.pathname.replace(/\/$/, "") || "";
    if (!path.includes("playwright")) {
      // e.g. wss://chrome.browserless.io  →  /playwright
      // e.g. wss://production-sfo.browserless.io/chrome → /chrome/playwright
      url.pathname = path ? `${path}/playwright` : "/playwright";
    }
  }

  url.searchParams.set("token", token);

  // Browserless: timeout is in seconds (not ms)
  const timeoutSec = resolveTimeoutSeconds();
  url.searchParams.set("timeout", timeoutSec);

  return url.toString();
}

export async function connectBrowser(): Promise<Browser> {
  // Prefer Playwright websocket endpoint, then CDP fallback
  const playwrightEndpoint = getWsEndpoint("playwright");
  try {
    return await chromium.connect(playwrightEndpoint);
  } catch (playwrightErr) {
    const cdpEndpoint = getWsEndpoint("cdp");
    try {
      return await chromium.connectOverCDP(cdpEndpoint);
    } catch (cdpErr) {
      const pMsg =
        playwrightErr instanceof Error
          ? playwrightErr.message
          : String(playwrightErr);
      const cMsg = cdpErr instanceof Error ? cdpErr.message : String(cdpErr);
      throw new HakoError(
        `Không kết nối được Browserless.\nPlaywright: ${pMsg}\nCDP: ${cMsg}`,
      );
    }
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
