import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  PageBreak,
  TextRun,
} from "docx";
import type { ChapterPayload, NovelData, VolumeInfo } from "@/lib/types";
import { formatFilename, summaryToText } from "@/lib/hako/utils";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseHtmlToParagraphs(
  html: string,
  imageMap: Map<string, ChapterPayload["images"][number]>,
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return paragraphs;

  root.querySelectorAll("p, img").forEach((el) => {
    if (el.tagName.toLowerCase() === "p") {
      const text = (el.textContent || "").trim();
      if (text) {
        paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
      }
    } else if (el.tagName.toLowerCase() === "img") {
      const src = el.getAttribute("src") || "";
      const name = src.split("/").pop() || "";
      const img = imageMap.get(name);
      if (img) {
        try {
          const bytes = base64ToUint8Array(img.dataBase64);
          const isPng = img.contentType.includes("png");
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: bytes,
                  transformation: { width: 480, height: 640 },
                  type: isPng ? "png" : "jpg",
                }),
              ],
            }),
          );
        } catch {
          // skip broken image
        }
      }
    }
  });
  return paragraphs;
}

export async function exportVolumeDocx(
  volume: VolumeInfo,
  novel: NovelData,
  chapters: ChapterPayload[],
): Promise<{ filename: string; blob: Blob }> {
  const children: Paragraph[] = [
    new Paragraph({
      text: novel.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: volume.title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ children: [new TextRun(`Tác giả: ${novel.author}`)] }),
    new Paragraph({ children: [new TextRun(`Thể loại: ${novel.genres}`)] }),
    new Paragraph({
      children: [new TextRun(`Tóm tắt: ${summaryToText(novel.summary)}`)],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  for (const chap of chapters) {
    const imageMap = new Map(chap.images.map((img) => [img.name, img]));
    children.push(
      new Paragraph({
        text: chap.title,
        heading: HeadingLevel.HEADING_2,
      }),
      ...parseHtmlToParagraphs(chap.html, imageMap),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const filename =
    formatFilename(`${novel.title} - ${volume.title}`) + ".docx";
  return { filename, blob };
}
