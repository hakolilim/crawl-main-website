import type { ChapterPayload, NovelData, VolumeInfo } from "@/lib/types";
import { formatFilename, htmlToPlainText, summaryToText } from "@/lib/hako/utils";

export function exportVolumeTxt(
  volume: VolumeInfo,
  novel: NovelData,
  chapters: ChapterPayload[],
): { filename: string; blob: Blob } {
  const lines = [
    novel.title,
    volume.title,
    `Tác giả: ${novel.author}`,
    `Thể loại: ${novel.genres}`,
    "",
    "Tóm tắt:",
    summaryToText(novel.summary),
    "",
    "=".repeat(80),
    "",
  ];

  for (const chap of chapters) {
    lines.push(
      chap.title,
      "-".repeat(Math.max(20, chap.title.length)),
      htmlToPlainText(chap.html),
      "",
      "",
    );
  }

  const content = lines.join("\n").trim() + "\n";
  const filename =
    formatFilename(`${novel.title} - ${volume.title}`) + ".txt";
  return {
    filename,
    blob: new Blob([content], { type: "text/plain;charset=utf-8" }),
  };
}
