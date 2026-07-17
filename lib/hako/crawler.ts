import * as cheerio from "cheerio";
import { withBrowserContext, HakoError } from "@/lib/hako/browserless";
import {
  guessContentType,
  resolveUrl,
} from "@/lib/hako/utils";
import type {
  ChapterImage,
  ChapterPayload,
  NovelData,
  PlaywrightStorageState,
  VolumeInfo,
} from "@/lib/types";

export async function fetchNovelInfo(
  url: string,
  storageState?: PlaywrightStorageState | null,
): Promise<NovelData> {
  if (!url?.trim()) throw new HakoError("URL truyện không hợp lệ.");

  return withBrowserContext(storageState, async ({ context }) => {
    const page = await context.newPage();
    await page.goto(url.trim(), { timeout: 60000 });
    await page.waitForSelector(".series-name, .volume-list", { timeout: 20000 });
    const htmlDoc = await page.content();
    const $ = cheerio.load(htmlDoc);

    const titleTag = $(".series-name a, .series-name").first();
    const novelTitle = titleTag.text().trim() || "Không rõ tên truyện";

    let author = "Không rõ";
    $(".info-item").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.includes("Tác giả")) {
        const value = $(el).find(".info-value").first().text().trim();
        author = value || text;
        return false;
      }
    });

    const genres =
      $(".series-gernes a, .series-genres a")
        .map((_, a) => $(a).text().trim())
        .get()
        .filter(Boolean)
        .join(", ") || "Không rõ";

    const summaryDiv = $(".summary-content").first();
    const summaryHtml = summaryDiv.length
      ? $.html(summaryDiv) || "<p>Không có tóm tắt.</p>"
      : "<p>Không có tóm tắt.</p>";

    const volumes: VolumeInfo[] = [];
    $("section.volume-list").each((volIndex, volSection) => {
      const volTitleTag = $(volSection).find(".sect-title").first();
      if (!volTitleTag.length) return;
      const volTitle = volTitleTag
        .text()
        .replace(/\*/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const chapters: { title: string; url: string }[] = [];
      $(volSection)
        .find(".list-chapters li .chapter-name a")
        .each((_, a) => {
          chapters.push({
            title: $(a).text().replace(/\s+/g, " ").trim(),
            url: resolveUrl(url, $(a).attr("href")),
          });
        });
      if (chapters.length) {
        volumes.push({
          id: volIndex,
          title: volTitle,
          chapter_count: chapters.length,
          chapters,
        });
      }
    });

    return {
      title: novelTitle,
      author,
      genres,
      summary: summaryHtml,
      volumes,
      source_url: url.trim(),
    };
  });
}

export async function fetchChapterContent(
  chapterUrl: string,
  chapterTitle: string,
  chapterIdx: number,
  storageState?: PlaywrightStorageState | null,
): Promise<ChapterPayload> {
  return withBrowserContext(storageState, async ({ context }) => {
    const page = await context.newPage();
    try {
      await page.goto(chapterUrl, { timeout: 60000 });
      await page.waitForSelector("#chapter-content", {
        state: "attached",
        timeout: 15000,
      });
      const rawHtml = await page.locator("#chapter-content").innerHTML();
      const $ = cheerio.load(rawHtml);

      $("#chapter-c-protected, p[style*='display: none']").remove();
      $("a[href*='/truyen/']").each((_, a) => {
        if ($(a).find("img[src*='chapter-banners'], img[src*='banners']").length) {
          $(a).remove();
        }
      });
      $("a[href*='discord.gg'], a[href*='facebook.com']").remove();
      $(".inline-note, .note-content").each((_, note) => {
        $(note).before(" [Chú thích: ");
        $(note).after("] ");
        $(note).removeAttr("style");
      });

      const images: ChapterImage[] = [];
      const imgEls = $("img").toArray();
      for (let i = 0; i < imgEls.length; i++) {
        const imgTag = imgEls[i];
        const rawImgUrl = $(imgTag).attr("src");
        if (!rawImgUrl) continue;
        const imgUrl = resolveUrl(chapterUrl, rawImgUrl);
        if (imgUrl.includes("icon") || imgUrl.includes("tracker")) {
          $(imgTag).remove();
          continue;
        }

        let imgExt = imgUrl.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
        if (imgExt.length > 5 || imgExt.includes("/")) imgExt = "jpg";
        const localName = `chap${chapterIdx}_img${i}.${imgExt}`;

        try {
          const resp = await fetch(imgUrl, {
            signal: AbortSignal.timeout(30000),
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Referer: chapterUrl,
            },
          });
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            images.push({
              name: localName,
              dataBase64: buf.toString("base64"),
              contentType: guessContentType(imgExt),
            });
            $(imgTag).attr("src", `images/${localName}`);
          } else {
            $(imgTag).remove();
          }
        } catch {
          $(imgTag).remove();
        }
      }

      let cleanContent = $.root().html() || "";
      cleanContent = cleanContent.replace(/<br>/gi, "<br/>").replace(/<hr>/gi, "<hr/>");
      cleanContent = cleanContent.replace(/<img([^>]*?)(?<!\/)>/gi, "<img$1/>");

      return {
        title: chapterTitle,
        html: cleanContent,
        images,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        title: chapterTitle,
        html: `<p>Chương này bị lỗi tải nội dung: ${message}</p>`,
        images: [],
      };
    }
  });
}
