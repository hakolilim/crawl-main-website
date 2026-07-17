import * as cheerio from "cheerio";

export const BASE_URL = "https://docln.sbs";
export const LOGIN_URL = `${BASE_URL}/login`;

export const STYLE_CSS = `
@page { margin: 5pt; }
body {
    font-family: "Times New Roman", serif;
    line-height: 1.6;
    text-align: justify;
    margin: 10px;
}
h1 { text-align: center; color: #2c3e50; margin-top: 50px; }
.chapter-header {
    font-size: 20px;
    text-align: center;
    color: #fff;
    padding-bottom: 10px;
    margin-bottom: 30px;
}
h3 { text-align: center; color: #7f8c8d; }
p { margin: 0; text-indent: 1.5em; margin-bottom: 0.5em; }
img {
    display: block;
    margin: 20px auto;
    max-width: 100%;
    height: auto;
    border-radius: 5px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}
.intro-box { text-align: center; }
.info-list { text-align: left; margin: 20px 0; border-left: 3px solid #34495e; padding-left: 15px; }
.summary-box { text-align: left; font-style: italic; background: #f9f9f9; color: #000; padding: 15px; border-radius: 8px; }
`;

export function resolveUrl(baseUrl: string, relativeUrl: string | undefined | null): string {
  if (!relativeUrl) return "";
  if (relativeUrl.startsWith("http")) return relativeUrl;
  if (relativeUrl.startsWith("//")) return `https:${relativeUrl}`;
  try {
    const parsed = new URL(baseUrl);
    const domain = `${parsed.protocol}//${parsed.host}`;
    if (relativeUrl.startsWith("/")) return domain + relativeUrl;
    return `${domain}/${relativeUrl}`;
  } catch {
    return relativeUrl;
  }
}

export function formatFilename(name: string): string {
  let result = name;
  for (const c of ["\\", "/", ":", "*", "?", '"', "<", ">", "|"]) {
    result = result.split(c).join("");
  }
  result = result.trim().slice(0, 180);
  return result || "untitled";
}

/**
 * Storage object keys must be URL-safe. Supabase rejects many Unicode
 * filenames with "Invalid key" (e.g. Vietnamese titles with spaces).
 * Keep a readable ASCII slug + original extension.
 */
export function storageSafeFilename(name: string, fallback = "file"): string {
  const trimmed = (name || "").trim();
  const lastDot = trimmed.lastIndexOf(".");
  const ext =
    lastDot > 0 && lastDot < trimmed.length - 1
      ? trimmed
          .slice(lastDot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 12)
      : "";
  const base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;

  // NFD then strip combining marks → approximate ASCII for Vietnamese
  let ascii = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

  ascii = ascii
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);

  if (!ascii) ascii = fallback;
  return ext ? `${ascii}.${ext}` : ascii;
}


export function summaryToText(summaryHtml: string): string {
  const $ = cheerio.load(summaryHtml || "");
  const text = $.text().replace(/\s+\n/g, "\n").trim();
  return text || "Không có tóm tắt.";
}

export function htmlToPlainText(contentHtml: string): string {
  const $ = cheerio.load(contentHtml);
  const lines: string[] = [];
  $("p, img").each((_, el) => {
    if (el.type !== "tag") return;
    if (el.tagName === "p") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
    } else if (el.tagName === "img") {
      const src = ($(el).attr("src") || "").split("/").pop();
      if (src) lines.push(`[Hình ảnh: ${src}]`);
    }
  });
  return lines.join("\n\n").trim();
}

export function htmlFragmentToXhtml(contentHtml: string): string {
  const $ = cheerio.load(`<div id="__frag">${contentHtml || ""}</div>`);
  const root = $("#__frag");
  root.find("img").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (src.startsWith("images/")) {
      $(el).attr("src", `../${src}`);
    }
    if (!$(el).attr("alt")) {
      $(el).attr("alt", src.split("/").pop() || "image");
    }
  });
  return root.html()?.trim() || "<p></p>";
}


export function escapeXml(text: string): string {
  const amp = String.fromCharCode(38) + "amp;";
  const lt = String.fromCharCode(38) + "lt;";
  const gt = String.fromCharCode(38) + "gt;";
  const quot = String.fromCharCode(38) + "quot;";
  const apos = String.fromCharCode(38) + "apos;";
  return text
    .split("&")
    .join(amp)
    .split("<")
    .join(lt)
    .split(">")
    .join(gt)
    .split('"')
    .join(quot)
    .split("'")
    .join(apos);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(minMs = 700, maxMs = 1500): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export function guessContentType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return map[ext.toLowerCase()] || "image/jpeg";
}
