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
// Sửa lại hàm resolveTimeoutSeconds để an toàn hơn
function resolveTimeoutSeconds(): string {
  const raw = process.env.BROWSERLESS_TIMEOUT || "60";
  const n = Number.parseInt(raw, 10);
  
  // Nếu sai số hoặc truyền nhầm dạng mili-giây (ví dụ > 60000 hoặc > 300) 
  // thì nên đưa về giá trị an toàn (ví dụ gói free/hobby thường giới hạn từ 1-300 giây)
  if (!Number.isFinite(n) || n < 1 || n > 300) { 
    return "60"; 
  }
  return String(n);
}

function getWsEndpoint(): string {
  const token = process.env.BROWSERLESS_TOKEN;
  const base = process.env.BROWSERLESS_WS_ENDPOINT || "wss://chrome.browserless.io";
  
  if (!token) {
    throw new HakoError("Thiếu BROWSERLESS_TOKEN trên server.");
  }

  const url = new URL(base);

  // BỎ HOÀN TOÀN đoạn tự động thêm '/playwright' 
  // Browserless sử dụng chung một endpoint gốc cho cả Playwright và CDP
  
  url.searchParams.set("token", token);

  // Thêm tham số timeout tính bằng giây
  const timeoutSec = resolveTimeoutSeconds();
  url.searchParams.set("timeout", timeoutSec);

  return url.toString();
}

export async function connectBrowser(): Promise<Browser> {
  const endpoint = getWsEndpoint();
  try {
    // Thử kết nối bằng phương thức gốc của Playwright trước
    return await chromium.connect(endpoint);
  } catch (playwrightErr) {
    try {
      // Nếu thất bại, fallback sang kết nối qua giao thức CDP
      return await chromium.connectOverCDP(endpoint);
    } catch (cdpErr) {
      const pMsg = playwrightErr instanceof Error ? playwrightErr.message : String(playwrightErr);
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
