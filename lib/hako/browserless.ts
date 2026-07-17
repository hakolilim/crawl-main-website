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

/** Trim, strip wrapping quotes, reject empty. */
function normalizeBaseEndpoint(raw: string | undefined): string {

  const fallback = "wss://production-sfo.browserless.io";
  if (!raw) return fallback;

  let value = raw.trim();
  // Common .env mistakes: BROWSERLESS_WS_ENDPOINT="wss://..."
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  if (!value) return fallback;

  // Allow pasting host without scheme
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = `wss://${value.replace(/^\/+/, "")}`;
  }

  try {
    // Validate early so UI gets a clear error instead of "Invalid URL"
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    throw new HakoError(
      `BROWSERLESS_WS_ENDPOINT không hợp lệ: "${raw}". Ví dụ: wss://production-sfo.browserless.io`,
    );
  }

  return value;
}

/**
 * Build Browserless WS URL.
 *
 * Current Browserless BaaS docs:
 * - Playwright Chromium:  wss://production-sfo.browserless.io/chromium/playwright?token=...
 * - CDP / Chrome:         wss://production-sfo.browserless.io/chrome?token=...
 *                         or wss://production-sfo.browserless.io?token=...
 *
 * Legacy chrome.browserless.io and bare /playwright are deprecated (404/408).
 */
function getWsEndpoint(kind: "playwright" | "cdp"): string {
  const token = process.env.BROWSERLESS_TOKEN?.trim();
  if (!token) {
    throw new HakoError("Thiếu BROWSERLESS_TOKEN trên server.");
  }

  const base = normalizeBaseEndpoint(process.env.BROWSERLESS_WS_ENDPOINT);
  const url = new URL(base);
  let path = url.pathname.replace(/\/$/, "") || "";

  // Map known legacy / mistaken paths onto current Browserless routes
  if (path === "/playwright") {
    path = "/chromium/playwright";
  } else if (path === "/chrome/playwright") {
    // Wrong combo users sometimes set; Playwright uses /chromium/playwright
    path = "/chromium/playwright";
  }

  if (kind === "playwright") {
    if (!path.includes("playwright")) {
      if (!path || path === "/" || path === "/chrome") {
        path = "/chromium/playwright";
      } else {
        path = `${path}/playwright`;
      }
    }
  } else {
    // CDP: never use a playwright path
    if (path.includes("playwright")) {
      path = path
        .replace(/\/chromium\/playwright$/i, "/chrome")
        .replace(/\/chrome\/playwright$/i, "/chrome")
        .replace(/\/playwright$/i, "")
        .replace(/\/firefox\/playwright$/i, "/firefox")
        .replace(/\/webkit\/playwright$/i, "/webkit");
      if (!path) path = "/chrome";
    } else if (!path || path === "/") {
      // Root works for CDP on regional hosts; /chrome is explicit
      path = "/chrome";
    }
  }

  url.pathname = path || "/";
  url.searchParams.set("token", token);

  // NOTE: Do NOT append `timeout=` on Playwright/CDP WS URLs.
  // Empirically (Browserless BaaS 2026): `?timeout=60` / `?timeout=240` causes
  // WebSocket **408 Request Timeout** on connect, while the same URL without
  // timeout connects successfully. Session length is controlled by the plan.

  return url.toString();
}


function maskToken(endpoint: string): string {
  return endpoint.replace(/token=[^&]+/i, "token=***");
}

/** Strip Playwright call-log noise so UI shows a readable error. */
function shortError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const firstLine = raw.split("\n")[0]?.trim() || raw;
  return firstLine
    .replace(/Call log:[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export async function connectBrowser(): Promise<Browser> {
  const playwrightEndpoint = getWsEndpoint("playwright");
  try {
    return await chromium.connect(playwrightEndpoint);
  } catch (playwrightErr) {
    const cdpEndpoint = getWsEndpoint("cdp");
    try {
      return await chromium.connectOverCDP(cdpEndpoint);
    } catch (cdpErr) {
      throw new HakoError(
        [
          "Không kết nối được Browserless.",
          `Playwright (${maskToken(playwrightEndpoint)}): ${shortError(playwrightErr)}`,
          `CDP (${maskToken(cdpEndpoint)}): ${shortError(cdpErr)}`,
          "Dùng endpoint dạng wss://production-sfo.browserless.io (code tự thêm /chromium/playwright).",
          "Kiểm tra BROWSERLESS_TOKEN, region, và concurrent sessions trên dashboard Browserless.",
        ].join(" "),
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
  let createdContext = false;
  try {
    // CDP sessions often already have a default context; reusing it is more reliable.
    let context = browser.contexts()[0];
    if (!context) {
      context = await browser.newContext({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        storageState: (storageState as any) || undefined,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        locale: "vi-VN",
        viewport: { width: 1280, height: 800 },
      });
      createdContext = true;
    } else if (storageState) {
      // Default CDP context cannot take storageState at creation; inject cookies if present.
      const cookies = Array.isArray(storageState.cookies)
        ? storageState.cookies
        : [];
      if (cookies.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await context.addCookies(cookies as any).catch(() => undefined);
      }
    }

    try {
      return await fn({ browser, context });
    } finally {
      if (createdContext) {
        await context.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}
